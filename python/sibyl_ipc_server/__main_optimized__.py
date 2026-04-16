#!/usr/bin/env python3
"""Optimized IPC server using SimpleMemoryStore - no LLM dependency."""

import asyncio
import logging
from typing import Any, Dict, List

import redis.asyncio as redis

from sibyl_memory.simple_store import SimpleMemoryStore
from sibyl_memory.embedder.local import LocalEmbedder, EmbedderConfig
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server.server import IpcServer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SimpleMemoryHandler:
    """Handler for SimpleMemoryStore-based memory operations."""

    def __init__(self, store: SimpleMemoryStore):
        self.store = store

    async def handle_query(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory.query method."""
        query = params.get("query", "")
        num_results = params.get("num_results", 10)
        session_id = params.get("session_id") or params.get("project_id")

        results = await self.store.search(
            query=query,
            num_results=num_results,
            session_id=session_id,
        )

        return {
            "episodes": results,
            "entities": [],
            "facts": [{"fact": r.get("content", "")} for r in results],
            "relevance_scores": [1.0] * len(results),
        }

    async def handle_add_episode(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory.add_episode method."""
        content = params.get("content", "")
        source = params.get("source_description", "user conversation")
        session_id = params.get("session_id") or params.get("project_id")

        episode_id = await self.store.add_episode(
            content=content,
            source=source,
            session_id=session_id,
        )

        return {"status": "ok", "episode_id": episode_id}

    async def handle_get_context(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory.get_context method."""
        query = params.get("query", "")
        max_tokens = params.get("max_tokens", 4000)
        session_id = params.get("session_id") or params.get("project_id")

        results = await self.store.search(
            query=query,
            num_results=10,
            session_id=session_id,
        )

        context_parts = []
        current_tokens = 0

        for r in results:
            if current_tokens >= max_tokens:
                break
            content = r.get("content", "")
            context_parts.append(content)
            current_tokens += len(content.split())

        return {"context": "\n".join(context_parts)}


class OptimizedPromptHandler:
    """Handler for prompt operations with SimpleMemoryStore."""

    def __init__(self, prompt_builder: TemplatePromptBuilder, relevance_evaluator=None):
        self.prompt_builder = prompt_builder
        self.relevance_evaluator = relevance_evaluator

    async def handle_build(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle prompt.build method."""
        from sibyl_prompt import PromptContext

        context = PromptContext(
            project_path=params.get("project_path", ""),
            conversation_history=params.get("conversation_history", []),
            relevant_memories=params.get("relevant_memories", []),
            current_file=params.get("current_file"),
            active_skills=params.get("active_skills", []),
        )

        max_tokens = params.get("max_tokens", 8000)
        user_query = params.get("user_query", "")
        harness_name = params.get("harness_name", "opencode")
        tools = params.get("tools", [])
        memories_dict = params.get("memories", {})

        prompt = await self.prompt_builder.build_system_prompt(
            context=context,
            memories=memories_dict,
            tools=tools,
            user_query=user_query,
            harness_name=harness_name,
            max_tokens=max_tokens,
        )

        return {"prompt": prompt}

    async def handle_relevance_evaluate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle relevance.evaluate method."""
        query = params.get("query", "")
        facts = params.get("facts", [])
        threshold = params.get("threshold", 0.7)

        if self.relevance_evaluator:
            results = await self.relevance_evaluator.evaluate_batch(
                query, facts, threshold=threshold
            )
            return {
                "results": [
                    {"fact": self._fact_to_dict(f), "score": s} for f, s in results
                ]
            }

        return {"results": []}

    def _fact_to_dict(self, fact) -> Dict[str, Any]:
        """Convert fact to dictionary."""
        if isinstance(fact, dict):
            return fact
        if hasattr(fact, "model_dump"):
            return fact.model_dump()
        if hasattr(fact, "fact"):
            return {
                "uuid": getattr(fact, "uuid", ""),
                "fact": fact.fact,
                "source_node_uuid": getattr(fact, "source_node_uuid", ""),
                "target_node_uuid": getattr(fact, "target_node_uuid", ""),
            }
        return {"content": str(fact)}


async def main():
    print("=" * 60)
    print("SIBYL OPTIMIZED IPC SERVER (SimpleMemoryStore)")
    print("=" * 60)

    print("\n[1/4] Connecting to Redis/FalkorDB...")
    r = redis.Redis(host="localhost", port=6379, decode_responses=False)
    await r.ping()
    print("  Connected to Redis")

    print("\n[2/4] Initializing embedder (all-MiniLM-L6-v2)...")
    embedder_config = EmbedderConfig(model_name="all-MiniLM-L6-v2")
    embedder = LocalEmbedder(embedder_config)
    _ = embedder.model
    print("  Embedder ready")

    print("\n[3/4] Creating SimpleMemoryStore...")
    store = SimpleMemoryStore(r)
    store.set_embedder(embedder)
    print("  Store ready")

    print("\n[4/4] Initializing prompt builder...")
    prompt_builder = TemplatePromptBuilder()

    relevance_evaluator = None
    try:
        from sibyl_relevance import CachedRelevanceEvaluator

        relevance_evaluator = CachedRelevanceEvaluator(
            embedder=embedder,
            cache_ttl=300,
            threshold=0.25,
            use_llm=False,
        )
        print("  Relevance evaluator ready (embedding-based)")
    except Exception as e:
        print(f"  Relevance evaluator skipped: {e}")

    memory_handler = SimpleMemoryHandler(store)
    prompt_handler = OptimizedPromptHandler(prompt_builder, relevance_evaluator)

    server = IpcServer()
    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    print("\n" + "=" * 60)
    print("IPC SERVER READY")
    print(f"Socket: /tmp/sibyl-ipc.sock")
    print("=" * 60)
    print("\nListening for connections...")

    try:
        await server.start()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        await r.aclose()


if __name__ == "__main__":
    asyncio.run(main())
