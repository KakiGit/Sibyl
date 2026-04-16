#!/usr/bin/env python
"""Optimized IPC server with FalkorDB and qwen2.5:0.5b for weak hardware."""

import asyncio
import json
import logging
import os
import struct
import sys
import time
import math
import httpx
from uuid import uuid4
from datetime import datetime, timezone
from typing import Dict, List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s:%(name)s:%(message)s"
)
logger = logging.getLogger("sibyl-optimized")


class OllamaLLM:
    """Lightweight Ollama client optimized for qwen2.5:0.5b."""

    def __init__(self, model="qwen2.5:0.5b", base_url="http://127.0.0.1:11434"):
        self.model = model
        self.base_url = base_url
        self._client = httpx.AsyncClient(timeout=30)
        self._cache: Dict[str, str] = {}

    async def generate(self, prompt: str, max_tokens: int = 16) -> str:
        cache_key = f"{prompt[:50]}:{max_tokens}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_tokens, "temperature": 0.0, "top_k": 1},
        }
        response = await self._client.post(url, json=payload)
        response.raise_for_status()
        result = response.json().get("response", "")
        self._cache[cache_key] = result
        return result

    async def close(self):
        await self._client.aclose()


class FalkorDBStore:
    """Optimized FalkorDB-backed memory store with caching."""

    def __init__(self, redis_client):
        self.redis = redis_client
        self._embedder = None
        self._embedding_cache: Dict[str, List[float]] = {}
        self._query_cache: Dict[str, List[dict]] = {}
        self._batch_queue: List[dict] = []
        self._batch_lock = asyncio.Lock()

    def set_embedder(self, embedder):
        self._embedder = embedder

    async def add_episode(
        self,
        content: str,
        source: str = "conversation",
        session_id: Optional[str] = None,
    ) -> str:
        episode_id = str(uuid4())
        episode = {
            "uuid": episode_id,
            "content": content,
            "source": source,
            "session_id": session_id or "default",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        key = f"sibyl:episode:{episode_id}"
        await self.redis.hset(
            key,
            mapping={
                k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
                for k, v in episode.items()
            },
        )
        await self.redis.sadd(f"sibyl:session:{session_id or 'default'}", episode_id)
        await self.redis.sadd("sibyl:episodes:all", episode_id)

        if self._embedder:
            embedding = await self._get_cached_embedding(content)
            await self.redis.hset(
                f"sibyl:embedding:{episode_id}", "vector", json.dumps(embedding)
            )

        self._query_cache.clear()
        return episode_id

    async def batch_add_episodes(self, episodes: List[dict]) -> List[str]:
        ids = []
        contents = [ep.get("content", "") for ep in episodes]

        if self._embedder and contents:
            embeddings = await self._embedder.embed(contents)
            for ep, embedding in zip(episodes, embeddings):
                episode_id = await self.add_episode_with_embedding(
                    ep.get("content", ""),
                    ep.get("source", "conversation"),
                    ep.get("session_id"),
                    embedding,
                )
                ids.append(episode_id)
        else:
            for ep in episodes:
                episode_id = await self.add_episode(
                    ep.get("content", ""),
                    ep.get("source", "conversation"),
                    ep.get("session_id"),
                )
                ids.append(episode_id)
        return ids

    async def add_episode_with_embedding(
        self,
        content: str,
        source: str,
        session_id: Optional[str],
        embedding: List[float],
    ) -> str:
        episode_id = str(uuid4())
        episode = {
            "uuid": episode_id,
            "content": content,
            "source": source,
            "session_id": session_id or "default",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        key = f"sibyl:episode:{episode_id}"
        await self.redis.hset(
            key,
            mapping={
                k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
                for k, v in episode.items()
            },
        )
        await self.redis.hset(
            f"sibyl:embedding:{episode_id}", "vector", json.dumps(embedding)
        )
        await self.redis.sadd(f"sibyl:session:{session_id or 'default'}", episode_id)
        await self.redis.sadd("sibyl:episodes:all", episode_id)

        self._embedding_cache[content[:100]] = embedding
        return episode_id

    async def search(
        self,
        query: str,
        num_results: int = 5,
        session_id: Optional[str] = None,
        use_embedding: bool = True,
    ) -> List[dict]:
        cache_key = f"{query}:{session_id}:{num_results}"
        if cache_key in self._query_cache:
            return self._query_cache[cache_key]

        episode_ids = await self.redis.smembers(
            f"sibyl:session:{session_id}" if session_id else "sibyl:episodes:all"
        )
        episode_ids = [
            eid.decode() if isinstance(eid, bytes) else eid for eid in episode_ids
        ][-100:]

        if use_embedding and self._embedder and episode_ids:
            query_embedding = await self._get_cached_embedding(query)
            scored = []

            for ep_id in episode_ids:
                emb_data = await self.redis.hget(f"sibyl:embedding:{ep_id}", "vector")
                if emb_data:
                    ep_embedding = json.loads(
                        emb_data.decode() if isinstance(emb_data, bytes) else emb_data
                    )
                    sim = self._cosine_similarity(query_embedding, ep_embedding)
                    if sim > 0.15:
                        ep_data = await self.redis.hgetall(f"sibyl:episode:{ep_id}")
                        if ep_data:
                            episode = {
                                k.decode() if isinstance(k, bytes) else k: json.loads(
                                    v.decode()
                                )
                                if k == "content"
                                else v.decode()
                                if isinstance(v, bytes)
                                else v
                                for k, v in ep_data.items()
                            }
                            scored.append((episode, sim))

            scored.sort(key=lambda x: x[1], reverse=True)
            results = [ep for ep, _ in scored[:num_results]]
            self._query_cache[cache_key] = results
            return results

        results = []
        for ep_id in episode_ids[:num_results]:
            ep_data = await self.redis.hgetall(f"sibyl:episode:{ep_id}")
            if ep_data:
                episode = {
                    k.decode() if isinstance(k, bytes) else k: v.decode()
                    if isinstance(v, bytes)
                    else v
                    for k, v in ep_data.items()
                }
                results.append(episode)

        self._query_cache[cache_key] = results
        return results

    async def _get_cached_embedding(self, text: str) -> List[float]:
        cache_key = text[:100]
        if cache_key in self._embedding_cache:
            return self._embedding_cache[cache_key]

        embeddings = await self._embedder.embed([text])
        self._embedding_cache[cache_key] = embeddings[0]
        return embeddings[0]

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

    async def clear_session(self, session_id: str):
        episode_ids = await self.redis.smembers(f"sibyl:session:{session_id}")
        for eid in episode_ids:
            eid_str = eid.decode() if isinstance(eid, bytes) else eid
            await self.redis.delete(f"sibyl:episode:{eid_str}")
            await self.redis.delete(f"sibyl:embedding:{eid_str}")
        await self.redis.delete(f"sibyl:session:{session_id}")


class IpcServer:
    def __init__(self, socket_path="/tmp/sibyl-ipc.sock"):
        self.socket_path = socket_path
        self.handlers = {}
        self._server = None

    def register(self, method, handler):
        self.handlers[method] = handler

    async def start(self):
        if os.path.exists(self.socket_path):
            os.unlink(self.socket_path)
        self._server = await asyncio.start_unix_server(
            self._handle_connection, path=self.socket_path
        )
        logger.info(f"IPC server on {self.socket_path}")
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


async def send_ipc_request(method, params):
    reader, writer = await asyncio.open_unix_connection("/tmp/sibyl-ipc.sock")
    request = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    data = json.dumps(request).encode()
    writer.write(struct.pack(">I", len(data)) + data)
    await writer.drain()
    len_buf = await reader.readexactly(4)
    msg_len = struct.unpack(">I", len_buf)[0]
    response = json.loads(await reader.readexactly(msg_len))
    writer.close()
    await writer.wait_closed()
    return response


async def run_server():
    print("[SERVER] Starting optimized IPC server...", flush=True)

    try:
        import redis.asyncio as redis

        redis_client = redis.Redis(host="localhost", port=6379, decode_responses=False)
        await redis_client.ping()
        print("[SERVER] Connected to FalkorDB/Redis at localhost:6379", flush=True)
        store = FalkorDBStore(redis_client)
    except Exception as e:
        print(f"[SERVER] Redis unavailable ({e}), using in-memory store", flush=True)
        store = InMemoryStore()

    from sibyl_memory.embedder.local import LocalEmbedder
    from sibyl_memory.embedder.config import EmbedderConfig

    embedder = LocalEmbedder(
        EmbedderConfig(
            model="sentence-transformers/all-MiniLM-L6-v2",
            device="cpu",
            batch_size=16,
        )
    )
    print("[SERVER] Preloading embedder...", flush=True)
    await embedder.embed(["init"])
    print("[SERVER] Embedder ready!", flush=True)

    store.set_embedder(embedder)
    llm = OllamaLLM(model="qwen2.5:0.5b")

    server = IpcServer()

    async def handle_query(params):
        results = await store.search(
            params.get("query", ""),
            params.get("num_results", 5),
            params.get("session_id"),
        )
        return {
            "episodes": results,
            "entities": [],
            "facts": [],
            "relevance_scores": [1.0] * len(results),
        }

    async def handle_add(params):
        return {
            "status": "ok",
            "episode_id": await store.add_episode(
                params.get("content", ""),
                params.get("source_description", "conversation"),
                params.get("session_id"),
            ),
        }

    async def handle_batch_add(params):
        return {
            "status": "ok",
            "episode_ids": await store.batch_add_episodes(params.get("episodes", [])),
        }

    async def handle_context(params):
        results = await store.search(
            params.get("query", ""), 3, params.get("session_id")
        )
        return {
            "context": "\n".join([r.get("content", "") for r in results])
            or "# No memories"
        }

    async def handle_prompt(params):
        query = params.get("user_query", "")
        context = params.get("context", {})
        memories = params.get("memories", {})
        prompt = f"# Sibyl System Prompt\n\nContext: {json.dumps(context)}\n\nRelevant Memories:\n{memories.get('context', 'None')}\n\nUser Query: {query}\n\nProvide concise response."
        return {"prompt": prompt, "token_estimate": len(prompt) // 4}

    async def handle_llm_refine(params):
        facts = params.get("facts", [])
        query = params.get("query", "")
        threshold = params.get("threshold", 0.25)

        results = []
        query_embedding = await embedder.embed([query])

        for fact in facts:
            fact_text = fact.get("content", str(fact))
            fact_embedding = await embedder.embed([fact_text])
            sim = store._cosine_similarity(query_embedding[0], fact_embedding[0])

            if sim >= threshold:
                try:
                    llm_prompt = (
                        f"Relevant? 0/1. Query: '{query[:30]}' Fact: '{fact_text[:30]}'"
                    )
                    llm_response = await llm.generate(llm_prompt, max_tokens=5)
                    llm_score = 1.0 if "1" in llm_response else sim
                except:
                    llm_score = sim
                results.append(
                    {"fact": fact, "score": llm_score, "embedding_score": sim}
                )

        results.sort(key=lambda x: x["score"], reverse=True)
        return {"results": results}

    server.register("memory.query", handle_query)
    server.register("memory.add_episode", handle_add)
    server.register("memory.batch_add", handle_batch_add)
    server.register("memory.get_context", handle_context)
    server.register("prompt.build", handle_prompt)
    server.register("relevance.evaluate_llm", handle_llm_refine)

    print(f"[SERVER] Ready on {server.socket_path}", flush=True)
    print(
        "[SERVER] Optimizations: FalkorDB persistence, embedding cache, batch ops, qwen2.5:0.5b",
        flush=True,
    )

    await server.start()

    if hasattr(redis_client, "close"):
        await redis_client.close()
    await llm.close()


class InMemoryStore:
    """Fallback in-memory store."""

    def __init__(self):
        self._episodes = {}
        self._embeddings = {}
        self._session_episodes = {}
        self._all_episodes = []
        self._embedder = None

    def set_embedder(self, embedder):
        self._embedder = embedder

    async def add_episode(self, content, source="conversation", session_id=None):
        episode_id = str(uuid4())
        self._episodes[episode_id] = {
            "uuid": episode_id,
            "content": content,
            "source": source,
            "session_id": session_id or "default",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if self._embedder:
            embeddings = await self._embedder.embed([content])
            self._embeddings[episode_id] = embeddings[0]
        if session_id:
            self._session_episodes.setdefault(session_id, []).append(episode_id)
        self._all_episodes.append(episode_id)
        return episode_id

    async def batch_add_episodes(self, episodes):
        return [
            await self.add_episode(
                ep.get("content", ""),
                ep.get("source", "conversation"),
                ep.get("session_id"),
            )
            for ep in episodes
        ]

    async def search(self, query, num_results=5, session_id=None, use_embedding=True):
        if use_embedding and self._embedder:
            query_embeddings = await self._embedder.embed([query])
            scored = []
            ids = (
                self._session_episodes.get(session_id, [])
                if session_id
                else self._all_episodes[-50:]
            )
            for ep_id in ids:
                if ep_id in self._embeddings and ep_id in self._episodes:
                    sim = self._cosine_similarity(
                        query_embeddings[0], self._embeddings[ep_id]
                    )
                    if sim > 0.1:
                        scored.append((self._episodes[ep_id], sim))
            scored.sort(key=lambda x: x[1], reverse=True)
            return [ep for ep, _ in scored[:num_results]]
        return []

    def _cosine_similarity(self, a, b):
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


async def wait_for_socket(timeout=30):
    socket_path = "/tmp/sibyl-ipc.sock"
    for i in range(timeout * 2):
        if os.path.exists(socket_path):
            try:
                reader, writer = await asyncio.open_unix_connection(socket_path)
                writer.close()
                await writer.wait_closed()
                return True
            except:
                pass
        await asyncio.sleep(0.5)
    return False


async def test_all():
    print("\n=== Test 1: FalkorDB Memory Operations ===", flush=True)

    print("1.1 Adding episodes...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "User prefers Python for backend, Rust for systems programming",
            "source_description": "User preference",
            "session_id": "falkordb-test",
        },
    )
    print(
        f"    Added in {time.time() - start:.2f}s: {resp.get('result', {}).get('episode_id', 'error')[:16]}"
    )

    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "pytest is recommended for async testing in Python",
            "session_id": "falkordb-test",
        },
    )
    print(f"    Added: {resp.get('result', {}).get('episode_id', 'error')[:16]}")

    print("1.2 Batch adding episodes...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.batch_add",
        {
            "episodes": [
                {
                    "content": "FalkorDB stores knowledge graph",
                    "session_id": "falkordb-test",
                },
                {
                    "content": "qwen2.5:0.5b is used for LLM operations",
                    "session_id": "falkordb-test",
                },
            ]
        },
    )
    print(
        f"    Batch added {len(resp.get('result', {}).get('episode_ids', []))} in {time.time() - start:.2f}s"
    )

    print("1.3 Querying memory...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.query", {"query": "Python testing", "num_results": 3}
    )
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"    Found {len(episodes)} in {time.time() - start:.2f}s")
    for ep in episodes[:2]:
        print(f"      - {ep.get('content', '')[:50]}...")

    print("1.4 Getting context...", flush=True)
    resp = await send_ipc_request(
        "memory.get_context", {"query": "LLM", "session_id": "falkordb-test"}
    )
    context = resp.get("result", {}).get("context", "")
    print(
        f"    Context: {context[:60]}..."
        if len(context) > 20
        else f"    Context: {context}"
    )

    print("\n=== Test 2: Prompt Building ===", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "prompt.build",
        {
            "user_query": "How to test async Python?",
            "context": {"project": "Sibyl", "language": "Python"},
            "memories": {"context": context},
        },
    )
    prompt = resp.get("result", {}).get("prompt", "")
    tokens = resp.get("result", {}).get("token_estimate", 0)
    print(
        f"    Built in {time.time() - start:.2f}s ({len(prompt)} chars, ~{tokens} tokens)"
    )

    print("\n=== Test 3: OpenCode Integration ===", flush=True)
    try:
        import aiohttp
    except ImportError:
        print("    SKIPPED: aiohttp not installed")
        return

    async with aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=30)
    ) as session:
        print("3.1 Creating session...", flush=True)
        start = time.time()
        async with session.post("http://127.0.0.1:4096/session", json={}) as resp:
            data = await resp.json()
            session_id = data.get("id")
        print(f"    Session: {session_id[:16]} in {time.time() - start:.2f}s")

        print("3.2 Storing in memory...", flush=True)
        await send_ipc_request(
            "memory.add_episode",
            {
                "content": f"OpenCode session {session_id} created for Sibyl",
                "session_id": session_id,
            },
        )

        print("3.3 Sending message...", flush=True)
        start = time.time()
        async with session.post(
            f"http://127.0.0.1:4096/session/{session_id}/message",
            json={
                "parts": [{"type": "text", "text": "List files in current directory"}]
            },
        ) as resp:
            print(f"    Sent: {resp.status} in {time.time() - start:.2f}s")

        await asyncio.sleep(3)

        async with session.get(
            f"http://127.0.0.1:4096/session/{session_id}/message"
        ) as resp:
            msgs = await resp.json()
        print(f"    Got {len(msgs)} messages")

        print("3.4 Storing conversation...", flush=True)
        await send_ipc_request(
            "memory.add_episode",
            {
                "content": f"User asked to list files, got {len(msgs)} messages",
                "session_id": session_id,
            },
        )

        print("3.5 Querying conversation memory...", flush=True)
        resp = await send_ipc_request(
            "memory.query", {"query": "files", "session_id": session_id}
        )
        print(f"    Found {len(resp.get('result', {}).get('episodes', []))} episodes")

        async with session.delete(
            f"http://127.0.0.1:4096/session/{session_id}"
        ) as resp:
            print(f"    Closed: {resp.status}")

    print("\n=== Test 4: LLM Relevance Evaluation (qwen2.5:0.5b) ===", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "relevance.evaluate_llm",
        {
            "facts": [
                {"content": "pytest for async testing"},
                {"content": "Weather is sunny"},
                {"content": "Python backend preferred"},
            ],
            "query": "How to test async code?",
            "threshold": 0.3,
        },
    )
    results = resp.get("result", {}).get("results", [])
    print(
        f"    Evaluated in {time.time() - start:.2f}s, found {len(results)} relevant:"
    )
    for r in results:
        fact = r.get("fact", {}).get("content", "")
        score = r.get("score", 0)
        emb = r.get("embedding_score", 0)
        print(f"      [LLM:{score:.2f} Emb:{emb:.2f}] {fact[:40]}")


async def main():
    print("\n" + "=" * 60, flush=True)
    print("Sibyl Optimized Integration Test (FalkorDB + qwen2.5:0.5b)", flush=True)
    print("=" * 60, flush=True)

    server_task = asyncio.create_task(run_server())

    print("Waiting for server...", flush=True)
    if not await wait_for_socket(30):
        print("Server failed to start!", flush=True)
        server_task.cancel()
        return

    start_time = time.time()
    await test_all()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60, flush=True)
    print(f"All tests completed in {elapsed:.2f}s!", flush=True)
    print("=" * 60, flush=True)

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
