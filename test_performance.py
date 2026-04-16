#!/usr/bin/env python
"""Comprehensive performance test for Sibyl IPC server."""

import asyncio
import json
import struct
import sys
import os
import time
import aiohttp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

SOCKET_PATH = "/tmp/sibyl-ipc.sock"
OPENCODE_URL = "http://127.0.0.1:4096"
OLLAMA_URL = "http://127.0.0.1:11434"


async def ipc_call(method: str, params: dict, request_id: int = 1) -> dict:
    """Make IPC call with timeout."""
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_unix_connection(SOCKET_PATH), timeout=5.0
        )
        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        }
        data = json.dumps(request).encode()
        writer.write(struct.pack(">I", len(data)) + data)
        await writer.drain()

        len_buf = await asyncio.wait_for(reader.readexactly(4), timeout=30.0)
        msg_len = struct.unpack(">I", len_buf)[0]
        response_buf = await asyncio.wait_for(reader.readexactly(msg_len), timeout=30.0)
        response = json.loads(response_buf)

        writer.close()
        await writer.wait_closed()
        return response
    except asyncio.TimeoutError:
        return {"error": {"message": "IPC timeout"}}
    except Exception as e:
        return {"error": {"message": str(e)}}


async def test_ipc_server_running():
    """Test IPC server connectivity."""
    print("\n=== IPC Server Check ===")
    start = time.time()
    resp = await ipc_call("memory.query", {"query": "test", "num_results": 1})
    elapsed = time.time() - start

    if "error" in resp and resp["error"]:
        print(
            f"  IPC server NOT running: {resp.get('error', {}).get('message', 'unknown')}"
        )
        return False
    print(f"  IPC server running: {elapsed:.2f}s")
    return True


async def test_memory_operations():
    """Test memory add/query operations."""
    print("\n=== Memory Operations ===")

    start = time.time()
    resp = await ipc_call(
        "memory.add_episode",
        {
            "content": "User prefers qwen2.5:0.5b model for fast local inference.",
            "source_description": "User preference",
            "session_id": "perf-test-session",
        },
    )
    elapsed = time.time() - start
    episode_id = resp.get("result", {}).get("episode_id", "")[:16]
    print(f"  1. Add episode: {elapsed:.2f}s - {episode_id}")

    start = time.time()
    resp = await ipc_call(
        "memory.batch_add",
        {
            "episodes": [
                {
                    "content": "Sibyl uses FalkorDB for graph memory storage.",
                    "source": "Tech",
                },
                {
                    "content": "Python handles memory and prompt building.",
                    "source": "Tech",
                },
                {"content": "Rust handles TUI and orchestration.", "source": "Tech"},
            ],
            "session_id": "perf-test-session",
        },
    )
    elapsed = time.time() - start
    ids = resp.get("result", {}).get("episode_ids", [])
    print(f"  2. Batch add (3): {elapsed:.2f}s - {len(ids)} added")

    start = time.time()
    resp = await ipc_call(
        "memory.query",
        {"query": "qwen model", "num_results": 5, "session_id": "perf-test-session"},
    )
    elapsed = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"  3. Query (session): {elapsed:.2f}s - {len(episodes)} results")

    start = time.time()
    resp = await ipc_call("memory.query", {"query": "FalkorDB", "num_results": 3})
    elapsed = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"  4. Query (global): {elapsed:.2f}s - {len(episodes)} results")

    start = time.time()
    resp = await ipc_call(
        "memory.get_context",
        {"query": "architecture", "session_id": "perf-test-session"},
    )
    elapsed = time.time() - start
    context_len = len(resp.get("result", {}).get("context", ""))
    print(f"  5. Get context: {elapsed:.2f}s - {context_len} chars")


async def test_relevance_evaluation():
    """Test relevance evaluation with embedding similarity."""
    print("\n=== Relevance Evaluation ===")

    start = time.time()
    resp = await ipc_call(
        "relevance.evaluate",
        {
            "facts": [
                {"content": "qwen2.5:0.5b is a small fast model"},
                {"content": "FalkorDB stores graph data in Redis"},
                {"content": "Python embeddings use sentence-transformers"},
                {"content": "Sibyl IPC uses Unix sockets"},
            ],
            "query": "fast local model inference",
            "threshold": 0.15,
        },
    )
    elapsed = time.time() - start
    results = resp.get("result", {}).get("results", [])
    print(f"  1. Evaluate (threshold 0.25): {elapsed:.2f}s - {len(results)} relevant")

    for r in results[:3]:
        content = r.get("fact", {}).get("content", "")[:40]
        score = r.get("score", 0)
        print(f"     [{score:.2f}] {content}...")

    start = time.time()
    resp = await ipc_call(
        "relevance.evaluate",
        {
            "facts": [{"content": "Graphiti extracts entities from conversations"}],
            "query": "entity extraction",
            "threshold": 0.15,
        },
    )
    elapsed = time.time() - start
    results = resp.get("result", {}).get("results", [])
    print(f"  2. Single fact eval: {elapsed:.2f}s - {len(results)} relevant")


