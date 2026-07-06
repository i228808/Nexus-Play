import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.ts';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let rawDbInstance: Database.Database | null = null;

export function initDatabase() {
  if (dbInstance) return { db: dbInstance, rawDb: rawDbInstance! };

  let userDataPath: string;
  try {
    const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
    if (isDev) {
      userDataPath = path.join(process.env.HOME || '/tmp', '.config', 'NexusPlayDev');
      app.setPath('userData', userDataPath);
    } else {
      userDataPath = app.getPath('userData');
    }
  } catch (err) {
    userDataPath = path.join(process.env.HOME || '/tmp', '.config', 'NexusPlayDev');
  }

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = path.join(userDataPath, 'library.db');
  console.log(`[Database] Initializing SQLite database at: ${dbPath}`);

  const rawDb = new Database(dbPath);
  
  // Enable foreign keys
  rawDb.pragma('foreign_keys = ON');

  // Initialize tables programmatically
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      source TEXT NOT NULL,
      external_id TEXT,
      install_path TEXT,
      executable_path TEXT,
      launch_command TEXT,
      platform TEXT DEFAULT 'linux',
      installed INTEGER DEFAULT 1,
      hidden INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0,
      playtime_seconds INTEGER DEFAULT 0,
      last_played_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_metadata (
      game_id TEXT PRIMARY KEY,
      description TEXT,
      release_date TEXT,
      rating REAL,
      developers TEXT,
      publishers TEXT,
      genres TEXT,
      tags TEXT,
      platforms TEXT,
      cover_url TEXT,
      hero_url TEXT,
      logo_url TEXT,
      icon_url TEXT,
      metadata_provider TEXT,
      provider_game_id TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS game_assets (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      type TEXT NOT NULL,
      remote_url TEXT,
      local_path TEXT,
      width INTEGER,
      height INTEGER,
      source TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS launch_profiles (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      name TEXT NOT NULL,
      runner TEXT,
      proton_version TEXT,
      wine_prefix TEXT,
      environment_json TEXT,
      arguments TEXT,
      working_directory TEXT,
      is_default INTEGER DEFAULT 0,
      FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS library_sources (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      path TEXT,
      enabled INTEGER DEFAULT 1,
      last_scanned_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  dbInstance = drizzle(rawDb, { schema });
  rawDbInstance = rawDb;

  return { db: dbInstance, rawDb };
}

export function getDb() {
  if (!dbInstance) {
    return initDatabase().db;
  }
  return dbInstance;
}
