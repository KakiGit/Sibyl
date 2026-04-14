"""Template-based prompt builder using Jinja2."""

from pathlib import Path
from typing import Any, Dict, List, Optional
import logging

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .models import PromptContext
from .environment import get_environment_info, get_project_info
from .tokenizer import estimate_tokens, truncate_to_tokens
from .relevance import RelevanceEvaluator

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"


class TemplatePromptBuilder:
    """Builds prompts using Jinja2 templates from spec."""

    def __init__(self, templates_dir: Optional[Path] = None):
        templates_dir = templates_dir or TEMPLATES_DIR
        self.env = Environment(
            loader=FileSystemLoader(templates_dir),
            autoescape=select_autoescape(enabled_extensions=("html",)),
        )
        self.relevance_evaluator = RelevanceEvaluator()

    async def build_system_prompt(
        self,
        context: PromptContext,
        memories: Optional[Dict[str, List[Any]]] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        user_query: str = "",
        harness_name: str = "opencode",
        max_tokens: int = 8000,
    ) -> str:
        """Build full system prompt from template."""
        env_info = get_environment_info()
        project_info = (
            get_project_info(Path(context.project_path))
            if context.project_path
            else None
        )

        template_context = {
            "memories": memories or {},
            "harness_name": harness_name,
            "tools": tools or [],
            "platform": env_info.get("platform", "unknown"),
            "working_directory": env_info.get("working_directory", ""),
            "date": env_info.get("date", ""),
            "home": env_info.get("home", ""),
            "shell": env_info.get("shell", ""),
            "project_info": project_info,
            "user_query": user_query,
        }

        template = self.env.get_template("system.jinja2")
        prompt = template.render(**template_context)

        if estimate_tokens(prompt) > max_tokens:
            prompt = truncate_to_tokens(prompt, max_tokens)

        return prompt

    def build_memory_context(
        self,
        entities: Optional[List[Any]] = None,
        facts: Optional[List[Any]] = None,
        episodes: Optional[List[Any]] = None,
        max_tokens: int = 2000,
    ) -> str:
        """Build memory context section."""
        template = self.env.get_template("memory.jinja2")
        context = template.render(
            entities=entities or [],
            facts=facts or [],
            episodes=episodes or [],
        )

        if estimate_tokens(context) > max_tokens:
            context = truncate_to_tokens(context, max_tokens)

        return context

    def build_tools_section(
        self,
        tools: List[Dict[str, Any]],
        max_tokens: int = 1000,
    ) -> str:
        """Build tools description section."""
        template = self.env.get_template("tools.jinja2")
        section = template.render(tools=tools)

        if estimate_tokens(section) > max_tokens:
            section = truncate_to_tokens(section, max_tokens)

        return section

    async def build(
        self,
        context: PromptContext,
        max_tokens: int = 8000,
    ) -> str:
        """Build prompt from PromptContext (compatibility method)."""
        memories_dict = {}
        if context.relevant_memories:
            memories_dict["relevant"] = [
                {"content": m} for m in context.relevant_memories
            ]

        return await self.build_system_prompt(
            context=context,
            memories=memories_dict,
            user_query="",
            max_tokens=max_tokens,
        )
