#!/usr/bin/env python
"""Optimized IPC server for low-resource hardware using qwen2.5:0.5b and in-memory store."""

import asyncio
import json
import logging
import os
import signal
import struct
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4
import math

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s:%(name)s:%(message)s"
)
logger = logging.getLogger("sibyl-server")


class InMemoryStore:
    """Fast in-memory store for testing without Redis."""

    def __init__(self):
        self._episodes: Dict[str, dict] = {}
        self._embeddings: Dict[str, List[float]] = {}
        self._session_episodes: Dict[str, List[str]] = {}
        self._all_episodes: List[str] = []
        self._embedder = None
        self._embedding_lock = asyncio.Lock()

    def set_embedder(self, embedder):
        self._embedder = embedder

    async def add_episode(
        self,
        content: str,
        source: str = "conversation",
        session_id: Optional[str] = None,
    ) -> str:
        episode_id = str(uuid4())
        episode_data = {
            "uuid": episode_id,
            "content": content,
            "source": source,
            "session_id": session_id or "default",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._episodes[episode_id] = episode_data

        if self._embedder:
            async with self._embedding_lock:
                embeddings = await self._embedder.embed([content])
                self._embeddings[episode_id] = embeddings[0]

        if session_id:
            if session_id not in self._session_episodes:
                self._session_episodes[session_id] = []
            self._session_episodes[session_id].append(episode_id)

        self._all_episodes.append(episode_id)
        logger.debug(f"Stored episode: {episode_id[:8]}")
        return episode_id

    async def search(
        self,
        query: str,
        num_results: int = 10,
        session_id: Optional[str] = None,
        use_embedding: bool = True,
    ) -> List[dict]:
        if use_embedding and self._embedder:
            async with self._embedding_lock:
                query_embeddings = await self._embedder.embed([query])
                query_embedding = query_embeddings[0]
            return await self._embedding_search(
                query_embedding, num_results, session_id
            )
        return self._keyword_search(query, num_results, session_id)

    async def _embedding_search(
        self, query_embedding: List[float], num_results: int, session_id: Optional[str]
    ) -> List[dict]:
        episode_ids = []
        if session_id:
            episode_ids = self._session_episodes.get(session_id, [])
        if not session_id or len(episode_ids) < 5:
            episode_ids = list(set(episode_ids + self._all_episodes[-50:]))

        scored = []
        for ep_id in episode_ids:
            if ep_id in self._embeddings and ep_id in self._episodes:
                similarity = self._cosine_similarity(
                    query_embedding, self._embeddings[ep_id]
                )
                if similarity > 0.1:
                    scored.append((self._episodes[ep_id], similarity))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [ep for ep, _ in scored[:num_results]]

    def _keyword_search(
        self, query: str, num_results: int, session_id: Optional[str]
    ) -> List[dict]:
        results = []
        query_lower = query.lower()
        episode_ids = (
            self._session_episodes.get(session_id, [])
            if session_id
            else self._all_episodes
        )
        for ep_id in episode_ids:
            if ep_id in self._episodes:
                ep = self._episodes[ep_id]
                if query_lower in ep.get("content", "").lower():
                    results.append(ep)
        return results[:num_results]

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


class IpcServer:
    """High-performance IPC server."""

    def __init__(self, socket_path: Optional[str] = None):
        self.socket_path = socket_path or "/tmp/sibyl-ipc.sock"
        self.handlers: Dict[str, Any] = {}
        self._server = None

    def register(self, method: str, handler):
        self.handlers[method] = handler

    async def start(self):
        if os.path.exists(self.socket_path):
            os.unlink(self.socket_path)
        self._server = await asyncio.start_unix_server(
            self._handle_connection, path=self.socket_path
        )
        logger.info(f"IPC server listening on {self.socket_path}")
        async with self._server:
            await self._server.serve_forever()

    async def _handle_connection(self, reader, writer):
        try:
            while True:
                len_data = await reader.readexactly(4)
                msg_len = int.from_bytes(len_data, "big")
                data = await reader.readexactly(msg_len)
                request = json.loads(data)

                method = request.get("method")
                handler = self.handlers.get(method)
                if handler:
                    try:
                        result = await handler(request.get("params", {}))
                        response = {
                            "jsonrpc": "2.0",
                            "id": request.get("id"),
                            "result": result,
                        }
                    except Exception as e:
                        logger.error(f"Handler error: {e}")
                        response = {
                            "jsonrpc": "2.0",
                            "id": request.get("id"),
                            "error": str(e),
                        }
                else:
                    response = {
                        "jsonrpc": "2.0",
                        "id": request.get("id"),
                        "error": f"Method not found: {method}",
                    }

                response_data = json.dumps(response).encode()
                writer.write(len(response_data).to_bytes(4, "big") + response_data)
                await writer.drain()
        except asyncio.IncompleteReadError:
            pass
        except Exception as e:
            logger.error(f"Connection error: {e}")
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass


class MemoryHandler:
    """Optimized memory handler."""

    def __init__(self, store, embedder):
        self.store = store
        self.embedder = embedder
        self._batch_queue: List[dict] = []
        self._batch_task = None

    async def handle_query(self, params: dict) -> dict:
        query = params.get("query", "")
        num_results = min(params.get("num_results", 5), 10)
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
        results = await self.store.search(query, 3, session_id, use_embedding=True)
        context = "\n".join([r.get("content", "") for r in results])
        return {"context": context or "# No relevant memories found"}

    async def handle_batch_add(self, params: dict) -> dict:
        episodes = params.get("episodes", [])
        session_id = params.get("session_id")
        ids = []
        for ep in episodes:
            episode_id = await self.store.add_episode(
                ep.get("content", ""), ep.get("source", "conversation"), session_id
            )
            ids.append(episode_id)
        return {"status": "ok", "episode_ids": ids}


class RelevanceEvaluator:
    """Fast embedding-based relevance evaluator with caching."""

    def __init__(self, embedder, threshold: float = 0.25, cache_ttl: int = 600):
        self.embedder = embedder
        self.threshold = threshold
        self._query_cache: Dict[str, List[float]] = {}
        self._cache_ttl = cache_ttl
        self._cache_timestamps: Dict[str, float] = {}
        self._embedding_lock = asyncio.Lock()

    async def evaluate(
        self, facts: List[dict], query: str, threshold: Optional[float] = None
    ) -> List[dict]:
        threshold = threshold or self.threshold
        results = []

        now = time.time()
        if query in self._query_cache:
            if now - self._cache_timestamps.get(query, 0) < self._cache_ttl:
                query_embedding = self._query_cache[query]
            else:
                del self._query_cache[query]
                del self._cache_timestamps[query]

        if query not in self._query_cache:
            async with self._embedding_lock:
                embeddings = await self.embedder.embed([query])
                self._query_cache[query] = embeddings[0]
                self._cache_timestamps[query] = now
            query_embedding = self._query_cache[query]

        fact_texts = [f.get("content", str(f)) for f in facts]
        async with self._embedding_lock:
            fact_embeddings = await self.embedder.embed(fact_texts)

        for fact, fact_embedding in zip(facts, fact_embeddings):
            similarity = self._cosine_similarity(query_embedding, fact_embedding)
            if similarity >= threshold:
                results.append({"fact": fact, "score": similarity})

        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


class PromptBuilder:
    """Optimized prompt builder."""

    async def build(self, params: dict) -> dict:
        user_query = params.get("user_query", "")
        context = params.get("context", {})
        memories = params.get("memories", {})

        prompt_parts = [f"# Query\n{user_query}\n"]

        if memories.get("context"):
            prompt_parts.append(f"\n# Memories\n{memories['context']}\n")

        if context:
            prompt_parts.append(f"\n# Context\n{json.dumps(context, indent=2)}\n")

        prompt_parts.append(
            "\n# Instructions\nRespond helpfully using available context."
        )

        return {"prompt": "\n".join(prompt_parts)}


class PromptHandler:
    """Handler for prompt operations."""

    def __init__(self, builder, evaluator):
        self.builder = builder
        self.evaluator = evaluator

    async def handle_build(self, params: dict) -> dict:
        return await self.builder.build(params)

    async def handle_relevance_evaluate(self, params: dict) -> dict:
        facts = params.get("facts", [])
        query = params.get("query", "")
        threshold = params.get("threshold", 0.25)
        results = await self.evaluator.evaluate(facts, query, threshold)
        return {"results": results}


async def send_ipc_request(method: str, params: dict, request_id: int = 1):
    """Send IPC request."""
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
    """Run optimized IPC server."""
    print("[SERVER] Initializing (optimized for low-resource hardware)...", flush=True)

    from sibyl_memory.embedder.local import LocalEmbedder
    from sibyl_memory.embedder.config import EmbedderConfig

    embedder_config = EmbedderConfig(
        model="sentence-transformers/all-MiniLM-L6-v2",
        device="cpu",
        batch_size=8,
    )
    embedder = LocalEmbedder(embedder_config)

    print("[SERVER] Preloading embedding model...", flush=True)
    await embedder.embed(["init"])
    print("[SERVER] Embedding model ready!", flush=True)

    store = InMemoryStore()
    store.set_embedder(embedder)

    server = IpcServer()
    memory_handler = MemoryHandler(store, embedder)
    relevance_evaluator = RelevanceEvaluator(embedder, threshold=0.25, cache_ttl=900)
    prompt_builder = PromptBuilder()
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("memory.batch_add", memory_handler.handle_batch_add)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    print(f"[SERVER] IPC server listening on {server.socket_path}", flush=True)
    print("[SERVER] Using in-memory store (no Redis required)", flush=True)
    print("[SERVER] Ready for connections!", flush=True)
    await server.start()


async def test_memory_operations():
    print("\n=== Test 1: Memory Operations ===", flush=True)

    tests = [
        (
            "1.1 Adding episode",
            "memory.add_episode",
            {
                "content": "User prefers Python for backend, Rust for systems.",
                "source_description": "Preference",
                "session_id": "test-1",
            },
        ),
        (
            "1.2 Adding episode",
            "memory.add_episode",
            {
                "content": "Uses pytest for async testing.",
                "source_description": "Conversation",
                "session_id": "test-1",
            },
        ),
    ]

    for name, method, params in tests:
        start = time.time()
        resp = await send_ipc_request(method, params)
        elapsed = time.time() - start
        eid = resp.get("result", {}).get("episode_id", "err")
        print(f"    {name}: {eid[:12]} in {elapsed:.3f}s")

    start = time.time()
    resp = await send_ipc_request("memory.query", {"query": "Python", "num_results": 3})
    elapsed = time.time() - start
    eps = resp.get("result", {}).get("episodes", [])
    print(f"    Query: {len(eps)} results in {elapsed:.3f}s")


async def test_relevance():
    print("\n=== Test 2: Relevance ===", flush=True)

    start = time.time()
    resp = await send_ipc_request(
        "relevance.evaluate",
        {
            "facts": [
                {"content": "Python backend dev", "type": "fact"},
                {"content": "Weather sunny", "type": "fact"},
                {"content": "pytest for testing", "type": "fact"},
            ],
            "query": "test Python code",
            "threshold": 0.3,
        },
    )
    elapsed = time.time() - start
    results = resp.get("result", {}).get("results", [])
    print(f"    Evaluated {len(results)} facts in {elapsed:.3f}s")
    for r in results[:2]:
        print(f"      [{r['score']:.2f}] {r['fact']['content'][:30]}")


async def test_prompt():
    print("\n=== Test 3: Prompt Build ===", flush=True)

    start = time.time()
    resp = await send_ipc_request(
        "prompt.build",
        {
            "user_query": "What testing framework?",
            "context": {"project": "Sibyl"},
            "memories": {"context": "User prefers pytest."},
        },
    )
    elapsed = time.time() - start
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"    Built {len(prompt)} chars in {elapsed:.3f}s")


