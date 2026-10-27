# Tests Cattorini

Suite de tests E2E con Playwright + TypeScript + Page Object Model.

## Setup (una sola vez)

```bash
cd tests                   # en este repo (cattorini.github.io) la suite vive en tests/
npm install
npm run install:browsers   # instala Chromium
```

Requiere Node ≥ 18 y Python 3 (para servir los HTML localmente).
Para los tests de reglas: Java 11+ y `firebase-tools` (`firebase` en el PATH).
En macOS con Homebrew: `export PATH=/opt/homebrew/opt/openjdk/bin:$PATH`.

El servidor de tests usa el puerto **4319** (variable `CATT_TEST_PORT`). Antes
usaba 4173 con `reuseExistingServer`, y si había OTRO `http.server` en ese
puerto (p.ej. el de otro proyecto local) los tests corrían contra otro sitio.

## Suites (auditoría 2026-10)

| Script | Qué corre | Estado esperado HOY |
|---|---|---|
| `npm run test:existente` | Suite E2E original (85 tests) | pasa |
| `npm run test:regresion` | Flujos críticos que NO se pueden romper: alta de producto + guía de talles + stock por talle/color, checkout minorista/mayorista con descuento de stock, alta/aprobación/validación de mayoristas, aislamiento de red | pasa (hoy y después del arreglo) |
| `npm run test:seguridad` | E2E que expresan el comportamiento seguro (XSS, acceso de staff, seguimiento por get, checkout atómico, códigos, legal) | **falla hoy** — tiene que pasar después del arreglo |
| `npm run test:rules` | `../firestore.rules` (las reglas del repo, con el email real del staff reemplazado por `STAFF_EMAIL`) contra el emulador: modelo de seguridad + límites (`rules/limites.test.mjs`) | pasa |
| `npm run test:rules -- otro.rules` | Las mismas pruebas contra otro archivo de reglas | — |
| `npm run test:rules:objetivo` | Las pruebas contra `rules/reference/firestore.rules.objetivo` (prueba de que el modelo objetivo es expresable) | pasa |
| `npm run test:unit` | `sw.js` en Node (caché de imágenes reemplazables y del HTML) | **falla hoy** |
| `npm run test:datos` | Chequeos sobre el `productos.json` REAL (precios en 0, mayorista absurdo, guía de talles, hash master público) | **falla hoy** (datos a corregir por el cliente) |

### Aislamiento (cliente real en producción)

- Nunca se usa el proyecto Firebase real: el SDK de gstatic se reemplaza por
  un mock (`fixtures/firebase-mock.ts`) y todo request a `*.googleapis.com`,
  `*.firebaseapp.com`, `*.firebaseio.com` se aborta y se registra
  (`getFirebaseBackendRequests(page)` tiene que dar `[]`).
- La API de GitHub (`api.github.com`, la que usa el portal para publicar) se
  mockea en memoria (`getGithubPuts(page)`): ningún test publica nada.
- Las reglas se prueban SOLO contra el emulador con projectId `demo-cattorini`.
- Los tests usan `fixtures/productos.fixture.json` (catálogo sintético) y no
  el `productos.json` real, que el cliente edita a diario. Con
  `setupPage(page, { catalogo: 'real' })` se usa el real.
- **Nunca poner códigos, PAT ni contraseñas reales en `tests/`**: la carpeta
  se publica en GitHub Pages junto con el sitio.

### Login de staff (Firebase Auth email/contraseña)

`portal.html` y `pedidos.html` exigen la sesión de staff de Firebase para todo
lo que toca Firestore (ya no hay login anónimo ni el atajo
`sessionStorage catt_pedidos_session`). Usuario de prueba: `STAFF_EMAIL` /
`STAFF_PASS` en `fixtures/test-data.ts` (solo existe en el mock). Helpers:
`helpers/portal.ts → entrarAlPortal()` (PAT + sesión de staff),
`entrarAPedidos()` y `loginStaff()`. La opción `portalSession` de
`setupPage` ya no da acceso a nada (queda para probar que no lo da).

### Reglas: bloque generado y tope de variantes

El bloque `<generado:descuento>` de `firestore.rules` lo escribe
`node rules/generar-stock-rules.mjs` (y `--check` verifica que esté al día).
Firestore corta en 1000 expresiones evaluadas por documento: con la validación
completa del descuento público entran **12 variantes (talle/color) de un mismo
producto por pedido** (`MAX_DESCUENTO`, tiene que coincidir con
`MAX_VARIANTES_POR_PRODUCTO` de `tienda-core.js`). Varios productos por pedido
no tienen problema (el presupuesto es por documento). Los pedidos manuales del
staff no tienen tope. **Temporal:** cuando exista el Worker de pagos
(Cloudflare), el descuento de stock pasa al Worker y se levanta el tope.

## Correr tests

```bash
npm test                    # todos los tests (~1 min)
npm run test:smoke          # solo críticos (~15s)
npm run test:landing        # solo landing
npm run test:tienda         # solo tienda
npm run test:portal         # solo portal
npm run test:pedidos        # solo cola de pedidos
npm run test:seguimiento    # solo seguimiento
npm run test:checkout       # solo flujos de checkout
npm run test:mayorista      # solo flujos mayoristas
npm run test:minorista      # solo flujos minoristas
npm run test:critical       # solo casos marcados @critical

npm run test:headed         # con browser visible (debug visual)
npm run test:ui             # modo UI interactivo
npm run test:debug          # modo debug de Playwright
```

