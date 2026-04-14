"""High-level memory system for Sibyl."""

from typing import Optional, List
from datetime import datetime
import logging

from .graphiti_client import GraphitiClient
from .models import Episode, Entity, Fact, MemoryQueryResult
from .episode_manager import EpisodeManager
from .search import HybridSearch
from .context_builder import ContextBuilder
from .relevance_filter import HybridRelevanceFilter

logger = logging.getLogger(__name__)


class MemorySystem:
    """High-level memory system for Sibyl."""

    def __init__(
        self,
        client: Optional[GraphitiClient] = None,
        uri: str = "redis://localhost:6379",
    ):
        self.client = client or GraphitiClient(uri=uri)
        self.episode_manager: Optional[EpisodeManager] = None
        self.search: Optional[HybridSearch] = None
        self.context_builder: Optional[ContextBuilder] = None
        self.relevance_filter: Optional[HybridRelevanceFilter] = None

    async def initialize(self) -> None:
        """Initialize the memory system."""
        if not self.client._graphiti:
            await self.client.connect()

        self.episode_manager = EpisodeManager(self.client)

        if self.client._embedder:
            self.search = HybridSearch(
                graphiti_client=self.client,
                embedder=self.client._embedder,
            )

            self.relevance_filter = HybridRelevanceFilter(
                embedder=self.client._embedder,
                llm_client=self.client._llm_client,
            )

            self.context_builder = ContextBuilder(
                memory_system=self,
                relevance_filter=self.relevance_filter,
            )

        logger.info("Memory system initialized")

    async def shutdown(self) -> None:
        """Shutdown the memory system."""
        await self.client.close()
        logger.info("Memory system shut down")

    async def query(
        self,
        query: str,
        num_results: int = 10,
        session_id: Optional[str] = None,
    ) -> MemoryQueryResult:
        """Query relevant memories."""
        if self.search:
            return await self.search.search(
                query=query,
                num_results=num_results,
                session_id=session_id,
            )
        return await self.client.search(query, num_results, group_id=session_id)

    async def add_episode(
        self,
        name: str,
        content: str,
        source_description: str = "user conversation",
        reference_time: Optional[datetime] = None,
        session_id: Optional[str] = None,
    ) -> Episode:
        """Add a new episode to memory."""
        if reference_time is None:
            reference_time = datetime.utcnow()

        if self.episode_manager:
            return await self.episode_manager.add_conversation(
                content=content,
                session_id=session_id,
                source=source_description,
                reference_time=reference_time,
            )

        result = await self.client.add_episode(
            name=name,
            episode_body=content,
            source_description=source_description,
            reference_time=reference_time,
            group_id=session_id,
        )
        return result

    async def get_context(
        self,
        query: str = "",
        max_tokens: int = 4000,
        session_id: Optional[str] = None,
    ) -> str:
        """Get contextual information for a query."""
        if self.context_builder:
            return await self.context_builder.build(
                query=query,
                session_id=session_id,
                max_tokens=max_tokens,
            )

        results = await self.query(query, session_id=session_id)

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

    async def get_entities(
        self,
        entity_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Entity]:
        """Get entities from memory."""
        return await self.client.get_entities(entity_type=entity_type, limit=limit)

    async def invalidate_fact(
        self,
        fact_id: str,
        reason: Optional[str] = None,
    ) -> bool:
        """Mark a fact as superseded."""
        return await self.client.invalidate_fact(fact_id, reason)

    async def clear_session(self, session_id: str) -> bool:
        """Clear memories for a session."""
        return await self.client.clear_group(session_id)

    async def add_code_change(
        self,
        file_path: str,
        change_description: str,
        session_id: Optional[str] = None,
    ) -> Episode:
        """Add a code change episode."""
        if self.episode_manager:
            return await self.episode_manager.add_code_change(
                file_path=file_path,
                change_description=change_description,
                session_id=session_id,
            )
        return await self.add_episode(
            name=f"code-{session_id}",
            content=f"File: {file_path}\nChange: {change_description}",
            source_description="code change",
            session_id=session_id,
        )

    async def add_decision(
        self,
        decision: str,
        reason: str,
        outcome: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Episode:
        """Add a decision episode."""
        content = f"Decision: {decision}\nReason: {reason}"
        if outcome:
            content += f"\nOutcome: {outcome}"

        if self.episode_manager:
            return await self.episode_manager.add_decision(
                decision=decision,
                reason=reason,
                outcome=outcome,
                session_id=session_id,
            )
        return await self.add_episode(
            name=f"decision-{session_id}",
            content=content,
            source_description="decision",
            session_id=session_id,
        )
