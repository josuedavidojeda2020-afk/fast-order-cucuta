// ============================================================================
// MOTOR DE BASE DE DATOS RELACIONAL SQLITE (ACID + WAL + RESPALDO ATÓMICO)
// Archivo de Base de Datos: db/fastorder.sqlite
// ============================================================================

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_DIR = __dirname;
const SQLITE_FILE = path.join(DB_DIR, 'fastorder.sqlite');
const JSON_BACKUP_FILE = path.join(DB_DIR, 'database.json');

let sqliteDb = null;

function escrituraAtomicaJSON(rutaDestino, objetoDatos) {
  try {
    const tmpFile = `${rutaDestino}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(objetoDatos, null, 2), 'utf8');
    fs.renameSync(tmpFile, rutaDestino);
  } catch (e) {
    try {
      fs.writeFileSync(rutaDestino, JSON.stringify(objetoDatos, null, 2), 'utf8');
    } catch (_) {}
  }
}

function leerSemillaJSONExistente() {
  try {
    if (fs.existsSync(JSON_BACKUP_FILE)) {
      const db = JSON.parse(fs.readFileSync(JSON_BACKUP_FILE, 'utf8'));
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
  } catch (e) {}
  return null;
}

function obtenerConexionSQLite() {
  if (sqliteDb) return sqliteDb;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  sqliteDb = new DatabaseSync(SQLITE_FILE);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');
  sqliteDb.exec('PRAGMA synchronous = NORMAL;');
  sqliteDb.exec('PRAGMA foreign_keys = ON;');

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS config_sistema (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS negocios (
      id TEXT PRIMARY KEY,
      orden INTEGER DEFAULT 0,
      usuario_login TEXT,
      clave_acceso TEXT DEFAULT '1234',
      clave_cajero TEXT DEFAULT '2222',
      clave_cocina TEXT DEFAULT '3333',
      nombre TEXT,
      barrio TEXT,
      propietario TEXT,
      whatsapp_linea TEXT,
      especialidad TEXT,
      icono TEXT DEFAULT '🔥',
      suscripcion_mensual INTEGER DEFAULT 40000,
      estado_suscripcion TEXT DEFAULT 'Activa',
      next_ticket_number INTEGER DEFAULT 101,
      bot_whatsapp_activo INTEGER DEFAULT 1,
      motorizados_json TEXT DEFAULT '[]',
      mensajes_wa_json TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS productos (
      negocio_id TEXT,
      id TEXT,
      orden INTEGER DEFAULT 0,
      nombre TEXT,
      categoria TEXT,
      precio INTEGER DEFAULT 0,
      disponible INTEGER DEFAULT 1,
      imagen TEXT,
      descripcion TEXT,
      tiempo TEXT,
      icono TEXT,
      ingredientes_json TEXT DEFAULT '[]',
      adiciones_json TEXT DEFAULT '[]',
      receta_json TEXT DEFAULT '{}',
      PRIMARY KEY (negocio_id, id)
    );

    CREATE TABLE IF NOT EXISTS insumos (
      negocio_id TEXT,
      id TEXT,
      orden INTEGER DEFAULT 0,
      nombre TEXT,
      unidad TEXT,
      stock_actual REAL DEFAULT 0,
      stock_minimo REAL DEFAULT 0,
      costo_unitario INTEGER DEFAULT 0,
      PRIMARY KEY (negocio_id, id)
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      negocio_id TEXT,
      id TEXT,
      orden INTEGER DEFAULT 0,
      canal TEXT,
      estado TEXT,
      fecha_ingreso TEXT,
      fecha_preparacion TEXT,
      fecha_despacho TEXT,
      cliente_nombre TEXT,
      telefono TEXT,
      direccion_domicilio TEXT,
      motorizado TEXT,
      metodo_pago TEXT DEFAULT 'Efectivo',
      total INTEGER DEFAULT 0,
      sincronizado INTEGER DEFAULT 1,
      inventario_descontado INTEGER DEFAULT 1,
      oculto_en_kds INTEGER DEFAULT 0,
      items_json TEXT DEFAULT '[]',
      PRIMARY KEY (negocio_id, id)
    );

    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      negocio_id TEXT,
      id TEXT,
      orden INTEGER DEFAULT 0,
      fecha TEXT,
      insumo_id TEXT,
      insumo_nombre TEXT,
      tipo TEXT,
      cantidad REAL DEFAULT 0,
      unidad TEXT,
      motivo TEXT,
      PRIMARY KEY (negocio_id, id)
    );
  `);

  // Migrar datos existentes automáticamente si la tabla negocios está vacía
  const countRow = sqliteDb.prepare('SELECT COUNT(*) AS total FROM negocios').get();
  if (!countRow || Number(countRow.total) === 0) {
    const semilla = leerSemillaJSONExistente();
    if (semilla && Array.isArray(semilla.negocios) && semilla.negocios.length > 0) {
      guardarEstadoEnSQLite(semilla, false);
    }
  }

  return sqliteDb;
}

