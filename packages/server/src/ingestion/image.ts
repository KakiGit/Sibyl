import sharp from "sharp";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { logger } from "@sibyl/shared";

export interface ImageIngestionResult {
  metadata: {
    format: string;
    width: number;
    height: number;
    channels: number;
    density?: number;
    hasAlpha: boolean;
    space: string;
    orientation?: number;
  };
  exif?: {
    createdAt?: string;
    camera?: string;
    software?: string;
    location?: { latitude: number; longitude: number };
  };
  thumbnailPath?: string;
  description: string;
}

export async function ingestImage(filePath: string): Promise<ImageIngestionResult> {
  const imageBuffer = readFileSync(filePath);
  const metadata = await sharp(imageBuffer).metadata();
  
  let exif: ImageIngestionResult["exif"] | undefined;
  
  if (metadata.exif) {
    try {
      let exifStr: string;
      if (Buffer.isBuffer(metadata.exif)) {
        exifStr = metadata.exif.toString("utf8");
      } else if (typeof metadata.exif === "string") {
        exifStr = metadata.exif;
      } else {
        exifStr = JSON.stringify(metadata.exif);
      }
      
      exif = parseExifData(exifStr);
    } catch (e) {
      logger.debug("Could not parse EXIF data", { filePath, error: String(e) });
    }
  }
  
  const description = generateImageDescription(metadata, exif, basename(filePath));
  
  logger.info("Image ingested", { 
    filePath, 
    format: metadata.format,
    width: metadata.width,
    height: metadata.height 
  });
  
  return {
    metadata: {
      format: metadata.format || "unknown",
      width: metadata.width || 0,
      height: metadata.height || 0,
      channels: metadata.channels || 3,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha || false,
      space: metadata.space || "srgb",
      orientation: metadata.orientation,
    },
    exif,
    description,
  };
}

export async function createThumbnail(
  filePath: string, 
  outputPath: string, 
  maxSize: number = 256
): Promise<string> {
  const imageBuffer = readFileSync(filePath);
  
  if (!existsSync(dirname(outputPath))) {
    mkdirSync(dirname(outputPath), { recursive: true });
  }
  
  await sharp(imageBuffer)
    .resize(maxSize, maxSize, { 
      fit: "inside",
      withoutEnlargement: true 
    })
    .jpeg({ quality: 80 })
    .toFile(outputPath);
  
  logger.debug("Thumbnail created", { filePath, outputPath, maxSize });
  
  return outputPath;
}

export async function generateImageDescriptionWithThumbnail(
  filePath: string,
  thumbnailDir?: string
): Promise<ImageIngestionResult & { thumbnailPath?: string }> {
  const result = await ingestImage(filePath);
  
  if (thumbnailDir) {
    const thumbnailName = `${basename(filePath, extname(filePath))}_thumb.jpg`;
    const thumbnailPath = join(thumbnailDir, thumbnailName);
    
    try {
      await createThumbnail(filePath, thumbnailPath);
      result.thumbnailPath = thumbnailPath;
    } catch (e) {
      logger.warn("Failed to create thumbnail", { filePath, error: String(e) });
    }
  }
  
  return result;
}

function parseExifData(exifStr: string): ImageIngestionResult["exif"] | undefined {
  const result: ImageIngestionResult["exif"] = {};
  
  const dateMatch = exifStr.match(/DateTime(?:Original|Digitized)?[=:]\s*"?(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})"?/i);
  if (dateMatch) {
    result.createdAt = dateMatch[1].replace(/:/g, "-").replace(" ", "T");
  }
  
  const cameraMatch = exifStr.match(/(?:Model|Camera)[=:]\s*"?([^"\n,]+)"?/i);
  if (cameraMatch) {
    result.camera = cameraMatch[1].trim();
  }
  
  const softwareMatch = exifStr.match(/Software[=:]\s*"?([^"\n,]+)"?/i);
  if (softwareMatch) {
    result.software = softwareMatch[1].trim();
  }
  
  const gpsMatch = exifStr.match(/(?:GPSLatitude|GPSLongitude)[=:]/i);
  if (gpsMatch) {
    const latMatch = exifStr.match(/GPSLatitude[=:]\s*([\d.]+)/i);
    const lonMatch = exifStr.match(/GPSLongitude[=:]\s*([\d.]+)/i);
    if (latMatch && lonMatch) {
      result.location = {
        latitude: parseFloat(latMatch[1]),
        longitude: parseFloat(lonMatch[1]),
      };
    }
  }
  
  return Object.keys(result).length > 0 ? result : undefined;
}

function generateImageDescription(
  metadata: sharp.Metadata,
  exif: ImageIngestionResult["exif"] | undefined,
  filename: string
): string {
  const lines: string[] = [];
  
  lines.push(`Image: ${filename}`);
  lines.push(`Format: ${metadata.format || "unknown"}`);
  lines.push(`Dimensions: ${metadata.width}x${metadata.height} pixels`);
  
  if (metadata.density) {
    lines.push(`Density: ${metadata.density} DPI`);
  }
  
  if (metadata.hasAlpha) {
    lines.push("Has transparency (alpha channel)");
  }
  
  if (exif) {
    lines.push("");
    lines.push("EXIF Information:");
    
    if (exif.createdAt) {
      lines.push(`- Created: ${exif.createdAt}`);
    }
    if (exif.camera) {
      lines.push(`- Camera: ${exif.camera}`);
    }
    if (exif.software) {
      lines.push(`- Software: ${exif.software}`);
    }
    if (exif.location) {
      lines.push(`- Location: ${exif.location.latitude}, ${exif.location.longitude}`);
    }
  }
  
  return lines.join("\n");
}

export function imageToMarkdown(result: ImageIngestionResult, imagePath: string): string {
  const lines: string[] = [];
  
  lines.push(`# Image Metadata`);
  lines.push("");
  
  lines.push(`**Path:** ${imagePath}`);
  lines.push(`**Format:** ${result.metadata.format}`);
  lines.push(`**Dimensions:** ${result.metadata.width} × ${result.metadata.height}`);
  lines.push(`**Channels:** ${result.metadata.channels}`);
  
  if (result.metadata.density) {
    lines.push(`**Density:** ${result.metadata.density} DPI`);
  }
  
  if (result.metadata.orientation) {
    lines.push(`**Orientation:** ${result.metadata.orientation}`);
  }
  
  lines.push("");
  lines.push("---");
  lines.push("");
  
  if (result.exif) {
    lines.push("## EXIF Data");
    lines.push("");
    
    if (result.exif.createdAt) {
      lines.push(`- **Created:** ${result.exif.createdAt}`);
    }
    if (result.exif.camera) {
      lines.push(`- **Camera:** ${result.exif.camera}`);
    }
    if (result.exif.software) {
      lines.push(`- **Software:** ${result.exif.software}`);
    }
    if (result.exif.location) {
      lines.push(`- **Location:** [${result.exif.location.latitude}, ${result.exif.location.longitude}]`);
    }
    
    lines.push("");
  }
  
  lines.push("## Description");
  lines.push("");
  lines.push(result.description);
  
  return lines.join("\n").trim();
}