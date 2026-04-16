#!/usr/bin/env python3
"""Optimized test using SimpleMemoryStore (no entity extraction)."""

import asyncio
import time
import sys
import json
from typing import Dict

sys.path.insert(0, "/home/kaki/Github/Sibyl/python")

import redis.asyncio as redis
from sibyl_memory.simple_store import SimpleMemoryStore
from sibyl_memory.embedder.local import LocalEmbedder, EmbedderConfig


async def run_optimized_test():
    print("=" * 60)
    print("SIBYL OPTIMIZED TEST (SimpleMemoryStore)")
    print("=" * 60)

    metrics: Dict[str, float] = {}

    print("\n[1/5] Connecting to Redis/FalkorDB...")
    start = time.time()
    r = redis.Redis(host="localhost", port=6379, decode_responses=False)
    await r.ping()
    print(f"  Redis connect: {time.time() - start:.3f}s")
    metrics["redis_connect"] = time.time() - start

    print("\n[2/5] Initializing embedder...")
    start = time.time()
    embedder_config = EmbedderConfig(model_name="all-MiniLM-L6-v2")
    embedder = LocalEmbedder(embedder_config)
    _ = embedder.model
    print(f"  Embedder init: {time.time() - start:.3f}s")
    metrics["embedder_init"] = time.time() - start

    print("\n[3/5] Creating SimpleMemoryStore...")
    start = time.time()
    store = SimpleMemoryStore(r)
    store.set_embedder(embedder)
    print(f"  Store init: {time.time() - start:.3f}s")
    metrics["store_init"] = time.time() - start

    print("\n[4/5] Testing add_episode...")
    test_content = [
        "User asked about implementing a REST API. Assistant suggested using FastAPI with async endpoints.",
        "User prefers Python for backend development over other languages.",
        "Project uses FalkorDB for graph storage and Redis for caching.",
        "User wants to optimize performance for limited hardware.",
    ]
    episode_ids = []
    add_times = []
    for i, content in enumerate(test_content):
        start = time.time()
        ep_id = await store.add_episode(
            content=content,
            source="test conversation",
            session_id="test_session_opt",
        )
        elapsed = time.time() - start
        add_times.append(elapsed)
        episode_ids.append(ep_id)
        print(f"  Episode {i + 1}: {elapsed:.3f}s (id: {ep_id})")
    metrics["add_episode_avg"] = sum(add_times) / len(add_times)

    print("\n[5/5] Testing search...")
    queries = ["REST API", "Python backend", "performance optimization"]
    search_times = []
    for query in queries:
        start = time.time()
        results = await store.search(
            query, num_results=3, session_id="test_session_opt"
        )
        elapsed = time.time() - start
        search_times.append(elapsed)
        print(f"  Query '{query}': {elapsed:.3f}s ({len(results)} results)")
        for r in results[:2]:
            print(f"    - {r.get('content', '')[:60]}...")
    metrics["search_avg"] = sum(search_times) / len(search_times)

    print("\n[6/6] Testing prompt build...")
    start = time.time()
    from sibyl_prompt import TemplatePromptBuilder, PromptContext

    prompt_builder = TemplatePromptBuilder()
    context = PromptContext(
        project_path="/home/kaki/Github/Sibyl",
        conversation_history=[
            {"role": "user", "content": "How do I implement a REST API?"}
        ],
        relevant_memories=test_content[:2],
        current_file=None,
        active_skills=[],
    )
    prompt = await prompt_builder.build_system_prompt(
        context=context,
        memories={"facts": [{"fact": c} for c in test_content[:2]]},
        tools=["bash", "read", "write"],
        user_query="How do I implement a REST API?",
        harness_name="opencode",
        max_tokens=4000,
    )
    elapsed = time.time() - start
    print(f"  Prompt build: {elapsed:.3f}s")
    print(f"  Prompt length: {len(prompt)} chars")
    metrics["prompt_build"] = elapsed

    print("\n[7/7] Testing relevance evaluation...")
    from sibyl_relevance import CachedRelevanceEvaluator
    from sibyl_memory.llm.config import LLMConfig
    from sibyl_memory.llm.ollama import OllamaClient

    llm_config = LLMConfig(
        base_url="http://127.0.0.1:11434",
        model="qwen2.5:0.5b",
        timeout=30,
    )
    ollama_client = OllamaClient(llm_config)

    facts = [
        {"uuid": "1", "fact": "User prefers Python for backend development"},
        {"uuid": "2", "fact": "Project uses FastAPI framework"},
        {"uuid": "3", "fact": "User asked about REST API implementation"},
        {"uuid": "4", "fact": "Database is PostgreSQL"},
    ]

    try:
        evaluator = CachedRelevanceEvaluator(cache_ttl=300)
        start = time.time()
        results = await evaluator.evaluate_batch(
            "How to implement REST endpoints?", facts, threshold=0.5
        )
        elapsed = time.time() - start
        print(f"  Relevance eval: {elapsed:.3f}s")
        print(f"  Relevant facts: {len(results)}")
        metrics["relevance_eval"] = elapsed
    except Exception as e:
        print(f"  Skipped relevance eval: {e}")
        metrics["relevance_eval"] = 0

    print("\n[Cleanup] Closing connections...")
    try:
        await r.aclose()
    except Exception:
        pass
    print("Done!")

    print("\n" + "=" * 60)
    print("PERFORMANCE SUMMARY")
    print("=" * 60)
    total = 0
    for name, value in metrics.items():
        print(f"  {name}: {value:.3f}s")
        total += value
    print(f"  TOTAL: {total:.3f}s")
    print("=" * 60)

    return metrics


if __name__ == "__main__":
    asyncio.run(run_optimized_test())
