/**
 * pagos-panel.js — panel de pagos reutilizable (MercadoPago vía Worker).
 * Vanilla, sin dependencias, script clásico: expone `window.PagosPanel`.
 *
 * CÓMO SUMARLO AL PANEL DE OTRO CLIENTE (3 pasos)
 *  1. Copiá este archivo junto al panel y cargalo DESPUÉS de los SDK de Firebase:
 *       <script src="./pagos-panel.js"></script>
 *  2. Poné un contenedor vacío donde quieras la sección:  <div id="pagos"></div>
 *  3. Montalo con tu `db` de Firestore y decí dónde vive el pago:
 *       const p = PagosPanel.montar(document.getElementById('pagos'), {
 *         db,
 *         coleccion: 'pedidos',                 // aportes, pedidos, reservas…
 *         titulo:  d => 'Pedido ' + d.id + ' · ' + d.nombre,
 *         detalle: d => d.direccion,            // texto plano opcional
 *         monto:   d => d.total,                // por defecto d.monto
 *         // pago: d => d.pago,                 // por defecto d.pago
 *         // encabezado: 'Pagos',               // título opcional de la sección
 *         // incluir: d => !!d.pago,            // si la colección tiene docs sin pago
 *       });
 *       // p.desmontar() al cerrar sesión.
 *     Cada doc debe tener `creadoEn` (orden) y `pago.estado` (contrato del
 *     Worker). Detalle on-demand: subcolección `<coleccion>/{id}/pagos`.
 *     El panel NO marca pagos: solo los escribe el Worker.
 *
 * Si ya tenés tu propia lista, usá solo el badge:  PagosPanel.badge(doc.pago)
 *
 * Estilos: prefijo `.pp-`, inyectados una vez. Se adaptan a la paleta del
 * cliente sobreescribiendo variables en el contenedor o en :root:
 *   --pp-acento, --pp-fondo, --pp-texto, --pp-suave, --pp-borde,
 *   --pp-ok, --pp-aviso, --pp-mal   (ej. #pagos { --pp-acento: #b8860b; })
 *
 * Todo lo que viene de Firestore o de tus callbacks se escapa como texto.
 */
