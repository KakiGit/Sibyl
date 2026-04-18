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

    ALL_EPISODES_SET = "all:episodes:set"
    SESSION_SET_PREFIX = "session:"
    SESSION_SET_SUFFIX = ":episodes:set"

    def __init__(self, redis_client):
        self.redis = redis_client
        self._embedder = None
        self._embedding_cache: dict = {}
        self._embedder_loaded = False

    def set_embedder(self, embedder):
        self._embedder = embedder

    async def _ensure_embedder(self):
        if self._embedder and not self._embedder_loaded:
            _ = self._embedder.model
            self._embedder_loaded = True

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

        await self._ensure_embedder()
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
            session_set_key = f"{self.SESSION_SET_PREFIX}{session_id}{self.SESSION_SET_SUFFIX}"
            await self.redis.sadd(session_set_key, episode_id)

        await self.redis.sadd(self.ALL_EPISODES_SET, episode_id)

        logger.info(f"Stored episode: {episode_id}")
        return episode_id

    async def add_episode_with_embedding(
        self,
        content: str,
        source: str = "conversation",
        session_id: Optional[str] = None,
        embedding: Optional[List[float]] = None,
        reference_time: Optional[datetime] = None,
    ) -> str:
        """Store an episode with pre-computed embedding (faster for batch operations)."""
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

        if embedding:
            embedding_key = f"embedding:{episode_id}"
            await self.redis.set(embedding_key, json.dumps(embedding))
            self._embedding_cache[episode_id] = embedding

        if session_id:
            session_set_key = f"{self.SESSION_SET_PREFIX}{session_id}{self.SESSION_SET_SUFFIX}"
            await self.redis.sadd(session_set_key, episode_id)

        await self.redis.sadd(self.ALL_EPISODES_SET, episode_id)

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
            await self._ensure_embedder()
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
            session_set_key = f"{self.SESSION_SET_PREFIX}{session_id}{self.SESSION_SET_SUFFIX}"
            try:
                ids = await self.redis.smembers(session_set_key)
                episode_ids = [i.decode() if isinstance(i, bytes) else i for i in ids]
            except Exception:
                pass

        if len(episode_ids) < 50:
            try:
                all_ids = await self.redis.smembers(self.ALL_EPISODES_SET)
                episode_ids.extend(
                    [i.decode() if isinstance(i, bytes) else i for i in all_ids]
                )
                episode_ids = list(set(episode_ids))
            except Exception:
                async for key in self.redis.scan_iter(match="episode:*"):
                    key_str = key.decode() if isinstance(key, bytes) else key
                    ep_id = key_str.split(":")[1]
                    episode_ids.append(ep_id)

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
            session_set_key = f"{self.SESSION_SET_PREFIX}{session_id}{self.SESSION_SET_SUFFIX}"
            try:
                episode_ids = await self.redis.smembers(session_set_key)
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
                count = 0
                async for key in self.redis.scan_iter(match="episode:*"):
                    if count >= 100:
                        break
                    key_str = key.decode() if isinstance(key, bytes) else key
                    data = await self.redis.get(key_str)
                    if data:
                        episode = json.loads(
                            data.decode() if isinstance(data, bytes) else data
                        )
                        if query.lower() in episode.get("content", "").lower():
                            if episode not in results:
                                results.append(episode)
                    count += 1
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
        session_set_key = f"{self.SESSION_SET_PREFIX}{session_id}{self.SESSION_SET_SUFFIX}"

        try:
            episode_ids = await self.redis.smembers(session_set_key)
            episode_list = [i.decode() if isinstance(i, bytes) else i for i in list(episode_ids)[:limit]]
            
            keys = [f"episode:{ep_id}" for ep_id in episode_list]
            values = await self.redis.mget(keys)
            
            for data in values:
                if data:
                    results.append(
                        json.loads(data.decode() if isinstance(data, bytes) else data)
                    )
        except Exception as e:
            logger.warning(f"Get session episodes failed: {e}")

        return results

    async def clear_session(self, session_id: str) -> bool:
        """Clear all episodes for a session."""
        session_set_key = f"{self.SESSION_SET_PREFIX}{session_id}{self.SESSION_SET_SUFFIX}"

        try:
            episode_ids = await self.redis.smembers(session_set_key)
            episode_list = [i.decode() if isinstance(i, bytes) else i for i in episode_ids]
            
            async with self.redis.pipeline() as pipe:
                for ep_id in episode_list:
                    pipe.delete(f"episode:{ep_id}")
                    pipe.delete(f"embedding:{ep_id}")
                    pipe.srem(self.ALL_EPISODES_SET, ep_id)
                pipe.delete(session_set_key)
                await pipe.execute()
            
            logger.info(f"Cleared session: {session_id}")
            return True
        except Exception as e:
            logger.warning(f"Clear session failed: {e}")
            return False

    async def modify_episode(
        self,
        episode_id: str,
        content: Optional[str] = None,
        source: Optional[str] = None,
    ) -> Optional[dict]:
        """Modify an existing episode."""
        key = f"episode:{episode_id}"
        try:
            data = await self.redis.get(key)
            if not data:
                logger.warning(f"Episode not found: {episode_id}")
                return None

            episode = json.loads(data.decode() if isinstance(data, bytes) else data)
            
            if content is not None:
                episode["content"] = content
                episode["modified_at"] = datetime.utcnow().isoformat()
                
                if self._embedder:
                    await self._ensure_embedder()
                    embeddings = await self._embedder.embed([content])
                    embedding_key = f"embedding:{episode_id}"
                    await self.redis.set(embedding_key, json.dumps(embeddings[0]))
                    self._embedding_cache[episode_id] = embeddings[0]

            if source is not None:
                episode["source"] = source

            await self.redis.set(key, json.dumps(episode))
            logger.info(f"Modified episode: {episode_id}")
            return episode
        except Exception as e:
            logger.warning(f"Modify episode failed: {e}")
            return None

    async def delete_episode(self, episode_id: str) -> bool:
        """Delete an episode with pipelined Redis operations."""
        try:
            episode_key = f"episode:{episode_id}"
            embedding_key = f"embedding:{episode_id}"
            
            data = await self.redis.get(episode_key)
            if not data:
                logger.warning(f"Episode not found for deletion: {episode_id}")
                return False

            episode = json.loads(data.decode() if isinstance(data, bytes) else data)
            session_id = episode.get("session_id")
            
            async with self.redis.pipeline() as pipe:
                pipe.delete(episode_key)
                pipe.delete(embedding_key)
                
                if session_id:
                    session_set_key = f"{self.SESSION_SET_PREFIX}{session_id}{self.SESSION_SET_SUFFIX}"
                    pipe.srem(session_set_key, episode_id)
                
                pipe.srem(self.ALL_EPISODES_SET, episode_id)
                await pipe.execute()
            
            if episode_id in self._embedding_cache:
                del self._embedding_cache[episode_id]
            
            logger.info(f"Deleted episode: {episode_id}")
            return True
        except Exception as e:
            logger.warning(f"Delete episode failed: {e}")
            return False

    async def list_episodes(
        self,
        session_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[dict]:
        """List episodes, optionally filtered by session."""
        results = []
        
        try:
            if session_id:
                session_set_key = f"{self.SESSION_SET_PREFIX}{session_id}{self.SESSION_SET_SUFFIX}"
                episode_ids = await self.redis.smembers(session_set_key)
                episode_list = [i.decode() if isinstance(i, bytes) else i for i in list(episode_ids)[:limit]]
            else:
                episode_ids = await self.redis.smembers(self.ALL_EPISODES_SET)
                episode_list = [i.decode() if isinstance(i, bytes) else i for i in list(episode_ids)[-limit:]]
            
            if not episode_list:
                return results
            
            keys = [f"episode:{ep_id}" for ep_id in episode_list]
            values = await self.redis.mget(keys)
            
            for data in values:
                if data:
                    episode = json.loads(
                        data.decode() if isinstance(data, bytes) else data
                    )
                    results.append(episode)
        except Exception as e:
            logger.warning(f"List episodes failed: {e}")
        
        return results

    async def get_episode(self, episode_id: str) -> Optional[dict]:
        """Get a single episode by ID."""
        key = f"episode:{episode_id}"
        try:
            data = await self.redis.get(key)
            if data:
                return json.loads(
                    data.decode() if isinstance(data, bytes) else data
                )
        except Exception as e:
            logger.warning(f"Get episode failed: {e}")
        return None
