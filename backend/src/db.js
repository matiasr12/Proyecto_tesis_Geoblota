'use strict';

const sql = require('mssql');

function buildPoolConfig(config) {
  return {
    server: config.dbServer,
    database: config.dbName,
    user: config.dbUser,
    password: config.dbPassword,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  };
}

let poolPromise = null;

/**
 * La base usa auto-pausa (tier serverless): si la primera conexion falla porque
 * todavia esta "despertando", no hay que dejar cacheado ese fallo para siempre,
 * sino permitir que el proximo request reintente.
 */
function getPool(config) {
  if (!poolPromise) {
    poolPromise = sql.connect(buildPoolConfig(config)).catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

/**
 * Busca el Equipo por ComputerName; si no existe todavia, lo crea con
 * CodigoActivo = ComputerName como valor provisorio (el daemon no conoce el
 * codigo de activo real todavia, eso se completa despues a mano en la tabla
 * Equipos).
 */
async function getOrCreateEquipoId(transaction, computerName) {
  const select = new sql.Request(transaction);
  select.input('computerName', sql.NVarChar, computerName);
  const existing = await select.query('SELECT Id FROM dbo.Equipos WHERE ComputerName = @computerName');
  if (existing.recordset.length > 0) {
    return existing.recordset[0].Id;
  }

  const insert = new sql.Request(transaction);
  insert.input('computerName', sql.NVarChar, computerName);
  const created = await insert.query(`
    INSERT INTO dbo.Equipos (CodigoActivo, ComputerName)
    OUTPUT INSERTED.Id
    VALUES (@computerName, @computerName)
  `);
  return created.recordset[0].Id;
}

/**
 * Inserta un lote de registros dentro de una transaccion.
 * Los bssids se guardan como JSON en una columna nvarchar.
 */
async function insertRecords(config, records) {
  const pool = await getPool(config);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (const record of records) {
      const equipoId = await getOrCreateEquipoId(transaction, record.computerName);

      const request = new sql.Request(transaction);
      request.input('equipoId', sql.Int, equipoId);
      request.input('bssids', sql.NVarChar, JSON.stringify(record.bssids));
      request.input('ip', sql.NVarChar, record.ip);
      request.input('connectionType', sql.NVarChar, record.connectionType || null);
      request.input('recordTimestamp', sql.DateTime2, new Date(record.timestamp));
      await request.query(`
        INSERT INTO dbo.DeviceRecords (EquipoId, Bssids, Ip, ConnectionType, RecordTimestamp, ReceivedAt)
        VALUES (@equipoId, @bssids, @ip, @connectionType, @recordTimestamp, SYSUTCDATETIME())
      `);
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getOrCreateFaenaId(transaction, nombre) {
  const select = new sql.Request(transaction);
  select.input('nombre', sql.NVarChar, nombre);
  const existing = await select.query('SELECT Id FROM dbo.Faenas WHERE Nombre = @nombre');
  if (existing.recordset.length > 0) return existing.recordset[0].Id;

  const insert = new sql.Request(transaction);
  insert.input('nombre', sql.NVarChar, nombre);
  const created = await insert.query('INSERT INTO dbo.Faenas (Nombre) OUTPUT INSERTED.Id VALUES (@nombre)');
  return created.recordset[0].Id;
}

async function getOrCreateAreaId(transaction, nombre, faenaId) {
  const select = new sql.Request(transaction);
  select.input('nombre', sql.NVarChar, nombre);
  select.input('faenaId', sql.Int, faenaId);
  const existing = await select.query('SELECT Id FROM dbo.Areas WHERE Nombre = @nombre AND FaenaId = @faenaId');
  if (existing.recordset.length > 0) return existing.recordset[0].Id;

  const insert = new sql.Request(transaction);
  insert.input('nombre', sql.NVarChar, nombre);
  insert.input('faenaId', sql.Int, faenaId);
  const created = await insert.query(
    'INSERT INTO dbo.Areas (Nombre, FaenaId) OUTPUT INSERTED.Id VALUES (@nombre, @faenaId)'
  );
  return created.recordset[0].Id;
}

async function upsertPersonal(transaction, { rut, nombre, apellido, areaId, faenaId }) {
  const select = new sql.Request(transaction);
  select.input('rut', sql.NVarChar, rut);
  const existing = await select.query('SELECT Id FROM dbo.Personal WHERE Rut = @rut');

  if (existing.recordset.length > 0) {
    const personalId = existing.recordset[0].Id;
    const update = new sql.Request(transaction);
    update.input('id', sql.Int, personalId);
    update.input('nombre', sql.NVarChar, nombre);
    update.input('apellido', sql.NVarChar, apellido);
    update.input('areaId', sql.Int, areaId);
    update.input('faenaId', sql.Int, faenaId);
    await update.query(`
      UPDATE dbo.Personal SET Nombre = @nombre, Apellido = @apellido, AreaId = @areaId, FaenaId = @faenaId
      WHERE Id = @id
    `);
    return personalId;
  }

  const insert = new sql.Request(transaction);
  insert.input('rut', sql.NVarChar, rut);
  insert.input('nombre', sql.NVarChar, nombre);
  insert.input('apellido', sql.NVarChar, apellido);
  insert.input('areaId', sql.Int, areaId);
  insert.input('faenaId', sql.Int, faenaId);
  const created = await insert.query(`
    INSERT INTO dbo.Personal (Rut, Nombre, Apellido, AreaId, FaenaId)
    OUTPUT INSERTED.Id
    VALUES (@rut, @nombre, @apellido, @areaId, @faenaId)
  `);
  return created.recordset[0].Id;
}

async function upsertEquipo(transaction, { computerName, codigoActivo, personalId }) {
  const select = new sql.Request(transaction);
  select.input('computerName', sql.NVarChar, computerName);
  const existing = await select.query('SELECT Id FROM dbo.Equipos WHERE ComputerName = @computerName');

  if (existing.recordset.length > 0) {
    const equipoId = existing.recordset[0].Id;
    const update = new sql.Request(transaction);
    update.input('id', sql.Int, equipoId);
    update.input('codigoActivo', sql.NVarChar, codigoActivo);
    update.input('personalId', sql.Int, personalId);
    await update.query('UPDATE dbo.Equipos SET CodigoActivo = @codigoActivo, PersonalId = @personalId WHERE Id = @id');
    return equipoId;
  }

  const insert = new sql.Request(transaction);
  insert.input('computerName', sql.NVarChar, computerName);
  insert.input('codigoActivo', sql.NVarChar, codigoActivo);
  insert.input('personalId', sql.Int, personalId);
  const created = await insert.query(`
    INSERT INTO dbo.Equipos (ComputerName, CodigoActivo, PersonalId)
    OUTPUT INSERTED.Id
    VALUES (@computerName, @codigoActivo, @personalId)
  `);
  return created.recordset[0].Id;
}

/**
 * Registro que manda el daemon una sola vez (no en cada tick): vincula el
 * equipo con la persona responsable, su area y su faena. Es upsert en cada
 * nivel (por nombre de faena/area, por rut de la persona, por ComputerName
 * del equipo) para que reintentar el mismo registro sea seguro.
 */
async function upsertEquipoRegistro(config, { computerName, codigoActivo, rut, nombre, apellido, faena, area }) {
  const pool = await getPool(config);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const faenaId = await getOrCreateFaenaId(transaction, faena);
    const areaId = await getOrCreateAreaId(transaction, area, faenaId);
    const personalId = await upsertPersonal(transaction, { rut, nombre, apellido, areaId, faenaId });
    await upsertEquipo(transaction, { computerName, codigoActivo, personalId });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Un renglon por Equipo, con su persona/area/faena (si ya se registro) y su
 * ultima ubicacion conocida (si ya mando algun DeviceRecords). Pensado para
 * alimentar tanto el mapa como una tabla de inventario en el panel web.
 */
async function getEquiposConUltimaUbicacion(config) {
  const pool = await getPool(config);
  const result = await pool.request().query(`
    SELECT
      e.Id AS equipoId,
      e.CodigoActivo AS codigoActivo,
      e.ComputerName AS computerName,
      p.Rut AS rut,
      p.Nombre AS personalNombre,
      p.Apellido AS personalApellido,
      a.Nombre AS area,
      f.Nombre AS faena,
      dr.Bssids AS bssids,
      dr.Ip AS ip,
      dr.ConnectionType AS connectionType,
      dr.RecordTimestamp AS recordTimestamp,
      dr.ReceivedAt AS receivedAt
    FROM dbo.Equipos e
    OUTER APPLY (
      SELECT TOP 1 dr2.Bssids, dr2.Ip, dr2.ConnectionType, dr2.RecordTimestamp, dr2.ReceivedAt
      FROM dbo.DeviceRecords dr2
      WHERE dr2.EquipoId = e.Id
      ORDER BY dr2.RecordTimestamp DESC
    ) dr
    LEFT JOIN dbo.Personal p ON p.Id = e.PersonalId
    LEFT JOIN dbo.Areas a ON a.Id = p.AreaId
    LEFT JOIN dbo.Faenas f ON f.Id = p.FaenaId
  `);

  const bssidToArea = await getBssidAreaMap(config);

  return result.recordset.map((row) => {
    const bssids = row.bssids ? JSON.parse(row.bssids) : [];
    const match = bssids.map((b) => bssidToArea.get(b.toLowerCase())).find(Boolean) || null;
    const areaDetectada = match ? match.area : null;

    return {
      ...row,
      bssids,
      areaDetectada,
      latitud: match ? match.latitud : null,
      longitud: match ? match.longitud : null,
      // Solo alerta si hay algo con que comparar (area detectada por WiFi
      // distinta a la asignada) y el equipo no esta usando datos moviles --
      // en datos moviles no hay ningun WiFi de la faena que comparar, no
      // significa que "salio del area".
      alerta: Boolean(
        areaDetectada && row.area && areaDetectada !== row.area && row.connectionType !== 'movil'
      ),
    };
  });
}

/**
 * Mapa BSSID (minuscula) -> { area, latitud, longitud } de la fila de
 * BssidsArea que matchea ese BSSID. area usa STContains (poligono real del
 * Area contra la coordenada del router) cuando ambos datos ya se cargaron;
 * mientras no haya coordenadas reales, cae al mismo Area asignada a mano en
 * BssidsArea. latitud/longitud son siempre las del router (BssidsArea), no
 * las del poligono. No depende de PostGIS: geography es nativo de SQL Server.
 */
async function getBssidAreaMap(config) {
  const pool = await getPool(config);
  const result = await pool.request().query(`
    SELECT
      ba.Bssid AS bssid,
      COALESCE(porPoligono.Nombre, aAsignada.Nombre) AS area,
      ba.Latitud AS latitud,
      ba.Longitud AS longitud
    FROM dbo.BssidsArea ba
    JOIN dbo.Areas aAsignada ON aAsignada.Id = ba.AreaId
    OUTER APPLY (
      SELECT TOP 1 a2.Nombre
      FROM dbo.Areas a2
      WHERE a2.Poligono IS NOT NULL
        AND ba.Latitud IS NOT NULL
        AND ba.Longitud IS NOT NULL
        -- geography::Point espera (latitud, longitud, SRID) en ese orden.
        AND a2.Poligono.STContains(geography::Point(ba.Latitud, ba.Longitud, 4326)) = 1
    ) porPoligono
  `);

  return new Map(
    result.recordset.map((row) => [
      row.bssid.toLowerCase(),
      { area: row.area, latitud: row.latitud, longitud: row.longitud },
    ])
  );
}

module.exports = { insertRecords, upsertEquipoRegistro, getEquiposConUltimaUbicacion };
