from typing import Any, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class MemoryHandler:
    """Handler for memory-related IPC methods."""

    def __init__(self, memory_system):
        self.memory_system = memory_system

    async def handle_query(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory.query method."""
        query = params.get("query", "")
        num_results = params.get("num_results", 10)

        result = await self.memory_system.query(query, num_results)

        return {
            "episodes": [e.model_dump() for e in result.episodes],
            "entities": [e.model_dump() for e in result.entities],
            "facts": [f.model_dump() for f in result.facts],
            "relevance_scores": result.relevance_scores,
        }

    async def handle_add_episode(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory.add_episode method."""
        name = params.get("name", "")
        content = params.get("content", "")
        source_description = params.get("source_description", "user conversation")

        episode = await self.memory_system.add_episode(
            name=name,
            content=content,
            source_description=source_description,
        )

        return {"status": "ok", "episode_id": episode.uuid}

    async def handle_get_context(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory.get_context method."""
        query = params.get("query", "")
        max_tokens = params.get("max_tokens", 4000)

        context = await self.memory_system.get_context(query, max_tokens)

        return {"context": context}


class PromptHandler:
    """Handler for prompt-related IPC methods."""

    def __init__(self, prompt_builder):
        self.prompt_builder = prompt_builder

    async def handle_build(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle prompt.build method."""
        from sibyl_prompt import PromptContext

        context = PromptContext(
            project_path=params.get("project_path", ""),
            conversation_history=params.get("conversation_history", []),
            relevant_memories=params.get("relevant_memories", []),
            current_file=params.get("current_file"),
            active_skills=params.get("active_skills", []),
        )

        max_tokens = params.get("max_tokens", 8000)
        prompt = await self.prompt_builder.build(context, max_tokens=max_tokens)

        return {"prompt": prompt}

    async def handle_relevance_evaluate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle relevance.evaluate method."""
        from sibyl_prompt import RelevanceEvaluator

        query = params.get("query", "")
        memories = params.get("memories", [])
        threshold = params.get("threshold", 0.3)

        evaluator = RelevanceEvaluator()
        results = evaluator.evaluate(query, memories, threshold)

        return {"results": [{"memory": m, "score": s} for m, s in results]}
