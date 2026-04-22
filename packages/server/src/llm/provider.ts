import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { logger } from "@sibyl/shared";
import { Cache } from "../cache/index.js";
import { llmWorkQueue } from "./work-queue.js";

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
}

export interface LlmResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const DEFAULT_MAX_TOKENS = 4096;
const SECRETS_FILE = ".llm_secrets";
const llmRequestCache = new Cache<string>({ ttl: 300000, maxEntries: 100 });

function expandHomePath(path: string): string {
  if (path.startsWith("~")) {
    return resolve(path.replace("~", process.env.HOME || ""));
  }
  return path;
}

function getSecretsPath(): string {
  return expandHomePath(join(process.env.HOME || "", SECRETS_FILE));
}

function parseSecretsFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const content = readFileSync(path, "utf-8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join("=").trim();
    }
  }

  return result;
}

export function loadLlmConfig(): LlmConfig | null {
  const secretsPath = getSecretsPath();
  const secrets = parseSecretsFile(secretsPath);

  const baseUrl = secrets.base_url || process.env.LLM_BASE_URL;
  const apiKey = secrets.api_key || process.env.LLM_API_KEY;
  const model = secrets.model || process.env.LLM_MODEL;

  if (!baseUrl || !apiKey || !model) {
    logger.warn("LLM configuration not found. Check ~/.llm_secrets or environment variables.");
    return null;
  }

  return {
    baseUrl,
    apiKey,
    model,
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}

export class LlmProvider {
  private config: LlmConfig;
  name: string;

  constructor(config: LlmConfig) {
    this.config = config;
    this.name = "openai-compatible";
  }

  async call(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
    const cacheKey = `${systemPrompt}:${userPrompt}:${this.config.model}`;
    const cached = llmRequestCache.get(cacheKey);
    
    if (cached) {
      logger.debug("Using cached LLM response");
      return {
        content: cached,
        model: this.config.model,
        usage: undefined,
      };
    }
    
    const description = userPrompt.slice(0, 50) + (userPrompt.length > 50 ? "..." : "");
    
    return llmWorkQueue.enqueue("llm_call", description, async () => {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokens || DEFAULT_MAX_TOKENS,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LLM API error (${response.status}): ${text}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const choices = data.choices as
        | Array<{ message: { content: string } }>
        | undefined;
      const content = choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(
          `LLM returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
        );
      }

      const usage = data.usage as
        | { prompt_tokens: number; completion_tokens: number; total_tokens: number }
        | undefined;

      logger.debug("LLM call completed", {
        model: this.config.model,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
      });

      llmRequestCache.set(cacheKey, content);
      
      return {
        content,
        model: this.config.model,
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : undefined,
      };
    });
  }

  async synthesize(prompt: string): Promise<string> {
    const response = await this.call("", prompt);
    return response.content;
  }

  getConfig(): LlmConfig {
    return this.config;
  }
}

let cachedProvider: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider | null {
  if (cachedProvider) {
    return cachedProvider;
  }

  const config = loadLlmConfig();
  if (!config) {
    return null;
  }

  cachedProvider = new LlmProvider(config);
  logger.info("LLM provider initialized", { model: config.model, baseUrl: config.baseUrl });

  return cachedProvider;
}

export function resetLlmProvider(): void {
  cachedProvider = null;
}