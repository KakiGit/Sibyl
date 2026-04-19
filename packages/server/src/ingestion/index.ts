import { ingestPdf, pdfToMarkdown } from "./pdf.js";
import { ingestWebpage, webpageToMarkdown } from "./webpage.js";
import { generateImageDescriptionWithThumbnail, imageToMarkdown } from "./image.js";

export { ingestPdf, pdfToMarkdown } from "./pdf.js";
export type { PdfIngestionResult } from "./pdf.js";

export { ingestWebpage, webpageToMarkdown, fetchWebpage } from "./webpage.js";
export type { WebpageIngestionResult } from "./webpage.js";

export { 
  ingestImage, 
  createThumbnail, 
  generateImageDescriptionWithThumbnail,
  imageToMarkdown,
} from "./image.js";
export type { ImageIngestionResult } from "./image.js";

export type DocumentType = "pdf" | "webpage" | "image" | "text";

export interface DocumentIngestionOptions {
  type: DocumentType;
  filePath?: string;
  url?: string;
  html?: string;
  createThumbnail?: boolean;
  thumbnailDir?: string;
}

export interface DocumentIngestionResult {
  success: boolean;
  type: DocumentType;
  content: string;
  markdown: string;
  metadata: Record<string, unknown>;
  thumbnailPath?: string;
  error?: string;
}

export async function ingestDocument(options: DocumentIngestionOptions): Promise<DocumentIngestionResult> {
  try {
    switch (options.type) {
      case "pdf": {
        if (!options.filePath) {
          throw new Error("filePath is required for PDF ingestion");
        }
        const result = await ingestPdf(options.filePath);
        return {
          success: true,
          type: "pdf",
          content: result.text,
          markdown: pdfToMarkdown(result),
          metadata: result.metadata,
        };
      }
      
      case "webpage": {
        if (!options.url) {
          throw new Error("url is required for webpage ingestion");
        }
        const result = await ingestWebpage(options.url, options.html);
        return {
          success: true,
          type: "webpage",
          content: result.content,
          markdown: webpageToMarkdown(result),
          metadata: result.metadata,
        };
      }
      
      case "image": {
        if (!options.filePath) {
          throw new Error("filePath is required for image ingestion");
        }
        const result = await generateImageDescriptionWithThumbnail(
          options.filePath,
          options.createThumbnail ? options.thumbnailDir : undefined
        );
        return {
          success: true,
          type: "image",
          content: result.description,
          markdown: imageToMarkdown(result, options.filePath),
          metadata: result.metadata,
          thumbnailPath: result.thumbnailPath,
        };
      }
      
      case "text": {
        throw new Error("Text ingestion is handled by the existing ingest processor");
      }
      
      default:
        throw new Error(`Unknown document type: ${options.type}`);
    }
  } catch (error) {
    return {
      success: false,
      type: options.type,
      content: "",
      markdown: "",
      metadata: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}