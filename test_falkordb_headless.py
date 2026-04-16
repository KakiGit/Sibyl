#!/usr/bin/env python
"""Final integration test with real FalkorDB and optimized model settings."""

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

    print("[SERVER] Connecting to FalkorDB (localhost:6379)...", flush=True)
    redis_client = redis.Redis(host="localhost", port=6379, decode_responses=False)

    try:
        await redis_client.ping()
        print("[SERVER] FalkorDB connected!", flush=True)
    except Exception as e:
        print(f"[SERVER] FalkorDB connection failed: {e}", flush=True)
        return

    embedder_config = EmbedderConfig(
        model="sentence-transformers/all-MiniLM-L6-v2",
        device="cpu",
        batch_size=32,
    )
    embedder = LocalEmbedder(embedder_config)

    print("[SERVER] Preloading embedding model...", flush=True)
    await embedder.embed(["initialization"])
    print("[SERVER] Embedding model ready!", flush=True)

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
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register(
        "memory.query",
        lambda p: simple_store.search(
            p.get("query", ""),
            p.get("num_results", 10),
            p.get("session_id"),
            use_embedding=True,
        ).then(
            lambda r: {
                "episodes": r,
                "entities": [],
                "facts": [],
                "relevance_scores": [1.0] * len(r),
            }
        ),
    )

    async def handle_query(params):
        results = await simple_store.search(
            params.get("query", ""),
            params.get("num_results", 10),
            params.get("session_id"),
            use_embedding=True,
        )
        return {
            "episodes": results,
            "entities": [],
            "facts": [],
            "relevance_scores": [1.0] * len(results),
        }

    async def handle_add(params):
        episode_id = await simple_store.add_episode(
            params.get("content", ""),
            params.get("source_description", "conversation"),
            params.get("session_id"),
        )
        return {"status": "ok", "episode_id": episode_id}

    async def handle_context(params):
        results = await simple_store.search(
            params.get("query", ""), 5, params.get("session_id"), use_embedding=True
        )
        context = "\n".join([r.get("content", "") for r in results])
        return {"context": context or "# No relevant memories found"}

    server.register("memory.query", handle_query)
    server.register("memory.add_episode", handle_add)
    server.register("memory.get_context", handle_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    print(f"[SERVER] IPC server listening on {server.socket_path}", flush=True)
    await server.start()


async def test_memory():
    print("\n=== Test 1: Memory Operations (FalkorDB) ===", flush=True)

    start = time.time()
    resp = await send_ipc(
        "memory.add_episode",
        {
            "content": "User prefers qwen2.5:0.5b for fast local inference.",
            "source_description": "Preference",
            "session_id": "final-test",
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
            "content": "Sibyl architecture: Rust TUI + Python memory system + IPC bridge.",
            "source_description": "Architecture",
            "session_id": "final-test",
        },
    )
    elapsed = time.time() - start
    print(f"  1.2 Add episode: {elapsed:.3f}s")

    start = time.time()
    resp = await send_ipc(
        "memory.add_episode",
        {
            "content": "FalkorDB stores memory graphs with embedding-based search.",
            "source_description": "Tech",
            "session_id": "final-test",
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
        "memory.get_context", {"query": "architecture", "session_id": "final-test"}
    )
    elapsed = time.time() - start
    context = resp.get("result", {}).get("context", "")
    print(f"  1.5 Get context: {elapsed:.3f}s - {len(context)} chars")


async def test_relevance():
    print("\n=== Test 2: Relevance Evaluation ===", flush=True)

    start = time.time()
    resp = await send_ipc(
        "relevance.evaluate",
        {
            "facts": [
                {"content": "qwen2.5:0.5b optimized for speed"},
                {"content": "FalkorDB is a graph database"},
                {"content": "IPC uses Unix domain sockets"},
                {"content": "Embedding search finds similar content"},
            ],
            "query": "fast inference model",
            "threshold": 0.3,
        },
    )
    elapsed = time.time() - start
    results = resp.get("result", {}).get("results", [])
    print(f"  2.1 Evaluated 4 facts: {elapsed:.3f}s - {len(results)} relevant")
    for r in results[:3]:
        print(
            f"      [{r.get('score', 0):.2f}] {r.get('fact', {}).get('content', '')[:45]}"
        )


async def test_prompt():
    print("\n=== Test 3: Prompt Building ===", flush=True)

    start = time.time()
    resp = await send_ipc(
        "prompt.build",
        {
            "user_query": "How to optimize model inference?",
            "context": {"project": "Sibyl"},
            "memories": {"context": "Use smaller models like qwen2.5:0.5b"},
        },
    )
    elapsed = time.time() - start
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"  3.1 Build prompt: {elapsed:.3f}s - {len(prompt)} chars")


async def test_opencode():
    print("\n=== Test 4: OpenCode Integration ===", flush=True)

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
                    print(f"  4.1 Create session FAILED: {resp.status}")
                    return
                data = await resp.json()
                session_id = data.get("id")
            elapsed = time.time() - start
            print(f"  4.1 Create session: {elapsed:.2f}s - {session_id[:16]}")

            await send_ipc(
                "memory.add_episode",
                {
                    "content": f"OpenCode session started: {session_id}",
                    "source_description": "Session",
                    "session_id": session_id,
                },
            )

            start = time.time()
            async with session.post(
                f"{base_url}/session/{session_id}/message",
                json={"parts": [{"type": "text", "text": "List files in current dir"}]},
            ) as resp:
                elapsed = time.time() - start
                status = "OK" if resp.status == 200 else str(resp.status)
                print(f"  4.2 Send message: {elapsed:.2f}s - {status}")

            await asyncio.sleep(4)

            start = time.time()
            async with session.get(f"{base_url}/session/{session_id}/message") as resp:
                messages = await resp.json()
            elapsed = time.time() - start
            print(f"  4.3 Get messages: {elapsed:.2f}s - {len(messages)} messages")

            for msg in messages[-2:]:
                role = msg.get("role", "?")
                content = str(msg.get("content", ""))[:50]
                print(f"      [{role}] {content}...")

            await send_ipc(
                "memory.add_episode",
                {
                    "content": f"Conversation completed: {len(messages)} messages",
                    "source_description": "Summary",
                    "session_id": session_id,
                },
            )

            resp = await send_ipc(
                "memory.query",
                {"query": "conversation session", "session_id": session_id},
            )
            episodes = resp.get("result", {}).get("episodes", [])
            print(f"  4.4 Memory recall: {len(episodes)} episodes")

            async with session.delete(f"{base_url}/session/{session_id}") as resp:
                print(f"  4.5 Close session: {resp.status}")

    except asyncio.TimeoutError:
        print("  TIMEOUT: OpenCode response took too long")
    except Exception as e:
        print(f"  ERROR: {type(e).__name__}: {e}")


async def run_tests():
    print("\n" + "=" * 60, flush=True)
    print("Sibyl Full Integration Test", flush=True)
    print("Models: qwen2.5:0.5b (LLM) + all-MiniLM-L6-v2 (embeddings)", flush=True)
    print("Storage: FalkorDB (localhost:6379)", flush=True)
    print("=" * 60, flush=True)

    start_time = time.time()

    await test_memory()
    await test_relevance()
    await test_prompt()
    await test_opencode()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60, flush=True)
    print(f"All tests completed in {elapsed:.2f}s!", flush=True)
    print("=" * 60, flush=True)


async def wait_for_socket(path: str, timeout: float = 30.0):
    """Wait for socket to become available."""
    import os

    start = time.time()
    while time.time() - start < timeout:
        if os.path.exists(path):
            try:
                reader, writer = await asyncio.open_unix_connection(path)
                writer.close()
                await writer.wait_closed()
                return True
            except:
                pass
        await asyncio.sleep(0.5)
    return False


async def main():
    server_task = asyncio.create_task(run_server())

    print("Waiting for server startup...", flush=True)
    if await wait_for_socket("/tmp/sibyl-ipc.sock", timeout=30):
        print("Server ready!", flush=True)
    else:
        print("Server failed to start!", flush=True)
        server_task.cancel()
        return

    await run_tests()

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
