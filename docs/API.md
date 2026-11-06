# API del servidor

Servidor HTTP en `server.js`. Todas las respuestas son JSON (`application/json`) salvo el canal de eventos y los archivos estáticos. Los datos se identifican por `negocioId` (por ejemplo `FOC-01`).

> **Nota:** en esta versión las rutas no exigen token de sesión. Está previsto como mejora; ver [estado de seguridad](../README.md#estado-de-seguridad-y-pruebas).

## Resumen

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/stream` | Canal de eventos en tiempo real (SSE) |
| GET | `/api/state` | Estado de los datos de un negocio |
| POST | `/api/auth/login` | Inicio de sesión por negocio y rol |
| POST | `/api/negocios/register` | Registrar un negocio nuevo |
| POST | `/api/admin/negocios/update` | Editar un negocio (consola admin) |
| POST | `/api/admin/negocios/delete` | Eliminar un negocio (consola admin) |
| POST | `/api/sync` | Guardar y sincronizar los cambios de un negocio |
| POST | `/api/menu-digital/order` | Recibir un pedido hecho desde el menú digital |
| GET | `/m/<código>` | Enlace corto del menú digital (redirige a `/menu.html`) |
| POST | `/api/whatsapp/connect` | Iniciar la conexión de WhatsApp (genera QR) |
| POST | `/api/whatsapp/disconnect` | Cerrar la sesión de WhatsApp |
| POST | `/api/whatsapp/reply` | Enviar un mensaje a un cliente |
| POST | `/api/whatsapp/webhook` | Entrada externa de mensajes (compatible con WhatsApp Cloud API) |
| GET | `/*` | Archivos estáticos (`index.html`, `app.js`, imágenes…) |

## Eventos en tiempo real

`GET /api/stream?negocioId=FOC-01`

Abre una conexión `text/event-stream`. Eventos que emite el servidor:

| Evento | Cuándo ocurre |
|--------|---------------|
| `connected` | Al abrir el canal |
| `wa_status` | Cambia el estado de WhatsApp (QR, conectado, desconectado…) |
| `sync` | Otro dispositivo guardó cambios de un negocio |
| `wa_incoming_message` | Llegó un mensaje de WhatsApp |

La caja y la cocina escuchan este canal para actualizarse sin refrescar la página.

## Autenticación

`POST /api/auth/login`

```json
{ "usuario": "alcarbon", "clave": "<clave del rol>", "rol": "propietario" }
```

`rol` puede ser `propietario`, `cajero` o `cocina`. Cada rol tiene su propia clave.

| Código | Significado |
|--------|-------------|
| 200 | `{ ok: true, negocioId, negocio, waStatus }` |
| 401 | Clave incorrecta para el rol |
| 403 | Suscripción del negocio suspendida |
| 404 | No existe un negocio con ese usuario |

El usuario `admin` entra a la consola de administración y recibe la lista de negocios (`isAdmin: true`).

## Estado

`GET /api/state?negocioId=FOC-01`

Devuelve `{ ok, data, waStatus, localIp, port, publicMenuUrl }`. Con `negocioId` solo entrega los datos de ese negocio, así un negocio nunca ve los de otro.

## Sincronización

`POST /api/sync`

```json
{ "negocio": { "id": "FOC-01", "pedidos": [], "insumos": [] } }
```

Guarda únicamente el negocio enviado y notifica a los demás dispositivos con el evento `sync`. El servidor impide que un pedido que ya está en preparación o despachado vuelva a *pendiente*. Es la ruta que usa la caja al reconectar tras trabajar sin internet.

## Menú digital

- `GET /m/<código>`: busca el enlace corto, y redirige a `/menu.html?negocio=...&tel=...&nombre=...`.
- `POST /api/menu-digital/order`: recibe el pedido armado por el cliente, lo registra en la cocina del negocio, descuenta inventario según las recetas y responde `{ ok: true, pedido }`.

## WhatsApp

| Ruta | Cuerpo | Efecto |
|------|--------|--------|
| `POST /api/whatsapp/connect` | `{ "negocioId": "FOC-01", "reset": false }` | Inicia la sesión y genera el QR. Con `reset: true` fuerza un QR nuevo |
| `POST /api/whatsapp/disconnect` | `{ "negocioId": "FOC-01" }` | Cierra la sesión |
| `POST /api/whatsapp/reply` | `{ "remoteJid": "…", "mensaje": "…", "negocioId": "FOC-01" }` | Envía un mensaje al cliente |
| `POST /api/whatsapp/webhook` | `{ "texto": "…", "telefono": "…", "clienteNombre": "…" }` | Inyecta un mensaje entrante (también acepta el formato de WhatsApp Cloud API) |

## Administración de negocios

- `POST /api/negocios/register`: crea un negocio nuevo, independiente de los demás. Requiere `usuarioLogin`.
- `POST /api/admin/negocios/update`: actualiza datos de un negocio por `id` (por ejemplo suscripción o estado).
- `POST /api/admin/negocios/delete`: elimina un negocio por `id`.
