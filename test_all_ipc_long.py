import asyncio
import json
import struct


async def send_request(
    method: str, params: dict, request_id: int = 1, timeout: int = 300
):
    reader, writer = await asyncio.wait_for(
        asyncio.open_unix_connection("/tmp/sibyl-ipc.sock"), timeout=5
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

    len_buf = await asyncio.wait_for(reader.readexactly(4), timeout=timeout)
    msg_len = struct.unpack(">I", len_buf)[0]

    response_buf = await asyncio.wait_for(reader.readexactly(msg_len), timeout=timeout)
    response = json.loads(response_buf)

    writer.close()
    await writer.wait_closed()
    return response


async def main():
    print("=" * 60)
    print("Testing Sibyl IPC Server (with long timeouts)")
    print("=" * 60)

    print("\n1. Testing memory.query...")
    resp = await send_request(
        "memory.query", {"query": "Python type hints"}, timeout=30
    )
    print(f"Result: {json.dumps(resp, indent=2)[:500]}")

    print("\n2. Testing memory.add_episode (this takes ~5 min with qwen2.5:7b)...")
    resp = await send_request(
        "memory.add_episode",
        {
            "name": "test_episode_2",
            "content": "User asked about Python type hints. I explained how to use typing module for better code documentation.",
            "source_description": "Test conversation",
        },
        timeout=300,
    )
    print(f"Result: {json.dumps(resp, indent=2)}")

    print("\n3. Testing memory.query (after add)...")
    resp = await send_request(
        "memory.query", {"query": "Python type hints"}, timeout=30
    )
    print(f"Result: {json.dumps(resp, indent=2)[:500]}")

    print("\n4. Testing memory.get_context...")
    resp = await send_request(
        "memory.get_context", {"query": "Python", "max_tokens": 500}, timeout=30
    )
    print(f"Result: {json.dumps(resp, indent=2)[:500]}")

    print("\n5. Testing prompt.build...")
    resp = await send_request(
        "prompt.build",
        {
            "user_message": "How do I use type hints in Python?",
            "context": {"project": "test-project"},
        },
        timeout=30,
    )
    print(f"Result: {json.dumps(resp, indent=2)[:500]}")

    print("\n6. Testing relevance.evaluate...")
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
        timeout=60,
    )
    print(f"Result: {json.dumps(resp, indent=2)[:500]}")

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
