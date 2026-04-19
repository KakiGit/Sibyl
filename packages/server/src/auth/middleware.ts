/// <reference types="../types/fastify.d.ts" />
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { getAuthConfig, generateDefaultJwtSecret, generateDefaultApiKey } from "@sibyl/shared";
import { logger } from "@sibyl/shared";

export interface JwtPayload {
  userId: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthUser {
  userId: string;
  role: string;
}

export interface AuthMiddlewareOptions {
  publicRoutes?: string[];
  skipAuthForHealth?: boolean;
}

const BEARER_PREFIX = "Bearer ";
const API_KEY_HEADER = "x-api-key";

let cachedJwtSecret: string | undefined;
let cachedApiKey: string | undefined;

function getJwtSecret(): string {
  if (cachedJwtSecret) return cachedJwtSecret;
  const config = getAuthConfig();
  cachedJwtSecret = config.jwtSecret || generateDefaultJwtSecret();
  if (!config.jwtSecret) {
    logger.warn("JWT secret not configured, using generated secret. Set SIBYL_JWT_SECRET for production.");
  }
  return cachedJwtSecret;
}

function getApiKey(): string {
  if (cachedApiKey) return cachedApiKey;
  const config = getAuthConfig();
  cachedApiKey = config.apiKey || generateDefaultApiKey();
  if (!config.apiKey) {
    logger.warn("API key not configured, using generated key. Set SIBYL_API_KEY for production.");
    logger.info(`Generated API key: ${cachedApiKey}`);
  }
  return cachedApiKey;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64UrlDecode(str: string): string {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = 4 - (normalized.length % 4);
  const padded = padding === 4 ? normalized : normalized + "=".repeat(padding);
  return Buffer.from(padded, "base64").toString();
}

function createSignature(data: string, secret: string): string {
  const crypto = require("crypto");
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function generateToken(userId: string, role: string = "user"): { token: string; expiresIn: number } {
  const config = getAuthConfig();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + config.jwtExpirySeconds;
  
  const payload: JwtPayload = {
    userId,
    role,
    iat: now,
    exp,
  };
  
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(`${header}.${payloadEncoded}`, getJwtSecret());
  
  return {
    token: `${header}.${payloadEncoded}.${signature}`,
    expiresIn: config.jwtExpirySeconds,
  };
}

export function refreshToken(oldPayload: JwtPayload): { token: string; expiresIn: number } {
  return generateToken(oldPayload.userId, oldPayload.role);
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const [header, payloadEncoded, signature] = parts;
    const expectedSignature = createSignature(`${header}.${payloadEncoded}`, getJwtSecret());
    
    if (signature !== expectedSignature) {
      logger.debug("JWT signature verification failed");
      return null;
    }
    
    const payloadStr = base64UrlDecode(payloadEncoded);
    const payload = JSON.parse(payloadStr) as JwtPayload;
    
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      logger.debug("JWT token expired");
      return null;
    }
    
    return payload;
  } catch (error) {
    logger.debug("JWT verification error", { error: (error as Error).message });
    return null;
  }
}

export function verifyApiKey(key: string): boolean {
  return key === getApiKey();
}

function extractAuthFromRequest(request: FastifyRequest): { type: "jwt" | "apiKey" | "none"; credentials?: string } {
  const authHeader = request.headers.authorization as string | undefined;
  const apiKeyHeader = request.headers[API_KEY_HEADER] as string | undefined;
  
  if (apiKeyHeader) {
    return { type: "apiKey", credentials: apiKeyHeader };
  }
  
  if (authHeader && authHeader.startsWith(BEARER_PREFIX)) {
    return { type: "jwt", credentials: authHeader.slice(BEARER_PREFIX.length) };
  }
  
  return { type: "none" };
}

function isAuthEnabled(): boolean {
  return getAuthConfig().enabled;
}

function isPublicRoute(path: string, publicRoutes: string[]): boolean {
  return publicRoutes.some((route) => path.startsWith(route));
}

export function authenticate(request: FastifyRequest, _reply: FastifyReply): AuthUser | null {
  if (!isAuthEnabled()) {
    return { userId: "anonymous", role: "admin" };
  }
  
  const auth = extractAuthFromRequest(request);
  
  if (auth.type === "apiKey" && auth.credentials) {
    if (verifyApiKey(auth.credentials)) {
      return { userId: "api-client", role: "admin" };
    }
    return null;
  }
  
  if (auth.type === "jwt" && auth.credentials) {
    const payload = verifyJwt(auth.credentials);
    if (payload) {
      return { userId: payload.userId, role: payload.role };
    }
    return null;
  }
  
  return null;
}

export function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const user = authenticate(request, reply);
  request.user = user;
  done();
}

export function requireAuth(
  options: AuthMiddlewareOptions = {}
): (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => void {
  const publicRoutes = options.publicRoutes || ["/api/health", "/api/auth"];
  const skipHealth = options.skipAuthForHealth !== false;
  
  return (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void => {
    if (!isAuthEnabled()) {
      request.user = { userId: "anonymous", role: "admin" };
      done();
      return;
    }
    
    if (skipHealth && request.url === "/api/health") {
      request.user = { userId: "anonymous", role: "admin" };
      done();
      return;
    }
    
    if (isPublicRoute(request.url, publicRoutes)) {
      request.user = authenticate(request, reply) || { userId: "anonymous", role: "guest" };
      done();
      return;
    }
    
    const user = authenticate(request, reply);
    if (!user) {
      reply.code(401).send({ error: "Unauthorized", message: "Valid authentication required" });
      done();
      return;
    }
    
    request.user = user;
    done();
  };
}

export function getAuthMiddleware(options: AuthMiddlewareOptions = {}): {
  preHandler: (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => void;
} {
  return {
    preHandler: requireAuth(options),
  };
}

export function resetAuthCache(): void {
  cachedJwtSecret = undefined;
  cachedApiKey = undefined;
}