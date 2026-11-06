# Arquitectura y diseño

Este documento describe la aplicación **tal como está hoy**. La idea inicial se consolidó en el documento del Sprint 1 (`Consolidación idea de proyecto_ Fast Order Cúcuta.pdf`); durante el desarrollo se tomaron decisiones distintas, y las diferencias están en [Cambios frente a la idea inicial](#cambios-frente-a-la-idea-inicial).

## Contexto y problema

Los micronegocios de comida rápida de Cúcuta reciben pedidos en el local y por WhatsApp, y los anotan en papel o en el chat. En horas pico esto causa pedidos perdidos o incompletos, indicaciones olvidadas ("sin cebolla"), adiciones sin cobrar e insumos perecederos que se dañan por falta de control.

| Alternativa actual | Deficiencia |
|--------------------|-------------|
| Papel y libreta | Letra ilegible, se mancha, se pierde, no genera métricas |
| WhatsApp personal o Business básico | Los mensajes nuevos desplazan a los antiguos, no hay estados del pedido |
| Sistemas POS genéricos | Costosos y complejos, sin integración con chat ni cocina |
| Plataformas de domicilios | Comisiones altas, no resuelven cocina ni inventario |

## Objetivo

Desarrollar una plataforma centralizada de gestión de pedidos e inventario que reduzca los errores operativos y mejore la rentabilidad de los micronegocios de comida rápida en Cúcuta, juntando en una sola pantalla de cocina los pedidos de WhatsApp y los del mostrador.

## Alcance actual

| Incluido | No incluido |
|----------|-------------|
| Toma de pedidos en caja con adiciones y modificaciones | Contabilidad completa, facturación electrónica y nómina |
| Pedidos de WhatsApp mediante bot y menú digital | Rastreo GPS de motorizados |
| Tablero Kanban de cocina con tres estados | Pasarela de pagos en línea |
| Inventario con recetas, alertas, entradas y mermas | Reportes avanzados de rentabilidad |
| Gestión del menú (platos, categorías, fotos) | Base de datos relacional y respaldos automáticos |
| Cierre de caja y reportes por día, semana y mes | Seguridad completa (claves cifradas, tokens) |
| Varios negocios aislados y consola de administración | |
| Modo sin internet con sincronización posterior | |

## Requisitos funcionales y su estado

| ID | Actor | Requisito | Estado |
|----|-------|-----------|--------|
| RF-01 | Cajero | Registrar un pedido presencial con botones | Implementado |
| RF-02 | Cajero | Añadir modificaciones y adiciones y calcular su cobro | Implementado |
| RF-03 | Cliente | Recibir pedidos de WhatsApp como tickets | Implementado (bot + menú digital) |
| RF-04 | Cocinero | Tablero Kanban con los tickets | Implementado |
| RF-05 | Cocinero | Cambiar el estado con una sola acción | Implementado |
| RF-06 | Cocinero | Mostrar de forma destacada las modificaciones | Implementado |
| RF-07 | Sistema | Descontar insumos según la receta | Implementado |
| RF-08 | Propietario | Alertar al llegar al umbral mínimo (configurable) | Implementado |
| RF-09 | Propietario | Registrar entradas de inventario y mermas | Implementado |
| RF-10 | Propietario | Resumen de ventas | Implementado (cierre de caja por día, semana y mes) |
| RF-11 | Cajero | Registrar domicilio y motorizado | Implementado |
| RF-12 | Propietario | Usuarios con roles | Parcial: tres roles por clave (dueño, cajero, cocina) y una consola de administración |
| RF-13 | Sistema | Marcar el tiempo de cada cambio de estado | Implementado (ingreso, preparación y despacho) |

## Requisitos no funcionales

| ID | Atributo | Requisito | Estado |
|----|----------|-----------|--------|
| RNF-01 | Usabilidad | Botones grandes, iconos claros y colores de estado | Implementado; sin prueba con usuarios reales |
| RNF-02 | Rendimiento | El pedido aparece en cocina en máximo 2 s | Eventos en tiempo real; no medido |
| RNF-03 | Disponibilidad | 99 % en horario de operación | Sin medir |
| RNF-04 | Fiabilidad | Modo sin internet sin perder ni duplicar pedidos | Implementado de forma básica |
| RNF-05 | Seguridad | Roles, HTTPS y respaldos | Parcial: roles sí; claves en texto plano, sin token ni respaldos |
| RNF-06 | Privacidad | Ley 1581 de 2012 (Habeas Data) | Pendiente |
| RNF-07 | Compatibilidad | Navegadores móviles y de escritorio | Diseño adaptable; sin pruebas multidispositivo |
| RNF-08 | Escalabilidad | Soportar muchos negocios | Cada negocio está aislado; sin pruebas de carga |
| RNF-09 | Mantenibilidad | Código versionado y con pruebas | Versionado en Git; sin pruebas automatizadas |
| RNF-10 | Costo | Suscripción accesible por negocio | Suscripción mensual configurable (40.000 COP por defecto) |

## Arquitectura (modelo C4)

### Nivel 1: contexto

| Elemento | Tipo | Descripción |
|----------|------|-------------|
| Cliente final | Persona | Hace pedidos por WhatsApp (menú digital) o en el mostrador |
| Cajero / propietario | Persona | Registra pedidos, cobra, gestiona menú, inventario y reportes |
| Cocinero | Persona | Consulta y actualiza el estado de los pedidos |
| Administrador de la plataforma | Persona | Crea y suspende negocios desde la consola |
| Motorizado | Persona | Recibe los pedidos despachados |
| **Fast Order Cúcuta** | Sistema | Centraliza pedidos, tablero de cocina e inventario |
| WhatsApp | Sistema externo | Canal de entrada de pedidos |
| Cloudflare Tunnel | Sistema externo | Enlace público para abrir el menú digital desde datos móviles |

### Nivel 2: contenedores

| Contenedor | Tecnología | Responsabilidad |
|------------|------------|-----------------|
| Aplicación de caja y cocina | HTML, JavaScript, Tailwind CSS (`index.html`, `app.js`) | Toma de pedidos, Kanban, inventario, reportes |
| Menú digital del cliente | HTML y JavaScript (`menu.html`) | Pedido de autoservicio desde el enlace de WhatsApp |
| Consola de administración | HTML y JavaScript (`admin.html`) | Gestión de negocios y suscripciones |
| Servidor | Node.js sin frameworks, REST y SSE (`server.js`) | Autenticación, sincronización, bot, enlaces cortos |
| Integración WhatsApp | `whatsapp-web.js` dentro de `server.js` | Recibe mensajes, responde y crea pedidos |
| Persistencia | Archivos JSON (`database.json`, `db/`) | Negocios, catálogos, recetas, inventario y pedidos |
| Almacenamiento del navegador | `localStorage` | Estado local y cola de pedidos sin sincronizar |

### Nivel 3: módulos

| Módulo | Dónde está | Responsabilidad |
|--------|-----------|-----------------|
| Pedidos | `app.js` (`Pedido`, `ItemPedido`, `PedidoService`) | Creación, modificaciones y totales |
| Cocina (Kanban) | `app.js` (`renderKitchenKanban`, `avanzarEstadoTicket`) y `server.js` | Estados, cronómetros y protección contra retrocesos |
| Inventario | `app.js` (`Receta`, `Insumo`, `MovimientoInventario`) | Recetas, descuento, umbrales, entradas y mermas |
| Menú y catálogo | `app.js` (`Producto`, modal de platos) | Alta, edición y baja de platos |
| Reportes | `app.js` (`renderDailyReportsAndMetrics`) | Cierre de caja por período |
| Mensajería | `server.js` (`procesarFlujoHibridoWhatsApp`) | Bot de opciones, atención humana y enlaces cortos |
| Sesión y roles | `server.js` (`/api/auth/login`) y `app.js` (`PERMISOS_POR_ROL`) | Validación de claves y pestañas por rol |
| Multi-negocio | `server.js` (`guardarNegocioAislado`) y `admin.html` | Aislamiento y administración de negocios |
| Sincronización | `server.js` (`/api/sync`) y `app.js` | Cola offline y reconexión sin duplicados |

### Nivel 4: clases del dominio (`app.js`)

`Modificacion`, `Receta`, `Producto`, `ItemPedido`, `Insumo`, `MovimientoInventario`, `Pedido`, `Negocio` y `PedidoService`. Un `Pedido` tiene varios `ItemPedido`, cada ítem varias `Modificacion`, y un `Producto` consume `Insumo` mediante su `Receta`.

## Flujo de un pedido

```
Cliente escribe por WhatsApp ─► bot ofrece: 1) pedir  2) asesor ─► envía enlace /m/<código>
                                                                          │
Cajero toma el pedido en caja ───────────┐          Cliente arma su pedido en menu.html
                                         ▼                                │
                                  POST /api/sync          POST /api/menu-digital/order
                                         └───────────────┬────────────────┘
                                                         ▼
                         El servidor registra el pedido (PENDIENTE) y descuenta inventario
                                                         │
                                                         ▼
                                        Evento SSE ─► tablero de cocina (sonido y cronómetro)
                                                         │
                         Cocina: PENDIENTE ─► EN PREPARACIÓN ─► DESPACHADO
                                                         │
                         Se guardan las marcas de tiempo (ingreso, preparación, despacho)
```

## Modelo de datos

Cada negocio es un objeto independiente (`db/<ID>.json`); `database.json` los agrupa.

| Entidad | Campos principales |
|---------|--------------------|
| **Negocio** | `id`, `usuarioLogin`, `claveAcceso`, `claveCajero`, `claveCocina`, `nombre`, `barrio`, `propietario`, `whatsappLinea`, `suscripcionMensual`, `estadoSuscripcion`, `motorizados`, `botWhatsAppActivo`, `nextTicketNumber` |
| **Producto** (`catalogo`) | `id`, `nombre`, `categoria`, `precio`, `imagen`, `descripcion`, `ingredientes`, `adiciones`, `tiempo`, `receta` |
| **Insumo** (`insumos`) | `id`, `nombre`, `unidad`, `stockActual`, `umbralMinimo`, `costoUnitario` |
| **Pedido** (`pedidos`) | `id`, `canal`, `estado`, `fechaIngreso`, `fechaPreparacion`, `fechaDespacho`, `clienteNombre`, `telefono`, `direccionDomicilio`, `metodoPago`, `motorizado`, `items`, `total` |
| **Ítem de pedido** | `productoId`, `nombreProducto`, `cantidad`, `precioUnitario`, `modificaciones` |
| **Modificación** | `id`, `tipo` (`sin_ingrediente`, `extra`…), `descripcion`, `precioExtra` |
| **Movimiento** (`movimientos`) | `id`, `insumoId`, `tipo` (`entrada`, `consumo`, `merma`), `cantidad`, `unidad`, `motivo`, `fecha` |
| **Mensaje de WhatsApp** (`mensajesWhatsApp`) | `clienteNombre`, `telefono`, `texto`, `tipoEvento`, `urlMenu`, `fecha` |

## Decisiones de diseño

1. **Aplicación web sobre app nativa:** menor costo y despliegue inmediato, sin tiendas de aplicaciones.
2. **Servidor sin frameworks:** Node.js con módulos nativos para mantener pocas dependencias (solo `whatsapp-web.js` y `qrcode`).
3. **Eventos en tiempo real (SSE):** la cocina ve el pedido sin refrescar, con una conexión más simple que WebSockets.
4. **Un negocio por archivo:** el aislamiento evita que un negocio sobrescriba los datos de otro.
5. **Botones predefinidos en lugar de texto libre:** reducen errores y aceleran el registro.
6. **Menú digital en lugar de interpretar texto:** el cliente arma el pedido con opciones exactas, y así se evitan malentendidos con mensajes de chat.
7. **Funcionar sin internet en caja:** los fines de semana son el momento crítico y la conectividad es un riesgo conocido.

## Cambios frente a la idea inicial

| Aspecto | Idea inicial (Sprint 1) | Aplicación actual |
|---------|-------------------------|-------------------|
| Tiempo real | WebSockets | Server-Sent Events (SSE) |
| Base de datos | PostgreSQL o MySQL | Archivos JSON, un archivo por negocio |
| Cola sin internet | IndexedDB y service worker | `localStorage` y cola de sincronización |
| WhatsApp | WhatsApp Business API (webhook) | `whatsapp-web.js` con QR, más un webhook compatible |
| Recepción de pedidos de WhatsApp | Interpretar el mensaje del cliente | Bot de opciones y **menú digital** con enlace corto |
| Negocios | Un negocio piloto | **Varios negocios aislados** con consola de administración y suscripción |
| Despliegue | Nube (AWS, Google Cloud o Azure) | Servidor local con túnel de Cloudflare |
| Funciones agregadas | No estaban | Gestión del menú, ticket térmico, cronómetros y sonido en cocina, bandeja de WhatsApp, reporte de cierre imprimible |
| Seguridad | Roles, HTTPS, respaldos diarios | Roles implementados; claves sin cifrar, sin token ni respaldos automáticos |
