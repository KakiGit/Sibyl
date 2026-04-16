#!/usr/bin/env python3
"""Run the optimized IPC server and headless test together."""

import asyncio
import sys
import time

sys.path.insert(0, "/home/kaki/Github/Sibyl/python")


async def main():
    print("=" * 60)
    print("SIBYL OPTIMIZED TEST SUITE")
    print("=" * 60)

    metrics = {}

    import redis.asyncio as redis
    from sibyl_memory.simple_store import SimpleMemoryStore
    from sibyl_memory.embedder.local import LocalEmbedder, EmbedderConfig
    from sibyl_memory.llm.config import LLMConfig
    from sibyl_memory.llm.ollama import OllamaClient
    from sibyl_prompt import TemplatePromptBuilder, PromptContext
    from sibyl_relevance import CachedRelevanceEvaluator

    print("\n[1/6] Connecting to Redis...")
    start = time.time()
    r = redis.Redis(host="localhost", port=6379, decode_responses=False)
    await r.ping()
    metrics["redis_connect"] = time.time() - start
    print(f"  Connect: {metrics['redis_connect']:.3f}s")

    print("\n[2/6] Initializing embedder...")
    start = time.time()
    embedder_config = EmbedderConfig(model_name="all-MiniLM-L6-v2")
    embedder = LocalEmbedder(embedder_config)
    _ = embedder.model
    metrics["embedder_init"] = time.time() - start
    print(f"  Init: {metrics['embedder_init']:.3f}s")

    print("\n[3/6] Creating SimpleMemoryStore...")
    start = time.time()
    store = SimpleMemoryStore(r)
    store.set_embedder(embedder)
    metrics["store_init"] = time.time() - start
    print(f"  Init: {metrics['store_init']:.3f}s")

    print("\n[4/6] Testing add_episode (10 episodes)...")
    test_contents = [
        "User asked about implementing a REST API with FastAPI.",
        "User prefers Python for backend development.",
        "Project uses FalkorDB for graph storage.",
        "User wants to optimize performance for limited hardware.",
        "Embeddings use all-MiniLM-L6-v2 model.",
        "Redis is used for caching at localhost:6379.",
        "Ollama runs at 127.0.0.1:11434 with qwen2.5:0.5b.",
        "IPC server uses Unix sockets at /tmp/sibyl-ipc.sock.",
        "Prompt building includes tool definitions.",
        "Relevance evaluation uses cosine similarity.",
    ]
    start = time.time()
    episode_ids = []
    for content in test_contents:
        ep_id = await store.add_episode(
            content=content,
            source="test conversation",
            session_id="test_suite",
        )
        episode_ids.append(ep_id)
    elapsed = time.time() - start
    metrics["add_10_episodes"] = elapsed
    metrics["add_episode_avg"] = elapsed / len(test_contents)
    print(f"  Total: {elapsed:.3f}s ({metrics['add_episode_avg']:.3f}s avg)")

    print("\n[5/6] Testing search...")
    start = time.time()
    results = await store.search(
        "REST API implementation",
        num_results=5,
        session_id="test_suite",
    )
    metrics["search"] = time.time() - start
    print(f"  Search: {metrics['search']:.3f}s ({len(results)} results)")
    for r in results[:3]:
        print(f"    - {r.get('content', '')[:50]}...")

    print("\n[6/6] Testing relevance evaluation...")
    llm_config = LLMConfig(
        base_url="http://127.0.0.1:11434",
        model="qwen2.5:0.5b",
        timeout=30,
    )
    ollama_client = OllamaClient(llm_config)

    evaluator = CachedRelevanceEvaluator(
        embedder=embedder,
        llm_client=ollama_client,
        cache_ttl=300,
        threshold=0.25,
        use_llm=False,
    )

    facts = [
        {"uuid": "1", "fact": "User prefers Python for backend development"},
        {"uuid": "2", "fact": "Project uses FastAPI framework"},
        {"uuid": "3", "fact": "User asked about REST API implementation"},
        {"uuid": "4", "fact": "Database is PostgreSQL"},
        {"uuid": "5", "fact": "Testing framework is pytest"},
    ]

    start = time.time()
    results = await evaluator.evaluate_batch(
        "How to implement REST endpoints?", facts, threshold=0.25
    )
    metrics["relevance_eval"] = time.time() - start
    print(f"  Evaluate: {metrics['relevance_eval']:.3f}s ({len(results)} relevant)")
    for f, s in results[:3]:
        print(f"    - {f.get('fact', '')[:40]}... (score: {s:.3f})")

    print("\n[7/7] Testing prompt build...")
    prompt_builder = TemplatePromptBuilder()
    context = PromptContext(
        project_path="/home/kaki/Github/Sibyl",
        conversation_history=[
            {"role": "user", "content": "How do I implement a REST API?"}
        ],
        relevant_memories=[],
        current_file=None,
        active_skills=[],
    )

    start = time.time()
    prompt = await prompt_builder.build_system_prompt(
        context=context,
        memories={"facts": [{"fact": c} for c in test_contents[:3]]},
        tools=["bash", "read", "write", "edit", "glob", "grep"],
        user_query="How do I implement a REST API?",
        harness_name="opencode",
        max_tokens=4000,
    )
    metrics["prompt_build"] = time.time() - start
    print(f"  Build: {metrics['prompt_build']:.3f}s ({len(prompt)} chars)")

    print("\n[8/8] Testing OpenCode connection...")
    try:
        import aiohttp

        start = time.time()
        async with aiohttp.ClientSession() as session:
            async with session.get("http://127.0.0.1:4096/") as resp:
                status = resp.status
        metrics["opencode_connect"] = time.time() - start
        print(f"  Connection: {metrics['opencode_connect']:.3f}s (status: {status})")
    except Exception as e:
        print(f"  OpenCode error: {e}")
        metrics["opencode_error"] = str(e)

    print("\n[Cleanup] Closing Redis...")
    try:
        await r.aclose()
    except Exception:
        pass

    print("\n" + "=" * 60)
    print("PERFORMANCE SUMMARY")
    print("=" * 60)
    total = 0
    for name, value in metrics.items():
        if isinstance(value, float):
            print(f"  {name}: {value:.3f}s")
            total += value
        else:
            print(f"  {name}: {value}")
    print(f"  TOTAL: {total:.3f}s")
    print("=" * 60)

    return metrics


if __name__ == "__main__":
    asyncio.run(main())
