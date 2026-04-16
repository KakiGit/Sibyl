#!/usr/bin/env python
"""Standalone headless test for Sibyl - no external Redis required."""

import asyncio
import json
import logging
import os
import signal
import struct
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4
import math

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s:%(name)s:%(message)s"
)
logger = logging.getLogger("sibyl-test")


class InMemoryStore:
    """In-memory store for testing without Redis."""

    def __init__(self):
        self._episodes: Dict[str, dict] = {}
        self._embeddings: Dict[str, List[float]] = {}
        self._session_episodes: Dict[str, List[str]] = {}
        self._all_episodes: List[str] = []
        self._embedder = None

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
            "created_at": datetime.utcnow().isoformat(),
        }
        self._episodes[episode_id] = episode_data

        if self._embedder:
            embeddings = await self._embedder.embed([content])
            self._embeddings[episode_id] = embeddings[0]

        if session_id:
            if session_id not in self._session_episodes:
                self._session_episodes[session_id] = []
            self._session_episodes[session_id].append(episode_id)

        self._all_episodes.append(episode_id)
        return episode_id

    async def search(
        self,
        query: str,
        num_results: int = 10,
        session_id: Optional[str] = None,
        use_embedding: bool = True,
    ) -> List[dict]:
        if use_embedding and self._embedder:
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
        if not session_id:
            episode_ids = self._all_episodes[-100:]

        scored = []
        for ep_id in episode_ids:
            if ep_id in self._embeddings and ep_id in self._episodes:
                similarity = self._cosine_similarity(
                    query_embedding, self._embeddings[ep_id]
                )
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
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)


class IpcServer:
    """Simplified IPC server for testing."""

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

                handler = self.handlers.get(request.get("method"))
                if handler:
                    try:
                        result = await handler(request.get("params", {}))
                        response = {
                            "jsonrpc": "2.0",
                            "id": request.get("id"),
                            "result": result,
                        }
                    except Exception as e:
                        response = {
                            "jsonrpc": "2.0",
                            "id": request.get("id"),
                            "error": str(e),
                        }
                else:
                    response = {
                        "jsonrpc": "2.0",
                        "id": request.get("id"),
                        "error": "Method not found",
                    }

                response_data = json.dumps(response).encode()
                writer.write(len(response_data).to_bytes(4, "big") + response_data)
                await writer.drain()
        except asyncio.IncompleteReadError:
            pass
        finally:
            writer.close()
            await writer.wait_closed()


class MemoryHandler:
    """Memory handler using in-memory store."""

    def __init__(self, store, embedder):
        self.store = store
        self.embedder = embedder

    async def handle_query(self, params: dict) -> dict:
        query = params.get("query", "")
        num_results = params.get("num_results", 5)
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
    """Fast embedding-based relevance evaluator."""

    def __init__(self, embedder, threshold: float = 0.25):
        self.embedder = embedder
        self.threshold = threshold
        self._query_cache: Dict[str, List[float]] = {}

    async def evaluate(
        self, facts: List[dict], query: str, threshold: Optional[float] = None
    ) -> List[dict]:
        threshold = threshold or self.threshold
        results = []

        if query not in self._query_cache:
            embeddings = await self.embedder.embed([query])
            self._query_cache[query] = embeddings[0]
        query_embedding = self._query_cache[query]

        fact_texts = [f.get("content", str(f)) for f in facts]
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
    """Simple prompt builder."""

    async def build(self, params: dict) -> dict:
        user_query = params.get("user_query", "")
        context = params.get("context", {})
        memories = params.get("memories", {})

        prompt_parts = [f"# User Query\n{user_query}\n"]

        if memories.get("context"):
            prompt_parts.append(f"\n# Relevant Memories\n{memories['context']}\n")

        if context:
            prompt_parts.append(f"\n# Context\n{json.dumps(context, indent=2)}\n")

        prompt_parts.append(
            "\n# Instructions\nProvide a helpful response based on the context and memories."
        )

        return {"prompt": "\n".join(prompt_parts)}


