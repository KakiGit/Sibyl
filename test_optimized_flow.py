#!/usr/bin/env python
"""Optimized flow test - smaller models, lower thresholds, full integration."""

import asyncio
import json
import struct
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

from sibyl_memory import SimpleMemoryStore
from sibyl_memory.embedder.local import LocalEmbedder
from sibyl_memory.embedder.config import EmbedderConfig
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, PromptHandler
from sibyl_relevance import CachedRelevanceEvaluator


class OptimizedMemoryHandler:
    def __init__(self, simple_store, embedder):
        self.store = simple_store
        self.embedder = embedder

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


async def send_ipc(method: str, params: dict, request_id: int = 1):
    reader, writer = await asyncio.open_unix_connection("/tmp/sibyl-ipc.sock")
    request = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
    data = json.dumps(request).encode()
    writer.write(struct.pack(">I", len(data)) + data)
    await writer.drain()
    len_buf = await reader.readexactly(4)
    msg_len = struct.unpack(">I", len_buf)[0]
    response_buf = await reader.readexactly(msg_len)
    response = json.loads(response_buf)
    writer.close()
    await writer.wait_closed()
    return response


async def run_server():
    import redis.asyncio as redis

    print("[SERVER] Connecting to FalkorDB...", flush=True)
    redis_client = redis.Redis(host="localhost", port=6379, decode_responses=False)

    embedder_config = EmbedderConfig(
        model="sentence-transformers/all-MiniLM-L6-v2", device="cpu"
    )
    embedder = LocalEmbedder(embedder_config)

    print("[SERVER] Preloading embedding model...", flush=True)
    await embedder.embed(["test"])
    print("[SERVER] Embedding model ready!", flush=True)

    simple_store = SimpleMemoryStore(redis_client)
    simple_store.set_embedder(embedder)

    prompt_builder = TemplatePromptBuilder()
    relevance_evaluator = CachedRelevanceEvaluator(
        embedder=embedder, cache_ttl=600, use_llm=False, threshold=0.25
    )

    server = IpcServer()
    memory_handler = OptimizedMemoryHandler(simple_store, embedder)
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    print("[SERVER] IPC server listening on /tmp/sibyl-ipc.sock", flush=True)
    await server.start()


async def test_memory_batch():
    print("\n=== Test 1: Memory Operations (Batch) ===", flush=True)

    episodes = [
        ("User prefers qwen2.5:0.5b for fast local inference.", "Preference"),
        ("FalkorDB graph storage is used for memory.", "Tech decision"),
        ("OpenCode runs on port 4096.", "Config"),
        ("Embedding model: all-MiniLM-L6-v2 for speed.", "Config"),
        ("Redis connection at localhost:6379.", "Config"),
    ]

    start = time.time()
    for content, source in episodes:
        resp = await send_ipc(
            "memory.add_episode",
            {
                "content": content,
                "source_description": source,
                "session_id": "opt-test",
            },
        )
    elapsed = time.time() - start
    print(f"  1.1 Batch add {len(episodes)} episodes: {elapsed:.2f}s")

    queries = ["qwen model", "database", "port", "embedding"]
    for q in queries:
        start = time.time()
        resp = await send_ipc("memory.query", {"query": q, "num_results": 3})
        elapsed = time.time() - start
        results = resp.get("result", {}).get("episodes", [])
        print(f"  1.2 Query '{q}': {elapsed:.2f}s - {len(results)} results")


async def test_relevance_optimized():
    print("\n=== Test 2: Relevance (Optimized Threshold) ===", flush=True)

    facts = [
        {"content": "qwen2.5:0.5b is optimized for speed"},
        {"content": "FalkorDB stores knowledge graphs in Redis"},
        {"content": "Python async improves I/O performance"},
        {"content": "Local models avoid API latency"},
        {"content": "Embedding similarity enables semantic search"},
    ]

    queries = ["fast inference", "graph database", "python", "latency"]
    for q in queries:
        start = time.time()
        resp = await send_ipc(
            "relevance.evaluate", {"facts": facts, "query": q, "threshold": 0.25}
        )
        elapsed = time.time() - start
        results = resp.get("result", {}).get("results", [])
        print(f"  2.1 Query '{q}': {elapsed:.2f}s - {len(results)} relevant")
        if results:
            top = results[0]
            print(
                f"      Top: [{top.get('score', 0):.2f}] {top.get('fact', {}).get('content', '')[:40]}"
            )


