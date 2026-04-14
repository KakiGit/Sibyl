"""
LLM client for entity extraction using Ollama.
"""

from .ollama import OllamaClient
from .config import LLMConfig

__all__ = ["OllamaClient", "LLMConfig"]
