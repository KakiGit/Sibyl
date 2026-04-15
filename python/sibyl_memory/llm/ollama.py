import logging
from typing import List, Dict, Any, Optional, AsyncGenerator, Type
import httpx

from .config import LLMConfig

logger = logging.getLogger(__name__)


class OllamaClient:
    """Ollama client for entity extraction."""

    def __init__(self, config: Optional[LLMConfig] = None):
        self.config = config or LLMConfig()
        self._client: Optional[httpx.AsyncClient] = None
        self._tracer = None

    def set_tracer(self, tracer):
        """Set tracer for graphiti-core compatibility."""
        self._tracer = tracer

    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=self.config.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.aclose()

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.config.timeout)
        return self._client

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
    ) -> str:
        """Generate a response from the model."""
        url = f"{self.config.base_url}/api/generate"

        payload = {
            "model": self.config.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": self.config.temperature,
            },
        }

        if system:
            payload["system"] = system

        if self.config.max_tokens:
            payload["options"]["num_predict"] = self.config.max_tokens

        response = await self.client.post(url, json=payload)
        response.raise_for_status()

        result = response.json()
        return result.get("response", "")

    async def chat(
        self,
        messages: List[Dict[str, str]],
    ) -> str:
        """Chat completion with message history."""
        url = f"{self.config.base_url}/api/chat"

        payload = {
            "model": self.config.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": self.config.temperature,
            },
        }

        if self.config.max_tokens:
            payload["options"]["num_predict"] = self.config.max_tokens

        response = await self.client.post(url, json=payload)
        response.raise_for_status()

        result = response.json()
        return result.get("message", {}).get("content", "")

    async def embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for texts."""
        url = f"{self.config.base_url}/api/embeddings"

        embeddings = []
        for text in texts:
            payload = {
                "model": self.config.model,
                "prompt": text,
            }
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            result = response.json()
            embeddings.append(result.get("embedding", []))

        return embeddings

    async def stream(
        self,
        prompt: str,
        system: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream response from the model."""
        url = f"{self.config.base_url}/api/generate"

        payload = {
            "model": self.config.model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": self.config.temperature,
            },
        }

        if system:
            payload["system"] = system

        async with self.client.stream("POST", url, json=payload) as response:
            async for line in response.aiter_lines():
                if line:
                    import json

                    data = json.loads(line)
                    if "response" in data:
                        yield data["response"]

    async def is_available(self) -> bool:
        """Check if Ollama is running and model is available."""
        try:
            url = f"{self.config.base_url}/api/tags"
            response = await self.client.get(url)
            if response.status_code == 200:
                models = response.json().get("models", [])
                return any(m["name"].startswith(self.config.model) for m in models)
        except Exception as e:
            logger.debug(f"Ollama not available: {e}")
        return False


try:
    from graphiti_core.llm_client.client import LLMClient as GraphitiLLMClient
    from graphiti_core.llm_client.config import ModelSize

    class GraphitiOllamaClient(GraphitiLLMClient):
        """Ollama client compatible with graphiti-core LLMClient interface."""

        def __init__(self, config: Optional[LLMConfig] = None, cache: bool = False):
            self.config = config or LLMConfig()
            self._client: Optional[httpx.AsyncClient] = None
            self.max_tokens = self.config.max_tokens or 16384
            self.cache_enabled = cache
            self.cache_dir = None
            self.tracer = None
            self.token_tracker = None

        def set_tracer(self, tracer):
            """Set tracer for graphiti-core compatibility."""
            self.tracer = tracer

        async def _generate_response(
            self,
            messages: List[Any],
            response_model: Optional[Type[Any]] = None,
            max_tokens: int = 16384,
            model_size: ModelSize = ModelSize.medium,
        ) -> Dict[str, Any]:
            """Generate response compatible with graphiti-core."""
            url = f"{self.config.base_url}/api/chat"

            formatted_messages = []
            for msg in messages:
                if hasattr(msg, "role") and hasattr(msg, "content"):
                    formatted_messages.append(
                        {"role": msg.role, "content": msg.content}
                    )
                elif isinstance(msg, dict):
                    formatted_messages.append(msg)

            payload = {
                "model": self.config.model,
                "messages": formatted_messages,
                "stream": False,
                "options": {
                    "temperature": self.config.temperature,
                    "num_predict": max_tokens,
                },
            }

            if self._client is None:
                self._client = httpx.AsyncClient(timeout=self.config.timeout)

            response = await self._client.post(url, json=payload)
            response.raise_for_status()

            result = response.json()
            content = result.get("message", {}).get("content", "")

            if response_model:
                try:
                    import json

                    parsed = json.loads(content)
                    return parsed
                except json.JSONDecodeError:
                    return {"content": content}

            return {"content": content}

except ImportError:

    class GraphitiOllamaClient:
        """Fallback Ollama client when graphiti-core not installed."""

        def __init__(self, config: Optional[LLMConfig] = None):
            self.config = config or LLMConfig()

        def set_tracer(self, tracer):
            pass

        async def _generate_response(
            self,
            messages: List[Any],
            response_model: Optional[Type[Any]] = None,
            max_tokens: int = 16384,
            model_size: str = "medium",
        ) -> Dict[str, Any]:
            return {"content": ""}
