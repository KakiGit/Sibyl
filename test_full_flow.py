#!/usr/bin/env python
"""Full flow integration test for Sibyl."""

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


class FullFlowHandler:
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


async def send_request(method: str, params: dict, request_id: int = 1):
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


async def test_opencode_rest():
    import aiohttp

    base_url = "http://127.0.0.1:4096"
    print("\n=== Testing OpenCode REST API ===")

    async with aiohttp.ClientSession() as session:
        async with session.get(f"{base_url}/health") as resp:
            if resp.status == 200:
                print("OpenCode health check: OK")
            else:
                print(f"OpenCode health check failed: {resp.status}")
                return False

        async with session.post(f"{base_url}/session", json={}) as resp:
            data = await resp.json()
            session_id = data.get("id")
            print(f"Created OpenCode session: {session_id}")

        async with session.post(
            f"{base_url}/session/{session_id}/message",
            json={
                "parts": [{"type": "text", "text": "List files in current directory"}]
            },
        ) as resp:
            print(f"Sent message to OpenCode: {resp.status}")

        await asyncio.sleep(2)

        async with session.get(f"{base_url}/session/{session_id}/message") as resp:
            messages = await resp.json()
            print(f"Retrieved {len(messages)} messages from OpenCode")

        async with session.delete(f"{base_url}/session/{session_id}") as resp:
            print(f"Closed OpenCode session: {resp.status}")

    return True


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
    )

    server = IpcServer()

    memory_handler = FullFlowHandler(simple_store, embedder)
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    print("IPC server listening on /tmp/sibyl-ipc.sock", flush=True)
    await server.start()


async def run_tests():
    print("\n" + "=" * 60, flush=True)
    print("Full Flow Integration Test", flush=True)
    print("=" * 60, flush=True)

    start_time = time.time()

    print("\n1. Testing memory.query...", flush=True)
    resp = await send_request("memory.query", {"query": "test"})
    print(
        f"   Episodes found: {len(resp.get('result', {}).get('episodes', []))}",
        flush=True,
    )

    print("\n2. Testing memory.add_episode...", flush=True)
    resp = await send_request(
        "memory.add_episode",
        {
            "content": "Full flow test: verifying memory integration with OpenCode",
            "source_description": "Integration test",
            "session_id": "full-flow-test",
        },
    )
    episode_id = resp.get("result", {}).get("episode_id")
    print(f"   Episode added: {episode_id}", flush=True)

    print("\n3. Testing memory.get_context...", flush=True)
    resp = await send_request(
        "memory.get_context", {"query": "memory", "session_id": "full-flow-test"}
    )
    context = resp.get("result", {}).get("context", "")
    print(f"   Context retrieved: {len(context)} chars", flush=True)

    print("\n4. Testing prompt.build...", flush=True)
    resp = await send_request(
        "prompt.build",
        {
            "user_query": "Show me the memory system architecture",
            "context": {"project": "Sibyl"},
        },
    )
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"   Prompt built: {len(prompt)} chars", flush=True)

    print("\n5. Testing relevance.evaluate...", flush=True)
    resp = await send_request(
        "relevance.evaluate",
        {
            "facts": [
                {"content": "Python type hints help documentation", "type": "fact"},
                {"content": "The weather is sunny", "type": "fact"},
            ],
            "query": "How to use Python type hints?",
            "threshold": 0.3,
        },
    )
    results = resp.get("result", {}).get("results", [])
    print(f"   Relevant items found: {len(results)}", flush=True)

    print("\n6. Testing OpenCode REST API...", flush=True)
    opencode_ok = await test_opencode_rest()
    print(f"   OpenCode integration: {'OK' if opencode_ok else 'FAILED'}", flush=True)

    elapsed = time.time() - start_time
    print("\n" + "=" * 60, flush=True)
    print(f"All tests completed in {elapsed:.2f}s!", flush=True)
    print("=" * 60, flush=True)


async def main():
    server_task = asyncio.create_task(run_server())
    await asyncio.sleep(8)
    await run_tests()
    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
