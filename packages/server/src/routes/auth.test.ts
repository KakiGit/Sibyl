import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import Fastify from "fastify";
import { registerAuthRoutes } from "./auth.js";
import { generateToken, verifyJwt, resetAuthCache } from "../auth/middleware.js";

let fastify: ReturnType<typeof Fastify>;

describe("Auth Routes", () => {
  beforeEach(async () => {
    process.env.SIBYL_JWT_SECRET = "test-secret-key-12345678";
    process.env.SIBYL_API_KEY = "sibyl-test-api-key";
    process.env.SIBYL_AUTH_ENABLED = "true";
    resetAuthCache();
    
    fastify = Fastify({ logger: false });
    await registerAuthRoutes(fastify);
  });

  afterEach(async () => {
    delete process.env.SIBYL_JWT_SECRET;
    delete process.env.SIBYL_API_KEY;
    delete process.env.SIBYL_AUTH_ENABLED;
    resetAuthCache();
    await fastify.close();
  });

  describe("GET /api/auth/status", () => {
    it("should return auth status", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/auth/status",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.enabled).toBe(true);
      expect(body.data.hasJwtSecret).toBe(true);
      expect(body.data.hasApiKey).toBe(true);
    });

    it("should return false when auth disabled", async () => {
      process.env.SIBYL_AUTH_ENABLED = "false";
      resetAuthCache();

      const response = await fastify.inject({
        method: "GET",
        url: "/api/auth/status",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.enabled).toBe(false);
    });
  });

  describe("POST /api/auth/login", () => {
    it("should login with valid API key", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          apiKey: "sibyl-test-api-key",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.token).toBeDefined();
      expect(body.data.expiresIn).toBe(3600);
      expect(body.data.user.userId).toBe("api-client");
      expect(body.data.user.role).toBe("admin");
    });

    it("should reject invalid API key", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          apiKey: "wrong-key",
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Invalid API key");
    });

    it("should require API key", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("API key required for login");
    });

    it("should reject login when auth disabled", async () => {
      process.env.SIBYL_AUTH_ENABLED = "false";
      resetAuthCache();

      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          apiKey: "sibyl-test-api-key",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Authentication is not enabled");
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("should refresh valid token", async () => {
      const { token } = generateToken("user-1", "admin");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: {
          token,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.token).toBeDefined();
      expect(body.data.expiresIn).toBe(3600);

      const newPayload = verifyJwt(body.data.token);
      expect(newPayload?.userId).toBe("user-1");
      expect(newPayload?.role).toBe("admin");
    });

    it("should reject invalid token", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: {
          token: "invalid-token",
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Invalid or expired token");
    });

    it("should require token field", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it("should reject refresh when auth disabled", async () => {
      process.env.SIBYL_AUTH_ENABLED = "false";
      resetAuthCache();

      const { token } = generateToken("user-1");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: {
          token,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Authentication is not enabled");
    });
  });

  describe("POST /api/auth/verify", () => {
    it("should verify valid token", async () => {
      const { token } = generateToken("user-1", "admin");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/verify",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.valid).toBe(true);
      expect(body.data.user.userId).toBe("user-1");
      expect(body.data.user.role).toBe("admin");
      expect(body.data.expiresAt).toBeDefined();
    });

    it("should reject invalid token", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/verify",
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Invalid or expired token");
    });

    it("should reject missing token", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/verify",
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("No token provided");
    });

    it("should return valid when auth disabled", async () => {
      process.env.SIBYL_AUTH_ENABLED = "false";
      resetAuthCache();

      const response = await fastify.inject({
        method: "POST",
        url: "/api/auth/verify",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.valid).toBe(true);
      expect(body.data.user.userId).toBe("anonymous");
    });
  });

  describe("Integration: Login and use token", () => {
    it("should login and generate verifiable token", async () => {
      const loginResponse = await fastify.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          apiKey: "sibyl-test-api-key",
        },
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginBody = JSON.parse(loginResponse.body);
      const token = loginBody.data.token;

      const verifyResponse = await fastify.inject({
        method: "POST",
        url: "/api/auth/verify",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(verifyResponse.statusCode).toBe(200);
      const verifyBody = JSON.parse(verifyResponse.body);
      expect(verifyBody.data.valid).toBe(true);
    });

    it("should login, refresh, and verify refreshed token", async () => {
      const loginResponse = await fastify.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          apiKey: "sibyl-test-api-key",
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      const initialToken = loginBody.data.token;

      const initialPayload = verifyJwt(initialToken)!;

      const refreshResponse = await fastify.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: {
          token: initialToken,
        },
      });

      expect(refreshResponse.statusCode).toBe(200);
      const refreshBody = JSON.parse(refreshResponse.body);
      const refreshedToken = refreshBody.data.token;

      const refreshedPayload = verifyJwt(refreshedToken)!;
      expect(refreshedPayload.userId).toBe(initialPayload.userId);
      expect(refreshedPayload.role).toBe(initialPayload.role);
      expect(refreshedPayload.exp).toBeGreaterThanOrEqual(initialPayload.exp);

      const verifyResponse = await fastify.inject({
        method: "POST",
        url: "/api/auth/verify",
        headers: {
          authorization: `Bearer ${refreshedToken}`,
        },
      });

      expect(verifyResponse.statusCode).toBe(200);
    });
  });
});