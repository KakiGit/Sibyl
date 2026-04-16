"""Simple memory storage without complex entity extraction."""

import logging
from datetime import datetime
from typing import Optional, List, Any
from uuid import uuid4
import json
import math

logger = logging.getLogger(__name__)


class SimpleMemoryStore:
    """Simple memory store using FalkorDB/Redis directly without LLM extraction."""

    def __init__(self, redis_client):
        self.redis = redis_client
        self._embedder = None
        self._embedding_cache: dict = {}

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

        if self._embedder:
            embeddings = await self._embedder.embed([content])
            embedding_key = f"embedding:{episode_id}"
            await self.redis.set(embedding_key, json.dumps(embeddings[0]))
            self._embedding_cache[episode_id] = embeddings[0]

        if session_id:
            session_key = f"session:{session_id}:episodes"
            await self.redis.rpush(session_key, episode_id)

        all_episodes_key = "all:episodes"
        await self.redis.rpush(all_episodes_key, episode_id)

        logger.info(f"Stored episode: {episode_id}")
        return episode_id

    async def search(
        self,
        query: str,
        num_results: int = 10,
        session_id: Optional[str] = None,
        use_embedding: bool = True,
    ) -> List[dict]:
        """Search episodes by content matching or embedding similarity."""
        results = []

        if use_embedding and self._embedder:
            query_embeddings = await self._embedder.embed([query])
            query_embedding = query_embeddings[0]
            scored_episodes = await self._embedding_search(query_embedding, session_id)
            results = [ep for ep, score in scored_episodes[:num_results]]
        else:
            results = await self._keyword_search(query, num_results, session_id)

        return results[:num_results]

    async def _embedding_search(
        self,
        query_embedding: List[float],
        session_id: Optional[str] = None,
    ) -> List[tuple]:
        """Search using embedding cosine similarity with batch retrieval."""
        scored = []

        episode_ids = []
        if session_id:
            session_key = f"session:{session_id}:episodes"
            try:
                ids = await self.redis.lrange(session_key, 0, -1)
                episode_ids = [i.decode() if isinstance(i, bytes) else i for i in ids]
            except Exception:
                pass

        if not session_id and len(episode_ids) < 50:
            try:
                all_ids = await self.redis.lrange("all:episodes", 0, 100)
                episode_ids.extend(
                    [i.decode() if isinstance(i, bytes) else i for i in all_ids]
                )
                episode_ids = list(set(episode_ids))
            except Exception:
                keys = await self.redis.keys("episode:*")
                episode_ids = [
                    k.decode().split(":")[1]
                    if isinstance(k, bytes)
                    else k.split(":")[1]
                    for k in keys
                ]

        if not episode_ids:
            return scored

        embedding_keys = [f"embedding:{ep_id}" for ep_id in episode_ids]
        episode_keys = [f"episode:{ep_id}" for ep_id in episode_ids]

        embedding_values = await self.redis.mget(embedding_keys)
        episode_values = await self.redis.mget(episode_keys)

        for i, (emb_data, ep_data) in enumerate(zip(embedding_values, episode_values)):
            if emb_data and ep_data:
                embedding = json.loads(
                    emb_data.decode() if isinstance(emb_data, bytes) else emb_data
                )
                episode = json.loads(
                    ep_data.decode() if isinstance(ep_data, bytes) else ep_data
                )
                similarity = self._cosine_similarity(query_embedding, embedding)
                scored.append((episode, similarity))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    async def _keyword_search(
        self,
        query: str,
        num_results: int,
        session_id: Optional[str] = None,
    ) -> List[dict]:
        """Fallback keyword-based search."""
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

        return results

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
                await self.redis.delete(f"embedding:{ep_id}")
            await self.redis.delete(session_key)
            logger.info(f"Cleared session: {session_id}")
            return True
        except Exception as e:
            logger.warning(f"Clear session failed: {e}")
            return False
