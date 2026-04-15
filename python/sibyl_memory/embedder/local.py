import logging
from typing import List, Optional, Union, Iterable

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


try:
    from graphiti_core.embedder.client import EmbedderClient as GraphitiEmbedderClient

    class GraphitiLocalEmbedder(GraphitiEmbedderClient, LocalEmbedder):
        """Local embedder compatible with graphiti-core EmbedderClient interface."""

        def create(
            self,
            input_data: Union[str, List[str], Iterable[int], Iterable[Iterable[int]]],
        ) -> List[float]:
            """Create embedding for input data (graphiti-core interface)."""
            if isinstance(input_data, str):
                return self.embed_sync([input_data])[0]
            elif isinstance(input_data, list) and all(
                isinstance(x, str) for x in input_data
            ):
                return self.embed_sync(input_data)
            else:
                raise ValueError(f"Unsupported input type: {type(input_data)}")

except ImportError:

    class GraphitiLocalEmbedder(LocalEmbedder):
        """Fallback embedder when graphiti-core not installed."""

        def create(
            self,
            input_data: Union[str, List[str], Iterable[int], Iterable[Iterable[int]]],
        ) -> List[float]:
            if isinstance(input_data, str):
                return self.embed_sync([input_data])[0]
            elif isinstance(input_data, list) and all(
                isinstance(x, str) for x in input_data
            ):
                return self.embed_sync(input_data)
            else:
                raise ValueError(f"Unsupported input type: {type(input_data)}")
