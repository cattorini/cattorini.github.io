/**
 * Checkout de punta a punta contra el EMULADOR de Firestore + reglas.
 * Corre el código REAL de tienda-core.js (el mismo que usan tienda.html y
 * producto.html) con el SDK compat que devuelve @firebase/rules-unit-testing.
 * Correr con: npm run test:checkout-emulador
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

/* tienda-core.js en el MISMO realm (si se usa vm.createContext, los objetos
   salen con otro Object.prototype y el SDK los rechaza como "custom Object") */
globalThis.window = globalThis.window || {};
vm.runInThisContext(readFileSync(resolve(root, 'tienda-core.js'), 'utf8'));
const Core = globalThis.window.CattCore;
const FieldValue = firebase.firestore.FieldValue;

const TALLES = ['38', '40', '42', '44', '46', '48', '50', '52', '54'];
const COLORES = { Blanco: '#ffffff', Celeste: '#a0c4ff' };

function stockInicial(cant = 20) {
  const v = {};
  for (const t of TALLES) { v[t] = {}; for (const [c, hex] of Object.entries(COLORES)) v[t][c] = { cantidad: cant, hex }; }
  return { variantes: v };
}

/* n combinaciones talle/color del producto 7 (orden: talle, después color) */
function cartGrande(n, qty = 3) {
  const out = [];
  for (const t of TALLES) for (const c of Object.keys(COLORES)) {
    if (out.length >= n) break;
    out.push({ key: `7__${t}__${c}`, id: 7, nombre: 'Jeans Cattos', categoria: 'Jeans', talle: t, color: c, qty, precio: 15000 });
  }
  return out;
}

function payloadPara(codigo, cart, extra = {}) {
  const subtotal = cart.reduce((s, i) => s + i.precio * i.qty, 0);
  return {
    codigo,
    creadoEn: FieldValue.serverTimestamp(),
    cliente: {
      nombre: 'Mayorista Emulador', negocio: 'Comercio Test', whatsapp: '5490000000000', email: '', cuit: '',
      direccion: '', provincia: '', localidad: '', codigoPostal: '', perfil: 'mayorista', zonaStatus: 'ok', localidadPerfil: ''
    },
    items: cart.map(i => ({ id: i.id, nombre: i.nombre, categoria: i.categoria, talle: i.talle, color: i.color || null, qty: i.qty, precio: i.precio })),
    modalidad: 'retiro', pagaEnLocal: true,
    subtotal, envio: 0, total: subtotal, nota: '', estado: 'pendiente',
    ...extra
  };
}

let env;
let db;

async function leer(path) {
  let data;
  await env.withSecurityRulesDisabled(async (c) => {
    const s = await c.firestore().doc(path).get();
    data = s.exists ? s.data() : undefined;
  });
  return data;
}
async function contarMovimientos(id) {
  let n = 0;
  await env.withSecurityRulesDisabled(async (c) => { n = (await c.firestore().collection(`stock/${id}/movimientos`).get()).size; });
  return n;
}

