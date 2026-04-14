"""Episode manager for conversation ingestion."""

import logging
from datetime import datetime
from typing import Optional, List
from uuid import uuid4

from .models import Episode, EpisodeType

logger = logging.getLogger(__name__)


class EpisodeManager:
    """Manages episode creation and ingestion into the knowledge graph."""

    def __init__(self, graphiti_client):
        self.client = graphiti_client

    async def add_conversation(
        self,
        content: str,
        session_id: Optional[str] = None,
        source: str = "user conversation",
        reference_time: Optional[datetime] = None,
    ) -> Episode:
        """Add a conversation episode."""
        if reference_time is None:
            reference_time = datetime.utcnow()

        name = f"conv-{session_id or uuid4().hex[:8]}"
        episode = await self.client.add_episode(
            name=name,
            episode_body=content,
            source_description=source,
            reference_time=reference_time,
            group_id=session_id,
        )

        logger.info(f"Added conversation episode: {episode.uuid}")
        return episode

    async def add_code_change(
        self,
        file_path: str,
        change_description: str,
        session_id: Optional[str] = None,
        reference_time: Optional[datetime] = None,
    ) -> Episode:
        """Add a code change episode."""
        if reference_time is None:
            reference_time = datetime.utcnow()

        content = f"File: {file_path}\nChange: {change_description}"
        name = f"code-{session_id or uuid4().hex[:8]}"

        episode = await self.client.add_episode(
            name=name,
            episode_body=content,
            source_description="code change",
            reference_time=reference_time,
            group_id=session_id,
        )

        logger.info(f"Added code change episode: {episode.uuid}")
        return episode

    async def add_decision(
        self,
        decision: str,
        reason: str,
        outcome: Optional[str] = None,
        session_id: Optional[str] = None,
        reference_time: Optional[datetime] = None,
    ) -> Episode:
        """Add a decision episode."""
        if reference_time is None:
            reference_time = datetime.utcnow()

        content = f"Decision: {decision}\nReason: {reason}"
        if outcome:
            content += f"\nOutcome: {outcome}"

        name = f"decision-{session_id or uuid4().hex[:8]}"

        episode = await self.client.add_episode(
            name=name,
            episode_body=content,
            source_description="decision",
            reference_time=reference_time,
            group_id=session_id,
        )

        logger.info(f"Added decision episode: {episode.uuid}")
        return episode

    async def add_learning(
        self,
        topic: str,
        content: str,
        session_id: Optional[str] = None,
        reference_time: Optional[datetime] = None,
    ) -> Episode:
        """Add a learning episode."""
        if reference_time is None:
            reference_time = datetime.utcnow()

        full_content = f"Topic: {topic}\n{content}"
        name = f"learning-{session_id or uuid4().hex[:8]}"

        episode = await self.client.add_episode(
            name=name,
            episode_body=full_content,
            source_description="learning",
            reference_time=reference_time,
            group_id=session_id,
        )

        logger.info(f"Added learning episode: {episode.uuid}")
        return episode

    async def get_episode_history(
        self,
        session_id: str,
        limit: int = 50,
    ) -> List[Episode]:
        """Get episode history for a session."""
        return await self.client.get_episodes(group_id=session_id, limit=limit)

    async def summarize_session(self, session_id: str) -> str:
        """Generate a summary of the session episodes."""
        episodes = await self.get_episode_history(session_id)

        if not episodes:
            return "No episodes in this session."

        summary_parts = []
        for ep in episodes:
            summary_parts.append(f"- [{ep.episode_type.value}] {ep.content[:100]}...")

        return "\n".join(summary_parts)
