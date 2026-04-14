"""LLM-based relevance evaluator with caching."""

import logging
from typing import List, Tuple, Optional

from .cache import RelevanceCache

logger = logging.getLogger(__name__)


class CachedRelevanceEvaluator:
    """Relevance evaluator with caching support."""

    def __init__(
        self,
        llm_client=None,
        cache_ttl: int = 300,
        threshold: float = 0.7,
    ):
        self.llm_client = llm_client
        self.cache = RelevanceCache(ttl_seconds=cache_ttl)
        self.threshold = threshold
        self.model = "llama3.2"

    async def evaluate_batch(
        self,
        query: str,
        facts: List,
        threshold: Optional[float] = None,
    ) -> List[Tuple]:
        """Evaluate facts for relevance, using cache when possible."""
        threshold = threshold or self.threshold
        results = []

        for fact in facts:
            fact_id = self._get_fact_id(fact)
            cached_score = self.cache.get(query, fact_id)

            if cached_score is not None:
                logger.debug(f"Using cached score for {fact_id}: {cached_score}")
                if cached_score >= threshold:
                    results.append((fact, cached_score))
            else:
                score = await self._evaluate_single(query, fact)
                self.cache.set(query, fact_id, score)
                if score >= threshold:
                    results.append((fact, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results

    async def _evaluate_single(self, query: str, fact) -> float:
        """Evaluate single fact relevance using LLM."""
        fact_text = self._get_fact_text(fact)

        prompt = f"""Evaluate if this memory is relevant to the query.

Query: "{query}"

Memory:
- Content: "{fact_text}"
- Source entity: {getattr(fact, "source_node_uuid", "unknown")}
- Target entity: {getattr(fact, "target_node_uuid", "unknown")}
- When it became true: {getattr(fact, "valid_at", "unknown")}

Answer with a single number between 0 and 1:
- 1.0 = Highly relevant, essential context
- 0.5 = Somewhat related, may be useful
- 0.0 = Not relevant, should not be included

Score:"""

        try:
            if self.llm_client:
                response = await self.llm_client.generate(prompt, max_tokens=10)
                score = float(response.strip())
                return max(0.0, min(1.0, score))
        except Exception as e:
            logger.warning(f"LLM evaluation failed: {e}")

        return 0.5

    def _get_fact_id(self, fact) -> str:
        """Get unique ID for a fact."""
        if hasattr(fact, "uuid"):
            return fact.uuid
        return str(hash(str(fact)))

    def _get_fact_text(self, fact) -> str:
        """Get text representation of a fact."""
        if hasattr(fact, "fact"):
            return fact.fact
        if hasattr(fact, "content"):
            return fact.content
        return str(fact)
