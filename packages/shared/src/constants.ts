export const APP_NAME = "sibyl";
export const APP_VERSION = "0.1.0";

export const RAW_RESOURCE_TYPES = ["pdf", "image", "webpage", "text"] as const;
export const WIKI_PAGE_TYPES = ["entity", "concept", "source", "summary"] as const;
export const OPERATIONS = ["ingest", "query", "filing", "lint"] as const;

export const JWT_SECRET_ENV = "SIBYL_JWT_SECRET";
export const API_KEY_ENV = "SIBYL_API_KEY";
export const AUTH_ENABLED_ENV = "SIBYL_AUTH_ENABLED";
export const JWT_EXPIRY_SECONDS = 3600;
export const JWT_REFRESH_EXPIRY_SECONDS = 86400;

export const SERVER_URL_ENV = "SIBYL_SERVER_URL";
export const SERVER_BIND_ADDR_ENV = "SIBYL_SERVER_BIND_ADDR";
export const SERVER_BIND_PORT_ENV = "SIBYL_SERVER_BIND_PORT";
export const WEBUI_BIND_ADDR_ENV = "SIBYL_WEBUI_BIND_ADDR";
export const WEBUI_BIND_PORT_ENV = "SIBYL_WEBUI_BIND_PORT";

export const DEFAULT_SERVER_URL = "http://localhost:3000";
export const DEFAULT_SERVER_BIND_ADDR = "localhost";
export const DEFAULT_SERVER_BIND_PORT = 3000;
export const DEFAULT_WEBUI_BIND_ADDR = "localhost";
export const DEFAULT_WEBUI_BIND_PORT = 5173;

export const DATA_DIR = "data";
export const RAW_DIR = `${DATA_DIR}/raw`;
export const WIKI_DIR = `${DATA_DIR}/wiki`;
export const SCHEMA_DIR = `${DATA_DIR}/schema`;
export const DB_DIR = `${DATA_DIR}/db`;

export const DB_FILE = `${DB_DIR}/sibyl.db`;
export const RAW_INDEX_FILE = `${RAW_DIR}/index.json`;
export const WIKI_INDEX_FILE = `${WIKI_DIR}/index.md`;
export const WIKI_LOG_FILE = `${WIKI_DIR}/log.md`;
export const SCHEMA_FILE = `${SCHEMA_DIR}/SCHEMA.md`;