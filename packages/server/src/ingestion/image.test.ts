import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import sharp from "sharp";
import { ingestImage, createThumbnail, imageToMarkdown, type ImageIngestionResult } from "./image.js";

const tempDir = join(tmpdir(), "sibyl-image-test");
const thumbnailDir = join(tempDir, "thumbnails");

beforeAll(async () => {
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  if (!existsSync(thumbnailDir)) {
    mkdirSync(thumbnailDir, { recursive: true });
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
  
  const pngBuffer = await sharp({
    create: {
      width: 200,
      height: 100,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 128 },
    },
  })
    .png()
    .toBuffer();
  
  writeFileSync(join(tempDir, "test.png"), pngBuffer);
});

afterAll(() => {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true });
  }
});

describe("Image Ingestion", () => {
  it("should extract metadata from JPEG image", async () => {
    const imagePath = join(tempDir, "test.jpg");
    const result = await ingestImage(imagePath);
    
    expect(result.metadata.format).toBe("jpeg");
    expect(result.metadata.width).toBe(100);
    expect(result.metadata.height).toBe(50);
    expect(result.metadata.channels).toBe(3);
    expect(result.metadata.hasAlpha).toBe(false);
    expect(result.description).toContain("test.jpg");
    expect(result.description).toContain("100x50");
  });

  it("should extract metadata from PNG image with alpha", async () => {
    const imagePath = join(tempDir, "test.png");
    const result = await ingestImage(imagePath);
    
    expect(result.metadata.format).toBe("png");
    expect(result.metadata.width).toBe(200);
    expect(result.metadata.height).toBe(100);
    expect(result.metadata.hasAlpha).toBe(true);
    expect(result.description).toContain("transparency");
  });

  it("should create thumbnail from image", async () => {
    const imagePath = join(tempDir, "test.jpg");
    const thumbnailPath = join(thumbnailDir, "test_thumb.jpg");
    
    await createThumbnail(imagePath, thumbnailPath, 64);
    
    expect(existsSync(thumbnailPath)).toBe(true);
    
    const thumbnailBuffer = readFileSync(thumbnailPath);
    const thumbnailMeta = await sharp(thumbnailBuffer).metadata();
    
    expect(thumbnailMeta.width).toBeLessThanOrEqual(64);
    expect(thumbnailMeta.height).toBeLessThanOrEqual(64);
    expect(thumbnailMeta.format).toBe("jpeg");
  });

  it("should generate markdown from image metadata", () => {
    const mockResult: ImageIngestionResult = {
      metadata: {
        format: "jpeg",
        width: 800,
        height: 600,
        channels: 3,
        density: 72,
        hasAlpha: false,
        space: "srgb",
      },
      exif: {
        createdAt: "2024-01-15T10:30:00",
        camera: "Canon EOS",
        software: "Adobe Photoshop",
      },
      description: "Image: photo.jpg\nFormat: jpeg\nDimensions: 800x600",
    };
    
    const markdown = imageToMarkdown(mockResult, "/path/to/photo.jpg");
    
    expect(markdown).toContain("# Image Metadata");
    expect(markdown).toContain("**Path:** /path/to/photo.jpg");
    expect(markdown).toContain("**Format:** jpeg");
    expect(markdown).toContain("**Dimensions:** 800 × 600");
    expect(markdown).toContain("## EXIF Data");
    expect(markdown).toContain("**Created:** 2024-01-15T10:30:00");
    expect(markdown).toContain("**Camera:** Canon EOS");
  });

  it("should handle image without EXIF data", async () => {
    const imagePath = join(tempDir, "test.jpg");
    const result = await ingestImage(imagePath);
    
    expect(result.exif).toBeUndefined();
    
    const markdown = imageToMarkdown(result, imagePath);
    
    expect(markdown).not.toContain("## EXIF Data");
    expect(markdown).toContain("## Description");
  });

  it("should generate correct description for image", async () => {
    const imagePath = join(tempDir, "test.jpg");
    const result = await ingestImage(imagePath);
    
    expect(result.description).toContain("Image: test.jpg");
    expect(result.description).toContain("Format: jpeg");
    expect(result.description).toContain("Dimensions: 100x50 pixels");
  });
});