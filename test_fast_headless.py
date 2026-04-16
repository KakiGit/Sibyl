#!/usr/bin/env python
"""Fast headless integration test for Sibyl IPC server."""

import asyncio
import json
import struct
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

from sibyl_memory import MemorySystem, SimpleMemoryStore
from sibyl_memory.llm.config import LLMConfig
from sibyl_memory.graphiti_client import GraphitiClient
from sibyl_memory.embedder.local import LocalEmbedder
from sibyl_memory.embedder.config import EmbedderConfig
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, MemoryHandler, PromptHandler
from sibyl_relevance import CachedRelevanceEvaluator


class SimpleMemoryHandler:
    """Handler using simple memory store."""

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
    """Send a JSON-RPC request to the IPC server."""
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
    """Run the IPC server with simple memory store."""
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
        model="qwen2.5:7b",
        timeout=60,
    )

    client = GraphitiClient(llm_config=llm_config)
    relevance_evaluator = CachedRelevanceEvaluator(
        llm_client=client._llm_client,
        cache_ttl=300,
    )

    server = IpcServer()

    memory_handler = SimpleMemoryHandler(simple_store, embedder)
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    print("IPC server listening on /tmp/sibyl-ipc.sock", flush=True)
    await server.start()


async def run_tests():
    """Run integration tests."""
    print("=" * 60, flush=True)
    print("Testing Sibyl IPC Server (Fast Mode)", flush=True)
    print("=" * 60, flush=True)

    print("\n1. Testing memory.query (empty)...", flush=True)
    resp = await send_request("memory.query", {"query": "Python type hints"})
    print(f"Result: {json.dumps(resp, indent=2)}", flush=True)

    print("\n2. Testing memory.add_episode...", flush=True)
    resp = await send_request(
        "memory.add_episode",
        {
            "content": "User asked about Python type hints. I explained how to use typing module.",
            "source_description": "Test conversation",
        },
    )
    print(f"Result: {json.dumps(resp, indent=2)}", flush=True)

    print("\n3. Testing memory.query (after add)...", flush=True)
    resp = await send_request("memory.query", {"query": "Python"})
    print(f"Result: {json.dumps(resp, indent=2)}", flush=True)

    print("\n4. Testing memory.get_context...", flush=True)
    resp = await send_request(
        "memory.get_context", {"query": "Python", "max_tokens": 500}
    )
    print(
        f"Result: {json.dumps(resp.get('result', {}).get('context', '')[:300], indent=2)}",
        flush=True,
    )

    print("\n5. Testing prompt.build...", flush=True)
    resp = await send_request(
        "prompt.build",
        {
            "user_query": "How do I use type hints in Python?",
            "context": {"project": "test-project"},
        },
    )
    prompt_preview = resp.get("result", {}).get("prompt", "")[:400]
    print(f"Prompt preview: {prompt_preview}...", flush=True)

    print("\n" + "=" * 60, flush=True)
    print("All tests completed!", flush=True)
    print("=" * 60, flush=True)


async def main():
    """Run server and tests."""
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
