import { resolve, join } from "path";
import { existsSync, mkdirSync } from "fs";
import {
  DATA_DIR,
  RAW_DIR,
  WIKI_DIR,
  SCHEMA_DIR,
  DB_DIR,
  JWT_SECRET_ENV,
  API_KEY_ENV,
  AUTH_ENABLED_ENV,
  JWT_EXPIRY_SECONDS,
  JWT_REFRESH_EXPIRY_SECONDS,
  SERVER_URL_ENV,
  SERVER_BIND_ADDR_ENV,
  SERVER_BIND_PORT_ENV,
  WEBUI_BIND_ADDR_ENV,
  WEBUI_BIND_PORT_ENV,
  DEFAULT_SERVER_URL,
  DEFAULT_SERVER_BIND_ADDR,
  DEFAULT_SERVER_BIND_PORT,
  DEFAULT_WEBUI_BIND_ADDR,
  DEFAULT_WEBUI_BIND_PORT,
} from "./constants.js";

export interface SibylConfig {
  dataPath: string;
  rawPath: string;
  wikiPath: string;
  schemaPath: string;
  dbPath: string;
}

export interface AuthConfig {
  enabled: boolean;
  jwtSecret: string | undefined;
  apiKey: string | undefined;
  jwtExpirySeconds: number;
  jwtRefreshExpirySeconds: number;
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

export function getAuthConfig(): AuthConfig {
  const enabledEnv = process.env[AUTH_ENABLED_ENV];
  const enabled = enabledEnv === "true" || enabledEnv === "1";
  
  return {
    enabled,
    jwtSecret: process.env[JWT_SECRET_ENV],
    apiKey: process.env[API_KEY_ENV],
    jwtExpirySeconds: JWT_EXPIRY_SECONDS,
    jwtRefreshExpirySeconds: JWT_REFRESH_EXPIRY_SECONDS,
  };
}

export function generateDefaultJwtSecret(): string {
  const randomBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateDefaultApiKey(): string {
  const randomBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }
  return `sibyl-${Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getServerUrl(): string {
  return process.env[SERVER_URL_ENV] || DEFAULT_SERVER_URL;
}

export interface ServerBindConfig {
  addr: string;
  port: number;
}

export function getServerBindConfig(): ServerBindConfig {
  const addr = process.env[SERVER_BIND_ADDR_ENV] || DEFAULT_SERVER_BIND_ADDR;
  const portEnv = process.env[SERVER_BIND_PORT_ENV];
  const port = portEnv ? parseInt(portEnv, 10) : DEFAULT_SERVER_BIND_PORT;
  return { addr, port };
}

export interface WebuiBindConfig {
  addr: string;
  port: number;
}

export function getWebuiBindConfig(): WebuiBindConfig {
  const addr = process.env[WEBUI_BIND_ADDR_ENV] || DEFAULT_WEBUI_BIND_ADDR;
  const portEnv = process.env[WEBUI_BIND_PORT_ENV];
  const port = portEnv ? parseInt(portEnv, 10) : DEFAULT_WEBUI_BIND_PORT;
  return { addr, port };
}