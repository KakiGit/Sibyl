import logging
from typing import Any, Dict, Optional

from ..models import Episode, Entity, Fact

logger = logging.getLogger(__name__)


class MemoryHandlers:
    """IPC handlers for memory system."""

    def __init__(self, memory_system, context_builder=None, relevance_filter=None):
        self.memory_system = memory_system
        self.context_builder = context_builder
        self.relevance_filter = relevance_filter
        self._handlers = {
            "memory.query": self.handle_query,
            "memory.add_episode": self.handle_add_episode,
            "memory.get_context": self.handle_get_context,
            "memory.get_entities": self.handle_get_entities,
            "memory.invalidate_fact": self.handle_invalidate_fact,
            "memory.clear_session": self.handle_clear_session,
        }

    def get_handler(self, method: str):
        return self._handlers.get(method)

    async def handle_query(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Search relevant memories."""
        query = params.get("query", "")
        session_id = params.get("session_id")
        limit = params.get("limit", 10)

        result = await self.memory_system.query(
            query=query,
            num_results=limit,
            session_id=session_id,
        )

        return {
            "facts": [self._format_fact(f) for f in result.facts],
            "entities": [self._format_entity(e) for e in result.entities],
            "episodes": [self._format_episode(e) for e in result.episodes],
        }

    async def handle_add_episode(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Ingest conversation as episode."""
        content = params.get("content", "")
        session_id = params.get("session_id")
        source = params.get("source", "user conversation")
        name = params.get("name", f"episode-{session_id}")

        episode = await self.memory_system.add_episode(
            name=name,
            content=content,
            source_description=source,
            session_id=session_id,
        )

        return {"episode_id": episode.uuid}

    async def handle_get_context(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get assembled context string."""
        session_id = params.get("session_id")
        max_tokens = params.get("max_tokens", 2000)

        if self.context_builder:
            context = await self.context_builder.build(
                session_id=session_id,
                max_tokens=max_tokens,
            )
        else:
            context = await self.memory_system.get_context(
                query="",
                max_tokens=max_tokens,
            )

        return {"context_str": context}

    async def handle_get_entities(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """List known entities."""
        entity_type = params.get("entity_type")
        limit = params.get("limit", 50)

        entities = await self.memory_system.get_entities(
            entity_type=entity_type,
            limit=limit,
        )

        return {"entities": [self._format_entity(e) for e in entities]}

    async def handle_invalidate_fact(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Mark fact as superseded."""
        fact_id = params.get("fact_id")
        reason = params.get("reason")

        success = await self.memory_system.invalidate_fact(
            fact_id=fact_id,
            reason=reason,
        )

        return {"success": success}

    async def handle_clear_session(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Clear session memories."""
        session_id = params.get("session_id")

        success = await self.memory_system.clear_session(session_id)

        return {"success": success}

    def _format_fact(self, fact: Fact) -> Dict[str, Any]:
        return {
            "uuid": fact.uuid,
            "content": fact.fact,
            "source_node": fact.source_node_uuid,
            "target_node": fact.target_node_uuid,
            "valid_at": fact.valid_at.isoformat() if fact.valid_at else None,
            "invalid_at": fact.invalid_at.isoformat() if fact.invalid_at else None,
            "score": getattr(fact, "score", 1.0),
        }

    def _format_entity(self, entity: Entity) -> Dict[str, Any]:
        return {
            "name": entity.name,
            "summary": entity.summary,
            "type": entity.entity_type.value,
        }

    def _format_episode(self, episode: Episode) -> Dict[str, Any]:
        return {
            "uuid": episode.uuid,
            "content": episode.content,
            "source": episode.source_description,
        }
