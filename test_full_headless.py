#!/usr/bin/env python
"""Comprehensive headless test for Sibyl with performance optimization."""

import asyncio
import json
import struct
import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))


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


async def test_memory_operations():
    print("\n=== Test 1: Memory Operations ===", flush=True)
    timings = {}

    print("1.1 Adding episode 1...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "User prefers Python for backend development and Rust for systems programming.",
            "source_description": "User preference",
            "session_id": "perf-test-1",
        },
    )
    timings["add_episode_1"] = time.time() - start
    print(f"    Done in {timings['add_episode_1']:.3f}s")

    print("1.2 Adding episode 2...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "Discussed using pytest for testing with async fixtures and mocking.",
            "source_description": "Conversation",
            "session_id": "perf-test-1",
        },
    )
    timings["add_episode_2"] = time.time() - start
    print(f"    Done in {timings['add_episode_2']:.3f}s")

    print("1.3 Adding episode 3...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "User likes to use Docker for containerization and deployment.",
            "source_description": "Technical preference",
            "session_id": "perf-test-1",
        },
    )
    timings["add_episode_3"] = time.time() - start
    print(f"    Done in {timings['add_episode_3']:.3f}s")

    print("1.4 Querying memory for 'Python'...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.query",
        {"query": "Python programming", "num_results": 5},
    )
    timings["query_1"] = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"    Found {len(episodes)} episodes in {timings['query_1']:.3f}s")
    for ep in episodes[:2]:
        print(f"      - {ep.get('content', '')[:60]}...")

    print("1.5 Querying memory for 'testing'...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.query",
        {"query": "testing frameworks", "num_results": 5},
    )
    timings["query_2"] = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"    Found {len(episodes)} episodes in {timings['query_2']:.3f}s")

    print("1.6 Getting context for 'deployment'...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.get_context",
        {"query": "deployment", "session_id": "perf-test-1"},
    )
    timings["get_context"] = time.time() - start
    context = resp.get("result", {}).get("context", "")
    print(f"    Context ({len(context)} chars) in {timings['get_context']:.3f}s")

    avg_add = (
        timings["add_episode_1"] + timings["add_episode_2"] + timings["add_episode_3"]
    ) / 3
    avg_query = (timings["query_1"] + timings["query_2"]) / 2
    print(f"\n  Avg add_episode: {avg_add:.3f}s, Avg query: {avg_query:.3f}s")
    return True


async def test_relevance_evaluation():
    print("\n=== Test 2: Relevance Evaluation ===", flush=True)

    print("2.1 Evaluating facts (embedding-based)...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "relevance.evaluate",
        {
            "facts": [
                {"content": "Python is used for backend development", "type": "fact"},
                {"content": "The weather is sunny today", "type": "fact"},
                {"content": "pytest is preferred for testing", "type": "fact"},
                {"content": "Rust is used for systems programming", "type": "fact"},
                {"content": "Coffee is made from beans", "type": "fact"},
                {"content": "Docker is used for containerization", "type": "fact"},
            ],
            "query": "How should I test my Python code?",
            "threshold": 0.25,
        },
    )
    elapsed = time.time() - start
    results = resp.get("result", {}).get("results", [])
    print(f"    Evaluated in {elapsed:.3f}s, found {len(results)} relevant facts:")
    for r in results:
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
    print(f"    Built prompt ({len(prompt)} chars) in {elapsed:.3f}s")
    print(f"    Preview: {prompt[:200]}...")
    return True


async def test_batch_operations():
    print("\n=== Test 4: Batch Operations ===", flush=True)

    print("4.1 Batch adding episodes...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.batch_add",
        {
            "episodes": [
                {"content": "Batch item 1: Uses PostgreSQL for database"},
                {"content": "Batch item 2: Implements REST API endpoints"},
                {"content": "Batch item 3: Uses Redis for caching"},
            ],
            "session_id": "batch-test",
        },
    )
    elapsed = time.time() - start
    ids = resp.get("result", {}).get("episode_ids", [])
    print(f"    Added {len(ids)} episodes in {elapsed:.3f}s")

    print("4.2 Querying batch results...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.query",
        {"query": "database", "session_id": "batch-test"},
    )
    elapsed = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"    Found {len(episodes)} episodes in {elapsed:.3f}s")
    return True


