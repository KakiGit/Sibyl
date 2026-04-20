export { getDatabase, createDatabase, closeDatabase, setDatabase, migrateDatabase, schema } from "./database.js";
export { rawResources, wikiPages, wikiLinks, processingLog, embeddingsCache } from "./schema.js";
export { storage, RawResourceStorage, WikiPageStorage, WikiLinkStorage, ProcessingLogStorage, EmbeddingCacheStorage } from "./storage/index.js";
export { WikiFileManager, wikiFileManager } from "./wiki/index.js";
export type { WikiPageContent, IndexEntry, LogEntry } from "./wiki/index.js";
export { createServer, startServer, stopServer } from "./server.js";
export type { ServerOptions } from "./server.js";
export { createMcpServer, startMcpServer } from "./mcp/index.js";
export { registerMcpTools } from "./mcp/tools.js";
export { LlmProvider, getLlmProvider, loadLlmConfig, resetLlmProvider } from "./llm/index.js";
export type { LlmConfig, LlmResponse } from "./llm/index.js";
export { synthesizeAnswer, queryWiki } from "./processors/query.js";
export type { SynthesizeOptions, SynthesizeResult, Citation, QueryOptions, QueryResult } from "./processors/query.js";
export { lintWiki, findOrphanPages, findStalePages, findMissingReferences, findPotentialConflicts, getLintHistory } from "./processors/lint.js";
export type { LintIssue, LintReport, LintOptions } from "./processors/lint.js";
export { embeddingsService, getOrGenerateEmbedding, semanticSearch, initializeEmbedder, getEmbeddingDimension, getDefaultModel, resetEmbedder } from "./embeddings/index.js";
export type { CachedEmbedding, SimilarityResult } from "./embeddings/index.js";
export { ingestWithLlm, generateWikiContent, generateWikiPageWithLlm } from "./processors/index.js";
export type { LlmGeneratedContent, LlmContentOptions } from "./processors/index.js";
export { wikiSearchStorage, WikiSearchStorage } from "./search/index.js";
export { registerSearchRoutes } from "./routes/search.js";
export { authenticate, optionalAuth, requireAuth, verifyApiKey, verifyJwt, generateToken, refreshToken, getAuthMiddleware } from "./auth/index.js";
export type { AuthUser, JwtPayload, AuthMiddlewareOptions } from "./auth/index.js";
export {
  websocketBroadcaster,
  broadcastWikiPageCreated,
  broadcastWikiPageUpdated,
  broadcastWikiPageDeleted,
  broadcastRawResourceCreated,
  broadcastProcessingLogCreated,
  broadcastIngestCompleted,
  broadcastLintCompleted,
  broadcastQueryCompleted,
  registerWebSocketRoutes,
  getWebSocketStats,
} from "./websocket/index.js";
export type { WebSocketEvent, WebSocketClient } from "./websocket/index.js";