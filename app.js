// ============================================================================
// FAST ORDER CÚCUTA - SISTEMA EN PRODUCCIÓN (PWA + TIEMPO REAL MULTI-NEGOCIO)
// Arquitectura C4: Login por Credenciales de Negocio + Sincronización Caja/KDS
// ============================================================================

/* ==================== 1. MODELO DE DOMINIO (C4 NIVEL 4) ==================== */

const EstadoPedido = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  EN_PREPARACION: 'EN_PREPARACION',
  DESPACHADO: 'DESPACHADO'
});

class Modificacion {
  constructor(id, tipo, descripcion, costoExtra = 0, icono = '🏷️', ajusteInsumo = null) {
    this.id = id;
    this.tipo = tipo; // 'sin_ingrediente' | 'extra' | 'aparte'
    this.descripcion = descripcion;
    this.costoExtra = Number(costoExtra) || 0;
    this.icono = icono;
    this.ajusteInsumo = ajusteInsumo;
  }

  aplicarA(itemPedido) {
    if (!itemPedido.modificaciones.some(m => m.descripcion === this.descripcion)) {
      itemPedido.modificaciones.push({
        id: this.id,
        tipo: this.tipo,
        descripcion: this.descripcion,
        costoExtra: this.costoExtra,
        icono: this.icono,
        ajusteInsumo: this.ajusteInsumo
      });
    }
    return itemPedido;
  }
}

class Receta {
  constructor(productoId, listaInsumos = {}) {
    this.productoId = productoId;
    this.listaInsumos = listaInsumos;
  }

  calcularConsumo(cantidad = 1, modificaciones = []) {
    const consumo = {};
    Object.entries(this.listaInsumos).forEach(([insumoId, cantBase]) => {
      consumo[insumoId] = cantBase * cantidad;
    });

    modificaciones.forEach(mod => {
      if (mod.ajusteInsumo) {
        const { insumoId, delta } = mod.ajusteInsumo;
        if (delta === 'omitir') {
          delete consumo[insumoId];
        } else if (typeof delta === 'number') {
          consumo[insumoId] = (consumo[insumoId] || 0) + (delta * cantidad);
        }
      }
    });

    return consumo;
  }
}

function generarAdicionesInicialesPorDefecto(categoria = '', nombre = '') {
  const cat = String(categoria || '').toLowerCase();
  const nom = String(nombre || '').toLowerCase();
  if (cat.includes('bebida') || cat.includes('gaseosa') || cat.includes('jugo')) {
    return [];
  }
  const base = [];
  if (cat.includes('hamburguesa') || cat.includes('parrilla') || cat.includes('asado') || nom.includes('hamburguesa')) {
    base.push({ id: 'add_carne', nombre: 'Adición Carne', precio: 6000 });
  }
  if (cat.includes('perro') || cat.includes('salchipapa') || nom.includes('perro') || nom.includes('salchipapa')) {
    base.push({ id: 'add_salchicha', nombre: 'Salchicha Extra', precio: 4000 });
  }
  base.push(
    { id: 'add_queso', nombre: 'Extra Queso', precio: 3000 },
    { id: 'add_tocineta', nombre: 'Adición Tocineta', precio: 4000 },
    { id: 'add_papa', nombre: 'Porción Papas', precio: 5000 }
  );
  return base;
}

class Producto {
  constructor({ id, nombre, categoria, precio, imagen, descripcion, tiempo, icono, receta, ingredientes = [], adiciones = undefined }) {
    this.id = id;
    this.nombre = nombre;
    this.categoria = categoria;
    this.precio = Number(precio);
    this.imagen = imagen || 'IMAGENES PARA PEDIR/ESPECIAL.jpg';
    const descLimpia = String(descripcion || 'Preparado al instante con ingredientes frescos.').split('• Ingredientes:')[0].trim();
    this.descripcion = descLimpia || 'Preparado al instante con ingredientes frescos.';
    this.tiempo = tiempo || '10 min';
    this.icono = icono || 'fa-clock';
    const rawReceta = receta instanceof Receta ? receta.listaInsumos : (receta || { carne: 1, pan: 1, queso: 0.03, salsa: 0.02 });
    this.receta = new Receta(id, rawReceta);
    this.ingredientes = Array.isArray(ingredientes) ? ingredientes : [];
    const rawAdiciones = Array.isArray(adiciones)
      ? adiciones
      : generarAdicionesInicialesPorDefecto(categoria, nombre);
    this.adiciones = rawAdiciones
      .map((a, idx) => ({
        id: a.id || `add_${idx}_${Date.now()}`,
        nombre: String(a.nombre || a.descripcion || '').replace(/^[➕+]\s*/, '').trim(),
        precio: Number(a.precio ?? a.costoExtra ?? a.precioExtra ?? 0) || 0
      }))
      .filter(a => a.nombre);
  }

  obtenerReceta() {
    return this.receta;
  }

  obtenerIngredientes() {
    if (Array.isArray(this.ingredientes) && this.ingredientes.length > 0) {
      return this.ingredientes;
    }
    return [];
  }

  obtenerAdiciones() {
    return Array.isArray(this.adiciones) ? this.adiciones : [];
  }
}

class ItemPedido {
  constructor({ id, productoId, nombreProducto, cantidad = 1, precioUnitario, imagen = '', modificaciones = [], notas = '' }) {
    this.id = id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.productoId = productoId;
    this.nombreProducto = nombreProducto;
    this.cantidad = Number(cantidad) || 1;
    this.precioUnitario = Number(precioUnitario) || 0;
    this.imagen = imagen;
    this.modificaciones = modificaciones;
    this.notas = notas;
  }

  costoModificacionesUnitario() {
    return this.modificaciones.reduce((acc, m) => acc + (Number(m.costoExtra ?? m.precioExtra) || 0), 0);
  }

  subtotal() {
    return (this.precioUnitario + this.costoModificacionesUnitario()) * this.cantidad;
  }
}

class Insumo {
  constructor({ id, nombre, unidad, stockActual, umbralMinimo, costoUnitario }) {
    this.id = id;
    this.nombre = nombre;
    this.unidad = unidad;
    this.stockActual = Number(stockActual);
    this.umbralMinimo = Number(umbralMinimo);
    this.costoUnitario = Number(costoUnitario);
  }

  descontar(cantidad) {
    const cant = Number(cantidad) || 0;
    this.stockActual = Math.max(0, Number((this.stockActual - cant).toFixed(2)));
    return this.stockActual;
  }

  agregar(cantidad) {
    const cant = Number(cantidad) || 0;
    this.stockActual = Number((this.stockActual + cant).toFixed(2));
    return this.stockActual;
  }

  requiereAlerta() {
    return this.stockActual <= this.umbralMinimo;
  }
}

class MovimientoInventario {
  constructor({ id, negocioId, insumoId, insumoNombre, tipo, cantidad, unidad, motivo = '', fecha = null }) {
    this.id = id || `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.negocioId = negocioId || 'FOC-01';
    this.insumoId = insumoId;
    this.insumoNombre = insumoNombre;
    this.tipo = tipo; // 'entrada' | 'consumo' | 'merma'
    this.cantidad = Number(cantidad);
    this.unidad = unidad;
    this.motivo = motivo;
    this.fecha = fecha || new Date().toISOString();
  }

  registrar(listaMovimientos) {
    listaMovimientos.unshift(this);
    return this;
  }
}

class Pedido {
  constructor({
    id,
    negocioId = 'FOC-01',
    canal = 'caja',
    estado = EstadoPedido.PENDIENTE,
    fechaIngreso = null,
    fechaCreacion = null,
    fechaPreparacion = null,
    fechaDespacho = null,
    clienteNombre = 'Mesa 1',
    telefono = '',
    direccionDomicilio = '',
    motorizado = 'En local (Sin motorizado)',
    metodoPago = 'Efectivo',
    items = [],
    sincronizado = true,
    inventarioDescontado = false
  }) {
    const estadoUpper = String(estado || EstadoPedido.PENDIENTE).toUpperCase();
    const estadoNormalizado = estadoUpper.includes('PREP')
      ? EstadoPedido.EN_PREPARACION
      : (estadoUpper.includes('DESP') || estadoUpper.includes('LISTO') || estadoUpper.includes('ENTREG'))
        ? EstadoPedido.DESPACHADO
        : EstadoPedido.PENDIENTE;

    this.id = id;
    this.negocioId = negocioId;
    this.canal = canal;
    this.estado = estadoNormalizado;
    this.fechaIngreso = fechaIngreso || fechaCreacion || new Date().toISOString();
    this.fechaPreparacion = fechaPreparacion;
    this.fechaDespacho = fechaDespacho;
    this.clienteNombre = clienteNombre;
    this.telefono = telefono;
    this.direccionDomicilio = direccionDomicilio;
    this.motorizado = motorizado;
    this.metodoPago = metodoPago;
    this.items = items.map(it => (it instanceof ItemPedido ? it : new ItemPedido(it)));
    this.sincronizado = sincronizado;
    this.inventarioDescontado = inventarioDescontado;
    this.total = this.calcularTotal();
  }

  crear() {
    this.fechaIngreso = new Date().toISOString();
    this.estado = EstadoPedido.PENDIENTE;
    this.total = this.calcularTotal();
    return this;
  }

  calcularTotal() {
    this.total = this.items.reduce((acc, item) => acc + item.subtotal(), 0);
    return this.total;
  }

  totalAdiciones() {
    return this.items.reduce((acc, item) => acc + (item.costoModificacionesUnitario() * item.cantidad), 0);
  }

  cambiarEstado(nuevoEstado) {
    const ahora = new Date().toISOString();
    this.estado = nuevoEstado;
    if (nuevoEstado === EstadoPedido.EN_PREPARACION && !this.fechaPreparacion) {
      this.fechaPreparacion = ahora;
    }
    if (nuevoEstado === EstadoPedido.DESPACHADO && !this.fechaDespacho) {
      if (!this.fechaPreparacion) this.fechaPreparacion = ahora;
      this.fechaDespacho = ahora;
    }
    return this;
  }

  tiempoDespachoMinutos() {
    if (!this.fechaDespacho) return null;
    const ms = new Date(this.fechaDespacho) - new Date(this.fechaIngreso);
    return Math.max(1, Math.round(ms / 60000));
  }
}

class Negocio {
  constructor({
    id,
    usuarioLogin,
    claveAcceso = '1234',
    claveCajero = '2222',
    claveCocina = '3333',
    nombre,
    barrio,
    propietario,
    whatsappLinea,
    especialidad,
    icono = '🔥',
    suscripcionMensual = 40000,
    estadoSuscripcion = 'Activa',
    motorizados = [],
    catalogo = [],
    insumos = [],
    pedidos = [],
    movimientos = [],
    mensajesWhatsApp = [],
    nextTicketNumber = 101,
    botWhatsAppActivo = true
  }) {
    this.id = id;
    this.usuarioLogin = (usuarioLogin || id).toLowerCase().trim();
    this.claveAcceso = claveAcceso || '1234';
    this.claveCajero = claveCajero || '2222';
    this.claveCocina = claveCocina || '3333';
    this.nombre = nombre;
    this.barrio = barrio;
    this.propietario = propietario;
    this.whatsappLinea = whatsappLinea;
    this.especialidad = especialidad;
    this.icono = icono;
    this.suscripcionMensual = Number(suscripcionMensual) || 40000;
    this.estadoSuscripcion = estadoSuscripcion;
    this.motorizados = motorizados.length > 0 ? motorizados : [
      'En local (Sin motorizado)',
      'Domiciliario 1 - Camilo R. (Moto KLM-45D)',
      'Domiciliario 2 - Jhonatan P. (Moto XYZ-98F)'
    ];
    this.catalogo = catalogo.map(p => (p instanceof Producto ? p : new Producto(p)));
    this.insumos = insumos.map(i => (i instanceof Insumo ? i : new Insumo(i)));
    this.pedidos = pedidos.map(p => (p instanceof Pedido ? p : new Pedido({ ...p, negocioId: id })));
    this.movimientos = movimientos.map(m => (m instanceof MovimientoInventario ? m : new MovimientoInventario({ ...m, negocioId: id })));
    this.mensajesWhatsApp = Array.isArray(mensajesWhatsApp) ? mensajesWhatsApp : [];
    this.nextTicketNumber = nextTicketNumber;
    this.botWhatsAppActivo = botWhatsAppActivo !== false;
  }
}

class PedidoService {
  get negocio() {
    return obtenerNegocioActivo();
  }

  crearDesdeCaja(datosPedido) {
    const neg = this.negocio;
    const id = `#ORD-${neg.nextTicketNumber++}`;
    const pedido = new Pedido({
      id,
      negocioId: neg.id,
      canal: datosPedido.canal || 'caja',
      clienteNombre: datosPedido.clienteNombre || 'Mesa 1',
      telefono: datosPedido.telefono || '',
      direccionDomicilio: datosPedido.direccionDomicilio || '',
      motorizado: datosPedido.motorizado || neg.motorizados[0],
      metodoPago: datosPedido.metodoPago || 'Efectivo',
      items: datosPedido.items,
      sincronizado: appState.isOnline
    }).crear();

    this.descontarInventarioPorPedido(pedido, neg);

    if (!appState.isOnline) {
      appState.offlineQueue.push({ negocioId: neg.id, pedidoId: pedido.id });
    }

    neg.pedidos.unshift(pedido);
    guardarYSincronizarEstado('nuevo_pedido');
    reproducirSonidoCocina();
    return pedido;
  }

  crearDesdeWhatsApp(datosWa) {
    const neg = this.negocio;
    const id = `#ORD-${neg.nextTicketNumber++}`;
    const pedido = new Pedido({
      id,
      negocioId: neg.id,
      canal: 'WhatsApp',
      clienteNombre: datosWa.clienteNombre || 'Cliente WhatsApp',
      telefono: datosWa.telefono || '',
      direccionDomicilio: datosWa.direccionDomicilio || `Domicilio ${neg.barrio}`,
      motorizado: datosWa.motorizado || (neg.motorizados[1] || neg.motorizados[0]),
      metodoPago: datosWa.metodoPago || 'Nequi / Transferencia',
      items: datosWa.items,
      sincronizado: appState.isOnline
    }).crear();

    this.descontarInventarioPorPedido(pedido, neg);

    if (!appState.isOnline) {
      appState.offlineQueue.push({ negocioId: neg.id, pedidoId: pedido.id });
    }

    neg.pedidos.unshift(pedido);
    guardarYSincronizarEstado('nuevo_pedido_wa');
    reproducirSonidoCocina();
    return pedido;
  }

  cambiarEstado(pedidoId, nuevoEstado) {
    const neg = this.negocio;
    const pedido = neg.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return null;
    pedido.cambiarEstado(nuevoEstado);

    if (nuevoEstado === EstadoPedido.DESPACHADO && !pedido.inventarioDescontado) {
      this.descontarInventarioPorPedido(pedido, neg);
    }

    registrarEstadoKDSLocal(neg.id, pedido);
    guardarYSincronizarEstado('cambio_estado_kds');
    return pedido;
  }

  descontarInventarioPorPedido(pedido, neg = this.negocio) {
    if (pedido.inventarioDescontado) return;

    pedido.items.forEach(item => {
      const producto = neg.catalogo.find(
        p => p.id === item.productoId || p.nombre.toLowerCase() === item.nombreProducto.toLowerCase()
      );
      if (!producto) return;

      const consumoMap = producto.obtenerReceta().calcularConsumo(item.cantidad, item.modificaciones);
      Object.entries(consumoMap).forEach(([insumoId, cantidadConsumida]) => {
        const insumo = neg.insumos.find(i => i.id === insumoId);
        if (insumo && cantidadConsumida > 0) {
          insumo.descontar(cantidadConsumida);
          const mov = new MovimientoInventario({
            negocioId: neg.id,
            insumoId: insumo.id,
            insumoNombre: insumo.nombre,
            tipo: 'consumo',
            cantidad: cantidadConsumida,
            unidad: insumo.unidad,
            motivo: `Venta ${item.cantidad}x ${producto.nombre} (${pedido.id})`
          });
          mov.registrar(neg.movimientos);
        }
      });
    });

    pedido.inventarioDescontado = true;
  }
}

/* ==================== 2. MODIFICADORES E INSUMOS BASE ==================== */

const MODIFICADORES_CATALOGO = [
  // Sin ingredientes base (compatibilidad con parser WhatsApp e inventario)
  new Modificacion('mod_sin_cebolla', 'sin_ingrediente', 'Sin Cebolla', 0, '🚫', { insumoId: 'cebolla', delta: 'omitir' }),
  new Modificacion('mod_sin_ripio', 'sin_ingrediente', 'Sin Ripio', 0, '🚫', { insumoId: 'ripio', delta: 'omitir' }),
  new Modificacion('mod_sin_queso', 'sin_ingrediente', 'Sin Queso', 0, '🚫', { insumoId: 'queso', delta: 'omitir' }),
  new Modificacion('mod_sin_tocineta', 'sin_ingrediente', 'Sin Tocineta', 0, '🚫', { insumoId: 'tocineta', delta: 'omitir' }),
  new Modificacion('mod_sin_salsas', 'sin_ingrediente', 'Sin Salsas', 0, '🚫', { insumoId: 'salsa', delta: 'omitir' }),
  new Modificacion('mod_sin_vegetales', 'sin_ingrediente', 'Sin Vegetales', 0, '🚫', null),

  // Preparación / Empaque comida
  new Modificacion('mod_salsa_aparte', 'aparte', 'Salsas Aparte', 0, '🥣', null),
  new Modificacion('mod_termino_34', 'aparte', 'Término 3/4', 0, '🥩', null),
  new Modificacion('mod_bien_asada', 'aparte', 'Bien Asada', 0, '🔥', null),
  new Modificacion('mod_para_llevar', 'aparte', 'Empaque Llevar', 1000, '🛍️', null),

  // Adiciones pagas según tipo de comida
  new Modificacion('mod_extra_carne', 'extra', '+Adición Carne', 6000, '🥩', { insumoId: 'carne', delta: 1 }),
  new Modificacion('mod_extra_salchicha', 'extra', '+Salchicha Extra', 4000, '🌭', { insumoId: 'salchicha', delta: 1 }),
  new Modificacion('mod_extra_queso', 'extra', '+Extra Queso', 3000, '🧀', { insumoId: 'queso', delta: 0.04 }),
  new Modificacion('mod_extra_tocineta', 'extra', '+Adición Tocineta', 4000, '🥓', { insumoId: 'tocineta', delta: 2 }),
  new Modificacion('mod_extra_papa', 'extra', '+Porción Papas', 5000, '🍟', { insumoId: 'papa', delta: 0.2 }),

  // Modificadores exclusivos para Bebidas y Jugos
  new Modificacion('mod_bien_fria', 'aparte', 'Bien Fría', 0, '❄️', null),
  new Modificacion('mod_al_clima', 'aparte', 'Al Clima', 0, '🌡️', null),
  new Modificacion('mod_sin_hielo', 'sin_ingrediente', 'Sin Hielo', 0, '🧊', null),
  new Modificacion('mod_con_hielo', 'aparte', 'Vaso con Hielo', 0, '🧊', null),
  new Modificacion('mod_bajo_azucar', 'aparte', 'Bajo en Azúcar', 0, '🍬', null)
];

function detectarInsumoPorNombreIngrediente(nombreIng) {
  const n = (nombreIng || '').toLowerCase();
  if (n.includes('cebolla')) return { insumoId: 'cebolla', delta: 'omitir' };
  if (n.includes('ripio')) return { insumoId: 'ripio', delta: 'omitir' };
  if (n.includes('queso')) return { insumoId: 'queso', delta: 'omitir' };
  if (n.includes('tocineta')) return { insumoId: 'tocineta', delta: 'omitir' };
  if (n.includes('salsa') || n.includes('tártara') || n.includes('tartara')) return { insumoId: 'salsa', delta: 'omitir' };
  if (n.includes('salchicha')) return { insumoId: 'salchicha', delta: 'omitir' };
  if (n.includes('papa')) return { insumoId: 'papa', delta: 'omitir' };
  if (n.includes('carne')) return { insumoId: 'carne', delta: 'omitir' };
  return null;
}

function obtenerGruposModificadoresPorProducto(prod) {
  if (!prod) return { quitar: [], adiciones: [] };

  // 1. Generar "Quitar ingrediente" directamente a partir de los ingredientes configurados en el plato
  const listaIngredientes = prod.obtenerIngredientes ? prod.obtenerIngredientes() : (prod.ingredientes || []);

  const quitar = listaIngredientes.map(ing => {
    const slug = String(ing).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const ajuste = detectarInsumoPorNombreIngrediente(ing);
    return new Modificacion(
      `mod_sin_${slug}`,
      'sin_ingrediente',
      `Sin ${ing}`,
      0,
      '🚫',
      ajuste
    );
  });

  // 2. Generar "Adiciones" directamente a partir de las adiciones configuradas por el administrador para este plato
  const listaAdiciones = prod.obtenerAdiciones ? prod.obtenerAdiciones() : (prod.adiciones || []);

  const adiciones = listaAdiciones.map((add, idx) => {
    const nombreLimpio = String(add.nombre || '').replace(/^[➕+]\s*/, '').trim();
    const slug = (add.id || nombreLimpio || idx).toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const ajusteInsumo = detectarInsumoPorNombreIngrediente(nombreLimpio);
    return new Modificacion(
      add.id || `mod_add_${slug}`,
      'extra',
      `+${nombreLimpio}`,
      Number(add.precio) || 0,
      '➕',
      ajusteInsumo ? { insumoId: ajusteInsumo.insumoId, delta: 1 } : null
    );
  });

  return {
    quitar,
    adiciones
  };
}

function obtenerModificadoresParaProducto(prod) {
  const grupos = obtenerGruposModificadoresPorProducto(prod);
  return [...grupos.quitar, ...grupos.adiciones];
}

function clonarInsumosBase(factorStock = 1, alertaInicialQueso = false) {
  return [
    { id: 'carne', nombre: 'Carne de Res / Parrilla (150g)', unidad: 'Porciones', stockActual: Math.round(45 * factorStock), umbralMinimo: 15, costoUnitario: 3800 },
    { id: 'pan', nombre: 'Pan Brioche Artesanal', unidad: 'Unidades', stockActual: Math.round(40 * factorStock), umbralMinimo: 18, costoUnitario: 1200 },
    { id: 'queso', nombre: 'Queso Costeño / Mozzarella', unidad: 'Kg', stockActual: alertaInicialQueso ? 1.5 : Number((3.8 * factorStock).toFixed(1)), umbralMinimo: 2.0, costoUnitario: 18000 },
    { id: 'salchicha', nombre: 'Salchicha Manguera / Ranchera', unidad: 'Unidades', stockActual: Math.round(55 * factorStock), umbralMinimo: 15, costoUnitario: 1500 },
    { id: 'panPerro', nombre: 'Pan Suave para Perro', unidad: 'Unidades', stockActual: Math.round(35 * factorStock), umbralMinimo: 12, costoUnitario: 900 },
    { id: 'tocineta', nombre: 'Tocineta Ahumada Tajada', unidad: 'Lonjas', stockActual: Math.round(50 * factorStock), umbralMinimo: 15, costoUnitario: 950 },
    { id: 'papa', nombre: 'Papa a la Francesa / Criolla', unidad: 'Kg', stockActual: Number((10.0 * factorStock).toFixed(1)), umbralMinimo: 3.0, costoUnitario: 7500 },
    { id: 'ripio', nombre: 'Ripio de Papa Crocante', unidad: 'Kg', stockActual: Number((2.4 * factorStock).toFixed(1)), umbralMinimo: 0.8, costoUnitario: 9000 },
    { id: 'cebolla', nombre: 'Cebolla Fresca Picada', unidad: 'Kg', stockActual: Number((2.0 * factorStock).toFixed(1)), umbralMinimo: 0.5, costoUnitario: 5500 },
    { id: 'salsa', nombre: 'Salsas de la Casa (Tártara/Ajo)', unidad: 'Litros', stockActual: Number((3.5 * factorStock).toFixed(1)), umbralMinimo: 1.0, costoUnitario: 11000 },
    { id: 'bebidas', nombre: 'Bebidas Refrigeradas (Gaseosa/Jugo)', unidad: 'Unidades', stockActual: Math.round(36 * factorStock), umbralMinimo: 10, costoUnitario: 2600 }
  ];
}

/* ==================== 3. CUENTAS DE NEGOCIOS CONFIGURADAS EN EL SERVIDOR ==================== */