describe('Checkout atómico (tienda-core.js) contra emulador + reglas', () => {
  before(async () => {
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8091').split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-cattorini-checkout',
      firestore: { rules: readFileSync(process.env.CATT_RULES_PATH, 'utf8'), host, port: Number(port) }
    });
  });
  after(async () => { if (env) await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (c) => {
      await c.firestore().doc('stock/7').set(stockInicial());
      await c.firestore().doc('stock/1').set({ variantes: { M: { Blanco: { cantidad: 3, hex: '#ffffff' } } } });
    });
    db = env.unauthenticatedContext().firestore();
  });

  test(`el tope del cliente es ${Core.MAX_VARIANTES_POR_PRODUCTO} combinaciones por producto`, () => {
    assert.equal(Core.MAX_VARIANTES_POR_PRODUCTO, 12);
  });

  test('pedido mayorista de 12 combinaciones talle/color pasa de punta a punta', async () => {
    const cart = cartGrande(12);
    const codigo = Core.genCodigo();
    const r = await Core.crearPedidoAtomico(db, FieldValue, codigo, payloadPara(codigo, cart), cart);
    assert.equal(r.yaExistia, false);
    const pedido = await leer('pedidos/' + codigo);
    assert.ok(pedido, 'no se creó el pedido');
    assert.equal(pedido.codigo, codigo);
    assert.equal(pedido.items.length, 12);
    const st = (await leer('stock/7')).variantes;
    for (const i of cart) assert.equal(st[i.talle][i.color].cantidad, 17, `${i.talle}/${i.color}`);
    assert.equal(st['54'].Blanco.cantidad, 20, 'tocó una variante que no estaba en el pedido');
    assert.equal(st['38'].Blanco.hex, '#ffffff');
    assert.equal(await contarMovimientos('7'), 12);
  });

  for (let n = 1; n <= 12; n++) {
    test(`checkout con ${n} combinaciones de un mismo producto pasa las reglas`, async () => {
      const cart = cartGrande(n, 1);
      const codigo = Core.genCodigo();
      await Core.crearPedidoAtomico(db, FieldValue, codigo, payloadPara(codigo, cart), cart);
      assert.ok(await leer('pedidos/' + codigo));
    });
  }

  test('pedido de 9 talles × 2 colores (18) NO se envía online: pide WhatsApp y no escribe nada', async () => {
    const cart = cartGrande(18);
    const codigo = Core.genCodigo();
    await assert.rejects(
      Core.crearPedidoAtomico(db, FieldValue, codigo, payloadPara(codigo, cart), cart),
      (e) => e.requiereWhatsApp === true && /WhatsApp/.test(e.message) && /12/.test(e.message));
    assert.equal(await leer('pedidos/' + codigo), undefined);
    assert.equal((await leer('stock/7')).variantes['38'].Blanco.cantidad, 20);
    const texto = Core.textoPedidoWhatsApp(cart, { perfil: 'mayorista', nombre: 'X', entrega: 'retiro' });
    assert.equal((texto.match(/^• /gm) || []).length, 18, 'el mensaje de WhatsApp no tiene el pedido completo');
  });

  test('las reglas rechazan 13 combinaciones aunque se saltee el chequeo del cliente', async () => {
    const cart = cartGrande(13);
    const codigo = Core.genCodigo();
    const st = stockInicial().variantes;
    const descuento = cart.map(i => ({ talle: i.talle, color: i.color }));
    for (const i of cart) st[i.talle][i.color].cantidad -= i.qty;
    await assertFails(db.runTransaction(async (tx) => {
      tx.set(db.doc('pedidos/' + codigo), payloadPara(codigo, cart));
      tx.update(db.doc('stock/7'), { variantes: st, actualizadoEn: FieldValue.serverTimestamp(), ultimoPedido: codigo, descuento });
    }));
    assert.equal(await leer('pedidos/' + codigo), undefined);
  });

  test('reintentar con el MISMO código no crea un segundo pedido ni descuenta dos veces', async () => {
    const cart = cartGrande(4);
    const codigo = Core.genCodigo();
    await Core.crearPedidoAtomico(db, FieldValue, codigo, payloadPara(codigo, cart), cart);
    const r2 = await Core.crearPedidoAtomico(db, FieldValue, codigo, payloadPara(codigo, cart), cart);
    assert.equal(r2.yaExistia, true);
    assert.equal((await leer('stock/7')).variantes['38'].Blanco.cantidad, 17);
    assert.equal(await contarMovimientos('7'), 4);
  });

  test('sin stock suficiente: error claro y no queda nada a medias', async () => {
    const cart = [...cartGrande(2), { key: '1__M__Blanco', id: 1, nombre: 'Camisa', categoria: 'Camisas', talle: 'M', color: 'Blanco', qty: 5, precio: 22000 }];
    const codigo = Core.genCodigo();
    await assert.rejects(Core.crearPedidoAtomico(db, FieldValue, codigo, payloadPara(codigo, cart), cart), /Sin stock suficiente/);
    assert.equal(await leer('pedidos/' + codigo), undefined);
    assert.equal((await leer('stock/7')).variantes['38'].Blanco.cantidad, 20);
    assert.equal((await leer('stock/1')).variantes.M.Blanco.cantidad, 3);
  });

  test('pedido con dos productos + un ítem sin color (catálogo sin stock cargado)', async () => {
    const cart = [...cartGrande(3),
      { key: '1__M__Blanco', id: 1, nombre: 'Camisa', categoria: 'Camisas', talle: 'M', color: 'Blanco', qty: 1, precio: 22000 },
      { key: '2__M__', id: 2, nombre: 'Pantalón', categoria: 'Pantalones', talle: 'M', color: null, qty: 1, precio: 30000 }];
    const codigo = Core.genCodigo();
    await Core.crearPedidoAtomico(db, FieldValue, codigo, payloadPara(codigo, cart, { cliente: { ...payloadPara(codigo, cart).cliente, perfil: 'minorista' } }), cart);
    assert.ok(await leer('pedidos/' + codigo));
    assert.equal((await leer('stock/1')).variantes.M.Blanco.cantidad, 2);
    assert.equal(await contarMovimientos('1'), 1);
    assert.equal(await contarMovimientos('7'), 3);
  });
});
