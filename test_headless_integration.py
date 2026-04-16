#!/usr/bin/env python
"""Headless integration test for Sibyl with OpenCode REST API."""

import asyncio
import json
import struct
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

from sibyl_memory import MemorySystem, SimpleMemoryStore
from sibyl_memory.llm.config import LLMConfig
from sibyl_memory.graphiti_client import GraphitiClient
from sibyl_memory.embedder.local import LocalEmbedder
from sibyl_memory.embedder.config import EmbedderConfig
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, MemoryHandler, PromptHandler
from sibyl_relevance import CachedRelevanceEvaluator


class HeadlessHandler:
    def __init__(self, simple_store, embedder):
        self.store = simple_store
        self.embedder = embedder

    async def handle_query(self, params: dict) -> dict:
        query = params.get("query", "")
        num_results = params.get("num_results", 10)
        session_id = params.get("session_id")
        results = await self.store.search(query, num_results, session_id)
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
        results = await self.store.search(query, 5, session_id)
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

    print("Connecting to FalkorDB...", flush=True)
    redis_client = redis.Redis(host="localhost", port=6379, decode_responses=False)

    embedder_config = EmbedderConfig()
    embedder = LocalEmbedder(embedder_config)

    print("Preloading embedding model...", flush=True)
    await embedder.embed(["test"])
    print("Embedding model loaded!", flush=True)

    simple_store = SimpleMemoryStore(redis_client)
    simple_store.set_embedder(embedder)

    prompt_builder = TemplatePromptBuilder()

    llm_config = LLMConfig(
        base_url="http://127.0.0.1:11434",
        model="qwen2.5:0.5b",
        timeout=30,
    )

    client = GraphitiClient(llm_config=llm_config)
    relevance_evaluator = CachedRelevanceEvaluator(
        llm_client=client._llm_client,
        cache_ttl=300,
        threshold=0.5,
    )

    server = IpcServer()

    memory_handler = HeadlessHandler(simple_store, embedder)
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    print("IPC server listening on /tmp/sibyl-ipc.sock", flush=True)
    await server.start()


async def test_opencode_with_memory():
    import aiohttp

    base_url = "http://127.0.0.1:4096"
    print("\n=== OpenCode + Memory Integration Test ===")

    session_id = None
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{base_url}/session", json={}) as resp:
            data = await resp.json()
            session_id = data.get("id")
            print(f"Created session: {session_id}")

        await send_ipc_request(
            "memory.add_episode",
            {
                "content": f"OpenCode session {session_id} created for Sibyl integration test",
                "source_description": "Session creation",
                "session_id": session_id,
            },
        )
        print("Added session creation to memory")

        resp = await send_ipc_request(
            "memory.get_context",
            {"query": "OpenCode", "session_id": session_id},
        )
        context = resp.get("result", {}).get("context", "")
        print(f"Memory context: {context[:200]}...")

        resp = await send_ipc_request(
            "prompt.build",
            {
                "user_query": "What sessions have I created?",
                "context": {"project": "Sibyl"},
                "memories": {"context": context},
            },
        )
        prompt = resp.get("result", {}).get("prompt", "")
        print(f"Built prompt with memory: {len(prompt)} chars")

        async with session.post(
            f"{base_url}/session/{session_id}/message",
            json={
                "parts": [{"type": "text", "text": "What files are in this project?"}]
            },
        ) as resp:
            print(f"Sent message: {resp.status}")

        await asyncio.sleep(3)

        async with session.get(f"{base_url}/session/{session_id}/message") as resp:
            messages = await resp.json()
            print(f"Got {len(messages)} messages")

        await send_ipc_request(
            "memory.add_episode",
            {
                "content": f"User asked about project files. OpenCode responded with {len(messages)} messages.",
                "source_description": "Conversation",
                "session_id": session_id,
            },
        )
        print("Added conversation to memory")

        resp = await send_ipc_request(
            "memory.query",
            {"query": "project files", "session_id": session_id},
        )
        episodes = resp.get("result", {}).get("episodes", [])
        print(f"Found {len(episodes)} relevant episodes")

        async with session.delete(f"{base_url}/session/{session_id}") as resp:
            print(f"Closed session: {resp.status}")

    return True


async def test_memory_session_filtering():
    print("\n=== Memory Session Filtering Test ===")

    await send_ipc_request(
        "memory.add_episode",
        {
            "content": "Session A: User discussed Python type hints",
            "source_description": "Session A",
            "session_id": "session-a",
        },
    )

    await send_ipc_request(
        "memory.add_episode",
        {
            "content": "Session B: User discussed Rust async programming",
            "source_description": "Session B",
            "session_id": "session-b",
        },
    )

    resp = await send_ipc_request(
        "memory.query",
        {"query": "programming", "session_id": "session-a"},
    )
    episodes_a = resp.get("result", {}).get("episodes", [])
    print(f"Session A episodes: {len(episodes_a)}")

    resp = await send_ipc_request(
        "memory.query",
        {"query": "programming", "session_id": "session-b"},
    )
    episodes_b = resp.get("result", {}).get("episodes", [])
    print(f"Session B episodes: {len(episodes_b)}")

    resp = await send_ipc_request(
        "memory.query",
        {"query": "programming"},
    )
    all_episodes = resp.get("result", {}).get("episodes", [])
    print(f"All episodes: {len(all_episodes)}")

    return True


async def test_relevance_with_memory():
    print("\n=== Relevance Evaluation Test ===")

    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "User prefers using pytest for testing. Dislikes unittest framework.",
            "source_description": "User preference",
        },
    )
    print(f"Added preference episode")

    resp = await send_ipc_request(
        "memory.get_context",
        {"query": "testing preferences"},
    )
    context = resp.get("result", {}).get("context", "")
    print(f"Context: {context[:200]}...")

    resp = await send_ipc_request(
        "relevance.evaluate",
        {
            "facts": [
                {"content": "pytest is preferred for testing", "type": "fact"},
                {"content": "The weather forecast shows rain", "type": "fact"},
                {"content": "unittest is disliked", "type": "fact"},
            ],
            "query": "How should I write tests?",
            "threshold": 0.3,
        },
    )
    results = resp.get("result", {}).get("results", [])
    print(f"Relevant facts: {len(results)}")
    for r in results[:3]:
        print(f"  - {r.get('fact', {}).get('content', '')}: {r.get('score', 0)}")

    return True


async def run_tests():
    print("\n" + "=" * 60, flush=True)
    print("Sibyl Headless Integration Test", flush=True)
    print("=" * 60, flush=True)

    start_time = time.time()

    await test_memory_session_filtering()
    await test_relevance_with_memory()
    await test_opencode_with_memory()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60, flush=True)
    print(f"All tests completed in {elapsed:.2f}s!", flush=True)
    print("=" * 60, flush=True)


async def main():
    server_task = asyncio.create_task(run_server())
    await asyncio.sleep(10)
    await run_tests()
    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
