import { WikiFileManager } from "../wiki/index.js";
import { getLlmProvider, type LlmProvider } from "../llm/index.js";
import { storage } from "../storage/index.js";
import { logger } from "@sibyl/shared";
import type { WikiPage, WikiPageType } from "@sibyl/sdk";

export interface LlmContentOptions {
  content: string;
  filename?: string;
  type?: WikiPageType;
  wikiFileManager?: WikiFileManager;
  llmProvider?: LlmProvider | null;
  skipLlm?: boolean;
  existingPages?: WikiPage[];
}

export interface LlmGeneratedContent {
  title: string;
  summary: string;
  content: string;
  tags: string[];
  type: WikiPageType;
  crossReferences: string[];
}

const CONTENT_GENERATION_SYSTEM_PROMPT = `You are a knowledge organization assistant. Your task is to transform raw content into a well-structured wiki page.

Instructions:
1. Generate a clear, concise title that reflects the main topic
2. Write a summary (1-2 sentences) that captures the key essence
3. Transform the raw content into well-structured wiki markdown:
   - Use proper headings (# ## ###)
   - Use bullet points for lists
   - Use [[wiki-link]] format for cross-references to concepts/entities
   - Include key facts and details
4. Extract relevant tags (3-7 keywords) for categorization
5. Identify concepts or entities that could be cross-referenced (use their slug format)
6. Determine the most appropriate page type:
   - "entity" for specific people, places, organizations, things
   - "concept" for ideas, topics, theories, patterns
   - "source" for documents, papers, articles
   - "summary" for synthesized overviews

Format your response as JSON:
{
  "title": "...",
  "summary": "...",
  "content": "... (markdown with wiki links)",
  "tags": ["tag1", "tag2"],
  "type": "concept|entity|source|summary",
  "crossReferences": ["existing-slug-1", "existing-slug-2"]
}

Only return the JSON object, no additional text.`;

function buildExistingPagesContext(pages: WikiPage[]): string {
  if (pages.length === 0) {
    return "No existing wiki pages available for cross-referencing.";
  }

  const pageDescriptions = pages.map(p => 
    `- [[${p.slug}]] (${p.type}): ${p.title}${p.summary ? ` - ${p.summary.slice(0, 100)}` : ""}`
  ).join("\n");

  return `Existing wiki pages you can cross-reference:\n${pageDescriptions}`;
}

export async function generateWikiContent(options: LlmContentOptions): Promise<LlmGeneratedContent> {
  if (options.skipLlm) {
    return generateBasicContent(options);
  }

  const llmProvider = options.llmProvider ?? getLlmProvider();

  if (!llmProvider) {
    logger.warn("No LLM provider available, using basic content extraction");
    return generateBasicContent(options);
  }

  const existingPages = options.existingPages || 
    await storage.wikiPages.findAll({ limit: 50 });

  const existingPagesContext = buildExistingPagesContext(existingPages);

  const userPrompt = `Raw content to transform:
${options.content}

Filename hint: ${options.filename || "unknown"}
${options.type ? `Suggested type: ${options.type}` : ""}

${existingPagesContext}

Transform this content into a wiki page. Return only the JSON object.`;

  try {
    const response = await llmProvider.call(CONTENT_GENERATION_SYSTEM_PROMPT, userPrompt);
    
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("LLM response doesn't contain valid JSON, using basic extraction");
      return generateBasicContent(options);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const result: LlmGeneratedContent = {
      title: (parsed.title as string) || extractTitle(options.content, options.filename),
      summary: (parsed.summary as string) || generateBasicSummary(options.content),
      content: (parsed.content as string) || options.content,
      tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : extractTags(options.content),
      type: (parsed.type as WikiPageType) || options.type || inferType(options.content, options.filename),
      crossReferences: Array.isArray(parsed.crossReferences) ? (parsed.crossReferences as string[]) : [],
    };

    logger.info("Generated wiki content with LLM", {
      title: result.title,
      type: result.type,
      tags: result.tags.length,
      crossReferences: result.crossReferences.length,
      model: response.model,
    });

    return result;
  } catch (error) {
    logger.error("LLM content generation failed", { error: (error as Error).message });
    return generateBasicContent(options);
  }
}

function generateBasicContent(options: LlmContentOptions): LlmGeneratedContent {
  const title = extractTitle(options.content, options.filename);
  const summary = generateBasicSummary(options.content);
  const tags = extractTags(options.content);
  const type = options.type || inferType(options.content, options.filename);

  const content = formatBasicContent(options.content, title);

  return {
    title,
    summary,
    content,
    tags,
    type,
    crossReferences: [],
  };
}

function extractTitle(content: string, filename?: string): string {
  const firstLine = content.split("\n")[0].trim();
  if (firstLine.length > 5 && firstLine.length < 100 && !firstLine.startsWith("#")) {
    return firstLine;
  }

  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  if (filename) {
    return filename
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return "Untitled Page";
}

function generateBasicSummary(content: string): string {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 15);
  if (sentences.length === 0) {
    return content.slice(0, 150).trim() + "...";
  }

  const firstSentence = sentences[0].trim();
  if (firstSentence.length <= 200) {
    return firstSentence;
  }

  return firstSentence.slice(0, 200).trim() + "...";
}

function extractTags(content: string): string[] {
  const words = content.toLowerCase().split(/\s+/);
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "to", "of",
    "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "above", "below", "between", "under",
    "again", "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
    "very", "just", "and", "but", "if", "or", "because", "until", "while",
    "this", "that", "these", "those", "it", "its", "they", "them", "their",
    "we", "our", "you", "your", "he", "him", "his", "she", "her", "i", "me",
    "my", "what", "which", "who", "whom"
  ]);

  const wordCounts: Record<string, number> = {};
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z]/g, "");
    if (cleanWord.length > 3 && !stopWords.has(cleanWord)) {
      wordCounts[cleanWord] = (wordCounts[cleanWord] || 0) + 1;
    }
  }

  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function inferType(content: string, filename?: string): WikiPageType {
  if (filename) {
    if (filename.includes("paper") || filename.includes("article") || 
        filename.endsWith(".pdf") || filename.includes("doc")) {
      return "source";
    }
    if (filename.includes("overview") || filename.includes("intro") ||
        filename.includes("guide") || filename.includes("tutorial")) {
      return "concept";
    }
  }

  if (content.match(/\b(person|people|company|organization|team|project|product|tool|library)\b/i)) {
    return "entity";
  }

  if (content.match(/\b(concept|idea|theory|pattern|approach|method|principle)\b/i)) {
    return "concept";
  }

  return "concept";
}

function formatBasicContent(content: string, title: string): string {
  return `# ${title}\n\n${content.trim()}`;
}

export async function generateWikiPageWithLlm(
  rawContent: string,
  options?: {
    filename?: string;
    type?: WikiPageType;
    wikiFileManager?: WikiFileManager;
    llmProvider?: LlmProvider | null;
  }
): Promise<LlmGeneratedContent> {
  return generateWikiContent({
    content: rawContent,
    ...options,
  });
}

export const llmContentProcessor = {
  generateWikiContent,
  generateWikiPageWithLlm,
};