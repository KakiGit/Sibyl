"""Simple memory storage without complex entity extraction."""

import logging
from datetime import datetime
from typing import Optional, List, Any
from uuid import uuid4
import json

logger = logging.getLogger(__name__)


class SimpleMemoryStore:
    """Simple memory store using FalkorDB/Redis directly without LLM extraction."""

    def __init__(self, redis_client):
        self.redis = redis_client
        self._embedder = None

    def set_embedder(self, embedder):
        self._embedder = embedder

    async def add_episode(
        self,
        content: str,
        source: str = "conversation",
        session_id: Optional[str] = None,
        reference_time: Optional[datetime] = None,
    ) -> str:
        """Store an episode directly without entity extraction."""
        if reference_time is None:
            reference_time = datetime.utcnow()

        episode_id = str(uuid4())
        episode_data = {
            "uuid": episode_id,
            "content": content,
            "source": source,
            "session_id": session_id or "default",
            "created_at": reference_time.isoformat(),
        }

        key = f"episode:{episode_id}"
        serialized = json.dumps(episode_data)
        await self.redis.set(key, serialized)

        if session_id:
            session_key = f"session:{session_id}:episodes"
            await self.redis.rpush(session_key, episode_id)

        logger.info(f"Stored episode: {episode_id}")
        return episode_id

    async def search(
        self,
        query: str,
        num_results: int = 10,
        session_id: Optional[str] = None,
    ) -> List[dict]:
        """Search episodes by content matching."""
        results = []

        if session_id:
            session_key = f"session:{session_id}:episodes"
            try:
                episode_ids = await self.redis.lrange(session_key, 0, -1)
                for ep_id in episode_ids:
                    ep_id = ep_id.decode() if isinstance(ep_id, bytes) else ep_id
                    key = f"episode:{ep_id}"
                    data = await self.redis.get(key)
                    if data:
                        episode = json.loads(
                            data.decode() if isinstance(data, bytes) else data
                        )
                        if query.lower() in episode.get("content", "").lower():
                            results.append(episode)
            except Exception as e:
                logger.warning(f"Session search failed: {e}")

        if len(results) < num_results:
            try:
                keys = await self.redis.keys("episode:*")
                for key in keys[:100]:
                    key_str = key.decode() if isinstance(key, bytes) else key
                    data = await self.redis.get(key_str)
                    if data:
                        episode = json.loads(
                            data.decode() if isinstance(data, bytes) else data
                        )
                        if query.lower() in episode.get("content", "").lower():
                            if episode not in results:
                                results.append(episode)
            except Exception as e:
                logger.warning(f"Global search failed: {e}")

        return results[:num_results]

    async def get_session_episodes(
        self,
        session_id: str,
        limit: int = 50,
    ) -> List[dict]:
        """Get all episodes for a session."""
        results = []
        session_key = f"session:{session_id}:episodes"

        try:
            episode_ids = await self.redis.lrange(session_key, 0, limit)
            for ep_id in episode_ids:
                ep_id = ep_id.decode() if isinstance(ep_id, bytes) else ep_id
                key = f"episode:{ep_id}"
                data = await self.redis.get(key)
                if data:
                    results.append(
                        json.loads(data.decode() if isinstance(data, bytes) else data)
                    )
        except Exception as e:
            logger.warning(f"Get session episodes failed: {e}")

        return results

    async def clear_session(self, session_id: str) -> bool:
        """Clear all episodes for a session."""
        session_key = f"session:{session_id}:episodes"

        try:
            episode_ids = await self.redis.lrange(session_key, 0, -1)
            for ep_id in episode_ids:
                ep_id = ep_id.decode() if isinstance(ep_id, bytes) else ep_id
                await self.redis.delete(f"episode:{ep_id}")
            await self.redis.delete(session_key)
            logger.info(f"Cleared session: {session_id}")
            return True
        except Exception as e:
            logger.warning(f"Clear session failed: {e}")
            return False
