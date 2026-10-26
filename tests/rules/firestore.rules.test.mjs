/**
 * Tests de reglas de Firestore — MODELO DE SEGURIDAD OBJETIVO de Cattorini.
 *
 * Estos tests describen cómo TIENEN que comportarse las reglas. Contra las
 * reglas actuales (FIRESTORE-RULES.md) muchos FALLAN a propósito: cada fallo
 * es un agujero confirmado. Cuando se publiquen reglas nuevas, tienen que
 * pasar TODOS.
 *
 * Correr con `npm run test:rules` (ver rules/run.mjs). Solo emulador local,
 * projectId "demo-cattorini" (offline, sin credenciales).
 *
 * ── Modelo objetivo ────────────────────────────────────────────────────────
 * Staff = usuario de Firebase Auth con email/contraseña cuyo email está en
 * una allowlist (isStaff()):
 *   request.auth.token.firebase.sign_in_provider == 'password'
 *   && request.auth.token.email in [ ...emails del staff... ]
 * El login anónimo NO da ningún privilegio.
 *
 * pedidos/{codigo}
 *   - create público validado: ID del doc == campo `codigo`, código largo
 *     (>=10 caracteres [A-Z0-9]), estado 'pendiente', creadoEn == hora del
 *     servidor, sin campos extra, total == subtotal + envio.
 *   - get público (el código ES la llave: seguimiento hace doc(codigo).get()).
 *   - list / update / delete: solo staff.
 *
 * solicitudes_mayoristas/{codigo}
 *   - mismo esquema: create público validado con ID == codigo
 *     ('MAY-' + >=10 caracteres), get público, list/update/delete solo staff.
 *
 * mayoristas_activos/{sha256(codigo)}
 *   - get público (la tienda valida el código por hash), todo lo demás staff.
 *
 * stock/{productId}
 *   - lectura pública.
 *   - escritura pública SOLO como descuento coherente con un pedido creado en
 *     la MISMA escritura atómica (batch/transacción): el doc lleva
 *     `ultimoPedido` = código del pedido; el pedido no existía antes y existe
 *     después (exists / existsAfter). Solo pueden BAJAR cantidades de
 *     variantes (talle/color) que ya existían; no se agregan/borran talles ni
 *     colores, no cambia el hex, nunca queda negativo.
 *   - LÍMITE de lo expresable en reglas: no se puede verificar que lo
 *     descontado sea exactamente la cantidad de los items del pedido (las
 *     reglas no iteran listas). Un atacante podría crear un pedido falso y
 *     bajar stock, pero queda SIEMPRE un pedido visible para el staff (no hay
 *     drenaje silencioso) y nunca puede subir/inventar/borrar stock.
 *   - create / delete del doc: solo staff.
 *
 * stock/{productId}/movimientos/{id}
 *   - read: solo staff.
 *   - create público solo con formato estricto: talle/color strings cortos
 *     sin caracteres HTML, delta entero negativo acotado, motivo
 *     'Venta #CODIGO' cuyo pedido se crea en la misma escritura atómica,
 *     fecha YYYY-MM-DD, ts == hora del servidor, sin campos extra.
 *   - create staff libre; update/delete nunca.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const STAFF_EMAIL = 'staff@cattorini.test';
const ts = () => firebase.firestore.FieldValue.serverTimestamp();

let env;
let publico, anonimo, intruso, staff, staffAnonimo;

/* Códigos de prueba (formato objetivo: >=10 caracteres del alfabeto sin 0/O/1/I) */
const COD = (n) => ('PEDK7M2Q9X' + n).slice(0, 10 + String(n).length);
const SOL = (n) => 'MAY-' + ('SOLK7M2Q9X' + n);

function clienteValido() {
  return {
    nombre: 'Cliente Test', negocio: '', whatsapp: '', email: '', cuit: '',
    direccion: '', provincia: '', localidad: '', codigoPostal: '',
    perfil: 'minorista', zonaStatus: 'libre', localidadPerfil: ''
  };
}

