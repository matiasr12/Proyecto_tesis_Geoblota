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
 * Inserta un lote de registros dentro de una transaccion.
 * Los bssids se guardan como JSON en una columna nvarchar.
 */
async function insertRecords(config, records) {
  const pool = await getPool(config);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (const record of records) {
      const request = new sql.Request(transaction);
      request.input('computerName', sql.NVarChar, record.computerName);
      request.input('bssids', sql.NVarChar, JSON.stringify(record.bssids));
      request.input('ip', sql.NVarChar, record.ip);
      request.input('recordTimestamp', sql.DateTime2, new Date(record.timestamp));
      await request.query(`
        INSERT INTO dbo.DeviceRecords (ComputerName, Bssids, Ip, RecordTimestamp, ReceivedAt)
        VALUES (@computerName, @bssids, @ip, @recordTimestamp, SYSUTCDATETIME())
      `);
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = { insertRecords };
