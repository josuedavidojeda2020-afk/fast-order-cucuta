# Fast Order Cúcuta

Sistema de gestión integrada de pedidos e inventario para micronegocios de comida rápida de Cúcuta. Junta en un solo flujo los pedidos que llegan por **WhatsApp** y los que se toman en el **mostrador**, los muestra en la cocina en un tablero **Kanban (KDS)** y descuenta del inventario los insumos de cada plato.

Proyecto universitario de Ingeniería de Sistemas · Asignatura: Proyecto final de ingeniería de sistemas · Docente: Jover Alonso Cabrales Pineda · Repositorio: `https://github.com/josuedavidojeda2020-afk/fast-order-cucuta`

> **Estado:** prototipo funcional (MVP) con datos de demostración de dos negocios piloto.

---

## Contenido

- [Qué hace](#qué-hace)
- [Problema que resuelve](#problema-que-resuelve)
- [Ejecutar en local](#ejecutar-en-local)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Roles de usuario](#roles-de-usuario)
- [Tecnologías](#tecnologías)
- [Equipo y responsabilidades](#equipo-y-responsabilidades)
- [Organización por Sprints en el grupo](#organización-por-sprints-en-el-grupo)
- [Estado de seguridad y pruebas](#estado-de-seguridad-y-pruebas)
- [Documentación](#documentación)
- [Asistencia de IA](#asistencia-de-ia)

## Qué hace

- **Caja (POS):** toma de pedidos en mostrador desde tablet o celular, con botones de adiciones y modificaciones ("sin cebolla", "salsa aparte"), separación de unidades del mismo plato para personalizarlas por aparte y cálculo automático del cobro. Imprime el ticket en formato térmico.
- **Cocina (KDS):** tablero Kanban en tiempo real con tres estados (pendiente → en preparación → despachado), cronómetro por pedido, aviso sonoro al llegar un pedido nuevo y modificaciones resaltadas por color.
- **Gestión del menú:** el dueño agrega, edita y elimina platos, con categoría, foto, ingredientes, adiciones y receta.
- **Inventario:** descuento automático de insumos según la receta, alertas de stock bajo con umbral configurable, entradas de compra y mermas con historial de movimientos.
- **WhatsApp:** conexión del número del negocio con código QR. El bot saluda al cliente y le ofrece dos opciones: hacer el pedido por un **menú digital** (enlace corto `/m/<código>`) o hablar con un asesor. Hay una bandeja con los mensajes del negocio.
- **Menú digital del cliente (`menu.html`):** el cliente arma su pedido desde el celular, con adiciones, y lo ve llegar directo a la cocina.
- **Domicilios:** asignación del motorizado a cada entrega.
- **Cierre de caja y reportes:** ventas por día, semana o mes, con búsqueda de fechas anteriores y reporte imprimible.
- **Multi-negocio (SaaS):** cada negocio tiene sus propios usuarios, catálogo, inventario y pedidos, aislados de los demás. La consola `/admin.html` permite crear, editar y suspender negocios y controlar la suscripción mensual.
- **Sin internet:** la caja sigue operando y deja los pedidos en una cola local que se sincroniza al reconectar, sin duplicados.

## Problema que resuelve

Muchos negocios de comida rápida reciben pedidos por dos medios (local y WhatsApp) y los anotan en cuaderno o en el chat. Con alta demanda se pierden órdenes, se olvidan indicaciones, se cobran mal las adiciones y los insumos perecederos se dañan por falta de control. El diagnóstico, los objetivos y los requisitos están en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). La idea nació en el documento del Sprint 1 (`Consolidación idea de proyecto_ Fast Order Cúcuta.pdf`); durante el desarrollo la aplicación evolucionó, y **esta documentación describe la versión actual**.

**Objetivo general:** desarrollar una plataforma centralizada de gestión de pedidos e inventario que reduzca al menos un 40 % los errores operativos y mejore la rentabilidad de los micronegocios de comida rápida en Cúcuta.

## Ejecutar en local

Requisitos: **Windows**, **Node.js** (LTS reciente) y **Google Chrome o Edge** (lo usa la librería de WhatsApp). Detalle completo en [docs/INSTALACION.md](docs/INSTALACION.md).

```bash
# 1. Instalar dependencias (una sola vez)
npm install

# 2. Arrancar el servidor
npm start            # o doble clic en INICIAR_SERVIDOR.bat
```

El servidor queda en **http://localhost:3000**:

| Ruta | Para qué sirve |
|------|----------------|
| `http://localhost:3000/` | Aplicación principal (caja, cocina, inventario, WhatsApp, métricas) |
| `http://localhost:3000/menu.html` | Menú digital que ve el cliente |
| `http://localhost:3000/admin.html` | Consola de administración de negocios |
| `http://localhost:3000/db.html` | Visor de tablas de la base de datos relacional SQLite |

Desde un celular o tablet en el mismo Wi-Fi, usa la IP del computador en el puerto 3000 o el enlace público generado en la terminal.

## Estructura del repositorio

| Archivo / carpeta | Qué contiene |
|-------------------|--------------|
| [`server.js`](server.js) | Servidor Node.js sin frameworks: API REST, eventos en tiempo real (SSE), conector de WhatsApp, túnel público y archivos estáticos |
| [`public/index.html`](public/index.html) | Pantalla principal con las pestañas Caja, Cocina, Inventario, WhatsApp y Métricas (adaptada a móvil y escritorio) |
| [`public/app.js`](public/app.js) | Lógica del cliente: modelo de clases POO, pedidos, KDS, inventario, recetas, sincronización y cola offline |
| [`public/menu.html`](public/menu.html) | Menú digital interactivo para el cliente final |
| [`public/admin.html`](public/admin.html) | Consola central para administrar los negocios (multi-tenant) y sus claves por rol |
| [`public/db.html`](public/db.html) | Visor web en tiempo real de las tablas de la base de datos SQLite |
| [`public/IMAGENES PARA PEDIR/`](public/IMAGENES%20PARA%20PEDIR) | Fotos de los productos del menú |
| [`db/sqlite-engine.js`](db/sqlite-engine.js) | Motor de base de datos relacional SQLite 3 (`node:sqlite`) con transacciones ACID, modo WAL y respaldo atómico |
| [`db/fastorder.sqlite`](db/fastorder.sqlite) | Base de datos relacional SQLite (`negocios`, `productos`, `insumos`, `pedidos`, `movimientos_inventario`, `config_sistema`) |
| [`db/`](db) | Respaldos JSON aislados por negocio (`database.json`, `FOC-01.json`, `FOC-02.json`, …) |
| [`INICIAR_SERVIDOR.bat`](INICIAR_SERVIDOR.bat) | Arranque con doble clic en Windows |
| [`package.json`](package.json) | Dependencias y script de inicio |
| [`docs/`](docs) | Documentación técnica y del equipo |

## Roles de usuario

Cada negocio tiene un usuario y una clave distinta por rol:

| Rol | Pestañas a las que accede |
|-----|---------------------------|
| **Dueño / propietario** | Caja, Cocina, Inventario, WhatsApp y Reportes (todo el negocio) |
| **Cajero** | Caja y WhatsApp |
| **Cocina** | Solo el tablero de cocina |
| **Administrador de la plataforma** | Consola `/admin.html`: alta, edición, suspensión y baja de negocios |

Las credenciales de demostración están en `database.json` y `db/`. **Cámbialas antes de usar el sistema con datos reales.**

## Tecnologías

| Capa | Tecnología |
|------|------------|
| Servidor | Node.js (módulos nativos `http`, `fs`, `https`) |
| Cliente | HTML, JavaScript, CSS, Tailwind CSS (CDN), Font Awesome |
| Tiempo real | Server-Sent Events (SSE) |
| WhatsApp | [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js) con sesión por código QR |
| Códigos QR | [`qrcode`](https://www.npmjs.com/package/qrcode) |
| Acceso externo | Túnel de Cloudflare (`cloudflared`) para abrir el sistema y el menú digital desde datos móviles |
| Persistencia | Base de datos relacional **SQLite 3** (`db/fastorder.sqlite` vía `node:sqlite`) con modo WAL, transacciones ACID y respaldo atómico en `db/` |
| Modo sin internet | `localStorage` + cola de sincronización |

## Equipo y responsabilidades

Detalle por archivo en [docs/EQUIPO.md](docs/EQUIPO.md).

| Integrante | Rol | Parte del proyecto |
|------------|-----|--------------------|
| **Javier Alejandro Serrano Ruiz** | Desarrollador backend e integración (líder técnico) | [`server.js`](server.js): API REST, eventos en tiempo real, conexión con WhatsApp, persistencia multi-negocio, enlaces cortos y túnel público |
| **Josue David Ojeda Vivas** | Desarrollador frontend de caja y cocina | Caja (POS), comanda, tablero Kanban, ticket térmico, modo sin internet y permisos por rol en [`index.html`](index.html) y [`app.js`](app.js) |
| **Johan Humberto Villegas** | Desarrollador de inventario y reportes | Recetas, insumos, umbrales, entradas y mermas, cierre de caja y reportes; base de datos y datos maestros en [`db/`](db) |
| **Kevin Eduardo Garcia Moreno** | Desarrollador de menú digital, consola admin y documentación | [`public/menu.html`](public/menu.html), [`public/admin.html`](public/admin.html), imágenes del menú, pruebas manuales y esta documentación |

## Organización por Sprints en el grupo (`S1` – `S7`)

El trabajo del equipo está organizado en **7 Sprints (Hitos `S1` a `S7`)** y **36 tareas (`T01` a `T36`)** distribuidas en 3 fases:

| Sprint / Hito | Fase | Descripción | Tareas (*Issues*) | Responsables | Estado |
|---------------|------|-------------|-------------------|--------------|--------|
| **S1 – Requisitos y diseño** | Fase 1 | Levantamiento de requisitos, documento del Sprint 1 y diseño inicial. | `T01`, `T02`, `T03` | Kevin (`T01`), Josue (`T02`), Javier (`T03`) | Completado (`3/3`) |
| **S2 – Caja y cocina (MVP)** | Fase 1 | Servidor base, caja con comanda, tablero Kanban de cocina y tiempo real. | `T04`, `T05`, `T06`, `T07`, `T08`, `T09` | Javier (`T04`, `T09`), Josue (`T05`–`T08`) | Completado (`6/6`) |
| **S3 – Inventario y reportes** | Fase 2 | Recetas, inventario, gestión del menú, cierre de caja y datos de demostración. | `T10`, `T11`, `T12`, `T13`, `T14`, `T15` | Johan (`T10`–`T15`) | Completado (`6/6`) |
| **S4 – WhatsApp y menú digital** | Fase 2 | Conexión por QR, bot de opciones, enlaces cortos y menú digital del cliente. | `T16`, `T17`, `T18`, `T19`, `T20`, `T21` | Javier (`T16`–`T19`), Kevin (`T20`), Josue (`T21`) | Completado (`6/6`) |
| **S5 – Multi-negocio y modo sin internet** | Fase 2 | Aislamiento por negocio, roles, consola de administración y cola offline. | `T22`, `T23`, `T24`, `T25`, `T26` | Javier (`T22`, `T23`), Kevin (`T24`), Josue (`T25`, `T26`) | Completado (`5/5`) |
| **S6 – Documentación y entrega** | Fase 2 | README, carpeta `docs` y publicación del repositorio. | `T27`, `T28` | Kevin (`T27`, `T28`) | Completado (`2/2`) |
| **S7 – Seguridad y pruebas** | Fase 3 | Pendientes de endurecimiento, pruebas y piloto. | `T29`–`T36` | Kevin (`T29`, `T32`, `T34`, `T36`), Javier (`T30`, `T31`, `T35`), Johan (`T33`) | En curso / Fase 3 |

El desglose completo de las 36 tareas (`T01`–`T36`) está en [docs/EQUIPO.md](docs/EQUIPO.md) y en [docs/sprints-github.json](docs/sprints-github.json).

## Estado de seguridad y pruebas

| Tema | Estado |
|------|--------|
| Autenticación por usuario, clave y rol | Implementado en el servidor (`POST /api/auth/login`) |
| Aislamiento de datos entre negocios | Implementado: cada negocio se guarda y se consulta por separado |
| Suspensión de negocios por suscripción | Implementado |
| Cifrado de claves (hash) y tokens de sesión | **Pendiente:** las claves están en texto plano en los JSON de demostración |
| Protección de rutas de datos y de administración | **Pendiente:** las rutas `/api/...` no exigen token |
| HTTPS | Disponible al exponer el servidor con el túnel de Cloudflare; en local es HTTP |
| Pruebas automatizadas | **Pendiente:** no hay suite de pruebas |
| Base de datos relacional (SQLite 3) | **Implementado:** motor relacional SQLite (`db/fastorder.sqlite`) con tablas normalizadas, sentencias preparadas contra inyección SQL, transacciones ACID y respaldo automático |

Lo implementado frente a lo propuesto en el diseño está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md#implementado-frente-a-lo-propuesto).

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/INSTALACION.md](docs/INSTALACION.md) | Instalación paso a paso, conexión de WhatsApp y solución de problemas |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Requisitos, arquitectura C4, flujo de un pedido, modelo de datos y decisiones de diseño |
| [docs/API.md](docs/API.md) | Endpoints del servidor con ejemplos |
| [docs/EQUIPO.md](docs/EQUIPO.md) | Integrantes, responsabilidades y plan por sprints |
| [docs/CONTRIBUIR.md](docs/CONTRIBUIR.md) | Cómo trabajar con ramas, commits y pull requests |
| `Consolidación idea de proyecto_ Fast Order Cúcuta.pdf` | Documento inicial del Sprint 1. Es el punto de partida; la aplicación cambió después |

## Asistencia de IA

El proyecto se desarrolló con asistencia de herramientas de IA. Para escribir y depurar partes del código de la aplicación se usó Google Antigravity, y para la redacción de la documentación se usó Claude, de Anthropic. Las decisiones, la revisión y la integración son del equipo.