function pedidoValido(codigo, overrides = {}) {
  return {
    codigo,
    creadoEn: ts(),
    cliente: clienteValido(),
    items: [{ id: 1, nombre: 'Camisa', categoria: 'Camisas', talle: '40', color: 'Blanco', qty: 1, precio: 79000 }],
    modalidad: 'retiro',
    pagaEnLocal: true,
    subtotal: 79000, envio: 0, total: 79000,
    nota: '',
    estado: 'pendiente',
    ...overrides
  };
}

function solicitudValida(codigo, overrides = {}) {
  return {
    codigo,
    creadoEn: ts(),
    solicitante: {
      nombre: 'Solicitante Test', negocio: 'Negocio Test', cuit: '20-12345678-9', tipo: 'Tienda',
      telefono: '', whatsapp: '5492244000000', email: '', provincia: 'Buenos Aires',
      localidad: 'Las Flores', direccion: 'Calle 123', codigoPostal: '7200', foto_negocio: null
    },
    notas: '',
    estado: 'pendiente',
    respuesta: null,
    ...overrides
  };
}

const STOCK_INICIAL = {
  variantes: {
    '40': { Blanco: { cantidad: 5, hex: '#ffffff' }, Azul: { cantidad: 2, hex: '#0000ff' } },
    '42': { Blanco: { cantidad: 3, hex: '#ffffff' } }
  }
};

function movimientoVenta(codigo, overrides = {}) {
  return {
    talle: '40', color: 'Blanco', delta: -1, cantidadResultante: 4,
    motivo: 'Venta #' + codigo,
    fecha: '2026-10-26',
    ts: ts(),
    ...overrides
  };
}

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cattorini',
    firestore: { rules: readFileSync(process.env.CATT_RULES_PATH, 'utf8') }
  });
  publico = env.unauthenticatedContext().firestore();
  anonimo = env.authenticatedContext('anon-uid', {
    firebase: { sign_in_provider: 'anonymous', identities: {} }
  }).firestore();
  intruso = env.authenticatedContext('intruso-uid', {
    email: 'intruso@example.com', email_verified: true,
    firebase: { sign_in_provider: 'password', identities: { email: ['intruso@example.com'] } }
  }).firestore();
  staff = env.authenticatedContext('staff-uid', {
    email: STAFF_EMAIL, email_verified: true,
    firebase: { sign_in_provider: 'password', identities: { email: [STAFF_EMAIL] } }
  }).firestore();
  /* Token con el email del staff pero sin haber entrado con contraseña
     (p.ej. un custom token): no debe alcanzar con el email. */
  staffAnonimo = env.authenticatedContext('staff-anon-uid', {
    email: STAFF_EMAIL,
    firebase: { sign_in_provider: 'anonymous', identities: {} }
  }).firestore();
});

after(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await db.doc('pedidos/' + COD(0)).set({ ...pedidoValido(COD(0)), creadoEn: new Date() });
    await db.doc('solicitudes_mayoristas/' + SOL(0)).set({ ...solicitudValida(SOL(0)), creadoEn: new Date() });
    await db.doc('mayoristas_activos/' + 'a'.repeat(64)).set({ nombre: 'May', negocio: 'Neg', localidad: 'Las Flores', provincia: 'Buenos Aires' });
    await db.doc('stock/1').set(STOCK_INICIAL);
    await db.doc('stock/1/movimientos/m0').set({ talle: '40', color: 'Blanco', delta: 5, motivo: 'Alta inicial', fecha: '2026-10-01' });
  });
});

