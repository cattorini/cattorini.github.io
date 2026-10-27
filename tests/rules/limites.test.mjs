/**
 * LÍMITES de las reglas de stock contra el EMULADOR (que aplica el tope de
 * 1000 expresiones evaluadas por documento).
 *
 * Solo corre si las reglas bajo test declaran `MAX_DESCUENTO = N` (lo escribe
 * rules/generar-stock-rules.mjs en firestore.rules). La referencia
 * rules/reference/firestore.rules.objetivo no lo declara → se saltea.
 *
 * Verifica:
 *  - una transacción de checkout con N variantes de UN producto (peor caso
 *    de forma: 1 talle × N colores, N talles × 1 color, mezcla) + un
 *    movimiento por variante pasa;
 *  - N + 1 variantes se rechaza (el tope es real, no un error de límite
 *    disfrazado: el rechazo viene de la regla `L.size() <= N`);
 *  - un pedido mayorista grande (8 productos × N variantes = 8N renglones,
 *    con sus movimientos) pasa: el presupuesto es por documento;
 *  - con N variantes declaradas, subir una variante NO declarada, declarar
 *    repetidas o tocar otro talle se rechaza (la validación completa sigue
 *    activa en el tamaño máximo);
 *  - el staff ajusta stock sin tope.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const rules = readFileSync(process.env.CATT_RULES_PATH, 'utf8');
const m = rules.match(/MAX_DESCUENTO = (\d+)/);
const MAX = m ? Number(m[1]) : 0;
const STAFF_EMAIL = 'staff@cattorini.test';
const ts = () => firebase.firestore.FieldValue.serverTimestamp();

let env, publico, staff;
let seq = 0;
/* Códigos de 10 caracteres del alfabeto sin ambiguos */
const ALF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function codigo() {
  let n = ++seq, s = '';
  for (let i = 0; i < 10; i++) { s = ALF[n % ALF.length] + s; n = Math.floor(n / ALF.length); }
  return s;
}

function pedido(cod, items) {
  return {
    codigo: cod, creadoEn: ts(),
    cliente: { nombre: 'Mayorista Test', perfil: 'mayorista' },
    items, modalidad: 'envio', subtotal: 1000, envio: 0, total: 1000, nota: '', estado: 'pendiente'
  };
}

/** variantes: nT talles × nC colores, cantidad 50 */
function stockInicial(nT, nC) {
  const v = {};
  for (let t = 0; t < nT; t++) {
    v['T' + t] = {};
    for (let c = 0; c < nC; c++) v['T' + t]['Color ' + c] = { cantidad: 50, hex: '#123456' };
  }
  return v;
}
function pares(nT, nC, k) {
  const out = [];
  for (let c = 0; c < nC; c++) for (let t = 0; t < nT; t++) out.push({ talle: 'T' + t, color: 'Color ' + c });
  return out.slice(0, k);
}

/** Transacción de checkout como la de tienda-core.js: pedido + stock + movimientos */
function checkout(db, cod, productos, { tocar } = {}) {
  return db.runTransaction(async (tx) => {
    const snaps = await Promise.all(productos.map(p => tx.get(db.doc('stock/' + p.id))));
    const items = [];
    productos.forEach((p, idx) => {
      const v = snaps[idx].data().variantes;
      p.descuento.forEach(e => { v[e.talle][e.color].cantidad -= 1; items.push({ id: p.id, talle: e.talle, color: e.color, qty: 1, precio: 10 }); });
      if (tocar) tocar(v);
      tx.update(db.doc('stock/' + p.id), { variantes: v, actualizadoEn: ts(), ultimoPedido: cod, descuento: p.declarar || p.descuento });
      p.descuento.forEach(e => tx.set(db.collection('stock/' + p.id + '/movimientos').doc(), {
        talle: e.talle, color: e.color, delta: -1, cantidadResultante: 49,
        motivo: 'Venta #' + cod, fecha: '2026-10-26', ts: ts()
      }));
    });
    tx.set(db.doc('pedidos/' + cod), pedido(cod, items.length ? items : [{ id: 0 }]));
  });
}

