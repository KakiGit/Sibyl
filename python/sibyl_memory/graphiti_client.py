"""Graphiti client with FalkorDB integration."""

from typing import Optional, List, Tuple, Any
from datetime import datetime
import logging

from .models import Episode, Entity, Fact, MemoryQueryResult, EpisodeType, EntityType
from .embedder.local import LocalEmbedder
from .embedder.config import EmbedderConfig
from .llm.ollama import OllamaClient
from .llm.config import LLMConfig

logger = logging.getLogger(__name__)


class GraphitiClient:
    """Client for interacting with Graphiti knowledge graph using FalkorDB."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        database: str = "sibyl_memory",
        embedder_config: Optional[EmbedderConfig] = None,
        llm_config: Optional[LLMConfig] = None,
    ):
        self.host = host
        self.port = port
        self.database = database
        self.embedder_config = embedder_config or EmbedderConfig()
        self.llm_config = llm_config or LLMConfig()

        self._graphiti = None
        self._driver = None
        self._embedder = None
        self._llm_client = None

    async def connect(self) -> None:
        """Initialize connection to FalkorDB/Graphiti."""
        try:
            from graphiti_core import Graphiti
            from graphiti_core.driver.falkordb_driver import FalkorDriver

            self._driver = FalkorDriver(
                host=self.host,
                port=self.port,
                database=self.database,
            )

            self._embedder = LocalEmbedder(self.embedder_config)
            self._llm_client = OllamaClient(self.llm_config)

            self._graphiti = Graphiti(
                graph_driver=self._driver,
                embedder=self._embedder,
                llm_client=self._llm_client,
            )

            await self._graphiti.build_indices_and_constraints()
            logger.info(f"Connected to Graphiti at {self.host}:{self.port}")

        except ImportError as e:
            logger.warning(f"graphiti-core not installed: {e}")
            self._graphiti = None
        except Exception as e:
            logger.error(f"Failed to connect to Graphiti: {e}")
            raise

    async def close(self) -> None:
        """Close the connection."""
        if self._graphiti:
            await self._graphiti.close()
            logger.info("Graphiti connection closed")

    async def add_episode(
        self,
        name: str,
        episode_body: str,
        source_description: str,
        reference_time: datetime,
        group_id: Optional[str] = None,
    ) -> Episode:
        """Add a new episode to the knowledge graph."""
        if self._graphiti:
            try:
                node = await self._graphiti.add_episode(
                    name=name,
                    episode_body=episode_body,
                    source_description=source_description,
                    reference_time=reference_time,
                    group_id=group_id,
                )
                return Episode(
                    uuid=node.uuid,
                    content=episode_body,
                    source_description=source_description,
                    episode_type=EpisodeType.CONVERSATION,
                    created_at=datetime.utcnow(),
                )
            except Exception as e:
                logger.error(f"Failed to add episode: {e}")
                raise

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
        group_id: Optional[str] = None,
    ) -> MemoryQueryResult:
        """Search the knowledge graph for relevant memories."""
        if self._graphiti:
            try:
                results = await self._graphiti.search(
                    query=query,
                    num_results=num_results,
                    group_id=group_id,
                )

                episodes = []
                entities = []
                facts = []
                relevance_scores = []

                if hasattr(results, "nodes"):
                    for node in results.nodes:
                        entities.append(
                            Entity(
                                uuid=node.uuid,
                                name=node.name,
                                summary=getattr(node, "summary", ""),
                                entity_type=EntityType.CONCEPT,
                                created_at=datetime.utcnow(),
                            )
                        )

                if hasattr(results, "edges"):
                    for edge in results.edges:
                        facts.append(
                            Fact(
                                uuid=edge.uuid,
                                source_node_uuid=edge.source_node_uuid,
                                target_node_uuid=edge.target_node_uuid,
                                name=edge.name,
                                fact=edge.fact,
                                episodes=getattr(edge, "episodes", []),
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
            except Exception as e:
                logger.error(f"Search failed: {e}")

        return MemoryQueryResult(
            episodes=[],
            entities=[],
            facts=[],
            relevance_scores=[],
        )

    async def vector_search(
        self,
        embedding: List[float],
        limit: int = 10,
    ) -> List[Tuple[Any, float]]:
        """Perform vector similarity search."""
        results = []

        if self._graphiti and hasattr(self._graphiti, "vector_search"):
            try:
                search_results = await self._graphiti.vector_search(
                    embedding=embedding,
                    limit=limit,
                )
                for item in search_results:
                    distance = getattr(item, "distance", 0.0)
                    results.append((item, distance))
            except Exception as e:
                logger.warning(f"Vector search failed: {e}")

        return results

    async def get_entity(self, entity_name: str) -> Optional[Entity]:
        """Get an entity by name."""
        if self._graphiti:
            try:
                node = await self._graphiti.get_entity(entity_name)
                if node:
                    return Entity(
                        uuid=node.uuid,
                        name=node.name,
                        summary=getattr(node, "summary", ""),
                        entity_type=EntityType.CONCEPT,
                        created_at=datetime.utcnow(),
                    )
            except Exception as e:
                logger.warning(f"Get entity failed: {e}")

        return None

    async def get_entities(
        self,
        entity_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Entity]:
        """List known entities."""
        entities = []

        if self._graphiti and hasattr(self._graphiti, "get_entities"):
            try:
                nodes = await self._graphiti.get_entities(limit=limit)
                for node in nodes:
                    etype = EntityType.CONCEPT
                    if entity_type and hasattr(node, "entity_type"):
                        if node.entity_type != entity_type:
                            continue
                    entities.append(
                        Entity(
                            uuid=node.uuid,
                            name=node.name,
                            summary=getattr(node, "summary", ""),
                            entity_type=etype,
                            created_at=datetime.utcnow(),
                        )
                    )
            except Exception as e:
                logger.warning(f"Get entities failed: {e}")

        return entities

    async def get_connected_entities(
        self,
        entity_ids: List[str],
        depth: int = 1,
    ) -> List[Entity]:
        """Get entities connected to the given entities."""
        entities = []

        if self._graphiti and hasattr(self._graphiti, "get_connected_entities"):
            try:
                nodes = await self._graphiti.get_connected_entities(
                    entity_ids,
                    depth=depth,
                )
                for node in nodes:
                    entities.append(
                        Entity(
                            uuid=node.uuid,
                            name=node.name,
                            summary=getattr(node, "summary", ""),
                            entity_type=EntityType.CONCEPT,
                            created_at=datetime.utcnow(),
                        )
                    )
            except Exception as e:
                logger.warning(f"Get connected entities failed: {e}")

        return entities

    async def get_episodes(
        self,
        group_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[Episode]:
        """Get episodes, optionally filtered by group."""
        episodes = []

        if self._graphiti and hasattr(self._graphiti, "get_episodes"):
            try:
                nodes = await self._graphiti.get_episodes(
                    group_id=group_id,
                    limit=limit,
                )
                for node in nodes:
                    episodes.append(
                        Episode(
                            uuid=node.uuid,
                            content=getattr(node, "content", ""),
                            source_description=getattr(node, "source_description", ""),
                            episode_type=EpisodeType.CONVERSATION,
                            created_at=datetime.utcnow(),
                        )
                    )
            except Exception as e:
                logger.warning(f"Get episodes failed: {e}")

        return episodes

    async def invalidate_fact(
        self,
        fact_id: str,
        reason: Optional[str] = None,
    ) -> bool:
        """Mark a fact as superseded."""
        if self._graphiti and hasattr(self._graphiti, "invalidate_edge"):
            try:
                await self._graphiti.invalidate_edge(fact_id)
                logger.info(f"Invalidated fact {fact_id}: {reason}")
                return True
            except Exception as e:
                logger.error(f"Failed to invalidate fact: {e}")

        return False

    async def clear_group(self, group_id: str) -> bool:
        """Clear all data for a group/session."""
        if self._graphiti and hasattr(self._graphiti, "clear_group"):
            try:
                await self._graphiti.clear_group(group_id)
                logger.info(f"Cleared group {group_id}")
                return True
            except Exception as e:
                logger.error(f"Failed to clear group: {e}")

        return False
