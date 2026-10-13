/** SQLite schema and connection handling, backed by Node's built-in `node:sqlite`. */
import { createRequire } from 'node:module';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getString } from '../config/index.js';

/**
 * `node:sqlite` is only reachable through the `node:` prefix, so it is absent
 * from `module.builtinModules` and bundlers try to resolve it from disk.
 * Requiring it at runtime keeps it opaque to them.
 */
type SqliteModule = { DatabaseSync: new (path: string) => SqliteDatabase };
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as SqliteModule;

const here = dirname(fileURLToPath(import.meta.url));
/** Package root: `dist/` after a build, `src/` when running through tsx. */
const packageRoot = resolve(here, '..');

export interface ScihubUrl {
  url: string;
  success_times: number;
  failed_times: number;
}

/**
 * Resolves the database file. `SCIDOWNL_DB_PATH` wins, otherwise the
 * `[global_db] db_name` config value under `<package root>/data/`.
 */
export function getDatabasePath(test = false): string {
  const override = process.env.SCIDOWNL_DB_PATH;
  if (!test && override !== undefined && override.length > 0) {
    return isAbsolute(override) ? override : resolve(process.cwd(), override);
  }
  const name = test ? 'test-scidownl.db' : getString('global_db', 'db_name', 'scidownl.db');
  return resolve(packageRoot, 'data', name);
}

const connections = new Map<string, SqliteDatabase>();

export function getDatabase(test = false): SqliteDatabase {
  const path = getDatabasePath(test);
  const existing = connections.get(path);
  if (existing !== undefined) return existing;

  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  connections.set(path, db);
  createTables(db);
  return db;
}

/** Creates every table that does not exist yet. */
export function createTables(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scihub_url (
      url           VARCHAR(50) PRIMARY KEY,
      success_times INTEGER DEFAULT 0,
      failed_times  INTEGER DEFAULT 0
    )
  `);
}

/** Closes every open connection. Used by tests and on shutdown. */
export function closeDatabases(): void {
  for (const db of connections.values()) {
    db.close();
  }
  connections.clear();
}
