#!/usr/bin/env python
"""Optimized headless test with in-memory storage and smaller models."""

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
from sibyl_memory.llm.config import LLMConfig
from sibyl_memory.llm.ollama import OllamaClient
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, PromptHandler
from sibyl_relevance import CachedRelevanceEvaluator


class InMemoryHandler:
    """Handler using in-memory storage for fast testing."""

    def __init__(self, embedder, redis_client):
        self.embedder = embedder
        self.redis = redis_client
        self._episodes = {}
        self._embeddings = {}
        self._session_episodes = {}

    async def handle_query(self, params: dict) -> dict:
        query = params.get("query", "")
        num_results = params.get("num_results", 10)
        session_id = params.get("session_id")

        query_emb = (await self.embedder.embed([query]))[0]

        scored = []
        episodes_to_search = list(self._episodes.values())

        if session_id and session_id in self._session_episodes:
            episode_ids = self._session_episodes[session_id]
            episodes_to_search = [
                self._episodes[eid] for eid in episode_ids if eid in self._episodes
            ]

        for ep in episodes_to_search:
            ep_id = ep.get("uuid")
            if ep_id in self._embeddings:
                similarity = self._cosine_similarity(query_emb, self._embeddings[ep_id])
                scored.append((ep, similarity))

        scored.sort(key=lambda x: x[1], reverse=True)
        return {
            "episodes": [ep for ep, _ in scored[:num_results]],
            "entities": [],
            "facts": [],
            "relevance_scores": [s for _, s in scored[:num_results]],
        }

    async def handle_add_episode(self, params: dict) -> dict:
        import uuid

        content = params.get("content", "")
        source = params.get("source_description", "conversation")
        session_id = params.get("session_id")

        episode_id = str(uuid.uuid4())
        episode = {
            "uuid": episode_id,
            "content": content,
            "source": source,
            "session_id": session_id or "default",
            "created_at": time.time(),
        }
        self._episodes[episode_id] = episode

        if session_id:
            if session_id not in self._session_episodes:
                self._session_episodes[session_id] = []
            self._session_episodes[session_id].append(episode_id)

        self._embeddings[episode_id] = (await self.embedder.embed([content]))[0]
        return {"status": "ok", "episode_id": episode_id}

    async def handle_get_context(self, params: dict) -> dict:
        query = params.get("query", "")
        session_id = params.get("session_id")

        result = await self.handle_query(
            {
                "query": query,
                "num_results": 5,
                "session_id": session_id,
            }
        )
        episodes = result.get("episodes", [])
        context = "\n".join([ep.get("content", "") for ep in episodes])
        return {"context": context or "# No relevant memories found"}

    def _cosine_similarity(self, a, b):
        import math

        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)


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
    print("[SERVER] Initializing with optimized config...", flush=True)

    embedder_config = EmbedderConfig(
        model="sentence-transformers/all-MiniLM-L6-v2",
        device="cpu",
        batch_size=16,
    )
    embedder = LocalEmbedder(embedder_config)

    print("[SERVER] Preloading embedding model...", flush=True)
    await embedder.embed(["initialization test"])
    print("[SERVER] Embedding model ready!", flush=True)

    try:
        import fakeredis.aioredis as fakeredis

        redis_client = fakeredis.FakeRedis()
        print("[SERVER] Using in-memory storage (fakeredis)", flush=True)
    except ImportError:
        import redis.asyncio as redis

        redis_client = redis.Redis(host="localhost", port=6379, decode_responses=False)
        print("[SERVER] Using FalkorDB (redis)", flush=True)

    store = InMemoryHandler(embedder, redis_client)

    prompt_builder = TemplatePromptBuilder()
    relevance_evaluator = CachedRelevanceEvaluator(
        embedder=embedder,
        cache_ttl=600,
        use_llm=False,
        threshold=0.3,
    )

    server = IpcServer()
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", store.handle_query)
    server.register("memory.add_episode", store.handle_add_episode)
    server.register("memory.get_context", store.handle_get_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    print(f"[SERVER] IPC server listening on {server.socket_path}", flush=True)
    await server.start()


async def test_memory():
    print("\n=== Test 1: Memory Operations ===", flush=True)

    start = time.time()
    resp = await send_ipc(
        "memory.add_episode",
        {
            "content": "User prefers qwen2.5:0.5b for fast local inference on limited hardware.",
            "source_description": "Preference",
            "session_id": "perf-test",
        },
    )
    elapsed = time.time() - start
    print(
        f"  1.1 Add episode: {elapsed:.3f}s - {resp.get('result', {}).get('episode_id', 'error')[:16]}"
    )

    start = time.time()
    resp = await send_ipc(
        "memory.add_episode",
        {
            "content": "Sibyl uses FalkorDB/Redis for graph storage with embedding-based search.",
            "source_description": "Tech discussion",
            "session_id": "perf-test",
        },
    )
    elapsed = time.time() - start
    print(f"  1.2 Add episode: {elapsed:.3f}s")

    start = time.time()
    resp = await send_ipc(
        "memory.add_episode",
        {
            "content": "OpenCode REST API runs on port 4096 for session management.",
            "source_description": "Config",
            "session_id": "perf-test",
        },
    )
    elapsed = time.time() - start
    print(f"  1.3 Add episode: {elapsed:.3f}s")

    start = time.time()
    resp = await send_ipc("memory.query", {"query": "qwen model", "num_results": 5})
    elapsed = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"  1.4 Query 'qwen model': {elapsed:.3f}s - {len(episodes)} results")

    start = time.time()
    resp = await send_ipc(
        "memory.query", {"query": "database storage", "num_results": 5}
    )
    elapsed = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"  1.5 Query 'database storage': {elapsed:.3f}s - {len(episodes)} results")

    start = time.time()
    resp = await send_ipc(
        "memory.get_context", {"query": "API configuration", "session_id": "perf-test"}
    )
    elapsed = time.time() - start
    context = resp.get("result", {}).get("context", "")
    print(f"  1.6 Get context: {elapsed:.3f}s - {len(context)} chars")


