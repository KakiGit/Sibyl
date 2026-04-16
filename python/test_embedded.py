#!/usr/bin/env python3
"""Simple IPC test that runs the server in the same process."""

import asyncio
import json
import socket
import time
import sys
import os

sys.path.insert(0, "/home/kaki/Github/Sibyl/python")

from sibyl_memory import MemorySystem
from sibyl_memory.llm.config import LLMConfig
from sibyl_memory.graphiti_client import GraphitiClient
from sibyl_prompt import TemplatePromptBuilder
from sibyl_ipc_server import IpcServer, MemoryHandler, PromptHandler


async def run_server_and_tests():
    print("=" * 60)
    print("SIBYL HEADLESS TEST (Embedded Server)")
    print("=" * 60)

    # Initialize
    print("\n[1/6] Initializing memory system...")
    start = time.time()
    llm_config = LLMConfig(
        base_url="http://127.0.0.1:11434",
        model="qwen2.5:0.5b",
        timeout=60,
    )
    client = GraphitiClient(llm_config=llm_config)
    memory = MemorySystem(client=client)
    await memory.initialize()
    print(f"  Init time: {time.time() - start:.3f}s")

    prompt_builder = TemplatePromptBuilder()

    # Test memory add_episode
    print("\n[2/6] Testing memory.add_episode...")
    start = time.time()
    episode = await memory.add_episode(
        name="test_conversation",
        content="User asked about implementing a REST API. Assistant suggested using FastAPI with async endpoints.",
        source_description="headless test",
        session_id="test_session_1",
    )
    elapsed = time.time() - start
    print(f"  Add episode: {elapsed:.3f}s")
    print(f"  Episode ID: {episode.uuid}")

    # Test memory query
    print("\n[3/6] Testing memory.query...")
    start = time.time()
    result = await memory.query(
        "REST API implementation", num_results=5, session_id="test_session_1"
    )
    elapsed = time.time() - start
    print(f"  Query time: {elapsed:.3f}s")
    print(f"  Episodes: {len(result.episodes)}")
    print(f"  Entities: {len(result.entities)}")
    print(f"  Facts: {len(result.facts)}")

    # Test get_context
    print("\n[4/6] Testing memory.get_context...")
    start = time.time()
    context = await memory.get_context(
        "How to implement REST API?", max_tokens=1000, session_id="test_session_1"
    )
    elapsed = time.time() - start
    print(f"  Get context: {elapsed:.3f}s")
    print(f"  Context length: {len(context)} chars")

    # Test prompt build
    print("\n[5/6] Testing prompt.build...")
    start = time.time()
    from sibyl_prompt import PromptContext

    prompt_context = PromptContext(
        project_path="/home/kaki/Github/Sibyl",
        conversation_history=[
            {"role": "user", "content": "How do I implement a REST API?"}
        ],
        relevant_memories=[],
        current_file=None,
        active_skills=[],
    )
    prompt = await prompt_builder.build_system_prompt(
        context=prompt_context,
        memories={},
        tools=["bash", "read", "write"],
        user_query="How do I implement a REST API?",
        harness_name="opencode",
        max_tokens=4000,
    )
    elapsed = time.time() - start
    print(f"  Build time: {elapsed:.3f}s")
    print(f"  Prompt length: {len(prompt)} chars")

    # Test relevance evaluation
    print("\n[6/6] Testing relevance.evaluate...")
    try:
        from sibyl_relevance import CachedRelevanceEvaluator

        if client._llm_client:
            evaluator = CachedRelevanceEvaluator(
                llm_client=client._llm_client, cache_ttl=300
            )
            facts = [
                {"uuid": "1", "fact": "User prefers Python for backend development"},
                {"uuid": "2", "fact": "Project uses FastAPI framework"},
                {"uuid": "3", "fact": "User asked about REST API implementation"},
            ]
            start = time.time()
            results = await evaluator.evaluate_batch(
                "How to implement REST endpoints?", facts, threshold=0.5
            )
            elapsed = time.time() - start
            print(f"  Evaluate time: {elapsed:.3f}s")
            print(f"  Relevant facts: {len(results)}")
            for fact, score in results[:3]:
                print(f"    - {fact.get('fact', 'N/A')[:50]}... (score: {score:.2f})")
        else:
            print("  Skipped: No LLM client")
    except Exception as e:
        print(f"  Error: {e}")

    # Shutdown
    print("\n[Cleanup] Shutting down...")
    await memory.shutdown()
    print("Done!")

    # Test OpenCode REST API
    print("\n" + "=" * 60)
    print("OPENCODE REST API TESTS")
    print("=" * 60)

    try:
        import aiohttp

        print("\n[1/3] Testing OpenCode session create...")
        start = time.time()
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://127.0.0.1:4096/sessions",
                json={"name": "test_session"},
            ) as resp:
                data = await resp.json()
        elapsed = time.time() - start
        print(f"  Create session: {elapsed:.3f}s")
        session_id = data.get("id", "")
        print(f"  Session ID: {session_id}")

        print("\n[2/3] Testing OpenCode send message...")
        start = time.time()
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"http://127.0.0.1:4096/sessions/{session_id}/messages",
                json={"role": "user", "content": "Say 'hello' in one word."},
            ) as resp:
                data = await resp.json()
        elapsed = time.time() - start
        print(f"  Send message: {elapsed:.3f}s")
        print(f"  Response: {str(data)[:200]}")

        print("\n[3/3] Testing OpenCode list sessions...")
        start = time.time()
        async with aiohttp.ClientSession() as session:
            async with session.get("http://127.0.0.1:4096/sessions") as resp:
                data = await resp.json()
        elapsed = time.time() - start
        print(f"  List sessions: {elapsed:.3f}s")
        print(f"  Sessions count: {len(data)}")

    except Exception as e:
        print(f"  OpenCode error: {e}")

    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_server_and_tests())
