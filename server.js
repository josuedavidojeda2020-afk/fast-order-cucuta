// ============================================================================
// FAST ORDER CÚCUTA - SERVIDOR BACKEND EN TIEMPO REAL + CONECTOR WHATSAPP QR
// Arquitectura C4 Nivel 2 y 3: API REST + SSE + WhatsApp Multi-Device (Forma 1)
// Ejecución: node server.js
// ============================================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const DB_DIR = path.join(__dirname, 'db');
if (!fs.existsSync(DB_DIR)) {
  try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (e) {}
}
// Guardar la sesión de Chromium fuera de OneDrive para evitar bloqueos de archivos (rmdir Service Worker)
const WA_AUTH_DIR = path.join(os.tmpdir(), 'fast_order_cucuta_wwebjs_auth');
const CLOUDFLARED_BIN = path.join(os.tmpdir(), 'fast_order_cloudflared.exe');

// Estado del túnel global de Cloudflare (permite abrir el Menú Digital desde cualquier ubicación o datos móviles 4G/5G)
let cloudflarePublicUrl = null;
const shortLinks = new Map();
const sesionesChatWhatsApp = new Map();

function descargarArchivoHTTPS(url, destPath) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'FastOrderCucuta/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return descargarArchivoHTTPS(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch (e) {}
        reject(err);
      });
    });
    req.on('error', reject);
  });
}

async function iniciarTunelCloudflareEstable() {
  try {
    if (!fs.existsSync(CLOUDFLARED_BIN) || fs.statSync(CLOUDFLARED_BIN).size < 5000000) {
      console.log('☁️ [Cloudflare] Descargando conector oficial de Cloudflare Tunnel por única vez...');
      await descargarArchivoHTTPS(
        'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
        CLOUDFLARED_BIN
      );
      console.log('✅ [Cloudflare] Conector descargado correctamente.');
    }

    const cfProc = spawn(CLOUDFLARED_BIN, [
      'tunnel',
      '--url', `http://127.0.0.1:${PORT}`,
      '--no-autoupdate'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const capturarUrlCloudflare = (chunk) => {
      const texto = chunk.toString();
      const match = texto.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && match[0] && cloudflarePublicUrl !== match[0]) {
        cloudflarePublicUrl = match[0];
        console.log(`🌍 [Link Global Activo] Menú Digital accesible desde cualquier ubicación/datos móviles en: ${cloudflarePublicUrl}/menu.html`);
      }
    };

    cfProc.stdout.on('data', capturarUrlCloudflare);
    cfProc.stderr.on('data', capturarUrlCloudflare);
    cfProc.on('error', () => {});
    cfProc.on('close', () => {
      cloudflarePublicUrl = null;
      setTimeout(iniciarTunelCloudflareEstable, 5000);
    });
  } catch (err) {
    console.warn('⚠️ [Cloudflare] Usando enlace de red local como respaldo:', err.message);
  }
}

function obtenerDominioClicableDirecto() {
  if (cloudflarePublicUrl) {
    return cloudflarePublicUrl;
  }
  const ipLocal = obtenerIPLocal();
  const ipGuiones = ipLocal === 'localhost' ? '127-0-0-1' : ipLocal.replace(/\./g, '-');
  return `http://${ipGuiones}.sslip.io:${PORT}`;
}

function crearLinkCortoMenu({ negocioId, tel, nombre, jid }) {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  shortLinks.set(code, { negocioId, tel, nombre, jid });
  return `${obtenerDominioClicableDirecto()}/m/${code}`;
}

// Evitar que bloqueos temporales de archivos de Chromium/Windows detengan el servidor
process.on('uncaughtException', (err) => {
  console.warn('⚠️ [Aviso Sistema] Excepción controlada:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ [Aviso Sistema] Promesa controlada:', reason && reason.message ? reason.message : reason);
});

function obtenerIPLocal() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (e) {}
  return 'localhost';
}

// Clientes navegador conectados en tiempo real (Caja, Cocina KDS, Propietario)
const sseClients = new Set();

// Mapa de sesiones de WhatsApp aisladas por cada Negocio (FOC-01, FOC-02, FOC-03...)
const waSessions = new Map();

function obtenerSesionWhatsApp(negocioId = 'FOC-01') {
  const id = String(negocioId || 'FOC-01').trim();
  if (!waSessions.has(id)) {
    waSessions.set(id, {
      negocioId: id,
      client: null,
      initializing: false,
      status: {
        negocioId: id,
        connected: false,
        statusText: 'Desconectado (Listo para vincular QR)',
        phoneNumber: null,
        qrDataUrl: null,
        mode: 'ready' // 'ready' | 'qr' | 'connected' | 'missing_deps'
      }
    });
  }
  return waSessions.get(id);
}

function leerBaseDeDatos() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      // Sincronizar archivos individuales por negocio en /db/<id>.json si existen
      if (db && Array.isArray(db.negocios)) {
        db.negocios = db.negocios.map(neg => {
          const tenantFile = path.join(DB_DIR, `${neg.id}.json`);
          if (fs.existsSync(tenantFile)) {
            try {
              return JSON.parse(fs.readFileSync(tenantFile, 'utf8'));
            } catch (e) {}
          }
          return neg;
        });
      }
      return db;
    }
  } catch (e) {
    console.error('Error leyendo database.json:', e.message);
  }
  return null;
}

function guardarBaseDeDatos(data) {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (data && Array.isArray(data.negocios)) {
      data.negocios.forEach(neg => {
        if (neg && neg.id) {
          const tenantFile = path.join(DB_DIR, `${neg.id}.json`);
          fs.writeFileSync(tenantFile, JSON.stringify(neg, null, 2), 'utf8');
        }
      });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error guardando database.json:', e.message);
  }
}

