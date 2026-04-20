import { storage } from "../storage/index.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";
import { getLlmProvider, type LlmProvider } from "../llm/index.js";

export interface MarpOptions {
  pageIds?: string[];
  pageSlugs?: string[];
  type?: "entity" | "concept" | "source" | "summary";
  tags?: string[];
  query?: string;
  title?: string;
  theme?: "default" | "gaia" | "uncover";
  paginate?: boolean;
  useLlm?: boolean;
  maxPages?: number;
  llmProvider?: LlmProvider | null | undefined;
  skipDefaultLlm?: boolean;
  wikiFileManager?: WikiFileManager;
}

export interface MarpSlide {
  title: string;
  content: string;
  notes?: string;
}

export interface MarpResult {
  marpContent: string;
  slides: MarpSlide[];
  sourcePages: Array<{
    id: string;
    slug: string;
    title: string;
    type: string;
  }>;
  generatedAt: number;
  title: string;
  theme: string;
}

const MARP_THEME_DIRECTIVES: Record<string, string> = {
  default: `---
marp: true
theme: default
paginate: true
---`,
  gaia: `---
marp: true
theme: gaia
paginate: true
---`,
  uncover: `---
marp: true
theme: uncover
paginate: true
---`,
};

export function splitContentIntoSlides(content: string, title: string): MarpSlide[] {
  const slides: MarpSlide[] = [];
  const lines = content.split("\n");
  let currentSlide: MarpSlide = { title, content: "" };
  let isFirstSlide = true;

  for (const line of lines) {
    if (line.startsWith("# ") && !isFirstSlide) {
      slides.push(currentSlide);
      currentSlide = { title: line.replace("# ", ""), content: "" };
    } else if (line.startsWith("## ") && !isFirstSlide && currentSlide.content.trim() === "") {
      currentSlide.title = line.replace("## ", "");
    } else {
      if (isFirstSlide && line.startsWith("# ")) {
        currentSlide.title = line.replace("# ", "");
        isFirstSlide = false;
        continue;
      }
      currentSlide.content += line + "\n";
      isFirstSlide = false;
    }
  }

  if (currentSlide.content.trim() || currentSlide.title !== title) {
    slides.push(currentSlide);
  }

  return slides.filter(s => s.title || s.content.trim());
}

export function convertWikiToMarp(
  slides: MarpSlide[],
  theme: string,
  paginate: boolean,
  deckTitle: string,
): string {
  const themeDirective = MARP_THEME_DIRECTIVES[theme] || MARP_THEME_DIRECTIVES.default;
  let marpContent = themeDirective.replace("paginate: true", `paginate: ${paginate}`);
  marpContent += `\n\n# ${deckTitle}\n\n`;

  for (const slide of slides) {
    marpContent += `---\n\n`;
    if (slide.title) {
      marpContent += `# ${slide.title}\n\n`;
    }
    marpContent += slide.content.trim() + "\n\n";
    if (slide.notes) {
      marpContent += `<!-- _notes: ${slide.notes} -->\n\n`;
    }
  }

  return marpContent;
}

async function generateSlidesWithLlm(
  pages: Array<{
    id: string;
    slug: string;
    title: string;
    type: "entity" | "concept" | "source" | "summary";
    summary?: string;
    content?: string;
  }>,
  deckTitle: string,
  llmProvider: LlmProvider,
  wikiManager: WikiFileManager,
): Promise<MarpSlide[]> {
  const pageSummaries = pages.map((p) => {
    const wikiContent = wikiManager.readPage(p.type, p.slug);
    return `Title: ${p.title}\nType: ${p.type}\nSummary: ${p.summary || ""}\nContent: ${(wikiContent?.content || p.content || "").slice(0, 500)}...`;
  });

  const systemPrompt = `You are a presentation designer. Create a Marp slide deck from the provided wiki content.
Format your response as Marp markdown with slide separators (---) and proper headings.
Each slide should have a clear title (# heading) and concise bullet points.
Use <!-- _class: lead --> for important title slides.
Keep slides visually clean with 3-5 bullet points per slide.`;

  const userPrompt = `Create a Marp slide deck titled "${deckTitle}" from the following wiki pages:

${pageSummaries.join("\n\n---\n\n")}

Generate slide content in Marp format. Start with a title slide, then create slides for each key topic.`;

  const response = await llmProvider.call(systemPrompt, userPrompt);
  const content = response.content;

  const slides: MarpSlide[] = [];
  const slideParts = content.split(/^---\s*$/m).filter((s) => s.trim());

  for (const part of slideParts) {
    const lines = part.trim().split("\n");
    let title = "";
    let slideContent = "";
    let notes = "";

    for (const line of lines) {
      if (line.startsWith("# ")) {
        if (!title) {
          title = line.replace("# ", "");
        } else {
          slideContent += line + "\n";
        }
      } else if (line.includes("_notes:")) {
        const match = line.match(/<!--\s*_notes:\s*(.+?)\s*-->/);
        if (match) notes = match[1];
      } else {
        slideContent += line + "\n";
      }
    }

    slides.push({ title, content: slideContent.trim(), notes });
  }

  return slides.filter((s) => s.title || s.content.trim());
}

