/* tienda-core.js — lógica compartida por las páginas públicas de Cattorini
 * (index.html, tienda.html, producto.html, seguimiento*.html).
 *
 * Antes este código estaba duplicado en tienda.html y producto.html y las dos
 * copias divergían. Acá vive UNA sola versión de:
 *  - escape/normalización de datos que vienen de productos.json, Firestore o
 *    del usuario (XSS),
 *  - generación de códigos (pedido / solicitud / trámite) con
 *    crypto.getRandomValues,
 *  - el checkout atómico (pedido + descuento de stock + movimientos en UNA
 *    transacción, idempotente por código),
 *  - la validación del perfil mayorista contra mayoristas_activos/{sha256}
 *    (fail-closed),
 *  - la espera de ubicaciones.js (carga con `defer` y puede llegar tarde).
 *
 * Modelo de datos y reglas: ver tests/rules/reference/firestore.rules.objetivo.
 */
(function () {
  'use strict';

  /* ================= Escape / sanitización ================= */

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  /* Nombre de archivo de imagen de productos.json → ruta segura dentro de
     ./img/. Cualquier cosa que no sea un nombre de archivo simple (comillas,
     paréntesis, "../", "javascript:", etc.) se descarta. */
  function imgSrc(nombre) {
    const n = String(nombre || '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,150}$/.test(n) || n.includes('..')) return '';
    return './img/' + encodeURIComponent(n);
  }

  /* Igual que imgSrc pero listo para style.backgroundImage */
  function cssUrl(nombre) {
    const src = imgSrc(nombre);
    return src ? 'url("' + src + '")' : '';
  }

  /* Número de WhatsApp: solo dígitos (evita inyectar rutas/params en wa.me) */
  function waNum(s) {
    return String(s || '').replace(/[^0-9]/g, '').slice(0, 20);
  }

  function waLink(numero, texto) {
    const n = waNum(numero);
    if (!n) return '';
    return 'https://wa.me/' + n + (texto ? '?text=' + encodeURIComponent(texto) : '');
  }

  function sanitizeInput(s, max) {
    if (!s) return '';
    return String(s).slice(0, max || 200).replace(/[<>]/g, '').trim();
  }

  /* ================= Códigos ================= */

  /* Sin caracteres ambiguos: ni 0/O, ni 1/I/L. 31 símbolos. */
  const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const LARGO_CODIGO = 10;

  function genCodigo(largo) {
    const n = largo || LARGO_CODIGO;
    const out = [];
    /* Rechazo de bytes >= 248 (31*8) para que la distribución sea uniforme */
    while (out.length < n) {
      const buf = new Uint8Array(n * 2);
      crypto.getRandomValues(buf);
      for (let i = 0; i < buf.length && out.length < n; i++) {
        if (buf[i] < 248) out.push(ALFABETO[buf[i] % ALFABETO.length]);
      }
    }
    return out.join('');
  }

  /* Lo que escribe el cliente → como está guardado (mayúsculas, sin espacios,
     sin '#', guiones normalizados). */
  function normalizarCodigo(s) {
    return String(s || '').toUpperCase().replace(/[\s#]/g, '').replace(/[‐-―−]/g, '-');
  }

  const RE_CODIGO_PEDIDO = /^[A-Z0-9]{10,20}$/;
  const RE_CODIGO_SOLICITUD = /^MAY-[A-Z0-9]{10,20}$/;

  /* ================= SHA-256 ================= */

  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ================= Perfil mayorista ================= */

  const LS_PERFIL = 'catt_perfil';
  const LS_HASH = 'catt_codigo_valido_hash';
  const LS_MAY_DATA = 'catt_mayorista_data';

  /* Revalida el perfil mayorista guardado en este dispositivo contra
     mayoristas_activos/{hash}. FAIL-CLOSED: si el doc no existe, si no hay
     Firestore o si la lectura falla, NO se mantiene el perfil.
     Devuelve { ok, motivo } con motivo: 'no-mayorista' | 'sin-codigo' |
     'revocado' | 'error'. */
  async function validarMayoristaPersistido(db) {
    if (localStorage.getItem(LS_PERFIL) !== 'mayorista') return { ok: true, motivo: 'no-mayorista' };
    const hash = localStorage.getItem(LS_HASH) || '';
    if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, motivo: 'sin-codigo' };
    if (!db) return { ok: false, motivo: 'error' };
    try {
      const doc = await db.collection('mayoristas_activos').doc(hash).get();
      if (!doc.exists) return { ok: false, motivo: 'revocado' };
      const data = doc.data() || {};
      localStorage.setItem(LS_MAY_DATA, JSON.stringify(data));
      return { ok: true, motivo: 'ok', data };
    } catch (e) {
      console.warn('No se pudo verificar el código mayorista:', e && e.message);
      return { ok: false, motivo: 'error' };
    }
  }

  /* Busca un código ingresado por el mayorista. Devuelve
     { ok:true, hash, data } | { ok:false, motivo:'invalido'|'error' }.
     No hay más código "maestro": solo códigos individuales. */
  async function verificarCodigoMayorista(db, codigoIngresado) {
    const crudo = String(codigoIngresado || '').trim();
    if (!crudo) return { ok: false, motivo: 'invalido' };
    if (!db) return { ok: false, motivo: 'error' };
    const candidatos = [crudo];
    const norm = crudo.toUpperCase().replace(/\s+/g, '');
    if (norm !== crudo) candidatos.push(norm);
    try {
      for (const c of candidatos) {
        const hash = await sha256(c);
        const doc = await db.collection('mayoristas_activos').doc(hash).get();
        if (doc.exists) return { ok: true, hash, data: doc.data() || {} };
      }
      return { ok: false, motivo: 'invalido' };
    } catch (e) {
      console.warn('No se pudo consultar mayoristas_activos:', e && e.message);
      return { ok: false, motivo: 'error' };
    }
  }

  const MSG_NO_VERIFICADO = 'No pudimos verificar tu código, probá de nuevo.';

  /* ================= Checkout atómico ================= */

  /* Tope por producto y por pedido: cantidad de combinaciones talle/color
     distintas que se descuentan de un mismo stock/{id}. Tiene que coincidir
     con el tope de `descuento` en firestore.rules (Firestore corta en 1000
     expresiones evaluadas por documento; con 12 entra holgado).
     TEMPORAL: cuando el stock lo descuente el Worker de pagos se levanta.
     Pedidos que lo superan se arman por WhatsApp (pedidoPorWhatsApp). */
  const MAX_VARIANTES_POR_PRODUCTO = 12;
  /* firestore.rules: movimientos.delta >= -100 */
  const MAX_UNIDADES_POR_VARIANTE = 100;
  /* firestore.rules: pedidos.items.size() <= 100 */
  const MAX_ITEMS_POR_PEDIDO = 100;

  class ErrorCheckout extends Error {
    constructor(msg, extra) {
      super(msg); this.name = 'ErrorCheckout'; this.paraCliente = true;
      /* requiereWhatsApp: el pedido no se puede enviar online, se arma por WhatsApp */
      if (extra) Object.assign(this, extra);
    }
  }

  /* Agrupa los items con color (= bajo control de stock) por producto y por
     variante talle/color. Items sin color (productos sin stock cargado) no
     tocan stock (compatibilidad con el catálogo viejo). */
  function agruparVariantes(cart) {
    const porProducto = new Map();
    for (const i of cart) {
      if (!i || !i.color) continue;
      const id = String(i.id);
      if (!porProducto.has(id)) porProducto.set(id, { nombre: i.nombre, vars: new Map() });
      const g = porProducto.get(id);
      const k = String(i.talle) + '\u0000' + String(i.color);
      const prev = g.vars.get(k);
      g.vars.set(k, { talle: String(i.talle), color: String(i.color), qty: (prev ? prev.qty : 0) + i.qty });
    }
    return porProducto;
  }

  /* Validaciones previas (sin red). Tira ErrorCheckout con mensaje claro. */
  function validarCarrito(cart) {
    if (!Array.isArray(cart) || !cart.length) throw new ErrorCheckout('Tu pedido está vacío.');
    if (cart.length > MAX_ITEMS_POR_PEDIDO) {
      throw new ErrorCheckout(`Un pedido puede tener hasta ${MAX_ITEMS_POR_PEDIDO} renglones. Dividilo en dos pedidos.`);
    }
    for (const i of cart) {
      if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 9999) {
        throw new ErrorCheckout('Hay una cantidad inválida en el carrito. Revisala y probá de nuevo.');
      }
    }
    const grupos = agruparVariantes(cart);
    for (const g of grupos.values()) {
      if (g.vars.size > MAX_VARIANTES_POR_PRODUCTO) {
        throw new ErrorCheckout(
          `Tu pedido tiene ${g.vars.size} combinaciones de talle y color de "${g.nombre}". ` +
          `Los pedidos de más de ${MAX_VARIANTES_POR_PRODUCTO} combinaciones de una misma prenda los armamos ` +
          'por WhatsApp: te dejamos el pedido completo listo para enviar y lo cargamos nosotros.',
          { requiereWhatsApp: true, producto: g.nombre, combinaciones: g.vars.size });
      }
      for (const v of g.vars.values()) {
        if (v.qty > MAX_UNIDADES_POR_VARIANTE) {
          throw new ErrorCheckout(
            `Para más de ${MAX_UNIDADES_POR_VARIANTE} unidades de "${g.nombre}" talle ${v.talle} ${v.color} ` +
            'en un solo pedido, escribinos por WhatsApp y lo cargamos nosotros.');
        }
      }
    }
    return grupos;
  }

  /* Crea pedidos/{codigo} + descuenta stock + registra movimientos en UNA
     transacción. Si cualquier cosa falla, no queda nada a medias.
     Idempotente: si pedidos/{codigo} ya existe (reintento después de un
     error de red con el MISMO código), no crea nada nuevo y devuelve
     { yaExistia: true }.
     Devuelve { codigo, yaExistia, resultantes } donde resultantes[id][talle\0color]
     es la cantidad que quedó. */
  async function crearPedidoAtomico(db, FieldValue, codigo, payload, cart) {
    if (!RE_CODIGO_PEDIDO.test(codigo)) throw new Error('código de pedido inválido');
    const grupos = validarCarrito(cart);
    const pedidoRef = db.collection('pedidos').doc(codigo);
    const ids = [...grupos.keys()];
    const stockRefs = ids.map(id => db.collection('stock').doc(id));

    return db.runTransaction(async (tx) => {
      const pedidoSnap = await tx.get(pedidoRef);
      if (pedidoSnap.exists) return { codigo, yaExistia: true, resultantes: {} };

      const snaps = await Promise.all(stockRefs.map(r => tx.get(r)));
      const resultantes = {};
      const updates = [];

      ids.forEach((id, idx) => {
        const g = grupos.get(id);
        const snap = snaps[idx];
        const actuales = (snap.exists && snap.data() && snap.data().variantes) || {};
        /* Copia profunda: solo se modifican las cantidades declaradas. */
        const variantes = JSON.parse(JSON.stringify(actuales));
        const descuento = [];
        resultantes[id] = {};
        for (const v of g.vars.values()) {
          const porTalle = variantes[v.talle];
          const entrada = porTalle && typeof porTalle === 'object' ? porTalle[v.color] : null;
          const cantidad = entrada && typeof entrada.cantidad === 'number' ? entrada.cantidad : 0;
          if (!entrada || cantidad < v.qty) {
            throw new ErrorCheckout(
              `Sin stock suficiente de "${g.nombre}" (talle ${v.talle}, ${v.color}): quedan ${Math.max(0, cantidad)}. ` +
              'Ajustá la cantidad en el carrito.');
          }
          entrada.cantidad = cantidad - v.qty;
          descuento.push({ talle: v.talle, color: v.color });
          resultantes[id][v.talle + '\u0000' + v.color] = entrada.cantidad;
        }
        updates.push({ ref: stockRefs[idx], variantes, descuento, grupo: g, id });
      });

      tx.set(pedidoRef, payload);

      const fecha = new Date().toISOString().split('T')[0];
      updates.forEach(u => {
        tx.update(u.ref, {
          variantes: u.variantes,
          actualizadoEn: FieldValue.serverTimestamp(),
          ultimoPedido: codigo,
          descuento: u.descuento
        });
        for (const v of u.grupo.vars.values()) {
          tx.set(u.ref.collection('movimientos').doc(), {
            talle: v.talle,
            color: v.color,
            delta: -v.qty,
            cantidadResultante: resultantes[u.id][v.talle + '\u0000' + v.color],
            motivo: 'Venta #' + codigo,
            fecha,
            ts: FieldValue.serverTimestamp()
          });
        }
      });

      return { codigo, yaExistia: false, resultantes };
    });
  }

  /* Mensaje para el cliente a partir de un error del checkout */
  function mensajeErrorCheckout(e) {
    if (e && e.paraCliente) return e.message;
    const code = e && e.code;
    if (code === 'permission-denied') {
      return 'No pudimos registrar tu pedido (el stock o el pedido no pasaron la validación). Recargá la página y probá de nuevo; si sigue, escribinos por WhatsApp.';
    }
    if (code === 'unavailable' || code === 'deadline-exceeded' || (e && /network|offline/i.test(e.message || ''))) {
      return 'Sin conexión: tu pedido no se envió. Probá de nuevo en unos segundos (no se va a duplicar).';
    }
    return 'No pudimos enviar tu pedido. Probá de nuevo en unos segundos (no se va a duplicar).';
  }

  /* ================= Pedido por WhatsApp (fallback) ================= */

  const fmtPesos = n => '$' + Number(n || 0).toLocaleString('es-AR');

  /* Texto del pedido completo para mandar por WhatsApp. `datos` es lo que el
     cliente ya cargó en el checkout (nombre, perfil, entrega, dirección...). */
  function textoPedidoWhatsApp(cart, datos) {
    const d = datos || {};
    const lineas = ['Hola! Quiero hacer este pedido por WhatsApp (tiene más de ' + MAX_VARIANTES_POR_PRODUCTO +
      ' combinaciones de talle y color de una misma prenda):', ''];
    let subtotal = 0;
    for (const i of cart) {
      const sub = (Number(i.precio) || 0) * (Number(i.qty) || 0);
      subtotal += sub;
      lineas.push('• ' + i.nombre + ' · Talle ' + i.talle + (i.color ? ' · ' + i.color : '') + ' · x' + i.qty + ' · ' + fmtPesos(sub));
    }
    lineas.push('', 'Subtotal: ' + fmtPesos(subtotal));
    if (d.perfil) lineas.push('Perfil: ' + (d.perfil === 'mayorista' ? 'Mayorista' : 'Minorista'));
    if (d.nombre) lineas.push('Nombre: ' + d.nombre);
    if (d.negocio) lineas.push('Negocio: ' + d.negocio);
    if (d.entrega === 'envio') {
      lineas.push('Entrega: Envío a domicilio');
      const dir = [d.direccion, d.localidad, d.provincia, d.cp && ('CP ' + d.cp)].filter(Boolean).join(', ');
      if (dir) lineas.push('Dirección: ' + dir);
    } else if (d.entrega) {
      lineas.push('Entrega: Retiro en el local');
    }
    if (d.nota) lineas.push('Nota: ' + d.nota);
    return lineas.join('\n');
  }

  /* Muestra un diálogo con el mensaje explicativo y un botón que abre el
     WhatsApp del negocio con el pedido completo prellenado. Se arma con
     createElement/textContent (nada de innerHTML con datos del carrito). */
  function mostrarPedidoPorWhatsApp(numero, mensaje, texto) {
    let back = document.getElementById('wa-pedido-modal');
    if (back) back.remove();
    back = document.createElement('div');
    back.id = 'wa-pedido-modal';
    back.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:90;display:flex;align-items:center;justify-content:center;padding:16px;';
    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'wa-pedido-title');
    box.style.cssText = 'background:#FFF;max-width:460px;width:100%;padding:28px 24px;max-height:90vh;overflow-y:auto;';
    const h = document.createElement('h2');
    h.id = 'wa-pedido-title';
    h.textContent = 'Este pedido lo armamos por WhatsApp';
    h.style.cssText = "font-family:'Cormorant Garamond',serif;font-size:1.6rem;margin:0 0 10px;line-height:1.2;";
    const p = document.createElement('p');
    p.id = 'wa-pedido-msg';
    p.textContent = mensaje;
    p.style.cssText = 'color:#333;font-size:0.9rem;line-height:1.6;margin:0 0 18px;';
    const a = document.createElement('a');
    a.id = 'wa-pedido-btn';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Enviar el pedido por WhatsApp';
    a.style.cssText = 'display:block;text-align:center;background:#0A0A0A;color:#FFF;padding:14px;text-decoration:none;font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;font-weight:500;';
    const href = waLink(numero, texto);
    if (href) a.href = href;
    else { a.removeAttribute('href'); a.textContent = 'Escribinos por WhatsApp desde la página de contacto'; }
    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.textContent = 'Volver al carrito';
    cerrar.style.cssText = 'display:block;width:100%;margin-top:8px;padding:10px;background:none;border:none;color:#666;cursor:pointer;font:inherit;font-size:0.78rem;letter-spacing:0.08em;text-transform:uppercase;';
    const close = () => { back.remove(); devolverFoco(back); };
    cerrar.onclick = close;
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    box.append(h, p, a, cerrar);
    back.appendChild(box);
    document.body.appendChild(back);
    atraparFoco(box, close);
    focoEnModal(back, a);
    return back;
  }

  /* ================= ubicaciones.js (carga diferida) ================= */

  /* ubicaciones.js se carga con `defer`. Si productos.json llega antes, los
     init de provincia/localidad encontraban window.Ubicaciones undefined y
     el select quedaba vacío para siempre. Esto espera a que esté. */
  function esperarUbicaciones(timeoutMs) {
    if (window.Ubicaciones) return Promise.resolve(window.Ubicaciones);
    return new Promise((resolve) => {
      let listo = false;
      const fin = () => {
        if (listo) return;
        if (window.Ubicaciones) { listo = true; cleanup(); resolve(window.Ubicaciones); }
      };
      const iv = setInterval(fin, 50);
      const to = setTimeout(() => { if (!listo) { listo = true; cleanup(); resolve(null); } }, timeoutMs || 20000);
      const scripts = document.querySelectorAll('script[src*="ubicaciones.js"]');
      scripts.forEach(s => s.addEventListener('load', fin));
      document.addEventListener('DOMContentLoaded', fin);
      function cleanup() { clearInterval(iv); clearTimeout(to); }
    });
  }

  /* Inicializa un par provincia/localidad UNA sola vez por select, aunque se
     llame varias veces mientras ubicaciones.js todavía no cargó. */
  const _inits = new WeakMap();
  function initUbicacionSeguro(opts) {
    const key = opts.provinciaSelect;
    if (_inits.has(key)) return _inits.get(key);
    const p = esperarUbicaciones().then(U => (U ? U.init(opts) : null));
    _inits.set(key, p);
    return p;
  }

  async function localidadValida(provincia, localidad) {
    const U = await esperarUbicaciones(8000);
    if (!U) return true; /* sin dataset: mismo fallback que ubicaciones.js */
    return U.esLocalidadValida(provincia, localidad);
  }

  /* ================= Accesibilidad de modales ================= */

  const _focoPrevio = new WeakMap();
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }

  /* Llamar después de mostrar un modal: guarda el foco anterior y lo mueve
     al primer elemento enfocable visible del modal. */
  function focoEnModal(modal, preferido) {
    if (!modal) return;
    _focoPrevio.set(modal, document.activeElement);
    setTimeout(() => {
      const target = (preferido && visible(preferido)) ? preferido
        : [...modal.querySelectorAll(FOCUSABLE)].find(visible);
      if (target) target.focus({ preventScroll: false });
    }, 60);
  }

  /* Llamar al cerrar: devuelve el foco a donde estaba. */
  function devolverFoco(modal) {
    const prev = modal && _focoPrevio.get(modal);
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
    if (modal) _focoPrevio.delete(modal);
  }

  /* Tab/Shift+Tab dentro del modal abierto y Escape para cerrar */
  function atraparFoco(modal, alCerrar) {
    if (!modal || modal.__trap) return;
    modal.__trap = true;
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && alCerrar) { e.preventDefault(); alCerrar(); return; }
      if (e.key !== 'Tab') return;
      const els = [...modal.querySelectorAll(FOCUSABLE)].filter(visible);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  window.CattCore = Object.freeze({
    esc, imgSrc, cssUrl, waNum, waLink, sanitizeInput,
    genCodigo, normalizarCodigo, RE_CODIGO_PEDIDO, RE_CODIGO_SOLICITUD, LARGO_CODIGO,
    sha256,
    validarMayoristaPersistido, verificarCodigoMayorista, MSG_NO_VERIFICADO,
    MAX_VARIANTES_POR_PRODUCTO, MAX_UNIDADES_POR_VARIANTE, MAX_ITEMS_POR_PEDIDO,
    ErrorCheckout, validarCarrito, crearPedidoAtomico, mensajeErrorCheckout,
    textoPedidoWhatsApp, mostrarPedidoPorWhatsApp,
    esperarUbicaciones, initUbicacionSeguro, localidadValida,
    focoEnModal, devolverFoco, atraparFoco
  });
})();
