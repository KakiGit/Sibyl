#!/usr/bin/env python3
"""Headless test for Sibyl - tests full flow with performance metrics."""

import asyncio
import json
import socket
import time
import sys
from typing import Any, Dict, Optional

SOCKET_PATH = "/tmp/sibyl-ipc.sock"
OPENCODE_URL = "http://127.0.0.1:4096"


class IpcClient:
    def __init__(self, socket_path: str = SOCKET_PATH):
        self.socket_path = socket_path
        self._reader = None
        self._writer = None

    async def connect(self):
        self._reader, self._writer = await asyncio.open_unix_connection(
            self.socket_path
        )

    async def call(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict:
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        }
        data = json.dumps(request).encode()
        len_bytes = len(data).to_bytes(4, "big")

        self._writer.write(len_bytes + data)
        await self._writer.drain()

        len_data = await self._reader.readexactly(4)
        msg_len = int.from_bytes(len_data, "big")
        response_data = await self._reader.readexactly(msg_len)
        response = json.loads(response_data)
        return response

    async def close(self):
        if self._writer:
            self._writer.close()
            await self._writer.wait_closed()


async def test_ipc_ping():
    print("\n=== IPC Ping Test ===")
    client = IpcClient()
    start = time.time()
    await client.connect()
    connect_time = time.time() - start
    print(f"  IPC connect: {connect_time:.3f}s")
    await client.close()
    return connect_time


async def test_memory_add_episode(client: IpcClient):
    print("\n=== Memory: Add Episode ===")
    start = time.time()
    result = await client.call(
        "memory.add_episode",
        {
            "name": "test_conversation",
            "content": "User asked about implementing a REST API. Assistant suggested using FastAPI with async endpoints.",
            "source_description": "headless test",
            "session_id": "test_session_1",
        },
    )
    elapsed = time.time() - start
    print(f"  Add episode: {elapsed:.3f}s")
    print(f"  Result: {result.get('result', result.get('error'))}")
    return elapsed, result


async def test_memory_query(client: IpcClient):
    print("\n=== Memory: Query ===")
    start = time.time()
    result = await client.call(
        "memory.query",
        {
            "query": "REST API implementation",
            "num_results": 5,
            "session_id": "test_session_1",
        },
    )
    elapsed = time.time() - start
    print(f"  Query: {elapsed:.3f}s")
    res = result.get("result", {})
    print(f"  Episodes: {len(res.get('episodes', []))}")
    print(f"  Entities: {len(res.get('entities', []))}")
    print(f"  Facts: {len(res.get('facts', []))}")
    return elapsed, result


async def test_memory_get_context(client: IpcClient):
    print("\n=== Memory: Get Context ===")
    start = time.time()
    result = await client.call(
        "memory.get_context",
        {
            "query": "How to implement REST API?",
            "max_tokens": 1000,
            "session_id": "test_session_1",
        },
    )
    elapsed = time.time() - start
    print(f"  Get context: {elapsed:.3f}s")
    context = result.get("result", {}).get("context", "")
    print(f"  Context length: {len(context)} chars")
    if context:
        print(f"  Context preview: {context[:200]}...")
    return elapsed, result


async def test_prompt_build(client: IpcClient):
    print("\n=== Prompt: Build ===")
    start = time.time()
    result = await client.call(
        "prompt.build",
        {
            "project_path": "/home/kaki/Github/Sibyl",
            "conversation_history": [
                {"role": "user", "content": "How do I implement a REST API?"}
            ],
            "user_query": "How do I implement a REST API?",
            "harness_name": "opencode",
            "max_tokens": 4000,
            "tools": ["bash", "read", "write", "edit", "glob", "grep"],
            "memories": {
                "episodes": [],
                "entities": [],
                "facts": [],
            },
        },
    )
    elapsed = time.time() - start
    print(f"  Build: {elapsed:.3f}s")
    prompt = result.get("result", {}).get("prompt", "")
    print(f"  Prompt length: {len(prompt)} chars")
    return elapsed, result


