#!/usr/bin/env node
/**
 * Checkout REAL (tienda-core.js) contra el EMULADOR de Firestore con las
 * reglas del repo. Nunca toca el proyecto real (projectId demo-*).
 *
 *   node emulador/run.mjs                 → ../firestore.rules
 *   node emulador/run.mjs <archivo.rules> → otras reglas
 *
 * Usa otro puerto (8091) que rules/run.mjs (8089) para poder correr en paralelo.
 * Requiere Java 11+ y firebase-tools. macOS: PATH=/opt/homebrew/opt/openjdk/bin:$PATH
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const genDir = resolve(here, '.generated');
mkdirSync(genDir, { recursive: true });

const src = resolve(process.cwd(), process.argv[2] || resolve(repoRoot, 'firestore.rules'));
if (!existsSync(src)) { console.error('No existe ' + src); process.exit(2); }
writeFileSync(resolve(genDir, 'firestore.rules'), readFileSync(src, 'utf8'));
const port = Number(process.env.CATT_CHECKOUT_EMULATOR_PORT || 8091);
writeFileSync(resolve(genDir, 'firebase.json'), JSON.stringify({
  firestore: { rules: 'firestore.rules' },
  emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false }, singleProjectMode: true }
}, null, 2));
console.log('\n▶ Checkout contra reglas: ' + src + '\n');
const env = { ...process.env, CATT_RULES_PATH: resolve(genDir, 'firestore.rules'), PATH: `/opt/homebrew/opt/openjdk/bin:${process.env.PATH}` };
const r = spawnSync('firebase', ['emulators:exec', '--project', 'demo-cattorini-checkout', '--only', 'firestore',
  '--config', resolve(genDir, 'firebase.json'),
  `node --test --test-reporter=spec "${resolve(here, 'checkout.test.mjs')}"`], { stdio: 'inherit', env, cwd: genDir });
process.exit(r.status ?? 1);
