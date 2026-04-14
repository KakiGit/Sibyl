"""Context builder for assembling relevant context."""

import logging
from typing import List, Optional
from datetime import datetime

from .models import Fact, Entity, Episode

logger = logging.getLogger(__name__)


class ContextBuilder:
    """Builds memory context for prompt injection."""

    def __init__(self, memory_system, relevance_filter=None):
        self.memory = memory_system
        self.relevance_filter = relevance_filter
        self.max_tokens = 2000

    async def build(
        self,
        query: Optional[str] = None,
        session_id: Optional[str] = None,
        max_tokens: int = 2000,
    ) -> str:
        """Build context string for prompt."""
        self.max_tokens = max_tokens

        query = query or ""
        results = await self.memory.query(query, num_results=20, session_id=session_id)

        facts = results.facts
        entities = results.entities
        episodes = results.episodes

        if self.relevance_filter and query:
            facts = await self.relevance_filter.filter(query, facts)
            entities = await self.relevance_filter.filter(query, entities)

        context_parts = []
        context_parts.append("# Relevant Memory Context\n")

        if entities:
            context_parts.append(self._format_entities(entities))

        if facts:
            context_parts.append(self._format_facts(facts))

        if episodes:
            context_parts.append(self._format_episodes(episodes))

        context = "\n".join(context_parts)
        context = self._truncate_to_tokens(context, max_tokens)

        return context

    def _format_entities(self, entities: List[Entity]) -> str:
        lines = ["## Known Entities\n"]

        grouped = {}
        for entity in entities:
            etype = entity.entity_type.value
            if etype not in grouped:
                grouped[etype] = []
            grouped[etype].append(entity)

        for etype, items in grouped.items():
            lines.append(f"### {etype.title()}")
            for entity in items[:5]:
                summary = entity.summary[:100] if entity.summary else "No summary"
                lines.append(f"- **{entity.name}**: {summary}")
            lines.append("")

        return "\n".join(lines)

    def _format_facts(self, facts: List[Fact]) -> str:
        lines = ["## Facts\n"]

        current_facts = []
        superseded_facts = []

        for fact in facts:
            if fact.invalid_at:
                superseded_facts.append(fact)
            else:
                current_facts.append(fact)

        if current_facts:
            lines.append("### Current Knowledge")
            for fact in current_facts[:10]:
                lines.append(f"- {fact.fact}")
            lines.append("")

        if superseded_facts:
            lines.append("### Past Knowledge (Superseded)")
            for fact in superseded_facts[:5]:
                invalid_date = (
                    fact.invalid_at.strftime("%Y-%m-%d")
                    if fact.invalid_at
                    else "unknown"
                )
                lines.append(f"- {fact.fact} (invalidated: {invalid_date})")
            lines.append("")

        return "\n".join(lines)

    def _format_episodes(self, episodes: List[Episode]) -> str:
        lines = ["## Recent Conversations\n"]

        for episode in episodes[:5]:
            etype = episode.episode_type.value
            date = episode.created_at.strftime("%Y-%m-%d") if episode.created_at else ""
            content = episode.content[:150]
            if len(episode.content) > 150:
                content += "..."
            lines.append(f"- [{etype}] ({date}) {content}")

        return "\n".join(lines)

    def _truncate_to_tokens(self, text: str, max_tokens: int) -> str:
        """Truncate text to approximate token limit."""
        words = text.split()
        estimated_tokens = len(words) * 1.3

        if estimated_tokens <= max_tokens:
            return text

        target_words = int(max_tokens / 1.3)
        truncated = " ".join(words[:target_words])
        return truncated + "\n\n[Context truncated due to token limit]"

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text."""
        return int(len(text.split()) * 1.3)