async function seedStock(id, variantes) {
  await env.withSecurityRulesDisabled(async (ctx) => { await ctx.firestore().doc('stock/' + id).set({ variantes }); });
}

describe('límites de las reglas de stock (MAX_DESCUENTO)', { skip: !MAX && 'las reglas no declaran MAX_DESCUENTO' }, () => {
  before(async () => {
    env = await initializeTestEnvironment({ projectId: 'demo-cattorini', firestore: { rules } });
    publico = env.unauthenticatedContext().firestore();
    staff = env.authenticatedContext('staff-uid', {
      email: STAFF_EMAIL, email_verified: true,
      firebase: { sign_in_provider: 'password', identities: { email: [STAFF_EMAIL] } }
    }).firestore();
  });
  after(async () => { if (env) await env.cleanup(); });
  beforeEach(async () => { await env.clearFirestore(); });

  test(`MAX_DESCUENTO declarado en las reglas = ${MAX}`, () => {
    assert(MAX >= 1);
  });

  for (const [nombre, nT, nC] of [['1 talle × N colores', 1, 40], ['N talles × 1 color', 40, 1], ['talles × 2 colores', 20, 2]]) {
    test(`checkout con ${MAX} variantes de un producto (${nombre}) + movimientos pasa`, async () => {
      await seedStock(1, stockInicial(nT, nC));
      await assertSucceeds(checkout(publico, codigo(), [{ id: 1, descuento: pares(nT, nC, MAX) }]));
    });
  }

  test(`checkout con ${MAX + 1} variantes de un mismo producto se rechaza`, async () => {
    await seedStock(1, stockInicial(20, 2));
    await assertFails(checkout(publico, codigo(), [{ id: 1, descuento: pares(20, 2, MAX + 1) }]));
  });

  test(`pedido mayorista grande: 8 productos × ${MAX} variantes (+ movimientos) pasa`, async () => {
    const prods = [];
    for (let id = 1; id <= 8; id++) { await seedStock(id, stockInicial(9, 2)); prods.push({ id, descuento: pares(9, 2, MAX) }); }
    await assertSucceeds(checkout(publico, codigo(), prods));
  });

  test(`con ${MAX} variantes declaradas, subir una variante NO declarada se rechaza`, async () => {
    await seedStock(1, stockInicial(20, 2));
    const decl = pares(20, 2, MAX);
    /* T0/Color 1 no está entre las declaradas (pares() recorre primero el color 0) */
    await assertFails(checkout(publico, codigo(), [{ id: 1, descuento: decl }], {
      tocar: v => { v.T0['Color 1'].cantidad = 999; }
    }));
  });

  test(`con ${MAX} variantes declaradas, una repetida (para colar otro cambio) se rechaza`, async () => {
    await seedStock(1, stockInicial(20, 2));
    const decl = pares(20, 2, MAX - 1);
    const p = { id: 1, descuento: decl, declarar: [...decl, decl[0]] };
    await assertFails(checkout(publico, codigo(), [p], { tocar: v => { v.T0['Color 1'].cantidad = 999; } }));
  });

  test(`con ${MAX} variantes declaradas, tocar un talle no declarado se rechaza`, async () => {
    await seedStock(1, stockInicial(30, 1));
    await assertFails(checkout(publico, codigo(), [{ id: 1, descuento: pares(30, 1, MAX) }], {
      tocar: v => { v.T29['Color 0'].cantidad = 999; }
    }));
  });

  test('el staff ajusta stock sin tope (40 variantes en una escritura)', async () => {
    await seedStock(1, stockInicial(20, 2));
    const v = stockInicial(20, 2);
    Object.values(v).forEach(cs => Object.values(cs).forEach(x => { x.cantidad = 7; }));
    await assertSucceeds(staff.doc('stock/1').set({ variantes: v, actualizadoEn: ts() }));
  });
});

function assert(c) { if (!c) throw new Error('assert'); }
