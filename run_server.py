#!/usr/bin/env python
"""Run IPC server in foreground for testing."""

import asyncio
import logging
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

from sibyl_memory import MemorySystem, SimpleMemoryStore
from sibyl_memory.llm.config import LLMConfig
from sibyl_memory.graphiti_client import GraphitiClient
from sibyl_memory.embedder.local import LocalEmbedder
from sibyl_memory.embedder.config import EmbedderConfig
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, MemoryHandler, PromptHandler
import redis.asyncio as redis

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")


class OptimizedMemoryHandler:
    """Handler using simple memory store for faster operations."""

    def __init__(self, simple_store, embedder):
        self.store = simple_store
        self.embedder = embedder

    async def handle_query(self, params: dict) -> dict:
        query = params.get("query", "")
        num_results = params.get("num_results", 10)
        session_id = params.get("session_id")
        results = await self.store.search(query, num_results, session_id)
        return {
            "episodes": results,
            "entities": [],
            "facts": [],
            "relevance_scores": [1.0] * len(results),
        }

    async def handle_add_episode(self, params: dict) -> dict:
        content = params.get("content", "")
        source = params.get("source_description", "conversation")
        session_id = params.get("session_id")
        episode_id = await self.store.add_episode(content, source, session_id)
        return {"status": "ok", "episode_id": episode_id}

    async def handle_get_context(self, params: dict) -> dict:
        query = params.get("query", "")
        session_id = params.get("session_id")
        results = await self.store.search(query, 5, session_id)
        context = "\n".join([r.get("content", "") for r in results])
        return {"context": context or "# No relevant memories found"}


async def main():
    redis_client = redis.Redis(host="localhost", port=6379, decode_responses=False)
    logging.info("Connected to FalkorDB")

    embedder_config = EmbedderConfig()
    embedder = LocalEmbedder(embedder_config)
    logging.info("Preloading embedding model...")
    await embedder.embed(["test"])
    logging.info("Embedding model ready")

    simple_store = SimpleMemoryStore(redis_client)
    simple_store.set_embedder(embedder)

    prompt_builder = TemplatePromptBuilder()

    relevance_evaluator = None
    try:
        from sibyl_relevance import CachedRelevanceEvaluator

        relevance_evaluator = CachedRelevanceEvaluator(
            embedder=embedder,
            cache_ttl=600,
            use_llm=False,
        )
    except Exception as e:
        logging.warning(f"Relevance evaluator initialization failed: {e}")

    server = IpcServer()

    memory_handler = OptimizedMemoryHandler(simple_store, embedder)
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    logging.info("Starting Sibyl IPC Server (optimized mode)...")
    logging.info(f"Socket path: {server.socket_path}")

    try:
        await server.start()
    except KeyboardInterrupt:
        logging.info("Shutting down...")
    finally:
        await redis_client.close()


if __name__ == "__main__":
    asyncio.run(main())
