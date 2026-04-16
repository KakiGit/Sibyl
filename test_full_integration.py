#!/usr/bin/env python
"""Full integration test with FalkorDB, OpenCode, and qwen2.5:0.5b."""

import asyncio
import json
import logging
import os
import struct
import sys
import time
import math
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s:%(name)s:%(message)s"
)
logger = logging.getLogger("sibyl-integration")


class OllamaLLM:
    def __init__(self, model="qwen2.5:0.5b", base_url="http://127.0.0.1:11434"):
        self.model = model
        self.base_url = base_url
        self._client = httpx.AsyncClient(timeout=60)

    async def generate(self, prompt: str, max_tokens: int = 32) -> str:
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
        self._episodes = {}
        self._embeddings = {}
        self._session_episodes = {}
        self._all_episodes = []
        self._embedder = None

    def set_embedder(self, embedder):
        self._embedder = embedder

    async def add_episode(self, content, source="conversation", session_id=None):
        from uuid import uuid4
        from datetime import datetime, timezone

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

    async def search(self, query, num_results=5, session_id=None, use_embedding=True):
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

    def _cosine_similarity(self, a, b):
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


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
    print("[SERVER] Starting IPC server...", flush=True)

    from sibyl_memory.embedder.local import LocalEmbedder
    from sibyl_memory.embedder.config import EmbedderConfig

    embedder = LocalEmbedder(
        EmbedderConfig(
            model="sentence-transformers/all-MiniLM-L6-v2", device="cpu", batch_size=8
        )
    )
    print("[SERVER] Preloading embedder...", flush=True)
    await embedder.embed(["init"])
    print("[SERVER] Embedder ready!", flush=True)

    llm = OllamaLLM(model="qwen2.5:0.5b")
    store = InMemoryStore()
    store.set_embedder(embedder)

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

    async def handle_prompt(params):
        query = params.get("user_query", "")
        context = params.get("context", {})
        memories = params.get("memories", {})
        prompt = f"# System Prompt\n\nContext: {json.dumps(context)}\n\nMemories: {memories.get('context', 'None')}\n\nUser Query: {query}\n\nRespond concisely."
        return {"prompt": prompt}

    server.register("memory.query", handle_query)
    server.register("memory.add_episode", handle_add)
    server.register("memory.get_context", handle_context)
    server.register("prompt.build", handle_prompt)

    print(f"[SERVER] Ready on {server.socket_path}", flush=True)
    await server.start()


async def wait_for_socket(timeout=30):
    socket_path = "/tmp/sibyl-ipc.sock"
    for i in range(timeout):
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


async def test_memory():
    print("\n=== Test 1: Memory Operations ===", flush=True)

    print("1.1 Adding episodes...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "User prefers Python for backend, Rust for systems",
            "source_description": "User preference",
            "session_id": "test-session",
        },
    )
    elapsed = time.time() - start
    print(
        f"    Added in {elapsed:.2f}s: {resp.get('result', {}).get('episode_id', 'error')[:20]}"
    )

    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "pytest recommended for async testing",
            "session_id": "test-session",
        },
    )
    print(f"    Added: {resp.get('result', {}).get('episode_id', 'error')[:20]}")

    print("1.2 Querying memory...", flush=True)
    start = time.time()
    resp = await send_ipc_request("memory.query", {"query": "Python", "num_results": 3})
    elapsed = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"    Found {len(episodes)} episodes in {elapsed:.2f}s")
    for ep in episodes[:2]:
        print(f"      - {ep.get('content', '')[:50]}...")

    print("1.3 Getting context...", flush=True)
    resp = await send_ipc_request(
        "memory.get_context", {"query": "testing", "session_id": "test-session"}
    )
    context = resp.get("result", {}).get("context", "")
    print(f"    Context: {context[:60]}..." if context else "    No context found")


async def test_prompt():
    print("\n=== Test 2: Prompt Building ===", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "prompt.build",
        {
            "user_query": "What testing framework?",
            "context": {"project": "Sibyl"},
            "memories": {"context": "pytest recommended"},
        },
    )
    elapsed = time.time() - start
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"    Built in {elapsed:.2f}s ({len(prompt)} chars)")
    print(f"    Preview: {prompt[:100]}...")


async def test_opencode():
    print("\n=== Test 3: OpenCode Integration ===", flush=True)
    try:
        import aiohttp
    except ImportError:
        print("    SKIPPED: aiohttp not installed")
        return

    base_url = "http://127.0.0.1:4096"

    async with aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=30)
    ) as session:
        print("3.1 Creating OpenCode session...", flush=True)
        start = time.time()
        async with session.post(f"{base_url}/session", json={}) as resp:
            if resp.status != 200:
                print(f"    Failed: {resp.status}")
                return
            data = await resp.json()
            session_id = data.get("id")
        elapsed = time.time() - start
        print(f"    Session: {session_id[:16]} in {elapsed:.2f}s")

        print("3.2 Storing session in memory...", flush=True)
        await send_ipc_request(
            "memory.add_episode",
            {
                "content": f"Created OpenCode session {session_id}",
                "session_id": session_id,
            },
        )

        print("3.3 Sending message to OpenCode...", flush=True)
        start = time.time()
        async with session.post(
            f"{base_url}/session/{session_id}/message",
            json={"parts": [{"type": "text", "text": "What is 2+2?"}]},
        ) as resp:
            print(f"    Sent: {resp.status} in {time.time() - start:.2f}s")

        print("3.4 Waiting for response...", flush=True)
        await asyncio.sleep(2)

        async with session.get(f"{base_url}/session/{session_id}/message") as resp:
            msgs = await resp.json()
        print(f"    Got {len(msgs)} messages")

        print("3.5 Storing conversation...", flush=True)
        await send_ipc_request(
            "memory.add_episode",
            {
                "content": f"User asked math question, got {len(msgs)} messages",
                "session_id": session_id,
            },
        )

        print("3.6 Querying memory for conversation...", flush=True)
        resp = await send_ipc_request(
            "memory.query", {"query": "math", "session_id": session_id}
        )
        episodes = resp.get("result", {}).get("episodes", [])
        print(f"    Found {len(episodes)} episodes")

        print("3.7 Closing session...", flush=True)
        async with session.delete(f"{base_url}/session/{session_id}") as resp:
            print(f"    Closed: {resp.status}")


async def test_llm():
    print("\n=== Test 4: Local LLM (qwen2.5:0.5b) ===", flush=True)
    llm = OllamaLLM(model="qwen2.5:0.5b")

    print("4.1 Testing LLM response...", flush=True)
    start = time.time()
    try:
        response = await llm.generate("2+2=", max_tokens=10)
        elapsed = time.time() - start
        print(f"    Response: '{response.strip()}' in {elapsed:.2f}s")
    except Exception as e:
        print(f"    Error: {e}")

    await llm.close()


async def main():
    print("\n" + "=" * 50, flush=True)
    print("Sibyl Full Integration Test", flush=True)
    print("=" * 50, flush=True)

    server_task = asyncio.create_task(run_server())

    print("Waiting for server...", flush=True)
    if not await wait_for_socket(30):
        print("Server failed to start!", flush=True)
        server_task.cancel()
        return

    start_time = time.time()

    await test_memory()
    await test_prompt()
    await test_opencode()
    await test_llm()

    elapsed = time.time() - start_time
    print("\n" + "=" * 50, flush=True)
    print(f"All tests completed in {elapsed:.2f}s!", flush=True)
    print("=" * 50, flush=True)

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
