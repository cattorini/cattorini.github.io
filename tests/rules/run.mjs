#!/usr/bin/env node
/**
 * Corre los tests de reglas de Firestore contra el EMULADOR local
 * (nunca contra el proyecto real: el projectId es "demo-*", que el emulador
 * trata como proyecto offline sin credenciales).
 *
 * Uso:
 *   node rules/run.mjs                       → reglas ACTUALES, extraídas del
 *                                              bloque ```javascript de ../FIRESTORE-RULES.md
 *   node rules/run.mjs ../firestore.rules    → un archivo de reglas nuevo
 *   node rules/run.mjs rules/reference/firestore.rules.objetivo
 *                                            → la referencia del modelo objetivo
 *
 * Requiere Java 11+ y firebase-tools (`firebase` en el PATH).
 * En macOS con Homebrew: PATH=/opt/homebrew/opt/openjdk/bin:$PATH
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const testsRoot = resolve(here, '..');
const repoRoot = resolve(testsRoot, '..');
const genDir = resolve(here, '.generated');
mkdirSync(genDir, { recursive: true });

const arg = process.argv[2] || process.env.RULES_FILE;
let rules;
let source;
if (arg) {
  const p = resolve(process.cwd(), arg);
  if (!existsSync(p)) {
    console.error(`No existe el archivo de reglas: ${p}`);
    process.exit(2);
  }
  rules = readFileSync(p, 'utf8');
  source = relative(repoRoot, p);
} else {
  const md = readFileSync(resolve(repoRoot, 'FIRESTORE-RULES.md'), 'utf8');
  const m = md.match(/```(?:javascript|js)?\s*\n(rules_version[\s\S]*?)```/);
  if (!m) {
    console.error('No encontré el bloque de reglas (```javascript rules_version ...) en FIRESTORE-RULES.md');
    process.exit(2);
  }
  rules = m[1];
  source = 'FIRESTORE-RULES.md (bloque extraído)';
}

const rulesPath = resolve(genDir, 'firestore.rules');
writeFileSync(rulesPath, rules);

const port = Number(process.env.CATT_RULES_EMULATOR_PORT || 8089);
const firebaseJson = {
  firestore: { rules: 'firestore.rules' },
  emulators: {
    firestore: { host: '127.0.0.1', port },
    ui: { enabled: false },
    singleProjectMode: true
  }
};
writeFileSync(resolve(genDir, 'firebase.json'), JSON.stringify(firebaseJson, null, 2));

console.log(`\n▶ Reglas bajo test: ${source}\n`);

const env = {
  ...process.env,
  CATT_RULES_PATH: rulesPath,
  PATH: `/opt/homebrew/opt/openjdk/bin:${process.env.PATH}`
};

const testCmd = `node --test --test-reporter=spec "${resolve(here, 'firestore.rules.test.mjs')}"`;
const r = spawnSync(
  'firebase',
  ['emulators:exec', '--project', 'demo-cattorini', '--only', 'firestore',
   '--config', resolve(genDir, 'firebase.json'), testCmd],
  { stdio: 'inherit', env, cwd: genDir }
);
process.exit(r.status ?? 1);
