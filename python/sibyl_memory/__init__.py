"""
Sibyl Memory System

Memory layer using Graphiti + FalkorDB for temporal context graphs.
"""

from .memory import MemorySystem
from .graphiti_client import GraphitiClient
from .models import (
    Episode,
    Entity,
    Fact,
    MemoryQueryResult,
    EpisodeType,
    EntityType,
    Project,
    File,
    Preference,
    Decision,
)
from .episode_manager import EpisodeManager
from .search import HybridSearch
from .context_builder import ContextBuilder
from .relevance_filter import (
    RelevanceFilter,
    LLMRelevanceFilter,
    EmbeddingRelevanceFilter,
    HybridRelevanceFilter,
)
from .embedder import LocalEmbedder, EmbedderConfig
from .llm import OllamaClient, LLMConfig

__all__ = [
    "MemorySystem",
    "GraphitiClient",
    "Episode",
    "Entity",
    "Fact",
    "MemoryQueryResult",
    "EpisodeType",
    "EntityType",
    "Project",
    "File",
    "Preference",
    "Decision",
    "EpisodeManager",
    "HybridSearch",
    "ContextBuilder",
    "RelevanceFilter",
    "LLMRelevanceFilter",
    "EmbeddingRelevanceFilter",
    "HybridRelevanceFilter",
    "LocalEmbedder",
    "EmbedderConfig",
    "OllamaClient",
    "LLMConfig",
]
