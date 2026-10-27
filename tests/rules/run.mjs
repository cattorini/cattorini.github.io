#!/usr/bin/env node
/**
 * Corre los tests de reglas de Firestore contra el EMULADOR local
 * (nunca contra el proyecto real: el projectId es "demo-*", que el emulador
 * trata como proyecto offline sin credenciales).
 *
 * Uso:
 *   node rules/run.mjs                       → ../firestore.rules (las del repo)
 *   node rules/run.mjs ../firestore.rules    → idem, explícito
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
  /* Default: las reglas del repo (antes se extraían de FIRESTORE-RULES.md) */
  rules = readFileSync(resolve(repoRoot, 'firestore.rules'), 'utf8');
  source = 'firestore.rules';
}

/* firestore.rules del repo lleva el email REAL del staff en isStaff(); los
   tests usan el usuario de prueba (fixtures/test-data.ts → STAFF_EMAIL). */
const EMAIL_REAL_STAFF = 'cattorinilasflores@gmail.com';
const EMAIL_TEST_STAFF = 'staff@cattorini.test';
if (rules.includes(EMAIL_REAL_STAFF)) {
  rules = rules.split(EMAIL_REAL_STAFF).join(EMAIL_TEST_STAFF);
  console.log(`(email real del staff reemplazado por ${EMAIL_TEST_STAFF} solo para el emulador)`);
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

const testCmd = `node --test --test-concurrency=1 --test-reporter=spec "${resolve(here, 'firestore.rules.test.mjs')}" "${resolve(here, 'limites.test.mjs')}"`;
const r = spawnSync(
  'firebase',
  ['emulators:exec', '--project', 'demo-cattorini', '--only', 'firestore',
   '--config', resolve(genDir, 'firebase.json'), testCmd],
  { stdio: 'inherit', env, cwd: genDir }
);
process.exit(r.status ?? 1);