async def test_opencode_integration():
    print("\n=== Test 5: OpenCode Integration ===", flush=True)

    try:
        import aiohttp
    except ImportError:
        print("    SKIPPED: aiohttp not installed")
        return True

    base_url = "http://127.0.0.1:4096"
    session_id = None

    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30)
        ) as session:
            print("5.1 Creating OpenCode session...", flush=True)
            start = time.time()
            async with session.post(f"{base_url}/session", json={}) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    print(f"    Failed: {resp.status} - {text[:100]}")
                    return True
                data = await resp.json()
                session_id = data.get("id")
            print(f"    Created session: {session_id} in {time.time() - start:.2f}s")

            print("5.2 Storing session in memory...", flush=True)
            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"OpenCode session {session_id} created for integration test",
                    "source_description": "Session",
                    "session_id": session_id,
                },
            )

            print("5.3 Sending message to OpenCode...", flush=True)
            start = time.time()
            try:
                async with session.post(
                    f"{base_url}/session/{session_id}/message",
                    json={
                        "parts": [
                            {
                                "type": "text",
                                "text": "List the files in the current directory",
                            }
                        ]
                    },
                ) as resp:
                    if resp.status == 200:
                        print(f"    Message sent in {time.time() - start:.2f}s")
                    else:
                        text = await resp.text()
                        print(f"    Failed: {resp.status} - {text[:100]}")
            except Exception as e:
                print(f"    Error: {e}")

            print("5.4 Waiting for response...", flush=True)
            await asyncio.sleep(5)

            async with session.get(f"{base_url}/session/{session_id}/message") as resp:
                messages = await resp.json()
            print(f"    Got {len(messages)} messages")

            print("5.5 Storing conversation in memory...", flush=True)
            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"Asked OpenCode to list files, got {len(messages)} messages back",
                    "source_description": "Conversation",
                    "session_id": session_id,
                },
            )

            print("5.6 Querying memory for conversation...", flush=True)
            resp = await send_ipc_request(
                "memory.query",
                {"query": "files directory", "session_id": session_id},
            )
            episodes = resp.get("result", {}).get("episodes", [])
            print(f"    Found {len(episodes)} relevant episodes")

            print("5.7 Cleaning up...", flush=True)
            async with session.delete(f"{base_url}/session/{session_id}") as resp:
                print(f"    Session closed: {resp.status}")

    except aiohttp.ClientError as e:
        print(f"    Connection error: {e}")
    except Exception as e:
        print(f"    Error: {e}")

    return True


async def test_session_isolation():
    print("\n=== Test 6: Session Isolation ===", flush=True)

    await send_ipc_request(
        "memory.add_episode",
        {
            "content": "Session A: Machine learning with PyTorch",
            "source_description": "Session A",
            "session_id": "session-a",
        },
    )

    await send_ipc_request(
        "memory.add_episode",
        {
            "content": "Session B: Frontend development with React",
            "source_description": "Session B",
            "session_id": "session-b",
        },
    )

    print("6.1 Querying session-a...", flush=True)
    resp = await send_ipc_request(
        "memory.query",
        {"query": "development", "session_id": "session-a"},
    )
    episodes_a = resp.get("result", {}).get("episodes", [])
    print(f"    Session A: {len(episodes_a)} episodes")

    print("6.2 Querying session-b...", flush=True)
    resp = await send_ipc_request(
        "memory.query",
        {"query": "development", "session_id": "session-b"},
    )
    episodes_b = resp.get("result", {}).get("episodes", [])
    print(f"    Session B: {len(episodes_b)} episodes")

    print("6.3 Querying all sessions...", flush=True)
    resp = await send_ipc_request(
        "memory.query",
        {"query": "development"},
    )
    all_episodes = resp.get("result", {}).get("episodes", [])
    print(f"    All sessions: {len(all_episodes)} episodes")

    return True


async def run_all_tests():
    print("\n" + "=" * 60, flush=True)
    print("Sibyl Headless Integration Test", flush=True)
    print("=" * 60, flush=True)

    total_start = time.time()

    await test_memory_operations()
    await test_relevance_evaluation()
    await test_prompt_building()
    await test_batch_operations()
    await test_session_isolation()
    await test_opencode_integration()

    total_elapsed = time.time() - total_start
    print("\n" + "=" * 60, flush=True)
    print(f"All tests completed in {total_elapsed:.2f}s!", flush=True)
    print("=" * 60, flush=True)


async def main():
    print("Waiting for IPC server to be ready...", flush=True)
    await asyncio.sleep(3)

    try:
        await run_all_tests()
    except Exception as e:
        print(f"\nTest failed with error: {e}", flush=True)
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
