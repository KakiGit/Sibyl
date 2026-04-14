"""Main entry point for Sibyl memory system IPC server."""

import asyncio
import logging
import os
import signal
from typing import Optional

from .graphiti_client import GraphitiClient
from .memory import MemorySystem
from .search import HybridSearch
from .context_builder import ContextBuilder
from .relevance_filter import HybridRelevanceFilter
from .episode_manager import EpisodeManager
from .ipc.protocol import JsonRpcRequest, JsonRpcResponse
from .ipc.handlers import MemoryHandlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class MemoryServer:
    """IPC server for the memory system."""

    def __init__(
        self,
        socket_path: Optional[str] = None,
        host: str = "localhost",
        port: int = 6379,
        database: str = "sibyl_memory",
    ):
        self.socket_path = socket_path or self._default_socket_path()
        self.host = host
        self.port = port
        self.database = database

        self._server = None
        self._memory_system = None
        self._handlers = None

    def _default_socket_path(self) -> str:
        if os.name == "nt":
            return r"\\.\pipe\sibyl-memory"
        return "/tmp/sibyl-memory.sock"

    async def start(self):
        """Start the memory server."""
        logger.info("Initializing memory system...")

        client = GraphitiClient(
            host=self.host,
            port=self.port,
            database=self.database,
        )
        await client.connect()

        self._memory_system = MemorySystem(client=client)
        await self._memory_system.initialize()

        search = HybridSearch(
            graphiti_client=client,
            embedder=client._embedder,
        )

        relevance_filter = HybridRelevanceFilter(
            embedder=client._embedder,
            llm_client=client._llm_client,
        )

        context_builder = ContextBuilder(
            memory_system=self._memory_system,
            relevance_filter=relevance_filter,
        )

        self._handlers = MemoryHandlers(
            memory_system=self._memory_system,
            context_builder=context_builder,
            relevance_filter=relevance_filter,
        )

        if os.name != "nt":
            if os.path.exists(self.socket_path):
                os.unlink(self.socket_path)

            self._server = await asyncio.start_unix_server(
                self._handle_connection,
                path=self.socket_path,
            )

            logger.info(f"Memory server listening on {self.socket_path}")

            async with self._server:
                await self._server.serve_forever()
        else:
            logger.warning("Windows named pipes not yet implemented")
            while True:
                await asyncio.sleep(1)

    async def _handle_connection(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ):
        """Handle a client connection."""
        try:
            while True:
                len_data = await reader.readexactly(4)
                msg_len = int.from_bytes(len_data, "big")

                data = await reader.readexactly(msg_len)
                request = JsonRpcRequest.model_validate_json(data)

                response = await self._handle_request(request)

                response_data = response.model_dump_json().encode()
                response_len = len(response_data).to_bytes(4, "big")

                writer.write(response_len + response_data)
                await writer.drain()

        except asyncio.IncompleteReadError:
            pass
        except Exception as e:
            logger.error(f"Connection error: {e}")
        finally:
            writer.close()
            await writer.wait_closed()

    async def _handle_request(self, request: JsonRpcRequest) -> JsonRpcResponse:
        """Handle a JSON-RPC request."""
        handler = self._handlers.get_handler(request.method)

        if handler is None:
            return JsonRpcResponse(
                id=request.id,
                error={
                    "code": -32601,
                    "message": f"Method not found: {request.method}",
                },
            )

        try:
            result = await handler(request.params)
            return JsonRpcResponse(id=request.id, result=result)
        except Exception as e:
            logger.error(f"Handler error: {e}")
            return JsonRpcResponse(
                id=request.id,
                error={"code": -32603, "message": str(e)},
            )

    async def stop(self):
        """Stop the memory server."""
        if self._server:
            self._server.close()
            await self._server.wait_closed()

        if self._memory_system:
            await self._memory_system.shutdown()

        logger.info("Memory server stopped")


async def main():
    """Main entry point."""
    server = MemoryServer()

    loop = asyncio.get_event_loop()

    def signal_handler():
        logger.info("Received shutdown signal")
        asyncio.create_task(server.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    await server.start()


if __name__ == "__main__":
    asyncio.run(main())