async def test_prompt_building():
    """Test prompt building with memory injection."""
    print("\n=== Prompt Building ===")

    start = time.time()
    resp = await ipc_call(
        "prompt.build",
        {
            "user_query": "How do I optimize model inference speed?",
            "context": {"project": "Sibyl", "model": "qwen2.5:0.5b"},
            "memories": {"context": "User prefers small models for speed."},
            "tools": [{"name": "bash", "description": "Execute shell commands"}],
        },
    )
    elapsed = time.time() - start
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"  1. Build prompt: {elapsed:.2f}s - {len(prompt)} chars")

    if prompt:
        lines = prompt.split("\n")
        print(f"     First line: {lines[0][:50]}...")


async def test_opencode_integration():
    """Test OpenCode session management."""
    print("\n=== OpenCode Integration (qwen2.5:0.5b) ===")

    timeout = aiohttp.ClientTimeout(total=60)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            start = time.time()
            async with session.post(
                f"{OPENCODE_URL}/session", json={}, params={"model": "qwen2.5:0.5b"}
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    print(f"  1. Create session: FAILED ({resp.status})")
                    return
                data = await resp.json()
                session_id = data.get("id", "")
            elapsed = time.time() - start
            print(f"  1. Create session: {elapsed:.2f}s - {session_id[:20]}")

            await ipc_call(
                "memory.add_episode",
                {
                    "content": f"OpenCode session {session_id} created with qwen2.5:0.5b",
                    "source_description": "Session start",
                    "session_id": session_id,
                },
            )

            start = time.time()
            async with session.post(
                f"{OPENCODE_URL}/session/{session_id}/message",
                json={
                    "parts": [
                        {"type": "text", "text": "What files are in this directory?"}
                    ]
                },
            ) as resp:
                elapsed = time.time() - start
                status = "OK" if resp.status == 200 else f"FAILED ({resp.status})"
                print(f"  2. Send message: {elapsed:.2f}s - {status}")

            await asyncio.sleep(1)

            start = time.time()
            async with session.get(
                f"{OPENCODE_URL}/session/{session_id}/message"
            ) as resp:
                messages = await resp.json()
            elapsed = time.time() - start
            print(f"  3. Get messages: {elapsed:.2f}s - {len(messages)} messages")

            for msg in messages[-2:]:
                role = msg.get("role", "?")
                content = str(msg.get("content", ""))[:60]
                if isinstance(content, str):
                    content = content.replace("\n", " ")[:60]
                print(f"     [{role}] {content}...")

            start = time.time()
            resp = await ipc_call(
                "memory.query",
                {"query": "OpenCode session", "session_id": session_id},
            )
            elapsed = time.time() - start
            episodes = resp.get("result", {}).get("episodes", [])
            print(
                f"  4. Memory query (session): {elapsed:.2f}s - {len(episodes)} episodes"
            )

            start = time.time()
            async with session.delete(f"{OPENCODE_URL}/session/{session_id}") as resp:
                elapsed = time.time() - start
                print(f"  5. Close session: {elapsed:.2f}s - {resp.status}")

    except asyncio.TimeoutError:
        print("  TIMEOUT: OpenCode response took too long")
    except aiohttp.ClientError as e:
        print(f"  ERROR: {e}")


async def test_ollama_direct():
    """Test direct Ollama model call."""
    print("\n=== Ollama Direct Test (qwen2.5:0.5b) ===")

    timeout = aiohttp.ClientTimeout(total=30)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            start = time.time()
            async with session.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": "qwen2.5:0.5b",
                    "prompt": "Say 'hello' in one word.",
                    "stream": False,
                    "options": {"num_predict": 5},
                },
            ) as resp:
                data = await resp.json()
            elapsed = time.time() - start
            response = data.get("response", "")[:20]
            print(f"  1. Generate: {elapsed:.2f}s - '{response}'")

            await ipc_call(
                "memory.add_episode",
                {
                    "content": f"Ollama qwen2.5:0.5b responded: {response}",
                    "source_description": "LLM test",
                    "session_id": "ollama-test",
                },
            )

    except asyncio.TimeoutError:
        print("  TIMEOUT: Ollama response took too long")
    except Exception as e:
        print(f"  ERROR: {e}")


async def run_performance_tests():
    """Run all performance tests."""
    print("\n" + "=" * 60)
    print("Sibyl Performance Test Suite")
    print("Models: qwen2.5:0.5b (LLM) + all-MiniLM-L6-v2 (embeddings)")
    print("=" * 60)

    start_time = time.time()

    if not await test_ipc_server_running():
        print("\nIPC server not running. Start with: python start_ipc_server.py")
        return

    await test_memory_operations()
    await test_relevance_evaluation()
    await test_prompt_building()
    await test_opencode_integration()
    await test_ollama_direct()

    elapsed = time.time() - start_time
    print("\n" + "=" * 60)
    print(f"All tests completed in {elapsed:.2f}s!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_performance_tests())
