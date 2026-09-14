'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { encrypt, decrypt } = require('./crypto');

/**
 * Cola local de registros pendientes de envio, cifrados con AES-256-GCM en reposo.
 * Se usa cuando no hay conexion a internet: los snapshots se acumulan aqui y se
 * reintenta el envio en cada tick del scheduler hasta vaciarla.
 */
class PendingRecordsStore {
  constructor({ dataDir, encryptionKey }) {
    this.encryptionKey = encryptionKey;
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'pending-records.sqlite');
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  enqueue(record) {
    const { ciphertext, iv, authTag } = encrypt(record, this.encryptionKey);
    const stmt = this.db.prepare(
      'INSERT INTO pending_records (ciphertext, iv, auth_tag, created_at) VALUES (?, ?, ?, ?)'
    );
    stmt.run(ciphertext, iv, authTag, new Date().toISOString());
  }

  getAll() {
    const rows = this.db.prepare('SELECT * FROM pending_records ORDER BY id ASC').all();
    return rows.map((row) => ({
      id: row.id,
      record: decrypt({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag }, this.encryptionKey),
    }));
  }

  deleteByIds(ids) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM pending_records WHERE id IN (${placeholders})`).run(...ids);
  }

  count() {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM pending_records').get();
    return row.count;
  }

  close() {
    this.db.close();
  }
}

module.exports = { PendingRecordsStore };