class RelevanceHandler:
    """Handler for relevance evaluation."""

    def __init__(self, evaluator):
        self.evaluator = evaluator

    async def handle_evaluate(self, params: dict) -> dict:
        facts = params.get("facts", [])
        query = params.get("query", "")
        threshold = params.get("threshold", 0.25)
        results = await self.evaluator.evaluate(facts, query, threshold)
        return {"results": results}


class PromptHandler:
    """Handler for prompt building."""

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
    """Send IPC request and get response."""
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
    """Run the IPC server."""
    print("[SERVER] Initializing embedding model...", flush=True)

    from sibyl_memory.embedder.local import LocalEmbedder
    from sibyl_memory.embedder.config import EmbedderConfig

    embedder_config = EmbedderConfig(
        model="sentence-transformers/all-MiniLM-L6-v2",
        device="cpu",
        batch_size=16,
    )
    embedder = LocalEmbedder(embedder_config)

    print("[SERVER] Preloading embedding model...", flush=True)
    await embedder.embed(["initialization"])
    print("[SERVER] Embedding model ready!", flush=True)

    store = InMemoryStore()
    store.set_embedder(embedder)

    server = IpcServer()
    memory_handler = MemoryHandler(store, embedder)
    relevance_evaluator = RelevanceEvaluator(embedder)
    prompt_builder = PromptBuilder()
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("memory.batch_add", memory_handler.handle_batch_add)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    print(f"[SERVER] IPC server listening on {server.socket_path}", flush=True)
    await server.start()


async def test_memory_operations():
    print("\n=== Test 1: Memory Operations ===", flush=True)

    print("1.1 Adding episode...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "User prefers Python for backend development and Rust for systems programming.",
            "source_description": "User preference",
            "session_id": "test-session-1",
        },
    )
    elapsed = time.time() - start
    print(
        f"    Added in {elapsed:.2f}s: {resp.get('result', {}).get('episode_id', 'error')[:20]}"
    )

    print("1.2 Adding another episode...", flush=True)
    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "Discussed using pytest for testing with async fixtures.",
            "source_description": "Conversation",
            "session_id": "test-session-1",
        },
    )
    print(f"    Added: {resp.get('result', {}).get('episode_id', 'error')[:20]}")

    print("1.3 Querying memory...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.query", {"query": "Python programming", "num_results": 5}
    )
    elapsed = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"    Found {len(episodes)} episodes in {elapsed:.2f}s")
    for ep in episodes[:2]:
        print(f"      - {ep.get('content', '')[:60]}...")

    print("1.4 Getting context...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.get_context", {"query": "testing", "session_id": "test-session-1"}
    )
    elapsed = time.time() - start
    context = resp.get("result", {}).get("context", "")
    print(f"    Context ({len(context)} chars) in {elapsed:.2f}s")
    return True


async def test_relevance_evaluation():
    print("\n=== Test 2: Relevance Evaluation ===", flush=True)

    print("2.1 Evaluating facts...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "relevance.evaluate",
        {
            "facts": [
                {"content": "Python is used for backend development", "type": "fact"},
                {"content": "The weather is sunny today", "type": "fact"},
                {"content": "pytest is preferred for testing", "type": "fact"},
                {"content": "Rust is used for systems programming", "type": "fact"},
            ],
            "query": "How should I test my Python code?",
            "threshold": 0.3,
        },
    )
    elapsed = time.time() - start
    results = resp.get("result", {}).get("results", [])
    print(f"    Evaluated in {elapsed:.2f}s, found {len(results)} relevant facts:")
    for r in results[:3]:
        fact_content = r.get("fact", {}).get("content", "")
        score = r.get("score", 0)
        print(f"      - [{score:.2f}] {fact_content[:50]}...")
    return True


async def test_prompt_building():
    print("\n=== Test 3: Prompt Building ===", flush=True)

    print("3.1 Building prompt...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "prompt.build",
        {
            "user_query": "What testing framework should I use?",
            "context": {"project": "Sibyl", "language": "Python"},
            "memories": {"context": "User prefers pytest for testing."},
        },
    )
    elapsed = time.time() - start
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"    Built prompt ({len(prompt)} chars) in {elapsed:.2f}s")
    print(f"    Preview: {prompt[:200]}...")
    return True