async def test_relevance_evaluate(client: IpcClient):
    print("\n=== Relevance: Evaluate ===")
    facts = [
        {"uuid": "1", "fact": "User prefers Python for backend development"},
        {"uuid": "2", "fact": "Project uses FastAPI framework"},
        {"uuid": "3", "fact": "User asked about REST API implementation"},
        {"uuid": "4", "fact": "Database is PostgreSQL"},
        {"uuid": "5", "fact": "Testing framework is pytest"},
    ]
    start = time.time()
    result = await client.call(
        "relevance.evaluate",
        {
            "query": "How to implement REST endpoints?",
            "facts": facts,
            "threshold": 0.5,
        },
    )
    elapsed = time.time() - start
    print(f"  Evaluate: {elapsed:.3f}s")
    results = result.get("result", {}).get("results", [])
    print(f"  Relevant facts: {len(results)}")
    for r in results[:3]:
        print(
            f"    - {r.get('fact', {}).get('fact', 'N/A')[:50]}... (score: {r.get('score', 0):.2f})"
        )
    return elapsed, result


async def test_opencode_session():
    print("\n=== OpenCode: Session Create ===")
    import aiohttp

    start = time.time()
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{OPENCODE_URL}/session",
            json={},
        ) as resp:
            data = await resp.json()
    elapsed = time.time() - start
    print(f"  Create session: {elapsed:.3f}s")
    print(f"  Session ID: {data.get('id', 'N/A')}")
    return elapsed, data


async def test_opencode_send_message(session_id: str):
    print("\n=== OpenCode: Send Message ===")
    import aiohttp

    start = time.time()
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{OPENCODE_URL}/session/{session_id}/message",
            json={
                "parts": [{"type": "text", "text": "Say 'hello' in one word."}],
            },
        ) as resp:
            data = await resp.json()
    elapsed = time.time() - start
    print(f"  Send message: {elapsed:.3f}s")
    print(f"  Response preview: {str(data)[:200]}")
    return elapsed, data


async def test_opencode_list_sessions():
    print("\n=== OpenCode: List Sessions ===")
    import aiohttp

    start = time.time()
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{OPENCODE_URL}/session") as resp:
            data = await resp.json()
    elapsed = time.time() - start
    print(f"  List sessions: {elapsed:.3f}s")
    print(f"  Sessions: {len(data)}")
    return elapsed, data


async def run_all_tests():
    print("=" * 60)
    print("SIBYL HEADLESS TEST SUITE")
    print("=" * 60)

    metrics = {}

    try:
        metrics["ipc_connect"] = await test_ipc_ping()
    except Exception as e:
        print(f"  ERROR: {e}")
        return

    client = IpcClient()
    try:
        await client.connect()

        m, _ = await test_memory_add_episode(client)
        metrics["memory_add_episode"] = m

        m, _ = await test_memory_query(client)
        metrics["memory_query"] = m

        m, _ = await test_memory_get_context(client)
        metrics["memory_get_context"] = m

        m, _ = await test_prompt_build(client)
        metrics["prompt_build"] = m

        m, _ = await test_relevance_evaluate(client)
        metrics["relevance_evaluate"] = m

    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback

        traceback.print_exc()
    finally:
        await client.close()

    try:
        m, data = await test_opencode_session()
        metrics["opencode_session_create"] = m

        if data and "id" in data:
            session_id = data["id"]
            m, _ = await test_opencode_send_message(session_id)
            metrics["opencode_send_message"] = m

        m, _ = await test_opencode_list_sessions()
        metrics["opencode_list_sessions"] = m

    except Exception as e:
        print(f"  ERROR (OpenCode): {e}")

    print("\n" + "=" * 60)
    print("PERFORMANCE SUMMARY")
    print("=" * 60)
    total = 0
    for name, value in metrics.items():
        print(f"  {name}: {value:.3f}s")
        total += value
    print(f"  TOTAL: {total:.3f}s")
    print("=" * 60)

    return metrics


if __name__ == "__main__":
    asyncio.run(run_all_tests())
