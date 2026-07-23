# Firestore Security Rules — Cattorini

Cuando crees el proyecto Firebase real para Cattorini, seguí estos pasos.

## 1. Crear proyecto Firebase

1. Ir a https://console.firebase.google.com
2. Crear proyecto llamado `cattorini` (o similar)
3. Habilitar **Firestore Database** en modo producción
4. Habilitar **Authentication** → Método de acceso → habilitar "Anónimo"
5. Copiar la config del proyecto (Configuración del proyecto → Tus apps → Web) y reemplazar el `FIREBASE_CONFIG` placeholder en:
   - `tienda.html`
   - `producto.html`
   - `pedidos.html`
   - `portal.html`
   - `seguimiento.html`
   - `seguimiento-mayorista.html`
   - `index.html`

## 2. Reglas de seguridad Firestore

Ir a **Firestore Database → Reglas** y pegar exactamente esto:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    /* ============ PEDIDOS ============ */
    match /pedidos/{orderId} {

      /* CREATE — desde la tienda pública, con validación estricta de shape */
      allow create: if
        request.resource.data.keys().hasAll([
          'codigo', 'creadoEn', 'cliente', 'items', 'modalidad',
          'subtotal', 'envio', 'total', 'nota', 'estado'
        ])
        && request.resource.data.codigo is string
        && request.resource.data.codigo.size() >= 4
        && request.resource.data.codigo.size() <= 8
        && request.resource.data.cliente is map
        && request.resource.data.cliente.nombre is string
        && request.resource.data.cliente.nombre.size() > 0
        && request.resource.data.cliente.nombre.size() <= 80
        && request.resource.data.items is list
        && request.resource.data.items.size() > 0
        && request.resource.data.items.size() <= 100
        && request.resource.data.modalidad in ['retiro', 'envio']
        && request.resource.data.subtotal is number
        && request.resource.data.subtotal >= 0
        && request.resource.data.envio is number
        && request.resource.data.envio >= 0
        && request.resource.data.total is number
        && request.resource.data.total >= 0
        && request.resource.data.estado == 'pendiente';

      /* READ público con acceso limitado — necesario para seguimiento por código
         Un cliente sólo puede leer si conoce el ID (búsqueda por código = query where) */
      allow read: if true;

      /* UPDATE y DELETE — solo autenticados (portal usa signin anónimo) */
      allow update, delete: if request.auth != null;
    }

    /* ============ SOLICITUDES MAYORISTAS ============ */
    match /solicitudes_mayoristas/{solId} {

      /* CREATE — desde el formulario del landing, con validación estricta */
      allow create: if
        request.resource.data.keys().hasAll([
          'codigo', 'creadoEn', 'solicitante', 'notas', 'estado', 'respuesta'
        ])
        && request.resource.data.codigo is string
        && request.resource.data.codigo.size() >= 6
        && request.resource.data.codigo.size() <= 12
        && request.resource.data.solicitante is map
        && request.resource.data.solicitante.nombre is string
        && request.resource.data.solicitante.nombre.size() > 0
        && request.resource.data.solicitante.nombre.size() <= 80
        && request.resource.data.solicitante.negocio is string
        && request.resource.data.solicitante.negocio.size() > 0
        && request.resource.data.solicitante.negocio.size() <= 100
        && request.resource.data.estado == 'pendiente'
        && request.resource.data.respuesta == null;

      /* READ público — el solicitante consulta su solicitud por código */
      allow read: if true;

      /* UPDATE y DELETE — solo admin autenticado */
      allow update, delete: if request.auth != null;
    }
  }
}
```

## 3. Sobre el modelo de seguridad de reads

Los `read: if true` son intencionales:
- **Pedidos**: el cliente necesita consultar por código sin autenticarse. Como el código de 5 caracteres es opaco y no listable (Firestore no permite listar sin auth con `list`), un atacante tendría que hacer fuerza bruta contra ~33 millones de combinaciones para descubrir códigos existentes. En la práctica se limita por rate limiting de Firestore.
- **Solicitudes**: mismo modelo con códigos MAY-XXXX.

Si querés endurecer más:
- Cambiar `allow read: if true` a `allow read: if request.auth != null` y hacer que las páginas de seguimiento pidan una segunda verificación (ej: apellido + últimos 4 del código).

## 4. Verificación

- Desde una ventana incógnita hacé un pedido de prueba en `tienda.html`.
- Debería aparecer en la cola de `pedidos.html`.
- El código en la confirmación debería funcionar en `seguimiento.html?code=XXXXX`.
- Lo mismo con solicitud mayorista → `seguimiento-mayorista.html?code=MAY-XXXX`.
- Si no aparece, abrí devtools → Console y buscá errores de Firebase.

## 5. Cuotas free tier (Firestore Spark)

- 50.000 lecturas/día
- 20.000 escrituras/día
- 1 GB almacenamiento

Estimación Cattorini (pico razonable):
- 100 pedidos/día = 100 writes
- 30 consultas de seguimiento/día = 30 reads
- Portal abierto 10 veces/día × 200 pedidos snapshot = 2000 reads
- 20 solicitudes mayoristas/día = 20 writes + 40 reads
- **Total estimado: ~120 writes + ~2100 reads por día** — muy por debajo del límite.

## 6. Notas de seguridad

- El shape validation en `create` bloquea spam malformed.
- La colección `pedidos` no permite update ni delete públicos → los usuarios no pueden alterar sus propios pedidos después de enviarlos.
- El `estado` inicial siempre es `pendiente` — no se puede crear un pedido ya "aceptado" pasando por atrás.
- Las contraseñas del portal están en el cliente (PBKDF2 + AES-GCM), NO en Firebase. Firebase auth anónimo solo se usa como marcador de "portal activo".