async def test_session_filtering():
    print("\n=== Test 4: Session Filtering ===", flush=True)

    await send_ipc_request(
        "memory.add_episode",
        {
            "content": "Session X: Discussed machine learning models",
            "source_description": "Session X",
            "session_id": "session-x",
        },
    )
    await send_ipc_request(
        "memory.add_episode",
        {
            "content": "Session Y: Discussed database optimization",
            "source_description": "Session Y",
            "session_id": "session-y",
        },
    )

    print("4.1 Querying session-x...", flush=True)
    resp = await send_ipc_request(
        "memory.query", {"query": "discussed", "session_id": "session-x"}
    )
    episodes_x = resp.get("result", {}).get("episodes", [])
    print(f"    Session X: {len(episodes_x)} episodes")

    print("4.2 Querying session-y...", flush=True)
    resp = await send_ipc_request(
        "memory.query", {"query": "discussed", "session_id": "session-y"}
    )
    episodes_y = resp.get("result", {}).get("episodes", [])
    print(f"    Session Y: {len(episodes_y)} episodes")
    return True


async def test_opencode_integration():
    print("\n=== Test 5: OpenCode Integration ===", flush=True)

    try:
        import aiohttp
    except ImportError:
        print("    SKIPPED: aiohttp not installed")
        return True

    base_url = "http://127.0.0.1:4096"

    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30)
        ) as session:
            print("5.1 Creating OpenCode session...", flush=True)
            start = time.time()
            async with session.post(f"{base_url}/session", json={}) as resp:
                if resp.status != 200:
                    print(f"    Failed: {resp.status}")
                    return True
                data = await resp.json()
                session_id = data.get("id")
            print(f"    Created session: {session_id} in {time.time() - start:.2f}s")

            print("5.2 Storing session in memory...", flush=True)
            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"OpenCode session {session_id} created",
                    "source_description": "Session",
                    "session_id": session_id,
                },
            )

            print("5.3 Querying memory for session...", flush=True)
            resp = await send_ipc_request(
                "memory.get_context", {"query": "OpenCode", "session_id": session_id}
            )
            context = resp.get("result", {}).get("context", "")
            print(f"    Context: {context[:80]}...")

            print("5.4 Sending message to OpenCode...", flush=True)
            start = time.time()
            async with session.post(
                f"{base_url}/session/{session_id}/message",
                json={"parts": [{"type": "text", "text": "List the project files"}]},
            ) as resp:
                if resp.status == 200:
                    print(f"    Message sent in {time.time() - start:.2f}s")
                else:
                    print(f"    Failed: {resp.status}")

            print("5.5 Waiting for response...", flush=True)
            await asyncio.sleep(2)

            async with session.get(f"{base_url}/session/{session_id}/message") as resp:
                messages = await resp.json()
            print(f"    Got {len(messages)} messages")

            print("5.6 Storing conversation...", flush=True)
            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"User asked about project files. Got {len(messages)} messages.",
                    "source_description": "Conversation",
                    "session_id": session_id,
                },
            )

            print("5.7 Cleaning up...", flush=True)
            async with session.delete(f"{base_url}/session/{session_id}") as resp:
                print(f"    Session closed: {resp.status}")

    except Exception as e:
        print(f"    Error: {e}")

    return True


async def run_tests():
    print("\n" + "=" * 60, flush=True)
    print("Sibyl Headless Test (In-Memory Store)", flush=True)
    print("=" * 60, flush=True)

    start_time = time.time()

    await test_memory_operations()
    await test_relevance_evaluation()
    await test_prompt_building()
    await test_session_filtering()
    await test_opencode_integration()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60, flush=True)
    print(f"All tests completed in {elapsed:.2f}s!", flush=True)
    print("=" * 60, flush=True)


async def main():
    server_task = asyncio.create_task(run_server())

    print("Waiting for server to start...", flush=True)
    await asyncio.sleep(5)

    await run_tests()

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