function obtenerRangoEstadoKDS(estado) {
  const est = String(estado || 'PENDIENTE').toUpperCase();
  if (est.includes('DESP') || est.includes('LISTO') || est.includes('ENTREG')) return 3;
  if (est.includes('PREP')) return 2;
  return 1;
}

function guardarNegocioAislado(negocioActualizado, cambiarActivo = true) {
  if (!negocioActualizado || !negocioActualizado.id) return null;
  const db = leerBaseDeDatos() || { negocioActivoId: negocioActualizado.id, negocios: [] };
  if (!Array.isArray(db.negocios)) db.negocios = [];

  const idx = db.negocios.findIndex(n => n.id === negocioActualizado.id);
  if (idx >= 0) {
    const previo = db.negocios[idx];
    if (previo) {
      if (!negocioActualizado.claveAcceso && previo.claveAcceso) negocioActualizado.claveAcceso = previo.claveAcceso;
      if (!negocioActualizado.claveCajero && previo.claveCajero) negocioActualizado.claveCajero = previo.claveCajero;
      if (!negocioActualizado.claveCocina && previo.claveCocina) negocioActualizado.claveCocina = previo.claveCocina;
    }
    // Proteger estados de Cocina (KDS): nunca permitir que un pedido ya en preparación o despachado regrese a PENDIENTE
    if (previo && Array.isArray(previo.pedidos) && Array.isArray(negocioActualizado.pedidos)) {
      const mapaPrevios = new Map(previo.pedidos.map(p => [p.id, p]));
      negocioActualizado.pedidos = negocioActualizado.pedidos.map(p => {
        const ant = mapaPrevios.get(p.id);
        if (ant && obtenerRangoEstadoKDS(ant.estado) > obtenerRangoEstadoKDS(p.estado)) {
          return {
            ...p,
            estado: ant.estado,
            fechaPreparacion: ant.fechaPreparacion || p.fechaPreparacion,
            fechaDespacho: ant.fechaDespacho || p.fechaDespacho
          };
        }
        return p;
      });
      // Preservar pedidos de WhatsApp recién llegados al servidor que aún no estén en la lista del navegador
      const idsNuevos = new Set(negocioActualizado.pedidos.map(p => p.id));
      previo.pedidos.forEach(ant => {
        if (ant && ant.id && String(ant.id).startsWith('#WA-') && !idsNuevos.has(ant.id)) {
          negocioActualizado.pedidos.unshift(ant);
        }
      });
    }
    db.negocios[idx] = negocioActualizado;
  } else {
    db.negocios.push(negocioActualizado);
  }

  if (cambiarActivo) {
    db.negocioActivoId = negocioActualizado.id;
  }
  db.updatedAt = new Date().toISOString();
  guardarBaseDeDatos(db);
  return negocioActualizado;
}

