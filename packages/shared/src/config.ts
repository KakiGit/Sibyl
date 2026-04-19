import { resolve, join } from "path";
import { existsSync, mkdirSync } from "fs";
import {
  DATA_DIR,
  RAW_DIR,
  WIKI_DIR,
  SCHEMA_DIR,
  DB_DIR,
} from "./constants.js";

export interface SibylConfig {
  dataPath: string;
  rawPath: string;
  wikiPath: string;
  schemaPath: string;
  dbPath: string;
}

function getDefaultDataPath(): string {
  const envPath = process.env.SIBYL_DATA_PATH;
  if (envPath) {
    return resolve(envPath);
  }
  return resolve(DATA_DIR);
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function getConfig(): SibylConfig {
  const dataPath = getDefaultDataPath();
  
  return {
    dataPath,
    rawPath: join(dataPath, RAW_DIR.replace(`${DATA_DIR}/`, "")),
    wikiPath: join(dataPath, WIKI_DIR.replace(`${DATA_DIR}/`, "")),
    schemaPath: join(dataPath, SCHEMA_DIR.replace(`${DATA_DIR}/`, "")),
    dbPath: join(dataPath, DB_DIR.replace(`${DATA_DIR}/`, "")),
  };
}

export function initializeDataDirectories(): SibylConfig {
  const config = getConfig();
  
  ensureDir(config.dataPath);
  ensureDir(config.rawPath);
  ensureDir(config.wikiPath);
  ensureDir(config.schemaPath);
  ensureDir(config.dbPath);
  
  return config;
}