#!/usr/bin/env python
"""Run IPC server in foreground for testing."""

import asyncio
import logging
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "python"))

from sibyl_memory import MemorySystem
from sibyl_memory.llm.config import LLMConfig
from sibyl_memory.graphiti_client import GraphitiClient
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, MemoryHandler, PromptHandler

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")


async def main():
    llm_config = LLMConfig(
        base_url="http://127.0.0.1:11434",
        model="qwen2.5:0.5b",
        timeout=120,
    )

    client = GraphitiClient(llm_config=llm_config)
    memory = MemorySystem(client=client)
    await memory.initialize()

    prompt_builder = TemplatePromptBuilder()

    relevance_evaluator = None
    try:
        from sibyl_relevance import CachedRelevanceEvaluator

        relevance_evaluator = CachedRelevanceEvaluator(
            llm_client=memory.client._llm_client,
            cache_ttl=300,
        )
    except Exception as e:
        logging.warning(f"Relevance evaluator initialization failed: {e}")

    server = IpcServer()

    memory_handler = MemoryHandler(memory)
    prompt_handler = PromptHandler(prompt_builder, relevance_evaluator)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    logging.info("Starting Sibyl IPC Server...")
    logging.info(f"Socket path: {server.socket_path}")

    try:
        await server.start()
    except KeyboardInterrupt:
        logging.info("Shutting down...")
    finally:
        await memory.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
