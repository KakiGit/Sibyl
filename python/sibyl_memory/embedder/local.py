import asyncio
import logging
import os
from typing import List, Optional, Union, Iterable

from .config import EmbedderConfig

logger = logging.getLogger(__name__)

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


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
                    trust_remote_code=False,
                )
                logger.info(f"Loaded embedding model: {self.config.model}")
            except ImportError:
                logger.warning("sentence-transformers not installed")
                raise
        return self._model

    async def embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts (async with thread executor)."""
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(
            None,
            lambda: self.model.encode(
                texts,
                batch_size=self.config.batch_size,
                show_progress_bar=False,
                convert_to_numpy=True,
            ),
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

        async def create(
            self,
            input_data: Union[str, List[str], Iterable[int], Iterable[Iterable[int]]],
        ) -> List[float]:
            """Create embedding for input data (graphiti-core interface).

            Returns a flat list of floats for single string input.
            For list input, returns first embedding only (use create_batch for batch).
            """
            if isinstance(input_data, str):
                result = await self.embed([input_data])
                return result[0]
            elif isinstance(input_data, list):
                if len(input_data) == 0:
                    return []
                if all(isinstance(x, str) for x in input_data):
                    if len(input_data) == 1:
                        result = await self.embed(input_data)
                        return result[0]
                    result = await self.embed(input_data)
                    return result[0]
                raise ValueError(f"Unsupported list element type")
            else:
                raise ValueError(f"Unsupported input type: {type(input_data)}")

        async def create_batch(self, input_data_list: List[str]) -> List[List[float]]:
            """Create embeddings for a batch of strings (graphiti-core interface)."""
            return await self.embed(input_data_list)

        def set_tracer(self, tracer):
            """Set tracer for graphiti-core compatibility."""
            pass

except ImportError:

    class GraphitiLocalEmbedder(LocalEmbedder):
        """Fallback embedder when graphiti-core not installed."""

        async def create(
            self,
            input_data: Union[str, List[str], Iterable[int], Iterable[Iterable[int]]],
        ) -> List[float]:
            if isinstance(input_data, str):
                result = await self.embed([input_data])
                return result[0]
            elif isinstance(input_data, list):
                if len(input_data) == 0:
                    return []
                if all(isinstance(x, str) for x in input_data):
                    result = await self.embed(input_data)
                    return result[0]
                raise ValueError(f"Unsupported list element type")
            else:
                raise ValueError(f"Unsupported input type: {type(input_data)}")
