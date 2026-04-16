import asyncio
import json
import struct


async def test_ipc():
    reader, writer = await asyncio.open_unix_connection("/tmp/sibyl-ipc.sock")

    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "memory.query",
        "params": {"query": "type hints Python"},
    }

    data = json.dumps(request).encode()
    writer.write(struct.pack(">I", len(data)) + data)
    await writer.drain()

    len_buf = await reader.readexactly(4)
    msg_len = struct.unpack(">I", len_buf)[0]

    response_buf = await reader.readexactly(msg_len)
    response = json.loads(response_buf)

    print("Response:", json.dumps(response, indent=2))

    writer.close()
    await writer.wait_closed()


if __name__ == "__main__":
    asyncio.run(test_ipc())
