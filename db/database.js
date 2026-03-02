const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'notieos.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function getColumns(table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name);
  } catch {
    return [];
  }
}

function ensureColumn(table, name, def) {
  const cols = getColumns(table);
  if (!cols.includes(name)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${def}`).run();
  }
}

function ensureSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  ensureColumn('users', 'totp_secret', 'totp_secret TEXT');
  ensureColumn('users', 'totp_enabled', 'totp_enabled INTEGER DEFAULT 0');
  ensureColumn('users', 'email_otp', 'email_otp TEXT');
  ensureColumn('users', 'email_otp_expires', 'email_otp_expires DATETIME');
  ensureColumn('users', 'email_2fa_enabled', 'email_2fa_enabled INTEGER DEFAULT 0');
  ensureColumn('users', 'avatar', 'avatar TEXT');

  ensureColumn('workspaces', 'created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  ensureColumn('notes', 'created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  ensureColumn('notes', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  // Backfill updated_at if it exists but is NULL
  try {
    db.prepare("UPDATE notes SET updated_at = created_at WHERE updated_at IS NULL").run();
  } catch {
    // ignore if columns are missing or table not yet created
  }
}

ensureSchema();

module.exports = db;
