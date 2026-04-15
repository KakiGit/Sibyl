import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class JsonRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: Optional[int] = None
    method: str
    params: Dict[str, Any] = {}


class JsonRpcResponse(BaseModel):
    jsonrpc: str = "2.0"
    id: Optional[int] = None
    result: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None


class IpcServer:
    """JSON-RPC 2.0 IPC server using Unix sockets."""

    def __init__(self, socket_path: Optional[str] = None):
        self.socket_path = socket_path or self._default_socket_path()
        self.handlers: Dict[str, Callable] = {}
        self._server = None

    def _default_socket_path(self) -> str:
        if os.name == "nt":
            return r"\\.\pipe\sibyl-ipc"
        return "/tmp/sibyl-ipc.sock"

    def register(self, method: str, handler: Callable):
        """Register a handler for a method."""
        self.handlers[method] = handler

    async def start(self):
        """Start the IPC server."""
        if os.name != "nt":
            if os.path.exists(self.socket_path):
                os.unlink(self.socket_path)

            self._server = await asyncio.start_unix_server(
                self._handle_connection,
                path=self.socket_path,
            )

            logger.info(f"IPC server listening on {self.socket_path}")

            async with self._server:
                await self._server.serve_forever()
        else:
            logger.warning("Windows named pipes not yet implemented")

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
                request = JsonRpcRequest(**json.loads(data))

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
        logger.info(f"Received request: {request.method} with params: {request.params}")
        handler = self.handlers.get(request.method)

        if handler is None:
            logger.warning(f"Method not found: {request.method}")
            return JsonRpcResponse(
                id=request.id,
                error={
                    "code": -32601,
                    "message": f"Method not found: {request.method}",
                },
            )

        try:
            result = await handler(request.params)
            logger.info(f"Handler result for {request.method}: {result}")
            return JsonRpcResponse(id=request.id, result=result)
        except Exception as e:
            logger.error(f"Handler error for {request.method}: {e}")
            return JsonRpcResponse(
                id=request.id,
                error={"code": -32603, "message": str(e)},
            )

    async def stop(self):
        """Stop the IPC server."""
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            logger.info("IPC server stopped")
