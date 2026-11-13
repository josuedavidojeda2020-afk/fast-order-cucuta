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
| `public/index.html` y `public/app.js` (caja, cocina, móvil, offline) | Josue | Javier (sincronización con el servidor) |
| `public/app.js` (inventario, recetas, kardex, cierre de caja) | Johan | Josue |
| `db/sqlite-engine.js`, `db/fastorder.sqlite`, `db/*.json` | Johan y Javier | |
| `public/menu.html` | Kevin | Javier (recepción del pedido en el servidor) |
| `public/admin.html` y `public/db.html` | Kevin | Javier |
| `public/IMAGENES PARA PEDIR/` | Kevin | Josue |
| `README.md` y `docs/` | Kevin | Todo el equipo |
| `INICIAR_SERVIDOR.bat`, `package.json` | Javier | |

## Plan de Sprints (`S1` – `S7`) y Tareas (`T01` – `T36`)

### S1 – Requisitos y diseño
> Levantamiento de requisitos, documento del Sprint 1 y diseño inicial.

| ID | Tarea | Responsable | Archivos | Etiquetas | Estado |
|----|-------|-------------|----------|-----------|--------|
| **T01** | Levantamiento de requisitos y documento del Sprint 1 | Kevin Eduardo Garcia Moreno | `Consolidación idea de proyecto_ Fast Order Cúcuta.pdf` | `Fase 1`, `documentación` | Completada |
| **T02** | Diseño de la interfaz de caja y cocina | Josue David Ojeda Vivas | `index.html`, `styles.css` | `Fase 1`, `frontend` | Completada |
| **T03** | Modelo de datos de negocios, productos, insumos y pedidos | Javier Alejandro Serrano Ruiz | `database.json`, `db/` | `Fase 1`, `backend` | Completada |

### S2 – Caja y cocina (MVP)
> Servidor base, caja con comanda, tablero Kanban de cocina y tiempo real.

| ID | Tarea | Responsable | Archivos | Etiquetas | Estado |
|----|-------|-------------|----------|-----------|--------|
| **T04** | Servidor Node.js base y archivos estáticos | Javier Alejandro Serrano Ruiz | `server.js`, `package.json`, `INICIAR_SERVIDOR.bat` | `Fase 1`, `backend` | Completada |
| **T05** | Catálogo y comanda de caja con adiciones y modificaciones | Josue David Ojeda Vivas | `index.html`, `app.js` | `Fase 1`, `frontend` | Completada |
| **T06** | Tablero Kanban de cocina con tres estados | Josue David Ojeda Vivas | `app.js` | `Fase 1`, `frontend` | Completada |
| **T07** | Cronómetro, aviso sonoro y resaltado de modificaciones en cocina | Josue David Ojeda Vivas | `app.js` | `Fase 1`, `frontend` | Completada |
| **T08** | Ticket térmico imprimible | Josue David Ojeda Vivas | `app.js (imprimirTicketTermico)` | `Fase 1`, `frontend` | Completada |
| **T09** | Canal de eventos en tiempo real (SSE) entre caja y cocina | Javier Alejandro Serrano Ruiz | `server.js (/api/stream)` | `Fase 1`, `backend` | Completada |

### S3 – Inventario y reportes
> Recetas, inventario, gestión del menú, cierre de caja y datos de demostración.

| ID | Tarea | Responsable | Archivos | Etiquetas | Estado |
|----|-------|-------------|----------|-----------|--------|
| **T10** | Recetas e inventario con descuento automático | Johan Humberto Villegas | `app.js (Receta, Insumo)` | `Fase 2`, `inventario` | Completada |
| **T11** | Alertas de stock bajo con umbral configurable | Johan Humberto Villegas | `app.js` | `Fase 2`, `inventario` | Completada |
| **T12** | Entradas de compra, mermas e historial de movimientos | Johan Humberto Villegas | `app.js (MovimientoInventario)` | `Fase 2`, `inventario` | Completada |
| **T13** | Gestión del menú: alta, edición y baja de platos | Johan Humberto Villegas | `app.js`, `index.html` | `Fase 2`, `inventario`, `frontend` | Completada |
| **T14** | Cierre de caja y reportes por día, semana y mes | Johan Humberto Villegas | `app.js (renderDailyReportsAndMetrics)` | `Fase 2`, `inventario` | Completada |
| **T15** | Datos maestros y datos de demostración | Johan Humberto Villegas | `data.js`, `database.json`, `db/` | `Fase 2`, `inventario` | Completada |

### S4 – WhatsApp y menú digital
> Conexión por QR, bot de opciones, enlaces cortos y menú digital del cliente.

