from typing import Optional
from datetime import datetime
import logging

from .models import Episode, Entity, Fact, MemoryQueryResult, EpisodeType, EntityType

logger = logging.getLogger(__name__)


class GraphitiClient:
    """Client for interacting with Graphiti knowledge graph."""

    def __init__(self, uri: str = "redis://localhost:6379"):
        self.uri = uri
        self._client = None

    async def connect(self) -> None:
        """Initialize connection to FalkorDB/Graphiti."""
        try:
            from graphiti_core import Graphiti
            from graphiti_core.llm_client import OpenAIClient

            self._client = Graphiti(uri=self.uri)
            await self._client.build_indices_and_constraints()
            logger.info(f"Connected to Graphiti at {self.uri}")
        except ImportError:
            logger.warning("graphiti-core not installed, using mock client")
            self._client = None

    async def close(self) -> None:
        """Close the connection."""
        if self._client:
            await self._client.close()

    async def add_episode(
        self,
        name: str,
        episode_body: str,
        source_description: str,
        reference_time: datetime,
    ) -> Optional[Episode]:
        """Add a new episode to the knowledge graph."""
        if self._client:
            from graphiti_core import Episode as GraphitiEpisode

            node = await self._client.add_episode(
                name=name,
                episode_body=episode_body,
                source_description=source_description,
                reference_time=reference_time,
            )
            return Episode(
                uuid=node.uuid,
                content=episode_body,
                source_description=source_description,
                episode_type=EpisodeType.CONVERSATION,
                created_at=datetime.utcnow(),
            )
        return Episode(
            uuid=f"mock-{name}",
            content=episode_body,
            source_description=source_description,
            episode_type=EpisodeType.CONVERSATION,
            created_at=datetime.utcnow(),
        )

    async def search(
        self,
        query: str,
        num_results: int = 10,
    ) -> MemoryQueryResult:
        """Search the knowledge graph for relevant memories."""
        if self._client:
            results = await self._client.search(query, num_results=num_results)
            episodes = []
            entities = []
            facts = []
            relevance_scores = []
            for edge in results.edges:
                facts.append(
                    Fact(
                        uuid=edge.uuid,
                        source_node_uuid=edge.source_node_uuid,
                        target_node_uuid=edge.target_node_uuid,
                        name=edge.name,
                        fact=edge.fact,
                        episodes=edge.episodes,
                        created_at=datetime.utcnow(),
                    )
                )
                relevance_scores.append(1.0)
            return MemoryQueryResult(
                episodes=episodes,
                entities=entities,
                facts=facts,
                relevance_scores=relevance_scores,
            )
        return MemoryQueryResult(
            episodes=[],
            entities=[],
            facts=[],
            relevance_scores=[],
        )

    async def get_entity(self, entity_name: str) -> Optional[Entity]:
        """Get an entity by name."""
        if self._client:
            node = await self._client.get_entity(entity_name)
            if node:
                return Entity(
                    uuid=node.uuid,
                    name=node.name,
                    summary=node.summary,
                    entity_type=EntityType.CONCEPT,
                    created_at=datetime.utcnow(),
                )
        return None
