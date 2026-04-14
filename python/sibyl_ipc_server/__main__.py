import asyncio
import logging
from sibyl_memory import MemorySystem
from sibyl_prompt import PromptBuilder
from sibyl_ipc_server import IpcServer, MemoryHandler, PromptHandler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    memory = MemorySystem()
    await memory.initialize()

    prompt_builder = PromptBuilder()

    server = IpcServer()

    memory_handler = MemoryHandler(memory)
    prompt_handler = PromptHandler(prompt_builder)

    server.register("memory.query", memory_handler.handle_query)
    server.register("memory.add_episode", memory_handler.handle_add_episode)
    server.register("memory.get_context", memory_handler.handle_get_context)
    server.register("prompt.build", prompt_handler.handle_build)
    server.register("relevance.evaluate", prompt_handler.handle_relevance_evaluate)

    logger.info("Starting Sibyl IPC Server...")

    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await memory.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
