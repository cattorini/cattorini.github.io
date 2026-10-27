import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';

/* Las animaciones de entrada (GSAP) arrancan con opacity 0. Si algo las corta
   (ej. `transition: all` en CSS peleando con GSAP), el elemento queda invisible
   para siempre. Este test recorre la portada y exige que nada visible quede así. */
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`portada ${vp.width}px: ningún elemento queda invisible tras las animaciones @landing @regresion`, async ({ page }) => {
    await page.setViewportSize(vp);
    await setupPage(page, {});
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof (window as any).gsap !== 'undefined', null, { timeout: 15000 });
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= alto; y += 400) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(150); }
    await page.waitForTimeout(2500);
    const atascados = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => {
      const s = (e.getAttribute('style') || '') + ' ';
      const r = e.getBoundingClientRect();
      return /opacity:\s*0[;\s]/.test(s) && r.width > 0 && r.height > 0;
    }).map(e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + [...e.classList].join('.'))));
    expect(atascados, 'elementos que quedaron invisibles').toEqual([]);
    await expect(page.locator('#hero-cta')).toBeVisible();
    await expect(page.locator('#mayoristas-cta')).toHaveCSS('opacity', '1');
  });
}
