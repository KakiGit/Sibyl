#!/usr/bin/env python
"""Test with LLM-based relevance evaluation using qwen2.5:0.5b."""

import asyncio
import json
import logging
import os
import struct
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4
import math
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s:%(name)s:%(message)s"
)
logger = logging.getLogger("sibyl-llm-test")


class OllamaLLM:
    """Lightweight Ollama client for qwen2.5:0.5b."""

    def __init__(
        self, model: str = "qwen2.5:0.5b", base_url: str = "http://127.0.0.1:11434"
    ):
        self.model = model
        self.base_url = base_url
        self._client = httpx.AsyncClient(timeout=30)

    async def generate(self, prompt: str, max_tokens: int = 64) -> str:
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_tokens, "temperature": 0.0},
        }
        response = await self._client.post(url, json=payload)
        response.raise_for_status()
        return response.json().get("response", "")

    async def close(self):
        await self._client.aclose()


class InMemoryStore:
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
            if session_id not in self._session_episodes:
                self._session_episodes[session_id] = []
            self._session_episodes[session_id].append(episode_id)
        self._all_episodes.append(episode_id)
        return episode_id

    async def search(
        self,
        query: str,
        num_results: int = 5,
        session_id: Optional[str] = None,
        use_embedding: bool = True,
    ) -> List[dict]:
        if use_embedding and self._embedder:
            query_embeddings = await self._embedder.embed([query])
            scored = []
            episode_ids = (
                self._session_episodes.get(session_id, [])
                if session_id
                else self._all_episodes[-50:]
            )
            for ep_id in episode_ids:
                if ep_id in self._embeddings and ep_id in self._episodes:
                    sim = self._cosine_similarity(
                        query_embeddings[0], self._embeddings[ep_id]
                    )
                    if sim > 0.1:
                        scored.append((self._episodes[ep_id], sim))
            scored.sort(key=lambda x: x[1], reverse=True)
            return [ep for ep, _ in scored[:num_results]]
        return []

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


class IpcServer:
    def __init__(self, socket_path: str = "/tmp/sibyl-ipc.sock"):
        self.socket_path = socket_path
        self.handlers: Dict[str, any] = {}
        self._server = None

    def register(self, method: str, handler):
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


class HybridRelevanceEvaluator:
    """Relevance evaluator: embedding-fast + optional LLM-refinement."""

    def __init__(
        self, embedder, llm: Optional[OllamaLLM] = None, use_llm: bool = False
    ):
        self.embedder = embedder
        self.llm = llm
        self.use_llm = use_llm
        self._query_cache: Dict[str, List[float]] = {}

    async def evaluate(
        self, facts: List[dict], query: str, threshold: float = 0.25
    ) -> List[dict]:
        if query not in self._query_cache:
            embeddings = await self.embedder.embed([query])
            self._query_cache[query] = embeddings[0]
        query_embedding = self._query_cache[query]

        fact_texts = [f.get("content", str(f)) for f in facts]
        fact_embeddings = await self.embedder.embed(fact_texts)

        results = []
        for fact, fact_embedding in zip(facts, fact_embeddings):
            sim = self._cosine_similarity(query_embedding, fact_embedding)
            if sim >= threshold:
                if self.use_llm and self.llm:
                    llm_score = await self._llm_refine(
                        query, fact.get("content", ""), sim
                    )
                    results.append(
                        {"fact": fact, "score": llm_score, "embedding_score": sim}
                    )
                else:
                    results.append({"fact": fact, "score": sim})

        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    async def _llm_refine(self, query: str, fact: str, embedding_score: float) -> float:
        prompt = (
            f"Score relevance 0-1. Query: '{query[:50]}' Memory: '{fact[:50]}'. Score:"
        )
        try:
            response = await self.llm.generate(prompt, max_tokens=10)
            for word in response.split():
                try:
                    score = float(word.strip())
                    return max(0.0, min(1.0, score))
                except ValueError:
                    continue
        except Exception as e:
            logger.warning(f"LLM refine failed: {e}")
        return embedding_score

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


async def send_ipc_request(method: str, params: dict):
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