async def test_relevance():
    print("\n=== Test 2: Relevance Evaluation ===", flush=True)

    start = time.time()
    resp = await send_ipc(
        "relevance.evaluate",
        {
            "facts": [
                {"content": "qwen2.5:0.5b is optimized for fast inference"},
                {"content": "FalkorDB uses Redis as backend"},
                {"content": "Python async/await improves performance"},
                {"content": "Embedding models convert text to vectors"},
            ],
            "query": "fast model inference",
            "threshold": 0.3,
        },
    )
    elapsed = time.time() - start
    results = resp.get("result", {}).get("results", [])
    print(f"  2.1 Evaluated 4 facts: {elapsed:.3f}s - {len(results)} relevant")
    for r in results[:3]:
        print(
            f"      [{r.get('score', 0):.2f}] {r.get('fact', {}).get('content', '')[:50]}"
        )


async def test_prompt():
    print("\n=== Test 3: Prompt Building ===", flush=True)

    start = time.time()
    resp = await send_ipc(
        "prompt.build",
        {
            "user_query": "How to optimize inference speed?",
            "context": {"project": "Sibyl", "language": "Python"},
            "memories": {"context": "Use qwen2.5:0.5b for speed on limited hardware."},
        },
    )
    elapsed = time.time() - start
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"  3.1 Build prompt: {elapsed:.3f}s - {len(prompt)} chars")


async def test_opencode_integration():
    print("\n=== Test 4: OpenCode Integration (qwen2.5:0.5b) ===", flush=True)

    try:
        import aiohttp
    except ImportError:
        print("  SKIPPED: aiohttp not installed")
        return

    base_url = "http://127.0.0.1:4096"
    timeout = aiohttp.ClientTimeout(total=60)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            start = time.time()
            async with session.post(
                f"{base_url}/session", json={"model": "qwen2.5:0.5b"}
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    print(f"  4.1 Create session FAILED: {resp.status} - {text[:100]}")
                    return
                data = await resp.json()
                session_id = data.get("id")
            elapsed = time.time() - start
            print(f"  4.1 Create session: {elapsed:.2f}s - {session_id[:20]}")

            await send_ipc(
                "memory.add_episode",
                {
                    "content": f"OpenCode session {session_id} created with qwen2.5:0.5b model",
                    "source_description": "Session start",
                    "session_id": session_id,
                },
            )

            start = time.time()
            async with session.post(
                f"{base_url}/session/{session_id}/message",
                json={
                    "parts": [{"type": "text", "text": "What is 2+2? Answer briefly."}]
                },
            ) as resp:
                elapsed = time.time() - start
                if resp.status == 200:
                    print(f"  4.2 Send message: {elapsed:.2f}s - OK")
                else:
                    text = await resp.text()
                    print(f"  4.2 Send message: {elapsed:.2f}s - {resp.status}")

            await asyncio.sleep(3)

            start = time.time()
            async with session.get(f"{base_url}/session/{session_id}/message") as resp:
                messages = await resp.json()
            elapsed = time.time() - start
            print(f"  4.3 Get messages: {elapsed:.2f}s - {len(messages)} messages")

            for msg in messages[-3:]:
                role = msg.get("role", "?")
                content = str(msg.get("content", ""))[:60]
                print(f"      [{role}] {content}...")

            await send_ipc(
                "memory.add_episode",
                {
                    "content": f"User asked about 2+2, model responded. {len(messages)} messages total.",
                    "source_description": "Conversation",
                    "session_id": session_id,
                },
            )

            resp = await send_ipc(
                "memory.query", {"query": "math question", "session_id": session_id}
            )
            episodes = resp.get("result", {}).get("episodes", [])
            print(f"  4.4 Memory recall: {len(episodes)} episodes found")

            async with session.delete(f"{base_url}/session/{session_id}") as resp:
                print(f"  4.5 Close session: {resp.status}")

    except asyncio.TimeoutError:
        print("  TIMEOUT: OpenCode response took too long")
    except aiohttp.ClientError as e:
        print(f"  ERROR: {e}")


async def run_tests():
    print("\n" + "=" * 60, flush=True)
    print("Sibyl Optimized Headless Test", flush=True)
    print("Models: qwen2.5:0.5b (LLM) + all-MiniLM-L6-v2 (embeddings)", flush=True)
    print("Storage: In-memory (fakeredis)", flush=True)
    print("=" * 60, flush=True)

    start_time = time.time()

    await test_memory()
    await test_relevance()
    await test_prompt()
    await test_opencode_integration()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60, flush=True)
    print(f"All tests completed in {elapsed:.2f}s!", flush=True)
    print("=" * 60, flush=True)


async def main():
    server_task = asyncio.create_task(run_server())

    print("Waiting for server startup...", flush=True)
    await asyncio.sleep(5)

    await run_tests()

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