function leerEstadoDesdeSQLite() {
  try {
    const db = obtenerConexionSQLite();
    const negociosRows = db.prepare('SELECT * FROM negocios ORDER BY orden ASC, id ASC').all();
    if (!negociosRows || negociosRows.length === 0) {
      return leerSemillaJSONExistente();
    }

    const cfgActivo = db.prepare("SELECT valor FROM config_sistema WHERE clave = 'negocioActivoId'").get();
    const cfgUpdated = db.prepare("SELECT valor FROM config_sistema WHERE clave = 'updatedAt'").get();

    const stmtProductos = db.prepare('SELECT * FROM productos WHERE negocio_id = ? ORDER BY orden ASC');
    const stmtInsumos = db.prepare('SELECT * FROM insumos WHERE negocio_id = ? ORDER BY orden ASC');
    const stmtPedidos = db.prepare('SELECT * FROM pedidos WHERE negocio_id = ? ORDER BY orden ASC');
    const stmtMovs = db.prepare('SELECT * FROM movimientos_inventario WHERE negocio_id = ? ORDER BY orden ASC');

    const parseSafe = (str, fallback) => {
      try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; }
    };

    const negocios = negociosRows.map(n => {
      const catalogo = stmtProductos.all(n.id).map(p => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        precio: Number(p.precio) || 0,
        disponible: p.disponible !== 0,
        imagen: p.imagen || '',
        descripcion: p.descripcion || '',
        tiempo: p.tiempo || '10 min',
        icono: p.icono || 'fa-burger',
        ingredientes: parseSafe(p.ingredientes_json, []),
        adiciones: parseSafe(p.adiciones_json, []),
        receta: parseSafe(p.receta_json, {})
      }));

      const insumos = stmtInsumos.all(n.id).map(i => ({
        id: i.id,
        nombre: i.nombre,
        unidad: i.unidad,
        stockActual: Number(i.stock_actual) || 0,
        stockMinimo: Number(i.stock_minimo) || 0,
        costoUnitario: Number(i.costo_unitario) || 0
      }));

      const pedidos = stmtPedidos.all(n.id).map(ped => ({
        id: ped.id,
        negocioId: n.id,
        canal: ped.canal || 'caja',
        estado: ped.estado || 'PENDIENTE',
        fechaIngreso: ped.fecha_ingreso,
        fechaPreparacion: ped.fecha_preparacion || null,
        fechaDespacho: ped.fecha_despacho || null,
        clienteNombre: ped.cliente_nombre || 'Mesa 1',
        telefono: ped.telefono || '',
        direccionDomicilio: ped.direccion_domicilio || '',
        motorizado: ped.motorizado || 'En local (Sin motorizado)',
        metodoPago: ped.metodo_pago || 'Efectivo',
        total: Number(ped.total) || 0,
        sincronizado: ped.sincronizado !== 0,
        inventarioDescontado: ped.inventario_descontado !== 0,
        ocultoEnKDS: Boolean(ped.oculto_en_kds),
        items: parseSafe(ped.items_json, [])
      }));

      const movimientos = stmtMovs.all(n.id).map(m => ({
        id: m.id,
        negocioId: n.id,
        fecha: m.fecha,
        insumoId: m.insumo_id,
        insumoNombre: m.insumo_nombre,
        tipo: m.tipo,
        cantidad: Number(m.cantidad) || 0,
        unidad: m.unidad,
        motivo: m.motivo
      }));

      return {
        id: n.id,
        usuarioLogin: n.usuario_login || n.id.toLowerCase(),
        claveAcceso: n.clave_acceso || '1234',
        claveCajero: n.clave_cajero || '2222',
        claveCocina: n.clave_cocina || '3333',
        nombre: n.nombre,
        barrio: n.barrio,
        propietario: n.propietario,
        whatsappLinea: n.whatsapp_linea,
        especialidad: n.especialidad,
        icono: n.icono || '🔥',
        suscripcionMensual: Number(n.suscripcion_mensual) || 40000,
        estadoSuscripcion: n.estado_suscripcion || 'Activa',
        nextTicketNumber: Number(n.next_ticket_number) || 101,
        botWhatsAppActivo: n.bot_whatsapp_activo !== 0,
        motorizados: parseSafe(n.motorizados_json, ['En local (Sin motorizado)']),
        catalogo,
        insumos,
        pedidos,
        movimientos,
        mensajesWhatsApp: parseSafe(n.mensajes_wa_json, [])
      };
    });

    return {
      negocioActivoId: (cfgActivo && cfgActivo.valor) || (negocios[0] && negocios[0].id) || 'FOC-01',
      updatedAt: (cfgUpdated && cfgUpdated.valor) || new Date().toISOString(),
      negocios
    };
  } catch (e) {
    console.error('Error leyendo SQLite:', e.message);
    return leerSemillaJSONExistente();
  }
}