/* ======================================================================== */
describe('pedidos — creación pública validada', () => {
  test('público crea un pedido válido con ID == código', async () => {
    await assertSucceeds(publico.doc('pedidos/' + COD(1)).set(pedidoValido(COD(1))));
  });
  test('rechaza ID de doc distinto del código (no se puede usar add() con ID aleatorio)', async () => {
    await assertFails(publico.doc('pedidos/OTROIDXXXXXX').set(pedidoValido(COD(2))));
  });
  test('rechaza código corto/adivinable (5 caracteres)', async () => {
    await assertFails(publico.doc('pedidos/AB3CD').set(pedidoValido('AB3CD')));
  });
  test('rechaza código con caracteres fuera de [A-Z0-9]', async () => {
    const c = 'ABC<img>XYZ';
    await assertFails(publico.doc('pedidos/' + c).set(pedidoValido(c)));
  });
  test('rechaza estado inicial distinto de pendiente', async () => {
    await assertFails(publico.doc('pedidos/' + COD(3)).set(pedidoValido(COD(3), { estado: 'preparando' })));
  });
  test('rechaza campos extra no previstos (p.ej. manual:true)', async () => {
    await assertFails(publico.doc('pedidos/' + COD(4)).set(pedidoValido(COD(4), { manual: true })));
  });
  test('rechaza creadoEn arbitrario (debe ser hora del servidor)', async () => {
    await assertFails(publico.doc('pedidos/' + COD(5)).set(pedidoValido(COD(5), { creadoEn: new Date('2020-01-01') })));
  });
  test('rechaza total incoherente (total != subtotal + envio)', async () => {
    await assertFails(publico.doc('pedidos/' + COD(6)).set(pedidoValido(COD(6), { total: 1 })));
  });
  test('rechaza items vacío', async () => {
    await assertFails(publico.doc('pedidos/' + COD(7)).set(pedidoValido(COD(7), { items: [] })));
  });
  test('no se puede sobreescribir un pedido existente (set sobre ID existente)', async () => {
    await assertFails(publico.doc('pedidos/' + COD(0)).set(pedidoValido(COD(0))));
  });
});

describe('pedidos — lectura', () => {
  test('público puede leer UN pedido por su código (get por ID)', async () => {
    await assertSucceeds(publico.doc('pedidos/' + COD(0)).get());
  });
  test('público NO puede listar pedidos', async () => {
    await assertFails(publico.collection('pedidos').get());
  });
  test('público NO puede buscar por where(codigo == X) (es un list)', async () => {
    await assertFails(publico.collection('pedidos').where('codigo', '==', COD(0)).limit(1).get());
  });
  test('anónimo autenticado NO puede listar pedidos', async () => {
    await assertFails(anonimo.collection('pedidos').get());
  });
  test('email/contraseña fuera de la allowlist NO puede listar pedidos', async () => {
    await assertFails(intruso.collection('pedidos').get());
  });
  test('token con email de staff pero proveedor anónimo NO puede listar', async () => {
    await assertFails(staffAnonimo.collection('pedidos').get());
  });
  test('staff puede listar pedidos', async () => {
    await assertSucceeds(staff.collection('pedidos').orderBy('creadoEn', 'desc').limit(500).get());
  });
});

describe('pedidos — update / delete', () => {
  test('público NO puede cambiar el estado', async () => {
    await assertFails(publico.doc('pedidos/' + COD(0)).update({ estado: 'enviado' }));
  });
  test('anónimo autenticado NO puede cambiar el estado', async () => {
    await assertFails(anonimo.doc('pedidos/' + COD(0)).update({ estado: 'enviado' }));
  });
  test('anónimo autenticado NO puede borrar pedidos', async () => {
    await assertFails(anonimo.doc('pedidos/' + COD(0)).delete());
  });
  test('email fuera de la allowlist NO puede cambiar ni borrar', async () => {
    await assertFails(intruso.doc('pedidos/' + COD(0)).update({ estado: 'enviado' }));
    await assertFails(intruso.doc('pedidos/' + COD(0)).delete());
  });
  test('staff puede cambiar estado y borrar', async () => {
    await assertSucceeds(staff.doc('pedidos/' + COD(0)).update({ estado: 'preparando' }));
    await assertSucceeds(staff.doc('pedidos/' + COD(0)).delete());
  });
});

