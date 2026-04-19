import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generateToken, verifyJwt, verifyApiKey, refreshToken } from "../auth/middleware.js";
import { getAuthConfig } from "@sibyl/shared";

const LoginSchema = z.object({
  apiKey: z.string().optional(),
});

const RefreshTokenSchema = z.object({
  token: z.string().min(1),
});

export async function registerAuthRoutes(fastify: FastifyInstance) {
  fastify.get("/api/auth/status", async () => {
    const config = getAuthConfig();
    return {
      data: {
        enabled: config.enabled,
        hasJwtSecret: !!config.jwtSecret,
        hasApiKey: !!config.apiKey,
      },
    };
  });

  fastify.post("/api/auth/login", async (request, reply) => {
    const config = getAuthConfig();
    
    if (!config.enabled) {
      reply.code(400);
      return { error: "Authentication is not enabled" };
    }
    
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }
    
    const { apiKey } = parseResult.data;
    
    if (!apiKey) {
      reply.code(400);
      return { error: "API key required for login" };
    }
    
    if (!verifyApiKey(apiKey)) {
      reply.code(401);
      return { error: "Invalid API key" };
    }
    
    const tokenResult = generateToken("api-client", "admin");
    
    return {
      data: {
        token: tokenResult.token,
        expiresIn: tokenResult.expiresIn,
        user: {
          userId: "api-client",
          role: "admin",
        },
      },
    };
  });

  fastify.post("/api/auth/refresh", async (request, reply) => {
    const config = getAuthConfig();
    
    if (!config.enabled) {
      reply.code(400);
      return { error: "Authentication is not enabled" };
    }
    
    const parseResult = RefreshTokenSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }
    
    const { token } = parseResult.data;
    const payload = verifyJwt(token);
    
    if (!payload) {
      reply.code(401);
      return { error: "Invalid or expired token" };
    }
    
    const tokenResult = refreshToken(payload);
    
    return {
      data: {
        token: tokenResult.token,
        expiresIn: tokenResult.expiresIn,
      },
    };
  });

  fastify.post("/api/auth/verify", async (request, reply) => {
    const config = getAuthConfig();
    
    if (!config.enabled) {
      return {
        data: {
          valid: true,
          user: { userId: "anonymous", role: "admin" },
        },
      };
    }
    
    const authHeader = request.headers.authorization as string | undefined;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.code(401);
      return { error: "No token provided" };
    }
    
    const token = authHeader.slice(7);
    const payload = verifyJwt(token);
    
    if (!payload) {
      reply.code(401);
      return { error: "Invalid or expired token" };
    }
    
    return {
      data: {
        valid: true,
        user: {
          userId: payload.userId,
          role: payload.role,
        },
        expiresAt: payload.exp,
      },
    };
  });
}