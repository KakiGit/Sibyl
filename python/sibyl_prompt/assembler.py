from typing import List
from .models import PromptSection


class PromptAssembler:
    """Assembles prompt sections with token limits."""

    def __init__(self, tokens_per_word: float = 1.3):
        self.tokens_per_word = tokens_per_word

    def assemble(
        self,
        sections: List[PromptSection],
        max_tokens: int,
    ) -> str:
        """Assemble sections into a final prompt."""
        sorted_sections = sorted(sections, key=lambda s: s.priority, reverse=True)

        total_tokens = 0
        assembled_parts = []

        for section in sorted_sections:
            content = section.content
            section_tokens = self._estimate_tokens(content)

            if section.max_tokens is not None:
                if section_tokens > section.max_tokens:
                    content = self._truncate(content, section.max_tokens)
                    section_tokens = section.max_tokens

            if total_tokens + section_tokens <= max_tokens:
                assembled_parts.append(f"## {section.name}\n{content}\n")
                total_tokens += section_tokens
            else:
                remaining = max_tokens - total_tokens
                if remaining > 100:
                    truncated = self._truncate(content, remaining)
                    assembled_parts.append(f"## {section.name}\n{truncated}\n")
                    break

        return "\n".join(assembled_parts)

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count from text."""
        words = len(text.split())
        return int(words * self.tokens_per_word)

    def _truncate(self, text: str, max_tokens: int) -> str:
        """Truncate text to fit within token limit."""
        max_words = int(max_tokens / self.tokens_per_word)
        words = text.split()
        if len(words) <= max_words:
            return text
        return " ".join(words[:max_words]) + "..."
