"""Relevance filter for subagent-based filtering."""

import logging
from typing import List, Tuple, Optional
from abc import ABC, abstractmethod

from .llm.ollama import OllamaClient
from .llm.config import LLMConfig

logger = logging.getLogger(__name__)


class RelevanceFilter(ABC):
    """Abstract base class for relevance filtering."""

    @abstractmethod
    async def filter(
        self,
        query: str,
        items: List,
        threshold: float = 0.7,
    ) -> List:
        """Filter items by relevance to query."""
        pass


class LLMRelevanceFilter(RelevanceFilter):
    """LLM-based relevance evaluation using subagent."""

    def __init__(self, llm_client: Optional[OllamaClient] = None):
        self.llm = llm_client or OllamaClient(LLMConfig(model="llama3.2"))

    async def filter(
        self,
        query: str,
        items: List,
        threshold: float = 0.7,
    ) -> List:
        """Filter items using LLM evaluation."""
        if not items:
            return []

        scored = await self._score_items(query, items)
        filtered = [item for item, score in scored if score >= threshold]

        logger.info(
            f"Filtered {len(items)} items to {len(filtered)} (threshold={threshold})"
        )
        return filtered

    async def _score_items(
        self,
        query: str,
        items: List,
    ) -> List[Tuple]:
        """Score items for relevance."""
        results = []

        for item in items:
            score = await self._evaluate_relevance(query, item)
            results.append((item, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results

    async def _evaluate_relevance(self, query: str, item) -> float:
        """Evaluate single item relevance."""
        item_text = self._item_to_text(item)

        prompt = f"""Evaluate the relevance of this memory to the query.

Query: {query}

Memory: {item_text}

Rate relevance from 0.0 to 1.0 where:
- 1.0: Directly answers the query
- 0.7: Related and useful context
- 0.4: Tangentially related
- 0.0: Not relevant

Output only a single number between 0.0 and 1.0:"""

        try:
            response = await self.llm.generate(prompt)
            score = float(response.strip())
            return max(0.0, min(1.0, score))
        except Exception as e:
            logger.warning(f"LLM evaluation failed: {e}")
            return 0.5

    def _item_to_text(self, item) -> str:
        """Convert item to text representation."""
        if hasattr(item, "fact"):
            return item.fact
        elif hasattr(item, "summary"):
            return f"{item.name}: {item.summary}"
        elif hasattr(item, "content"):
            return item.content
        return str(item)


class EmbeddingRelevanceFilter(RelevanceFilter):
    """Relevance filter using embedding similarity."""

    def __init__(self, embedder):
        self.embedder = embedder

    async def filter(
        self,
        query: str,
        items: List,
        threshold: float = 0.7,
    ) -> List:
        """Filter items using embedding similarity."""
        if not items:
            return []

        query_embedding = (await self.embedder.embed([query]))[0]
        item_texts = [self._item_to_text(item) for item in items]

        if not item_texts:
            return []

        item_embeddings = await self.embedder.embed(item_texts)

        scored = []
        for item, embedding in zip(items, item_embeddings):
            score = self._cosine_similarity(query_embedding, embedding)
            scored.append((item, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        filtered = [item for item, score in scored if score >= threshold]

        return filtered

    def _item_to_text(self, item) -> str:
        if hasattr(item, "fact"):
            return item.fact
        elif hasattr(item, "summary"):
            return f"{item.name}: {item.summary}"
        elif hasattr(item, "content"):
            return item.content
        return str(item)

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)


class HybridRelevanceFilter(RelevanceFilter):
    """Combines embedding and LLM filtering."""

    def __init__(self, embedder, llm_client=None, use_llm_threshold: float = 0.5):
        self.embedding_filter = EmbeddingRelevanceFilter(embedder)
        self.llm_filter = LLMRelevanceFilter(llm_client) if llm_client else None
        self.use_llm_threshold = use_llm_threshold

    async def filter(
        self,
        query: str,
        items: List,
        threshold: float = 0.7,
    ) -> List:
        """Filter using embedding first, then LLM for borderline cases."""
        if not items:
            return []

        embedding_filtered = await self.embedding_filter.filter(
            query, items, threshold=self.use_llm_threshold
        )

        if not self.llm_filter:
            return await self.embedding_filter.filter(
                embedding_filtered, query, threshold=threshold
            )

        return await self.llm_filter.filter(query, embedding_filtered, threshold)
