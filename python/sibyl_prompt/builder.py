from typing import List, Dict, Any, Optional
import logging

from .models import PromptContext, PromptTemplate, PromptSection
from .relevance import RelevanceEvaluator
from .assembler import PromptAssembler

logger = logging.getLogger(__name__)


class PromptBuilder:
    """Builds system prompts with memory injection."""

    def __init__(self):
        self.evaluator = RelevanceEvaluator()
        self.assembler = PromptAssembler()

    async def build(
        self,
        context: PromptContext,
        template: Optional[PromptTemplate] = None,
        max_tokens: int = 8000,
    ) -> str:
        """Build a prompt from context and relevant memories."""
        if template is None:
            template = self._default_template()

        sections = []

        system_section = PromptSection(
            name="system",
            content=self._build_system_section(context),
            priority=100,
        )
        sections.append(system_section)

        if context.relevant_memories:
            memory_section = PromptSection(
                name="memories",
                content=self._build_memory_section(context.relevant_memories),
                priority=50,
                max_tokens=2000,
            )
            sections.append(memory_section)

        if context.conversation_history:
            history_section = PromptSection(
                name="history",
                content=self._build_history_section(context.conversation_history),
                priority=75,
            )
            sections.append(history_section)

        if context.current_file:
            file_section = PromptSection(
                name="current_file",
                content=f"Current file: {context.current_file}",
                priority=90,
            )
            sections.append(file_section)

        if context.active_skills:
            skills_section = PromptSection(
                name="skills",
                content=self._build_skills_section(context.active_skills),
                priority=80,
            )
            sections.append(skills_section)

        return self.assembler.assemble(sections, max_tokens)

    def _default_template(self) -> PromptTemplate:
        return PromptTemplate(
            name="default",
            sections=[],
        )

    def _build_system_section(self, context: PromptContext) -> str:
        return f"""You are Sibyl, an AI coding assistant with persistent memory.
You are working in the project at: {context.project_path}
You have access to relevant memories from past conversations.
Use these memories to provide contextually aware assistance."""

    def _build_memory_section(self, memories: List[str]) -> str:
        return "Relevant memories:\n" + "\n".join(f"- {m}" for m in memories)

    def _build_history_section(self, history: List[Dict[str, str]]) -> str:
        parts = []
        for msg in history[-10:]:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            parts.append(f"{role}: {content}")
        return "Recent conversation:\n" + "\n".join(parts)

    def _build_skills_section(self, skills: List[str]) -> str:
        return f"Active skills: {', '.join(skills)}"
