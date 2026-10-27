/**
 * Chequeos sobre el productos.json REAL (datos cargados por el cliente).
 * NO modifica nada: solo reporta inconsistencias que el cliente tiene que
 * corregir desde el portal, más un chequeo de seguridad (hash master).
 * Correr con `npm run test:datos`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const data = JSON.parse(readFileSync(resolve(root, 'productos.json'), 'utf8'));
const productos = data.categorias.flatMap(c => (c.productos || []).map(p => ({ ...p, _cat: c })));

describe('productos.json real — datos', () => {
  test('ningún producto disponible tiene precio minorista 0', () => {
    const malos = productos.filter(p => p.disponible !== false && !(p.precio_minorista > 0));
    assert.deepEqual(malos.map(p => `#${p.id} ${p.nombre}`), []);
  });

  test('precio mayorista coherente (> 0 y >= 10% del minorista) en productos de fabricación propia', () => {
    const malos = productos.filter(p => p.disponible !== false && p.fabricacion_propia !== false
      && p.precio_minorista > 0 && !(p.precio_mayorista >= p.precio_minorista * 0.1));
    assert.deepEqual(malos.map(p => `#${p.id} ${p.nombre}: may ${p.precio_mayorista} / min ${p.precio_minorista}`), []);
  });

  test('cada producto tiene una guía de talles existente y sus talles están en la guía', () => {
    const malos = [];
    for (const p of productos) {
      const tt = p.tipo_talle !== undefined ? p.tipo_talle : p._cat.tipo_talle;
      const g = data.guia_talles[tt];
      if (!g) { malos.push(`#${p.id}: guía "${tt}" no existe`); continue; }
      const fuera = (p.talles_disponibles || []).filter(t => !(t in g.tabla));
      if (fuera.length) malos.push(`#${p.id}: talles fuera de la guía ${fuera.join(',')}`);
    }
    assert.deepEqual(malos, []);
  });

  test('IDs de producto únicos y menores a meta.next_product_id', () => {
    const ids = productos.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(Math.max(...ids) < data.meta.next_product_id);
  });
});

describe('productos.json real — seguridad', () => {
  test('no publica el hash del código master mayorista (SHA-256 sin sal de un código corto = se rompe offline)', () => {
    assert.ok(!data?.config?.mayoristas?.codigo_hash,
      'config.mayoristas.codigo_hash es público y además sirve como "llave" en validarPerfilPersistido()');
  });
});