function emitirEventoTiempoReal(evento, payload) {
  const msg = `event: ${evento}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

// ============================================================================
// CONECTOR REAL DE WHATSAPP POR CÓDIGO QR (whatsapp-web.js + qrcode)
// ============================================================================

function detectarNavegadorSistema() {
  const posiblesRutas = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const ruta of posiblesRutas) {
    if (fs.existsSync(ruta)) return ruta;
  }
  return undefined;
}

async function iniciarConexionWhatsAppQR(forzarNuevoQR = false, negocioId = 'FOC-01') {
  const idNegocio = String(negocioId || 'FOC-01').trim();
  const sesion = obtenerSesionWhatsApp(idNegocio);
  let wwebjs = null;
  let QRCode = null;

  try {
    wwebjs = require('whatsapp-web.js');
    QRCode = require('qrcode');
  } catch (err) {
    sesion.status = {
      negocioId: idNegocio,
      connected: false,
      statusText: 'Librería WhatsApp pendiente de instalar (ejecuta: npm install)',
      phoneNumber: null,
      qrDataUrl: null,
      mode: 'missing_deps'
    };
    emitirEventoTiempoReal('wa_status', sesion.status);
    return sesion.status;
  }

  if ((sesion.initializing || sesion.status.connected) && !forzarNuevoQR) {
    return sesion.status;
  }

  try {
    sesion.initializing = true;

    if (sesion.client) {
      try {
        await sesion.client.destroy();
      } catch (e) {}
      sesion.client = null;
    }

    const nombreCarpetaSesion = idNegocio === 'FOC-01' ? 'session' : `session-${idNegocio}`;
    const rutaCarpetaSesion = path.join(WA_AUTH_DIR, nombreCarpetaSesion);

    if (forzarNuevoQR && fs.existsSync(rutaCarpetaSesion)) {
      try {
        fs.rmSync(rutaCarpetaSesion, { recursive: true, force: true });
      } catch (e) {}
    }

    const { Client, LocalAuth } = wwebjs;

    sesion.status = {
      negocioId: idNegocio,
      connected: false,
      statusText: 'Generando Código QR de WhatsApp (espera unos segundos)...',
      phoneNumber: null,
      qrDataUrl: null,
      mode: 'qr'
    };
    emitirEventoTiempoReal('wa_status', sesion.status);

    const rutaBrowser = detectarNavegadorSistema();
    const authOpts = idNegocio === 'FOC-01'
      ? { dataPath: WA_AUTH_DIR }
      : { dataPath: WA_AUTH_DIR, clientId: idNegocio };

    const client = new Client({
      authStrategy: new LocalAuth(authOpts),
      puppeteer: {
        headless: true,
        ...(rutaBrowser ? { executablePath: rutaBrowser } : {}),
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    sesion.client = client;

    client.on('qr', async (qr) => {
      try {
        const qrUrl = await QRCode.toDataURL(qr, { width: 260, margin: 1 });
        sesion.status = {
          negocioId: idNegocio,
          connected: false,
          statusText: 'Escanea este código QR desde el WhatsApp del negocio',
          phoneNumber: null,
          qrDataUrl: qrUrl,
          mode: 'qr'
        };
        emitirEventoTiempoReal('wa_status', sesion.status);
        console.log(`📲 [WhatsApp ${idNegocio}] Código QR generado.`);
      } catch (e) {}
    });

    client.on('ready', () => {
      sesion.initializing = false;
      const numero = client.info?.wid?.user || 'Conectado';
      sesion.status = {
        negocioId: idNegocio,
        connected: true,
        statusText: `WhatsApp del Negocio Conectado (+${numero})`,
        phoneNumber: `+${numero}`,
        qrDataUrl: null,
        mode: 'connected'
      };
      emitirEventoTiempoReal('wa_status', sesion.status);
      console.log(`✅ [WhatsApp ${idNegocio}] Vinculado exitosamente al número +${numero}`);
    });

    client.on('disconnected', (reason) => {
      sesion.initializing = false;
      sesion.status = {
        negocioId: idNegocio,
        connected: false,
        statusText: `WhatsApp desconectado (${reason}). Genera un nuevo QR.`,
        phoneNumber: null,
        qrDataUrl: null,
        mode: 'ready'
      };
      emitirEventoTiempoReal('wa_status', sesion.status);
    });

    // ESCUCHAR MENSAJES REALES ENTRANTES DE LOS CLIENTES EN EL WHATSAPP DE ESTE NEGOCIO
    client.on('message', async (msg) => {
      try {
        if (msg.fromMe) return;
        const from = msg.from || '';
        // Ignorar grupos, canales/newsletters y estados de WhatsApp
        if (
          from.includes('@g.us') ||
          from.includes('@newsletter') ||
          from.includes('@broadcast') ||
          from.includes('status@broadcast')
        ) {
          return;
        }

        const textoMensaje = (msg.body || '').trim();
        if (!textoMensaje) return;

        let telefonoCliente = from.split('@')[0];
        let nombreCliente = `Cliente WhatsApp (${telefonoCliente.slice(-4)})`;
        try {
          const contact = await msg.getContact();
          if (contact) {
            if (contact.number) telefonoCliente = String(contact.number);
            if (contact.pushname || contact.name) {
              nombreCliente = contact.pushname || contact.name;
            }
          }
        } catch (e) {}

        console.log(`📩 [WhatsApp ${idNegocio}] Mensaje recibido de ${nombreCliente} (${telefonoCliente}): ${textoMensaje}`);

        await procesarFlujoHibridoWhatsApp({
          negocioId: idNegocio,
          from,
          telefonoCliente,
          nombreCliente,
          textoMensaje,
          msgObj: msg
        });
      } catch (e) {
        console.warn('Error procesando mensaje entrante de WhatsApp:', e.message);
      }
    });

    client.initialize().catch(err => {
      sesion.initializing = false;
      console.warn(`Aviso al inicializar WhatsApp Web (${idNegocio}):`, err.message);
    });

    return sesion.status;
  } catch (err) {
    sesion.initializing = false;
    console.error('Error iniciando WhatsApp QR:', err.message);
    sesion.status = {
      negocioId: idNegocio,
      connected: false,
      statusText: `Error al iniciar WhatsApp: ${err.message}`,
      phoneNumber: null,
      qrDataUrl: null,
      mode: 'ready'
    };
    emitirEventoTiempoReal('wa_status', sesion.status);
    return sesion.status;
  }
}

async function enviarRespuestaWhatsAppCliente(remoteJid, textoRespuesta, negocioId = 'FOC-01', msgObj = null) {
  const sesion = obtenerSesionWhatsApp(negocioId);
  if (!sesion.client || !sesion.status.connected || !remoteJid) return false;
  try {
    await sesion.client.sendMessage(remoteJid, textoRespuesta, {
      sendSeen: false,
      linkPreview: false
    });
    return true;
  } catch (e) {
    if (msgObj && typeof msgObj.reply === 'function') {
      try {
        await msgObj.reply(textoRespuesta, undefined, {
          sendSeen: false,
          linkPreview: false
        });
        return true;
      } catch (errReply) {
        console.warn('Fallback msg.reply también falló:', errReply.message);
      }
    }
    console.warn('No se pudo enviar respuesta automática por WhatsApp:', e.message);
    return false;
  }
}

function extraerIngredientesPlatoServidor(prod, neg) {
  if (!prod) return [];
  const lista = [];
  const agregarSiNoExiste = (txt) => {
    const limpio = String(txt || '').trim().replace(/\.$/, '');
    if (limpio && !lista.some(x => x.toLowerCase() === limpio.toLowerCase())) {
      lista.push(limpio);
    }
  };

  if (Array.isArray(prod.ingredientes)) {
    prod.ingredientes.forEach(agregarSiNoExiste);
  }
  if (prod.ingredientesTexto && String(prod.ingredientesTexto).trim() !== '') {
    String(prod.ingredientesTexto).split(',').forEach(agregarSiNoExiste);
  }
  if (prod.descripcion && String(prod.descripcion).includes('• Ingredientes:')) {
    const parte = String(prod.descripcion).split('• Ingredientes:')[1] || '';
    parte.split(/[,•]+/).forEach(agregarSiNoExiste);
  }
  if (Array.isArray(prod.receta) && neg && Array.isArray(neg.insumos)) {
    prod.receta.forEach(r => {
      const ins = neg.insumos.find(i => i.id === r.insumoId);
      if (ins && ins.nombre) {
        agregarSiNoExiste(ins.nombre.replace(/\s*\(.*?\)\s*/g, ''));
      }
    });
  }
  return lista;
}

async function registrarPedidoWhatsAppEnCocina(payload) {
  const ticketId = `#WA-${Math.floor(1000 + Math.random() * 9000)}`;
  const ahora = new Date().toISOString();

  const itemsNormalizados = (Array.isArray(payload.items) ? payload.items : []).map((it, idx) => {
    const modsNorm = (Array.isArray(it.modificaciones) ? it.modificaciones : []).map(m => {
      const desc = String(m.descripcion || '');
      const costo = Number(m.costoExtra ?? m.precioExtra ?? 0);
      const tipo = m.tipo || (desc.includes('🚫') || desc.toLowerCase().startsWith('sin ')
        ? 'sin_ingrediente'
        : costo > 0 || desc.includes('➕')
          ? 'extra'
          : 'aparte');
      return {
        id: m.id || `mod_${idx}_${ Math.random().toString(36).slice(2, 6) }`,
        tipo,
        descripcion: desc,
        costoExtra: costo,
        precioExtra: costo,
        icono: m.icono || (tipo === 'sin_ingrediente' ? '🚫' : tipo === 'extra' ? '➕' : '🏷️')
      };
    });

    return {
      id: it.id || it.lineId || `item_${Date.now()}_${idx}`,
      productoId: it.productoId,
      nombreProducto: it.nombreProducto,
      cantidad: Number(it.cantidad) || 1,
      precioUnitario: Number(it.precioUnitario) || 0,
      imagen: it.imagen || 'IMAGENES PARA PEDIR/ESPECIAL.jpg',
      modificaciones: modsNorm,
      notas: it.notas || ''
    };
  });

  const totalPedido = itemsNormalizados.reduce((acc, it) => {
    const extras = it.modificaciones.reduce((s, m) => s + (Number(m.costoExtra) || 0), 0);
    return acc + ((Number(it.precioUnitario) || 0) + extras) * (Number(it.cantidad) || 1);
  }, 0);

  const nuevoPedido = {
    id: ticketId,
    negocioId: payload.negocioId || 'FOC-01',
    fechaIngreso: ahora,
    fechaCreacion: ahora,
    fechaPreparacion: null,
    fechaDespacho: null,
    canal: 'WhatsApp',
    estado: 'PENDIENTE',
    clienteNombre: payload.clienteNombre || 'Cliente WhatsApp',
    telefono: payload.telefono || '314 888 9999',
    direccionDomicilio: payload.direccionDomicilio || 'Domicilio WhatsApp',
    metodoPago: payload.metodoPago || 'Efectivo',
    motorizado: payload.motorizado || 'Domiciliario 1 - Camilo R. (Moto KLM-45D)',
    items: itemsNormalizados,
    total: totalPedido,
    sincronizado: true,
    inventarioDescontado: true
  };

  const db = leerBaseDeDatos();
  let nombreRestaurante = 'Al Carbón Burguer';
  if (db && Array.isArray(db.negocios) && db.negocios.length > 0) {
    const neg = db.negocios.find(n => n.id === payload.negocioId) || db.negocios[0];
    nombreRestaurante = neg.nombre || nombreRestaurante;
    if (!Array.isArray(neg.pedidos)) neg.pedidos = [];
    // También corregir cualquier pedido previo que hubiera quedado con 'Pendiente' en minúscula
    neg.pedidos.forEach(p => {
      if (p.estado === 'Pendiente') p.estado = 'PENDIENTE';
    });
    neg.pedidos.unshift(nuevoPedido);

    if (Array.isArray(neg.catalogo) && Array.isArray(neg.insumos)) {
      itemsNormalizados.forEach(item => {
        const prod = neg.catalogo.find(p => p.id === item.productoId);
        if (prod && Array.isArray(prod.receta)) {
          prod.receta.forEach(r => {
            const ins = neg.insumos.find(i => i.id === r.insumoId);
            if (ins) {
              const cantTotal = (Number(r.cantidad) || 1) * (Number(item.cantidad) || 1);
              ins.stockActual = Math.max(0, (Number(ins.stockActual) || 0) - cantTotal);
            }
          });
        }
      });
    }

    guardarNegocioAislado(neg, false);
    emitirEventoTiempoReal('sync', {
      negocioId: neg.id,
      accion: 'nuevo_pedido_wa',
      negocio: neg,
      negocios: [neg]
    });
  }

  emitirEventoTiempoReal('wa_menu_digital_order', {
    negocioId: payload.negocioId || 'FOC-01',
    pedido: nuevoPedido,
    remoteJid: payload.remoteJid || null
  });

  const detalleLineas = itemsNormalizados.map((it) => {
    const modsTxt = Array.isArray(it.modificaciones) && it.modificaciones.length > 0
      ? ` _(${it.modificaciones.map(m => m.descripcion).join(', ')})_`
      : '';
    return `• ${it.cantidad}x *${it.nombreProducto}*${modsTxt}`;
  }).join('\n');

  const textoConfirmacionWA =
    `✅ *Pedido Recibido (${ticketId})*\n\n` +
    `${detalleLineas}\n\n` +
    `📍 *Entrega:* ${nuevoPedido.direccionDomicilio} (${nuevoPedido.metodoPago})\n` +
    `💰 *Total:* $${totalPedido.toLocaleString('es-CO')} COP`;

  let jidDestino = payload.remoteJid || null;
  if (!jidDestino && payload.telefono) {
    const soloDigitos = String(payload.telefono).replace(/\D/g, '');
    if (soloDigitos.length >= 10) {
      const conPais = soloDigitos.length === 10 && soloDigitos.startsWith('3')
        ? `57${soloDigitos}`
        : soloDigitos;
      jidDestino = `${conPais}@c.us`;
    }
  }
  if (jidDestino) {
    await enviarRespuestaWhatsAppCliente(jidDestino, textoConfirmacionWA, payload.negocioId || 'FOC-01');
  }

  return nuevoPedido;
}

