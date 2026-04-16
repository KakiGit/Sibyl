#!/usr/bin/env python
"""Full headless integration test for Sibyl with OpenCode integration."""

import asyncio
import json
import struct
import time
import aiohttp


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

    print("1.1 Adding episode...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "User prefers Python for backend, Rust for systems. Uses pytest for testing.",
            "source_description": "User preference",
            "session_id": "test-full-1",
        },
    )
    elapsed = time.time() - start
    print(
        f"    Added in {elapsed:.3f}s: {resp.get('result', {}).get('episode_id', 'error')[:16]}"
    )

    print("1.2 Adding second episode...", flush=True)
    resp = await send_ipc_request(
        "memory.add_episode",
        {
            "content": "Discussed async fixtures in pytest for testing async code.",
            "source_description": "Conversation",
            "session_id": "test-full-1",
        },
    )
    print(f"    Added: {resp.get('result', {}).get('episode_id', 'error')[:16]}")

    print("1.3 Querying memory...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.query", {"query": "Python testing", "num_results": 5}
    )
    elapsed = time.time() - start
    episodes = resp.get("result", {}).get("episodes", [])
    print(f"    Found {len(episodes)} episodes in {elapsed:.3f}s")
    for ep in episodes[:2]:
        print(f"      - {ep.get('content', '')[:50]}...")

    print("1.4 Getting context...", flush=True)
    start = time.time()
    resp = await send_ipc_request(
        "memory.get_context", {"query": "testing", "session_id": "test-full-1"}
    )
    elapsed = time.time() - start
    context = resp.get("result", {}).get("context", "")
    print(f"    Context ({len(context)} chars) in {elapsed:.3f}s")


async def test_relevance_evaluation():
    print("\n=== Test 2: Relevance Evaluation (Embedding-based) ===", flush=True)

    start = time.time()
    resp = await send_ipc_request(
        "relevance.evaluate",
        {
            "facts": [
                {"content": "Python is used for backend", "type": "fact"},
                {"content": "Weather is sunny", "type": "fact"},
                {"content": "pytest is preferred for testing", "type": "fact"},
                {"content": "Rust is for systems programming", "type": "fact"},
            ],
            "query": "How to test Python code?",
            "threshold": 0.3,
        },
    )
    elapsed = time.time() - start
    results = resp.get("result", {}).get("results", [])
    print(f"    Evaluated in {elapsed:.3f}s, {len(results)} relevant:")
    for r in results[:3]:
        fact = r.get("fact", {}).get("content", "")
        score = r.get("score", 0)
        print(f"      - [{score:.2f}] {fact[:40]}")


async def test_prompt_building():
    print("\n=== Test 3: Prompt Building ===", flush=True)

    start = time.time()
    resp = await send_ipc_request(
        "prompt.build",
        {
            "user_query": "What testing framework for Python?",
            "context": {"project": "Sibyl", "language": "Python"},
            "memories": {"context": "User prefers pytest for testing."},
        },
    )
    elapsed = time.time() - start
    prompt = resp.get("result", {}).get("prompt", "")
    print(f"    Built prompt ({len(prompt)} chars) in {elapsed:.3f}s")
    print(f"    Preview: {prompt[:150]}...")


async def test_opencode_integration():
    print("\n=== Test 4: OpenCode Integration ===", flush=True)

    base_url = "http://127.0.0.1:4096"
    session_id = None

    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30)
        ) as session:
            print("4.1 Creating OpenCode session...", flush=True)
            start = time.time()
            async with session.post(f"{base_url}/session", json={}) as resp:
                if resp.status != 200:
                    print(f"    Failed: {resp.status}")
                    return
                data = await resp.json()
                session_id = data.get("id")
            print(f"    Session: {session_id} ({time.time() - start:.3f}s)")

            print("4.2 Storing in memory...", flush=True)
            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"OpenCode session {session_id} created",
                    "source_description": "Session",
                    "session_id": session_id,
                },
            )

            print("4.3 Sending message to OpenCode...", flush=True)
            start = time.time()
            async with session.post(
                f"{base_url}/session/{session_id}/message",
                json={
                    "parts": [
                        {"type": "text", "text": "List files in current directory"}
                    ]
                },
            ) as resp:
                if resp.status == 200:
                    print(f"    Message sent ({time.time() - start:.3f}s)")
                else:
                    print(f"    Failed: {resp.status}")

            print("4.4 Waiting for response...", flush=True)
            await asyncio.sleep(5)

            async with session.get(f"{base_url}/session/{session_id}/message") as resp:
                messages = await resp.json()
            print(f"    Got {len(messages)} messages")

            print("4.5 Storing conversation...", flush=True)
            await send_ipc_request(
                "memory.add_episode",
                {
                    "content": f"Asked OpenCode to list files. Got {len(messages)} messages.",
                    "source_description": "Conversation",
                    "session_id": session_id,
                },
            )

            print("4.6 Querying memory for session...", flush=True)
            resp = await send_ipc_request(
                "memory.query", {"query": "files", "session_id": session_id}
            )
            episodes = resp.get("result", {}).get("episodes", [])
            print(f"    Found {len(episodes)} episodes for session")

            print("4.7 Closing session...", flush=True)
            async with session.delete(f"{base_url}/session/{session_id}") as resp:
                print(f"    Closed: {resp.status}")

    except aiohttp.ClientError as e:
        print(f"    OpenCode error: {e}")


async def test_session_filtering():
    print("\n=== Test 5: Session Filtering ===", flush=True)

    await send_ipc_request(
        "memory.add_episode",
        {"content": "Session A: ML models", "session_id": "session-a"},
    )
    await send_ipc_request(
        "memory.add_episode",
        {"content": "Session B: DB optimization", "session_id": "session-b"},
    )

    print("5.1 Query session-a...", flush=True)
    resp = await send_ipc_request(
        "memory.query", {"query": "discussed", "session_id": "session-a"}
    )
    print(f"    Session A: {len(resp.get('result', {}).get('episodes', []))} episodes")

    print("5.2 Query session-b...", flush=True)
    resp = await send_ipc_request(
        "memory.query", {"query": "discussed", "session_id": "session-b"}
    )
    print(f"    Session B: {len(resp.get('result', {}).get('episodes', []))} episodes")

    print("5.3 Query all...", flush=True)
    resp = await send_ipc_request("memory.query", {"query": "discussed"})
    all_eps = resp.get("result", {}).get("episodes", [])
    print(f"    All: {len(all_eps)} episodes")


async def main():
    print("\n" + "=" * 60, flush=True)
    print("Sibyl Full Headless Test (No LLM, Embedding-based)", flush=True)
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


if __name__ == "__main__":
    asyncio.run(main())