export async function generateMarpSlides(options: MarpOptions): Promise<MarpResult> {
  const {
    pageIds,
    pageSlugs,
    type,
    tags,
    query,
    title,
    theme = "default",
    paginate = true,
    useLlm = false,
    maxPages = 10,
    llmProvider,
    skipDefaultLlm = false,
    wikiFileManager: customWikiFileManager,
  } = options;

  const wikiManager = customWikiFileManager || wikiFileManager;

  let pages: Array<{
    id: string;
    slug: string;
    title: string;
    type: "entity" | "concept" | "source" | "summary";
    summary?: string;
  }> = [];

  if (pageIds && pageIds.length > 0) {
    for (const id of pageIds) {
      const page = await storage.wikiPages.findById(id);
      if (page) pages.push(page);
    }
  } else if (pageSlugs && pageSlugs.length > 0) {
    for (const slug of pageSlugs) {
      const page = await storage.wikiPages.findBySlug(slug);
      if (page) pages.push(page);
    }
  } else if (query) {
    pages = await storage.wikiPages.findAll({
      search: query,
      type,
      tags,
      limit: maxPages,
    });
  } else {
    pages = await storage.wikiPages.findAll({
      type,
      tags,
      limit: maxPages,
    });
  }

  if (pages.length === 0) {
    throw new Error("No wiki pages found for slide generation");
  }

  const deckTitle = title || `Wiki Presentation - ${new Date().toLocaleDateString()}`;
  let slides: MarpSlide[] = [];

  if (useLlm) {
    let provider: LlmProvider | null = null;
    if (llmProvider !== undefined && llmProvider !== null) {
      provider = llmProvider;
    } else if (!skipDefaultLlm) {
      provider = getLlmProvider();
    }
    if (!provider) {
      throw new Error("LLM provider not configured. Set ~/.llm_secrets or environment variables.");
    }
    slides = await generateSlidesWithLlm(pages, deckTitle, provider, wikiManager);
  } else {
    for (const page of pages) {
      const wikiContent = wikiManager.readPage(page.type, page.slug);
      if (wikiContent?.content) {
        const pageSlides = splitContentIntoSlides(wikiContent.content, page.title);
        slides.push(...pageSlides);
      }
    }
  }

  const marpContent = convertWikiToMarp(slides, theme, paginate, deckTitle);

  return {
    marpContent,
    slides,
    sourcePages: pages.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      type: p.type,
    })),
    generatedAt: Date.now(),
    title: deckTitle,
    theme,
  };
}

export async function generateMarpFromPageIds(pageIds: string[], options?: MarpOptions): Promise<MarpResult> {
  return generateMarpSlides({ ...options, pageIds });
}

export async function generateMarpFromSlugs(slugs: string[], options?: MarpOptions): Promise<MarpResult> {
  return generateMarpSlides({ ...options, pageSlugs: slugs });
}

export async function generateMarpFromQuery(query: string, options?: MarpOptions): Promise<MarpResult> {
  return generateMarpSlides({ ...options, query });
}

export async function generateMarpFromType(type: "entity" | "concept" | "source" | "summary", options?: MarpOptions): Promise<MarpResult> {
  return generateMarpSlides({ ...options, type });
}