/* ======================================================================== */
describe('solicitudes_mayoristas', () => {
  test('público crea solicitud válida con ID == código', async () => {
    await assertSucceeds(publico.doc('solicitudes_mayoristas/' + SOL(1)).set(solicitudValida(SOL(1))));
  });
  test('rechaza ID distinto del código', async () => {
    await assertFails(publico.doc('solicitudes_mayoristas/RANDOMID123').set(solicitudValida(SOL(2))));
  });
  test('rechaza código corto MAY-XXXX (1M combinaciones, enumerable)', async () => {
    await assertFails(publico.doc('solicitudes_mayoristas/MAY-ABCD').set(solicitudValida('MAY-ABCD')));
  });
  test('rechaza crear una solicitud ya aceptada o con respuesta', async () => {
    await assertFails(publico.doc('solicitudes_mayoristas/' + SOL(3)).set(
      solicitudValida(SOL(3), { estado: 'aceptada', respuesta: { codigoMayorista: 'CATT-XXXXXX' } })));
  });
  test('público puede leer SU solicitud por código (get)', async () => {
    await assertSucceeds(publico.doc('solicitudes_mayoristas/' + SOL(0)).get());
  });
  test('público NO puede listar solicitudes (exponen CUIT, teléfonos y códigos mayoristas)', async () => {
    await assertFails(publico.collection('solicitudes_mayoristas').get());
  });
  test('público NO puede buscar por where(codigo == X)', async () => {
    await assertFails(publico.collection('solicitudes_mayoristas').where('codigo', '==', SOL(0)).limit(1).get());
  });
  test('anónimo autenticado NO puede listar, aprobar ni borrar', async () => {
    await assertFails(anonimo.collection('solicitudes_mayoristas').get());
    await assertFails(anonimo.doc('solicitudes_mayoristas/' + SOL(0)).update({ estado: 'aceptada' }));
    await assertFails(anonimo.doc('solicitudes_mayoristas/' + SOL(0)).delete());
  });
  test('email fuera de la allowlist NO puede listar ni aprobar', async () => {
    await assertFails(intruso.collection('solicitudes_mayoristas').get());
    await assertFails(intruso.doc('solicitudes_mayoristas/' + SOL(0)).update({ estado: 'aceptada' }));
  });
  test('staff puede listar, aprobar y borrar', async () => {
    await assertSucceeds(staff.collection('solicitudes_mayoristas').orderBy('creadoEn', 'desc').limit(200).get());
    await assertSucceeds(staff.doc('solicitudes_mayoristas/' + SOL(0)).update({ estado: 'aceptada' }));
    await assertSucceeds(staff.doc('solicitudes_mayoristas/' + SOL(0)).delete());
  });
});

/* ======================================================================== */
describe('mayoristas_activos', () => {
  const HASH = 'a'.repeat(64);
  test('público puede hacer get por hash (validación del código en la tienda)', async () => {
    await assertSucceeds(publico.doc('mayoristas_activos/' + HASH).get());
  });
  test('público NO puede listar', async () => {
    await assertFails(publico.collection('mayoristas_activos').get());
  });
  test('anónimo autenticado NO puede listar', async () => {
    await assertFails(anonimo.collection('mayoristas_activos').limit(500).get());
  });
  test('anónimo autenticado NO puede darse de alta como mayorista', async () => {
    await assertFails(anonimo.doc('mayoristas_activos/' + 'b'.repeat(64)).set({ nombre: 'yo', negocio: 'yo' }));
  });
  test('anónimo autenticado NO puede editar ni borrar mayoristas', async () => {
    await assertFails(anonimo.doc('mayoristas_activos/' + HASH).update({ nombre: '<img src=x onerror=alert(1)>' }));
    await assertFails(anonimo.doc('mayoristas_activos/' + HASH).delete());
  });
  test('email fuera de la allowlist NO puede crear', async () => {
    await assertFails(intruso.doc('mayoristas_activos/' + 'c'.repeat(64)).set({ nombre: 'x', negocio: 'y' }));
  });
  test('staff puede listar, crear, editar y borrar', async () => {
    await assertSucceeds(staff.collection('mayoristas_activos').limit(500).get());
    await assertSucceeds(staff.doc('mayoristas_activos/' + 'd'.repeat(64)).set({ nombre: 'x', negocio: 'y' }));
    await assertSucceeds(staff.doc('mayoristas_activos/' + HASH).update({ nombre: 'Nuevo' }));
    await assertSucceeds(staff.doc('mayoristas_activos/' + HASH).delete());
  });
});

