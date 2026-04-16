#!/usr/bin/env python
"""Headless integration test for Sibyl IPC server."""

import asyncio
import json
import struct
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

from sibyl_memory import MemorySystem
from sibyl_memory.llm.config import LLMConfig
from sibyl_memory.graphiti_client import GraphitiClient
from sibyl_memory.embedder.local import LocalEmbedder
from sibyl_memory.embedder.config import EmbedderConfig
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, MemoryHandler, PromptHandler
from sibyl_relevance import CachedRelevanceEvaluator


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
    """Run the IPC server."""
    llm_config = LLMConfig(
        base_url="http://127.0.0.1:11434",
        model="qwen2.5:7b",
        timeout=120,
    )

    embedder_config = EmbedderConfig()
    embedder = LocalEmbedder(embedder_config)

    print("Preloading embedding model...", flush=True)
    await embedder.embed(["test"])
    print("Embedding model loaded!", flush=True)

    client = GraphitiClient(llm_config=llm_config, embedder_config=embedder_config)
    memory = MemorySystem(client=client)
    await memory.initialize()

    prompt_builder = TemplatePromptBuilder()

    relevance_evaluator = CachedRelevanceEvaluator(
        llm_client=memory.client._llm_client,
        cache_ttl=300,
    )

    server = IpcServer()

    memory_handler = MemoryHandler(memory)
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
    print("Testing Sibyl IPC Server (Headless)", flush=True)
    print("=" * 60, flush=True)

    print("\n1. Testing memory.query (empty)...", flush=True)
    resp = await send_request("memory.query", {"query": "Python type hints"})
    print(f"Result: {json.dumps(resp, indent=2)}", flush=True)

    print("\n2. Testing memory.add_episode...", flush=True)
    resp = await send_request(
        "memory.add_episode",
        {
            "name": "test_episode",
            "content": "User asked about Python type hints. I explained how to use typing module for better code documentation.",
            "source_description": "Test conversation",
        },
    )
    print(f"Result: {json.dumps(resp, indent=2)}", flush=True)

    print("\nWaiting for episode to be processed...", flush=True)
    await asyncio.sleep(3)

    print("\n3. Testing memory.query (after add)...", flush=True)
    resp = await send_request("memory.query", {"query": "Python type hints"})
    print(f"Result: {json.dumps(resp, indent=2)}", flush=True)

    print("\n4. Testing memory.get_context...", flush=True)
    resp = await send_request(
        "memory.get_context", {"query": "Python", "max_tokens": 500}
    )
    print(f"Result: {json.dumps(resp, indent=2)}", flush=True)

    print("\n5. Testing prompt.build...", flush=True)
    resp = await send_request(
        "prompt.build",
        {
            "user_message": "How do I use type hints in Python?",
            "context": {"project": "test-project"},
        },
    )
    print(
        f"Result: {json.dumps(resp.get('result', {}).get('prompt', '')[:500], indent=2)}",
        flush=True,
    )

    print("\n6. Testing relevance.evaluate...", flush=True)
    resp = await send_request(
        "relevance.evaluate",
        {
            "memory_items": [
                {
                    "content": "Python type hints help with code documentation",
                    "type": "fact",
                },
                {"content": "The weather is sunny today", "type": "fact"},
            ],
            "query": "How to use type hints?",
        },
    )
    print(f"Result: {json.dumps(resp, indent=2)}", flush=True)

    print("\n" + "=" * 60, flush=True)
    print("All tests completed!", flush=True)
    print("=" * 60, flush=True)


async def main():
    """Run server and tests in parallel."""
    server_task = asyncio.create_task(run_server())

    await asyncio.sleep(35)

    await run_tests()

    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
