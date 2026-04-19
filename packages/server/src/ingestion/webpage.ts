import TurndownService from "turndown";
import * as cheerio from "cheerio";
import { logger } from "@sibyl/shared";

export interface WebpageIngestionResult {
  title: string;
  content: string;
  markdown: string;
  metadata: {
    url: string;
    description?: string;
    author?: string;
    publishedDate?: string;
    keywords?: string[];
    favicon?: string;
    images: string[];
    links: string[];
  };
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndownService.addRule("removeScripts", {
  filter: ["script", "style", "noscript", "iframe", "nav", "footer", "header"],
  replacement: () => "",
});

turndownService.addRule("removeComments", {
  filter: (node: unknown) => {
    const el = node as { type?: string };
    return el.type === "comment";
  },
  replacement: () => "",
});

turndownService.addRule("preserveLinks", {
  filter: "a",
  replacement: (content: string, node: unknown) => {
    const el = node as { getAttribute?: (name: string) => string | null };
    const href = el.getAttribute?.("href") || "";
    if (href.startsWith("http") || href.startsWith("/")) {
      return `[${content}](${href})`;
    }
    return content;
  },
});

turndownService.addRule("preserveImages", {
  filter: "img",
  replacement: (_content: string, node: unknown) => {
    const el = node as { getAttribute?: (name: string) => string | null };
    const src = el.getAttribute?.("src") || "";
    const alt = el.getAttribute?.("alt") || "";
    if (src) {
      return `![${alt}](${src})`;
    }
    return "";
  },
});

export async function fetchWebpage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SibylMemoryBot/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch webpage: ${response.status} ${response.statusText}`);
  }
  
  return response.text();
}

export async function ingestWebpage(url: string, html?: string): Promise<WebpageIngestionResult> {
  const htmlContent = html || await fetchWebpage(url);
  const $ = cheerio.load(htmlContent);
  
  $("script, style, noscript, iframe, nav, footer, header").remove();
  
  const title = $("title").text().trim() || $("h1").first().text().trim() || "Untitled";
  
  const description = $('meta[name="description"]').attr("content") || 
    $('meta[property="og:description"]').attr("content");
  
  const author = $('meta[name="author"]').attr("content") || 
    $('meta[property="article:author"]').attr("content");
  
  const publishedDate = $('meta[name="date"]').attr("content") || 
    $('meta[property="article:published_time"]').attr("content") ||
    $("time").attr("datetime");
  
  const keywords = $('meta[name="keywords"]').attr("content")?.split(",").map(k => k.trim());
  
  const favicon = $('link[rel="icon"]').attr("href") || 
    $('link[rel="shortcut icon"]').attr("href");
  
  const images: string[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (src && !src.startsWith("data:") && !src.startsWith("javascript:")) {
      images.push(resolveUrl(src, url));
    }
  });
  
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && !href.startsWith("javascript:") && !href.startsWith("#") && !href.startsWith("mailto:")) {
      const resolved = resolveUrl(href, url);
      if (resolved.startsWith("http")) {
        links.push(resolved);
      }
    }
  });
  
  const mainContent = $("main, article, .content, .post, .article, #content").first();
  const contentElement = mainContent.length > 0 ? mainContent : $("body");
  
  const contentHtml = contentElement.html() || "";
  const markdown = turndownService.turndown(contentHtml);
  
  const metadata = {
    url,
    description,
    author,
    publishedDate,
    keywords,
    favicon: favicon ? resolveUrl(favicon, url) : undefined,
    images,
    links,
  };
  
  logger.info("Webpage ingested", { 
    url, 
    title, 
    contentLength: markdown.length,
    imageCount: images.length,
    linkCount: links.length 
  });
  
  return {
    title,
    content: markdown,
    markdown,
    metadata,
  };
}

function resolveUrl(href: string, baseUrl: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  
  try {
    const base = new URL(baseUrl);
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export function webpageToMarkdown(result: WebpageIngestionResult): string {
  const lines: string[] = [];
  
  lines.push(`# ${result.title}`);
  lines.push("");
  
  lines.push(`**URL:** ${result.metadata.url}`);
  
  if (result.metadata.author) {
    lines.push(`**Author:** ${result.metadata.author}`);
  }
  if (result.metadata.publishedDate) {
    lines.push(`**Published:** ${result.metadata.publishedDate}`);
  }
  if (result.metadata.description) {
    lines.push(`**Description:** ${result.metadata.description}`);
  }
  
  lines.push("");
  lines.push("---");
  lines.push("");
  
  lines.push(result.markdown);
  
  return lines.join("\n").trim();
}