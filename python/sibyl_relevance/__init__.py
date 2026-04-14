"""Sibyl Relevance Module

Subagent-based relevance evaluation with caching.
"""

from .cache import RelevanceCache, CacheEntry
from .evaluator import CachedRelevanceEvaluator
from .prompts import (
    QUERY_RELEVANCE_PROMPT,
    CONTEXT_RELEVANCE_PROMPT,
    BATCH_RELEVANCE_PROMPT,
)

__all__ = [
    "RelevanceCache",
    "CacheEntry",
    "CachedRelevanceEvaluator",
    "QUERY_RELEVANCE_PROMPT",
    "CONTEXT_RELEVANCE_PROMPT",
    "BATCH_RELEVANCE_PROMPT",
]
