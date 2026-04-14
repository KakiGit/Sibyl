import logging
from typing import List, Optional

from .config import EmbedderConfig

logger = logging.getLogger(__name__)


class LocalEmbedder:
    """Local embedder using sentence-transformers."""

    def __init__(self, config: Optional[EmbedderConfig] = None):
        self.config = config or EmbedderConfig()
        self._model = None

    @property
    def model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(
                    self.config.model,
                    device=self.config.device,
                )
                logger.info(f"Loaded embedding model: {self.config.model}")
            except ImportError:
                logger.warning("sentence-transformers not installed")
                raise
        return self._model

    async def embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts."""
        embeddings = self.model.encode(
            texts,
            batch_size=self.config.batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embeddings.tolist()

    def embed_sync(self, texts: List[str]) -> List[List[float]]:
        """Synchronous embedding generation."""
        embeddings = self.model.encode(
            texts,
            batch_size=self.config.batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embeddings.tolist()

    @property
    def dimensions(self) -> int:
        return self.config.dimensions
