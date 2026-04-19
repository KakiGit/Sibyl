import pdfParse from "pdf-parse";
import { readFileSync } from "fs";
import { logger } from "@sibyl/shared";

export interface PdfIngestionResult {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    pageCount: number;
    creationDate?: Date;
    modificationDate?: Date;
  };
  pages: string[];
}

export async function ingestPdf(filePath: string): Promise<PdfIngestionResult> {
  const dataBuffer = readFileSync(filePath);
  
  const pdfData = await pdfParse(dataBuffer, {
    max: 0,
  });

  const pages: string[] = [];
  const pageTexts = pdfData.text.split(/\f/);
  
  for (const pageText of pageTexts) {
    if (pageText.trim()) {
      pages.push(pageText.trim());
    }
  }

  const metadata = {
    title: pdfData.info?.Title,
    author: pdfData.info?.Author,
    subject: pdfData.info?.Subject,
    creator: pdfData.info?.Creator,
    producer: pdfData.info?.Producer,
    pageCount: pdfData.numpages,
    creationDate: pdfData.info?.CreationDate 
      ? parsePdfDate(pdfData.info.CreationDate) 
      : undefined,
    modificationDate: pdfData.info?.ModDate 
      ? parsePdfDate(pdfData.info.ModDate) 
      : undefined,
  };

  logger.info("PDF ingested", { 
    filePath, 
    pageCount: metadata.pageCount,
    textLength: pdfData.text.length 
  });

  return {
    text: pdfData.text.trim(),
    metadata,
    pages,
  };
}

function parsePdfDate(dateStr: string): Date | undefined {
  const match = dateStr.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return undefined;
  
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
}

export function pdfToMarkdown(result: PdfIngestionResult): string {
  const lines: string[] = [];
  
  if (result.metadata.title) {
    lines.push(`# ${result.metadata.title}`);
    lines.push("");
  }
  
  if (result.metadata.author) {
    lines.push(`**Author:** ${result.metadata.author}`);
  }
  if (result.metadata.subject) {
    lines.push(`**Subject:** ${result.metadata.subject}`);
  }
  if (result.metadata.pageCount) {
    lines.push(`**Pages:** ${result.metadata.pageCount}`);
  }
  lines.push("");
  
  if (result.pages.length > 1) {
    for (let i = 0; i < result.pages.length; i++) {
      lines.push(`## Page ${i + 1}`);
      lines.push("");
      lines.push(result.pages[i]);
      lines.push("");
    }
  } else {
    lines.push(result.text);
  }
  
  return lines.join("\n").trim();
}