function construirNegociosIniciales() {
  const ahora = Date.now();

  // 1. NEGOCIO PRINCIPAL: "AL CARBÓN" (Usuario: alcarbon | Dueño: 1234 | Cajero: 2222 | Cocina: 3333)
  const negAlCarbon = new Negocio({
    id: 'FOC-01',
    usuarioLogin: 'alcarbon',
    claveAcceso: '1234',
    claveCajero: '2222',
    claveCocina: '3333',
    nombre: 'Al Carbón Parrilla & Burgers',
    barrio: 'Cúcuta • Sede Principal',
    propietario: 'Administración Al Carbón',
    whatsappLinea: '314 888 9999',
    especialidad: 'Asados al Carbón, Hamburguesas & Comida Rápida',
    icono: '🔥',
    suscripcionMensual: 40000,
    estadoSuscripcion: 'Activa',
    nextTicketNumber: 104,
    motorizados: [
      'En local (Sin motorizado)',
      'Domiciliario 1 - Camilo R. (Moto KLM-45D)',
      'Domiciliario 2 - Jhonatan P. (Moto XYZ-98F)',
      'Domiciliario 3 - Brayan G. (Domicilios Al Carbón)'
    ],
    catalogo: [
      {
        id: 'p1',
        nombre: 'Hamburguesa Especial Al Carbón',
        categoria: 'Hamburguesas',
        precio: 18000,
        imagen: 'IMAGENES PARA PEDIR/ESPECIAL.jpg',
        descripcion: 'Carne 150g asada al carbón, tocineta ahumada, queso costeño, cebolla, ripio y salsas de la casa.',
        ingredientes: ['Tocineta ahumada', 'Queso costeño', 'Cebolla', 'Ripio de papa', 'Salsas de la casa'],
        tiempo: '10-12 min',
        icono: 'fa-fire',
        receta: { carne: 1, pan: 1, queso: 0.04, tocineta: 2, ripio: 0.03, salsa: 0.02, cebolla: 0.015 }
      },
      {
        id: 'p2',
        nombre: 'Hamburguesa Clásica Al Carbón',
        categoria: 'Hamburguesas',
        precio: 14000,
        imagen: 'IMAGENES PARA PEDIR/CLASICA.jpg',
        descripcion: 'Carne de res al carbón 120g, queso fundido, tomate, lechuga, cebolla y salsa tradicional.',
        ingredientes: ['Queso fundido', 'Tomate', 'Lechuga', 'Cebolla', 'Salsa tradicional'],
        tiempo: '8-10 min',
        icono: 'fa-fire',
        receta: { carne: 1, pan: 1, queso: 0.03, salsa: 0.02, cebolla: 0.015 }
      },
      {
        id: 'p3',
        nombre: 'Hamburguesa Doble Carne Al Carbón',
        categoria: 'Hamburguesas',
        precio: 24000,
        imagen: 'IMAGENES PARA PEDIR/DOBLE-CARNE.jpg',
        descripcion: 'Doble corte de res 300g al carbón, doble queso, tocineta crocante, cebolla asada, ripio y salsas.',
        ingredientes: ['Doble queso', 'Tocineta crocante', 'Cebolla asada', 'Ripio de papa', 'Salsas'],
        tiempo: '14 min',
        icono: 'fa-fire',
        receta: { carne: 2, pan: 1, queso: 0.06, tocineta: 2, ripio: 0.03, salsa: 0.03, cebolla: 0.025 }
      },
      {
        id: 'p4',
        nombre: 'Perro Caliente con Tocineta',
        categoria: 'Perros',
        precio: 15000,
        imagen: 'IMAGENES PARA PEDIR/PERRO-CALIENTE-TOCINETA.jpg',
        descripcion: 'Salchicha premium asada envuelta en tocineta, queso gratinado, cebolla, ripio y salsa tártara.',
        ingredientes: ['Tocineta', 'Queso gratinado', 'Cebolla', 'Ripio de papa', 'Salsa tártara'],
        tiempo: '8-10 min',
        icono: 'fa-clock',
        receta: { salchicha: 1, panPerro: 1, queso: 0.04, tocineta: 2, ripio: 0.03, salsa: 0.025, cebolla: 0.015 }
      },
      {
        id: 'p5',
        nombre: 'Perro Caliente Tradicional',
        categoria: 'Perros',
        precio: 12000,
        imagen: 'IMAGENES PARA PEDIR/PERRO-CALIENTE-TOCINETA.jpg',
        descripcion: 'Salchicha manguera, queso costeño rallado, cebolla picada, repollo, ripio de papa y salsas.',
        ingredientes: ['Queso costeño rallado', 'Cebolla', 'Repollo', 'Ripio de papa', 'Salsas'],
        tiempo: '6-8 min',
        icono: 'fa-clock',
        receta: { salchicha: 1, panPerro: 1, queso: 0.03, cebolla: 0.02, salsa: 0.025, ripio: 0.025 }
      },
      {
        id: 'p6',
        nombre: 'Salchipapa Casera Al Carbón',
        categoria: 'Salchipapas',
        precio: 16000,
        imagen: 'IMAGENES PARA PEDIR/SALCHIPAPA CASERA.jpg',
        descripcion: 'Papas a la francesa crocantes, salchicha ranchera, queso costeño y salsa tártara.',
        ingredientes: ['Queso costeño', 'Salsa tártara'],
        tiempo: '10 min',
        icono: 'fa-clock',
        receta: { papa: 0.25, salchicha: 2, queso: 0.04, salsa: 0.025 }
      },
      {
        id: 'p7',
        nombre: 'Salchipapa Familiar Especial',
        categoria: 'Salchipapas',
        precio: 26000,
        imagen: 'IMAGENES PARA PEDIR/SALCHIPAPA FAMILIAR.jpg',
        descripcion: 'Papas fritas crocantes, 3 salchichas, carne al carbón picada, queso fundido, ripio y salsas.',
        ingredientes: ['Carne al carbón picada', 'Queso fundido', 'Ripio de papa', 'Salsas'],
        tiempo: '15 min',
        icono: 'fa-clock',
        receta: { papa: 0.4, salchicha: 3, carne: 1, queso: 0.08, salsa: 0.04, ripio: 0.02 }
      },
      {
        id: 'p8',
        nombre: 'Salchipapa Mixta Al Carbón',
        categoria: 'Salchipapas',
        precio: 29000,
        imagen: 'IMAGENES PARA PEDIR/SALCHIPAPA-MIXTA.jpg',
        descripcion: 'Papa francesa y criolla, trozos de carne y pechuga al carbón, tocineta, doble queso y salsas.',
        ingredientes: ['Papa criolla', 'Carne al carbón', 'Pechuga al carbón', 'Tocineta', 'Doble queso', 'Salsas'],
        tiempo: '16 min',
        icono: 'fa-fire',
        receta: { papa: 0.45, salchicha: 3, carne: 2, tocineta: 2, queso: 0.09, salsa: 0.045 }
      },
      {
        id: 'p9',
        nombre: 'Gaseosa Postobón Manzana 400ml',
        categoria: 'Bebidas',
        precio: 4000,
        imagen: 'IMAGENES PARA PEDIR/postobon 400ml.jpg',
        descripcion: 'Botella personal 400ml bien helada.',
        ingredientes: [],
        tiempo: 'Fría',
        icono: 'fa-snowflake',
        receta: { bebidas: 1 }
      },
      {
        id: 'p10',
        nombre: 'Coca-Cola Original 400ml',
        categoria: 'Bebidas',
        precio: 5000,
        imagen: 'IMAGENES PARA PEDIR/COCA COLA 400ml.png',
        descripcion: 'Botella personal 400ml helada.',
        ingredientes: [],
        tiempo: 'Fría',
        icono: 'fa-snowflake',
        receta: { bebidas: 1 }
      },
      {
        id: 'p11',
        nombre: 'Jugo Natural de Maracuyá',
        categoria: 'Bebidas',
        precio: 6000,
        imagen: 'IMAGENES PARA PEDIR/JUGO-DE-MARACUYA.jpg',
        descripcion: 'Vaso 16oz preparado con fruta natural.',
        ingredientes: ['Hielo', 'Azúcar'],
        tiempo: 'Natural',
        icono: 'fa-glass-water',
        receta: { bebidas: 1 }
      }
    ],
    insumos: clonarInsumosBase(1.0, true),
    pedidos: [
      {
        id: '#ORD-103',
        negocioId: 'FOC-01',
        canal: 'caja',
        estado: EstadoPedido.PENDIENTE,
        fechaIngreso: new Date(ahora - 3 * 60000).toISOString(),
        clienteNombre: 'Mesa 4',
        direccionDomicilio: 'Consumo en Mesa 4',
        motorizado: 'En local (Sin motorizado)',
        metodoPago: 'Efectivo',
        inventarioDescontado: true,
        items: [
          { productoId: 'p1', nombreProducto: 'Hamburguesa Especial Al Carbón', cantidad: 1, precioUnitario: 18000, imagen: 'IMAGENES PARA PEDIR/ESPECIAL.jpg', modificaciones: [{ id: 'mod_sin_cebolla', tipo: 'sin_ingrediente', descripcion: 'Sin Cebolla', costoExtra: 0, icono: '🚫' }] },
          { productoId: 'p11', nombreProducto: 'Jugo Natural de Maracuyá', cantidad: 1, precioUnitario: 6000, imagen: 'IMAGENES PARA PEDIR/JUGO-DE-MARACUYA.jpg', modificaciones: [] }
        ]
      },
      {
        id: '#ORD-102',
        negocioId: 'FOC-01',
        canal: 'WhatsApp',
        estado: EstadoPedido.EN_PREPARACION,
        fechaIngreso: new Date(ahora - 8 * 60000).toISOString(),
        fechaPreparacion: new Date(ahora - 5 * 60000).toISOString(),
        clienteNombre: 'Carlos Mendoza',
        telefono: '312 456 7890',
        direccionDomicilio: 'Barrio Los Pinos Calle 14 #5-20',
        motorizado: 'Domiciliario 1 - Camilo R. (Moto KLM-45D)',
        metodoPago: 'Nequi / Transferencia',
        inventarioDescontado: true,
        items: [
          { productoId: 'p3', nombreProducto: 'Hamburguesa Doble Carne Al Carbón', cantidad: 1, precioUnitario: 24000, imagen: 'IMAGENES PARA PEDIR/DOBLE-CARNE.jpg', modificaciones: [{ id: 'mod_extra_queso', tipo: 'extra', descripcion: '+Extra Queso', costoExtra: 3000, icono: '🧀' }] },
          { productoId: 'p8', nombreProducto: 'Salchipapa Mixta Al Carbón', cantidad: 1, precioUnitario: 29000, imagen: 'IMAGENES PARA PEDIR/SALCHIPAPA-MIXTA.jpg', modificaciones: [] }
        ]
      },
      {
        id: '#ORD-101',
        negocioId: 'FOC-01',
        canal: 'caja',
        estado: EstadoPedido.DESPACHADO,
        fechaIngreso: new Date(ahora - 24 * 60000).toISOString(),
        fechaPreparacion: new Date(ahora - 21 * 60000).toISOString(),
        fechaDespacho: new Date(ahora - 12 * 60000).toISOString(),
        clienteNombre: 'Mostrador - Andrea S.',
        telefono: '315 987 6543',
        direccionDomicilio: 'Para llevar en mostrador',
        motorizado: 'En local (Sin motorizado)',
        metodoPago: 'Efectivo',
        inventarioDescontado: true,
        items: [
          { productoId: 'p2', nombreProducto: 'Hamburguesa Clásica Al Carbón', cantidad: 2, precioUnitario: 14000, imagen: 'IMAGENES PARA PEDIR/CLASICA.jpg', modificaciones: [{ id: 'mod_para_llevar', tipo: 'aparte', descripcion: 'Empaque Llevar', costoExtra: 1000, icono: '🛍️' }] }
        ]
      }
    ],
    movimientos: [
      { negocioId: 'FOC-01', insumoId: 'carne', insumoNombre: 'Carne de Res / Parrilla (150g)', tipo: 'entrada', cantidad: 50, unidad: 'Porciones', motivo: 'Inventario inicial apertura turno noche', fecha: new Date(ahora - 120 * 60000).toISOString() }
    ]
  });

  // 2. SEGUNDO NEGOCIO EN EL SERVIDOR: Perradas La 15 (Usuario: la15 | Dueño: 1234 | Cajero: 2222 | Cocina: 3333)
  const negLa15 = new Negocio({
    id: 'FOC-02',
    usuarioLogin: 'la15',
    claveAcceso: '1234',
    claveCajero: '2222',
    claveCocina: '3333',
    nombre: 'Perradas & Salchipapas La 15',
    barrio: 'Ciudadela Juan Atalaya',
    propietario: 'María Fernanda Vera',
    whatsappLinea: '311 234 5678',
    especialidad: 'Perros Venezolanos & Salchipapas',
    icono: '🌭',
    suscripcionMensual: 40000,
    estadoSuscripcion: 'Activa',
    nextTicketNumber: 202,
    motorizados: [
      'En local (Sin motorizado)',
      'Domiciliario Atalaya - Wilmer T. (Moto NRT-12C)'
    ],
    catalogo: [
      { id: 'p4', nombre: 'Perro Caliente Venezolano Full', categoria: 'Perros', precio: 10000, imagen: 'IMAGENES PARA PEDIR/PERRO-CALIENTE-TOCINETA.jpg', descripcion: 'Salchicha manguera, repollo, cebolla, queso costeño y tártara.', ingredientes: ['Repollo', 'Cebolla', 'Queso costeño', 'Ripio de papa', 'Salsa tártara'], tiempo: '6 min', icono: 'fa-clock', receta: { salchicha: 1, panPerro: 1, queso: 0.03, cebolla: 0.02, salsa: 0.025, ripio: 0.025 } },
      { id: 'p8', nombre: 'Salchipapa Salvaje Mixta', categoria: 'Salchipapas', precio: 27000, imagen: 'IMAGENES PARA PEDIR/SALCHIPAPA-MIXTA.jpg', descripcion: 'Papas criollas y francesas, carne, pechuga, tocineta y doble queso.', ingredientes: ['Papa criolla', 'Carne', 'Pechuga', 'Tocineta', 'Doble queso', 'Salsas'], tiempo: '14 min', icono: 'fa-clock', receta: { papa: 0.45, salchicha: 3, carne: 2, tocineta: 2, queso: 0.09, salsa: 0.045 } },
      { id: 'p10', nombre: 'Coca-Cola 400ml', categoria: 'Bebidas', precio: 4500, imagen: 'IMAGENES PARA PEDIR/COCA COLA 400ml.png', descripcion: 'Botella personal fría.', ingredientes: [], tiempo: 'Fría', icono: 'fa-snowflake', receta: { bebidas: 1 } }
    ],
    insumos: clonarInsumosBase(1.2, false),
    pedidos: [],
    movimientos: []
  });

  return [negAlCarbon, negLa15];
}

/* ==================== 4. SINCRONIZACIÓN EN TIEMPO REAL Y ALMACENAMIENTO ==================== */

const STORAGE_KEY = 'FAST_ORDER_PRODUCTION_V7';
const KDS_STATUS_MAP_KEY = 'FAST_ORDER_KDS_STATUS_MAP_V1';
const API_BASE = window.location.protocol.startsWith('http') ? '' : 'http://localhost:3000';

function rangoEstadoKDS(estado) {
  const est = String(estado || EstadoPedido.PENDIENTE).toUpperCase();
  if (est.includes('DESP') || est.includes('LISTO') || est.includes('ENTREG')) return 3;
  if (est.includes('PREP')) return 2;
  return 1;
}

