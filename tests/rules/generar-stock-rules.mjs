#!/usr/bin/env node
/**
 * Genera el bloque repetitivo de validación de `descuento` en ../../firestore.rules
 * (entre `// <generado:descuento>` y `// </generado:descuento>`).
 *
 * Uso:  node rules/generar-stock-rules.mjs            (desde tests/)
 *       node rules/generar-stock-rules.mjs --check    (falla si el bloque está desactualizado)
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Las reglas de Firestore no tienen bucles: para validar cada variante
 * declarada en `descuento: [{talle, color}, ...]` hay que escribir una
 * función por cada tamaño posible de la lista (1..MAX_DESCUENTO) y elegir la
 * correcta según L.size().
 *
 * ── Por qué MAX_DESCUENTO = 12 ──────────────────────────────────────────────
 * Firestore corta la evaluación en 1000 expresiones POR DOCUMENTO escrito.
 * Medido en el emulador (2026-10) sobre un solo stock/{id}, con la
 * validación completa (ver `aporte` abajo): 12 variantes pasan, 13 quedan
 * al borde (fallan en algunas formas de talle/color), 14 fallan. Una
 * formulación ingenua (contar por talle con una lista de talles) daba 11.
 * El presupuesto es por documento: un pedido con varios productos (cada uno
 * con hasta MAX_DESCUENTO variantes) no tiene problema (probado 8 × 12).
 * tests/rules/limites.test.mjs verifica MAX_DESCUENTO (pasa en 3 formas de
 * talle/color) y MAX_DESCUENTO + 1 (rechazado).
 *
 * Si se cambia la validación, volver a correr `npm run test:rules`: si el
 * test de límites falla con "maximum of 1000 expressions", bajar este tope.
 *
 * Tiene que coincidir con MAX_VARIANTES_POR_PRODUCTO de tienda-core.js.
 *
 * TEMPORAL: cuando exista el Worker de pagos (Cloudflare) el descuento de
 * stock pasa al Worker y este tope desaparece.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_DESCUENTO = 12;

const here = dirname(fileURLToPath(import.meta.url));
const RULES = resolve(here, '../../firestore.rules');
const INI = '// <generado:descuento>';
const FIN = '// </generado:descuento>';

function generar(max) {
  const ind = '      ';
  const out = [];
  out.push(`${INI}`);
  out.push(`${ind}/* MAX_DESCUENTO = ${max} — generado por tests/rules/generar-stock-rules.mjs, no editar a mano. */`);
  out.push(`${ind}/* Cada variante declarada e = {talle, color} tiene que: existir antes y`);
  out.push(`${ind}   después, BAJAR (nunca < 0), no cambiar el hex ni agregar campos, y`);
  out.push(`${ind}   tener exactamente las claves {talle, color} (así L.toSet() detecta`);
  out.push(`${ind}   repetidas). Si cumple, aporta 1/|colores cambiados en su talle|; si`);
  out.push(`${ind}   no, aporta -1000 (la suma falla).`);
  out.push(`${ind}   La suma de los aportes da EXACTAMENTE la cantidad de talles cambiados`);
  out.push(`${ind}   (d.diff(a).affectedKeys().size()) solo si (1) en cada talle declarado`);
  out.push(`${ind}   cambiaron únicamente los colores declarados y (2) no cambió ningún`);
  out.push(`${ind}   talle no declarado. Si cambia algo de más, la suma queda al menos`);
  out.push(`${ind}   1/(MAX+1) por debajo → la tolerancia 0.01 lo rechaza. Es la forma más`);
  out.push(`${ind}   barata (en expresiones evaluadas) de expresar "solo cambia lo declarado". */`);
  out.push(`${ind}function aporte(a, d, e) {`);
  out.push(`${ind}  let t = e.talle;`);
  out.push(`${ind}  let dt = d[t];`);
  out.push(`${ind}  let at = a[t];`);
  out.push(`${ind}  let n = dt[e.color];`);
  out.push(`${ind}  let v = at[e.color];`);
  out.push(`${ind}  return (e.size() == 2`);
  out.push(`${ind}      && n.cantidad >= 0 && n.cantidad < v.cantidad`);
  out.push(`${ind}      && n == {'cantidad': n.cantidad, 'hex': v.hex})`);
  out.push(`${ind}    ? 1.0 / dt.diff(at).affectedKeys().size()`);
  out.push(`${ind}    : -1000.0;`);
  out.push(`${ind}}`);
  for (let k = 1; k <= max; k++) {
    const suma = Array.from({ length: k }, (_, i) => `aporte(a, d, L[${i}])`).join(' + ');
    out.push(`${ind}function descuento${k}(a, d, L) { return ${suma} > d.diff(a).affectedKeys().size() - 0.01; }`);
  }
  /* despacho binario por tamaño (pocas comparaciones evaluadas) */
  const disp = (lo, hi) => {
    if (lo === hi) return `descuento${lo}(a, d, L)`;
    const mid = (lo + hi) >> 1;
    return `(L.size() <= ${mid} ? ${disp(lo, mid)} : ${disp(mid + 1, hi)})`;
  };
  out.push(`${ind}function descuentoOk(a, d, L) {`);
  out.push(`${ind}  return L.size() <= ${max} && ${disp(1, max)};`);
  out.push(`${ind}}`);
  out.push(`${ind}${FIN}`);
  return out.join('\n');
}

const src = readFileSync(RULES, 'utf8');
const i = src.indexOf(INI);
const j = src.indexOf(FIN);
if (i < 0 || j < 0 || j < i) {
  console.error(`No encontré los marcadores ${INI} / ${FIN} en ${RULES}`);
  process.exit(2);
}
const nuevo = src.slice(0, i) + generar(MAX_DESCUENTO) + src.slice(j + FIN.length);
if (process.argv.includes('--check')) {
  if (nuevo !== src) { console.error('firestore.rules desactualizado: correr node rules/generar-stock-rules.mjs'); process.exit(1); }
  console.log(`firestore.rules al día (MAX_DESCUENTO = ${MAX_DESCUENTO})`);
} else {
  writeFileSync(RULES, nuevo);
  console.log(`firestore.rules: bloque de descuento generado (MAX_DESCUENTO = ${MAX_DESCUENTO})`);
}
