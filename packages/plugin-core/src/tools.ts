import type { ApiOptions } from "./types.js";
import { synthesizeAnswer, listWikiPages, queryWikiPages } from "./api.js";

export interface ToolDefinition {
  description: string;
  args: Record<string, unknown>;
  execute: (args: any) => Promise<string>;
}

export interface ToolSchema {
  string: () => { describe: (desc: string) => unknown };
  enum: (values: string[]) => { optional: () => unknown };
  number: () => { int: () => { positive: () => { max: (n: number) => { default: (n: number) => unknown } } } };
}

export function createTools(options: ApiOptions): Record<string, ToolDefinition> {
  return {
    memory_recall: {
      description: "Search Wiki Pages and synthesize an answer using LLM.",
      args: {
        query: { type: "string", description: "Search query" },
      },
      async execute(args: { query: string }) {
        return synthesizeAnswer(options, args.query);
      },
    },
    memory_list: {
      description: "List all Wiki Pages in the Sibyl knowledge base.",
      args: {
        type: { type: "string", optional: true, enum: ["entity", "concept", "source", "summary"] },
      },
      async execute(args: { type?: string }) {
        return listWikiPages(options, args.type);
      },
    },
    memory_query: {
      description: "Query Wiki Pages with a question.",
      args: {
        question: { type: "string", description: "Question to ask" },
        type: { type: "string", optional: true, enum: ["entity", "concept", "source", "summary"] },
        limit: { type: "number", optional: true, default: 10 },
      },
      async execute(args: { question: string; type?: string; limit?: number }) {
        return queryWikiPages(options, args.question, args.type, args.limit || 10);
      },
    },
  };
}

export function getToolDescriptions(): string {
  return `The plugin provides the following tools:
  - memory_recall: Search Wiki Pages and synthesize answers
  - memory_list: List all Wiki Pages
  - memory_query: Query Wiki Pages with questions`;
}