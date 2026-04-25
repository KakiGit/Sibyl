import type { ApiOptions } from "./types.js";

export async function fetchSibylApi(
  options: ApiOptions,
  path: string,
  requestOptions?: { method?: string; body?: unknown }
): Promise<unknown> {
  const url = `${options.serverUrl}${path}`;
  const headers: Record<string, string> = {};
  if (requestOptions?.body) headers["Content-Type"] = "application/json";
  if (options.apiKey) headers["x-api-key"] = options.apiKey;
  
  const response = await fetch(url, {
    method: requestOptions?.method || "GET",
    headers,
    body: requestOptions?.body ? JSON.stringify(requestOptions.body) : undefined,
  });
  
  if (!response.ok) {
    throw new Error(`Sibyl API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

export async function createRawResource(
  options: ApiOptions,
  data: {
    type: string;
    filename: string;
    contentPath: string;
    metadata?: Record<string, unknown>;
    content?: string;
  }
): Promise<{ id: string } | null> {
  try {
    const result = await fetchSibylApi(options, "/api/raw-resources", {
      method: "POST",
      body: data,
    });
    return (result as { id?: string }).id ? { id: (result as { id: string }).id } : null;
  } catch {
    return null;
  }
}

export async function updateRawResourceContent(
  options: ApiOptions,
  id: string,
  content: string
): Promise<boolean> {
  try {
    await fetchSibylApi(options, `/api/raw-resources/${id}/content`, {
      method: "PUT",
      body: { content },
    });
    return true;
  } catch {
    return false;
  }
}

export async function updateRawResourceMetadata(
  options: ApiOptions,
  id: string,
  metadata: Record<string, unknown>
): Promise<boolean> {
  try {
    await fetchSibylApi(options, `/api/raw-resources/${id}`, {
      method: "PUT",
      body: { metadata },
    });
    return true;
  } catch {
    return false;
  }
}

export async function getRawResourceBySession(
  options: ApiOptions,
  stableSessionName: string
): Promise<{ id: string } | null> {
  try {
    const result = await fetchSibylApi(
      options,
      `/api/raw-resources/session/${encodeURIComponent(stableSessionName)}`
    );
    const existing = result as { data?: { id?: string } };
    return existing.data?.id ? { id: existing.data.id } : null;
  } catch {
    return null;
  }
}

export async function triggerLlmIngestion(
  options: ApiOptions,
  rawResourceId: string,
  maxRetries: number = 3
): Promise<boolean> {
  const baseDelay = 1000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fetchSibylApi(options, `/api/ingest/llm/${rawResourceId}`, { method: "POST" });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Sibyl] Ingestion attempt ${attempt}/${maxRetries} failed for raw resource ${rawResourceId}: ${errorMessage}`);
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`[Sibyl] All ${maxRetries} ingestion attempts failed for raw resource ${rawResourceId}`);
  return false;
}

export async function synthesizeAnswer(
  options: ApiOptions,
  query: string,
  maxPages: number = 5
): Promise<string> {
  const result = await fetchSibylApi(options, "/api/synthesize", {
    method: "POST",
    body: { query, maxPages },
  });
  const data = result as { data?: { answer?: string } };
  return data.data?.answer || "Unable to synthesize answer.";
}

export async function listWikiPages(
  options: ApiOptions,
  type?: string
): Promise<string> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  const result = await fetchSibylApi(options, `/api/wiki-pages?${params.toString()}`);
  const data = (result as { data?: unknown[] }).data || [];
  if (data.length === 0) return "No Wiki Pages found in the knowledge base.";
  const pages = data as Array<{ title: string; type: string; slug: string }>;
  return `Found ${pages.length} Wiki Pages:\n${pages.map(p => `- ${p.title} (${p.type}) [${p.slug}]`).join("\n")}`;
}

export async function queryWikiPages(
  options: ApiOptions,
  question: string,
  type?: string,
  limit: number = 10
): Promise<string> {
  const params = new URLSearchParams();
  params.set("search", question);
  params.set("limit", String(limit));
  if (type) params.set("type", type);
  const result = await fetchSibylApi(options, `/api/wiki-pages?${params.toString()}`);
  const data = (result as { data?: unknown[] }).data || [];
  if (data.length === 0) return "No relevant Wiki Pages found in the knowledge base.";
  const pages = data as Array<{ title: string; type: string; summary?: string; slug: string; tags?: string[] }>;
  return `Found ${pages.length} relevant Wiki Pages:\n\n${pages.map(p => `${p.title} (${p.type}): ${p.summary || "No summary"}${p.tags?.length ? ` [tags: ${p.tags.join(", ")}]` : ""}`).join("\n\n")}`;
}