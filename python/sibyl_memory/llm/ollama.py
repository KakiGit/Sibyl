import logging
from typing import List, Dict, Any, Optional, AsyncGenerator

import httpx

from .config import LLMConfig

logger = logging.getLogger(__name__)


class OllamaClient:
    """Ollama client for entity extraction."""

    def __init__(self, config: Optional[LLMConfig] = None):
        self.config = config or LLMConfig()
        self._client: Optional[httpx.AsyncClient] = None

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