async def test_prompt_with_memory():
    print("\n=== Test 3: Prompt Building with Memory ===", flush=True)

    start = time.time()
    context_resp = await send_ipc(
        "memory.get_context",
        {"query": "inference optimization", "session_id": "opt-test"},
    )
    elapsed = time.time() - start
    context = context_resp.get("result", {}).get("context", "")
    print(f"  3.1 Memory context retrieval: {elapsed:.2f}s - {len(context)} chars")

    start = time.time()
    resp = await send_ipc(
        "prompt.build",
        {
            "user_query": "How to optimize LLM inference?",
            "context": {"project": "Sibyl", "session": "opt-test"},
            "memories": {"relevant_context": context[:500]},
        },
    )
    elapsed = time.time() - start
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"  3.2 Build prompt with context: {elapsed:.2f}s - {len(prompt)} chars")


async def test_opencode_integration():
    print("\n=== Test 4: OpenCode + Memory Integration ===", flush=True)

    try:
        import aiohttp
    except ImportError:
        print("  SKIPPED: aiohttp not installed")
        return

    base_url = "http://127.0.0.1:4096"
    timeout = aiohttp.ClientTimeout(total=30)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            start = time.time()
            async with session.post(
                f"{base_url}/session", json={"model": "qwen2.5:0.5b"}
            ) as resp:
                if resp.status != 200:
                    print(f"  4.1 Create session FAILED: {resp.status}")
                    return
                data = await resp.json()
                session_id = data.get("id")
            elapsed = time.time() - start
            print(f"  4.1 Create session: {elapsed:.2f}s - {session_id[:20]}")

            await send_ipc(
                "memory.add_episode",
                {
                    "content": f"New OpenCode session started: {session_id[:12]}",
                    "source_description": "Session",
                    "session_id": session_id,
                },
            )

            simple_query = "What is 2+2?"
            start = time.time()
            async with session.post(
                f"{base_url}/session/{session_id}/message",
                json={"parts": [{"type": "text", "text": simple_query}]},
            ) as resp:
                elapsed = time.time() - start
                if resp.status == 200:
                    print(f"  4.2 Simple query: {elapsed:.2f}s - OK")
                else:
                    print(f"  4.2 Simple query: {elapsed:.2f}s - {resp.status}")

            await asyncio.sleep(1)

            start = time.time()
            async with session.get(f"{base_url}/session/{session_id}/message") as resp:
                messages = await resp.json()
            elapsed = time.time() - start
            print(f"  4.3 Get messages: {elapsed:.2f}s - {len(messages)} messages")

            for msg in messages[-2:]:
                role = msg.get("role", "?")
                content = str(msg.get("content", ""))[:60]
                print(f"      [{role}] {content}...")

            await send_ipc(
                "memory.add_episode",
                {
                    "content": f"Q: {simple_query} | Messages: {len(messages)}",
                    "source_description": "Chat",
                    "session_id": session_id,
                },
            )

            start = time.time()
            resp = await send_ipc(
                "memory.query", {"query": "session", "session_id": session_id}
            )
            elapsed = time.time() - start
            episodes = resp.get("result", {}).get("episodes", [])
            print(f"  4.4 Session memory: {elapsed:.2f}s - {len(episodes)} episodes")

            async with session.delete(f"{base_url}/session/{session_id}") as resp:
                print(f"  4.5 Close session: {resp.status}")

    except asyncio.TimeoutError:
        print("  TIMEOUT: OpenCode response took too long")
    except aiohttp.ClientError as e:
        print(f"  ERROR: {e}")


async def run_tests():
    print("\n" + "=" * 60, flush=True)
    print("Sibyl Optimized Flow Test", flush=True)
    print("Models: qwen2.5:0.5b (LLM) + all-MiniLM-L6-v2 (embeddings)", flush=True)
    print("=" * 60, flush=True)

    start_time = time.time()

    await test_memory_batch()
    await test_relevance_optimized()
    await test_prompt_with_memory()
    await test_opencode_integration()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60, flush=True)
    print(f"All tests completed in {elapsed:.2f}s!", flush=True)
    print("=" * 60, flush=True)


async def main():
    server_task = asyncio.create_task(run_server())

    print("Waiting for server startup...", flush=True)
    await asyncio.sleep(8)

    await run_tests()

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
