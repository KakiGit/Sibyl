from typing import Any, Dict, Optional, List
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
        session_id = params.get("session_id")

        result = await self.memory_system.query(
            query, num_results, session_id=session_id
        )

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
        session_id = params.get("session_id")

        episode = await self.memory_system.add_episode(
            name=name,
            content=content,
            source_description=source_description,
            session_id=session_id,
        )

        return {"status": "ok", "episode_id": episode.uuid}

    async def handle_add_user_fact(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory.add_user_fact method."""
        fact = params.get("fact", "")
        session_id = params.get("session_id")

        if self.memory_system.episode_manager:
            episode = await self.memory_system.episode_manager.add_user_fact(
                fact=fact,
                session_id=session_id,
            )
        else:
            episode = await self.memory_system.add_episode(
                name="user-fact",
                content=fact,
                source_description="user fact",
                session_id=session_id,
            )

        return {"status": "ok", "episode_id": episode.uuid}

    async def handle_get_context(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle memory.get_context method."""
        query = params.get("query", "")
        max_tokens = params.get("max_tokens", 4000)
        session_id = params.get("session_id")

        context = await self.memory_system.get_context(
            query, max_tokens, session_id=session_id
        )

        return {"context": context}


class PromptHandler:
    """Handler for prompt-related IPC methods."""

    def __init__(self, prompt_builder, relevance_evaluator=None):
        self.prompt_builder = prompt_builder
        self.relevance_evaluator = relevance_evaluator

    async def handle_build(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle prompt.build method."""
        from sibyl_prompt import PromptContext, TemplatePromptBuilder

        context = PromptContext(
            project_path=params.get("project_path", ""),
            conversation_history=params.get("conversation_history", []),
            relevant_memories=params.get("relevant_memories", []),
            current_file=params.get("current_file"),
            active_skills=params.get("active_skills", []),
        )

        max_tokens = params.get("max_tokens", 8000)
        user_query = params.get("user_query", "")
        harness_name = params.get("harness_name", "opencode")
        tools = params.get("tools", [])

        if isinstance(self.prompt_builder, TemplatePromptBuilder):
            memories_dict = params.get("memories", {})
            prompt = await self.prompt_builder.build_system_prompt(
                context=context,
                memories=memories_dict,
                tools=tools,
                user_query=user_query,
                harness_name=harness_name,
                max_tokens=max_tokens,
            )
        else:
            prompt = await self.prompt_builder.build(context, max_tokens=max_tokens)

        return {"prompt": prompt}

    async def handle_relevance_evaluate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle relevance.evaluate method."""
        from sibyl_relevance import CachedRelevanceEvaluator

        query = params.get("query", "")
        facts = params.get("facts", [])
        threshold = params.get("threshold", 0.7)

        evaluator = self.relevance_evaluator or CachedRelevanceEvaluator()
        results = await evaluator.evaluate_batch(query, facts, threshold=threshold)

        return {
            "results": [{"fact": self._fact_to_dict(f), "score": s} for f, s in results]
        }

    def _fact_to_dict(self, fact) -> Dict[str, Any]:
        """Convert fact to dictionary."""
        if hasattr(fact, "model_dump"):
            return fact.model_dump()
        if hasattr(fact, "fact"):
            return {
                "uuid": getattr(fact, "uuid", ""),
                "fact": fact.fact,
                "source_node_uuid": getattr(fact, "source_node_uuid", ""),
                "target_node_uuid": getattr(fact, "target_node_uuid", ""),
            }
        return {"content": str(fact)}
