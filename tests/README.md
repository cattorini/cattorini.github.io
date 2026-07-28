# Tests Cattorini

Suite de tests E2E con Playwright + TypeScript + Page Object Model.

## Setup (una sola vez)

```bash
cd pages/cattorini/tests
npm install
npm run install:browsers   # instala Chromium
```

Requiere Node ≥ 18 y Python 3 (para servir los HTML localmente).

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

- **Servidor**: Playwright levanta `python3 -m http.server 4173` sirviendo `pages/cattorini/`
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

- El mock de Firestore es simple — no valida las security rules reales
- El JSON `productos.json` usado por default es el de producción (con `zonas_mayoristas: []`). Para testear zonas bloqueadas, el spec usa `page.route()` para interceptar y modificarlo
- No hay tests visuales (screenshot comparison) — se pueden agregar después
- No hay tests de responsive breakpoints — se pueden agregar con `test.use({ viewport: {...} })`
- Los tests de integración real contra Firebase (sin mock) están reservados para futuro — usar tag `@integration`
