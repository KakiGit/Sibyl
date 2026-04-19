import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generateToken, verifyJwt, verifyApiKey, authenticate, requireAuth, refreshToken, resetAuthCache } from "./middleware.js";
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";

const mockRequest = (headers: Record<string, string>): FastifyRequest => {
  return {
    headers,
    url: "/api/test",
    user: undefined,
  } as unknown as FastifyRequest;
};

const mockReply = (): FastifyReply => {
  const reply = {
    code: () => reply,
    send: () => reply,
  };
  return reply as unknown as FastifyReply;
};

describe("Authentication Middleware", () => {
  beforeEach(() => {
    resetAuthCache();
    process.env.SIBYL_JWT_SECRET = "test-secret-key-12345678";
    process.env.SIBYL_API_KEY = "sibyl-test-api-key";
  });

  afterEach(() => {
    delete process.env.SIBYL_JWT_SECRET;
    delete process.env.SIBYL_API_KEY;
    delete process.env.SIBYL_AUTH_ENABLED;
    resetAuthCache();
  });

  describe("generateToken", () => {
    it("should generate a valid JWT token", () => {
      const result = generateToken("user-1", "admin");
      
      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBe(3600);
      expect(result.token.split(".").length).toBe(3);
    });

    it("should generate tokens with different user IDs", () => {
      const token1 = generateToken("user-1", "user");
      const token2 = generateToken("user-2", "user");
      
      expect(token1.token).not.toBe(token2.token);
    });

    it("should default role to 'user'", () => {
      const result = generateToken("user-1");
      
      const payload = verifyJwt(result.token);
      expect(payload?.role).toBe("user");
    });
  });

  describe("verifyJwt", () => {
    it("should verify a valid token", () => {
      const { token } = generateToken("user-1", "admin");
      const payload = verifyJwt(token);
      
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe("user-1");
      expect(payload?.role).toBe("admin");
      expect(payload?.exp).toBeGreaterThan(payload?.iat!);
    });

    it("should return null for invalid token format", () => {
      const payload = verifyJwt("invalid-token");
      expect(payload).toBeNull();
    });

    it("should return null for token without three parts", () => {
      const payload = verifyJwt("header.payload");
      expect(payload).toBeNull();
    });
  });

  describe("verifyApiKey", () => {
    it("should verify a valid API key", () => {
      expect(verifyApiKey("sibyl-test-api-key")).toBe(true);
    });

    it("should reject invalid API key", () => {
      expect(verifyApiKey("wrong-key")).toBe(false);
    });

    it("should reject empty API key", () => {
      expect(verifyApiKey("")).toBe(false);
    });
  });

  describe("refreshToken", () => {
    it("should refresh a valid token payload", () => {
      const { token } = generateToken("user-1", "admin");
      const payload = verifyJwt(token)!;
      
      const refreshed = refreshToken(payload);
      
      expect(refreshed.token).toBeDefined();
      expect(refreshed.expiresIn).toBe(3600);
      
      const newPayload = verifyJwt(refreshed.token);
      expect(newPayload?.userId).toBe("user-1");
      expect(newPayload?.role).toBe("admin");
    });

    it("should create new token with same user info", () => {
      const { token: oldToken } = generateToken("user-1", "user");
      const payload = verifyJwt(oldToken)!;
      
      const { token: newToken } = refreshToken(payload);
      
      const newPayload = verifyJwt(newToken);
      expect(newPayload?.userId).toBe(payload.userId);
      expect(newPayload?.role).toBe(payload.role);
      
      const now = Math.floor(Date.now() / 1000);
      expect(newPayload?.exp).toBeGreaterThanOrEqual(payload.exp);
    });
  });

  describe("authenticate", () => {
    it("should return anonymous user when auth is disabled", () => {
      process.env.SIBYL_AUTH_ENABLED = "false";
      resetAuthCache();
      
      const request = mockRequest({});
      const reply = mockReply();
      
      const user = authenticate(request, reply);
      
      expect(user?.userId).toBe("anonymous");
      expect(user?.role).toBe("admin");
    });

    it("should authenticate with valid JWT token", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const { token } = generateToken("user-1", "admin");
      const request = mockRequest({ authorization: `Bearer ${token}` });
      const reply = mockReply();
      
      const user = authenticate(request, reply);
      
      expect(user?.userId).toBe("user-1");
      expect(user?.role).toBe("admin");
    });

    it("should authenticate with valid API key header", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const request = mockRequest({ "x-api-key": "sibyl-test-api-key" });
      const reply = mockReply();
      
      const user = authenticate(request, reply);
      
      expect(user?.userId).toBe("api-client");
      expect(user?.role).toBe("admin");
    });

    it("should return null for invalid JWT token", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const request = mockRequest({ authorization: "Bearer invalid-token" });
      const reply = mockReply();
      
      const user = authenticate(request, reply);
      expect(user).toBeNull();
    });

    it("should return null for invalid API key", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const request = mockRequest({ "x-api-key": "wrong-key" });
      const reply = mockReply();
      
      const user = authenticate(request, reply);
      expect(user).toBeNull();
    });

    it("should return null when no auth provided", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const request = mockRequest({});
      const reply = mockReply();
      
      const user = authenticate(request, reply);
      expect(user).toBeNull();
    });

    it("should prefer API key over JWT", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const { token } = generateToken("jwt-user", "user");
      const request = mockRequest({
        authorization: `Bearer ${token}`,
        "x-api-key": "sibyl-test-api-key",
      });
      const reply = mockReply();
      
      const user = authenticate(request, reply);
      
      expect(user?.userId).toBe("api-client");
    });
  });

  describe("requireAuth middleware", () => {
    it("should allow anonymous when auth disabled", () => {
      process.env.SIBYL_AUTH_ENABLED = "false";
      resetAuthCache();
      
      const middleware = requireAuth();
      const request = mockRequest({});
      const reply = mockReply();
      let doneCalled = false;
      const done = () => { doneCalled = true; };
      
      middleware(request, reply, done);
      
      expect(request.user?.userId).toBe("anonymous");
      expect(doneCalled).toBe(true);
    });

    it("should allow health endpoint without auth", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const middleware = requireAuth({ skipAuthForHealth: true });
      const request = mockRequest({}) as FastifyRequest;
      (request as Record<string, unknown>).url = "/api/health";
      const reply = mockReply();
      let doneCalled = false;
      const done = () => { doneCalled = true; };
      
      middleware(request, reply, done);
      
      expect(request.user?.userId).toBe("anonymous");
      expect(doneCalled).toBe(true);
    });

    it("should allow public routes", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const middleware = requireAuth({
        publicRoutes: ["/api/auth", "/api/public"],
      });
      const request = mockRequest({}) as FastifyRequest;
      (request as Record<string, unknown>).url = "/api/auth/login";
      const reply = mockReply();
      let doneCalled = false;
      const done = () => { doneCalled = true; };
      
      middleware(request, reply, done);
      
      expect(doneCalled).toBe(true);
    });

    it("should reject request without auth on protected routes", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const middleware = requireAuth({
        publicRoutes: [],
        skipAuthForHealth: false,
      });
      const request = mockRequest({});
      const reply = mockReply();
      let doneCalled = false;
      const done = () => { doneCalled = true; };
      
      middleware(request, reply, done);
      
      expect(doneCalled).toBe(true);
    });

    it("should allow request with valid API key", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const middleware = requireAuth({
        publicRoutes: [],
        skipAuthForHealth: false,
      });
      const request = mockRequest({ "x-api-key": "sibyl-test-api-key" });
      const reply = mockReply();
      let doneCalled = false;
      const done = () => { doneCalled = true; };
      
      middleware(request, reply, done);
      
      expect(request.user?.userId).toBe("api-client");
      expect(doneCalled).toBe(true);
    });

    it("should allow request with valid JWT", () => {
      process.env.SIBYL_AUTH_ENABLED = "true";
      resetAuthCache();
      
      const { token } = generateToken("user-1", "admin");
      const middleware = requireAuth({
        publicRoutes: [],
        skipAuthForHealth: false,
      });
      const request = mockRequest({ authorization: `Bearer ${token}` });
      const reply = mockReply();
      let doneCalled = false;
      const done = () => { doneCalled = true; };
      
      middleware(request, reply, done);
      
      expect(request.user?.userId).toBe("user-1");
      expect(doneCalled).toBe(true);
    });
  });

  describe("JWT token structure", () => {
    it("should create valid JWT header", () => {
      const { token } = generateToken("user-1");
      const headerPart = token.split(".")[0];
      
      const headerStr = Buffer.from(headerPart, "base64url").toString();
      const header = JSON.parse(headerStr);
      
      expect(header.alg).toBe("HS256");
      expect(header.typ).toBe("JWT");
    });

    it("should include all required payload fields", () => {
      const { token } = generateToken("user-1", "admin");
      const payload = verifyJwt(token)!;
      
      expect(payload.userId).toBeDefined();
      expect(payload.role).toBeDefined();
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });
  });
});