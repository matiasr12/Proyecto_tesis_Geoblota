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
      request.input('recordTimestamp', sql.DateTime2, new Date(record.timestamp));
      await request.query(`
        INSERT INTO dbo.DeviceRecords (EquipoId, Bssids, Ip, RecordTimestamp, ReceivedAt)
        VALUES (@equipoId, @bssids, @ip, @recordTimestamp, SYSUTCDATETIME())
      `);
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = { insertRecords };
