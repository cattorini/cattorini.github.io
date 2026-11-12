import { expect, Locator } from '@playwright/test';

/*
 * Regla para cualquier ventana emergente (modal, cajón, confirmación):
 *
 *  1. Todo su contenido tiene que poder verse. O entra entera en la pantalla,
 *     o ella misma (o su fondo fijo) tiene scroll propio para llegar al final.
 *     Lo que NO puede pasar: que quede cortada sin forma de ver el resto
 *     (el caso de la confirmación del pedido con el QR, noviembre 2026).
 *  2. Las ventanas cortas de un solo paso (confirmaciones, avisos, QR) tienen
 *     que entrar SIN scroll: con `sinScroll: true` el test exige que no haya.
 *
 * Se mide en pantallas chicas reales (ver PANTALLAS) y en una notebook.
 */
export const PANTALLAS = [
  { nombre: 'Android chico', width: 360, height: 640 },
  { nombre: 'iPhone SE', width: 375, height: 667 },
  { nombre: 'Notebook', width: 1280, height: 720 },
];

export async function medirEnPantalla(caja: Locator) {
  return caja.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const scrollea = (e: Element) => {
      const oy = getComputedStyle(e).overflowY;
      return (oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight + 1;
    };
    /* ¿Algún contenedor (ella misma o un ancestro fijo) permite llegar al final? */
    let conScroll: Element | null = null;
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
      if (scrollea(e)) { conScroll = e; break; }
    }
    const entera = r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1;
    return {
      entera,
      tieneScroll: !!conScroll,
      sobra: Math.max(0, Math.round(r.bottom - vh)),
      desborde: Math.round(el.scrollHeight - el.clientHeight),
      anchoOk: r.left >= -1 && r.right <= vw + 1,
    };
  });
}

export async function expectEnPantalla(caja: Locator, etiqueta: string, { sinScroll = false } = {}) {
  await expect(caja).toBeVisible();
  const m = await medirEnPantalla(caja);
  expect(m.anchoOk, `${etiqueta}: se sale de costado`).toBe(true);
  if (sinScroll) {
    expect(m.entera && m.desborde <= 1, `${etiqueta}: tiene que entrar sin scroll (sobran ${Math.max(m.sobra, m.desborde)} px)`).toBe(true);
  } else {
    expect(m.entera || m.tieneScroll, `${etiqueta}: queda cortada y no tiene scroll (sobran ${m.sobra} px)`).toBe(true);
  }
}