(function (global) {
  'use strict';

  // clase: ok | aviso | mal | neutro
  const ESTADOS = {
    aprobado: { txt: 'Pagado', ico: '✅', cls: 'ok' },
    pendiente: { txt: 'Pendiente', ico: '⏳', cls: 'aviso' },
    en_revision: { txt: 'En revisión', ico: '⏳', cls: 'aviso' },
    iniciado: { txt: 'Iniciado', ico: '', cls: 'neutro' },
    rechazado: { txt: 'Rechazado', ico: '❌', cls: 'mal' },
    cancelado: { txt: 'Cancelado', ico: '', cls: 'neutro' },
    vencido: { txt: 'Vencido', ico: '', cls: 'neutro' },
    en_disputa: { txt: 'Disputa', ico: '⚠️', cls: 'mal' },
    contracargo: { txt: 'Contracargo', ico: '⚠️', cls: 'mal' },
    monto_inconsistente: { txt: 'Monto inconsistente', ico: '⚠️', cls: 'mal' },
    reembolsado: { txt: 'Reembolsado', ico: '↩️', cls: 'neutro' },
  };
  const ALERTAS = { pago_duplicado: 'Duplicado' };
  const MP_ACTIVIDAD = 'https://www.mercadopago.com.ar/activities';

  const esc = s => (s === null || s === undefined) ? '' :
    String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fecha = f => { if (!f) return null; const d = f.toDate ? f.toDate() : new Date(f); return isNaN(d) ? null : d; };
  const pesos = n => (typeof n === 'number' && isFinite(n)) ? '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—';
  const fmtFecha = d => d ? d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  function badge(pago) {
    const e = pago && pago.estado;
    const info = ESTADOS[e] || { txt: e ? String(e) : 'Sin pago', ico: '', cls: 'neutro' };
    let h = `<span class="pp-badge pp-${info.cls}">${info.ico ? info.ico + ' ' : ''}${esc(info.txt)}</span>`;
    if (pago && pago.alerta) {
      h += ` <span class="pp-badge pp-mal">⚠️ ${esc(ALERTAS[pago.alerta] || pago.alerta)}</span>`;
    }
    return h;
  }

  const CSS = `
.pp{--pp-acento:#0C2C4B;--pp-fondo:#fff;--pp-texto:#0C2C4B;--pp-suave:#5b6b7a;--pp-borde:#d5d9dc;--pp-ok:#1F4D3A;--pp-aviso:#8a5a00;--pp-mal:#A3322B;color:var(--pp-texto);font:inherit;max-width:100%}
.pp *{box-sizing:border-box}
.pp-titulo{font-weight:700;font-size:1.1em;margin:0 0 8px}
.pp-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.pp-barra select,.pp-btn{font:inherit;padding:8px 12px;border:1.5px solid var(--pp-borde);border-radius:8px;background:var(--pp-fondo);color:var(--pp-texto);cursor:pointer;min-width:0}
.pp-btn.pp-pri{background:var(--pp-acento);border-color:var(--pp-acento);color:#fff}
.pp-tot{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:.92em;color:var(--pp-suave);margin-bottom:10px}
.pp-tot b{color:var(--pp-texto)}
.pp-lista{display:flex;flex-direction:column;gap:8px}
.pp-fila{background:var(--pp-fondo);border:1px solid var(--pp-borde);border-radius:10px;padding:10px 12px;min-width:0}
.pp-cab{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:space-between}
.pp-tit{font-weight:600;overflow-wrap:anywhere;min-width:0;flex:1 1 140px}
.pp-monto{font-weight:700}
.pp-meta{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:.85em;color:var(--pp-suave);margin-top:4px}
.pp-badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.82em;font-weight:600;white-space:nowrap;border:1px solid currentColor}
.pp-ok{color:var(--pp-ok);background:rgba(31,77,58,.08)}
.pp-aviso{color:var(--pp-aviso);background:rgba(217,142,43,.14)}
.pp-mal{color:var(--pp-mal);background:rgba(163,50,43,.08)}
.pp-neutro{color:var(--pp-suave);background:rgba(0,0,0,.04)}
.pp-det{margin-top:8px;padding-top:8px;border-top:1px dashed var(--pp-borde);font-size:.9em;overflow-wrap:anywhere}
.pp-det dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:4px 0 0}
.pp-det dt{color:var(--pp-suave)}.pp-det dd{margin:0}
.pp-det a{color:var(--pp-acento);text-decoration:underline}
.pp-pago{padding:6px 0;border-bottom:1px solid var(--pp-borde)}
.pp-vacio,.pp-error{padding:14px;text-align:center;color:var(--pp-suave)}
.pp-error{color:var(--pp-mal)}
.pp-link{background:none;border:0;padding:0;font:inherit;font-size:.85em;color:var(--pp-acento);text-decoration:underline;cursor:pointer}
`;
  function inyectarCSS() {
    if (document.getElementById('pp-css')) return;
    const st = document.createElement('style');
    st.id = 'pp-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /** CSV (UTF-8 con BOM para Excel). Neutraliza fórmulas (=, +, -, @). */
  function celda(v) {
    let s = (v === null || v === undefined) ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function generarCSV(filas) {
    const cab = ['Fecha', 'Codigo', 'Titulo', 'Monto', 'Estado', 'Medio', 'Cuotas', 'PaymentId'];
    return [cab, ...filas].map(f => f.map(celda).join(',')).join('\r\n');
  }

  function montar(contenedor, opts) {
    opts = opts || {};
    if (!contenedor || !opts.db) throw new Error('PagosPanel.montar: faltan contenedor y opts.db');
    inyectarCSS();
    const db = opts.db;
    const coleccion = opts.coleccion || 'aportes';
    const limite = opts.limite || 200;
    const fTitulo = opts.titulo || (d => d.titulo || d.id);
    const fDetalle = opts.detalle || (() => '');
    const fMonto = opts.monto || (d => d.monto);
    const fPago = opts.pago || (d => d.pago);
    const fIncluir = opts.incluir || (() => true);

    const st = { docs: [], filtro: '', abiertos: new Set(), det: {}, error: '' };

    contenedor.innerHTML = '';
    const raiz = document.createElement('div');
    raiz.className = 'pp';
    contenedor.appendChild(raiz);

    const visibles = () => st.docs.filter(d => !st.filtro || (fPago(d) || {}).estado === st.filtro);

    function filaCSV(d) {
      const p = fPago(d) || {};
      const f = fecha(d.creadoEn);
      return [f ? f.toISOString() : '', d.id, fTitulo(d), fMonto(d), p.estado || '', p.medio || '', p.cuotas || '', p.paymentId || ''];
    }

    function detalleHTML(d) {
      const p = fPago(d) || {};
      const extra = String(fDetalle(d) || '');
      const sub = st.det[d.id];
      let h = '<div class="pp-det">';
      if (extra) h += `<div style="white-space:pre-wrap">${esc(extra)}</div>`;
      h += `<dl><dt>Medio</dt><dd>${esc(p.medio || '—')}</dd><dt>Cuotas</dt><dd>${esc(p.cuotas || '—')}</dd>` +
        `<dt>Payment ID</dt><dd>${esc(p.paymentId || '—')}</dd>` +
        (p.mpStatusDetail ? `<dt>Detalle MP</dt><dd>${esc(p.mpStatusDetail)}</dd>` : '') + '</dl>';
      if (sub === undefined || sub === 'cargando') h += '<p class="pp-vacio">Cargando pagos…</p>';
      else if (sub === 'error') h += '<p class="pp-error">No se pudo leer el detalle de pagos.</p>';
      else if (!sub.length) h += '<p class="pp-vacio">Sin pagos registrados todavía.</p>';
      else h += sub.map(x => `<div class="pp-pago"><dl>` +
        `<dt>Pago</dt><dd>${esc(x.id)} · ${esc(x.status || '')}${x.status_detail ? ' (' + esc(x.status_detail) + ')' : ''}</dd>` +
        `<dt>Cobrado</dt><dd>${pesos(x.transaction_amount)}</dd>` +
        `<dt>Comisión</dt><dd>${pesos(x.fee)}</dd>` +
        `<dt>Neto recibido</dt><dd><b>${pesos(x.net_received_amount)}</b></dd>` +
        `<dt>Cuotas</dt><dd>${esc(x.installments || '—')}</dd>` +
        `<dt>Medio</dt><dd>${esc(x.payment_type_id || '—')}${x.payment_method_id ? ' / ' + esc(x.payment_method_id) : ''}</dd>` +
        `</dl></div>`).join('');
      h += `<p style="margin-top:6px"><a href="${MP_ACTIVIDAD}" target="_blank" rel="noopener noreferrer">Ver en MercadoPago</a></p></div>`;
      return h;
    }

    function render() {
      const lista = visibles();
      const aprobados = st.docs.filter(d => (fPago(d) || {}).estado === 'aprobado');
      const suma = aprobados.reduce((s, d) => s + (Number(fMonto(d)) || 0), 0);
      const opcionesF = '<option value="">Todos los estados</option>' +
        Object.keys(ESTADOS).map(k => `<option value="${k}"${st.filtro === k ? ' selected' : ''}>${esc(ESTADOS[k].txt)}</option>`).join('');
      let h = '';
      if (opts.encabezado) h += `<h2 class="pp-titulo">${esc(opts.encabezado)}</h2>`;
      h += `<div class="pp-barra"><select data-pp="filtro" aria-label="Filtrar por estado">${opcionesF}</select>` +
        `<button type="button" class="pp-btn" data-pp="csv">Exportar CSV</button></div>` +
        `<div class="pp-tot"><span>Total: <b data-pp="n-total">${st.docs.length}</b></span>` +
        `<span>Pagados: <b data-pp="n-aprobados">${aprobados.length}</b></span>` +
        `<span>Suma pagados: <b data-pp="suma">${pesos(suma)}</b></span></div>`;
      if (st.error) h += `<p class="pp-error">${esc(st.error)}</p>`;
      else if (!lista.length) h += '<p class="pp-vacio">No hay registros para mostrar.</p>';
      else h += '<div class="pp-lista">' + lista.map(d => {
        const p = fPago(d) || {};
        const abierto = st.abiertos.has(d.id);
        return `<div class="pp-fila" data-id="${esc(d.id)}"><div class="pp-cab">` +
          `<span class="pp-tit">${esc(fTitulo(d))}</span><span class="pp-monto">${pesos(Number(fMonto(d)))}</span></div>` +
          `<div class="pp-meta">${badge(p)}<span>${esc(fmtFecha(fecha(d.creadoEn)))}</span><span>${esc(d.id)}</span>` +
          `<button type="button" class="pp-link" data-pp="det" aria-expanded="${abierto}">${abierto ? 'Ocultar detalle' : 'Ver detalle'}</button></div>` +
          (abierto ? detalleHTML(d) : '') + '</div>';
      }).join('') + '</div>';
      raiz.innerHTML = h;
    }

    async function cargarDetalle(id) {
      if (st.det[id] && st.det[id] !== 'error') return;
      st.det[id] = 'cargando';
      try {
        const q = await db.collection(coleccion).doc(id).collection('pagos').get();
        st.det[id] = q.docs.map(x => Object.assign({ id: x.id }, x.data()));
      } catch (e) { console.error(e); st.det[id] = 'error'; }
      render();
    }

    function descargarCSV() {
      const csv = '﻿' + generarCSV(visibles().map(filaCSV));
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `pagos-${coleccion}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const onClick = e => {
      const b = e.target.closest('[data-pp]');
      if (!b || !raiz.contains(b)) return;
      if (b.dataset.pp === 'csv') return descargarCSV();
      if (b.dataset.pp === 'det') {
        const id = b.closest('.pp-fila').dataset.id;
        if (st.abiertos.has(id)) st.abiertos.delete(id); else { st.abiertos.add(id); cargarDetalle(id); }
        render();
      }
    };
    const onChange = e => {
      if (e.target.dataset && e.target.dataset.pp === 'filtro') { st.filtro = e.target.value; render(); }
    };
    raiz.addEventListener('click', onClick);
    raiz.addEventListener('change', onChange);

    render();
    const unsub = db.collection(coleccion).orderBy('creadoEn', 'desc').limit(limite).onSnapshot(
      snap => {
        st.error = '';
        st.docs = snap.docs.map(x => Object.assign({ id: x.id }, x.data())).filter(fIncluir);
        render();
      },
      err => {
        console.error(err);
        st.error = err && err.code === 'permission-denied'
          ? 'Tu cuenta no tiene permiso para ver estos pagos.'
          : 'No se pudieron cargar los pagos.';
        render();
      }
    );

    return {
      desmontar() {
        try { unsub(); } catch (_) {}
        raiz.removeEventListener('click', onClick);
        raiz.removeEventListener('change', onChange);
        raiz.remove();
      },
    };
  }

  global.PagosPanel = { montar, badge, csv: generarCSV, ESTADOS };
})(window);