function guardarEstadoEnSQLite(data, escribirRespaldoJSON = true) {
  if (!data || !Array.isArray(data.negocios)) return;
  const db = obtenerConexionSQLite();

  const stmtCfg = db.prepare('INSERT OR REPLACE INTO config_sistema (clave, valor) VALUES (?, ?)');
  const stmtNeg = db.prepare(`
    INSERT OR REPLACE INTO negocios (
      id, orden, usuario_login, clave_acceso, clave_cajero, clave_cocina,
      nombre, barrio, propietario, whatsapp_linea, especialidad, icono,
      suscripcion_mensual, estado_suscripcion, next_ticket_number,
      bot_whatsapp_activo, motorizados_json, mensajes_wa_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtDelProd = db.prepare('DELETE FROM productos WHERE negocio_id = ?');
  const stmtInsProd = db.prepare(`
    INSERT OR REPLACE INTO productos (
      negocio_id, id, orden, nombre, categoria, precio, disponible,
      imagen, descripcion, tiempo, icono, ingredientes_json, adiciones_json, receta_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtDelIns = db.prepare('DELETE FROM insumos WHERE negocio_id = ?');
  const stmtInsIns = db.prepare(`
    INSERT OR REPLACE INTO insumos (
      negocio_id, id, orden, nombre, unidad, stock_actual, stock_minimo, costo_unitario
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtDelPed = db.prepare('DELETE FROM pedidos WHERE negocio_id = ?');
  const stmtInsPed = db.prepare(`
    INSERT OR REPLACE INTO pedidos (
      negocio_id, id, orden, canal, estado, fecha_ingreso, fecha_preparacion, fecha_despacho,
      cliente_nombre, telefono, direccion_domicilio, motorizado, metodo_pago, total,
      sincronizado, inventario_descontado, oculto_en_kds, items_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtDelMov = db.prepare('DELETE FROM movimientos_inventario WHERE negocio_id = ?');
  const stmtInsMov = db.prepare(`
    INSERT OR REPLACE INTO movimientos_inventario (
      negocio_id, id, orden, fecha, insumo_id, insumo_nombre, tipo, cantidad, unidad, motivo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    stmtCfg.run('negocioActivoId', String(data.negocioActivoId || 'FOC-01'));
    stmtCfg.run('updatedAt', String(data.updatedAt || new Date().toISOString()));

    const idsVigentes = new Set(data.negocios.filter(n => n && n.id).map(n => n.id));
    const existentes = db.prepare('SELECT id FROM negocios').all();
    existentes.forEach(row => {
      if (!idsVigentes.has(row.id)) {
        db.prepare('DELETE FROM negocios WHERE id = ?').run(row.id);
        stmtDelProd.run(row.id);
        stmtDelIns.run(row.id);
        stmtDelPed.run(row.id);
        stmtDelMov.run(row.id);
      }
    });

    data.negocios.forEach((neg, nIdx) => {
      if (!neg || !neg.id) return;

      stmtNeg.run(
        String(neg.id),
        nIdx,
        String(neg.usuarioLogin || neg.id).toLowerCase(),
        String(neg.claveAcceso || '1234'),
        String(neg.claveCajero || '2222'),
        String(neg.claveCocina || '3333'),
        String(neg.nombre || 'Restaurante'),
        String(neg.barrio || 'Cúcuta'),
        String(neg.propietario || 'Propietario'),
        String(neg.whatsappLinea || ''),
        String(neg.especialidad || ''),
        String(neg.icono || '🔥'),
        Number(neg.suscripcionMensual) || 40000,
        String(neg.estadoSuscripcion || 'Activa'),
        Number(neg.nextTicketNumber) || 101,
        neg.botWhatsAppActivo === false ? 0 : 1,
        JSON.stringify(Array.isArray(neg.motorizados) ? neg.motorizados : []),
        JSON.stringify(Array.isArray(neg.mensajesWhatsApp) ? neg.mensajesWhatsApp : [])
      );

      stmtDelProd.run(neg.id);
      (neg.catalogo || []).forEach((p, pIdx) => {
        const recObj = p.receta && p.receta.listaInsumos ? p.receta.listaInsumos : (p.receta || {});
        stmtInsProd.run(
          String(neg.id),
          String(p.id || `prod_${pIdx}`),
          pIdx,
          String(p.nombre || ''),
          String(p.categoria || 'General'),
          Number(p.precio) || 0,
          p.disponible === false ? 0 : 1,
          String(p.imagen || ''),
          String(p.descripcion || ''),
          String(p.tiempo || '10 min'),
          String(p.icono || 'fa-burger'),
          JSON.stringify(Array.isArray(p.ingredientes) ? p.ingredientes : []),
          JSON.stringify(Array.isArray(p.adiciones) ? p.adiciones : []),
          JSON.stringify(recObj)
        );
      });

      stmtDelIns.run(neg.id);
      (neg.insumos || []).forEach((i, iIdx) => {
        stmtInsIns.run(
          String(neg.id),
          String(i.id || `ins_${iIdx}`),
          iIdx,
          String(i.nombre || ''),
          String(i.unidad || 'und'),
          Number(i.stockActual) || 0,
          Number(i.stockMinimo) || 0,
          Number(i.costoUnitario) || 0
        );
      });

      stmtDelPed.run(neg.id);
      (neg.pedidos || []).forEach((ped, pedIdx) => {
        stmtInsPed.run(
          String(neg.id),
          String(ped.id || `#ORD-${pedIdx}`),
          pedIdx,
          String(ped.canal || 'caja'),
          String(ped.estado || 'PENDIENTE'),
          String(ped.fechaIngreso || ped.fechaCreacion || new Date().toISOString()),
          ped.fechaPreparacion ? String(ped.fechaPreparacion) : null,
          ped.fechaDespacho ? String(ped.fechaDespacho) : null,
          String(ped.clienteNombre || 'Mesa 1'),
          String(ped.telefono || ''),
          String(ped.direccionDomicilio || ''),
          String(ped.motorizado || 'En local (Sin motorizado)'),
          String(ped.metodoPago || 'Efectivo'),
          Number(ped.total) || 0,
          ped.sincronizado === false ? 0 : 1,
          ped.inventarioDescontado === false ? 0 : 1,
          ped.ocultoEnKDS ? 1 : 0,
          JSON.stringify(Array.isArray(ped.items) ? ped.items : [])
        );
      });

      stmtDelMov.run(neg.id);
      (neg.movimientos || []).forEach((m, mIdx) => {
        stmtInsMov.run(
          String(neg.id),
          String(m.id || `mov_${mIdx}`),
          mIdx,
          String(m.fecha || new Date().toISOString()),
          String(m.insumoId || ''),
          String(m.insumoNombre || ''),
          String(m.tipo || 'consumo'),
          Number(m.cantidad) || 0,
          String(m.unidad || 'und'),
          String(m.motivo || '')
        );
      });
    });

    db.exec('COMMIT;');
    try { db.exec('PRAGMA wal_checkpoint(PASSIVE);'); } catch (_) {}
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    console.error('Error guardando transacción SQLite:', err.message);
  }

  if (escribirRespaldoJSON) {
    data.negocios.forEach(neg => {
      if (neg && neg.id) {
        escrituraAtomicaJSON(path.join(DB_DIR, `${neg.id}.json`), neg);
      }
    });
    escrituraAtomicaJSON(JSON_BACKUP_FILE, data);
  }
}

function inspeccionarTablasSQLite() {
  const db = obtenerConexionSQLite();
  const tablas = ['negocios', 'productos', 'insumos', 'pedidos', 'movimientos_inventario', 'config_sistema'];
  const resultado = {};
  tablas.forEach(t => {
    try {
      resultado[t] = db.prepare(`SELECT * FROM ${t}`).all();
    } catch (e) {
      resultado[t] = [];
    }
  });
  return {
    archivo: 'db/fastorder.sqlite',
    motor: 'SQLite 3 (WAL + ACID)',
    tablas: resultado
  };
}

module.exports = {
  SQLITE_FILE,
  obtenerConexionSQLite,
  leerEstadoDesdeSQLite,
  guardarEstadoEnSQLite,
  inspeccionarTablasSQLite
};