/* ======================================================================== */
describe('stock — lectura y escritura de staff', () => {
  test('lectura pública del stock', async () => {
    await assertSucceeds(publico.doc('stock/1').get());
  });
  test('staff puede crear, ajustar y borrar stock libremente', async () => {
    await assertSucceeds(staff.doc('stock/2').set({ variantes: { '40': { Negro: { cantidad: 10, hex: '#000000' } } } }));
    await assertSucceeds(staff.doc('stock/1').set({ variantes: { '40': { Blanco: { cantidad: 50, hex: '#ffffff' } } } }));
    await assertSucceeds(staff.doc('stock/2').delete());
  });
  test('anónimo autenticado NO puede crear ni borrar docs de stock', async () => {
    await assertFails(anonimo.doc('stock/99').set({ variantes: {} }));
    await assertFails(anonimo.doc('stock/1').delete());
  });
});

describe('stock — descuento público atado a un pedido', () => {
  /** batch: crea el pedido + descuenta stock/1 con los cambios dados */
  /** Variantes (talle/color) que difieren entre el stock inicial y `nuevas`
   *  — es lo que el cliente declara en `descuento` (las reglas no pueden
   *  iterar claves de un Map, ver referencia). */
  function declarar(nuevas) {
    const out = [];
    const a = STOCK_INICIAL.variantes;
    for (const t of new Set([...Object.keys(a), ...Object.keys(nuevas)])) {
      for (const c of new Set([...Object.keys(a[t] || {}), ...Object.keys(nuevas[t] || {})])) {
        if (JSON.stringify((a[t] || {})[c]) !== JSON.stringify((nuevas[t] || {})[c])) out.push({ talle: t, color: c });
      }
    }
    return out;
  }
  function checkout(db, codigo, nuevasVariantes, { conPedido = true, extra = {} } = {}) {
    const b = db.batch();
    if (conPedido) b.set(db.doc('pedidos/' + codigo), pedidoValido(codigo));
    b.update(db.doc('stock/1'), {
      variantes: nuevasVariantes,
      actualizadoEn: ts(),
      ultimoPedido: codigo,
      descuento: declarar(nuevasVariantes),
      ...extra
    });
    return b.commit();
  }
  const clonar = () => JSON.parse(JSON.stringify(STOCK_INICIAL.variantes));

  test('descuento coherente: 1 unidad de 40/Blanco en el mismo batch que el pedido', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = 4;
    await assertSucceeds(checkout(publico, COD(10), v));
  });
  test('descuento de varias variantes del mismo producto en un mismo pedido', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = 3; v['40'].Azul.cantidad = 1; v['42'].Blanco.cantidad = 2;
    await assertSucceeds(checkout(publico, COD(11), v));
  });
  test('descuento con transacción (como hace la tienda): pedido + stock + movimiento', async () => {
    const codigo = COD(12);
    await assertSucceeds(publico.runTransaction(async (tx) => {
      const ref = publico.doc('stock/1');
      const snap = await tx.get(ref);
      const v = snap.data().variantes;
      v['40'].Blanco.cantidad -= 1;
      tx.set(publico.doc('pedidos/' + codigo), pedidoValido(codigo));
      tx.update(ref, { variantes: v, actualizadoEn: ts(), ultimoPedido: codigo, descuento: [{ talle: '40', color: 'Blanco' }] });
      tx.set(publico.collection('stock/1/movimientos').doc(), movimientoVenta(codigo));
    }));
  });
  test('NO se puede descontar stock sin crear un pedido en la misma escritura', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = 0;
    await assertFails(checkout(publico, COD(13), v, { conPedido: false }));
  });
  test('NO se puede reutilizar un pedido que ya existía para seguir descontando', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = 0;
    await assertFails(publico.doc('stock/1').update({
      variantes: v, actualizadoEn: ts(), ultimoPedido: COD(0), descuento: [{ talle: '40', color: 'Blanco' }]
    }));
  });
  test('NO se puede AUMENTAR stock', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = 999;
    await assertFails(checkout(publico, COD(14), v));
  });
  test('NO se puede agregar un color nuevo', async () => {
    const v = clonar(); v['40'].Rojo = { cantidad: 0, hex: '#ff0000' };
    await assertFails(checkout(publico, COD(15), v));
  });
  test('NO se puede agregar un talle nuevo', async () => {
    const v = clonar(); v['99'] = { Blanco: { cantidad: 0, hex: '#ffffff' } };
    await assertFails(checkout(publico, COD(16), v));
  });
  test('NO se puede borrar un color existente', async () => {
    const v = clonar(); delete v['40'].Azul;
    await assertFails(checkout(publico, COD(17), v));
  });
  test('NO se puede cambiar el hex de un color', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = 4; v['40'].Blanco.hex = '#000000';
    await assertFails(checkout(publico, COD(18), v));
  });
  test('NO puede quedar stock negativo', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = -1;
    await assertFails(checkout(publico, COD(19), v));
  });
  test('NO se puede vaciar el stock (variantes = {})', async () => {
    await assertFails(checkout(publico, COD(20), {}));
  });
  test('NO se puede inyectar campos extra en la variante', async () => {
    const v = clonar(); v['40'].Blanco = { cantidad: 4, hex: '#ffffff', nota: '<img src=x>' };
    await assertFails(checkout(publico, COD(21), v));
  });
  test('declarar una variante y modificar OTRA (subirla) → rechazado', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = 4; v['40'].Azul.cantidad = 50;
    await assertFails(checkout(publico, COD(22), v, { extra: { descuento: [{ talle: '40', color: 'Blanco' }] } }));
  });
  test('declarar una variante y modificar otro TALLE → rechazado', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = 4; v['42'].Blanco.cantidad = 50;
    await assertFails(checkout(publico, COD(23), v, { extra: { descuento: [{ talle: '40', color: 'Blanco' }] } }));
  });
  /* Los casos siguientes reproducen escrituras que la app/un atacante pueden
     hacer HOY (update directo de stock sin pedido). Con las reglas actuales
     pasan → agujero. */
  test('HOY: vaciar todo el stock de un producto sin pedido → rechazado', async () => {
    await assertFails(publico.doc('stock/1').update({ variantes: {}, actualizadoEn: ts() }));
  });
  test('HOY: inventar un color con stock sin pedido → rechazado', async () => {
    const v = clonar(); v['40'].Falso = { cantidad: 999, hex: '#123456' };
    await assertFails(publico.doc('stock/1').update({ variantes: v, actualizadoEn: ts() }));
  });
  test('update público "solo variantes" como hoy (sin pedido) → rechazado', async () => {
    const v = clonar(); v['40'].Blanco.cantidad = 100;
    await assertFails(publico.doc('stock/1').update({ variantes: v, actualizadoEn: ts() }));
  });
});

