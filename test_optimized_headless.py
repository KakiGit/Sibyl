#!/usr/bin/env python
"""Optimized headless integration test for Sibyl with smaller local LLM."""

import asyncio
import json
import struct
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

from sibyl_memory import SimpleMemoryStore
from sibyl_memory.llm.config import LLMConfig
from sibyl_memory.embedder.local import LocalEmbedder
from sibyl_memory.embedder.config import EmbedderConfig
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, PromptHandler
from sibyl_relevance import CachedRelevanceEvaluator


class OptimizedMemoryHandler:
    """Handler using simple memory store with embedding-based search."""

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


async def send_ipc_request(method: str, params: dict, request_id: int = 1):
    reader, writer = await asyncio.open_unix_connection("/tmp/sibyl-ipc.sock")
    request = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params,
    }
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
        model="sentence-transformers/all-MiniLM-L6-v2",
        device="cpu",
    )
    embedder = LocalEmbedder(embedder_config)

    print("[SERVER] Preloading embedding model...", flush=True)
    await embedder.embed(["test"])
    print("[SERVER] Embedding model loaded!", flush=True)

    simple_store = SimpleMemoryStore(redis_client)
    simple_store.set_embedder(embedder)

    prompt_builder = TemplatePromptBuilder()

    relevance_evaluator = CachedRelevanceEvaluator(
        embedder=embedder,
        cache_ttl=600,
        use_llm=False,
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
        "memory.query",
        {"query": "Python programming", "num_results": 5},
    )
    elapsed = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"    Found {len(episodes)} episodes in {elapsed:.2f}s")
    for ep in episodes[:2]:
        content = ep.get("content", "")
        print(f"      - {content[:60]}...")

    print("1.4 Getting context...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.get_context",
        {"query": "testing", "session_id": "test-session-1"},
    )
    elapsed = time.time() - start
    context = resp.get("result", {}).get("context", "")
    print(f"    Context ({len(context)} chars) in {elapsed:.2f}s")
    return True


async def test_relevance_evaluation():
    print("\n=== Test 2: Relevance Evaluation (Embedding-based) ===", flush=True)

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

    print("3.1 Building prompt with memory context...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "prompt.build",
        {
            "user_query": "What testing framework should I use for my Python project?",
            "context": {
                "project": "Sibyl",
                "language": "Python",
            },
            "memories": {
                "context": "User prefers pytest for testing. Python is used for backend.",
            },
        },
    )
    elapsed = time.time() - start
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"    Built prompt ({len(prompt)} chars) in {elapsed:.2f}s")
    print(f"    Preview: {prompt[:200]}...")
    return True


async def test_opencode_integration():
    print("\n=== Test 4: OpenCode Integration ===", flush=True)

    try:
        import aiohttp
    except ImportError:
        print("    SKIPPED: aiohttp not installed")
        return True

    base_url = "http://127.0.0.1:4096"
    session_id = None

    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=60)
        ) as session:
            print("4.1 Creating OpenCode session...", flush=True)
            start = time.time()
            async with session.post(f"{base_url}/session", json={}) as resp:
                if resp.status != 200:
                    print(f"    Failed to create session: {resp.status}")
                    return True
                data = await resp.json()
                session_id = data.get("id")
            elapsed = time.time() - start
            print(f"    Created session: {session_id} in {elapsed:.2f}s")

            print("4.2 Adding session to memory...", flush=True)
            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"OpenCode session {session_id} created for Sibyl integration test",
                    "source_description": "Session creation",
                    "session_id": session_id,
                },
            )

            print("4.3 Getting memory context...", flush=True)
            resp = await send_ipc_request(
                "memory.get_context",
                {"query": "OpenCode session", "session_id": session_id},
            )
            context = resp.get("result", {}).get("context", "")
            print(f"    Context: {context[:100]}...")

            print("4.4 Sending message to OpenCode...", flush=True)
            start = time.time()
            try:
                async with session.post(
                    f"{base_url}/session/{session_id}/message",
                    json={
                        "parts": [{"type": "text", "text": "What is the project name?"}]
                    },
                ) as resp:
                    if resp.status == 200:
                        msg_data = await resp.json()
                        elapsed = time.time() - start
                        print(f"    Message sent successfully in {elapsed:.2f}s")
                    else:
                        text = await resp.text()
                        elapsed = time.time() - start
                        print(
                            f"    Message failed: {resp.status} in {elapsed:.2f}s - {text[:100]}"
                        )
            except Exception as e:
                elapsed = time.time() - start
                print(f"    Error: {e} in {elapsed:.2f}s")

            print("4.5 Waiting for response...", flush=True)
            await asyncio.sleep(3)

            async with session.get(f"{base_url}/session/{session_id}/message") as resp:
                messages = await resp.json()
            print(f"    Got {len(messages)} messages")

            print("4.6 Storing conversation in memory...", flush=True)
            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"User asked about project files. OpenCode responded with {len(messages)} messages.",
                    "source_description": "Conversation",
                    "session_id": session_id,
                },
            )

            print("4.7 Querying memory for conversation...", flush=True)
            resp = await send_ipc_request(
                "memory.query",
                {"query": "project files", "session_id": session_id},
            )
            episodes = resp.get("result", {}).get("episodes", [])
            print(f"    Found {len(episodes)} relevant episodes")

            print("4.8 Cleaning up session...", flush=True)
            async with session.delete(f"{base_url}/session/{session_id}") as resp:
                print(f"    Session closed: {resp.status}")

    except aiohttp.ClientError as e:
        print(f"    OpenCode connection error: {e}")
    except Exception as e:
        print(f"    Error: {e}")

    return True


async def test_session_filtering():
    print("\n=== Test 5: Session Filtering ===", flush=True)

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

    print("5.1 Querying session-x specific memory...", flush=True)
    resp = await send_ipc_request(
        "memory.query",
        {"query": "discussed", "session_id": "session-x"},
    )
    episodes_x = resp.get("result", {}).get("episodes", [])
    print(f"    Session X: {len(episodes_x)} episodes")

    print("5.2 Querying session-y specific memory...", flush=True)
    resp = await send_ipc_request(
        "memory.query",
        {"query": "discussed", "session_id": "session-y"},
    )
    episodes_y = resp.get("result", {}).get("episodes", [])
    print(f"    Session Y: {len(episodes_y)} episodes")

    print("5.3 Querying all sessions...", flush=True)
    resp = await send_ipc_request(
        "memory.query",
        {"query": "discussed"},
    )
    all_episodes = resp.get("result", {}).get("episodes", [])
    print(f"    All sessions: {len(all_episodes)} episodes")

    return True


async def run_tests():
    print("\n" + "=" * 60, flush=True)
    print("Sibyl Optimized Headless Test (qwen2.5:0.5b)", flush=True)
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
    await asyncio.sleep(8)

    await run_tests()

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