// ============================================================================
// FLUJO CONVERSACIONAL DE WHATSAPP: 2 OPCIONES AL SALUDAR O CONSULTAR
// ============================================================================

async function procesarFlujoHibridoWhatsApp({ negocioId = 'FOC-01', from, telefonoCliente, nombreCliente, textoMensaje, msgObj = null }) {
  const dbActual = leerBaseDeDatos();
  const idActivo = negocioId || (dbActual && dbActual.negocioActivoId) || 'FOC-01';
  const negocioActivo = (dbActual && Array.isArray(dbActual.negocios) && (dbActual.negocios.find(n => n.id === idActivo) || dbActual.negocios[0])) || null;
  if (negocioActivo && negocioActivo.botWhatsAppActivo === false) {
    console.log(`⏸️ [WhatsApp ${idActivo}] Mensaje ignorado porque WhatsApp está desactivado desde el panel.`);
    return;
  }
  const sesionWaActual = obtenerSesionWhatsApp(idActivo);
  if (sesionWaActual && sesionWaActual.status && sesionWaActual.status.mode === 'disabled') {
    return;
  }
  const nombreRestaurante = negocioActivo ? negocioActivo.nombre : 'Al Carbón Burguer';
  const idRestaurante = negocioActivo ? negocioActivo.id : idActivo;
  const catalogoDisponible = negocioActivo && Array.isArray(negocioActivo.catalogo)
    ? negocioActivo.catalogo.filter(p => p.disponible !== false)
    : [];

  const normalizarTexto = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const txtNorm = normalizarTexto(textoMensaje);
  if (!txtNorm) return;

  const claveSesion = `${idRestaurante}_${from}`;
  const ahora = Date.now();
  const sesion = sesionesChatWhatsApp.get(claveSesion);

  // 1. Si el cliente responde eligiendo la Opción 1 o la Opción 2:
  const eligeOpcion1 =
    txtNorm === '1' ||
    txtNorm.startsWith('1 ') ||
    txtNorm.includes('opcion 1') ||
    txtNorm.includes('hacer el pedido') ||
    txtNorm.includes('hacer pedido');

  const eligeOpcion2 =
    txtNorm === '2' ||
    txtNorm.startsWith('2 ') ||
    txtNorm.includes('opcion 2') ||
    txtNorm.includes('asesor') ||
    txtNorm.includes('atencion al cliente') ||
    txtNorm.includes('comunicarme');

  if (eligeOpcion1) {
    sesionesChatWhatsApp.set(claveSesion, { estado: 'menu_enviado', timestamp: ahora });
    const urlClicable = crearLinkCortoMenu({
      negocioId: idRestaurante,
      tel: telefonoCliente,
      nombre: nombreCliente,
      jid: from
    });

    const mensajeLink =
      `🍔 *¡Perfecto ${nombreCliente}!*\n\n` +
      `Haz tu pedido directamente aquí en nuestro Menú Virtual:\n` +
      `${urlClicable}`;

    await enviarRespuestaWhatsAppCliente(from, mensajeLink, idRestaurante, msgObj);

    emitirEventoTiempoReal('wa_menu_link_sent', {
      negocioId: idRestaurante,
      remoteJid: from,
      telefono: telefonoCliente,
      clienteNombre: nombreCliente,
      texto: textoMensaje,
      tipoEvento: 'menu_link',
      urlMenu: urlClicable,
      fecha: new Date().toISOString()
    });
    return;
  }

  if (eligeOpcion2) {
    sesionesChatWhatsApp.set(claveSesion, { estado: 'atencion_humana', timestamp: ahora });
    const mensajeHumano =
      `👩‍💼 *En un momento lo atenderemos.*\nUn asesor de *${nombreRestaurante}* se comunicará contigo por este chat.`;

    await enviarRespuestaWhatsAppCliente(from, mensajeHumano, idRestaurante, msgObj);

    emitirEventoTiempoReal('wa_menu_link_sent', {
      negocioId: idRestaurante,
      remoteJid: from,
      telefono: telefonoCliente,
      clienteNombre: nombreCliente,
      texto: textoMensaje,
      tipoEvento: 'atencion_humana',
      urlMenu: null,
      fecha: new Date().toISOString()
    });
    return;
  }

  // Si el cliente ya eligió la opción 2 (hablar con un asesor), no volver a mostrar el mensaje del principio
  if (sesion && sesion.estado === 'atencion_humana') {
    return;
  }

  // 2. Cada vez que una persona diga "hola", "buenas noches" u otras palabras relacionadas, mostrar las 2 opciones:
  const nombresPlatos = catalogoDisponible
    .map(p => normalizarTexto(p.nombre))
    .filter(n => n && n.length >= 4);

  const palabrasClaveRestaurante = [
    'hola', 'ola', 'buenas', 'buenos', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches',
    'menu', 'carta', 'catalogo', 'pedido', 'pedir', 'quiero', 'deme', 'me regala', 'regalame',
    'hamburguesa', 'burger', 'perro', 'salchipapa', 'coca', 'gaseosa', 'jugo',
    'postobon', 'domicilio', 'domicilios', 'precio', 'precios', 'cuanto', 'valor', 'abierto',
    'tienen', 'servicio', 'que hay', 'info'
  ];

  const mencionaSaludoORestaurante =
    palabrasClaveRestaurante.some(k => txtNorm.includes(k)) ||
    nombresPlatos.some(n => txtNorm.includes(n));

  if (!mencionaSaludoORestaurante) return;

  sesionesChatWhatsApp.set(claveSesion, { estado: 'esperando_opcion', timestamp: ahora });

  const mensajeOpciones =
    `🍔 *¡Hola ${nombreCliente}! Bienvenido a ${nombreRestaurante}*\n\n` +
    `¿Cómo podemos ayudarte hoy? Responde con el número de tu opción:\n\n` +
    `*1️⃣ Hacer el pedido directamente* (Menú Virtual)\n` +
    `*2️⃣ Comunicarse con un asesor de atención al cliente*`;

  await enviarRespuestaWhatsAppCliente(from, mensajeOpciones, idRestaurante, msgObj);

  emitirEventoTiempoReal('wa_menu_link_sent', {
    negocioId: idRestaurante,
    remoteJid: from,
    telefono: telefonoCliente,
    clienteNombre: nombreCliente,
    texto: textoMensaje,
    tipoEvento: 'opciones',
    urlMenu: null,
    fecha: new Date().toISOString()
  });
}