async def run_server_with_llm():
    print("[SERVER] Starting with qwen2.5:0.5b...", flush=True)

    from sibyl_memory.embedder.local import LocalEmbedder
    from sibyl_memory.embedder.config import EmbedderConfig

    embedder = LocalEmbedder(
        EmbedderConfig(
            model="sentence-transformers/all-MiniLM-L6-v2", device="cpu", batch_size=8
        )
    )
    await embedder.embed(["init"])
    print("[SERVER] Embedder ready", flush=True)

    llm = OllamaLLM(model="qwen2.5:0.5b")
    store = InMemoryStore()
    store.set_embedder(embedder)
    evaluator = HybridRelevanceEvaluator(embedder, llm, use_llm=False)

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

    async def handle_context(params):
        results = await store.search(
            params.get("query", ""), 3, params.get("session_id")
        )
        return {
            "context": "\n".join([r.get("content", "") for r in results])
            or "# No memories"
        }

    async def handle_relevance(params):
        return {
            "results": await evaluator.evaluate(
                params.get("facts", []),
                params.get("query", ""),
                params.get("threshold", 0.25),
            )
        }

    async def handle_llm_relevance(params):
        evaluator.use_llm = True
        results = await evaluator.evaluate(
            params.get("facts", []),
            params.get("query", ""),
            params.get("threshold", 0.25),
        )
        evaluator.use_llm = False
        return {"results": results}

    server.register("memory.query", handle_query)
    server.register("memory.add_episode", handle_add)
    server.register("memory.get_context", handle_context)
    server.register("relevance.evaluate", handle_relevance)
    server.register("relevance.evaluate_llm", handle_llm_relevance)

    print(f"[SERVER] Ready on {server.socket_path}", flush=True)
    await server.start()


async def test_embedding_vs_llm():
    print("\n=== Test: Embedding vs LLM Relevance ===", flush=True)

    await send_ipc_request(
        "memory.add_episode",
        {"content": "User likes Python for data science", "session_id": "test"},
    )
    await send_ipc_request(
        "memory.add_episode",
        {"content": "Weather today is rainy", "session_id": "test"},
    )
    await send_ipc_request(
        "memory.add_episode",
        {"content": "pytest is best for testing async code", "session_id": "test"},
    )

    facts = [
        {"content": "Python for data science", "type": "fact"},
        {"content": "Weather rainy", "type": "fact"},
        {"content": "pytest async testing", "type": "fact"},
        {"content": "Rust for systems", "type": "fact"},
    ]
    query = "What testing tool for Python?"

    print("1. Embedding-only evaluation:", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "relevance.evaluate", {"facts": facts, "query": query, "threshold": 0.3}
    )
    elapsed = time.time() - start
    print(f"   Time: {elapsed:.3f}s")
    for r in resp.get("result", {}).get("results", []):
        print(f"   [{r['score']:.2f}] {r['fact']['content'][:30]}")

    print("\n2. LLM-refined evaluation (qwen2.5:0.5b):", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "relevance.evaluate_llm", {"facts": facts, "query": query, "threshold": 0.3}
    )
    elapsed = time.time() - start
    print(f"   Time: {elapsed:.3f}s")
    for r in resp.get("result", {}).get("results", []):
        emb_score = r.get("embedding_score", r["score"])
        print(
            f"   [LLM:{r['score']:.2f} Emb:{emb_score:.2f}] {r['fact']['content'][:30]}"
        )


async def test_opencode_integration():
    print("\n=== Test: OpenCode Integration ===", flush=True)

    try:
        import aiohttp
    except ImportError:
        print("   SKIPPED: aiohttp missing", flush=True)
        return

    async with aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=15)
    ) as session:
        async with session.post("http://127.0.0.1:4096/session", json={}) as resp:
            data = await resp.json()
            sid = data.get("id")
        print(f"   Session: {sid[:12]}", flush=True)

        await send_ipc_request(
            "memory.add_episode",
            {"content": f"Created OpenCode session {sid}", "session_id": sid},
        )

        async with session.post(
            f"http://127.0.0.1:4096/session/{sid}/message",
            json={"parts": [{"type": "text", "text": "Hello"}]},
        ) as resp:
            print(f"   Sent message: {resp.status}", flush=True)

        await asyncio.sleep(1)

        async with session.get(f"http://127.0.0.1:4096/session/{sid}/message") as resp:
            msgs = await resp.json()
        print(f"   Messages: {len(msgs)}", flush=True)

        async with session.delete(f"http://127.0.0.1:4096/session/{sid}") as resp:
            print(f"   Closed: {resp.status}", flush=True)


async def main():
    print("\n" + "=" * 50, flush=True)
    print("Sibyl LLM Test (qwen2.5:0.5b)", flush=True)
    print("=" * 50, flush=True)

    server_task = asyncio.create_task(run_server_with_llm())
    print("Waiting for server...", flush=True)
    await asyncio.sleep(3)

    start = time.time()
    await test_embedding_vs_llm()
    await test_opencode_integration()

    print("\n" + "=" * 50, flush=True)
    print(f"Completed in {time.time() - start:.2f}s", flush=True)
    print("=" * 50, flush=True)

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