/* ======================================================================== */
describe('stock/movimientos', () => {
  function ventaConPedido(db, codigo, mov) {
    const b = db.batch();
    b.set(db.doc('pedidos/' + codigo), pedidoValido(codigo));
    b.set(db.collection('stock/1/movimientos').doc(), mov);
    return b.commit();
  }
  test('público NO puede leer el historial', async () => {
    await assertFails(publico.collection('stock/1/movimientos').get());
  });
  test('anónimo autenticado NO puede leer el historial', async () => {
    await assertFails(anonimo.collection('stock/1/movimientos').orderBy('ts', 'desc').limit(100).get());
  });
  test('staff puede leer el historial y crear ajustes positivos', async () => {
    await assertSucceeds(staff.collection('stock/1/movimientos').get());
    await assertSucceeds(staff.collection('stock/1/movimientos').add({
      talle: '40', color: 'Blanco', delta: 10, cantidadResultante: 15, motivo: 'Ingreso manual', fecha: '2026-10-26', ts: ts()
    }));
  });
  test('público crea movimiento de venta con formato estricto en el mismo batch del pedido', async () => {
    await assertSucceeds(ventaConPedido(publico, COD(30), movimientoVenta(COD(30))));
  });
  test('rechaza movimiento de venta de un pedido que no se crea en la misma escritura', async () => {
    await assertFails(publico.collection('stock/1/movimientos').add(movimientoVenta(COD(0))));
  });
  test('rechaza HTML/XSS en talle', async () => {
    await assertFails(ventaConPedido(publico, COD(31),
      movimientoVenta(COD(31), { talle: '<img src=x onerror="window.__xss=1">' })));
  });
  test('rechaza HTML/XSS en color', async () => {
    await assertFails(ventaConPedido(publico, COD(32),
      movimientoVenta(COD(32), { color: '<img src=x onerror="window.__xss=1">' })));
  });
  test('rechaza motivo con formato libre (debe ser "Venta #CODIGO")', async () => {
    await assertFails(ventaConPedido(publico, COD(33),
      movimientoVenta(COD(33), { motivo: '<b>hola</b>' })));
  });
  test('rechaza cantidadResultante no numérica', async () => {
    await assertFails(ventaConPedido(publico, COD(34),
      movimientoVenta(COD(34), { cantidadResultante: '<img src=x>' })));
  });
  test('rechaza fecha con formato libre', async () => {
    await assertFails(ventaConPedido(publico, COD(35),
      movimientoVenta(COD(35), { fecha: '<script>' })));
  });
  test('rechaza campos extra', async () => {
    await assertFails(ventaConPedido(publico, COD(36),
      movimientoVenta(COD(36), { extra: 'x' })));
  });
  test('rechaza delta positivo (público nunca suma stock)', async () => {
    await assertFails(ventaConPedido(publico, COD(37),
      movimientoVenta(COD(37), { delta: 5 })));
  });
  test('rechaza delta absurdo (-100000)', async () => {
    await assertFails(ventaConPedido(publico, COD(38),
      movimientoVenta(COD(38), { delta: -100000 })));
  });
  test('rechaza ts arbitrario (debe ser hora del servidor)', async () => {
    await assertFails(ventaConPedido(publico, COD(39),
      movimientoVenta(COD(39), { ts: new Date('2020-01-01') })));
  });
  /* Escrituras que un anónimo puede hacer HOY sin ningún pedido: el payload
     XSS termina en el historial del portal (innerHTML en portal.html). */
  test('HOY: movimiento suelto (sin pedido) con XSS en talle → rechazado', async () => {
    await assertFails(publico.collection('stock/1/movimientos').add({
      talle: '<img src=x onerror="window.__xss=1">', color: 'Blanco', delta: -1,
      motivo: 'Venta #ABCDE', fecha: '2026-10-26'
    }));
  });
  test('HOY: movimiento suelto con motivo/fecha/cantidadResultante HTML → rechazado', async () => {
    await assertFails(publico.collection('stock/1/movimientos').add({
      talle: '40', color: 'Blanco', delta: -1,
      motivo: '<img src=x onerror=alert(1)>', fecha: '<b>x</b>', cantidadResultante: '<i>x</i>'
    }));
  });
  test('historial append-only: ni staff puede editar/borrar', async () => {
    await assertFails(staff.doc('stock/1/movimientos/m0').update({ delta: 0 }));
    await assertFails(staff.doc('stock/1/movimientos/m0').delete());
  });
});

/* ======================================================================== */
describe('colecciones no previstas', () => {
  test('cualquier otra colección está cerrada (deny by default)', async () => {
    await assertFails(publico.doc('config/x').set({ a: 1 }));
    await assertFails(anonimo.doc('config/x').set({ a: 1 }));
  });
});