// ============================================================================
// SERVIDOR HTTP + API REST + SERVER-SENT EVENTS
// ============================================================================

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // 1. Canal de eventos en tiempo real (SSE para KDS, Caja y WhatsApp QR)
  if (pathname === '/api/stream' && req.method === 'GET') {
    const streamNegocioId = parsedUrl.searchParams.get('negocioId') || 'FOC-01';
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('event: connected\ndata: {"status":"ok"}\n\n');
    res.write(`event: wa_status\ndata: ${JSON.stringify(obtenerSesionWhatsApp(streamNegocioId).status)}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // 2. Obtener estado sincronizado (Aislado por negocio si se envía ?negocioId=...)
  if (pathname === '/api/state' && req.method === 'GET') {
    const db = leerBaseDeDatos();
    const negocioIdParam = parsedUrl.searchParams.get('negocioId');
    let dataRespuesta = db;
    let idWaConsultado = (db && db.negocioActivoId) || 'FOC-01';

    if (db && Array.isArray(db.negocios) && negocioIdParam && negocioIdParam !== 'admin') {
      const negAislado = db.negocios.find(
        n => n.id.toLowerCase() === negocioIdParam.toLowerCase() ||
             (n.usuarioLogin && n.usuarioLogin.toLowerCase() === negocioIdParam.toLowerCase())
      );
      if (negAislado) {
        idWaConsultado = negAislado.id;
        dataRespuesta = {
          negocioActivoId: negAislado.id,
          negocios: [negAislado],
          updatedAt: db.updatedAt
        };
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      data: dataRespuesta,
      waStatus: obtenerSesionWhatsApp(idWaConsultado).status,
      localIp: obtenerIPLocal(),
      port: PORT,
      publicMenuUrl: `${obtenerDominioClicableDirecto()}/menu.html`
    }));
    return;
  }

  // 2.1 Autenticación en el Servidor con Aislamiento Multi-Negocio (/api/auth/login)
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { usuario, clave, rol } = JSON.parse(body || '{}');
        const userClean = String(usuario || '').trim().toLowerCase();
        const passClean = String(clave || '').trim();
        const rolClean = String(rol || 'propietario').trim().toLowerCase();
        const db = leerBaseDeDatos() || { negocios: [] };

        if (userClean === 'admin' && (passClean === '1234' || passClean === 'admin')) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: true,
            isAdmin: true,
            negocios: db.negocios || []
          }));
          return;
        }

        const negocio = (db.negocios || []).find(
          n => (n.usuarioLogin && n.usuarioLogin.toLowerCase() === userClean) ||
               (n.id && n.id.toLowerCase() === userClean)
        );

        if (!negocio) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: false,
            error: `No existe ningún negocio registrado con el usuario "${userClean}".`
          }));
          return;
        }

        // Validar contraseña específica según el rol seleccionado (Dueño, Cajero o Cocina)
        const mapaClavesPorRol = {
          propietario: {
            clave: String(negocio.claveAcceso || '1234').trim(),
            etiqueta: 'Dueño'
          },
          cajero: {
            clave: String(negocio.claveCajero || '2222').trim(),
            etiqueta: 'Cajero'
          },
          cocina: {
            clave: String(negocio.claveCocina || '3333').trim(),
            etiqueta: 'Cocina'
          }
        };
        const configRol = mapaClavesPorRol[rolClean] || mapaClavesPorRol.propietario;

        if (passClean !== configRol.clave) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: false,
            error: `Contraseña incorrecta para el rol de ${configRol.etiqueta}.`
          }));
          return;
        }

        if (negocio.estadoSuscripcion === 'Suspendida') {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: false,
            error: 'La suscripción de este negocio está suspendida. Contacta al administrador de Fast Order Cúcuta.'
          }));
          return;
        }

        // Marcar este negocio como el negocio activo en el servidor y entregar SOLO sus datos y SU estado de WhatsApp
        db.negocioActivoId = negocio.id;
        guardarBaseDeDatos(db);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          negocioId: negocio.id,
          negocio,
          waStatus: obtenerSesionWhatsApp(negocio.id).status
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 2.15 Registro Profesional de un Nuevo Negocio en su propia Base de Datos Aislada
  if (pathname === '/api/negocios/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const db = leerBaseDeDatos() || { negocios: [] };
        if (!Array.isArray(db.negocios)) db.negocios = [];

        const userClean = String(payload.usuarioLogin || '').trim().toLowerCase();
        if (!userClean) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'El usuario de acceso es obligatorio.' }));
          return;
        }

        const yaExiste = db.negocios.some(
          n => (n.usuarioLogin && n.usuarioLogin.toLowerCase() === userClean) ||
               (payload.id && n.id.toLowerCase() === String(payload.id).toLowerCase())
        );
        if (yaExiste) {
          res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: `El usuario "${userClean}" ya está en uso por otro negocio.` }));
          return;
        }

        const nextIdx = db.negocios.length + 1;
        const nuevoId = payload.id || `FOC-0${nextIdx}`;
        // Nunca copiar datos de otro negocio existente (db.negocios[0]); cada negocio nace 100% independiente
        const catalogoBase = Array.isArray(payload.catalogo) ? payload.catalogo : [];
        const insumosBase = Array.isArray(payload.insumos) ? payload.insumos : [];

        const nuevoNegocio = {
          id: nuevoId,
          usuarioLogin: userClean,
          claveAcceso: String(payload.claveAcceso || '1234').trim(),
          claveCajero: String(payload.claveCajero || '2222').trim(),
          claveCocina: String(payload.claveCocina || '3333').trim(),
          nombre: String(payload.nombre || 'Nuevo Restaurante').trim(),
          barrio: String(payload.barrio || 'Cúcuta').trim(),
          propietario: String(payload.propietario || 'Propietario').trim(),
          whatsappLinea: String(payload.whatsappLinea || '300 000 0000').trim(),
          especialidad: String(payload.especialidad || 'Comidas Rápidas & Domicilios').trim(),
          icono: payload.icono || '🔥',
          suscripcionMensual: Number(payload.suscripcionMensual) || 40000,
          estadoSuscripcion: 'Activa',
          nextTicketNumber: 101,
          motorizados: [
            'En local (Sin motorizado)'
          ],
          catalogo: catalogoBase,
          insumos: insumosBase,
          pedidos: [],
          movimientos: [],
          mensajesWhatsApp: []
        };

        guardarNegocioAislado(nuevoNegocio, true);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          negocioId: nuevoNegocio.id,
          negocio: nuevoNegocio
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 2.16 Actualizar estado de suscripción o credenciales de un negocio desde /admin.html
  if (pathname === '/api/admin/negocios/update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const db = leerBaseDeDatos() || { negocios: [] };
        const neg = (db.negocios || []).find(n => n.id === payload.id);
        if (!neg) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Negocio no encontrado.' }));
          return;
        }
        if (payload.nombre !== undefined) neg.nombre = String(payload.nombre).trim();
        if (payload.usuarioLogin !== undefined) neg.usuarioLogin = String(payload.usuarioLogin).trim().toLowerCase();
        if (payload.claveAcceso !== undefined) neg.claveAcceso = String(payload.claveAcceso).trim();
        if (payload.claveCajero !== undefined) neg.claveCajero = String(payload.claveCajero).trim();
        if (payload.claveCocina !== undefined) neg.claveCocina = String(payload.claveCocina).trim();
        if (payload.barrio !== undefined) neg.barrio = String(payload.barrio).trim();
        if (payload.propietario !== undefined) neg.propietario = String(payload.propietario).trim();
        if (payload.whatsappLinea !== undefined) neg.whatsappLinea = String(payload.whatsappLinea).trim();
        if (payload.estadoSuscripcion !== undefined) neg.estadoSuscripcion = payload.estadoSuscripcion;
        if (payload.suscripcionMensual !== undefined) neg.suscripcionMensual = Number(payload.suscripcionMensual) || 40000;

        guardarNegocioAislado(neg, false);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, negocio: neg }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 2.17 Eliminar un negocio desde /admin.html
  if (pathname === '/api/admin/negocios/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body || '{}');
        const db = leerBaseDeDatos() || { negocios: [] };
        if (!Array.isArray(db.negocios) || db.negocios.length <= 1) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Debe existir al menos 1 negocio activo en el servidor.' }));
          return;
        }
        db.negocios = db.negocios.filter(n => n.id !== id);
        if (db.negocioActivoId === id && db.negocios[0]) {
          db.negocioActivoId = db.negocios[0].id;
        }
        const tenantFile = path.join(DB_DIR, `${id}.json`);
        if (fs.existsSync(tenantFile)) {
          try { fs.unlinkSync(tenantFile); } catch (e) {}
        }
        guardarBaseDeDatos(db);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, negocios: db.negocios }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 2.2 Redirección limpia de links cortos clicables de WhatsApp (/m/1234 -> /menu.html?...)
  if (pathname.startsWith('/m/') && req.method === 'GET') {
    const code = pathname.replace('/m/', '').trim();
    const info = shortLinks.get(code);
    if (info) {
      const qs = `negocio=${encodeURIComponent(info.negocioId || 'FOC-01')}&tel=${encodeURIComponent(info.tel || '')}&nombre=${encodeURIComponent(info.nombre || '')}&jid=${encodeURIComponent(info.jid || '')}`;
      res.writeHead(302, { Location: `/menu.html?${qs}` });
      res.end();
      return;
    }
    res.writeHead(302, { Location: '/menu.html' });
    res.end();
    return;
  }

  // 2.5 Recibir pedido exacto desde el Menú Digital Interactivo del Cliente (Opción 3)
  if (pathname === '/api/menu-digital/order' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const nuevoPedido = await registrarPedidoWhatsAppEnCocina(payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, pedido: nuevoPedido }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 3. Guardar y sincronizar cambios (Aislado por negocio: Negocio A nunca sobrescribe al Negocio B)
  if (pathname === '/api/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload && payload.negocio && payload.negocio.id) {
          // Modo aislado estricto: guarda únicamente el negocio que envió el cambio
          const actualizado = guardarNegocioAislado(payload.negocio, true);
          emitirEventoTiempoReal('sync', {
            negocioId: actualizado.id,
            accion: payload.accion || 'update',
            negocio: actualizado,
            negocios: [actualizado]
          });
        } else if (payload && Array.isArray(payload.negocios)) {
          const dbExistente = leerBaseDeDatos();
          if (payload.negocioId && dbExistente && Array.isArray(dbExistente.negocios) && dbExistente.negocios.length > 0 && payload.accion !== 'init_seed') {
            const negEnviado = payload.negocios.find(n => n.id === payload.negocioId);
            if (negEnviado) {
              const actualizado = guardarNegocioAislado(negEnviado, true);
              emitirEventoTiempoReal('sync', {
                negocioId: actualizado.id,
                accion: payload.accion || 'update',
                negocio: actualizado,
                negocios: [actualizado]
              });
            }
          } else {
            guardarBaseDeDatos({
              negocioActivoId: payload.negocioId || 'FOC-01',
              negocios: payload.negocios,
              updatedAt: new Date().toISOString()
            });
            emitirEventoTiempoReal('sync', {
              negocioId: payload.negocioId || null,
              accion: payload.accion || 'update',
              negocios: payload.negocios
            });
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 4. Iniciar o reiniciar vinculación de WhatsApp por Código QR (Aislada por Negocio)
  if (pathname === '/api/whatsapp/connect' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      let reset = false;
      let negocioId = 'FOC-01';
      try {
        const parsed = body ? JSON.parse(body) : {};
        reset = Boolean(parsed.reset);
        if (parsed.negocioId) negocioId = String(parsed.negocioId).trim();
      } catch (e) {}
      try {
        const dbActual = leerBaseDeDatos();
        if (dbActual && Array.isArray(dbActual.negocios)) {
          const neg = dbActual.negocios.find(n => n.id === negocioId);
          if (neg) {
            neg.botWhatsAppActivo = true;
            guardarBaseDeDatos(dbActual);
          }
        }
      } catch (e) {}
      const status = await iniciarConexionWhatsAppQR(reset, negocioId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, waStatus: status }));
    });
    return;
  }

  // 4.1 Desconectar WhatsApp / Cerrar Sesión desde la interfaz visual
  if (pathname === '/api/whatsapp/disconnect' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      let negocioId = 'FOC-01';
      try {
        const parsed = body ? JSON.parse(body) : {};
        if (parsed.negocioId) negocioId = String(parsed.negocioId).trim();
      } catch (e) {}

      // Persistir en la base de datos que el bot está desactivado para este negocio
      try {
        const dbActual = leerBaseDeDatos();
        if (dbActual && Array.isArray(dbActual.negocios)) {
          const neg = dbActual.negocios.find(n => n.id === negocioId);
          if (neg) {
            neg.botWhatsAppActivo = false;
            guardarBaseDeDatos(dbActual);
          }
        }
      } catch (e) {}

      const sesion = obtenerSesionWhatsApp(negocioId);
      const clientAnterior = sesion.client;
      sesion.client = null;
      sesion.initializing = false;
      sesion.status = {
        negocioId,
        connected: false,
        statusText: '🔴 WhatsApp Desactivado. Pulsa "Conectar QR" cuando desees activarlo.',
        phoneNumber: null,
        qrDataUrl: null,
        mode: 'disabled'
      };

      emitirEventoTiempoReal('wa_status', sesion.status);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, waStatus: sesion.status }));

      // Cerrar cliente de Puppeteer y limpiar sesión en segundo plano sin bloquear la respuesta HTTP
      setImmediate(async () => {
        try {
          if (clientAnterior) {
            await Promise.race([
              clientAnterior.logout().catch(() => {}),
              new Promise(r => setTimeout(r, 3500))
            ]);
            await Promise.race([
              clientAnterior.destroy().catch(() => {}),
              new Promise(r => setTimeout(r, 3500))
            ]);
          }
        } catch (e) {}
        const authNegocioDir = path.join(WA_AUTH_DIR, `session-${negocioId}`);
        if (fs.existsSync(authNegocioDir)) {
          try { fs.rmSync(authNegocioDir, { recursive: true, force: true }); } catch (e) {}
        }
      });
    });
    return;
  }

  // 5. Enviar respuesta automática al cliente de WhatsApp cuando su pedido entra a Cocina
  if (pathname === '/api/whatsapp/reply' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { remoteJid, mensaje, negocioId } = JSON.parse(body);
        const enviado = await enviarRespuestaWhatsAppCliente(remoteJid, mensaje, negocioId || 'FOC-01');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: enviado }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 6. Webhook externo compatible con WhatsApp Cloud API / Bots (RF-03 / RNF-07)
  if (pathname === '/api/whatsapp/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const texto = data.texto || data.text || data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || '';
        const telefono = data.telefono || data.from || data?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || '314 888 9999';
        const clienteNombre = data.clienteNombre || data?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || 'Cliente WhatsApp';

        if (texto) {
          emitirEventoTiempoReal('wa_incoming_message', {
            remoteJid: null,
            telefono,
            clienteNombre,
            texto,
            fecha: new Date().toISOString()
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 7. Servir archivos estáticos de la PWA (index.html, app.js, imágenes)
  let safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Archivo no encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================================');
  console.log(`🚀 FAST ORDER CÚCUTA - SERVIDOR EN TIEMPO REAL + WHATSAPP QR ACTIVO`);
  console.log(`👉 Abre en este computador: http://localhost:${PORT}`);
  console.log(`📱 En celulares/tablets del mismo Wi-Fi usa la IP local en el puerto ${PORT}`);
  console.log(`🔗 Link clicable directo para WhatsApp: ${obtenerDominioClicableDirecto()}/menu.html`);
  console.log('====================================================================');

  // Iniciar túnel global estable de Cloudflare (para abrir el Menú Digital desde cualquier ubicación / datos móviles)
  iniciarTunelCloudflareEstable();

  // Iniciar automáticamente el motor de WhatsApp para tener el QR real listo para escanear
  iniciarConexionWhatsAppQR(false);
});
