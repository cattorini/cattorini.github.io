/* Componente reutilizable: dropdown provincia + autocomplete localidad
   Depende de localidades-ar.json (misma carpeta) */
(function(){
  'use strict';

  let AR = null;
  let loading = null;

  async function loadAR() {
    if (AR) return AR;
    if (loading) return loading;
    loading = fetch('./localidades-ar.json', { cache: 'force-cache' })
      .then(r => r.json())
      .then(d => { AR = d; return d; })
      .catch(() => null);
    return loading;
  }

  function normalizar(str) {
    return String(str || '').toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* Escape XSS-safe */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  /* Inicializa un par de inputs (provincia select + localidad autocomplete)
     opts: {
       provinciaSelect: <select|HTMLElement>,
       localidadInput: <input>,
       localidadList: <div> // contenedor para dropdown sugerencias
       onChange: function(prov, loc)
     } */
  async function initUbicacion(opts) {
    const data = await loadAR();
    const provSel = opts.provinciaSelect;
    const locInp = opts.localidadInput;
    const locList = opts.localidadList;

    if (!data) {
      /* Fallback: input libre */
      provSel.style.display = 'none';
      const fallback = document.createElement('input');
      fallback.type = 'text';
      fallback.placeholder = 'Provincia';
      fallback.className = provSel.className;
      fallback.maxLength = 40;
      provSel.parentNode.insertBefore(fallback, provSel);
      fallback.oninput = () => opts.onChange && opts.onChange(fallback.value, locInp.value);
      locInp.oninput = () => opts.onChange && opts.onChange(fallback.value, locInp.value);
      return { ok: false };
    }

    /* Provincia dropdown */
    provSel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = 'Elegí tu provincia...';
    provSel.appendChild(opt0);
    data.provincias.forEach(p => {
      const o = document.createElement('option');
      o.value = p; o.textContent = p;
      provSel.appendChild(o);
    });

    provSel.onchange = () => {
      locInp.value = '';
      if (locList) locList.style.display = 'none';
      locInp.disabled = !provSel.value;
      locInp.placeholder = provSel.value
        ? `Buscá tu localidad en ${provSel.value}...`
        : 'Elegí primero la provincia';
      opts.onChange && opts.onChange(provSel.value, '');
    };

    locInp.disabled = !provSel.value;
    locInp.placeholder = provSel.value
      ? `Buscá tu localidad en ${provSel.value}...`
      : 'Elegí primero la provincia';
    locInp.autocomplete = 'off';

    let debounceT = null;
    let highlighted = -1;
    let currentMatches = [];

    function renderMatches(matches) {
      if (!locList) return;
      currentMatches = matches;
      highlighted = -1;
      locList.innerHTML = '';
      if (!matches.length) {
        locList.style.display = 'none';
        return;
      }
      matches.forEach((m, i) => {
        const item = document.createElement('div');
        item.className = 'loc-item';
        item.textContent = m;
        item.onmousedown = (e) => {
          e.preventDefault();
          locInp.value = m;
          locList.style.display = 'none';
          opts.onChange && opts.onChange(provSel.value, m);
        };
        item.onmouseenter = () => {
          highlighted = i;
          updateHighlight();
        };
        locList.appendChild(item);
      });
      locList.style.display = 'block';
    }

    function updateHighlight() {
      if (!locList) return;
      [...locList.children].forEach((el, i) => {
        el.classList.toggle('highlighted', i === highlighted);
      });
    }

    function search(q) {
      const prov = provSel.value;
      if (!prov) return;
      const locs = data.localidades[prov] || [];
      if (!q) {
        renderMatches(locs.slice(0, 8));
        return;
      }
      const nq = normalizar(q);
      const exact = [];
      const starts = [];
      const contains = [];
      locs.forEach(l => {
        const nl = normalizar(l);
        if (nl === nq) exact.push(l);
        else if (nl.startsWith(nq)) starts.push(l);
        else if (nl.includes(nq)) contains.push(l);
      });
      renderMatches([...exact, ...starts, ...contains].slice(0, 15));
    }

    locInp.oninput = () => {
      clearTimeout(debounceT);
      debounceT = setTimeout(() => search(locInp.value), 80);
      opts.onChange && opts.onChange(provSel.value, locInp.value);
    };

    locInp.onfocus = () => {
      if (provSel.value) search(locInp.value);
    };

    locInp.onblur = () => {
      setTimeout(() => {
        if (locList) locList.style.display = 'none';
      }, 200);
    };

    locInp.onkeydown = (e) => {
      if (!locList || locList.style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlighted = Math.min(highlighted + 1, currentMatches.length - 1);
        updateHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlighted = Math.max(highlighted - 1, 0);
        updateHighlight();
      } else if (e.key === 'Enter' && highlighted >= 0) {
        e.preventDefault();
        locInp.value = currentMatches[highlighted];
        locList.style.display = 'none';
        opts.onChange && opts.onChange(provSel.value, locInp.value);
      } else if (e.key === 'Escape') {
        locList.style.display = 'none';
      }
    };

    return { ok: true, data };
  }

  /* Verifica si prov+loc matchea alguna zona hardcoded (para gate mayoristas) */
  async function matchZona(provincia, localidad, zonas) {
    if (!provincia || !localidad || !zonas) return null;
    return (zonas || []).find(z => {
      if (normalizar(z.provincia) !== normalizar(provincia)) return false;
      return (z.localidades || []).some(l => normalizar(l) === normalizar(localidad));
    }) || null;
  }

  /* Verifica que una localidad exista en la provincia */
  async function esLocalidadValida(provincia, localidad) {
    const data = await loadAR();
    if (!data) return true; // fallback: aceptar todo
    const locs = data.localidades[provincia] || [];
    return locs.some(l => normalizar(l) === normalizar(localidad));
  }

  /* Estilos por defecto para el dropdown de sugerencias */
  const CSS = `
    .loc-list {
      position: absolute; z-index: 200;
      background: #FFF; border: 1px solid #E5E5E5;
      max-height: 220px; overflow-y: auto;
      width: 100%;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.08);
    }
    .loc-item {
      padding: 10px 14px; font-size: 0.88rem;
      cursor: pointer; border-bottom: 1px solid #F5F5F5;
    }
    .loc-item:last-child { border-bottom: none; }
    .loc-item.highlighted, .loc-item:hover {
      background: #0A0A0A; color: #FFF;
    }
    .loc-wrap { position: relative; }
  `;

  function injectStyles() {
    if (document.getElementById('ubicaciones-css')) return;
    const st = document.createElement('style');
    st.id = 'ubicaciones-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  injectStyles();

  /* Exponer API */
  window.Ubicaciones = {
    init: initUbicacion,
    load: loadAR,
    normalize: normalizar,
    matchZona,
    esLocalidadValida
  };
})();
