"""Relevance cache for avoiding repeated LLM evaluations."""

from datetime import datetime, timedelta
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class CacheEntry:
    """Single cache entry with score and timestamp."""

    def __init__(self, score: float, timestamp: datetime):
        self.score = score
        self.timestamp = timestamp


class RelevanceCache:
    """Cache relevance scores to avoid repeated LLM calls."""

    def __init__(self, ttl_seconds: int = 300, max_size: int = 1000):
        self.cache: dict[str, CacheEntry] = {}
        self.ttl = ttl_seconds
        self.max_size = max_size

    def get(self, query: str, fact_id: str) -> Optional[float]:
        """Get cached score if still valid."""
        key = f"{query}:{fact_id}"
        if key in self.cache:
            entry = self.cache[key]
            if datetime.now() - entry.timestamp < timedelta(seconds=self.ttl):
                return entry.score
            else:
                del self.cache[key]
        return None

    def set(self, query: str, fact_id: str, score: float):
        """Cache a relevance score."""
        if len(self.cache) >= self.max_size:
            self._evict_oldest()

        key = f"{query}:{fact_id}"
        self.cache[key] = CacheEntry(score, datetime.now())

    def clear(self):
        """Clear all cached entries."""
        self.cache.clear()

    def _evict_oldest(self):
        """Remove oldest entries to make room."""
        sorted_entries = sorted(
            self.cache.items(),
            key=lambda x: x[1].timestamp,
        )
        to_remove = len(sorted_entries) // 4
        for key, _ in sorted_entries[:to_remove]:
            del self.cache[key]

    def stats(self) -> dict:
        """Get cache statistics."""
        valid_count = 0
        now = datetime.now()
        for entry in self.cache.values():
            if now - entry.timestamp < timedelta(seconds=self.ttl):
                valid_count += 1
        return {
            "total_entries": len(self.cache),
            "valid_entries": valid_count,
            "ttl_seconds": self.ttl,
            "max_size": self.max_size,
        }
