# Firestore Security Rules — Cattorini

Las reglas viven en **`firestore.rules`** (raíz del repo). Este archivo ya no
contiene reglas: cualquier versión vieja copiada de acá es INSEGURA (dejaba a
cualquier usuario anónimo actuar como admin).

## Publicar las reglas

Firebase Console → proyecto `cattorini-tienda` → Firestore Database → Reglas →
pegar el contenido completo de `firestore.rules` → Publicar.

Antes de publicar, siempre:

```bash
cd tests
node rules/generar-stock-rules.mjs --check   # el bloque generado está al día
npm run test:rules                           # reglas contra el emulador (nunca contra el proyecto real)
```

## Modelo (resumen)

- **Staff** = Firebase Auth con email/contraseña de la allowlist de
  `isStaff()`. El login anónimo no da ningún privilegio.
- `pedidos/{codigo}` y `solicitudes_mayoristas/{codigo}`: el ID del doc es el
  código. `get` público (seguimiento), `list`/`update`/`delete` solo staff.
- `mayoristas_activos/{sha256(codigo)}`: `get` público, todo lo demás staff.
  No existe código mayorista maestro.
- `stock/{id}`: lectura pública; el checkout público solo puede BAJAR las
  variantes que declara en `descuento`, en la misma transacción que crea el
  pedido, con un tope de 12 variantes por producto por pedido (límite de
  expresiones de Firestore, ver `tests/rules/generar-stock-rules.mjs`). Es
  temporal: cuando exista el Worker de pagos, el descuento de stock pasa al
  Worker y se levanta el tope.
- `stock/{id}/movimientos`: lectura solo staff; ventas públicas con formato
  estricto (`Venta #CODIGO`); historial append-only.

## Configuración de Authentication (consola de Firebase)

1. Authentication → Método de acceso → habilitar **Correo electrónico/contraseña**.
2. Users → Agregar usuario → el email del dueño (el de `isStaff()`), con una
   contraseña PROPIA del panel (distinta a la de su cuenta de Google).
3. Deshabilitar el proveedor **Anónimo**.
4. Authentication → Configuración → Acciones del usuario → desmarcar
   "Habilitar creación (registro)" para que nadie pueda crearse una cuenta.
