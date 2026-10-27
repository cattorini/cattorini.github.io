/* legal.js — páginas legales (privacidad, términos, arrepentimiento).
 * Archivo externo (sin scripts inline) para que la CSP de estas páginas no
 * necesite 'unsafe-inline'.
 *
 *  - Completa los valores vigentes que vienen de productos.json (mínimo
 *    mayorista, costo de envío, envío gratis, transportistas, WhatsApp) en
 *    los elementos con data-cfg="...". Si no carga, queda el texto genérico.
 *  - Botón de arrepentimiento (Res. 424/2020): genera un código de trámite y
 *    arma un mensaje de WhatsApp prellenado con el código de pedido.
 */
(function () {
  'use strict';

  const fmt = n => (typeof n === 'number' && isFinite(n)) ? '$' + n.toLocaleString('es-AR') : null;
  let DATA = null;
  let cfgPromise = null;

  function setCfg(key, value) {
    if (value === null || value === undefined || value === '') return;
    document.querySelectorAll('[data-cfg="' + key + '"]').forEach(el => { el.textContent = value; });
  }

  async function cargarConfig() {
    try {
      const r = await fetch('./productos.json', { cache: 'no-cache' });
      if (!r.ok) return;
      DATA = await r.json();
    } catch (e) { return; }
    const c = (DATA && DATA.config) || {};
    const env = c.envio || {};
    const may = c.mayoristas || {};
    setCfg('minimo-mayorista', fmt(may.minimo_compra));
    setCfg('envio-costo', fmt(env.costo_estandar));
    setCfg('envio-gratis', fmt(env.gratis_desde));
    setCfg('transportista', env.transportista);
    const neg = (DATA && DATA.negocio) || {};
    setCfg('telefono', neg.telefono);
    setCfg('direccion-local', neg.direccion);
    if (neg.whatsapp) setCfg('whatsapp', '+' + String(neg.whatsapp).replace(/[^0-9]/g, ''));
  }

  /* ---------------- Arrepentimiento ---------------- */
  const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function genCodigo(n) {
    const out = [];
    while (out.length < n) {
      const buf = new Uint8Array(n * 2);
      crypto.getRandomValues(buf);
      for (let i = 0; i < buf.length && out.length < n; i++) {
        if (buf[i] < 248) out.push(ALFABETO[buf[i] % ALFABETO.length]);
      }
    }
    return out.join('');
  }
  const limpiar = (s, max) => String(s || '').replace(/[<>]/g, '').trim().slice(0, max);

  function initArrepentimiento() {
    const form = document.getElementById('arr-form');
    if (!form) return;
    const params = new URLSearchParams(location.search);
    const pre = (params.get('pedido') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
    if (pre) document.getElementById('arr-pedido').value = pre;

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = document.getElementById('arr-err');
      err.classList.remove('show');
      const pedido = limpiar(document.getElementById('arr-pedido').value, 24).toUpperCase().replace(/[\s#]/g, '');
      const nombre = limpiar(document.getElementById('arr-nombre').value, 80);
      const contacto = limpiar(document.getElementById('arr-contacto').value, 80);
      const motivo = limpiar(document.getElementById('arr-motivo').value, 400);
      if (!pedido || !/^[A-Z0-9]{5,20}$/.test(pedido)) {
        err.textContent = 'Ingresá el código de tu pedido (lo encontrás en la confirmación o en "Mis pedidos").';
        err.classList.add('show'); return;
      }
      if (!nombre) { err.textContent = 'Ingresá tu nombre y apellido.'; err.classList.add('show'); return; }
      if (!contacto) { err.textContent = 'Ingresá un teléfono, WhatsApp o email para responderte.'; err.classList.add('show'); return; }

      const tramite = 'ARR-' + genCodigo(10);
      const fecha = new Date().toLocaleString('es-AR');
      const texto = [
        'Solicitud de REVOCACIÓN de compra (botón de arrepentimiento, art. 34 Ley 24.240 / Res. 424/2020)',
        'Código de trámite: ' + tramite,
        'Pedido: #' + pedido,
        'Nombre: ' + nombre,
        'Contacto: ' + contacto,
        motivo ? 'Comentario: ' + motivo : '',
        'Fecha: ' + fecha
      ].filter(Boolean).join('\n');

      try {
        const arr = JSON.parse(localStorage.getItem('catt_arrepentimientos') || '[]');
        arr.unshift({ tramite, pedido, ts: Date.now() });
        localStorage.setItem('catt_arrepentimientos', JSON.stringify(arr.slice(0, 10)));
      } catch (e) { /* sin storage: no pasa nada */ }

      if (cfgPromise) await cfgPromise;
      const wa = String((DATA && DATA.negocio && DATA.negocio.whatsapp) || '').replace(/[^0-9]/g, '');
      const waBtn = document.getElementById('arr-wa');
      if (wa) {
        waBtn.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(texto);
        waBtn.classList.remove('lg-hidden');
      } else {
        waBtn.classList.add('lg-hidden');
      }
      document.getElementById('arr-codigo').textContent = tramite;
      document.getElementById('arr-texto').textContent = texto;
      form.classList.add('lg-hidden');
      const ok = document.getElementById('arr-ok');
      ok.classList.remove('lg-hidden');
      ok.focus();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const y = document.getElementById('lg-year');
    if (y) y.textContent = new Date().getFullYear();
    cfgPromise = cargarConfig();
    initArrepentimiento();
    await cfgPromise;
  });
})();
