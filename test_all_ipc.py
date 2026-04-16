import asyncio
import json
import struct


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


async def main():
    print("=" * 60)
    print("Testing Sibyl IPC Server")
    print("=" * 60)

    print("\n1. Testing memory.query (empty)...")
    resp = await send_request("memory.query", {"query": "Python type hints"})
    print(f"Result: {json.dumps(resp, indent=2)}")

    print("\n2. Testing memory.add_episode...")
    resp = await send_request(
        "memory.add_episode",
        {
            "name": "test_episode",
            "content": "User asked about Python type hints. I explained how to use typing module for better code documentation.",
            "source_description": "Test conversation",
        },
    )
    print(f"Result: {json.dumps(resp, indent=2)}")

    await asyncio.sleep(2)

    print("\n3. Testing memory.query (after add)...")
    resp = await send_request("memory.query", {"query": "Python type hints"})
    print(f"Result: {json.dumps(resp, indent=2)}")

    print("\n4. Testing memory.get_context...")
    resp = await send_request(
        "memory.get_context", {"query": "Python", "max_tokens": 500}
    )
    print(f"Result: {json.dumps(resp, indent=2)}")

    print("\n5. Testing prompt.build...")
    resp = await send_request(
        "prompt.build",
        {
            "user_message": "How do I use type hints in Python?",
            "context": {"project": "test-project"},
        },
    )
    print(f"Result: {json.dumps(resp, indent=2)}")

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
    )
    print(f"Result: {json.dumps(resp, indent=2)}")

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
