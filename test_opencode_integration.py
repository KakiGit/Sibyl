#!/usr/bin/env python
"""Test OpenCode integration with IPC server."""

import asyncio
import json
import struct
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


async def test_opencode_integration():
    base_url = "http://127.0.0.1:4096"
    print("=== OpenCode + Memory Integration Test ===")

    session_id = None
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{base_url}/session", json={}) as resp:
            data = await resp.json()
            session_id = data.get("id")
            print(f"Created session: {session_id}")

        resp = await send_ipc_request(
            "memory.add_episode",
            {
                "content": f"OpenCode session {session_id} created for Sibyl integration test",
                "source_description": "Session creation",
                "session_id": session_id,
            },
        )
        episode_id = resp.get("result", {}).get("episode_id", "unknown")
        print(f"Added session to memory: {episode_id}")

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
        print(f"Built prompt: {len(prompt)} chars")

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
                "content": "User asked about project files. OpenCode responded.",
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

    print("=== Test Complete ===")


if __name__ == "__main__":
    asyncio.run(test_opencode_integration())
