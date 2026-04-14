from typing import List, Tuple
import logging

logger = logging.getLogger(__name__)


class RelevanceEvaluator:
    """Evaluates relevance of memories to current context."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._model = None

    def _load_model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(self.model_name)
            except ImportError:
                logger.warning(
                    "sentence-transformers not installed, using keyword matching"
                )

    def evaluate(
        self,
        query: str,
        memories: List[str],
        threshold: float = 0.3,
    ) -> List[Tuple[str, float]]:
        """Evaluate relevance of memories to query."""
        self._load_model()

        if self._model is not None:
            return self._semantic_evaluate(query, memories, threshold)
        return self._keyword_evaluate(query, memories, threshold)

    def _semantic_evaluate(
        self,
        query: str,
        memories: List[str],
        threshold: float,
    ) -> List[Tuple[str, float]]:
        """Use semantic similarity for relevance evaluation."""
        query_embedding = self._model.encode(query, convert_to_tensor=True)
        memory_embeddings = self._model.encode(memories, convert_to_tensor=True)

        from sentence_transformers import util

        similarities = util.cos_sim(query_embedding, memory_embeddings)[0]

        results = []
        for memory, score in zip(memories, similarities.tolist()):
            if score >= threshold:
                results.append((memory, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def _keyword_evaluate(
        self,
        query: str,
        memories: List[str],
        threshold: float,
    ) -> List[Tuple[str, float]]:
        """Use keyword matching for relevance evaluation."""
        query_words = set(query.lower().split())
        results = []

        for memory in memories:
            memory_words = set(memory.lower().split())
            overlap = len(query_words & memory_words)
            union = len(query_words | memory_words)
            score = overlap / union if union > 0 else 0.0

            if score >= threshold:
                results.append((memory, score))

        results.sort(key=lambda x: x[1], reverse=True)
        return results
