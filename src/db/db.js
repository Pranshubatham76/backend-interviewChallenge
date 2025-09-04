const sqlite3 = require('sqlite3').verbose();
const config = require('../config');

// Use a global key to ensure a single shared DB instance across ESM and CJS loaders
const DB_GLOBAL_KEY = '__TASKS_SQLITE_DB__';

function initializeSchema(db) {
  // Initialize database schema (skip during tests/in-memory usage)
  if (config.DB_PATH === ':memory:') return;

  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        username TEXT,
        reset_token TEXT,
        reset_token_expires TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tasks table
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        server_id TEXT,
        last_synced_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Index for task queries
    db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_user_id_updated_at ON tasks(user_id, updated_at)`);

    // Sync queue table
    db.run(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL,
        operation_timestamp TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    // Index for sync queue
    db.run(`CREATE INDEX IF NOT EXISTS idx_sync_queue_user_id ON sync_queue(user_id)`);

    // Sync logs table (bonus)
    db.run(`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        change_count INTEGER NOT NULL,
        processed INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Index for sync logs
    db.run(`CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON sync_logs(user_id)`);

    // Dead letter queue table (for failed sync items after 3 attempts)
    db.run(`
      CREATE TABLE IF NOT EXISTS dead_letter_queue (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 3,
        error_message TEXT,
        original_created_at TEXT NOT NULL,
        failed_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Index for dead letter queue
    db.run(`CREATE INDEX IF NOT EXISTS idx_dead_letter_queue_user_id ON dead_letter_queue(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_dead_letter_queue_task_id ON dead_letter_queue(task_id)`);

    // Add operation_timestamp column to sync_queue for chronological ordering
    db.all('PRAGMA table_info(sync_queue)', (err, columns) => {
      if (err) {
        console.error('Failed to inspect sync_queue table:', err);
        return;
      }
      const names = columns.map((c) => c.name);
      if (!names.includes('operation_timestamp')) {
        db.run('ALTER TABLE sync_queue ADD COLUMN operation_timestamp TEXT');
        // Update existing records with created_at as fallback
        db.run('UPDATE sync_queue SET operation_timestamp = created_at WHERE operation_timestamp IS NULL');
      }
    });

    // Ensure missing columns exist on users table
    db.all('PRAGMA table_info(users)', (err, columns) => {
      if (err) {
        console.error('Failed to inspect users table:', err);
        return;
      }
      const names = columns.map((c) => c.name);
      if (!names.includes('is_deleted')) {
        db.run('ALTER TABLE users ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0');
      }
      if (!names.includes('username')) {
        db.run('ALTER TABLE users ADD COLUMN username TEXT');
      }
    });
  });
}

function createDbInstance() {
  const db = new sqlite3.Database(config.DB_PATH, (err) => {
    if (err) {
      console.error('Database connection error:', err);
      throw err;
    }
    console.log('Connected to SQLite database');
  });

  initializeSchema(db);
  return db;
}

function getDb() {
  if (!globalThis[DB_GLOBAL_KEY]) {
    globalThis[DB_GLOBAL_KEY] = createDbInstance();
  }
  return globalThis[DB_GLOBAL_KEY];
}

// Database helper functions that always operate on the active DB instance
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const close = () => {
  return new Promise((resolve, reject) => {
    const db = globalThis[DB_GLOBAL_KEY];
    if (!db) return resolve();
    db.close((err) => {
      if (err) return reject(err);
      // Clear the global instance so the next query re-opens a new connection
      globalThis[DB_GLOBAL_KEY] = null;
      resolve();
    });
  });
};

module.exports = { db: getDb(), runQuery, getQuery, allQuery, close };
