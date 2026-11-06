# Fast Order Cúcuta

Sistema de gestión integrada de pedidos e inventario para micronegocios de comida rápida de Cúcuta. Junta en un solo flujo los pedidos que llegan por **WhatsApp** y los que se toman en el **mostrador**, los muestra en la cocina en un tablero **Kanban (KDS)** y descuenta del inventario los insumos de cada plato.

Proyecto universitario de Ingeniería de Sistemas · Asignatura: Proyecto final de ingeniería de sistemas · Docente: Jover Alonso Cabrales Pineda · Repositorio: `<URL-DE-TU-REPOSITORIO>`

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

Desde un celular o tablet en el mismo Wi-Fi, usa la IP del computador en el puerto 3000. La terminal la muestra al arrancar.

## Estructura del repositorio

| Archivo / carpeta | Qué contiene |
|-------------------|--------------|
| [`server.js`](server.js) | Servidor Node.js sin frameworks: API REST, eventos en tiempo real (SSE), conector de WhatsApp, túnel público y archivos estáticos |
| [`index.html`](index.html) | Pantalla principal con las pestañas Caja, Cocina, Inventario, WhatsApp y Métricas |
| [`app.js`](app.js) | Lógica del cliente: pedidos, KDS, inventario, recetas, sincronización y cola offline |
| [`menu.html`](menu.html) | Menú digital interactivo para el cliente final |
| [`admin.html`](admin.html) | Consola central para administrar los negocios (multi-tenant) |
| [`data.js`](data.js) | Catálogo y datos maestros iniciales |
| [`styles.css`](styles.css) | Estilos propios (se combinan con Tailwind por CDN) |
| [`database.json`](database.json) | Base de datos de demostración: negocios, catálogos, insumos, pedidos |
| [`db/`](db) | Un archivo JSON por negocio (`FOC-01.json`, `FOC-02.json`, …) |
| [`IMAGENES PARA PEDIR/`](IMAGENES%20PARA%20PEDIR) | Fotos de los productos del menú |
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
| Acceso externo | Túnel de Cloudflare (`cloudflared`) para abrir el menú digital desde datos móviles |
| Persistencia | Archivos JSON (`database.json` y `db/`) |
| Modo sin internet | `localStorage` + cola de sincronización |

## Equipo y responsabilidades

Detalle por archivo en [docs/EQUIPO.md](docs/EQUIPO.md).

| Integrante | Rol | Parte del proyecto |
|------------|-----|--------------------|
| **Javier Alejandro Serrano Ruiz** | Desarrollador backend e integración (líder técnico) | [`server.js`](server.js): API REST, eventos en tiempo real, conexión con WhatsApp, persistencia multi-negocio, enlaces cortos y túnel público |
| **Josue David Ojeda Vivas** | Desarrollador frontend de caja y cocina | Caja (POS), comanda, tablero Kanban, ticket térmico, modo sin internet y permisos por rol en [`index.html`](index.html) y [`app.js`](app.js) |
| **Johan Humberto Villegas** | Desarrollador de inventario y reportes | Recetas, insumos, umbrales, entradas y mermas, cierre de caja y reportes; datos maestros en [`data.js`](data.js) |
| **Kevin Eduardo Garcia Moreno** | Desarrollador de menú digital, consola admin y documentación | [`menu.html`](menu.html), [`admin.html`](admin.html), [`styles.css`](styles.css), imágenes del menú, pruebas manuales y esta documentación |

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
| Base de datos relacional (PostgreSQL) | Propuesta en el diseño; el prototipo usa archivos JSON |

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

_Completar según lo que haya usado el equipo y lo que pida el profesor._ Ejemplo: "El proyecto se desarrolló con asistencia de IA en la escritura de código y documentación. Las decisiones, la revisión y la integración son del equipo."
