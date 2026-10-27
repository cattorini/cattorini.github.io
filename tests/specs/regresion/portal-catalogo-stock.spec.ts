/**
 * REGRESIÓN (deben pasar hoy y después de los arreglos de seguridad).
 * Flujos del portal que NO se pueden romper: alta de producto con guía de
 * talles, carga de stock por talle/color, ajuste de stock, purga de stock al
 * cambiar de guía, y publicación de productos.json sin tocar lo demás.
 */
import { test, expect } from '@playwright/test';
import { setupPage, getCollection, getGithubPuts, getFirebaseBackendRequests, catalogoFixture } from '../../helpers/setup';
import { entrarAlPortal, filaProducto } from '../../helpers/portal';

test.describe('Portal — catálogo y stock @regresion @portal', () => {

  test('alta de producto: guía de talles + talle + color con stock inicial + publicar @regresion', async ({ page }) => {
    await setupPage(page, { firebase: { collections: { stock: {} } } });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('catalogo');

    /* + Producto en Camisas → nace con id 9 (meta.next_product_id del fixture) */
    const catCamisas = page.locator('#cat-list > .item-row', { has: page.locator('.serif', { hasText: /^Camisas$/ }) });
    await catCamisas.getByRole('button', { name: '+ Producto' }).click();
    const fila = filaProducto(page, 9);
    await expect(fila).toBeVisible();

    const inputs = fila.locator('.grid-2 input');
    await inputs.nth(0).fill('Camisa Test Regresión');
    await inputs.nth(1).fill('25000');
    await inputs.nth(2).fill('16000');

    /* Guía de talles por producto */
    await fila.locator('select.inp').selectOption('camisas');
    const filaAct = filaProducto(page, 9);
    await filaAct.locator('.talle-chip', { hasText: /^M$/ }).click();
    await expect(filaAct.locator('.talle-chip.on')).toHaveText(['M']);

    /* Colores y stock inicial (Firestore) */
    const bloqueM = filaAct.locator('.item-row', { hasText: 'Talle M' });
    await expect(bloqueM).toBeVisible();
    await bloqueM.getByPlaceholder('Nombre del color (ej: Rojo)').fill('Negro');
    await bloqueM.getByPlaceholder('Stock inicial').fill('5');
    await bloqueM.getByRole('button', { name: '+ Agregar color' }).click();

    await expect.poll(async () => (await getCollection(page, 'stock'))['9']?.variantes?.M?.Negro?.cantidad).toBe(5);
    const movs = Object.values(await getCollection(page, 'stock/9/movimientos')) as any[];
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ talle: 'M', color: 'Negro', delta: 5, motivo: 'Alta inicial' });

    /* Publicar */
    await portal.publishBtn.click();
    await expect(portal.saveStatus).toHaveText(/Publicado/, { timeout: 10_000 });
    const put = getGithubPuts(page).find(p => p.path === 'productos.json');
    expect(put).toBeTruthy();
    const publicado = JSON.parse(Buffer.from(put!.body.content, 'base64').toString('utf8'));
    const original = catalogoFixture();

    const nuevo = publicado.categorias.find((c: any) => c.id === 'camisas').productos.find((p: any) => p.id === 9);
    expect(nuevo).toMatchObject({
      id: 9, nombre: 'Camisa Test Regresión', precio_minorista: 25000, precio_mayorista: 16000,
      tipo_talle: 'camisas', talles_disponibles: ['M'], disponible: true
    });
    expect(publicado.meta.next_product_id).toBe(10);
    /* Nada más cambió: guía de talles y productos existentes intactos */
    expect(publicado.guia_talles).toEqual(original.guia_talles);
    for (const cat of original.categorias) {
      const pubCat = publicado.categorias.find((c: any) => c.id === cat.id);
      for (const p of cat.productos) {
        expect(pubCat.productos.find((x: any) => x.id === p.id)).toEqual(p);
      }
    }
    expect(getFirebaseBackendRequests(page)).toEqual([]);
  });

  test('tab Stock: ajustar cantidad de un color registra el movimiento @regresion', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { stock: { '1': { variantes: { M: { Blanco: { cantidad: 3, hex: '#ffffff' } } } } } } }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('stock');
    await portal.abrirSubtab('stock-editar');
    await page.locator('#stock-list .expandable-head-box', { hasText: '#1 · Camisa Oxford Blanca' }).click();

    const fila = page.locator('#stock-list tr', { hasText: 'Blanco' });
    const qty = fila.locator('input[type="number"]');
    await expect(qty).toHaveValue('3');
    await qty.fill('7');   /* fill dispara input + change, como tipear y salir del campo */
    await qty.blur();

    await expect.poll(async () => (await getCollection(page, 'stock'))['1'].variantes.M.Blanco.cantidad).toBe(7);
    const movs = Object.values(await getCollection(page, 'stock/1/movimientos')) as any[];
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ talle: 'M', color: 'Blanco', delta: 4, cantidadResultante: 7, motivo: 'Ingreso manual' });
  });

  test('tab Stock: no permite dejar stock negativo @regresion', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { stock: { '1': { variantes: { M: { Blanco: { cantidad: 2, hex: '#ffffff' } } } } } } }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('stock');
    await portal.abrirSubtab('stock-import');
    await page.locator('#stock-csv-input').fill('1,M,Blanco,-5,Prueba');
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    await expect(page.locator('#stock-import-status')).toContainText(/Stock insuficiente/);
    expect((await getCollection(page, 'stock'))['1'].variantes.M.Blanco.cantidad).toBe(2);
  });

  test('cambiar la guía de talles purga talles que ya no existen y su stock @regresion', async ({ page }) => {
    await setupPage(page, {
      firebase: { collections: { stock: { '4': { variantes: { '38': { Negro: { cantidad: 2, hex: '#000000' } } } } } } }
    });
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('catalogo');
    const fila = filaProducto(page, 4);
    await fila.locator('.expandable-head').click();
    await filaProducto(page, 4).locator('select.inp').selectOption('camisas');

    await expect.poll(async () => (await getCollection(page, 'stock'))['4'].variantes['38']).toBeUndefined();
    const movs = Object.values(await getCollection(page, 'stock/4/movimientos')) as any[];
    expect(movs.some(m => m.talle === '38' && m.delta === -2)).toBe(true);
  });

  test('guía de talles con comillas en el nombre (Jeans Catto"s) se edita y publica sin romperse @regresion', async ({ page }) => {
    await setupPage(page);
    const portal = await entrarAlPortal(page);
    await portal.abrirTab('catalogo');
    const fila = filaProducto(page, 7);
    await fila.locator('.expandable-head').click();
    const sel = filaProducto(page, 7).locator('select.inp');
    await expect(sel).toHaveValue('Jeans Catto"s');
    await expect(filaProducto(page, 7).locator('.talle-chip.on')).toHaveCount(6);
  });
});
