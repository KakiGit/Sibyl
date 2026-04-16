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
        threshold: float = 0.5,
    ):
        self.llm_client = llm_client
        self.cache = RelevanceCache(ttl_seconds=cache_ttl)
        self.threshold = threshold

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

        prompt = f"""Is this memory relevant to the query? Reply with only a number from 0.0 to 1.0.

Query: {query}
Memory: {fact_text}

Relevance score (0.0=not relevant, 1.0=very relevant):"""

        try:
            if self.llm_client:
                response = await self.llm_client.generate(prompt, max_tokens=5)
                text = response.strip()
                if not text:
                    return 0.5
                try:
                    score = float(text)
                    return max(0.0, min(1.0, score))
                except ValueError:
                    pass
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
