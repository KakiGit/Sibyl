"""Relevance evaluator with embedding-based fast scoring and optional LLM refinement."""

import logging
from typing import List, Tuple, Optional

from .cache import RelevanceCache

logger = logging.getLogger(__name__)


class CachedRelevanceEvaluator:
    """Relevance evaluator with caching and embedding-based fast scoring."""

    def __init__(
        self,
        llm_client=None,
        embedder=None,
        cache_ttl: int = 600,
        threshold: float = 0.5,
        use_llm: bool = False,
    ):
        self.llm_client = llm_client
        self.embedder = embedder
        self.cache = RelevanceCache(ttl_seconds=cache_ttl)
        self.threshold = threshold
        self.use_llm = use_llm
        self._query_embeddings: dict = {}

    async def evaluate_batch(
        self,
        query: str,
        facts: List,
        threshold: Optional[float] = None,
    ) -> List[Tuple]:
        """Evaluate facts for relevance, using cache and embedding similarity."""
        threshold = threshold or self.threshold
        results = []

        uncached_facts = []
        uncached_indices = []

        for i, fact in enumerate(facts):
            fact_id = self._get_fact_id(fact)
            cached_score = self.cache.get(query, fact_id)

            if cached_score is not None:
                logger.debug(f"Using cached score for {fact_id}: {cached_score}")
                if cached_score >= threshold:
                    results.append((fact, cached_score))
            else:
                uncached_facts.append(fact)
                uncached_indices.append(i)

        if uncached_facts and self.embedder and not self.use_llm:
            query_embedding = await self._get_query_embedding(query)
            fact_texts = [self._get_fact_text(f) for f in uncached_facts]
            fact_embeddings = await self.embedder.embed(fact_texts)

            for idx, (fact, fact_embedding) in enumerate(
                zip(uncached_facts, fact_embeddings)
            ):
                similarity = self._cosine_similarity(query_embedding, fact_embedding)
                fact_id = self._get_fact_id(fact)
                self.cache.set(query, fact_id, similarity)
                if similarity >= threshold:
                    results.append((fact, similarity))
        elif uncached_facts:
            for fact in uncached_facts:
                fact_id = self._get_fact_id(fact)
                if self.use_llm and self.llm_client:
                    score = await self._evaluate_single_llm(query, fact)
                else:
                    score = self._evaluate_keyword(query, fact)
                self.cache.set(query, fact_id, score)
                if score >= threshold:
                    results.append((fact, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results

    async def _get_query_embedding(self, query: str) -> List[float]:
        """Get or cache query embedding."""
        if query not in self._query_embeddings:
            embeddings = await self.embedder.embed([query])
            self._query_embeddings[query] = embeddings[0]
        return self._query_embeddings[query]

    async def _evaluate_embedding(self, query_embedding: List[float], fact) -> float:
        """Evaluate using embedding cosine similarity."""
        fact_text = self._get_fact_text(fact)
        fact_embeddings = await self.embedder.embed([fact_text])
        fact_embedding = fact_embeddings[0]

        similarity = self._cosine_similarity(query_embedding, fact_embedding)
        return similarity

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        import math

        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    def _evaluate_keyword(self, query: str, fact) -> float:
        """Fast keyword-based relevance scoring."""
        fact_text = self._get_fact_text(fact).lower()
        query_lower = query.lower()
        query_words = set(query_lower.split())

        fact_words = set(fact_text.split())
        overlap = len(query_words & fact_words)
        coverage = overlap / max(len(query_words), 1)

        if coverage > 0.5:
            return 0.7 + coverage * 0.3
        elif coverage > 0.2:
            return 0.4 + coverage * 0.3
        else:
            return coverage

    async def _evaluate_single_llm(self, query: str, fact) -> float:
        """Evaluate single fact relevance using LLM (slower, more accurate)."""
        fact_text = self._get_fact_text(fact)

        prompt = f"""Score relevance 0-1. Query: {query[:50]} Memory: {fact_text[:50]}. Score:"""

        try:
            if self.llm_client:
                response = await self.llm_client.generate(prompt, max_tokens=3)
                text = response.strip()
                for word in text.split():
                    try:
                        score = float(word)
                        return max(0.0, min(1.0, score))
                    except ValueError:
                        continue
        except Exception as e:
            logger.warning(f"LLM evaluation failed: {e}")

        return self._evaluate_keyword(query, fact)

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