También podés filtrar por tag directamente:

```bash
npx playwright test --grep "@tienda|@mayorista"
npx playwright test specs/tienda/checkout-minorista.spec.ts
```

## Ver reportes

Después de correr los tests:

```bash
npm run report               # abre el HTML report
npx playwright show-trace test-results/…/trace.zip
```

## Estructura

```
tests/
├── playwright.config.ts   # config general
├── fixtures/              # data y mocks
│   ├── firebase-mock.ts   # mock de firebase.firestore / auth
│   └── test-data.ts       # productos, mayoristas, pedidos de prueba
├── helpers/               # helpers reutilizables
│   └── setup.ts           # inicialización de página con mock + localStorage
├── pages/                 # Page Object Model
│   ├── landing.page.ts
│   ├── tienda.page.ts
│   ├── producto.page.ts
│   ├── carrito.component.ts
│   ├── seguimiento.page.ts
│   ├── seguimiento-mayorista.page.ts
│   ├── portal.page.ts
│   └── pedidos.page.ts
└── specs/
    ├── smoke/             # críticos, corren siempre
    ├── landing/
    ├── tienda/
    ├── seguimiento/
    ├── portal/
    └── pedidos/
```

## Cómo funcionan (arquitectura)

- **Servidor**: Playwright levanta `python3 -m http.server 4319` sirviendo la raíz del repo
- **Firebase**: cada test inyecta un mock de `firebase.firestore()` y `firebase.auth()` ANTES de que la página cargue el SDK real. El mock:
  - Guarda colecciones y docs en memoria por test
  - Permite `add()`, `set()`, `update()`, `delete()`, `get()`, `onSnapshot()`, `where()`, `orderBy()`, `limit()`
  - Soporta `firebase.firestore.FieldValue.serverTimestamp()`
  - Expone `window.__firebaseMock` para setear datos desde tests
- **Estado inicial**: `setupPage()` acepta opciones para pre-configurar `localStorage`/`sessionStorage` (perfil de usuario, carrito, sesión de portal, etc.)

## Tags disponibles

Usá cualquier combinación para filtrar:

- `@smoke` — críticos, deben pasar siempre
- `@critical` — tests que si fallan bloquean deploy
- `@landing` — landing page
- `@tienda` — tienda
- `@producto` — detalle de producto
- `@carrito` — carrito
- `@checkout` — checkout completo
- `@ident` — identificación en el gate
- `@catalog` — catálogo y filtros
- `@seguimiento` — páginas de seguimiento
- `@pedido` — pedidos (cliente)
- `@portal` — portal admin
- `@pedidos` — cola de pedidos
- `@manual` — pedido manual desde portal
- `@mayorista` — flows específicos mayoristas
- `@minorista` — flows específicos minoristas
- `@anti-fraude` — validaciones de zonas

## Agregar un test nuevo

1. **Identificá el área**: `landing`, `tienda`, `seguimiento`, `portal`, `pedidos`
2. **Elegí o creá el spec**: en `specs/<area>/` — un archivo por feature
3. **Usá el POM correspondiente** (`pages/<area>.page.ts`) — no accedas al DOM directo
4. **Setup**: `await setupPage(page, { ... opciones ... })`
5. **Ponele tags** al título del test para poder filtrarlo

Ejemplo:

```typescript
import { test, expect } from '@playwright/test';
import { setupPage } from '../../helpers/setup';
import { TiendaPage } from '../../pages/tienda.page';

test('mi nuevo test @tienda @mi-tag', async ({ page }) => {
  await setupPage(page, {
    perfil: 'minorista',
    provincia: 'Buenos Aires',
    localidad: 'Bahía Blanca',
    zonaStatus: 'libre'
  });
  const tienda = new TiendaPage(page);
  await tienda.goto();
  await expect(tienda.catalog).toBeVisible();
});
```

## Cuándo correr qué

- **Después de cualquier cambio**: `npm run test:smoke` (~15s) — verifica que no rompiste lo crítico
- **Después de tocar una sección**: `npm run test:<seccion>` — regresión completa de esa área
- **Antes de push a producción**: `npm test` — full suite (~1 min)

## Debug

Un test falla:

1. Miralo con `--headed` para ver qué hace el browser:
   ```bash
   npx playwright test specs/tienda/checkout-minorista.spec.ts --headed
   ```
2. Modo UI para paso a paso:
   ```bash
   npm run test:ui
   ```
3. Después de un fail, el HTML report tiene screenshot + trace:
   ```bash
   npm run report
   ```

## Limitaciones conocidas

- El mock de Firestore no valida security rules — para eso están `rules/` + emulador
- El catálogo por default es `fixtures/productos.fixture.json`. Para testear zonas bloqueadas u otros casos, usar `setupPage(page, { mutarCatalogo: json => { ... } })`
- No hay tests visuales (screenshot comparison) — se pueden agregar después
- No hay tests de responsive breakpoints — se pueden agregar con `test.use({ viewport: {...} })`
- Los tests de integración real contra Firebase (sin mock) están reservados para futuro — usar tag `@integration`
