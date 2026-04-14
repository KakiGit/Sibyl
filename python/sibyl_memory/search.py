"""Hybrid search implementation."""

import logging
from typing import List, Optional, Tuple
from dataclasses import dataclass

from .models import Entity, Fact, Episode, MemoryQueryResult

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    item: Entity | Fact | Episode
    score: float
    search_type: str


class HybridSearch:
    """Hybrid search combining semantic, keyword, and graph traversal."""

    def __init__(self, graphiti_client, embedder, bm25_enabled: bool = True):
        self.client = graphiti_client
        self.embedder = embedder
        self.bm25_enabled = bm25_enabled
        self._bm25_index = {}

    async def search(
        self,
        query: str,
        num_results: int = 10,
        session_id: Optional[str] = None,
        entity_types: Optional[List[str]] = None,
    ) -> MemoryQueryResult:
        """Perform hybrid search."""
        semantic_results = await self._semantic_search(query, num_results * 2)

        keyword_results = []
        if self.bm25_enabled:
            keyword_results = self._keyword_search(query, num_results * 2)

        graph_results = await self._graph_traversal(
            query,
            semantic_results,
            num_results,
        )

        merged = self._merge_results(
            semantic_results,
            keyword_results,
            graph_results,
            num_results,
        )

        facts = []
        entities = []
        episodes = []
        scores = []

        for item, score in merged:
            if isinstance(item, Fact):
                facts.append(item)
                scores.append(score)
            elif isinstance(item, Entity):
                entities.append(item)
            elif isinstance(item, Episode):
                episodes.append(item)

        return MemoryQueryResult(
            facts=facts,
            entities=entities,
            episodes=episodes,
            relevance_scores=scores,
        )

    async def _semantic_search(
        self,
        query: str,
        limit: int,
    ) -> List[Tuple[Fact | Entity | Episode, float]]:
        """Semantic search using vector embeddings."""
        results = []

        try:
            query_embedding = await self.embedder.embed([query])
            search_results = await self.client.vector_search(
                query_embedding[0],
                limit=limit,
            )

            for item, distance in search_results:
                similarity = 1.0 - distance
                results.append((item, similarity))
        except Exception as e:
            logger.warning(f"Semantic search failed: {e}")

        return results

    def _keyword_search(
        self,
        query: str,
        limit: int,
    ) -> List[Tuple[Fact | Entity | Episode, float]]:
        """BM25 keyword search."""
        results = []
        query_terms = set(query.lower().split())

        for item_key, item_data in self._bm25_index.items():
            item_text = item_data.get("text", "").lower()
            item_terms = set(item_text.split())

            overlap = len(query_terms & item_terms)
            if overlap > 0:
                score = overlap / len(query_terms)
                results.append((item_data["item"], score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:limit]

    async def _graph_traversal(
        self,
        query: str,
        seed_results: List[Tuple[Fact | Entity | Episode, float]],
        limit: int,
    ) -> List[Tuple[Entity | Fact, float]]:
        """Traverse graph from seed entities."""
        results = []

        seed_entities = []
        for item, score in seed_results:
            if isinstance(item, Entity):
                seed_entities.append(item)
            elif isinstance(item, Fact):
                if item.source_node_uuid:
                    seed_entities.append(item.source_node_uuid)
                if item.target_node_uuid:
                    seed_entities.append(item.target_node_uuid)

        if seed_entities:
            try:
                connected = await self.client.get_connected_entities(
                    seed_entities[:5],
                    depth=2,
                )
                for entity in connected:
                    results.append((entity, 0.5))
            except Exception as e:
                logger.warning(f"Graph traversal failed: {e}")

        return results[:limit]

    def _merge_results(
        self,
        semantic: List[Tuple, float],
        keyword: List[Tuple, float],
        graph: List[Tuple, float],
        limit: int,
    ) -> List[Tuple]:
        """Merge and deduplicate results with weighted scoring."""
        merged = {}
        weights = {"semantic": 0.5, "keyword": 0.3, "graph": 0.2}

        for item, score in semantic:
            key = self._get_item_key(item)
            merged[key] = (item, score * weights["semantic"])

        for item, score in keyword:
            key = self._get_item_key(item)
            if key in merged:
                merged[key] = (
                    merged[key][0],
                    merged[key][1] + score * weights["keyword"],
                )
            else:
                merged[key] = (item, score * weights["keyword"])

        for item, score in graph:
            key = self._get_item_key(item)
            if key in merged:
                merged[key] = (
                    merged[key][0],
                    merged[key][1] + score * weights["graph"],
                )
            else:
                merged[key] = (item, score * weights["graph"])

        sorted_results = sorted(merged.values(), key=lambda x: x[1], reverse=True)
        return sorted_results[:limit]

    def _get_item_key(self, item) -> str:
        if hasattr(item, "uuid"):
            return f"{type(item).__name__}:{item.uuid}"
        return str(item)

    def index_item(self, item: Fact | Entity | Episode, text: str):
        """Add item to BM25 index."""
        key = self._get_item_key(item)
        self._bm25_index[key] = {"item": item, "text": text}

    def clear_index(self):
        """Clear the BM25 index."""
        self._bm25_index = {}
