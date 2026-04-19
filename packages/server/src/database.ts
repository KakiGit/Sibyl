import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema.js";
import { DB_FILE } from "@sibyl/shared";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDbPath(): string {
  const envPath = process.env.SIBYL_DB_PATH;
  if (envPath) {
    return resolve(envPath);
  }
  return resolve(DB_FILE);
}

export function createDatabase(dbPath?: string): ReturnType<typeof drizzle<typeof schema>> {
  const path = dbPath || getDbPath();
  
  const dbDir = dirname(path);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  const sqlite = new Database(path);
  const drizzleDb = drizzle({ client: sqlite, schema });
  
  if (!dbPath) {
    db = drizzleDb;
  }
  
  return drizzleDb;
}

export function setDatabase(database: ReturnType<typeof drizzle<typeof schema>>): void {
  db = database;
}

export function migrateDatabase(database: ReturnType<typeof drizzle<typeof schema>>): void {
  const sqlite = (database as unknown as { $client: Database }).$client;
  
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS raw_resources (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      source_url TEXT,
      content_path TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      processed INTEGER DEFAULT 0
    )
  `);
  
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      content_path TEXT NOT NULL,
      summary TEXT,
      tags TEXT,
      source_ids TEXT,
      embedding_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      version INTEGER DEFAULT 1
    )
  `);
  
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS wiki_links (
      id TEXT PRIMARY KEY,
      from_page_id TEXT NOT NULL REFERENCES wiki_pages(id),
      to_page_id TEXT NOT NULL REFERENCES wiki_pages(id),
      relation_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS processing_log (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      raw_resource_id TEXT,
      wiki_page_id TEXT,
      details TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS embeddings_cache (
      id TEXT PRIMARY KEY,
      content_hash TEXT UNIQUE NOT NULL,
      embedding TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
}

export function getDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    db = createDatabase();
    migrateDatabase(db);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    const sqlite = (db as unknown as { $client: Database }).$client;
    sqlite.close();
    db = null;
  }
}

export { schema };