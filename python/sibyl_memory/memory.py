from typing import Optional, List
from datetime import datetime
import logging

from .graphiti_client import GraphitiClient
from .models import Episode, Entity, Fact, MemoryQueryResult

logger = logging.getLogger(__name__)


class MemorySystem:
    """High-level memory system for Sibyl."""

    def __init__(self, uri: str = "redis://localhost:6379"):
        self.client = GraphitiClient(uri)

    async def initialize(self) -> None:
        """Initialize the memory system."""
        await self.client.connect()
        logger.info("Memory system initialized")

    async def shutdown(self) -> None:
        """Shutdown the memory system."""
        await self.client.close()
        logger.info("Memory system shut down")

    async def query(
        self,
        query: str,
        num_results: int = 10,
    ) -> MemoryQueryResult:
        """Query relevant memories."""
        return await self.client.search(query, num_results)

    async def add_episode(
        self,
        name: str,
        content: str,
        source_description: str = "user conversation",
        reference_time: Optional[datetime] = None,
    ) -> Episode:
        """Add a new episode to memory."""
        if reference_time is None:
            reference_time = datetime.utcnow()
        result = await self.client.add_episode(
            name=name,
            episode_body=content,
            source_description=source_description,
            reference_time=reference_time,
        )
        return result

    async def get_context(
        self,
        query: str,
        max_tokens: int = 4000,
    ) -> str:
        """Get contextual information for a query."""
        results = await self.query(query)

        context_parts = []
        current_tokens = 0

        for episode, score in zip(results.episodes, results.relevance_scores):
            if current_tokens >= max_tokens:
                break
            context_parts.append(f"[Relevance: {score:.2f}] {episode.content}")
            current_tokens += len(episode.content.split())

        for fact in results.facts:
            if current_tokens >= max_tokens:
                break
            context_parts.append(f"Fact: {fact.fact}")
            current_tokens += len(fact.fact.split())

        return "\n".join(context_parts)
