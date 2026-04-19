import { describe, it, expect, mock } from "bun:test";
import { ingestWebpage, webpageToMarkdown, fetchWebpage, type WebpageIngestionResult } from "./webpage.js";

describe("Webpage Ingestion", () => {
  it("should parse HTML and extract metadata", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page Title</title>
          <meta name="description" content="Test description">
          <meta name="author" content="Test Author">
          <meta name="keywords" content="test, keywords, sample">
        </head>
        <body>
          <main>
            <h1>Main Heading</h1>
            <p>This is the main content of the page.</p>
            <a href="https://example.com/link1">Link 1</a>
            <img src="https://example.com/image1.jpg" alt="Test Image">
          </main>
        </body>
      </html>
    `;
    
    const result = await ingestWebpage("https://example.com/test", html);
    
    expect(result.title).toBe("Test Page Title");
    expect(result.metadata.description).toBe("Test description");
    expect(result.metadata.author).toBe("Test Author");
    expect(result.metadata.keywords).toEqual(["test", "keywords", "sample"]);
    expect(result.metadata.images).toContain("https://example.com/image1.jpg");
    expect(result.metadata.links).toContain("https://example.com/link1");
    expect(result.markdown).toContain("Main Heading");
  });

  it("should convert HTML content to markdown", async () => {
    const html = `
      <html>
        <body>
          <article>
            <h1>Article Title</h1>
            <h2>Section 1</h2>
            <p>Paragraph text with <strong>bold</strong> and <em>italic</em>.</p>
            <ul>
              <li>List item 1</li>
              <li>List item 2</li>
            </ul>
            <code>inline code</code>
          </article>
        </body>
      </html>
    `;
    
    const result = await ingestWebpage("https://example.com/article", html);
    
    expect(result.markdown).toContain("# Article Title");
    expect(result.markdown).toContain("## Section 1");
    expect(result.markdown).toContain("**bold**");
    expect(result.markdown).toContain("_italic_");
    expect(result.markdown).toContain("List item 1");
  });

  it("should remove script and style elements", async () => {
    const html = `
      <html>
        <head>
          <style>body { color: red; }</style>
          <script>console.log('test');</script>
        </head>
        <body>
          <main>
            <p>Visible content</p>
          </main>
          <script>alert('hidden');</script>
        </body>
      </html>
    `;
    
    const result = await ingestWebpage("https://example.com/clean", html);
    
    expect(result.markdown).toContain("Visible content");
    expect(result.markdown).not.toContain("console.log");
    expect(result.markdown).not.toContain("alert");
    expect(result.markdown).not.toContain("color: red");
  });

  it("should generate markdown with metadata header", () => {
    const mockResult: WebpageIngestionResult = {
      title: "Test Article",
      content: "Article content here.",
      markdown: "Article content here.",
      metadata: {
        url: "https://example.com/article",
        description: "A test article",
        author: "John Doe",
        publishedDate: "2024-01-15",
        images: [],
        links: [],
      },
    };
    
    const markdown = webpageToMarkdown(mockResult);
    
    expect(markdown).toContain("# Test Article");
    expect(markdown).toContain("**URL:** https://example.com/article");
    expect(markdown).toContain("**Author:** John Doe");
    expect(markdown).toContain("**Published:** 2024-01-15");
    expect(markdown).toContain("**Description:** A test article");
  });

  it("should resolve relative URLs", async () => {
    const html = `
      <html>
        <body>
          <main>
            <a href="/relative-link">Relative Link</a>
            <img src="/images/photo.jpg" alt="Photo">
          </main>
        </body>
      </html>
    `;
    
    const result = await ingestWebpage("https://example.com/page", html);
    
    expect(result.metadata.links).toContain("https://example.com/relative-link");
    expect(result.metadata.images).toContain("https://example.com/images/photo.jpg");
  });

  it("should extract title from h1 when no title tag", async () => {
    const html = `
      <html>
        <body>
          <h1>Heading as Title</h1>
          <p>Content</p>
        </body>
      </html>
    `;
    
    const result = await ingestWebpage("https://example.com/no-title", html);
    
    expect(result.title).toBe("Heading as Title");
  });
});