function obtenerMapaEstadosKDSLocal() {
  try {
    const raw = localStorage.getItem(KDS_STATUS_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function registrarEstadoKDSLocal(negocioId, pedido) {
  if (!negocioId || !pedido || !pedido.id) return;
  try {
    const mapa = obtenerMapaEstadosKDSLocal();
    const key = `${negocioId}:${pedido.id}`;
    mapa[key] = {
      estado: pedido.estado,
      fechaPreparacion: pedido.fechaPreparacion || null,
      fechaDespacho: pedido.fechaDespacho || null,
      updatedAt: Date.now()
    };
    localStorage.setItem(KDS_STATUS_MAP_KEY, JSON.stringify(mapa));
  } catch (e) {}
}

function protegerEstadosKDSDeNegocio(negInstanciado, negPrevio = null) {
  if (!negInstanciado || !Array.isArray(negInstanciado.pedidos)) return false;
  const mapaLocal = obtenerMapaEstadosKDSLocal();
  const mapaPrevio = new Map(
    (negPrevio && Array.isArray(negPrevio.pedidos) ? negPrevio.pedidos : []).map(p => [p.id, p])
  );
  let huboCambio = false;

  negInstanciado.pedidos.forEach(p => {
    if (!p || !p.id) return;
    const key = `${negInstanciado.id}:${p.id}`;
    const guardadoLocal = mapaLocal[key];
    const guardadoMem = mapaPrevio.get(p.id);

    // Elegir siempre el estado más avanzado (DESPACHADO > EN_PREPARACION > PENDIENTE)
    let mejorEstado = p.estado;
    let mejorPrep = p.fechaPreparacion;
    let mejorDesp = p.fechaDespacho;

    if (guardadoMem && rangoEstadoKDS(guardadoMem.estado) > rangoEstadoKDS(mejorEstado)) {
      mejorEstado = guardadoMem.estado;
      mejorPrep = guardadoMem.fechaPreparacion || mejorPrep;
      mejorDesp = guardadoMem.fechaDespacho || mejorDesp;
    }
    if (guardadoLocal && rangoEstadoKDS(guardadoLocal.estado) > rangoEstadoKDS(mejorEstado)) {
      mejorEstado = guardadoLocal.estado;
      mejorPrep = guardadoLocal.fechaPreparacion || mejorPrep;
      mejorDesp = guardadoLocal.fechaDespacho || mejorDesp;
    }

    if (rangoEstadoKDS(mejorEstado) > rangoEstadoKDS(p.estado)) {
      p.estado = mejorEstado;
      p.fechaPreparacion = mejorPrep || new Date().toISOString();
      if (mejorEstado === EstadoPedido.DESPACHADO) {
        p.fechaDespacho = mejorDesp || new Date().toISOString();
      }
      huboCambio = true;
    }

    // Si el pedido ya viene en preparación o despachado, asegurarlo también en el mapa local
    if (rangoEstadoKDS(p.estado) > 1) {
      registrarEstadoKDSLocal(negInstanciado.id, p);
    }
  });

  return huboCambio;
}
let realtimeChannel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    realtimeChannel = new BroadcastChannel('fast_order_cucuta_realtime');
  }
} catch (e) {}

function crearEstadoInicialPorDefecto() {
  const negocios = construirNegociosIniciales();
  return {
    sesionIniciada: false,
    negocioActivoId: 'FOC-01',
    negocios,
    rolActivo: 'propietario', // 'propietario' | 'cajero' | 'cocina'
    activeTab: 'tab-pos',
    isOnline: true,
    offlineQueue: [],
    selectedCategory: 'all',
    selectedChannel: 'caja',
    selectedCartIdx: null,
    cart: [],
    filtroMovimientos: 'todos'
  };
}

let appState = cargarEstadoLocal();
let pedidoService = new PedidoService();
let toastTimeout = null;

function obtenerNegocioActivo() {
  return appState.negocios.find(n => n.id === appState.negocioActivoId) || appState.negocios[0];
}

function serializarNegocioIndividual(n) {
  if (!n) return null;
  return {
    ...n,
    movimientos: (n.movimientos || []).slice(0, 60),
    catalogo: (n.catalogo || []).map(p => ({
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      precio: p.precio,
      imagen: p.imagen,
      descripcion: p.descripcion,
      ingredientes: p.obtenerIngredientes ? p.obtenerIngredientes() : (p.ingredientes || []),
      adiciones: p.obtenerAdiciones ? p.obtenerAdiciones() : (p.adiciones || []),
      tiempo: p.tiempo,
      icono: p.icono,
      receta: p.receta ? p.receta.listaInsumos : []
    }))
  };
}

function serializarNegocios() {
  return appState.negocios.map(n => serializarNegocioIndividual(n));
}

function guardarYSincronizarEstado(accion = 'update') {
  try {
    const negociosSerializados = serializarNegocios();
    const negActivoObj = obtenerNegocioActivo();
    const negActivoSerializado = serializarNegocioIndividual(negActivoObj);

    const serializable = {
      sesionIniciada: appState.sesionIniciada,
      negocioActivoId: appState.negocioActivoId,
      rolActivo: appState.rolActivo,
      isOnline: appState.isOnline,
      offlineQueue: appState.offlineQueue,
      negocios: negociosSerializados
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));

    // 1. Sincronizar instantáneamente entre pestañas abiertas del mismo equipo (Caja <-> Cocina)
    if (realtimeChannel && appState.isOnline) {
      realtimeChannel.postMessage({
        accion,
        negocioId: appState.negocioActivoId,
        negocio: negActivoSerializado,
        negocios: negociosSerializados
      });
    }

    // 2. Sincronizar de forma aislada en el servidor solo el negocio activo
    if (appState.isOnline) {
      return fetch(`${API_BASE}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion,
          negocioId: appState.negocioActivoId,
          negocio: accion === 'init_seed' ? null : negActivoSerializado,
          negocios: accion === 'init_seed' ? negociosSerializados : [negActivoSerializado]
        })
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Error guardando estado:', e);
  }
  return Promise.resolve();
}

function guardarEstadoLocal() {
  return guardarYSincronizarEstado('local');
}

function cargarEstadoLocal() {
  const base = crearEstadoInicialPorDefecto();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    if (saved && Array.isArray(saved.negocios) && saved.negocios.length > 0) {
      base.sesionIniciada = Boolean(saved.sesionIniciada);
      base.negocioActivoId = saved.negocioActivoId || 'FOC-01';
      base.rolActivo = saved.rolActivo || 'propietario';
      base.isOnline = true;
      base.offlineQueue = [];
      base.negocios = saved.negocios.map(n => {
        const inst = new Negocio(n);
        protegerEstadosKDSDeNegocio(inst);
        return inst;
      });
    }
  } catch (e) {}
  return base;
}

function aplicarActualizacionRemota(negociosRemotos, accion, negocioIdEvento = null) {
  if (!Array.isArray(negociosRemotos) || negociosRemotos.length === 0) return;

  // Aislamiento estricto: si la sesión está iniciada en el Negocio A y llega un evento del Negocio B, ignorarlo
  if (appState.sesionIniciada && negocioIdEvento && negocioIdEvento !== appState.negocioActivoId) {
    return;
  }

  let requirioCorreccionKDS = false;

  negociosRemotos.forEach(remoto => {
    if (!remoto || !remoto.id) return;
    if (appState.sesionIniciada && remoto.id !== appState.negocioActivoId) return;
    const instanciado = new Negocio(remoto);
    const idx = appState.negocios.findIndex(n => n.id === instanciado.id);
    const previo = idx >= 0 ? appState.negocios[idx] : null;
    if (protegerEstadosKDSDeNegocio(instanciado, previo)) {
      requirioCorreccionKDS = true;
    }
    if (idx >= 0) {
      appState.negocios[idx] = instanciado;
    } else {
      appState.negocios.push(instanciado);
    }
  });

  if (requirioCorreccionKDS) {
    guardarYSincronizarEstado('sync_kds_fix');
  } else {
    try {
      const serializable = {
        sesionIniciada: appState.sesionIniciada,
        negocioActivoId: appState.negocioActivoId,
        rolActivo: appState.rolActivo,
        isOnline: appState.isOnline,
        offlineQueue: appState.offlineQueue,
        negocios: serializarNegocios()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {}
  }

  renderAll();
  if (accion === 'nuevo_pedido' || accion === 'nuevo_pedido_wa') {
    reproducirSonidoCocina();
    if (appState.rolActivo === 'cocina') {
      showToast('🔔 ¡Nueva comanda recibida en Cocina!');
    }
  }
}

function iniciarEscuchaTiempoReal() {
  // Escuchar otras ventanas/pestañas locales
  if (realtimeChannel) {
    realtimeChannel.onmessage = (event) => {
      if (!appState.isOnline) return;
      if (event.data) {
        const lista = event.data.negocio ? [event.data.negocio] : event.data.negocios;
        aplicarActualizacionRemota(lista, event.data.accion, event.data.negocioId);
      }
    };
  }

  // Escuchar cambios en localStorage desde otras pestañas
  window.addEventListener('storage', (ev) => {
    if (ev.key === STORAGE_KEY && ev.newValue && appState.isOnline) {
      try {
        const parsed = JSON.parse(ev.newValue);
        if (parsed && parsed.negocios) {
          aplicarActualizacionRemota(parsed.negocios, 'storage', parsed.negocioActivoId);
        }
      } catch (e) {}
    }
  });

  // Conectar al servidor local Node.js pidiendo únicamente los datos del negocio activo si hay sesión iniciada
  const queryNegocio = appState.sesionIniciada && appState.negocioActivoId
    ? `?negocioId=${encodeURIComponent(appState.negocioActivoId)}`
    : '';
  fetch(`${API_BASE}/api/state${queryNegocio}`)
    .then(r => r.json())
    .then(res => {
      if (res && res.ok && res.data && Array.isArray(res.data.negocios) && res.data.negocios.length > 0) {
        aplicarActualizacionRemota(res.data.negocios, 'init');
      } else {
        guardarYSincronizarEstado('init_seed');
      }
      if (res && res.waStatus) {
        actualizarUIEstadoWhatsApp(res.waStatus);
      }
    })
    .catch(() => {});

  try {
    const evtSource = new EventSource(`${API_BASE}/api/stream`);
    evtSource.addEventListener('sync', (e) => {
      if (!appState.isOnline) return;
      const data = JSON.parse(e.data);
      if (data) {
        const lista = data.negocio ? [data.negocio] : data.negocios;
        aplicarActualizacionRemota(lista, data.accion, data.negocioId);
      }
    });

    evtSource.addEventListener('wa_status', (e) => {
      try {
        const status = JSON.parse(e.data);
        actualizarUIEstadoWhatsApp(status);
      } catch (err) {}
    });

    evtSource.addEventListener('wa_incoming_message', (e) => {
      try {
        const payload = JSON.parse(e.data);
        procesarMensajeWhatsAppEntranteEnVivo(payload);
      } catch (err) {}
    });

    evtSource.addEventListener('wa_menu_link_sent', (e) => {
      try {
        const payload = JSON.parse(e.data);
        mostrarEnvioLinkMenuEnChat(payload);
      } catch (err) {}
    });

    evtSource.addEventListener('wa_menu_digital_order', (e) => {
      try {
        const payload = JSON.parse(e.data);
        procesarPedidoMenuDigitalEnVivo(payload);
      } catch (err) {}
    });
  } catch (e) {}
}

function reproducirSonidoCocina() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {}
}

function restaurarDatosFabrica() {
  if (!confirm('¿Estás seguro de reiniciar todos los datos de demostración?')) return;
  localStorage.removeItem(STORAGE_KEY);
  appState = crearEstadoInicialPorDefecto();
  guardarYSincronizarEstado('reset');
  sincronizarPantallaLogin();
  sincronizarVistaRol();
  renderAll();
  showToast('🔄 Sistema reiniciado con los datos base.');
}

/* ==================== 5. LOGIN REAL POR USUARIO Y CONTRASEÑA DE NEGOCIO ==================== */

function seleccionarRolEnLogin(rol, btnEl) {
  const inputRol = document.getElementById('login-role-input');
  if (inputRol) inputRol.value = rol;

  document.querySelectorAll('.login-role-card').forEach(c => {
    c.className = 'login-role-card p-2.5 rounded-xl border border-slate-800 bg-slate-950/70 hover:border-slate-700 text-center transition cursor-pointer';
  });
  if (btnEl) {
    btnEl.className = 'login-role-card p-2.5 rounded-xl border border-orange-500 bg-orange-950/30 ring-1 ring-orange-500/40 text-center transition cursor-pointer';
  }
}

function validarClaveDeNegocioPorRol(negocioObj, rol, claveIngresada) {
  const rolClean = String(rol || 'propietario').trim().toLowerCase();
  const mapaClaves = {
    propietario: {
      clave: String(negocioObj?.claveAcceso || '1234').trim(),
      etiqueta: 'Dueño'
    },
    cajero: {
      clave: String(negocioObj?.claveCajero || '2222').trim(),
      etiqueta: 'Cajero'
    },
    cocina: {
      clave: String(negocioObj?.claveCocina || '3333').trim(),
      etiqueta: 'Cocina'
    }
  };
  const cfg = mapaClaves[rolClean] || mapaClaves.propietario;
  return {
    ok: String(claveIngresada || '').trim() === cfg.clave,
    etiqueta: cfg.etiqueta,
    claveEsperada: cfg.clave
  };
}

function autocompletarCredencialesDemo(usuario) {
  const userInput = document.getElementById('login-username-input');
  const pinInput = document.getElementById('login-pin-input');
  if (userInput) userInput.value = usuario;
  if (pinInput) pinInput.value = '1234';
}

async function procesarFormularioLogin(event) {
  if (event) event.preventDefault();
  const userInput = document.getElementById('login-username-input');
  const pinInput = document.getElementById('login-pin-input');
  const rolInput = document.getElementById('login-role-input');

  const usuario = (userInput?.value || '').trim().toLowerCase();
  const clave = (pinInput?.value || '').trim();
  const rol = rolInput?.value || 'propietario';

  // Si escribe "admin", redirige al portal privado admin.html del dueño del software
  if (usuario === 'admin' && (clave === 'admin' || clave === '1234')) {
    window.location.href = 'admin.html';
    return;
  }

  // 1. Intentar autenticación real y aislada en el servidor (/api/auth/login)
  try {
    // Sincronizar primero la lista fresca de negocios desde el archivo de base de datos del servidor
    try {
      const stateResp = await fetch(`${API_BASE}/api/state?negocioId=admin`);
      const stateJson = await stateResp.json();
      if (stateJson && stateJson.ok && stateJson.data && Array.isArray(stateJson.data.negocios)) {
        stateJson.data.negocios.forEach(remoto => {
          if (!remoto || !remoto.id) return;
          const inst = new Negocio(remoto);
          const i = appState.negocios.findIndex(n => n.id === inst.id);
          if (i >= 0) appState.negocios[i] = inst;
          else appState.negocios.push(inst);
        });
      }
    } catch (e) {}

    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, clave, rol })
    });
    const data = await resp.json();

    if (data && data.isAdmin) {
      window.location.href = 'admin.html';
      return;
    }

    if (resp.ok && data && data.ok && data.negocio) {
      const negocioAislado = new Negocio(data.negocio);
      const val = validarClaveDeNegocioPorRol(negocioAislado, rol, clave);
      if (!val.ok) {
        showToast(`❌ Contraseña incorrecta para el rol de ${val.etiqueta}.`, true);
        return;
      }
      const idx = appState.negocios.findIndex(n => n.id === negocioAislado.id);
      const previo = idx >= 0 ? appState.negocios[idx] : null;
      protegerEstadosKDSDeNegocio(negocioAislado, previo);
      if (idx >= 0) {
        appState.negocios[idx] = negocioAislado;
      } else {
        appState.negocios.push(negocioAislado);
      }
      iniciarSesionDirecta(negocioAislado.id, rol, data.waStatus || null);
      return;
    }

    if (resp.status === 404 || resp.status === 403) {
      showToast(`❌ ${data.error || 'Acceso denegado'}`, true);
      return;
    }
  } catch (err) {
    // Fallback local si el servidor no responde
  }

  // Buscar el negocio al que pertenece ese usuario o ID
  const negocioEncontrado = appState.negocios.find(
    n => n.usuarioLogin.toLowerCase() === usuario || n.id.toLowerCase() === usuario
  );

  if (!negocioEncontrado) {
    showToast(`❌ No existe ningún negocio con el usuario "${usuario}". Verifica tus datos.`, true);
    return;
  }

  const validacionLocal = validarClaveDeNegocioPorRol(negocioEncontrado, rol, clave);
  if (!validacionLocal.ok) {
    showToast(`❌ Contraseña incorrecta para el rol de ${validacionLocal.etiqueta}.`, true);
    return;
  }

  iniciarSesionDirecta(negocioEncontrado.id, rol);
}

function limpiarCamposDeFormulariosPorCambioDeSesion(neg) {
  appState.cart = [];
  appState.selectedCartIdx = null;
  appState.selectedCategory = 'all';
  appState.selectedChannel = 'caja';
  appState.filtroMovimientos = 'todos';

  const custName = document.getElementById('cust-name');
  const custPhone = document.getElementById('cust-phone');
  const custNotes = document.getElementById('cust-notes');
  const custAddr = document.getElementById('cust-address');
  const custPay = document.getElementById('cust-payment');
  const waName = document.getElementById('wa-sender-name');
  const waAddr = document.getElementById('wa-sender-address');
  const waInput = document.getElementById('wa-custom-input');

  if (custName) custName.value = 'Mesa 1';
  if (custPhone) custPhone.value = '';
  if (custNotes) custNotes.value = '';
  if (custAddr) custAddr.value = '';
  if (custPay) custPay.value = 'Efectivo';
  if (waName) waName.value = '';
  if (waAddr) waAddr.value = '';
  if (waInput) waInput.value = '';

  switchChannel('counter');
}

function iniciarSesionDirecta(negocioId, rol, waStatusInicial = null) {
  const neg = appState.negocios.find(n => n.id === negocioId) || appState.negocios[0];
  appState.negocioActivoId = neg.id;
  appState.rolActivo = rol;
  appState.sesionIniciada = true;

  // Si un perfil nuevo (como FOC-03 / prueba) quedó con insumos heredados sin tener platos ni movimientos propios, limpiarlo
  if (neg.id !== 'FOC-01' && neg.id !== 'FOC-02' && neg.catalogo.length === 0 && neg.pedidos.length === 0 && neg.movimientos.length === 0 && neg.insumos.some(i => i.id === 'carne' && i.stockActual === 192)) {
    neg.insumos = [];
  }

  limpiarCamposDeFormulariosPorCambioDeSesion(neg);

  if (waPollTimer) {
    clearInterval(waPollTimer);
    waPollTimer = null;
  }

  // Limpiar estado visual de WhatsApp antes de cargar el exclusivo de este negocio
  actualizarUIEstadoWhatsApp(waStatusInicial || {
    negocioId: neg.id,
    connected: false,
    statusText: 'Desconectado (Listo para vincular QR)',
    phoneNumber: null,
    qrDataUrl: null
  });

  if (!waStatusInicial) {
    fetch(`${API_BASE}/api/state?negocioId=${encodeURIComponent(neg.id)}`)
      .then(r => r.json())
      .then(res => {
        if (res && res.waStatus) {
          actualizarUIEstadoWhatsApp(res.waStatus);
        }
      })
      .catch(() => {});
  }

  sincronizarPantallaLogin();
  sincronizarVistaRol();
  renderAll();
  guardarEstadoLocal();

  const nombreRol = PERMISOS_POR_ROL[rol]?.nombre || rol;
  showToast(`🔓 Sesión iniciada en "${neg.nombre}" • Perfil: ${nombreRol}`);
}

async function cerrarSesionActual() {
  try {
    await guardarYSincronizarEstado('logout_sync');
  } catch (e) {}
  appState.sesionIniciada = false;
  const pinInput = document.getElementById('login-pin-input');
  if (pinInput) pinInput.value = '';
  limpiarCamposDeFormulariosPorCambioDeSesion(null);
  guardarEstadoLocal();
  sincronizarPantallaLogin();
  showToast('🔒 Sesión cerrada correctamente.');
}

function mostrarPanelProveedorSaaS(mostrar) {
  const clientCard = document.getElementById('client-login-card');
  const vendorCard = document.getElementById('saas-vendor-card');
  if (!clientCard || !vendorCard) return;

  if (mostrar) {
    renderLoginScreenData();
    clientCard.classList.add('hidden');
    vendorCard.classList.remove('hidden');
  } else {
    renderLoginScreenData();
    vendorCard.classList.add('hidden');
    clientCard.classList.remove('hidden');
  }
}

function sincronizarPantallaLogin() {
  const loginOverlay = document.getElementById('login-portal-overlay');
  if (!loginOverlay) return;

  if (appState.sesionIniciada) {
    loginOverlay.classList.add('hidden');
  } else {
    renderLoginScreenData();
    mostrarPanelProveedorSaaS(false);
    loginOverlay.classList.remove('hidden');
  }
}

function renderLoginScreenData() {
  const adminCardsContainer = document.getElementById('login-saas-clients-list');
  if (adminCardsContainer) {
    adminCardsContainer.innerHTML = appState.negocios.map(n => {
      const ventasN = n.pedidos.reduce((a, p) => a + (p.total || 0), 0);
      return `
        <div class="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-orange-500/40 transition flex flex-col justify-between gap-2.5">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-base">${n.icono}</span>
                <span class="font-bold text-xs text-white">${n.nombre}</span>
                <span class="font-mono text-[10px] px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30">Usuario: <strong>${n.usuarioLogin}</strong></span>
                <span class="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">Clave: ${n.claveAcceso}</span>
              </div>
              <p class="text-[11px] text-slate-400 mt-1"><i class="fa-solid fa-location-dot text-slate-500 mr-1"></i>${n.barrio} • Propietario: <strong class="text-slate-300">${n.propietario}</strong></p>
            </div>
            <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-semibold">$${n.suscripcionMensual.toLocaleString('es-CO')}/mes</span>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
            <div class="text-slate-400 font-mono">
              <span>📋 ${n.catalogo.length} platos</span> • <span>🧾 ${n.pedidos.length} órdenes</span> • <span class="text-emerald-400 font-bold">Ventas: $${ventasN.toLocaleString('es-CO')}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="iniciarSesionDirecta('${n.id}', 'propietario')" class="px-2.5 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white font-semibold text-[10px] transition">
                Abrir como Dueño →
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  const mrrTotal = appState.negocios.reduce((acc, n) => acc + n.suscripcionMensual, 0);
  const elMrr = document.getElementById('saas-mrr-display');
  if (elMrr) elMrr.innerText = `$${mrrTotal.toLocaleString('es-CO')} COP / mes (${appState.negocios.length} negocios activos)`;
}

function abrirModalNuevoNegocioSaaS() {
  const modal = document.getElementById('modal-nuevo-negocio');
  if (!modal) return;
  const nombreEl = document.getElementById('neg-nombre-input');
  const userEl = document.getElementById('neg-usuario-input');
  const claveEl = document.getElementById('neg-clave-input');
  const barrioEl = document.getElementById('neg-barrio-input');
  const waEl = document.getElementById('neg-whatsapp-input');
  const propEl = document.getElementById('neg-propietario-input');
  const plantEl = document.getElementById('neg-plantilla-select');

  if (nombreEl) nombreEl.value = '';
  if (userEl) userEl.value = '';
  if (claveEl) claveEl.value = '1234';
  if (barrioEl) barrioEl.value = '';
  if (waEl) waEl.value = '';
  if (propEl) propEl.value = '';
  if (plantEl) plantEl.value = 'vacio';

  modal.classList.remove('hidden');
  setTimeout(() => { if (nombreEl) nombreEl.focus(); }, 60);
}

function cerrarModalNuevoNegocioSaaS() {
  const modal = document.getElementById('modal-nuevo-negocio');
  if (modal) modal.classList.add('hidden');
}

function sugerirUsuarioNuevoNegocio(nombreValor) {
  const userEl = document.getElementById('neg-usuario-input');
  if (!userEl) return;
  const limpio = String(nombreValor || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14);
  userEl.value = limpio;
}

async function guardarNuevoNegocioDesdeModal(event) {
  if (event) event.preventDefault();
  const nombre = (document.getElementById('neg-nombre-input')?.value || '').trim();
  const usuarioLogin = (document.getElementById('neg-usuario-input')?.value || '').trim().toLowerCase();
  const claveAcceso = (document.getElementById('neg-clave-input')?.value || '1234').trim();
  const barrio = (document.getElementById('neg-barrio-input')?.value || 'Cúcuta').trim();
  const whatsapp = (document.getElementById('neg-whatsapp-input')?.value || '300 000 0000').trim();
  const propietario = (document.getElementById('neg-propietario-input')?.value || 'Propietario').trim();
  const tipoMenu = document.getElementById('neg-plantilla-select')?.value || 'vacio';

  if (!nombre || !usuarioLogin) {
    showToast('❌ Completa el nombre del restaurante y su usuario de acceso.', true);
    return;
  }

  const nextIdx = appState.negocios.length + 1;
  const nuevoId = `FOC-0${nextIdx}`;

  const catalogoInicial = tipoMenu === 'plantilla' && appState.negocios[0]
    ? appState.negocios[0].catalogo.map(p => new Producto({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        precio: p.precio,
        imagen: p.imagen,
        descripcion: p.descripcion,
        ingredientes: p.obtenerIngredientes ? p.obtenerIngredientes() : (p.ingredientes || []),
        tiempo: p.tiempo,
        icono: p.icono,
        receta: p.receta ? p.receta.listaInsumos : []
      }))
    : [];

  const nuevoNegocio = new Negocio({
    id: nuevoId,
    usuarioLogin,
    claveAcceso,
    nombre,
    barrio,
    propietario,
    whatsappLinea: whatsapp,
    especialidad: 'Comidas Rápidas & Domicilios',
    icono: '🔥',
    suscripcionMensual: 40000,
    estadoSuscripcion: 'Activa',
    nextTicketNumber: 101,
    motorizados: [
      'En local (Sin motorizado)'
    ],
    catalogo: catalogoInicial,
    insumos: [],
    pedidos: [],
    movimientos: [],
    mensajesWhatsApp: []
  });

  try {
    const resp = await fetch(`${API_BASE}/api/negocios/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializarNegocioIndividual(nuevoNegocio))
    });
    const resData = await resp.json();
    if (!resp.ok || !resData.ok) {
      showToast(`❌ ${resData.error || 'No se pudo registrar el negocio'}`, true);
      return;
    }
    if (resData.negocio) {
      nuevoNegocio.id = resData.negocio.id;
    }
  } catch (e) {}

  appState.negocios.push(nuevoNegocio);
  cerrarModalNuevoNegocioSaaS();
  iniciarSesionDirecta(nuevoNegocio.id, 'propietario');
  showToast(`🎉 Base de datos creada para "${nuevoNegocio.nombre}" (Usuario: ${nuevoNegocio.usuarioLogin})`);
}

/* ==================== 6. GESTIÓN INTERACTIVA DEL MENÚ Y DOMICILIARIOS ==================== */

const FOTOS_GALERIA_RAPIDA = [
  { label: 'Especial', src: 'IMAGENES PARA PEDIR/ESPECIAL.jpg' },
  { label: 'Clásica', src: 'IMAGENES PARA PEDIR/CLASICA.jpg' },
  { label: 'Doble Carne', src: 'IMAGENES PARA PEDIR/DOBLE-CARNE.jpg' },
  { label: 'Perro', src: 'IMAGENES PARA PEDIR/PERRO-CALIENTE-TOCINETA.jpg' },
  { label: 'Salchi Mixta', src: 'IMAGENES PARA PEDIR/SALCHIPAPA-MIXTA.jpg' },
  { label: 'Salchi Casera', src: 'IMAGENES PARA PEDIR/SALCHIPAPA CASERA.jpg' },
  { label: 'Familiar', src: 'IMAGENES PARA PEDIR/SALCHIPAPA FAMILIAR.jpg' },
  { label: 'Maracuyá', src: 'IMAGENES PARA PEDIR/JUGO-DE-MARACUYA.jpg' },
  { label: 'Coca-Cola', src: 'IMAGENES PARA PEDIR/COCA COLA 400ml.png' },
  { label: 'Postobón', src: 'IMAGENES PARA PEDIR/postobon 400ml.jpg' }
];

const CANTIDAD_BASE_POR_INSUMO = {
  carne: 1,
  pan: 1,
  panPerro: 1,
  salchicha: 1,
  papa: 0.25,
  queso: 0.04,
  tocineta: 1,
  cebolla: 0.02,
  salsa: 0.025,
  ripio: 0.02,
  bebidas: 1
};

let modalPlatoImagenActual = 'IMAGENES PARA PEDIR/ESPECIAL.jpg';
let modalPlatoInsumosSeleccionados = new Set(['carne', 'pan', 'queso', 'salsa']);
let modalPlatoListaIngredientes = [];
let modalPlatoListaAdiciones = [];

function renderListaIngredientesModalPlato() {
  const container = document.getElementById('plato-lista-ingredientes-ui');
  const countEl = document.getElementById('plato-ingredientes-count');
  if (countEl) {
    countEl.innerText = `${modalPlatoListaIngredientes.length} ingrediente${modalPlatoListaIngredientes.length === 1 ? '' : 's'}`;
  }
  if (!container) return;

  if (modalPlatoListaIngredientes.length === 0) {
    container.innerHTML = `<span class="text-[11px] text-slate-500 italic">Aún no has añadido ingredientes a este plato.</span>`;
    return;
  }

  container.innerHTML = modalPlatoListaIngredientes.map((ing, idx) => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/40 text-orange-200 text-[11px] font-semibold">
      <span>${ing}</span>
      <button type="button" onclick="eliminarIngredienteDePlatoModal(${idx})" class="text-orange-400 hover:text-red-400 transition ml-0.5" title="Quitar ingrediente">
        <i class="fa-solid fa-xmark text-[10px]"></i>
      </button>
    </span>
  `).join('');
}

function agregarIngredienteAlPlatoModal() {
  const input = document.getElementById('plato-ingrediente-individual-input');
  if (!input) return;
  const valor = String(input.value || '').trim().replace(/\.$/, '');
  if (!valor) {
    input.focus();
    return;
  }
  const yaExiste = modalPlatoListaIngredientes.some(i => i.toLowerCase() === valor.toLowerCase());
  if (!yaExiste) {
    modalPlatoListaIngredientes.push(valor);
  }
  input.value = '';
  renderListaIngredientesModalPlato();
  input.focus();
}

function eliminarIngredienteDePlatoModal(idx) {
  if (idx >= 0 && idx < modalPlatoListaIngredientes.length) {
    modalPlatoListaIngredientes.splice(idx, 1);
    renderListaIngredientesModalPlato();
  }
}

function finalizarCapturaIngredientesModal() {
  const input = document.getElementById('plato-ingrediente-individual-input');
  if (input && String(input.value || '').trim() !== '') {
    agregarIngredienteAlPlatoModal();
  }
  const box = document.getElementById('plato-ingrediente-captura-box');
  const btnReabrir = document.getElementById('btn-reabrir-captura-ingredientes');
  if (box) box.classList.add('hidden');
  if (btnReabrir) btnReabrir.classList.remove('hidden');
}

function mostrarCapturaIngredientesModal(enfocar = true) {
  const box = document.getElementById('plato-ingrediente-captura-box');
  const btnReabrir = document.getElementById('btn-reabrir-captura-ingredientes');
  const input = document.getElementById('plato-ingrediente-individual-input');
  if (box) box.classList.remove('hidden');
  if (btnReabrir) btnReabrir.classList.add('hidden');
  if (enfocar && input) {
    input.focus();
  }
}

function renderListaAdicionesModalPlato() {
  const container = document.getElementById('plato-lista-adiciones-ui');
  const countEl = document.getElementById('plato-adiciones-count');
  if (countEl) {
    countEl.innerText = `${modalPlatoListaAdiciones.length} adici${modalPlatoListaAdiciones.length === 1 ? 'ón' : 'ones'}`;
  }
  if (!container) return;

  if (modalPlatoListaAdiciones.length === 0) {
    container.innerHTML = `<span class="text-[11px] text-slate-500 italic">Sin adiciones configuradas para este plato.</span>`;
    return;
  }

  container.innerHTML = modalPlatoListaAdiciones.map((add, idx) => {
    const precioTxt = Number(add.precio) > 0 ? ` (+$${Number(add.precio).toLocaleString('es-CO')})` : ' ($0)';
    return `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-[11px] font-semibold">
        <span>+${add.nombre}<strong class="font-mono text-emerald-400">${precioTxt}</strong></span>
        <button type="button" onclick="eliminarAdicionDePlatoModal(${idx})" class="text-emerald-400 hover:text-red-400 transition ml-0.5" title="Quitar adición">
          <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
      </span>
    `;
  }).join('');
}

function agregarAdicionAlPlatoModal() {
  const nombreInput = document.getElementById('plato-adicion-nombre-input');
  const precioInput = document.getElementById('plato-adicion-precio-input');
  if (!nombreInput) return;

  const nombre = String(nombreInput.value || '').replace(/^[➕+]\s*/, '').trim();
  const precio = Math.max(0, parseInt(precioInput?.value || '0', 10) || 0);

  if (!nombre) {
    nombreInput.focus();
    return;
  }

  const slug = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const idxExistente = modalPlatoListaAdiciones.findIndex(a => a.nombre.toLowerCase() === nombre.toLowerCase());
  if (idxExistente >= 0) {
    modalPlatoListaAdiciones[idxExistente].precio = precio;
  } else {
    modalPlatoListaAdiciones.push({
      id: `add_${slug}_${Date.now()}`,
      nombre,
      precio
    });
  }

  nombreInput.value = '';
  if (precioInput) precioInput.value = '';
  renderListaAdicionesModalPlato();
  nombreInput.focus();
}

function eliminarAdicionDePlatoModal(idx) {
  if (idx >= 0 && idx < modalPlatoListaAdiciones.length) {
    modalPlatoListaAdiciones.splice(idx, 1);
    renderListaAdicionesModalPlato();
  }
}

function finalizarCapturaAdicionesModal() {
  const nombreInput = document.getElementById('plato-adicion-nombre-input');
  if (nombreInput && String(nombreInput.value || '').trim() !== '') {
    agregarAdicionAlPlatoModal();
  }
  const box = document.getElementById('plato-adicion-captura-box');
  const btnReabrir = document.getElementById('btn-reabrir-captura-adiciones');
  if (box) box.classList.add('hidden');
  if (btnReabrir) btnReabrir.classList.remove('hidden');
}

function mostrarCapturaAdicionesModal(enfocar = true) {
  const box = document.getElementById('plato-adicion-captura-box');
  const btnReabrir = document.getElementById('btn-reabrir-captura-adiciones');
  const nombreInput = document.getElementById('plato-adicion-nombre-input');
  if (box) box.classList.remove('hidden');
  if (btnReabrir) btnReabrir.classList.add('hidden');
  if (enfocar && nombreInput) {
    nombreInput.focus();
  }
}

function obtenerCategoriasDelNegocio(neg) {
  const extraCats = (neg && Array.isArray(neg.catalogo) ? neg.catalogo : [])
    .map(p => (p.categoria || '').trim())
    .filter(Boolean);
  if (extraCats.length > 0) {
    return Array.from(new Set(extraCats));
  }
  return ['Hamburguesas', 'Perros', 'Salchipapas', 'Bebidas'];
}

function renderCategoryFilterButtons() {
  const container = document.getElementById('category-filters');
  if (!container) return;

  const neg = obtenerNegocioActivo();
  const catsConPlatos = Array.from(
    new Set((neg.catalogo || []).map(p => (p.categoria || '').trim()).filter(Boolean))
  );
  const todas = ['all', ...catsConPlatos];

  if (!todas.includes(appState.selectedCategory)) {
    appState.selectedCategory = 'all';
  }

  container.innerHTML = todas.map(cat => {
    const active = appState.selectedCategory.toLowerCase() === cat.toLowerCase();
    const label = cat === 'all' ? 'Todos' : cat;
    const cls = active
      ? 'cat-btn flex-1 justify-center text-center px-3 py-2 rounded-lg text-xs font-semibold bg-orange-600 text-white transition shadow-sm'
      : 'cat-btn flex-1 justify-center text-center px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
    return `<button type="button" onclick="seleccionarCategoriaMenu('${cat.replace(/'/g, "\\'")}')" class="${cls}" data-cat="${cat}">${label}</button>`;
  }).join('');
}

function seleccionarCategoriaMenu(categoria) {
  appState.selectedCategory = categoria;
  renderCategoryFilterButtons();
  renderProducts(categoria);
}

function poblarSelectCategoriasModal(categoriaSeleccionada = 'Hamburguesas') {
  const selectEl = document.getElementById('plato-categoria-select');
  const nuevaBox = document.getElementById('plato-nueva-categoria-box');
  const nuevaInput = document.getElementById('plato-nueva-categoria-input');
  if (!selectEl) return;

  const neg = obtenerNegocioActivo();
  const categorias = obtenerCategoriasDelNegocio(neg);

  selectEl.innerHTML = [
    ...categorias.map(c => `<option value="${c}">${c}</option>`),
    `<option value="__nueva__">➕ Crear nueva categoría...</option>`
  ].join('');

  if (categorias.includes(categoriaSeleccionada)) {
    selectEl.value = categoriaSeleccionada;
    if (nuevaBox) nuevaBox.classList.add('hidden');
    if (nuevaInput) nuevaInput.required = false;
  } else {
    selectEl.value = '__nueva__';
    if (nuevaBox) nuevaBox.classList.remove('hidden');
    if (nuevaInput) {
      nuevaInput.value = categoriaSeleccionada || '';
      nuevaInput.required = true;
    }
  }
}

function toggleInputNuevaCategoria(valor) {
  const nuevaBox = document.getElementById('plato-nueva-categoria-box');
  const nuevaInput = document.getElementById('plato-nueva-categoria-input');
  if (!nuevaBox || !nuevaInput) return;

  if (valor === '__nueva__') {
    nuevaBox.classList.remove('hidden');
    nuevaInput.required = true;
    nuevaInput.focus();
  } else {
    nuevaBox.classList.add('hidden');
    nuevaInput.required = false;
  }
}

function renderChipsInsumosModal() {
  const container = document.getElementById('plato-insumos-chips');
  if (!container) return;

  const neg = obtenerNegocioActivo();
  if (!Array.isArray(neg.insumos) || neg.insumos.length === 0) {
    container.innerHTML = `<span class="text-[11px] text-slate-400 italic">No hay insumos registrados aún en el inventario de este negocio (puedes agregarlos en la pestaña Inventario).</span>`;
    return;
  }
  container.innerHTML = neg.insumos.map(ins => {
    const activo = modalPlatoInsumosSeleccionados.has(ins.id);
    const cls = activo
      ? 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-orange-600/25 border border-orange-500 text-orange-300 transition flex items-center gap-1'
      : 'px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200 transition flex items-center gap-1';
    return `
      <button type="button" onclick="toggleInsumoRecetaModal('${ins.id}')" class="${cls}">
        <i class="fa-solid ${activo ? 'fa-check text-orange-400' : 'fa-plus text-slate-500'} text-[9px]"></i>
        <span>${ins.nombre.split('(')[0].trim()}</span>
      </button>
    `;
  }).join('');
}

function toggleInsumoRecetaModal(insumoId) {
  if (modalPlatoInsumosSeleccionados.has(insumoId)) {
    modalPlatoInsumosSeleccionados.delete(insumoId);
  } else {
    modalPlatoInsumosSeleccionados.add(insumoId);
  }
  renderChipsInsumosModal();
}

function renderGaleriaRapidaModal() {
  const galeria = document.getElementById('plato-galeria-rapida');
  if (!galeria) return;

  galeria.innerHTML = FOTOS_GALERIA_RAPIDA.map(item => {
    const seleccionada = modalPlatoImagenActual === item.src;
    const borderCls = seleccionada
      ? 'ring-2 ring-orange-500 border-orange-500'
      : 'border-slate-700 opacity-75 hover:opacity-100';
    return `
      <button type="button" onclick="seleccionarFotoGaleriaPlato('${item.src}')" class="relative h-11 rounded-lg overflow-hidden border ${borderCls} transition" title="${item.label}">
        <img src="${encodeURI(item.src)}" alt="${item.label}" class="w-full h-full object-cover"/>
      </button>
    `;
  }).join('');
}

function seleccionarFotoGaleriaPlato(src) {
  modalPlatoImagenActual = src;
  const preview = document.getElementById('plato-foto-preview');
  if (preview) {
    preview.src = src.startsWith('data:') ? src : encodeURI(src);
  }
  renderGaleriaRapidaModal();
}

function procesarArchivoFotoPlato(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Redimensionar a máximo 640px de ancho para almacenamiento rápido y sincronización ligera
      const maxW = 640;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      seleccionarFotoGaleriaPlato(dataUrl);
      showToast('📷 Foto cargada correctamente desde tu dispositivo.');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function abrirModalNuevoProducto() {
  const modal = document.getElementById('modal-nuevo-plato');
  if (!modal) return;

  document.getElementById('modal-plato-titulo').innerText = 'Añadir Nuevo Plato al Menú';
  document.getElementById('plato-edit-id').value = '';
  document.getElementById('plato-nombre-input').value = '';
  document.getElementById('plato-precio-input').value = '';
  document.getElementById('plato-descripcion-input').value = '';
  document.getElementById('plato-tiempo-input').value = '10 min';
  const ingIndInput = document.getElementById('plato-ingrediente-individual-input');
  if (ingIndInput) ingIndInput.value = '';
  const addNomInput = document.getElementById('plato-adicion-nombre-input');
  if (addNomInput) addNomInput.value = '';
  const addPrecioInput = document.getElementById('plato-adicion-precio-input');
  if (addPrecioInput) addPrecioInput.value = '';
  const fileInput = document.getElementById('plato-foto-file');
  if (fileInput) fileInput.value = '';

  const catInicial = appState.selectedCategory !== 'all' ? appState.selectedCategory : 'Hamburguesas';
  poblarSelectCategoriasModal(catInicial);

  modalPlatoListaIngredientes = [];
  modalPlatoListaAdiciones = [];
  renderListaIngredientesModalPlato();
  renderListaAdicionesModalPlato();
  mostrarCapturaIngredientesModal(false);
  mostrarCapturaAdicionesModal(false);

  modalPlatoInsumosSeleccionados = new Set(['carne', 'pan', 'queso', 'salsa']);
  seleccionarFotoGaleriaPlato('IMAGENES PARA PEDIR/ESPECIAL.jpg');

  modal.classList.remove('hidden');
}

function cerrarModalNuevoProducto() {
  const modal = document.getElementById('modal-nuevo-plato');
  if (modal) modal.classList.add('hidden');
}

function editarPrecioProducto(productoId, event) {
  if (event) event.stopPropagation();
  const neg = obtenerNegocioActivo();
  const prod = neg.catalogo.find(p => p.id === productoId);
  if (!prod) return;

  const modal = document.getElementById('modal-nuevo-plato');
  if (!modal) return;

  document.getElementById('modal-plato-titulo').innerText = `Editar Plato: ${prod.nombre}`;
  document.getElementById('plato-edit-id').value = prod.id;
  document.getElementById('plato-nombre-input').value = prod.nombre;
  document.getElementById('plato-precio-input').value = prod.precio;

  const partesDesc = (prod.descripcion || '').split('• Ingredientes:');
  document.getElementById('plato-descripcion-input').value = (partesDesc[0] || '').trim();
  document.getElementById('plato-tiempo-input').value = prod.tiempo || '10 min';

  const ingIndInput = document.getElementById('plato-ingrediente-individual-input');
  if (ingIndInput) ingIndInput.value = '';
  const addNomInput = document.getElementById('plato-adicion-nombre-input');
  if (addNomInput) addNomInput.value = '';
  const addPrecioInput = document.getElementById('plato-adicion-precio-input');
  if (addPrecioInput) addPrecioInput.value = '';

  const listaIngActual = prod.obtenerIngredientes ? prod.obtenerIngredientes() : (prod.ingredientes || []);
  modalPlatoListaIngredientes = listaIngActual.map(i => String(i).trim()).filter(Boolean);

  const listaAddActual = prod.obtenerAdiciones ? prod.obtenerAdiciones() : (prod.adiciones || []);
  modalPlatoListaAdiciones = listaAddActual.map(a => ({
    id: a.id,
    nombre: String(a.nombre || a.descripcion || '').replace(/^[➕+]\s*/, '').trim(),
    precio: Number(a.precio ?? a.costoExtra ?? a.precioExtra ?? 0) || 0
  })).filter(a => a.nombre);

  renderListaIngredientesModalPlato();
  renderListaAdicionesModalPlato();
  mostrarCapturaIngredientesModal(false);
  mostrarCapturaAdicionesModal(false);

  poblarSelectCategoriasModal(prod.categoria);

  const recetaKeys = Object.keys(prod.receta?.listaInsumos || {});
  modalPlatoInsumosSeleccionados = new Set(recetaKeys);
  seleccionarFotoGaleriaPlato(prod.imagen || 'IMAGENES PARA PEDIR/ESPECIAL.jpg');

  modal.classList.remove('hidden');
}

function guardarPlatoDesdeModal(event) {
  if (event) event.preventDefault();
  const neg = obtenerNegocioActivo();

  const editId = document.getElementById('plato-edit-id')?.value || '';
  const nombre = (document.getElementById('plato-nombre-input')?.value || '').trim();
  const selectCat = document.getElementById('plato-categoria-select')?.value || 'Hamburguesas';
  const nuevaCat = (document.getElementById('plato-nueva-categoria-input')?.value || '').trim();
  const categoriaFinal = selectCat === '__nueva__' ? (nuevaCat || 'Especiales') : selectCat;

  const precio = parseInt(document.getElementById('plato-precio-input')?.value || '0', 10) || 15000;
  const descBase = (document.getElementById('plato-descripcion-input')?.value || '').split('• Ingredientes:')[0].trim();
  const tiempo = (document.getElementById('plato-tiempo-input')?.value || '10 min').trim();

  if (!nombre) {
    showToast('⚠️ Escribe el nombre del plato.', true);
    return;
  }

  // Si el usuario dejó un ingrediente o una adición escrita en la casilla sin pulsar "+ Añadir más", agregarla automáticamente
  const ingPendiente = (document.getElementById('plato-ingrediente-individual-input')?.value || '').trim();
  if (ingPendiente) {
    agregarIngredienteAlPlatoModal();
  }
  const addPendiente = (document.getElementById('plato-adicion-nombre-input')?.value || '').trim();
  if (addPendiente) {
    agregarAdicionAlPlatoModal();
  }

  const ingredientesArray = [...modalPlatoListaIngredientes];
  const adicionesArray = modalPlatoListaAdiciones.map(a => ({ ...a }));

  // Deducir insumos de inventario según los ingredientes del plato
  const recetaObj = {};
  ingredientesArray.forEach(ing => {
    const det = detectarInsumoPorNombreIngrediente(ing);
    if (det && det.insumoId) {
      recetaObj[det.insumoId] = CANTIDAD_BASE_POR_INSUMO[det.insumoId] || 1;
    }
  });
  if (Object.keys(recetaObj).length === 0) {
    modalPlatoInsumosSeleccionados.forEach(insId => {
      recetaObj[insId] = CANTIDAD_BASE_POR_INSUMO[insId] || 1;
    });
  }
  if (Object.keys(recetaObj).length === 0) {
    recetaObj.carne = 1;
  }

  if (editId) {
    const prod = neg.catalogo.find(p => p.id === editId);
    if (prod) {
      prod.nombre = nombre;
      prod.categoria = categoriaFinal;
      prod.precio = precio;
      prod.descripcion = descBase;
      prod.ingredientes = ingredientesArray;
      prod.adiciones = adicionesArray;
      prod.imagen = modalPlatoImagenActual;
      prod.tiempo = tiempo;
      prod.receta = new Receta(prod.id, recetaObj);
    }
    showToast(`✅ Plato "${nombre}" actualizado en la categoría "${categoriaFinal}".`);
  } else {
    const nuevoProd = new Producto({
      id: `prod_${Date.now()}`,
      nombre,
      categoria: categoriaFinal,
      precio,
      imagen: modalPlatoImagenActual,
      descripcion: descBase,
      ingredientes: ingredientesArray,
      adiciones: adicionesArray,
      tiempo,
      icono: 'fa-fire',
      receta: recetaObj
    });
    neg.catalogo.unshift(nuevoProd);
    showToast(`🎉 Plato "${nombre}" ($${precio.toLocaleString('es-CO')}) añadido a "${categoriaFinal}".`);
  }

  appState.selectedCategory = categoriaFinal;
  cerrarModalNuevoProducto();
  guardarYSincronizarEstado('menu_update');
  renderAll();
}

function eliminarProductoDelMenu(productoId, event) {
  if (event) event.stopPropagation();
  const neg = obtenerNegocioActivo();
  const idx = neg.catalogo.findIndex(p => p.id === productoId);
  if (idx < 0) return;

  const nombre = neg.catalogo[idx].nombre;
  if (!confirm(`¿Seguro que deseas eliminar "${nombre}" del menú de ${neg.nombre}?`)) return;

  neg.catalogo.splice(idx, 1);
  guardarYSincronizarEstado('menu_update');
  renderAll();
  showToast(`🗑️ Plato "${nombre}" eliminado del menú.`);
}

/* ==================== 7. RENDERIZADO GENERAL ==================== */

function renderAll() {
  renderBusinessSelectorAndBanner();
  renderCategoryFilterButtons();
  renderProducts(appState.selectedCategory);
  renderPresetModifiersBar();
  renderCart();
  renderKitchenKanban();
  renderInventoryTable();
  renderMovimientosTable();
  renderDailyReportsAndMetrics();
  renderBandejaWhatsAppPorNegocio();
  updateHeaderBadges();
  updateNetworkUI();
  renderLoginScreenData();
}

function renderBusinessSelectorAndBanner() {
  const neg = obtenerNegocioActivo();

  const headerName = document.getElementById('active-tenant-title');
  if (headerName) {
    headerName.innerHTML = `${neg.icono} ${neg.nombre}`;
  }

  const subtitle = document.getElementById('header-business-subtitle');
  if (subtitle) {
    subtitle.innerHTML = `<span class="font-mono text-[11px] text-slate-300">Usuario: ${neg.usuarioLogin}</span>`;
  }

  const waHeaderTitle = document.getElementById('wa-business-title');
  if (waHeaderTitle) {
    waHeaderTitle.innerText = `${neg.nombre} • Línea ${neg.whatsappLinea}`;
  }
}

/* ==================== 8. CONTROL DE ROLES Y PERMISOS ==================== */

const PERMISOS_POR_ROL = {
  propietario: {
    nombre: '👑 Dueño / Admin',
    tabsPermitidas: ['tab-pos', 'tab-kitchen', 'tab-inventory', 'tab-whatsapp', 'tab-metrics']
  },
  cajero: {
    nombre: '💵 Cajero',
    tabsPermitidas: ['tab-pos', 'tab-whatsapp']
  },
  cocina: {
    nombre: '👨‍🍳 Cocina',
    tabsPermitidas: ['tab-kitchen']
  }
};

function cambiarRolUsuario(nuevoRol) {
  if (!PERMISOS_POR_ROL[nuevoRol]) return;
  appState.rolActivo = nuevoRol;
  guardarEstadoLocal();
  sincronizarVistaRol();
  renderProducts(appState.selectedCategory);
  showToast(`🔐 Perfil activo en pantalla: ${PERMISOS_POR_ROL[nuevoRol].nombre}`);
}

function sincronizarVistaRol() {
  const selectRol = document.getElementById('role-selector');
  if (selectRol) selectRol.value = appState.rolActivo;

  const badgeRol = document.getElementById('active-role-badge');
  const permisos = PERMISOS_POR_ROL[appState.rolActivo] || PERMISOS_POR_ROL.propietario;
  if (badgeRol) {
    badgeRol.innerText = permisos.nombre;
  }

  // Mostrar ÚNICAMENTE las pestañas permitidas para el rol seleccionado y ocultar por completo las demás
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    const target = tab.getAttribute('data-tab');
    const permitido = permisos.tabsPermitidas.includes(target);
    const lockIcon = tab.querySelector('.role-lock-icon');
    if (lockIcon) lockIcon.remove();
    tab.classList.remove('opacity-50');

    if (permitido) {
      tab.classList.remove('hidden');
      tab.classList.add('flex');
    } else {
      tab.classList.add('hidden');
      tab.classList.remove('flex');
    }
  });

  // Ocultar elementos del encabezado o botones exclusivos según las secciones permitidas
  const pendingPillEl = document.getElementById('header-pending-pill');
  if (pendingPillEl) {
    if (permisos.tabsPermitidas.includes('tab-kitchen')) {
      pendingPillEl.classList.remove('hidden');
      pendingPillEl.classList.add('flex');
    } else {
      pendingPillEl.classList.add('hidden');
      pendingPillEl.classList.remove('flex');
    }
  }

  const stockAlertEl = document.getElementById('header-stock-alert');
  if (stockAlertEl) {
    if (permisos.tabsPermitidas.includes('tab-inventory')) {
      stockAlertEl.classList.remove('hidden');
      stockAlertEl.classList.add('flex');
    } else {
      stockAlertEl.classList.add('hidden');
      stockAlertEl.classList.remove('flex');
    }
  }

  const btnNuevoPlato = document.getElementById('btn-nuevo-plato');
  if (btnNuevoPlato) {
    if (appState.rolActivo === 'propietario') {
      btnNuevoPlato.classList.remove('hidden');
      btnNuevoPlato.classList.add('flex');
    } else {
      btnNuevoPlato.classList.add('hidden');
      btnNuevoPlato.classList.remove('flex');
    }
  }

  // Asegurar que la sección abierta sea siempre una de las permitidas para este rol
  if (!permisos.tabsPermitidas.includes(appState.activeTab)) {
    activarPestana(permisos.tabsPermitidas[0], true);
  } else {
    activarPestana(appState.activeTab, true);
  }
}

function activarPestana(targetTabId, omitirVerificacion = false) {
  const permisos = PERMISOS_POR_ROL[appState.rolActivo];

  if (!omitirVerificacion && !permisos.tabsPermitidas.includes(targetTabId)) {
    showToast(`⛔ Acceso restringido: El perfil "${permisos.nombre}" no tiene permisos para abrir este módulo.`, true);
    return false;
  }

  appState.activeTab = targetTabId;
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(t => {
    if (t.getAttribute('data-tab') === targetTabId) {
      t.classList.remove('border-transparent', 'text-slate-400');
      t.classList.add('border-orange-500', 'text-orange-400');
    } else {
      t.classList.remove('border-orange-500', 'text-orange-400');
      t.classList.add('border-transparent', 'text-slate-400');
    }
  });

  panes.forEach(p => {
    if (p.id === targetTabId) {
      p.classList.remove('hidden');
      p.classList.add('block');
    } else {
      p.classList.add('hidden');
      p.classList.remove('block');
    }
  });

  if (targetTabId === 'tab-metrics') {
    renderDailyReportsAndMetrics();
  }
  return true;
}

/* ==================== 9. MODO OFFLINE Y SINCRONIZACIÓN ==================== */

function toggleModoOffline() {
  appState.isOnline = !appState.isOnline;

  if (appState.isOnline) {
    const pendientes = appState.offlineQueue.length;
    appState.negocios.forEach(neg => {
      neg.pedidos.forEach(p => {
        p.sincronizado = true;
      });
    });
    appState.offlineQueue = [];
    guardarYSincronizarEstado('reconexion_offline');
    updateNetworkUI();
    renderKitchenKanban();
    if (pendientes > 0) {
      showToast(`✅ Conexión restablecida: ${pendientes} pedido(s) sincronizados sin duplicados.`);
    } else {
      showToast('⚡ Sistema en línea y sincronizado en tiempo real.');
    }
  } else {
    guardarEstadoLocal();
    updateNetworkUI();
    showToast('⚠️ Modo Sin Internet activo: Los pedidos se guardan localmente y se sincronizarán al reconectar.', true);
  }
}

function updateNetworkUI() {
  const offlineToggle = document.getElementById('offline-toggle');
  const statusText = document.getElementById('network-status-text');
  if (!offlineToggle || !statusText) return;

  const dot = offlineToggle.querySelector('.status-dot');
  const queueCount = appState.offlineQueue.length;

  if (appState.isOnline) {
    offlineToggle.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 font-medium hover:bg-slate-700 transition';
    if (dot) dot.className = 'status-dot w-2 h-2 rounded-full bg-emerald-500';
    statusText.innerHTML = `<i class="fa-solid fa-wifi text-[11px] text-emerald-400"></i> En Línea`;
  } else {
    offlineToggle.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-950/50 text-red-300 font-medium hover:bg-red-900/50 transition';
    if (dot) dot.className = 'status-dot w-2 h-2 rounded-full bg-red-400 animate-ping';
    statusText.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-[11px] text-amber-400"></i> Offline (${queueCount})`;
  }
}

/* ==================== 10. POS / TOMA DE PEDIDOS Y RECIBO TÉRMICO ==================== */

function renderProducts(category = 'all') {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  const neg = obtenerNegocioActivo();
  const esDueno = appState.rolActivo === 'propietario';
  const posBusinessLabel = document.getElementById('pos-active-business-badge');
  if (posBusinessLabel) {
    posBusinessLabel.innerText = `${neg.icono} Menú de ${neg.nombre} (${neg.catalogo.length} platos)`;
  }

  const filtered = category === 'all'
    ? neg.catalogo
    : neg.catalogo.filter(p => p.categoria.toLowerCase() === category.toLowerCase());

  if (!neg.catalogo || neg.catalogo.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-slate-900/80 border border-dashed border-slate-700 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 text-xl">
          <i class="fa-solid fa-utensils"></i>
        </div>
        <div>
          <h4 class="text-sm font-bold text-white">El menú de "${neg.nombre}" está vacío</h4>
        </div>
        ${esDueno ? `
          <button type="button" onclick="abrirModalNuevoProducto()" class="mt-1 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-md">
            <i class="fa-solid fa-plus"></i> Crear Primer Plato del Menú
          </button>
        ` : ''}
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(item => `
    <div class="product-card group relative bg-slate-900 border border-slate-800 hover:border-orange-500/60 rounded-xl overflow-hidden flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-orange-950/20 hover:-translate-y-1 cursor-pointer select-none" onclick="addItemToCart('${item.id}')">
      <div class="relative w-full h-40 bg-slate-950 overflow-hidden">
        <img 
          src="${item.imagen && item.imagen.startsWith('data:') ? item.imagen : encodeURI(item.imagen || '')}" 
          alt="${item.nombre}" 
          loading="lazy"
          class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
          onerror="this.style.display='none'"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/15 to-transparent"></div>
        <div class="absolute top-2.5 left-2.5 flex items-center gap-1">
          <span class="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-900/85 backdrop-blur-md text-slate-200 font-medium border border-slate-700/70 shadow-sm">${item.categoria}</span>
        </div>
        <div class="absolute top-2.5 right-2.5 flex items-center gap-1">
          <span class="font-mono text-xs font-bold text-orange-300 bg-slate-950/85 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-orange-500/40 shadow-sm">$${item.precio.toLocaleString('es-CO')}</span>
        </div>
        ${esDueno ? `
          <div class="absolute bottom-2 right-2 flex items-center gap-1 opacity-90">
            <button type="button" onclick="editarPrecioProducto('${item.id}', event)" class="w-7 h-7 rounded-lg bg-slate-900/90 hover:bg-blue-600 text-slate-200 hover:text-white border border-slate-700 flex items-center justify-center text-[11px] transition" title="Editar nombre o precio">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button type="button" onclick="eliminarProductoDelMenu('${item.id}', event)" class="w-7 h-7 rounded-lg bg-slate-900/90 hover:bg-red-600 text-slate-200 hover:text-white border border-slate-700 flex items-center justify-center text-[11px] transition" title="Eliminar plato del menú">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        ` : ''}
      </div>
      <div class="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <h4 class="font-bold text-slate-100 text-sm group-hover:text-orange-400 transition-colors leading-snug">${item.nombre}</h4>
          <p class="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">${item.descripcion}</p>
        </div>
        <div class="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span class="flex items-center gap-1.5 text-slate-400">
            <i class="fa-solid ${item.icono} text-orange-400/80 text-[11px]"></i> ${item.tiempo}
          </span>
          <button type="button" class="text-white font-semibold flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 active:scale-95 px-3 py-1.5 rounded-lg text-xs transition shadow-sm shadow-orange-950/40">
            <span>Agregar</span> <i class="fa-solid fa-plus text-[10px]"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderPresetModifiersBar() {
  const container = document.getElementById('preset-tags-container');
  if (!container) return;

  const activeItem = appState.selectedCartIdx !== null ? appState.cart[appState.selectedCartIdx] : null;
  if (!activeItem) {
    container.innerHTML = `
      <div class="w-full py-2 px-3 rounded-lg bg-slate-900/70 border border-slate-800 text-[11px] text-slate-400 text-center">
        👆 Agrega o selecciona un producto en la comanda para ver sus ingredientes y adiciones.
      </div>
    `;
    return;
  }

  const neg = obtenerNegocioActivo();
  const prod = neg.catalogo.find(
    p => p.id === activeItem.productoId || p.nombre.toLowerCase() === activeItem.nombreProducto.toLowerCase()
  );

  const grupos = obtenerGruposModificadoresPorProducto(prod);

  // Calcular número de unidad si hay varios del mismo producto en el carrito
  const mismosItems = appState.cart
    .map((it, i) => ({ it, i }))
    .filter(x => x.it.productoId === activeItem.productoId);
  const posUnidad = mismosItems.findIndex(x => x.i === appState.selectedCartIdx) + 1;
  const etiquetaUnidad = mismosItems.length > 1 ? ` (Unidad #${posUnidad})` : '';

  const renderBotonMod = (mod) => {
    const isApplied = activeItem.modificaciones.some(m => m.id === mod.id);
    const costoLabel = mod.costoExtra > 0 ? ` (+$${(mod.costoExtra / 1000)}k)` : '';
    const activeClasses = isApplied
      ? mod.tipo === 'sin_ingrediente'
        ? 'bg-red-600 text-white border-red-400 shadow-sm'
        : 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300';

    return `
      <button 
        type="button" 
        onclick="toggleModifierOnCartItem('${mod.id}')"
        class="px-2.5 py-1 border rounded-lg text-[11px] font-medium transition flex items-center gap-1 ${activeClasses}"
      >
        <span>${mod.icono}</span>
        <span>${mod.descripcion}${costoLabel}</span>
      </button>
    `;
  };

  const bloqueQuitar = grupos.quitar.length > 0 ? `
    <div class="w-full">
      <div class="text-[10px] font-bold text-red-300/90 uppercase tracking-wider mb-1 flex items-center gap-1">
        <i class="fa-solid fa-ban text-[9px]"></i> ¿Quitar algún ingrediente de este plato?
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${grupos.quitar.map(renderBotonMod).join('')}
      </div>
    </div>
  ` : '';

  const bloqueAdiciones = grupos.adiciones.length > 0 ? `
    <div class="w-full ${grupos.quitar.length > 0 ? 'mt-2 pt-2 border-t border-slate-800/80' : ''}">
      <div class="text-[10px] font-bold text-emerald-300/90 uppercase tracking-wider mb-1 flex items-center gap-1">
        <i class="fa-solid fa-circle-plus text-[9px]"></i> ¿Desea añadir algo más? (Adiciones)
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${grupos.adiciones.map(renderBotonMod).join('')}
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="w-full mb-1.5 flex items-center justify-between text-[11px] bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg">
      <span class="text-slate-300 truncate">Plato seleccionado: <strong class="text-orange-400">${activeItem.nombreProducto}${etiquetaUnidad}</strong></span>
    </div>
    ${bloqueQuitar}
    ${bloqueAdiciones}
  `;
}

function addItemToCart(productoId) {
  const neg = obtenerNegocioActivo();
  const prod = neg.catalogo.find(p => p.id === productoId);
  if (!prod) return;

  // Cada vez que se toca un plato en el menú, se agrega como una unidad independiente
  // para poder personalizar cada una por separado (ej: 1 Hamburguesa con cebolla y 1 sin cebolla)
  const nuevoItem = new ItemPedido({
    productoId: prod.id,
    nombreProducto: prod.nombre,
    cantidad: 1,
    precioUnitario: prod.precio,
    imagen: prod.imagen,
    modificaciones: []
  });
  appState.cart.push(nuevoItem);
  appState.selectedCartIdx = appState.cart.length - 1;

  renderCart();
  renderPresetModifiersBar();
  showToast(`+1 ${prod.nombre}`);
}

function separarUnidadItemCarrito(idx) {
  const item = appState.cart[idx];
  if (!item || item.cantidad <= 1) return;

  item.cantidad -= 1;
  const unidadSeparada = new ItemPedido({
    productoId: item.productoId,
    nombreProducto: item.nombreProducto,
    cantidad: 1,
    precioUnitario: item.precioUnitario,
    imagen: item.imagen,
    modificaciones: item.modificaciones.map(m => ({ ...m }))
  });

  appState.cart.splice(idx + 1, 0, unidadSeparada);
  appState.selectedCartIdx = idx + 1;
  renderCart();
  renderPresetModifiersBar();
  showToast(`✂️ Se separó 1 unidad de "${item.nombreProducto}" para personalizarla individualmente.`);
}

function selectCartItem(idx) {
  if (idx >= 0 && idx < appState.cart.length) {
    appState.selectedCartIdx = idx;
    renderCart();
    renderPresetModifiersBar();
  }
}

function changeCartItemQty(idx, delta) {
  const item = appState.cart[idx];
  if (!item) return;

  item.cantidad += delta;
  if (item.cantidad <= 0) {
    appState.cart.splice(idx, 1);
    appState.selectedCartIdx = appState.cart.length > 0 ? Math.max(0, idx - 1) : null;
  } else {
    appState.selectedCartIdx = idx;
  }
  renderCart();
  renderPresetModifiersBar();
}

function removeItemFromCart(index) {
  if (index >= 0 && index < appState.cart.length) {
    appState.cart.splice(index, 1);
    appState.selectedCartIdx = appState.cart.length > 0 ? 0 : null;
    renderCart();
    renderPresetModifiersBar();
  }
}

function toggleModifierOnCartItem(modId) {
  if (appState.cart.length === 0) {
    showToast('Primero selecciona un plato del menú.', true);
    return;
  }
  if (appState.selectedCartIdx === null || !appState.cart[appState.selectedCartIdx]) {
    appState.selectedCartIdx = appState.cart.length - 1;
  }

  const item = appState.cart[appState.selectedCartIdx];
  const neg = obtenerNegocioActivo();
  const prod = neg.catalogo.find(
    p => p.id === item.productoId || p.nombre.toLowerCase() === item.nombreProducto.toLowerCase()
  );
  const listaMods = obtenerModificadoresParaProducto(prod);
  const modObj = listaMods.find(m => m.id === modId) || MODIFICADORES_CATALOGO.find(m => m.id === modId);
  if (!modObj) return;

  const existingIndex = item.modificaciones.findIndex(m => m.id === modId);
  if (existingIndex >= 0) {
    item.modificaciones.splice(existingIndex, 1);
  } else {
    modObj.aplicarA(item);
  }

  renderCart();
  renderPresetModifiersBar();
}

function renderCart() {
  const container = document.getElementById('cart-items-list');
  const totalDisplay = document.getElementById('order-total-display');
  const subtotalAdicionesEl = document.getElementById('order-additions-display');
  if (!container) return;

  if (appState.cart.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-500 empty-cart-msg">
        <i class="fa-solid fa-cart-shopping text-2xl mb-2"></i>
        <p class="text-xs">Toca los platos del menú para armar el pedido</p>
      </div>
    `;
    if (totalDisplay) totalDisplay.innerText = '$0 COP';
    if (subtotalAdicionesEl) subtotalAdicionesEl.innerText = '$0 COP';
    return;
  }

  let total = 0;
  let totalAdiciones = 0;

  // Contar cuántas filas hay de cada producto para numerarlas (#1, #2...) cuando piden varios del mismo plato
  const conteoPorProducto = {};
  appState.cart.forEach(it => {
    conteoPorProducto[it.productoId] = (conteoPorProducto[it.productoId] || 0) + 1;
  });
  const indiceActualPorProducto = {};

  container.innerHTML = appState.cart.map((item, idx) => {
    const itemSubtotal = item.subtotal();
    const itemAdiciones = item.costoModificacionesUnitario() * item.cantidad;
    total += itemSubtotal;
    totalAdiciones += itemAdiciones;

    indiceActualPorProducto[item.productoId] = (indiceActualPorProducto[item.productoId] || 0) + 1;
    const mostrarNumeroUnidad = conteoPorProducto[item.productoId] > 1;
    const badgeUnidad = mostrarNumeroUnidad
      ? `<span class="ml-1 px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-500/40 text-orange-300 font-mono text-[10px]">#${indiceActualPorProducto[item.productoId]}</span>`
      : '';

    const isSelected = appState.selectedCartIdx === idx;
    const borderClass = isSelected
      ? 'border-orange-500 bg-slate-800/95 ring-1 ring-orange-500/30'
      : 'border-slate-700/80 bg-slate-800/60 hover:border-slate-600';

    const modsHtml = item.modificaciones.length > 0
      ? item.modificaciones.map(m => {
          const badgeColor = m.tipo === 'sin_ingrediente'
            ? 'text-red-300 bg-red-950/60 border-red-500/30'
            : m.tipo === 'extra'
              ? 'text-emerald-300 bg-emerald-950/60 border-emerald-500/30'
              : 'text-amber-300 bg-amber-950/60 border-amber-500/30';
          const priceTag = m.costoExtra > 0 ? ` +$${m.costoExtra.toLocaleString('es-CO')}` : '';
          return `<span class="text-[10px] px-1.5 py-0.5 rounded border ${badgeColor} font-medium">${m.icono || ''} ${m.descripcion}${priceTag}</span>`;
        }).join('')
      : `<span class="text-[10px] text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800">Con todo (Estándar)</span>`;

    return `
      <div onclick="selectCartItem(${idx})" class="p-2.5 rounded-lg border flex flex-col gap-2 transition cursor-pointer ${borderClass}" data-item-idx="${idx}">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2.5 min-w-0">
            ${item.imagen ? `<img src="${item.imagen.startsWith('data:') ? item.imagen : encodeURI(item.imagen)}" alt="" class="w-9 h-9 rounded-md object-cover flex-shrink-0 border border-slate-700 shadow-sm" onerror="this.style.display='none'" />` : ''}
            <div class="min-w-0">
              <div class="font-semibold text-xs text-white truncate flex items-center">${item.nombreProducto}${badgeUnidad}</div>
              <div class="text-[10px] text-slate-400 font-mono">$${item.precioUnitario.toLocaleString('es-CO')} c/u</div>
            </div>
          </div>
          <span class="font-mono text-xs font-bold text-orange-300 flex-shrink-0">$${itemSubtotal.toLocaleString('es-CO')}</span>
        </div>
        <div class="flex flex-wrap items-center gap-1">
          ${modsHtml}
        </div>
        <div class="flex items-center justify-between pt-1 border-t border-slate-700/50 text-xs">
          <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
            <button type="button" onclick="changeCartItemQty(${idx}, -1)" class="w-6 h-6 rounded bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center font-bold text-xs">-</button>
            <span class="font-mono font-bold text-xs text-white px-1.5">${item.cantidad}</span>
            <button type="button" onclick="changeCartItemQty(${idx}, 1)" class="w-6 h-6 rounded bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center font-bold text-xs" title="Aumentar cantidad con las mismas modificaciones">+</button>
            ${item.cantidad > 1 ? `
              <button type="button" onclick="separarUnidadItemCarrito(${idx})" class="ml-1 px-2 py-0.5 rounded bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-300 text-[10px] font-semibold transition flex items-center gap-1" title="Separar 1 unidad para ponerle modificaciones distintas">
                <i class="fa-solid fa-code-branch text-[9px]"></i> Separar 1 und.
              </button>
            ` : ''}
          </div>
          <button type="button" class="text-slate-400 hover:text-red-400 transition p-1 text-xs" title="Eliminar ítem" onclick="event.stopPropagation(); removeItemFromCart(${idx})">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (totalDisplay) totalDisplay.innerText = `$${total.toLocaleString('es-CO')} COP`;
  if (subtotalAdicionesEl) subtotalAdicionesEl.innerText = `+$${totalAdiciones.toLocaleString('es-CO')} COP`;
}

function clearCart() {
  appState.cart = [];
  appState.selectedCartIdx = null;
  renderCart();
  renderPresetModifiersBar();
}

function switchChannel(channel) {
  appState.selectedChannel = channel === 'whatsapp' ? 'WhatsApp' : 'caja';
  const lblCounter = document.getElementById('lbl-counter');
  const lblWhatsapp = document.getElementById('lbl-whatsapp');
  const custNameInput = document.getElementById('cust-name');
  const lblCustName = document.getElementById('lbl-cust-name');
  const fieldCustName = document.getElementById('field-cust-name');
  const fieldCustPhone = document.getElementById('field-cust-phone');
  const fieldCustNotes = document.getElementById('field-cust-notes');
  const fieldCustAddress = document.getElementById('field-cust-address');

  if (!lblCounter || !lblWhatsapp) return;

  if (channel === 'counter') {
    lblCounter.className = 'channel-label px-2.5 py-1 rounded cursor-pointer bg-orange-600 text-white flex items-center gap-1.5 transition';
    lblWhatsapp.className = 'channel-label px-2.5 py-1 rounded cursor-pointer text-slate-400 hover:text-white flex items-center gap-1.5 transition';
    if (lblCustName) lblCustName.innerText = 'Cliente / Mesa';
    if (fieldCustName) fieldCustName.classList.add('sm:col-span-2');
    if (fieldCustPhone) fieldCustPhone.classList.add('hidden');
    if (fieldCustNotes) fieldCustNotes.classList.remove('hidden');
    if (fieldCustAddress) fieldCustAddress.classList.add('hidden');
    if (custNameInput) {
      custNameInput.placeholder = 'Ej: Mesa 1';
      if (custNameInput.value.includes('Domicilio') || custNameInput.value === '') {
        custNameInput.value = 'Mesa 1';
      }
    }
  } else {
    lblWhatsapp.className = 'channel-label px-2.5 py-1 rounded cursor-pointer bg-emerald-600 text-white flex items-center gap-1.5 transition';
    lblCounter.className = 'channel-label px-2.5 py-1 rounded cursor-pointer text-slate-400 hover:text-white flex items-center gap-1.5 transition';
    if (lblCustName) lblCustName.innerText = 'Cliente';
    if (fieldCustName) fieldCustName.classList.remove('sm:col-span-2');
    if (fieldCustPhone) fieldCustPhone.classList.remove('hidden');
    if (fieldCustNotes) fieldCustNotes.classList.add('hidden');
    if (fieldCustAddress) fieldCustAddress.classList.remove('hidden');
    if (custNameInput) {
      custNameInput.placeholder = 'Nombre del cliente';
      if (custNameInput.value === 'Mesa 1') {
        custNameInput.value = 'Cliente Domicilio';
      }
    }
  }
}

function dispatchOrder(imprimirRecibo = false) {
  if (appState.cart.length === 0) {
    showToast('Agrega al menos un producto antes de enviar a cocina.', true);
    return;
  }

  const custNameInput = document.getElementById('cust-name');
  const phoneInput = document.getElementById('cust-phone');
  const notesInput = document.getElementById('cust-notes');
  const addressInput = document.getElementById('cust-address');
  const paymentSelect = document.getElementById('cust-payment');

  const esWhatsApp = appState.selectedChannel === 'WhatsApp';
  const clienteNombre = custNameInput?.value.trim() || (esWhatsApp ? 'Cliente Domicilio' : 'Mesa 1');
  const telefono = esWhatsApp ? (phoneInput?.value.trim() || '') : '';
  const direccionDomicilio = esWhatsApp
    ? (addressInput?.value.trim() || 'Domicilio')
    : (notesInput?.value.trim() || '');
  const metodoPago = paymentSelect?.value || 'Efectivo';

  const nuevoPedido = pedidoService.crearDesdeCaja({
    canal: appState.selectedChannel,
    clienteNombre,
    telefono,
    direccionDomicilio,
    motorizado: '',
    metodoPago,
    items: appState.cart
  });

  appState.cart = [];
  appState.selectedCartIdx = null;
  if (custNameInput) custNameInput.value = esWhatsApp ? 'Cliente Domicilio' : 'Mesa 1';
  if (phoneInput) phoneInput.value = '';
  if (notesInput) notesInput.value = '';
  if (addressInput) addressInput.value = '';

  renderAll();
  showToast(`🚀 Comanda ${nuevoPedido.id} enviada a Cocina.`);

  if (imprimirRecibo) {
    imprimirTicketTermico(nuevoPedido.id);
  }
}

function imprimirTicketTermico(pedidoId) {
  const neg = obtenerNegocioActivo();
  const pedido = neg.pedidos.find(p => p.id === pedidoId);
  if (!pedido) return;

  const fechaStr = new Date(pedido.fechaIngreso).toLocaleString('es-CO');
  const lineasItems = pedido.items.map(it => {
    const mods = it.modificaciones.length > 0
      ? `<div style="font-size:11px; color:#444; margin-left:10px;">* ${it.modificaciones.map(m => m.descripcion).join(', ')}</div>`
      : '';
    return `
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:4px;">
        <span>${it.cantidad}x ${it.nombreProducto}</span>
        <strong>$${it.subtotal().toLocaleString('es-CO')}</strong>
      </div>
      ${mods}
    `;
  }).join('');

  const ventana = window.open('', '_blank', 'width=360,height=560');
  if (!ventana) {
    showToast('Permite las ventanas emergentes para imprimir el recibo térmico.', true);
    return;
  }

  const esWa = pedido.canal.toLowerCase() === 'whatsapp';
  const etiquetaExtra = esWa ? 'Dirección' : 'Anotación';

  ventana.document.write(`
    <html>
      <head>
        <title>Recibo ${pedido.id} - ${neg.nombre}</title>
        <style>
          body { font-family: monospace; width: 280px; margin: 0 auto; padding: 12px; color: #000; }
          .center { text-align: center; }
          .hr { border-top: 1px dashed #000; margin: 8px 0; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="center">
          <h3 style="margin:0;">${neg.nombre.toUpperCase()}</h3>
          <div style="font-size:11px;">${neg.barrio}</div>
          <div style="font-size:11px;">WhatsApp: ${neg.whatsappLinea}</div>
        </div>
        <div class="hr"></div>
        <div style="font-size:12px;">
          <div><strong>ORDEN: ${pedido.id}</strong> (${pedido.canal.toUpperCase()})</div>
          <div>Fecha: ${fechaStr}</div>
          <div>Cliente: ${pedido.clienteNombre}</div>
          ${pedido.telefono ? `<div>Tel: ${pedido.telefono}</div>` : ''}
          ${pedido.direccionDomicilio ? `<div>${etiquetaExtra}: ${pedido.direccionDomicilio}</div>` : ''}
          <div>Pago: ${pedido.metodoPago || 'Efectivo'}</div>
        </div>
        <div class="hr"></div>
        ${lineasItems}
        <div class="hr"></div>
        <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:bold;">
          <span>TOTAL A PAGAR:</span>
          <span>$${pedido.total.toLocaleString('es-CO')} COP</span>
        </div>
        <div class="hr"></div>
        <div class="center" style="font-size:11px;">¡Gracias por su compra! • Fast Order Cúcuta</div>
      </body>
    </html>
  `);
  ventana.document.close();
}

/* ==================== 11. PANTALLA DE COCINA KANBAN KDS ==================== */

function renderKitchenKanban() {
  const colPending = document.getElementById('container-pending');
  const colPreparing = document.getElementById('container-preparing');
  const colDispatched = document.getElementById('container-dispatched');
  if (!colPending || !colPreparing || !colDispatched) return;

  const neg = obtenerNegocioActivo();
  const kdsTitle = document.getElementById('kds-business-name');
  if (kdsTitle) {
    kdsTitle.innerText = `${neg.icono} Pantalla de Cocina (KDS) • ${neg.nombre}`;
  }

  const pendientes = neg.pedidos
    .filter(p => p.estado === EstadoPedido.PENDIENTE)
    .slice()
    .sort((a, b) => new Date(a.fechaIngreso).getTime() - new Date(b.fechaIngreso).getTime());

  const enCoccion = neg.pedidos
    .filter(p => p.estado === EstadoPedido.EN_PREPARACION)
    .slice()
    .sort((a, b) => new Date(a.fechaPreparacion || a.fechaIngreso).getTime() - new Date(b.fechaPreparacion || b.fechaIngreso).getTime());

  const despachados = neg.pedidos
    .filter(p => p.estado === EstadoPedido.DESPACHADO)
    .slice()
    .sort((a, b) => new Date(b.fechaDespacho || b.fechaIngreso).getTime() - new Date(a.fechaDespacho || a.fechaIngreso).getTime());

  colPending.innerHTML = pendientes.length > 0
    ? pendientes.map(p => crearHtmlTarjetaKDS(p)).join('')
    : `<div class="text-center py-10 text-slate-500 text-xs">Sin comandas pendientes por iniciar</div>`;

  colPreparing.innerHTML = enCoccion.length > 0
    ? enCoccion.map(p => crearHtmlTarjetaKDS(p)).join('')
    : `<div class="text-center py-10 text-slate-500 text-xs">Sin pedidos en parrilla</div>`;

  colDispatched.innerHTML = despachados.length > 0
    ? despachados.map(p => crearHtmlTarjetaKDS(p)).join('')
    : `<div class="text-center py-10 text-slate-500 text-xs">Aún no hay pedidos despachados hoy</div>`;

  updateHeaderBadges();
}

function crearHtmlTarjetaKDS(pedido) {
  const esWa = pedido.canal.toLowerCase() === 'whatsapp';
  const canalBadge = esWa
    ? `<span class="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>`
    : `<span class="px-2 py-0.5 rounded bg-orange-950/80 border border-orange-500/30 text-orange-300 text-[10px] font-semibold flex items-center gap-1"><i class="fa-solid fa-store"></i> Mostrador</span>`;

  const syncBadge = !pedido.sincronizado
    ? `<span class="px-1.5 py-0.5 rounded bg-red-950/80 border border-red-500/40 text-red-300 text-[10px] font-mono">⚡ Offline</span>`
    : '';

  const itemsMarkup = pedido.items.map(item => {
    const modsMarkup = item.modificaciones && item.modificaciones.length > 0
      ? `<div class="mt-1 flex flex-wrap gap-1">
          ${item.modificaciones.map(m => {
            const style = m.tipo === 'sin_ingrediente'
              ? 'text-amber-300 bg-amber-950/60 border-amber-500/40 font-bold'
              : m.tipo === 'extra'
                ? 'text-emerald-300 bg-emerald-950/60 border-emerald-500/40 font-semibold'
                : 'text-blue-300 bg-blue-950/60 border-blue-500/40';
            return `<span class="text-[11px] px-2 py-0.5 rounded border ${style}">⚠️ ${m.descripcion.toUpperCase()}</span>`;
          }).join('')}
        </div>`
      : '';

    return `
      <div class="py-1 border-b border-slate-800/60 last:border-none">
        <div class="font-semibold text-xs text-slate-100">• ${item.cantidad}x ${item.nombreProducto}</div>
        ${modsMarkup}
      </div>
    `;
  }).join('');

  const horaIngreso = new Date(pedido.fechaIngreso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const horaPrep = pedido.fechaPreparacion
    ? new Date(pedido.fechaPreparacion).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  const horaDesp = pedido.fechaDespacho
    ? new Date(pedido.fechaDespacho).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const domicilioInfo = pedido.direccionDomicilio
    ? `<div class="mt-2 pt-1.5 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-0.5">
        <div><i class="fa-solid ${esWa ? 'fa-location-dot text-orange-400' : 'fa-note-sticky text-amber-400'} mr-1"></i> ${pedido.direccionDomicilio}</div>
       </div>`
    : '';

  let borderCard = 'border-amber-500/40 bg-slate-950';
  let headerColor = 'text-amber-400';
  let botonAccion = `
    <button class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm" onclick="avanzarEstadoTicket('${pedido.id}', '${EstadoPedido.EN_PREPARACION}')">
      <i class="fa-solid fa-fire"></i> Pasar a Parrilla <i class="fa-solid fa-arrow-right text-[10px]"></i>
    </button>
  `;

  if (pedido.estado === EstadoPedido.EN_PREPARACION) {
    borderCard = 'border-blue-500/40 bg-slate-950';
    headerColor = 'text-blue-400';
    botonAccion = `
      <button class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm" onclick="avanzarEstadoTicket('${pedido.id}', '${EstadoPedido.DESPACHADO}')">
        <i class="fa-solid fa-check"></i> Pedido Listo / Despachar
      </button>
    `;
  } else if (pedido.estado === EstadoPedido.DESPACHADO) {
    borderCard = 'border-slate-800 bg-slate-950/75 opacity-85';
    headerColor = 'text-emerald-400';
    const minsTotal = pedido.tiempoDespachoMinutos() || 1;
    botonAccion = `
      <span class="text-[11px] font-mono font-bold text-emerald-400 flex items-center gap-1">
        <i class="fa-solid fa-circle-check"></i> Despachado en ${minsTotal} min
      </span>
    `;
  }

  return `
    <div class="ticket-card border ${borderCard} rounded-lg p-3 shadow-md transition-all" data-ticket-id="${pedido.id}">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 gap-2">
        <div>
          <span class="font-mono text-xs font-bold ${headerColor}">${pedido.id} • ${pedido.clienteNombre}</span>
          ${pedido.telefono ? `<div class="text-[10px] font-mono text-slate-400">📞 ${pedido.telefono}</div>` : ''}
        </div>
        <div class="flex flex-col items-end gap-1">
          <div class="flex items-center gap-1">${syncBadge}${canalBadge}</div>
          <span class="text-[11px] font-mono text-slate-300 kds-live-timer" data-created="${pedido.fechaIngreso}" data-status="${pedido.estado}">
            ${calcularTextoTimer(pedido)}
          </span>
        </div>
      </div>
      <div class="space-y-1 text-xs text-slate-200">
        ${itemsMarkup}
      </div>
      ${domicilioInfo}
      <div class="mt-2 pt-1.5 border-t border-slate-900 text-[10px] font-mono text-slate-400 flex flex-wrap justify-between gap-1">
        <span>📥 ${horaIngreso}</span>
        ${pedido.fechaPreparacion ? `<span>🔥 ${horaPrep}</span>` : ''}
        ${pedido.fechaDespacho ? `<span>✅ ${horaDesp}</span>` : ''}
      </div>
      <div class="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
        <button type="button" onclick="imprimirTicketTermico('${pedido.id}')" class="text-[11px] text-slate-400 hover:text-white flex items-center gap-1" title="Imprimir comanda">
          <i class="fa-solid fa-print"></i> $${pedido.total.toLocaleString('es-CO')}
        </button>
        ${botonAccion}
      </div>
    </div>
  `;
}

function calcularTextoTimer(pedido) {
  if (pedido.estado === EstadoPedido.DESPACHADO) return 'Entregado';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(pedido.fechaIngreso).getTime()) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `⏱️ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function actualizarCronometrosKDS() {
  const timers = document.querySelectorAll('.kds-live-timer');
  timers.forEach(el => {
    const status = el.getAttribute('data-status');
    if (status === EstadoPedido.DESPACHADO) return;
    const created = el.getAttribute('data-created');
    if (!created) return;
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    el.textContent = `⏱️ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (mins >= 12) el.classList.add('text-red-400', 'font-bold');
  });
}

function avanzarEstadoTicket(pedidoId, nuevoEstado) {
  const actualizado = pedidoService.cambiarEstado(pedidoId, nuevoEstado);
  if (!actualizado) return;
  renderKitchenKanban();
  renderInventoryTable();
  renderMovimientosTable();
  renderDailyReportsAndMetrics();

  if (nuevoEstado === EstadoPedido.EN_PREPARACION) {
    showToast(`🔥 Comanda ${pedidoId} pasó a cocción.`);
  } else if (nuevoEstado === EstadoPedido.DESPACHADO) {
    showToast(`✅ Comanda ${pedidoId} lista y despachada (${actualizado.tiempoDespachoMinutos()} min).`);
  }
}

function updateHeaderBadges() {
  const neg = obtenerNegocioActivo();
  const pendingCount = neg.pedidos.filter(p => p.estado === EstadoPedido.PENDIENTE).length;
  const prepCount = neg.pedidos.filter(p => p.estado === EstadoPedido.EN_PREPARACION).length;
  const dispCount = neg.pedidos.filter(p => p.estado === EstadoPedido.DESPACHADO).length;

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setTxt('kstat-pending', pendingCount);
  setTxt('kstat-preparing', prepCount);
  setTxt('kstat-dispatched', dispCount);
  setTxt('header-pending-count', pendingCount);
  setTxt('kitchen-tab-badge', pendingCount + prepCount);
  setTxt('badge-col-pending', pendingCount);
  setTxt('badge-col-preparing', prepCount);
  setTxt('badge-col-dispatched', dispCount);
}

/* ==================== 12. INVENTARIO, RECETAS Y MERMAS ==================== */

function renderInventoryTable() {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;

  const neg = obtenerNegocioActivo();
  const invTitle = document.getElementById('inv-business-name');
  if (invTitle) {
    invTitle.innerText = `${neg.icono} Inventario y Costos de ${neg.nombre}`;
  }

  let insumosEnAlerta = 0;

  if (!Array.isArray(neg.insumos) || neg.insumos.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-10 px-4 text-center">
          <div class="flex flex-col items-center justify-center gap-2.5">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-base">
              <i class="fa-solid fa-boxes-stacked"></i>
            </div>
            <div class="text-slate-200 font-bold text-xs">El inventario de "${neg.nombre}" está en blanco (0 insumos)</div>
            <button type="button" onclick="abrirModalNuevoInsumo()" class="mt-1 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow">
              <i class="fa-solid fa-plus"></i> Añadir Primer Insumo
            </button>
          </div>
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = neg.insumos.map(ins => {
      const alerta = ins.requiereAlerta();
      if (alerta) insumosEnAlerta++;

      const rowBg = alerta ? 'bg-amber-950/20 hover:bg-amber-950/30' : 'hover:bg-slate-800/40';
      const dotClass = alerta ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400';
      const stockColor = alerta ? 'text-amber-400' : 'text-white';
      const badgeMarkup = alerta
        ? `<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">⚠️ Stock Bajo</span>`
        : `<span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Disponible</span>`;

      return `
        <tr class="${rowBg} transition">
          <td class="py-3 px-4 font-semibold text-white flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${dotClass}"></span> ${ins.nombre}
          </td>
          <td class="py-3 px-4 font-mono font-bold ${stockColor}">${ins.stockActual}</td>
          <td class="py-3 px-4 text-slate-400">${ins.unidad}</td>
          <td class="py-3 px-4 font-mono text-slate-300">
            <div class="flex items-center gap-1.5">
              <span>${ins.umbralMinimo} ${ins.unidad}</span>
              <button type="button" onclick="configurarUmbralInsumo('${ins.id}')" class="text-slate-400 hover:text-orange-400 text-[11px]" title="Editar alerta de stock mínimo">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
            </div>
          </td>
          <td class="py-3 px-4">${badgeMarkup}</td>
          <td class="py-3 px-4 font-mono text-slate-300">$${ins.costoUnitario.toLocaleString('es-CO')} COP</td>
          <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
            <button type="button" onclick="abrirModalMovimiento('${ins.id}', 'entrada')" class="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 font-semibold text-[11px] transition">
              + Compra
            </button>
            <button type="button" onclick="abrirModalMovimiento('${ins.id}', 'merma')" class="px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 font-semibold text-[11px] transition">
              - Merma
            </button>
            <button type="button" onclick="eliminarInsumoDelNegocio('${ins.id}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white border border-slate-700 text-[11px] transition" title="Eliminar este insumo del inventario">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  const headerAlert = document.getElementById('header-stock-alert');
  const headerStockText = document.getElementById('header-stock-text');
  if (headerAlert && headerStockText) {
    if (insumosEnAlerta > 0) {
      headerAlert.className = 'header-pill-anim flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-950/50 text-amber-300 cursor-pointer';
      headerStockText.innerHTML = `<strong>${insumosEnAlerta}</strong> Alerta(s)`;
    } else {
      headerAlert.className = 'header-pill-anim flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 cursor-pointer';
      headerStockText.innerText = 'Stock OK';
    }
  }

  sincronizarComboboxInsumoMovimiento();
}

function normalizarTextoBusqueda(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function sincronizarComboboxInsumoMovimiento(forzarInsumoId = null) {
  const neg = obtenerNegocioActivo();
  const hiddenId = document.getElementById('mov-insumo-id');
  const searchInput = document.getElementById('mov-insumo-search');
  if (!hiddenId || !searchInput) return;

  const lista = Array.isArray(neg.insumos) ? neg.insumos : [];
  if (lista.length === 0) {
    hiddenId.value = '';
    searchInput.value = '';
    searchInput.placeholder = 'Primero añade un insumo con "+ Nuevo Insumo"';
    renderDropdownInsumosMovimiento('');
    return;
  }

  searchInput.placeholder = 'Escribe o selecciona un insumo...';
  const idObjetivo = forzarInsumoId || hiddenId.value || lista[0].id;
  const seleccionado = lista.find(i => i.id === idObjetivo) || lista[0];
  hiddenId.value = seleccionado.id;
  if (document.activeElement !== searchInput || forzarInsumoId) {
    searchInput.value = `${seleccionado.nombre} (${seleccionado.stockActual} ${seleccionado.unidad})`;
  }
  renderDropdownInsumosMovimiento('');
}

function renderDropdownInsumosMovimiento(filtroTexto = '') {
  const dropdown = document.getElementById('mov-insumo-dropdown');
  const hiddenId = document.getElementById('mov-insumo-id');
  if (!dropdown) return;

  const neg = obtenerNegocioActivo();
  const lista = Array.isArray(neg.insumos) ? neg.insumos : [];

  if (lista.length === 0) {
    dropdown.innerHTML = `
      <div class="p-3 text-center text-slate-400 text-xs">
        No hay insumos registrados aún.
      </div>
    `;
    return;
  }

  const q = normalizarTextoBusqueda(filtroTexto);
  const filtrados = q
    ? lista.filter(i => normalizarTextoBusqueda(`${i.nombre} ${i.unidad}`).includes(q))
    : lista;

  if (filtrados.length === 0) {
    dropdown.innerHTML = `
      <div class="p-3 text-center text-slate-400 text-xs">
        No se encontraron insumos que coincidan con "<strong>${filtroTexto}</strong>"
      </div>
    `;
    return;
  }

  const idActual = hiddenId?.value || '';
  dropdown.innerHTML = filtrados.map(i => {
    const activo = i.id === idActual;
    const alerta = i.requiereAlerta();
    return `
      <button
        type="button"
        onclick="seleccionarInsumoEnDropdownMovimiento('${i.id}')"
        class="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition ${activo ? 'bg-orange-600/20 text-orange-300 font-bold' : 'text-slate-200 hover:bg-slate-800'}"
      >
        <span class="truncate">${i.nombre}</span>
        <span class="font-mono text-[11px] flex-shrink-0 ${alerta ? 'text-amber-400 font-bold' : 'text-slate-400'}">
          ${i.stockActual} ${i.unidad}
        </span>
      </button>
    `;
  }).join('');
}

function abrirDropdownInsumosMovimiento(limpiarSiCoincideSeleccion = false) {
  const dropdown = document.getElementById('mov-insumo-dropdown');
  const searchInput = document.getElementById('mov-insumo-search');
  const hiddenId = document.getElementById('mov-insumo-id');
  if (!dropdown || !searchInput) return;

  const neg = obtenerNegocioActivo();
  const actual = (neg.insumos || []).find(i => i.id === hiddenId?.value);
  const textoSeleccionActual = actual ? `${actual.nombre} (${actual.stockActual} ${actual.unidad})` : '';

  if (limpiarSiCoincideSeleccion && searchInput.value === textoSeleccionActual) {
    searchInput.select();
    renderDropdownInsumosMovimiento('');
  } else {
    renderDropdownInsumosMovimiento(searchInput.value === textoSeleccionActual ? '' : searchInput.value);
  }
  dropdown.classList.remove('hidden');
}

function toggleDropdownInsumosMovimiento(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('mov-insumo-dropdown');
  const searchInput = document.getElementById('mov-insumo-search');
  if (!dropdown) return;

  if (dropdown.classList.contains('hidden')) {
    renderDropdownInsumosMovimiento('');
    dropdown.classList.remove('hidden');
    if (searchInput) searchInput.focus();
  } else {
    dropdown.classList.add('hidden');
  }
}

function filtrarOpcionesInsumoMovimiento(valor) {
  const dropdown = document.getElementById('mov-insumo-dropdown');
  const hiddenId = document.getElementById('mov-insumo-id');
  const neg = obtenerNegocioActivo();
  const q = normalizarTextoBusqueda(valor);

  if (hiddenId && Array.isArray(neg.insumos)) {
    const match = neg.insumos.find(i => normalizarTextoBusqueda(`${i.nombre} (${i.stockActual} ${i.unidad})`).includes(q));
    hiddenId.value = match ? match.id : '';
  }

  renderDropdownInsumosMovimiento(valor);
  if (dropdown) dropdown.classList.remove('hidden');
}

function seleccionarInsumoEnDropdownMovimiento(insumoId) {
  const neg = obtenerNegocioActivo();
  const insumo = (neg.insumos || []).find(i => i.id === insumoId);
  const hiddenId = document.getElementById('mov-insumo-id');
  const searchInput = document.getElementById('mov-insumo-search');
  const dropdown = document.getElementById('mov-insumo-dropdown');

  if (insumo) {
    if (hiddenId) hiddenId.value = insumo.id;
    if (searchInput) searchInput.value = `${insumo.nombre} (${insumo.stockActual} ${insumo.unidad})`;
  }
  if (dropdown) dropdown.classList.add('hidden');
}

function abrirModalNuevoInsumo() {
  const modal = document.getElementById('modal-nuevo-insumo');
  if (!modal) return;
  const nombreEl = document.getElementById('insumo-nombre-input');
  const unidadEl = document.getElementById('insumo-unidad-input');
  const costoEl = document.getElementById('insumo-costo-input');
  const stockEl = document.getElementById('insumo-stock-input');
  const umbralEl = document.getElementById('insumo-umbral-input');

  if (nombreEl) nombreEl.value = '';
  if (unidadEl) unidadEl.value = 'Unidades';
  if (costoEl) costoEl.value = '2500';
  if (stockEl) stockEl.value = '30';
  if (umbralEl) umbralEl.value = '10';

  modal.classList.remove('hidden');
  setTimeout(() => { if (nombreEl) nombreEl.focus(); }, 60);
}

function cerrarModalNuevoInsumo() {
  const modal = document.getElementById('modal-nuevo-insumo');
  if (modal) modal.classList.add('hidden');
}

function guardarNuevoInsumoDesdeModal(event) {
  if (event) event.preventDefault();
  const neg = obtenerNegocioActivo();
  const nombre = (document.getElementById('insumo-nombre-input')?.value || '').trim();
  const unidad = document.getElementById('insumo-unidad-input')?.value || 'Unidades';
  const costoUnitario = Math.max(0, Number(document.getElementById('insumo-costo-input')?.value || 0));
  const stockActual = Math.max(0, Number(document.getElementById('insumo-stock-input')?.value || 0));
  const umbralMinimo = Math.max(0, Number(document.getElementById('insumo-umbral-input')?.value || 0));

  if (!nombre) {
    showToast('⚠️ Escribe el nombre del insumo.', true);
    return;
  }

  const nuevoId = `ins_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const nuevoInsumo = new Insumo({
    id: nuevoId,
    nombre,
    unidad,
    stockActual,
    umbralMinimo,
    costoUnitario
  });

  if (!Array.isArray(neg.insumos)) neg.insumos = [];
  neg.insumos.push(nuevoInsumo);

  if (stockActual > 0) {
    const mov = new MovimientoInventario({
      negocioId: neg.id,
      insumoId: nuevoInsumo.id,
      insumoNombre: nuevoInsumo.nombre,
      tipo: 'entrada',
      cantidad: stockActual,
      unidad: nuevoInsumo.unidad,
      motivo: 'Stock inicial al crear insumo'
    });
    mov.registrar(neg.movimientos);
  }

  cerrarModalNuevoInsumo();
  guardarYSincronizarEstado('nuevo_insumo');
  renderInventoryTable();
  renderMovimientosTable();
  renderDailyReportsAndMetrics();
  showToast(`📦 Insumo "${nombre}" registrado en el inventario de ${neg.nombre}.`);
}

let insumoPendienteEliminarId = null;

function eliminarInsumoDelNegocio(insumoId) {
  const neg = obtenerNegocioActivo();
  const insumo = (neg.insumos || []).find(i => i.id === insumoId);
  if (!insumo) return;

  insumoPendienteEliminarId = insumo.id;
  const nombreEl = document.getElementById('eliminar-insumo-nombre');
  const modal = document.getElementById('modal-confirmar-eliminar-insumo');
  if (nombreEl) nombreEl.innerText = `"${insumo.nombre}"`;
  if (modal) modal.classList.remove('hidden');
}

function cerrarModalConfirmarEliminarInsumo() {
  insumoPendienteEliminarId = null;
  const modal = document.getElementById('modal-confirmar-eliminar-insumo');
  if (modal) modal.classList.add('hidden');
}

function confirmarEliminacionInsumo() {
  if (!insumoPendienteEliminarId) return;
  const neg = obtenerNegocioActivo();
  const idx = (neg.insumos || []).findIndex(i => i.id === insumoPendienteEliminarId);
  if (idx < 0) {
    cerrarModalConfirmarEliminarInsumo();
    return;
  }
  const nombre = neg.insumos[idx].nombre;
  neg.insumos.splice(idx, 1);
  cerrarModalConfirmarEliminarInsumo();
  guardarYSincronizarEstado('eliminar_insumo');
  renderInventoryTable();
  showToast(`🗑️ Insumo "${nombre}" eliminado de ${neg.nombre}.`);
}

function configurarUmbralInsumo(insumoId) {
  const neg = obtenerNegocioActivo();
  const insumo = neg.insumos.find(i => i.id === insumoId);
  if (!insumo) return;

  const input = prompt(`Alerta de stock mínimo para ${insumo.nombre} (${insumo.unidad}):`, insumo.umbralMinimo);
  if (input === null) return;
  const nuevoUmbral = parseFloat(input.replace(',', '.'));
  if (isNaN(nuevoUmbral) || nuevoUmbral < 0) return;

  insumo.umbralMinimo = nuevoUmbral;
  guardarYSincronizarEstado('umbral_update');
  renderInventoryTable();
  showToast(`Alerta mínima de ${insumo.nombre} ajustada a ${nuevoUmbral} ${insumo.unidad}.`);
}

function abrirModalMovimiento(insumoId, tipo) {
  const selectTipo = document.getElementById('mov-tipo');
  const inputCant = document.getElementById('mov-cantidad');
  const inputMotivo = document.getElementById('mov-motivo');
  const formPanel = document.getElementById('inventory-movement-panel');

  sincronizarComboboxInsumoMovimiento(insumoId);
  if (selectTipo) selectTipo.value = tipo;
  if (inputCant) inputCant.value = tipo === 'entrada' ? '10' : '1';
  if (inputMotivo) {
    inputMotivo.value = tipo === 'entrada'
      ? 'Compra de insumos para el turno'
      : 'Merma / desperdicio en cocina';
  }
  if (formPanel) {
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    formPanel.classList.add('ring-2', 'ring-orange-500');
    setTimeout(() => formPanel.classList.remove('ring-2', 'ring-orange-500'), 1800);
  }
}

function registrarMovimientoManual(event) {
  if (event) event.preventDefault();

  const neg = obtenerNegocioActivo();
  const selectInsumo = document.getElementById('mov-insumo-id');
  const searchInput = document.getElementById('mov-insumo-search');
  const selectTipo = document.getElementById('mov-tipo');
  const inputCant = document.getElementById('mov-cantidad');
  const inputMotivo = document.getElementById('mov-motivo');

  let insumoId = selectInsumo?.value;
  if (!insumoId && searchInput && searchInput.value.trim()) {
    const q = normalizarTextoBusqueda(searchInput.value);
    const encontrado = (neg.insumos || []).find(i => normalizarTextoBusqueda(`${i.nombre} (${i.stockActual} ${i.unidad})`).includes(q));
    if (encontrado) insumoId = encontrado.id;
  }

  const tipo = selectTipo?.value || 'entrada';
  const cantidad = parseFloat(inputCant?.value || '0');
  const motivo = inputMotivo?.value.trim() || (tipo === 'entrada' ? 'Compra manual' : 'Registro de merma');

  if (!insumoId || isNaN(cantidad) || cantidad <= 0) {
    showToast('⚠️ Selecciona un insumo válido de la lista.', true);
    return;
  }

  const insumo = neg.insumos.find(i => i.id === insumoId);
  if (!insumo) return;

  if (tipo === 'entrada') {
    insumo.agregar(cantidad);
  } else {
    insumo.descontar(cantidad);
  }

  const mov = new MovimientoInventario({
    negocioId: neg.id,
    insumoId: insumo.id,
    insumoNombre: insumo.nombre,
    tipo,
    cantidad,
    unidad: insumo.unidad,
    motivo
  });
  mov.registrar(neg.movimientos);

  guardarYSincronizarEstado('inventario_mov');
  renderInventoryTable();
  renderMovimientosTable();
  renderDailyReportsAndMetrics();
  showToast(`📦 Movimiento registrado: ${cantidad} ${insumo.unidad} de ${insumo.nombre}.`);
}

function reabastecerTodosLosInsumos() {
  const neg = obtenerNegocioActivo();
  if (!Array.isArray(neg.insumos) || neg.insumos.length === 0) {
    showToast('⚠️ Primero agrega insumos al inventario de este negocio con "+ Nuevo Insumo".', true);
    abrirModalNuevoInsumo();
    return;
  }
  neg.insumos.forEach(ins => {
    const cantAgregar = Number((ins.umbralMinimo * 2).toFixed(1));
    ins.agregar(cantAgregar);
    const mov = new MovimientoInventario({
      negocioId: neg.id,
      insumoId: insumo.id,
      insumoNombre: ins.nombre,
      tipo: 'entrada',
      cantidad: cantAgregar,
      unidad: ins.unidad,
      motivo: 'Surtimiento general de inventario'
    });
    mov.registrar(neg.movimientos);
  });

  guardarYSincronizarEstado('reabastecer_todo');
  renderInventoryTable();
  renderMovimientosTable();
  renderDailyReportsAndMetrics();
  showToast('🚚 Inventario surtido y actualizado.');
}

function filtrarMovimientos(tipo) {
  appState.filtroMovimientos = tipo;
  renderMovimientosTable();
}

function renderMovimientosTable() {
  const tbody = document.getElementById('movements-table-body');
  if (!tbody) return;

  const neg = obtenerNegocioActivo();
  const lista = appState.filtroMovimientos === 'todos'
    ? neg.movimientos
    : neg.movimientos.filter(m => m.tipo === appState.filtroMovimientos);

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">Sin movimientos registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.slice(0, 15).map(m => {
    const hora = new Date(m.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const badge = m.tipo === 'entrada'
      ? `<span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">+ Compra</span>`
      : m.tipo === 'merma'
        ? `<span class="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 font-semibold">- Merma</span>`
        : `<span class="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">Venta</span>`;

    const signo = m.tipo === 'entrada' ? '+' : '-';
    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-3 font-mono text-slate-400">${hora}</td>
        <td class="py-2.5 px-3 font-semibold text-white">${m.insumoNombre}</td>
        <td class="py-2.5 px-3">${badge}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-200">${signo}${m.cantidad} ${m.unidad}</td>
        <td class="py-2.5 px-3 text-slate-400">${m.motivo}</td>
      </tr>
    `;
  }).join('');
}

/* ==================== 13. RECEPCIÓN DE PEDIDOS DE WHATSAPP (QR + EN VIVO) ==================== */

function actualizarUIEstadoWhatsApp(waStatus) {
  if (!waStatus) return;
  if (waStatus.negocioId && appState.negocioActivoId && waStatus.negocioId !== appState.negocioActivoId) {
    return;
  }

  const neg = typeof obtenerNegocioActivo === 'function' ? obtenerNegocioActivo() : null;
  const desactivadoManual = neg && neg.botWhatsAppActivo === false && !waStatus.qrDataUrl;

  const badge = document.getElementById('wa-connection-badge');
  const placeholder = document.getElementById('wa-qr-placeholder');
  const qrImg = document.getElementById('wa-qr-image');
  const titleEl = document.getElementById('wa-status-title');
  const subEl = document.getElementById('wa-status-subtitle');

  if (desactivadoManual || waStatus.mode === 'disabled') {
    if (badge) {
      badge.className = 'px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-mono font-bold';
      badge.innerText = '🔴 WhatsApp Desactivado';
    }
    if (qrImg) qrImg.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    if (titleEl) titleEl.innerText = '🔴 WhatsApp Desactivado (El bot no responderá mensajes)';
    if (subEl) subEl.innerText = 'Pulsa "Conectar QR" cuando desees volver a activarlo.';
    return;
  }

  if (waStatus.connected) {
    if (badge) {
      badge.className = 'px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold';
      badge.innerText = `🟢 Conectado ${waStatus.phoneNumber || ''}`;
    }
    if (qrImg) qrImg.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    if (titleEl) titleEl.innerText = `✅ WhatsApp Vinculado (${waStatus.phoneNumber || 'En Línea'})`;
    if (subEl) subEl.innerText = '';
  } else if (waStatus.qrDataUrl) {
    if (badge) {
      badge.className = 'px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold animate-pulse';
      badge.innerText = '📲 Escanea el QR';
    }
    if (placeholder) placeholder.classList.add('hidden');
    if (qrImg) {
      qrImg.src = waStatus.qrDataUrl;
      qrImg.classList.remove('hidden');
    }
  } else {
    if (badge) {
      badge.className = 'px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono font-bold';
      badge.innerText = waStatus.statusText || 'Listo para vincular';
    }
    if (qrImg) qrImg.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    if (titleEl) titleEl.innerText = waStatus.statusText || 'Conecta el celular del restaurante';
    if (subEl) subEl.innerText = '';
  }
}

let waPollTimer = null;

async function desconectarWhatsAppDesdeUI() {
  const idActivo = appState.negocioActivoId || 'FOC-01';
  if (waPollTimer) {
    clearInterval(waPollTimer);
    waPollTimer = null;
  }

  // 1. Marcar el bot como desactivado en el estado del negocio y sincronizar con el servidor
  const neg = obtenerNegocioActivo();
  if (neg) {
    neg.botWhatsAppActivo = false;
    guardarYSincronizarEstado('wa_disconnect');
  }

  // 2. Actualizar la interfaz de inmediato sin depender de tiempos de espera de Puppeteer
  const estadoDesactivado = {
    negocioId: idActivo,
    connected: false,
    statusText: '🔴 WhatsApp Desactivado. Pulsa "Conectar QR" cuando desees activarlo.',
    phoneNumber: null,
    qrDataUrl: null,
    mode: 'disabled'
  };
  actualizarUIEstadoWhatsApp(estadoDesactivado);

  // 3. Solicitar cierre de sesión en el servidor (tolerante a fallos si el servidor no se ha reiniciado)
  try {
    const resp = await fetch(`${API_BASE}/api/whatsapp/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ negocioId: idActivo })
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data && data.waStatus) {
        actualizarUIEstadoWhatsApp(data.waStatus);
      }
    }
  } catch (err) {
    // Ya quedó desactivado localmente y vía /api/sync
  }

  showToast('🔌 WhatsApp desactivado correctamente. El bot no responderá hasta que vuelvas a conectar.');
}

function conectarWhatsAppPorQR(reset = false) {
  const idActivo = appState.negocioActivoId || 'FOC-01';
  const neg = obtenerNegocioActivo();
  if (neg) {
    neg.botWhatsAppActivo = true;
    guardarYSincronizarEstado('wa_connect');
  }
  actualizarUIEstadoWhatsApp({
    negocioId: idActivo,
    connected: false,
    statusText: '⏳ Generando código QR oficial de WhatsApp Web (toma unos segundos)...',
    qrDataUrl: null
  });
  showToast('📲 Generando código QR real de WhatsApp Web para este negocio...');

  fetch(`${API_BASE}/api/whatsapp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset, negocioId: idActivo })
  })
    .then(r => r.json())
    .then(res => {
      if (res && res.waStatus) {
        actualizarUIEstadoWhatsApp(res.waStatus);
      }
      // Sondear estado cada 2s hasta que aparezca el QR real o quede vinculado
      if (waPollTimer) clearInterval(waPollTimer);
      waPollTimer = setInterval(() => {
        fetch(`${API_BASE}/api/state?negocioId=${encodeURIComponent(idActivo)}`)
          .then(r => r.json())
          .then(st => {
            if (st && st.waStatus) {
              actualizarUIEstadoWhatsApp(st.waStatus);
              if (st.waStatus.connected && waPollTimer) {
                clearInterval(waPollTimer);
                waPollTimer = null;
              }
            }
          })
          .catch(() => {});
      }, 2000);
    })
    .catch(() => {
      actualizarUIEstadoWhatsApp({
        connected: false,
        statusText: '⚠️ El servidor local (server.js) no está encendido en el puerto 3000.',
        qrDataUrl: null
      });
      showToast('⚠️ Inicia server.js para generar el QR real de WhatsApp', 'warn');
    });
}

function parseTextoLibreWhatsApp(textoMensaje, nombreClienteParam = null, telefonoParam = null, direccionParam = null) {
  const neg = obtenerNegocioActivo();
  const txt = textoMensaje.toLowerCase();
  const itemsDetectados = [];

  const encontrarMod = (id) => MODIFICADORES_CATALOGO.find(m => m.id === id);

  const modsGenerales = [];
  if (txt.includes('sin cebolla')) modsGenerales.push(encontrarMod('mod_sin_cebolla'));
  if (txt.includes('sin ripio')) modsGenerales.push(encontrarMod('mod_sin_ripio'));
  if (txt.includes('sin queso')) modsGenerales.push(encontrarMod('mod_sin_queso'));
  if (txt.includes('sin tocineta')) modsGenerales.push(encontrarMod('mod_sin_tocineta'));
  if (txt.includes('sin salsa')) modsGenerales.push(encontrarMod('mod_sin_salsas'));
  if (txt.includes('salsa aparte') || txt.includes('salsas aparte')) modsGenerales.push(encontrarMod('mod_salsa_aparte'));
  if (txt.includes('extra queso') || txt.includes('doble queso') || txt.includes('adicion queso') || txt.includes('adición queso')) modsGenerales.push(encontrarMod('mod_extra_queso'));
  if (txt.includes('extra tocineta') || txt.includes('adicion tocineta') || txt.includes('adición tocineta')) modsGenerales.push(encontrarMod('mod_extra_tocineta'));
  if (txt.includes('para llevar')) modsGenerales.push(encontrarMod('mod_para_llevar'));

  const modsLimpias = modsGenerales.filter(Boolean);

  // Detectar si el cliente pidió varias unidades pero especificó "una sin..." para separar las unidades
  const pideSoloUnaModificada = /\b(una\s+sin|1\s+sin)\b/i.test(textoMensaje);

  const buscarProd = (filtroFn, catFallback) =>
    neg.catalogo.find(filtroFn) || neg.catalogo.find(p => p.categoria === catFallback) || neg.catalogo[0];

  const reglas = [
    {
      regex: /(\d+)?\s*(?:hamburguesas?|burgers?)(?:\s+(doble|clasica|clásica|especial))?/i,
      resolverProd: (m) => {
        const sub = (m[2] || '').toLowerCase();
        if (sub.includes('doble')) return buscarProd(p => p.nombre.toLowerCase().includes('doble'), 'Hamburguesas');
        if (sub.includes('clasica') || sub.includes('clásica')) return buscarProd(p => p.nombre.toLowerCase().includes('clásica') || p.nombre.toLowerCase().includes('clasica'), 'Hamburguesas');
        return buscarProd(p => p.nombre.toLowerCase().includes('especial'), 'Hamburguesas');
      }
    },
    {
      regex: /(\d+)?\s*(?:perros?)(?:\s+(tocineta|especial|tradicional|sencillo))?/i,
      resolverProd: (m) => {
        const sub = (m[2] || '').toLowerCase();
        if (sub.includes('tocineta') || sub.includes('especial')) return buscarProd(p => p.nombre.toLowerCase().includes('tocineta'), 'Perros');
        return buscarProd(p => p.nombre.toLowerCase().includes('tradicional') || p.categoria === 'Perros', 'Perros');
      }
    },
    {
      regex: /(\d+)?\s*(?:salchipapas?)(?:\s+(mixta|familiar|casera|personal))?/i,
      resolverProd: (m) => {
        const sub = (m[2] || '').toLowerCase();
        if (sub.includes('mixta')) return buscarProd(p => p.nombre.toLowerCase().includes('mixta'), 'Salchipapas');
        if (sub.includes('familiar')) return buscarProd(p => p.nombre.toLowerCase().includes('familiar'), 'Salchipapas');
        return buscarProd(p => p.categoria === 'Salchipapas', 'Salchipapas');
      }
    },
    {
      regex: /(\d+)?\s*(?:coca\s*-?\s*colas?|gaseosas?|postobon|postobón|jugos?|maracuya|maracuyá)/i,
      resolverProd: (m) => {
        const full = (m[0] || '').toLowerCase();
        if (full.includes('jugo') || full.includes('maracuy')) return buscarProd(p => p.nombre.toLowerCase().includes('jugo'), 'Bebidas');
        if (full.includes('postob')) return buscarProd(p => p.nombre.toLowerCase().includes('postob'), 'Bebidas');
        return buscarProd(p => p.nombre.toLowerCase().includes('coca') || p.categoria === 'Bebidas', 'Bebidas');
      }
    }
  ];

  reglas.forEach(r => {
    const match = textoMensaje.match(r.regex);
    if (match) {
      const prod = r.resolverProd(match);
      if (!prod) return;
      const cant = match[1] ? parseInt(match[1], 10) : 1;

      if (cant > 1 && pideSoloUnaModificada && prod.categoria !== 'Bebidas' && modsLimpias.length > 0) {
        // Unidad 1 con la modificación solicitada ("una sin cebolla")
        const itemMod = new ItemPedido({
          productoId: prod.id,
          nombreProducto: prod.nombre,
          cantidad: 1,
          precioUnitario: prod.precio,
          imagen: prod.imagen,
          modificaciones: []
        });
        modsLimpias.forEach(m => m.aplicarA(itemMod));
        itemsDetectados.push(itemMod);

        // Resto de unidades estándar ("con todo")
        const itemEstandar = new ItemPedido({
          productoId: prod.id,
          nombreProducto: prod.nombre,
          cantidad: cant - 1,
          precioUnitario: prod.precio,
          imagen: prod.imagen,
          modificaciones: []
        });
        itemsDetectados.push(itemEstandar);
      } else {
        const item = new ItemPedido({
          productoId: prod.id,
          nombreProducto: prod.nombre,
          cantidad: cant,
          precioUnitario: prod.precio,
          imagen: prod.imagen,
          modificaciones: []
        });
        if (prod.categoria !== 'Bebidas') {
          modsLimpias.forEach(m => m.aplicarA(item));
        }
        itemsDetectados.push(item);
      }
    }
  });

  // También detectar cualquier plato nuevo añadido dinámicamente al catálogo del negocio
  neg.catalogo.forEach(prod => {
    const yaIncluido = itemsDetectados.some(i => i.productoId === prod.id);
    if (!yaIncluido && txt.includes(prod.nombre.toLowerCase())) {
      const item = new ItemPedido({
        productoId: prod.id,
        nombreProducto: prod.nombre,
        cantidad: 1,
        precioUnitario: prod.precio,
        imagen: prod.imagen,
        modificaciones: []
      });
      if (prod.categoria !== 'Bebidas') {
        modsLimpias.forEach(m => m.aplicarA(item));
      }
      itemsDetectados.push(item);
    }
  });

  const coincidioProducto = itemsDetectados.length > 0;

  if (itemsDetectados.length === 0 && neg.catalogo.length > 0) {
    const prod1 = neg.catalogo[0];
    const item1 = new ItemPedido({
      productoId: prod1.id,
      nombreProducto: prod1.nombre,
      cantidad: 1,
      precioUnitario: prod1.precio,
      imagen: prod1.imagen,
      modificaciones: []
    });
    modsLimpias.forEach(m => m.aplicarA(item1));
    itemsDetectados.push(item1);
  }

  const telMatch = textoMensaje.match(/(3\d{2}[\s-]?\d{3}[\s-]?\d{4})/);
  const telefono = telefonoParam || (telMatch ? telMatch[1] : '314 888 9999');

  const dirMatch = textoMensaje.match(/(?:direcci[oó]n|barrio|calle|av\.?|avenida)[:\s]+([^.!\n]+)/i);
  const direccionDomicilio = direccionParam
    || (dirMatch ? dirMatch[0].trim() : 'Domicilio recibido por WhatsApp');

  const clienteNombre = nombreClienteParam || `Cliente WhatsApp (${telefono})`;

  return {
    clienteNombre,
    telefono,
    direccionDomicilio,
    motorizado: neg.motorizados[1] || neg.motorizados[0],
    items: itemsDetectados,
    coincidioProducto
  };
}

function procesarMensajeWhatsAppEntranteEnVivo(payload) {
  if (!payload || !payload.texto) return;
  if (payload.negocioId && appState.negocioActivoId && payload.negocioId !== appState.negocioActivoId) {
    return;
  }

  const neg = obtenerNegocioActivo();
  const chatContainer = document.getElementById('wa-chat-messages');
  const datosParseados = parseTextoLibreWhatsApp(payload.texto, payload.clienteNombre, payload.telefono, null);

  // Si viene de WhatsApp real pero el texto no menciona ningún producto del menú (ej. chat personal), ignorar para no crear comandas falsas
  if (payload.remoteJid && !datosParseados.coincidioProducto) {
    return;
  }

  // 1. Mostrar burbuja del mensaje real entrante del cliente
  if (chatContainer) {
    const userBubble = document.createElement('div');
    userBubble.className = 'bg-emerald-950/80 border border-emerald-600/40 text-emerald-100 text-xs p-3 rounded-xl rounded-tr-none max-w-[85%] ml-auto';
    userBubble.innerHTML = `
      <div class="text-[10px] font-bold text-emerald-300 mb-1">📱 ${payload.clienteNombre || 'Cliente'} (${payload.telefono || ''})</div>
      <div>${payload.texto}</div>
    `;
    chatContainer.appendChild(userBubble);
  }

  // 2. Convertir el mensaje en pedido y pasarlo DIRECTAMENTE a Cocina (KDS)
  const nuevoTicket = pedidoService.crearDesdeWhatsApp(datosParseados);

  const resumenItems = nuevoTicket.items
    .map(i => `${i.cantidad}x ${i.nombreProducto}${i.modificaciones.length ? ` (${i.modificaciones.map(m => m.descripcion).join(', ')})` : ''}`)
    .join(' + ');

  if (chatContainer) {
    const botBubble = document.createElement('div');
    botBubble.className = 'bg-slate-800 text-slate-200 text-xs p-3 rounded-xl rounded-tl-none max-w-[85%] border border-emerald-500/40 shadow-md';
    botBubble.innerHTML = `
      ✅ <strong class="text-emerald-400">Enviado directo a Cocina: ${nuevoTicket.id}</strong><br/>
      👤 <strong>Cliente:</strong> ${nuevoTicket.clienteNombre}<br/>
      📋 <strong>Detalle:</strong> ${resumenItems}<br/>
      💰 <strong>Total:</strong> $${nuevoTicket.total.toLocaleString('es-CO')} COP
    `;
    chatContainer.appendChild(botBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // 3. Si vino de un celular real conectado en server.js, responderle automáticamente al WhatsApp del cliente
  if (payload.remoteJid) {
    const textoRespuesta =
      `✅ *${neg.nombre}*\n` +
      `¡Hola ${nuevoTicket.clienteNombre}! Recibimos tu pedido *${nuevoTicket.id}* y ya pasó directamente a nuestra cocina.\n\n` +
      `📋 *Tu pedido:* ${resumenItems}\n` +
      `💰 *Total a pagar:* $${nuevoTicket.total.toLocaleString('es-CO')} COP\n` +
      `🛵 *Estado:* En fila de preparación`;

    fetch(`${API_BASE}/api/whatsapp/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remoteJid: payload.remoteJid, mensaje: textoRespuesta })
    }).catch(() => {});
  }

  renderAll();
  showToast(`🔔 ¡Nuevo pedido de WhatsApp (${nuevoTicket.id}) enviado directo a Cocina!`);
}

function abrirMenuDigitalCliente() {
  const neg = obtenerNegocioActivo();
  const baseUrl = window.location.protocol.startsWith('http')
    ? `${window.location.origin}/menu.html?negocio=${encodeURIComponent(neg.id)}`
    : `http://localhost:3000/menu.html?negocio=${encodeURIComponent(neg.id)}`;
  window.open(baseUrl, '_blank');
}

function copiarLinkMenuDigital() {
  const neg = obtenerNegocioActivo();
  fetch(`${API_BASE}/api/state?negocioId=${encodeURIComponent(neg.id)}`)
    .then(r => r.json())
    .then(st => {
      const base = (st && st.publicMenuUrl)
        ? st.publicMenuUrl
        : `http://${(st && st.localIp) ? st.localIp : 'localhost'}:${(st && st.port) ? st.port : 3000}/menu.html`;
      const url = `${base}?negocio=${encodeURIComponent(neg.id)}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url);
      }
      showToast(`🔗 Link copiado: ${url}`);
    })
    .catch(() => {
      const fallback = `http://localhost:3000/menu.html?negocio=${encodeURIComponent(neg.id)}`;
      if (navigator.clipboard) navigator.clipboard.writeText(fallback);
      showToast(`🔗 Link copiado: ${fallback}`);
    });
}

function renderBandejaWhatsAppPorNegocio() {
  const chatContainer = document.getElementById('wa-chat-messages');
  if (!chatContainer) return;

  const neg = obtenerNegocioActivo();
  if (!Array.isArray(neg.mensajesWhatsApp)) neg.mensajesWhatsApp = [];

  const pedidosWa = (neg.pedidos || []).filter(
    p => (p.canal && p.canal.toLowerCase() === 'whatsapp') || String(p.id || '').startsWith('#WA-')
  );

  let html = '';

  if (neg.mensajesWhatsApp.length === 0 && pedidosWa.length === 0) {
    html += `
      <div class="p-4 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
        No hay mensajes ni pedidos de WhatsApp registrados todavía.
      </div>
    `;
    chatContainer.innerHTML = html;
    return;
  }

  // Mostrar mensajes del flujo de WhatsApp de este negocio
  neg.mensajesWhatsApp.forEach(m => {
    let respuestaBotHtml = '';
    if (m.tipoEvento === 'opciones') {
      respuestaBotHtml = `
        <div class="bg-slate-800 text-slate-200 text-xs p-3 rounded-xl rounded-tl-none max-w-[85%] border border-blue-500/40 shadow-md">
          🤖 <strong class="text-blue-400">Opciones enviadas automáticamente:</strong><br/>
          1️⃣ Hacer el pedido directamente (Menú Virtual)<br/>
          2️⃣ Comunicarse con un asesor de atención al cliente
        </div>
      `;
    } else if (m.tipoEvento === 'atencion_humana') {
      respuestaBotHtml = `
        <div class="bg-slate-800 text-slate-200 text-xs p-3 rounded-xl rounded-tl-none max-w-[85%] border border-purple-500/40 shadow-md">
          👩‍💼 <strong class="text-purple-300">El cliente solicitó atención de un asesor (Opción 2):</strong><br/>
          Puedes responderle directamente desde el WhatsApp del restaurante.
        </div>
      `;
    } else {
      respuestaBotHtml = `
        <div class="bg-slate-800 text-slate-200 text-xs p-3 rounded-xl rounded-tl-none max-w-[85%] border border-amber-500/40 shadow-md">
          🤖 <strong class="text-amber-400">Menú Virtual de ${neg.nombre} enviado (Opción 1):</strong><br/>
          Se le compartió el enlace interactivo (<a href="${m.urlMenu || 'menu.html'}" target="_blank" class="text-emerald-400 underline">Abrir Menú Digital</a>).
        </div>
      `;
    }

    html += `
      <div class="bg-emerald-950/80 border border-emerald-600/40 text-emerald-100 text-xs p-3 rounded-xl rounded-tr-none max-w-[85%] ml-auto">
        <div class="text-[10px] font-bold text-emerald-300 mb-1">📱 ${m.clienteNombre || 'Cliente'} (${m.telefono || ''})</div>
        <div>${m.texto || ''}</div>
      </div>
      ${respuestaBotHtml}
    `;
  });

  // Mostrar pedidos de WhatsApp pertenecientes exclusivamente a este negocio
  pedidosWa.slice().reverse().forEach(p => {
    const detalleHtml = (p.items || []).map((it, idx) => {
      const mods = Array.isArray(it.modificaciones) && it.modificaciones.length > 0
        ? ` <span class="text-amber-300">(${it.modificaciones.map(m => m.descripcion).join(', ')})</span>`
        : ' <span class="text-slate-400">(Con todo)</span>';
      return `• <strong>Unidad #${idx + 1}: ${it.nombreProducto}</strong>${mods}`;
    }).join('<br/>');

    html += `
      <div class="bg-slate-800 text-slate-200 text-xs p-3.5 rounded-xl rounded-tl-none max-w-[90%] border-2 border-emerald-500/50 shadow-lg">
        ✅ <strong class="text-emerald-400">¡Pedido Exacto Recibido y Enviado Automáticamente a Cocina! (${p.id})</strong><br/>
        👤 <strong>Cliente:</strong> ${p.clienteNombre} (${p.telefono})<br/>
        📍 <strong>Entrega:</strong> ${p.direccionDomicilio} • 💳 ${p.metodoPago || 'Efectivo'}<br/>
        <div class="my-1.5 pl-2 border-l-2 border-amber-500/50">${detalleHtml}</div>
        <div class="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-700">
          <span>💰 <strong>Total:</strong> $${Number(p.total || 0).toLocaleString('es-CO')} COP</span>
          <button type="button" onclick="switchTab('kitchen')" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition">
            👨‍🍳 Ver en Pantalla Cocina (KDS)
          </button>
        </div>
      </div>
    `;
  });

  chatContainer.innerHTML = html;
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function mostrarEnvioLinkMenuEnChat(payload) {
  if (!payload) return;
  const targetNegId = payload.negocioId || 'FOC-01';
  const negDestino = appState.negocios.find(n => n.id === targetNegId);
  if (negDestino) {
    if (!Array.isArray(negDestino.mensajesWhatsApp)) negDestino.mensajesWhatsApp = [];
    negDestino.mensajesWhatsApp.push({
      clienteNombre: payload.clienteNombre,
      telefono: payload.telefono,
      texto: payload.texto,
      tipoEvento: payload.tipoEvento || 'menu_link',
      urlMenu: payload.urlMenu,
      fecha: payload.fecha || new Date().toISOString()
    });
  }

  if (appState.negocioActivoId && targetNegId !== appState.negocioActivoId) return;
  renderBandejaWhatsAppPorNegocio();
  if (payload.tipoEvento === 'atencion_humana') {
    showToast(`👩‍💼 ${payload.clienteNombre || 'Un cliente'} solicitó hablar directamente con una persona en WhatsApp.`);
  } else if (payload.tipoEvento === 'opciones') {
    showToast(`💬 Se enviaron las 2 opciones de atención a ${payload.clienteNombre || 'Cliente'}`);
  } else {
    showToast(`📲 Menú Virtual enviado por WhatsApp a ${payload.clienteNombre || 'Cliente'}`);
  }
}

function procesarPedidoMenuDigitalEnVivo(payload) {
  if (!payload || !payload.pedido) return;
  const p = payload.pedido;
  const targetNegId = payload.negocioId || p.negocioId || 'FOC-01';
  const negDestino = appState.negocios.find(n => n.id === targetNegId);

  if (negDestino && !negDestino.pedidos.some(existing => existing.id === p.id)) {
    negDestino.pedidos.unshift(new Pedido({ ...p, negocioId: targetNegId }));
  }

  if (appState.negocioActivoId && targetNegId !== appState.negocioActivoId) return;

  reproducirSonidoCocina();
  renderAll();
  showToast(`🔔 ¡Nuevo pedido (${p.id}) ya está en Pantalla Cocina (KDS)!`);
}

function parseWhatsAppOrder(customMessageText = null) {
  const neg = obtenerNegocioActivo();
  const inputWa = document.getElementById('wa-custom-input');
  const inputName = document.getElementById('wa-sender-name');
  const inputAddr = document.getElementById('wa-sender-address');
  const chatContainer = document.getElementById('wa-chat-messages');

  const textoAProcesar = customMessageText
    || (inputWa && inputWa.value.trim() !== '' ? inputWa.value.trim() : null);

  if (!textoAProcesar) {
    switchTab('kitchen');
    showToast('👨‍🍳 Los pedidos del Menú Digital y WhatsApp pasan automáticamente a Pantalla Cocina (KDS).');
    return;
  }

  const nombreManual = inputName && inputName.value.trim() !== '' ? inputName.value.trim() : null;
  const dirManual = inputAddr && inputAddr.value.trim() !== '' ? inputAddr.value.trim() : null;

  if (chatContainer && inputWa && inputWa.value.trim() !== '') {
    const userBubble = document.createElement('div');
    userBubble.className = 'bg-emerald-950/80 border border-emerald-600/40 text-emerald-100 text-xs p-3 rounded-xl rounded-tr-none max-w-[85%] ml-auto';
    userBubble.textContent = textoAProcesar;
    chatContainer.appendChild(userBubble);
    inputWa.value = '';
  }

  const datosParseados = parseTextoLibreWhatsApp(textoAProcesar, nombreManual, null, dirManual);
  const nuevoTicket = pedidoService.crearDesdeWhatsApp(datosParseados);

  if (chatContainer) {
    const resumenItems = nuevoTicket.items
      .map(i => `${i.cantidad}x ${i.nombreProducto}${i.modificaciones.length ? ` (${i.modificaciones.map(m => m.descripcion).join(', ')})` : ''}`)
      .join(' + ');

    const botBubble = document.createElement('div');
    botBubble.className = 'bg-slate-800 text-slate-200 text-xs p-3 rounded-xl rounded-tl-none max-w-[85%] border border-emerald-500/40 shadow-md';
    botBubble.innerHTML = `
      ✅ <strong class="text-emerald-400">Comanda ${nuevoTicket.id} enviada directo a Cocina (${neg.nombre})</strong><br/>
      👤 <strong>Cliente:</strong> ${nuevoTicket.clienteNombre} • 📍 ${nuevoTicket.direccionDomicilio}<br/>
      📋 <strong>Pedido:</strong> ${resumenItems}<br/>
      💰 <strong>Total:</strong> $${nuevoTicket.total.toLocaleString('es-CO')} COP
    `;
    chatContainer.appendChild(botBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  renderAll();
  showToast(`📱 Pedido de WhatsApp convertido en comanda ${nuevoTicket.id} y enviado a Cocina.`);
}

/* ==================== 14. CIERRE DE CAJA Y REPORTES (DÍA / SEMANA / MES) ==================== */

function formatearFechaLocalYYYYMMDD(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatearMesLocalYYYYMM(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

let estadoFiltroReporteCaja = {
  modo: 'dia', // 'dia' | 'semana' | 'mes'
  fecha: formatearFechaLocalYYYYMMDD(new Date()),
  mes: formatearMesLocalYYYYMM(new Date())
};

function cambiarModoReporteCaja(nuevoModo) {
  if (!['dia', 'semana', 'mes'].includes(nuevoModo)) return;
  estadoFiltroReporteCaja.modo = nuevoModo;
  renderDailyReportsAndMetrics();
}

function actualizarFechaReporteCaja(nuevaFecha) {
  if (!nuevaFecha) return;
  estadoFiltroReporteCaja.fecha = nuevaFecha;
  renderDailyReportsAndMetrics();
}

function actualizarMesReporteCaja(nuevoMes) {
  if (!nuevoMes) return;
  estadoFiltroReporteCaja.mes = nuevoMes;
  renderDailyReportsAndMetrics();
}

function irAReporteDeHoy() {
  const ahora = new Date();
  estadoFiltroReporteCaja.fecha = formatearFechaLocalYYYYMMDD(ahora);
  estadoFiltroReporteCaja.mes = formatearMesLocalYYYYMM(ahora);
  renderDailyReportsAndMetrics();
}

function obtenerRangoFiltroReporteCaja() {
  const ahora = new Date();
  const hoyStr = formatearFechaLocalYYYYMMDD(ahora);
  if (!estadoFiltroReporteCaja.fecha) estadoFiltroReporteCaja.fecha = hoyStr;
  if (!estadoFiltroReporteCaja.mes) estadoFiltroReporteCaja.mes = formatearMesLocalYYYYMM(ahora);

  const modo = estadoFiltroReporteCaja.modo || 'dia';

  if (modo === 'mes') {
    const [yStr, mStr] = estadoFiltroReporteCaja.mes.split('-');
    const y = parseInt(yStr, 10) || ahora.getFullYear();
    const m = parseInt(mStr, 10) || (ahora.getMonth() + 1);
    const inicio = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const fin = new Date(y, m, 0, 23, 59, 59, 999);
    const nombreMes = inicio.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    return {
      modo,
      inicio,
      fin,
      tituloKpi: 'Ventas del Mes',
      etiquetaPeriodo: `Reporte mensual: ${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}`
    };
  }

  const [yStr, mStr, dStr] = estadoFiltroReporteCaja.fecha.split('-');
  const y = parseInt(yStr, 10) || ahora.getFullYear();
  const m = parseInt(mStr, 10) || (ahora.getMonth() + 1);
  const d = parseInt(dStr, 10) || ahora.getDate();

  if (modo === 'semana') {
    const fechaBase = new Date(y, m - 1, d, 12, 0, 0);
    const diaSemana = fechaBase.getDay(); // 0 = Domingo, 1 = Lunes
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const inicio = new Date(y, m - 1, d + diffLunes, 0, 0, 0, 0);
    const fin = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6, 23, 59, 59, 999);
    const fmtCorto = { day: '2-digit', month: 'short', year: 'numeric' };
    return {
      modo,
      inicio,
      fin,
      tituloKpi: 'Ventas de la Semana',
      etiquetaPeriodo: `Reporte semanal: ${inicio.toLocaleDateString('es-CO', fmtCorto)} al ${fin.toLocaleDateString('es-CO', fmtCorto)}`
    };
  }

  // Modo 'dia' (por defecto)
  const inicio = new Date(y, m - 1, d, 0, 0, 0, 0);
  const fin = new Date(y, m - 1, d, 23, 59, 59, 999);
  const esHoy = estadoFiltroReporteCaja.fecha === hoyStr;
  const fechaLegible = inicio.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });

  return {
    modo: 'dia',
    inicio,
    fin,
    tituloKpi: esHoy ? 'Ventas del Día (Hoy)' : 'Ventas de la Fecha',
    etiquetaPeriodo: esHoy
      ? `Mostrando lo realizado hoy (${fechaLegible})`
      : `Reporte del día: ${fechaLegible}`
  };
}

function renderDailyReportsAndMetrics() {
  const neg = obtenerNegocioActivo();
  const rango = obtenerRangoFiltroReporteCaja();

  const repTitle = document.getElementById('rep-active-business-name');
  if (repTitle) {
    repTitle.innerText = `${neg.icono} Cierre de Caja y Reporte de Ventas • ${neg.nombre}`;
  }

  const labelPeriodo = document.getElementById('rep-periodo-label');
  if (labelPeriodo) {
    labelPeriodo.innerText = rango.etiquetaPeriodo;
  }

  const tituloKpi = document.getElementById('rep-titulo-kpi-ventas');
  if (tituloKpi) {
    tituloKpi.innerText = rango.tituloKpi;
  }

  // Sincronizar botones de modo (Día / Semana / Mes) y selectores de fecha
  const modos = ['dia', 'semana', 'mes'];
  modos.forEach(m => {
    const btn = document.getElementById(`btn-rep-modo-${m}`);
    if (btn) {
      btn.className = rango.modo === m
        ? 'px-3 py-1.5 rounded-lg font-bold transition bg-orange-600 text-white'
        : 'px-3 py-1.5 rounded-lg font-medium transition text-slate-400 hover:text-white';
    }
  });

  const boxFecha = document.getElementById('box-rep-filtro-fecha');
  const boxMes = document.getElementById('box-rep-filtro-mes');
  const inputFecha = document.getElementById('rep-filtro-fecha');
  const inputMes = document.getElementById('rep-filtro-mes');

  if (inputFecha && inputFecha.value !== estadoFiltroReporteCaja.fecha) {
    inputFecha.value = estadoFiltroReporteCaja.fecha;
  }
  if (inputMes && inputMes.value !== estadoFiltroReporteCaja.mes) {
    inputMes.value = estadoFiltroReporteCaja.mes;
  }

  if (rango.modo === 'mes') {
    if (boxFecha) {
      boxFecha.classList.add('hidden');
      boxFecha.classList.remove('flex');
    }
    if (boxMes) {
      boxMes.classList.remove('hidden');
      boxMes.classList.add('flex');
    }
  } else {
    if (boxFecha) {
      boxFecha.classList.remove('hidden');
      boxFecha.classList.add('flex');
    }
    if (boxMes) {
      boxMes.classList.add('hidden');
      boxMes.classList.remove('flex');
    }
  }

  const tsInicio = rango.inicio.getTime();
  const tsFin = rango.fin.getTime();

  const pedidosFiltrados = (neg.pedidos || []).filter(p => {
    const ts = new Date(p.fechaIngreso || p.fechaCreacion || Date.now()).getTime();
    return ts >= tsInicio && ts <= tsFin;
  }).sort((a, b) => new Date(b.fechaIngreso).getTime() - new Date(a.fechaIngreso).getTime());

  const movimientosFiltrados = (neg.movimientos || []).filter(m => {
    const ts = new Date(m.fecha || Date.now()).getTime();
    return ts >= tsInicio && ts <= tsFin;
  });

  const totalPedidos = pedidosFiltrados.length;
  const pedidosCaja = pedidosFiltrados.filter(p => (p.canal || '').toLowerCase() !== 'whatsapp').length;
  const pedidosWa = pedidosFiltrados.filter(p => (p.canal || '').toLowerCase() === 'whatsapp').length;

  const ventasTotales = pedidosFiltrados.reduce((acc, p) => acc + (Number(p.total) || 0), 0);
  const ingresosAdiciones = pedidosFiltrados.reduce((acc, p) => acc + (p.totalAdiciones ? p.totalAdiciones() : 0), 0);

  const ventasEfectivo = pedidosFiltrados
    .filter(p => String(p.metodoPago || 'Efectivo').toLowerCase().includes('efectivo'))
    .reduce((acc, p) => acc + (Number(p.total) || 0), 0);
  const ventasOtros = Math.max(0, ventasTotales - ventasEfectivo);

  const despachadosConTiempo = pedidosFiltrados.filter(
    p => p.estado === EstadoPedido.DESPACHADO && p.tiempoDespachoMinutos && p.tiempoDespachoMinutos() !== null
  );
  const promedioDespacho = despachadosConTiempo.length > 0
    ? Math.round(despachadosConTiempo.reduce((a, p) => a + p.tiempoDespachoMinutos(), 0) / despachadosConTiempo.length)
    : 0;

  const mermasPeriodo = movimientosFiltrados.filter(m => m.tipo === 'merma').length;
  const consumosPeriodo = movimientosFiltrados.filter(m => m.tipo === 'consumo').length;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setText('rep-ventas-hoy', `$${ventasTotales.toLocaleString('es-CO')} COP`);
  setText('rep-pedidos-hoy', `${totalPedidos} órdenes (${pedidosCaja} Local / ${pedidosWa} WhatsApp)`);
  setText('rep-adiciones-hoy', `+$${ingresosAdiciones.toLocaleString('es-CO')} COP`);
  setText('rep-tiempo-promedio', despachadosConTiempo.length > 0 ? `${promedioDespacho} min promedio` : 'Sin despachos');
  setText('rep-mermas-count', `${mermasPeriodo} merma(s) / ${consumosPeriodo} consumos`);

  const elDesglosePagos = document.getElementById('rep-desglose-pagos');
  if (elDesglosePagos) {
    elDesglosePagos.innerHTML = `
      <div>💵 Efectivo: <span class="text-emerald-400">$${ventasEfectivo.toLocaleString('es-CO')}</span></div>
      <div>📱 Nequi / Transf.: <span class="text-blue-400">$${ventasOtros.toLocaleString('es-CO')}</span></div>
    `;
  }

  const tbodyVentas = document.getElementById('daily-sales-table-body');
  if (tbodyVentas) {
    if (pedidosFiltrados.length === 0) {
      tbodyVentas.innerHTML = `
        <tr>
          <td colspan="8" class="py-8 text-center text-slate-500">
            No se encontraron ventas registradas en este período (${rango.etiquetaPeriodo.toLowerCase()}).
          </td>
        </tr>
      `;
    } else {
      tbodyVentas.innerHTML = pedidosFiltrados.map(p => {
        const estadoBadge = p.estado === EstadoPedido.DESPACHADO
          ? `<span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold">Entregado</span>`
          : p.estado === EstadoPedido.EN_PREPARACION
            ? `<span class="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 text-[10px] font-semibold">En Parrilla</span>`
            : `<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-semibold">Pendiente</span>`;

        const fechaObj = new Date(p.fechaIngreso || Date.now());
        const fechaHoraStr = rango.modo === 'dia'
          ? fechaObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
          : fechaObj.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

        const resumenPlatos = (p.items || []).map(i => `${i.cantidad}x ${i.nombreProducto}`).join(', ');
        const canalTexto = (p.canal || '').toLowerCase() === 'whatsapp' ? '📱 WhatsApp' : '🏪 Local';
        const pagoTexto = p.metodoPago || 'Efectivo';

        return `
          <tr class="hover:bg-slate-800/40 transition">
            <td class="py-2.5 px-3 font-mono font-bold text-orange-400">${p.id}</td>
            <td class="py-2.5 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">${fechaHoraStr}</td>
            <td class="py-2.5 px-3 text-white">${p.clienteNombre}</td>
            <td class="py-2.5 px-3 text-slate-300">
              <div>${canalTexto}</div>
              <div class="text-[10px] text-slate-400">${pagoTexto}</div>
            </td>
            <td class="py-2.5 px-3 text-slate-400 truncate max-w-xs">${resumenPlatos}</td>
            <td class="py-2.5 px-3">${estadoBadge}</td>
            <td class="py-2.5 px-3 font-mono font-bold text-emerald-400 text-right">$${Number(p.total || 0).toLocaleString('es-CO')}</td>
            <td class="py-2.5 px-3 text-right">
              <button onclick="imprimirTicketTermico('${p.id}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]">
                <i class="fa-solid fa-print"></i> Recibo
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

function imprimirReporteCierreCaja() {
  const neg = obtenerNegocioActivo();
  const rango = obtenerRangoFiltroReporteCaja();
  const tsInicio = rango.inicio.getTime();
  const tsFin = rango.fin.getTime();

  const pedidosFiltrados = (neg.pedidos || []).filter(p => {
    const ts = new Date(p.fechaIngreso || p.fechaCreacion || Date.now()).getTime();
    return ts >= tsInicio && ts <= tsFin;
  }).sort((a, b) => new Date(b.fechaIngreso).getTime() - new Date(a.fechaIngreso).getTime());

  const ventasTotales = pedidosFiltrados.reduce((acc, p) => acc + (Number(p.total) || 0), 0);
  const ventasEfectivo = pedidosFiltrados
    .filter(p => String(p.metodoPago || 'Efectivo').toLowerCase().includes('efectivo'))
    .reduce((acc, p) => acc + (Number(p.total) || 0), 0);
  const ventasOtros = Math.max(0, ventasTotales - ventasEfectivo);
  const ingresosAdiciones = pedidosFiltrados.reduce((acc, p) => acc + (p.totalAdiciones ? p.totalAdiciones() : 0), 0);

  const filasHtml = pedidosFiltrados.length > 0
    ? pedidosFiltrados.map(p => {
        const f = new Date(p.fechaIngreso || Date.now()).toLocaleString('es-CO', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const itemsStr = (p.items || []).map(i => `${i.cantidad}x ${i.nombreProducto}`).join(', ');
        return `
          <tr>
            <td>${p.id}</td>
            <td>${f}</td>
            <td>${p.clienteNombre}</td>
            <td>${p.metodoPago || 'Efectivo'}</td>
            <td>${itemsStr}</td>
            <td style="text-align:right; font-weight:bold;">$${Number(p.total || 0).toLocaleString('es-CO')}</td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="6" style="text-align:center; padding:14px;">Sin ventas registradas en este período</td></tr>`;

  const ventana = window.open('', '_blank', 'width=800,height=700');
  if (!ventana) {
    showToast('Permite las ventanas emergentes para imprimir el reporte.', true);
    return;
  }

  ventana.document.write(`
    <html>
      <head>
        <title>Reporte de Cierre - ${neg.nombre}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
          h2 { margin: 0 0 4px 0; }
          .sub { color: #555; font-size: 13px; margin-bottom: 16px; }
          .kpis { display: flex; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
          .kpi { border: 1px solid #ccc; border-radius: 8px; padding: 10px 14px; min-width: 150px; }
          .kpi-label { font-size: 11px; color: #555; text-transform: uppercase; }
          .kpi-val { font-size: 16px; font-weight: bold; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f4f4f5; text-transform: uppercase; font-size: 11px; }
        </style>
      </head>
      <body onload="window.print()">
        <h2>${neg.nombre}</h2>
        <div class="sub">${rango.etiquetaPeriodo} • Generado: ${new Date().toLocaleString('es-CO')}</div>
        <div class="kpis">
          <div class="kpi">
            <div class="kpi-label">${rango.tituloKpi}</div>
            <div class="kpi-val">$${ventasTotales.toLocaleString('es-CO')} COP (${pedidosFiltrados.length} órdenes)</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Efectivo</div>
            <div class="kpi-val">$${ventasEfectivo.toLocaleString('es-CO')} COP</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Nequi / Transferencias</div>
            <div class="kpi-val">$${ventasOtros.toLocaleString('es-CO')} COP</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Adiciones Cobradas</div>
            <div class="kpi-val">+$${ingresosAdiciones.toLocaleString('es-CO')} COP</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Fecha / Hora</th>
              <th>Cliente / Mesa</th>
              <th>Medio Pago</th>
              <th>Productos</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${filasHtml}
          </tbody>
        </table>
      </body>
    </html>
  `);
  ventana.document.close();
}

/* ==================== 15. NOTIFICACIONES E INICIALIZACIÓN ==================== */

function showToast(message, isError = false) {
  const toast = document.getElementById('toast-notification');
  const msg = document.getElementById('toast-message');
  const icon = document.getElementById('toast-icon');

  if (!toast || !msg || !icon) return;
  if (toastTimeout) clearTimeout(toastTimeout);

  msg.innerText = message;
  if (isError) {
    icon.className = 'w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-sm flex-shrink-0';
    icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
  } else {
    icon.className = 'w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm flex-shrink-0';
    icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
  }

  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  toastTimeout = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3600);
}

function setupCategoryFilters() {
  const filterButtons = document.querySelectorAll('.cat-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const cat = btn.getAttribute('data-cat');
      appState.selectedCategory = cat;

      filterButtons.forEach(b => {
        b.className = 'cat-btn flex-1 justify-center text-center px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition';
      });
      btn.className = 'cat-btn flex-1 justify-center text-center px-3 py-2 rounded-lg text-xs font-semibold bg-orange-600 text-white transition shadow-sm';

      renderProducts(cat);
    });
  });
}

function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      activarPestana(target, false);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupCategoryFilters();
  setupTabs();
  iniciarEscuchaTiempoReal();

  const offlineToggle = document.getElementById('offline-toggle');
  if (offlineToggle) {
    offlineToggle.addEventListener('click', toggleModoOffline);
  }

  document.addEventListener('click', (e) => {
    const combo = document.getElementById('mov-insumo-combobox');
    const dropdown = document.getElementById('mov-insumo-dropdown');
    if (combo && dropdown && !combo.contains(e.target)) {
      dropdown.classList.add('hidden');
      sincronizarComboboxInsumoMovimiento();
    }
  });

  sincronizarPantallaLogin();
  sincronizarVistaRol();
  renderAll();

  // Soporte de acceso directo desde el panel privado /admin.html (?autologin=FOC-01)
  try {
    const params = new URLSearchParams(window.location.search);
    const autoNegocioId = params.get('autologin');
    if (autoNegocioId) {
      fetch(`${API_BASE}/api/state?negocioId=${encodeURIComponent(autoNegocioId)}`)
        .then(r => r.json())
        .then(res => {
          if (res && res.ok && res.data && Array.isArray(res.data.negocios) && res.data.negocios[0]) {
            const negAislado = new Negocio(res.data.negocios[0]);
            const idx = appState.negocios.findIndex(n => n.id === negAislado.id);
            if (idx >= 0) appState.negocios[idx] = negAislado;
            else appState.negocios.push(negAislado);
            iniciarSesionDirecta(negAislado.id, 'propietario');
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        })
        .catch(() => {});
    }
  } catch (e) {}

  setInterval(() => {
    const now = new Date();
    const clock = document.getElementById('live-clock');
    if (clock) {
      clock.innerHTML = `<i class="fa-regular fa-clock text-slate-400"></i> ${now.toLocaleTimeString('es-CO')}`;
    }
    actualizarCronometrosKDS();
  }, 1000);
});
