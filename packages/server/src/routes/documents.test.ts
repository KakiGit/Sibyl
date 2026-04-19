import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import sharp from "sharp";
import Fastify from "fastify";
import { registerRoutes } from "./index.js";
import { DATA_DIR } from "@sibyl/shared";

const tempDir = join(tmpdir(), "sibyl-doc-test");

describe("Document Routes", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    
    const testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();
    
    writeFileSync(join(tempDir, "test.jpg"), testImageBuffer);
    
    writeFileSync(join(tempDir, "test.txt"), "Test content for ingestion.");
    
    const minimalPdf = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
      0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
      0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a,
      0x0a, 0x3c, 0x3c, 0x2f, 0x54, 0x69, 0x74, 0x6c,
      0x65, 0x20, 0x28, 0x54, 0x65, 0x73, 0x74, 0x20,
      0x50, 0x44, 0x46, 0x29, 0x2f, 0x41, 0x75, 0x74,
      0x68, 0x6f, 0x72, 0x20, 0x28, 0x53, 0x69, 0x62,
      0x79, 0x6c, 0x29, 0x3e, 0x3e, 0x0a,
      0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a,
      0x78, 0x72, 0x65, 0x66, 0x0a,
      0x30, 0x20, 0x31, 0x0a,
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30,
      0x30, 0x30, 0x20, 0x36, 0x35, 0x35, 0x33, 0x35,
      0x20, 0x66, 0x0a,
      0x74, 0x72, 0x61, 0x69, 0x6c, 0x65, 0x72, 0x0a,
      0x3c, 0x3c, 0x2f, 0x53, 0x69, 0x7a, 0x65, 0x20,
      0x31, 0x2f, 0x52, 0x6f, 0x6f, 0x74, 0x20, 0x31,
      0x20, 0x30, 0x20, 0x52, 0x2f, 0x49, 0x6e, 0x66,
      0x6f, 0x20, 0x31, 0x20, 0x30, 0x20, 0x52, 0x3e,
      0x3e, 0x0a,
      0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65,
      0x66, 0x0a,
      0x39, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a
    ]);
    writeFileSync(join(tempDir, "test.pdf"), minimalPdf);
    
    fastify = Fastify();
    await registerRoutes(fastify);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe("POST /api/documents/image", () => {
    it("should ingest an image file", async () => {
      const imagePath = join(tempDir, "test.jpg");
      
      const response = await fastify.inject({
        method: "POST",
        url: "/api/documents/image",
        body: {
          filePath: imagePath,
          title: "Test Image",
          type: "source",
          tags: ["test", "image"],
        },
      });
      
      const body = JSON.parse(response.body);
      
      if (response.statusCode === 200) {
        expect(body.data.slug).toBe("test-image");
        expect(body.data.type).toBe("source");
        expect(body.data.imageMetadata).toBeDefined();
        expect(body.data.imageMetadata.format).toBe("jpeg");
        expect(body.data.imageMetadata.width).toBe(100);
        expect(body.data.imageMetadata.height).toBe(50);
      } else {
        expect(body.error).toBeDefined();
      }
    });

    it("should reject non-existent file", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/documents/image",
        body: {
          filePath: "/nonexistent/path.jpg",
        },
      });
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("does not exist");
    });

    it("should create thumbnail when requested", async () => {
      const imagePath = join(tempDir, "test.jpg");
      
      const response = await fastify.inject({
        method: "POST",
        url: "/api/documents/image",
        body: {
          filePath: imagePath,
          createThumbnail: true,
        },
      });
      
      const body = JSON.parse(response.body);
      
      if (response.statusCode === 200) {
        expect(body.data.thumbnailPath).toBeDefined();
        expect(existsSync(body.data.thumbnailPath)).toBe(true);
      }
    });
  });

  describe("POST /api/documents/webpage", () => {
    it("should ingest webpage with HTML content", async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Webpage</title>
            <meta name="description" content="Test description">
          </head>
          <body>
            <main>
              <h1>Welcome</h1>
              <p>This is test content.</p>
            </main>
          </body>
        </html>
      `;
      
      const response = await fastify.inject({
        method: "POST",
        url: "/api/documents/webpage",
        body: {
          url: "https://example.com/test",
          html,
          title: "Test Webpage",
          type: "source",
        },
      });
      
      const body = JSON.parse(response.body);
      
      if (response.statusCode === 200) {
        expect(body.data.slug).toBe("test-webpage");
        expect(body.data.type).toBe("source");
        expect(body.data.webpageMetadata).toBeDefined();
        expect(body.data.webpageMetadata.url).toBe("https://example.com/test");
      } else {
        expect(body.error).toBeDefined();
      }
    });

    it("should validate URL format", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/documents/webpage",
        body: {
          url: "not-a-valid-url",
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/documents/pdf", () => {
    it("should ingest PDF file", async () => {
      const pdfPath = join(tempDir, "test.pdf");
      
      const response = await fastify.inject({
        method: "POST",
        url: "/api/documents/pdf",
        body: {
          filePath: pdfPath,
          title: "Test PDF",
          type: "source",
        },
      });
      
      const body = JSON.parse(response.body);
      
      if (response.statusCode === 200) {
        expect(body.data.slug).toBe("test-pdf");
        expect(body.data.type).toBe("source");
        expect(body.data.pdfMetadata).toBeDefined();
      } else {
        expect(body.error).toBeDefined();
      }
    });

    it("should reject non-existent PDF file", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/documents/pdf",
        body: {
          filePath: "/nonexistent/file.pdf",
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
  });
});