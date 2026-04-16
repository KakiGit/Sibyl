#!/usr/bin/env python
"""Start Sibyl IPC server with optimized configuration."""

import asyncio
import logging
import sys
import os
import signal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

from sibyl_memory import SimpleMemoryStore
from sibyl_memory.embedder.local import LocalEmbedder
from sibyl_memory.embedder.config import EmbedderConfig
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, PromptHandler
from sibyl_relevance import CachedRelevanceEvaluator
import redis.asyncio as redis

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s:%(name)s:%(message)s"
)
logger = logging.getLogger("sibyl-server")


class OptimizedMemoryHandler:
    """Optimized handler with pre-computed embeddings and batching."""

    def __init__(self, simple_store, embedder):
        self.store = simple_store
        self.embedder = embedder
        self._query_cache = {}

    async def handle_query(self, params: dict) -> dict:
        query = params.get("query", "")
        num_results = params.get("num_results", 10)
        session_id = params.get("session_id")

        results = await self.store.search(
            query, num_results, session_id, use_embedding=True
        )
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
        results = await self.store.search(query, 5, session_id, use_embedding=True)
        context = "\n".join([r.get("content", "") for r in results])
        return {"context": context or "# No relevant memories found"}

    async def handle_batch_add(self, params: dict) -> dict:
        episodes = params.get("episodes", [])
        session_id = params.get("session_id")
        ids = []
        contents = [ep.get("content", "") for ep in episodes]
        sources = [ep.get("source", "conversation") for ep in episodes]

        if contents and self.embedder:
            embeddings = await self.embedder.embed(contents)
            for i, (content, source, embedding) in enumerate(
                zip(contents, sources, embeddings)
            ):
                episode_id = await self.store.add_episode_with_embedding(
                    content, source, session_id, embedding
                )
                ids.append(episode_id)
        else:
            for content, source in zip(contents, sources):
                episode_id = await self.store.add_episode(content, source, session_id)
                ids.append(episode_id)
        return {"status": "ok", "episode_ids": ids}


async def main():
    logger.info("Connecting to FalkorDB...")
    redis_client = redis.Redis(host="localhost", port=6379, decode_responses=False)

    embedder_config = EmbedderConfig(
        model="sentence-transformers/all-MiniLM-L6-v2",
        device="cpu",
        batch_size=32,
    )
    embedder = LocalEmbedder(embedder_config)

    logger.info("Preloading embedding model...")
    await embedder.embed(["initialization test"])
    logger.info("Embedding model ready!")

    simple_store = SimpleMemoryStore(redis_client)
    simple_store.set_embedder(embedder)

    prompt_builder = TemplatePromptBuilder()
    relevance_evaluator = CachedRelevanceEvaluator(
        embedder=embedder,
        cache_ttl=600,
        use_llm=False,
        threshold=0.3,
    )

    server = IpcServer()
    memory_handler = OptimizedMemoryHandler(simple_store, embedder)
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("memory.batch_add", memory_handler.handle_batch_add)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    logger.info(f"Sibyl IPC Server starting on {server.socket_path}")
    logger.info("Ready to accept connections!")

    shutdown_event = asyncio.Event()

    def signal_handler():
        logger.info("Shutdown signal received")
        shutdown_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    try:
        await server.start()
    except asyncio.CancelledError:
        logger.info("Server cancelled")
    finally:
        await redis_client.close()
        logger.info("Server stopped")


if __name__ == "__main__":
    asyncio.run(main())
