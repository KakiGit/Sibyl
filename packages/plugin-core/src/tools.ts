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
  boolean: () => { default: (v: boolean) => unknown };
}

export function createTools(options: ApiOptions): Record<string, ToolDefinition> {
  return {
    memory_recall: {
      description: "Search Wiki Pages and synthesize an answer using LLM. Uses hybrid search (keyword + semantic) by default for better relevance.",
      args: {
        query: { type: "string", description: "Search query" },
        useSemantic: { type: "boolean", optional: true, default: true, description: "Use hybrid search (FTS5 + semantic embeddings). Set false for pure keyword matching." },
      },
      async execute(args: { query: string; useSemantic?: boolean }) {
        return synthesizeAnswer(options, args.query, 5, args.useSemantic ?? true);
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
      description: "Query Wiki Pages with a question. Uses hybrid search (keyword + semantic) by default for better relevance.",
      args: {
        question: { type: "string", description: "Question to ask" },
        type: { type: "string", optional: true, enum: ["entity", "concept", "source", "summary"] },
        limit: { type: "number", optional: true, default: 10 },
        useSemantic: { type: "boolean", optional: true, default: true, description: "Use hybrid search (FTS5 + semantic embeddings). Set false for pure keyword matching." },
      },
      async execute(args: { question: string; type?: string; limit?: number; useSemantic?: boolean }) {
        return queryWikiPages(options, args.question, args.type, args.limit || 10, args.useSemantic ?? true);
      },
    },
  };
}

export function getToolDescriptions(): string {
  return `The plugin provides the following tools:
  - memory_recall: Search Wiki Pages and synthesize answers (hybrid search by default)
  - memory_list: List all Wiki Pages
  - memory_query: Query Wiki Pages with questions (hybrid search by default)
  
Search modes:
  - useSemantic=true (default): Hybrid search combining FTS5 keyword matching + semantic vector embeddings
  - useSemantic=false: Pure keyword matching via SQL LIKE`;
}