async def test_opencode():
    print("\n=== Test 4: OpenCode Integration ===", flush=True)

    try:
        import aiohttp
    except ImportError:
        print("    SKIPPED: aiohttp missing")
        return

    base_url = "http://127.0.0.1:4096"

    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=15)
        ) as session:
            start = time.time()
            async with session.post(f"{base_url}/session", json={}) as resp:
                data = await resp.json()
                session_id = data.get("id")
            print(
                f"    Created session: {session_id[:12]} in {time.time() - start:.3f}s"
            )

            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"Session {session_id} created",
                    "source_description": "Session",
                    "session_id": session_id,
                },
            )

            start = time.time()
            async with session.post(
                f"{base_url}/session/{session_id}/message",
                json={"parts": [{"type": "text", "text": "Hello"}]},
            ) as resp:
                print(f"    Sent message in {time.time() - start:.3f}s")

            await asyncio.sleep(1)

            async with session.get(f"{base_url}/session/{session_id}/message") as resp:
                msgs = await resp.json()
            print(f"    Got {len(msgs)} messages")

            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"Conversation: {len(msgs)} messages",
                    "source_description": "Conv",
                    "session_id": session_id,
                },
            )

            async with session.delete(f"{base_url}/session/{session_id}") as resp:
                print(f"    Closed: {resp.status}")

    except Exception as e:
        print(f"    Error: {e}")


async def run_tests():
    print("\n" + "=" * 50, flush=True)
    print("Sibyl Optimized Test (qwen2.5:0.5b ready)", flush=True)
    print("=" * 50, flush=True)

    start_time = time.time()
    await test_memory_operations()
    await test_relevance()
    await test_prompt()
    await test_opencode()

    elapsed = time.time() - start_time
    print("\n" + "=" * 50, flush=True)
    print(f"Completed in {elapsed:.2f}s", flush=True)
    print("=" * 50, flush=True)


async def main():
    server_task = asyncio.create_task(run_server())

    print("Waiting for server...", flush=True)
    await asyncio.sleep(3)

    await run_tests()

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