| ID | Tarea | Responsable | Archivos | Etiquetas | Estado |
|----|-------|-------------|----------|-----------|--------|
| **T16** | Conexión de WhatsApp por código QR | Javier Alejandro Serrano Ruiz | `server.js (whatsapp-web.js)` | `Fase 2`, `whatsapp`, `backend` | Completada |
| **T17** | Bot de opciones y atención humana | Javier Alejandro Serrano Ruiz | `server.js (procesarFlujoHibridoWhatsApp)` | `Fase 2`, `whatsapp`, `backend` | Completada |
| **T18** | Enlaces cortos del menú digital y túnel de Cloudflare | Javier Alejandro Serrano Ruiz | `server.js (/m/<código>, cloudflared)` | `Fase 2`, `whatsapp`, `backend` | Completada |
| **T19** | Recepción de pedidos del menú digital con descuento de inventario | Javier Alejandro Serrano Ruiz | `server.js (/api/menu-digital/order)` | `Fase 2`, `whatsapp`, `backend` | Completada |
| **T20** | Menú digital del cliente | Kevin Eduardo Garcia Moreno | `menu.html` | `Fase 2`, `frontend`, `whatsapp` | Completada |
| **T21** | Bandeja de mensajes de WhatsApp en la interfaz | Josue David Ojeda Vivas | `index.html`, `app.js` | `Fase 2`, `whatsapp`, `frontend` | Completada |

### S5 – Multi-negocio y modo sin internet
> Aislamiento por negocio, roles, consola de administración y cola offline.

| ID | Tarea | Responsable | Archivos | Etiquetas | Estado |
|----|-------|-------------|----------|-----------|--------|
| **T22** | Aislamiento de datos por negocio | Javier Alejandro Serrano Ruiz | `server.js (guardarNegocioAislado)` | `Fase 2`, `backend` | Completada |
| **T23** | Inicio de sesión por rol y permisos de pestañas | Javier Alejandro Serrano Ruiz | `server.js (/api/auth/login)`, `app.js (PERMISOS_POR_ROL)` | `Fase 2`, `backend`, `frontend` | Completada |
| **T24** | Consola de administración y suscripciones | Kevin Eduardo Garcia Moreno | `admin.html`, `server.js` | `Fase 2`, `frontend`, `backend` | Completada |
| **T25** | Modo sin internet y cola de sincronización | Josue David Ojeda Vivas | `app.js`, `server.js (/api/sync)` | `Fase 2`, `frontend` | Completada |
| **T26** | Domicilios y asignación de motorizado | Josue David Ojeda Vivas | `app.js`, `index.html` | `Fase 2`, `frontend` | Completada |

### S6 – Documentación y entrega
> README, carpeta docs y publicación del repositorio.

| ID | Tarea | Responsable | Archivos | Etiquetas | Estado |
|----|-------|-------------|----------|-----------|--------|
| **T27** | README y carpeta de documentación | Kevin Eduardo Garcia Moreno | `README.md`, `docs/` | `Fase 2`, `documentación` | Completada |
| **T28** | Publicación del repositorio en GitHub | Kevin Eduardo Garcia Moreno | `Repositorio` | `Fase 2`, `documentación` | Completada |

### S7 – Seguridad y pruebas
> Pendientes de endurecimiento, pruebas y piloto.

| ID | Tarea | Responsable | Archivos | Etiquetas | Estado |
|----|-------|-------------|----------|-----------|--------|
| **T29** | Limpiar datos de prueba de `database.json` y `db/` | Kevin Eduardo Garcia Moreno | `database.json`, `db/` | `Fase 3`, `seguridad`, `documentación` | Pendiente |
| **T30** | Cifrar las claves de acceso con hash | Javier Alejandro Serrano Ruiz | `server.js`, `database.json` | `Fase 3`, `seguridad`, `backend` | Pendiente |
| **T31** | Tokens de sesión y protección de las rutas `/api` | Javier Alejandro Serrano Ruiz | `server.js` | `Fase 3`, `seguridad`, `backend` | Pendiente |
| **T32** | Pruebas automatizadas del servidor y de las reglas de pedido | Kevin Eduardo Garcia Moreno | `server.js`, `app.js` | `Fase 3`, `pruebas` | Pendiente |
| **T33** | Respaldos automáticos de la base de datos | Johan Humberto Villegas | `db/` | `Fase 3`, `seguridad`, `inventario` | Pendiente |
| **T34** | Aviso de tratamiento de datos (Ley 1581 de 2012) | Kevin Eduardo Garcia Moreno | `menu.html` | `Fase 3`, `seguridad`, `documentación` | Pendiente |
| **T35** | Migrar la persistencia de archivos JSON a una base de datos relacional | Javier Alejandro Serrano Ruiz | `server.js`, `db/sqlite-engine.js` | `Fase 3`, `backend` | Implementada en SQLite |
| **T36** | Prueba piloto en un negocio real con métricas | Kevin Eduardo Garcia Moreno | — | `Fase 3`, `pruebas` | Pendiente |

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
