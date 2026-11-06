# Equipo y responsabilidades

Proyecto final de Ingeniería de Sistemas · Docente: **Jover Alonso Cabrales Pineda**.

## Integrantes y roles

| Integrante | Rol | Responsabilidades |
|------------|-----|-------------------|
| **Javier Alejandro Serrano Ruiz** | Desarrollador backend e integración (líder técnico) | Servidor Node.js (`server.js`): API REST, canal de eventos en tiempo real (SSE), inicio de sesión por rol, aislamiento y persistencia de cada negocio, conexión con WhatsApp mediante QR, bot de opciones, enlaces cortos del menú digital y túnel de Cloudflare. Integra el trabajo del equipo |
| **Josue David Ojeda Vivas** | Desarrollador frontend de caja y cocina | Pantalla principal (`index.html`, `app.js`): toma de pedidos y comanda, adiciones y modificaciones, tablero Kanban con cronómetros y sonido, ticket térmico, modo sin internet y permisos por rol en la interfaz |
| **Johan Humberto Villegas** | Desarrollador de inventario y reportes | Recetas, insumos, umbrales de alerta, entradas y mermas, historial de movimientos, cierre de caja y reportes por día, semana y mes, datos maestros (`data.js`) y datos de demostración |
| **Kevin Eduardo Garcia Moreno** | Desarrollador de menú digital, consola admin y documentación | Menú digital del cliente (`menu.html`), consola de administración (`admin.html`), estilos (`styles.css`), imágenes del menú, pruebas manuales y documentación del repositorio |

## Responsable por archivo

| Archivo | Responsable principal | Apoyo |
|---------|----------------------|-------|
| `server.js` | Javier | Kevin (rutas de administración) |
| `index.html` y `app.js` (caja, cocina, offline) | Josue | Javier (sincronización con el servidor) |
| `app.js` (inventario, recetas, reportes) | Johan | Josue |
| `data.js`, `database.json`, `db/` | Johan | Javier |
| `menu.html` | Kevin | Javier (recepción del pedido en el servidor) |
| `admin.html` | Kevin | Javier |
| `styles.css`, `IMAGENES PARA PEDIR/` | Kevin | Josue |
| `README.md` y `docs/` | Kevin | Todo el equipo |
| `INICIAR_SERVIDOR.bat`, `package.json` | Javier | |

## Plan inicial

Propuesta del documento del Sprint 1. Las fechas pueden haber cambiado durante el desarrollo.

| Fase | Duración | Resultado esperado |
|------|----------|--------------------|
| 1. Requisitos y diseño UX/UI | Semana 1 | Prototipo y especificaciones aprobadas |
| 2. Desarrollo del MVP | Semanas 2–4 | Pedidos, tablero de cocina e integración con WhatsApp |
| 3. Pruebas piloto | Semana 5 | Métricas de errores y lista de ajustes |
| 4. Despliegue y ajustes | Semanas 6–7 | Plataforma operativa con inventario y capacitación |

## Estado actual

| Funcionalidad | Estado |
|---------------|--------|
| Caja con adiciones y modificaciones | Implementado |
| Tablero Kanban de cocina | Implementado |
| Inventario, recetas, entradas y mermas | Implementado |
| Gestión del menú (platos, categorías, fotos) | Implementado |
| Bot de WhatsApp (QR) y menú digital | Implementado |
| Cierre de caja y reportes por día, semana y mes | Implementado |
| Consola multi-negocio y suscripciones | Implementado |
| Modo sin internet | Implementado de forma básica |
| Seguridad (claves cifradas, token de sesión) | Pendiente |
| Pruebas automatizadas | Pendiente |
