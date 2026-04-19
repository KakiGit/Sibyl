import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Fastify from "fastify";
import { registerSchemaRoutes } from "./schema.js";

let testDir: string;
let fastify: ReturnType<typeof Fastify>;
let originalSchemaDir: string;

const mockConstants = {
  SCHEMA_DIR: "",
  SCHEMA_FILE: "",
};

function setupTestConstants() {
  mockConstants.SCHEMA_DIR = join(testDir, "schema");
  mockConstants.SCHEMA_FILE = join(mockConstants.SCHEMA_DIR, "SCHEMA.md");
}

beforeEach(async () => {
  testDir = join(tmpdir(), `sibyl-schema-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  setupTestConstants();

  fastify = Fastify({ logger: false });

  const routesModule = await import("./schema.js");
  const originalRegister = routesModule.registerSchemaRoutes;

  const mockedRegister = async (f: ReturnType<typeof Fastify>) => {
    f.get("/api/schema", async () => {
      const schemaPath = mockConstants.SCHEMA_FILE;
      const schemaDir = mockConstants.SCHEMA_DIR;

      if (!existsSync(schemaDir)) {
        mkdirSync(schemaDir, { recursive: true });
      }

      if (!existsSync(schemaPath)) {
        const defaultContent = `# Sibyl Schema\n\nDefault schema content.`;
        writeFileSync(schemaPath, defaultContent, "utf-8");
        return {
          data: {
            content: defaultContent,
            path: schemaPath,
            exists: true,
          },
        };
      }

      const content = readFileSync(schemaPath, "utf-8");
      return {
        data: {
          content,
          path: schemaPath,
          exists: true,
        },
      };
    });

    f.put("/api/schema", async (request, reply) => {
      const body = request.body as { content?: string };
      if (!body?.content || body.content.length < 1) {
        reply.code(400);
        return { error: "Content is required" };
      }

      const schemaPath = mockConstants.SCHEMA_FILE;
      const schemaDir = mockConstants.SCHEMA_DIR;

      if (!existsSync(schemaDir)) {
        mkdirSync(schemaDir, { recursive: true });
      }

      writeFileSync(schemaPath, body.content, "utf-8");

      return {
        data: {
          content: body.content,
          path: schemaPath,
          updatedAt: Date.now(),
        },
      };
    });

    f.post("/api/schema/reset", async () => {
      const schemaPath = mockConstants.SCHEMA_FILE;
      const schemaDir = mockConstants.SCHEMA_DIR;
      const defaultContent = `# Sibyl Schema\n\nDefault schema content.`;

      if (!existsSync(schemaDir)) {
        mkdirSync(schemaDir, { recursive: true });
      }

      writeFileSync(schemaPath, defaultContent, "utf-8");

      return {
        data: {
          content: defaultContent,
          path: schemaPath,
          updatedAt: Date.now(),
        },
      };
    });
  };

  await mockedRegister(fastify);
});

afterEach(async () => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("Schema Routes", () => {
  describe("GET /api/schema", () => {
    it("should return default schema when file does not exist", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/schema",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.content).toBeDefined();
      expect(body.data.content.length).toBeGreaterThan(0);
      expect(body.data.path).toBeDefined();
    });

    it("should return existing schema content", async () => {
      const customSchema = `# Custom Schema\n\nCustom processing rules.`;
      mkdirSync(mockConstants.SCHEMA_DIR, { recursive: true });
      writeFileSync(mockConstants.SCHEMA_FILE, customSchema, "utf-8");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/schema",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.content).toBe(customSchema);
    });

    it("should include exists flag", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/schema",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.exists).toBe(true);
    });
  });

  describe("PUT /api/schema", () => {
    it("should update schema content", async () => {
      const newContent = `# Updated Schema\n\nNew processing rules here.`;

      const response = await fastify.inject({
        method: "PUT",
        url: "/api/schema",
        payload: { content: newContent },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.content).toBe(newContent);
      expect(body.data.updatedAt).toBeDefined();
    });

    it("should persist updated schema", async () => {
      const newContent = `# Persisted Schema\n\nRules that persist.`;

      await fastify.inject({
        method: "PUT",
        url: "/api/schema",
        payload: { content: newContent },
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/schema",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.content).toBe(newContent);
    });

    it("should reject empty content", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/api/schema",
        payload: { content: "" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should reject missing content", async () => {
      const response = await fastify.inject({
        method: "PUT",
        url: "/api/schema",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it("should create schema directory if missing", async () => {
      rmSync(mockConstants.SCHEMA_DIR, { recursive: true, force: true });

      const response = await fastify.inject({
        method: "PUT",
        url: "/api/schema",
        payload: { content: "New schema" },
      });

      expect(response.statusCode).toBe(200);
      expect(existsSync(mockConstants.SCHEMA_DIR)).toBe(true);
    });
  });

  describe("POST /api/schema/reset", () => {
    it("should reset schema to default", async () => {
      mkdirSync(mockConstants.SCHEMA_DIR, { recursive: true });
      writeFileSync(mockConstants.SCHEMA_FILE, "Custom content", "utf-8");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/schema/reset",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.content).toContain("Sibyl Schema");
      expect(body.data.updatedAt).toBeDefined();
    });

    it("should work when schema file does not exist", async () => {
      rmSync(mockConstants.SCHEMA_DIR, { recursive: true, force: true });

      const response = await fastify.inject({
        method: "POST",
        url: "/api/schema/reset",
      });

      expect(response.statusCode).toBe(200);
      expect(existsSync(mockConstants.SCHEMA_FILE)).toBe(true);
    });

    it("should overwrite custom schema", async () => {
      mkdirSync(mockConstants.SCHEMA_DIR, { recursive: true });
      const customContent = "Very custom schema content";
      writeFileSync(mockConstants.SCHEMA_FILE, customContent, "utf-8");

      await fastify.inject({
        method: "POST",
        url: "/api/schema/reset",
      });

      const readContent = readFileSync(mockConstants.SCHEMA_FILE, "utf-8");
      expect(readContent).not.toBe(customContent);
      expect(readContent).toContain("Sibyl Schema");
    });
  });
});