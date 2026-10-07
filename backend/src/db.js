'use strict';

const sql = require('mssql');

// Debe coincidir con SIN_SENAL_MINUTOS del panel web (src/lib/daemon-api.ts).
const SIN_SENAL_MINUTOS = 30;

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
      request.input('latitud', sql.Decimal(9, 6), record.latitud ?? null);
      request.input('longitud', sql.Decimal(9, 6), record.longitud ?? null);
      request.input('precisionMetros', sql.Decimal(10, 2), record.precisionMetros ?? null);
      request.input('recordTimestamp', sql.DateTime2, new Date(record.timestamp));
      await request.query(`
        INSERT INTO dbo.DeviceRecords
          (EquipoId, Bssids, Ip, ConnectionType, Latitud, Longitud, PrecisionMetros, RecordTimestamp, ReceivedAt)
        VALUES
          (@equipoId, @bssids, @ip, @connectionType, @latitud, @longitud, @precisionMetros, @recordTimestamp, SYSUTCDATETIME())
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

/**
 * El formulario deja elegir faena y area por separado, asi que el area se
 * busca por nombre en cualquier faena (si no, se crearia un duplicado sin
 * poligono). Solo si no existe en ninguna se crea dentro de la faena elegida.
 * Si hubiera dos areas con el mismo nombre, prefiere la de esa faena.
 */
async function getOrCreateAreaId(transaction, nombre, faenaId) {
  const select = new sql.Request(transaction);
  select.input('nombre', sql.NVarChar, nombre);
  select.input('faenaId', sql.Int, faenaId);
  const existing = await select.query(`
    SELECT TOP 1 Id FROM dbo.Areas
    WHERE Nombre = @nombre
    ORDER BY CASE WHEN FaenaId = @faenaId THEN 0 ELSE 1 END, Id
  `);
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
      dr.Latitud AS latitud,
      dr.Longitud AS longitud,
      dr.PrecisionMetros AS precisionMetros,
      dr.RecordTimestamp AS recordTimestamp,
      dr.ReceivedAt AS receivedAt,
      -- Geocerca: 1 dentro, 0 fuera, NULL si no hay con que comparar (sin
      -- poligono en el area asignada o sin lat/long en la ultima lectura).
      -- geography::Point recibe (latitud, longitud, SRID) en ese orden.
      CASE
        WHEN a.Poligono IS NULL OR dr.Latitud IS NULL OR dr.Longitud IS NULL THEN NULL
        ELSE a.Poligono.STContains(geography::Point(dr.Latitud, dr.Longitud, 4326))
      END AS dentroDelArea
    FROM dbo.Equipos e
    OUTER APPLY (
      SELECT TOP 1
        dr2.Bssids, dr2.Ip, dr2.ConnectionType, dr2.Latitud, dr2.Longitud, dr2.PrecisionMetros,
        dr2.RecordTimestamp, dr2.ReceivedAt
      FROM dbo.DeviceRecords dr2
      WHERE dr2.EquipoId = e.Id
      ORDER BY dr2.ReceivedAt DESC
    ) dr
    LEFT JOIN dbo.Personal p ON p.Id = e.PersonalId
    LEFT JOIN dbo.Areas a ON a.Id = p.AreaId
    LEFT JOIN dbo.Faenas f ON f.Id = p.FaenaId
  `);

  const bssidToArea = await getBssidAreaMap(config);

  return result.recordset.map(({ dentroDelArea, ...row }) => {
    const bssids = row.bssids ? JSON.parse(row.bssids) : [];
    const match = bssids.map((b) => bssidToArea.get(b.toLowerCase())).find(Boolean) || null;
    const areaDetectada = match ? match.area : null;

    // Mismo umbral que el panel usa para "sin señal": sin lectura en los
    // ultimos SIN_SENAL_MINUTOS no se evalua la geocerca (el panel ya lo
    // muestra aparte como sin señal).
    const minutosDesdeLectura = row.receivedAt ? (Date.now() - row.receivedAt.getTime()) / 60000 : NaN;
    const lecturaReciente = minutosDesdeLectura <= SIN_SENAL_MINUTOS;

    return {
      ...row,
      bssids,
      areaDetectada,
      // Preferir la ubicacion que el propio daemon resolvio via Geolocation
      // API (mas precisa, real, cualquier lugar) sobre la inferida por
      // BssidsArea (aproximada, solo sirve para los BSSID cargados a mano) --
      // esta ultima queda como fallback para daemons viejos sin API key.
      latitud: row.latitud ?? (match ? match.latitud : null),
      longitud: row.longitud ?? (match ? match.longitud : null),
      // Geocerca real: alerta solo si hay lectura reciente y el punto cae
      // fuera del poligono del area asignada. Sin area, sin poligono o sin
      // lat/long (dentroDelArea NULL) no se puede decidir: sin alerta.
      alerta: lecturaReciente && dentroDelArea === false,
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

/**
 * Areas existentes con el nombre de su faena, para precargar las opciones
 * del formulario de registro del daemon. Se consulta cada vez que se abre
 * el formulario, asi un area recien creada aparece de inmediato.
 */
async function getAreas(config) {
  const pool = await getPool(config);
  const result = await pool.request().query(`
    SELECT f.Nombre AS faena, a.Nombre AS area
    FROM dbo.Areas a
    JOIN dbo.Faenas f ON f.Id = a.FaenaId
    ORDER BY f.Nombre, a.Nombre
  `);
  return result.recordset;
}

module.exports = { insertRecords, upsertEquipoRegistro, getEquiposConUltimaUbicacion, getAreas };
