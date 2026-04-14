# Python Layer Specification

## Components

1. Memory Service (Graphiti + FalkorDB)
2. Prompt Builder (context assembly)
3. Relevance Evaluator (subagent)
4. IPC Server (JSON-RPC)

## Prompt Building

### System Prompt Template

Based on claw-code's prompt structure with Sibyl-specific additions:

```jinja2
# INTRO
You are Sibyl, an AI coding assistant with persistent memory.
You remember past conversations, decisions, and preferences.

# MEMORY CONTEXT
{% if memories %}
{% for category, facts in memories.items() %}
## {{ category }}
{% for fact in facts %}
- {{ fact.content }} {% if fact.valid_at %}(since {{ fact.valid_at }}){% endif %}
{% endfor %}
{% endfor %}
{% else %}
No relevant memories found for this query.
{% endif %}

# OUTPUT STYLE
Be concise and direct. Focus on code and concrete solutions.
Match the user's coding style preferences from memory.

# MEMORY USAGE
- Before making changes, check memory for past decisions
- After completing tasks, important information will be stored in memory
- If user mentions preferences, acknowledge and remember them

# TOOLS
Available tools from active harness ({{ harness_name }}):
{% for tool in tools %}
- {{ tool.name }}: {{ tool.description }}
{% endfor %}

# DOING TASKS
When asked to write code:
1. Read memory for coding style preferences
2. Understand existing code patterns in the project  
3. Write code matching those patterns
4. Ensure changes are minimal and focused

# ENVIRONMENT
Platform: {{ platform }}
Working directory: {{ working_directory }}
Date: {{ date }}

# PROJECT CONTEXT
{% if project_info %}
Git branch: {{ project_info.branch }}
Recent commits:
{% for commit in project_info.recent_commits %}
- {{ commit.message }}
{% endfor %}
{% endif %}

# CURRENT QUERY
User: {{ user_query }}
```

### Memory Injection Points

| Point | Purpose | Content |
|-------|---------|---------|
| System prompt header | User preferences, project facts | Preferences, decisions |
| Before tool calls | Related entity memories | Files, concepts being accessed |
| After response | Episode ingestion trigger | Conversation content |

## Subagent Relevance Evaluation

### Purpose (from DRAFT.md)

> Use subagent to evaluate if the memory is relevant to the conversation.
> Irrelevant memories will be removed from the context if the subagent evaluates so.

### Implementation

```python
class RelevanceEvaluator:
    """
    Uses a lightweight LLM to evaluate memory relevance.
    Prevents context pollution from irrelevant memories.
    """
    
    def __init__(self, llm_client: OllamaClient):
        self.llm = llm_client
        self.model = "llama3.2"  # Fast local model
        
    async def evaluate_batch(
        self, 
        query: str, 
        facts: list[Fact],
        threshold: float = 0.7
    ) -> list[Fact]:
        """
        Evaluate each fact for relevance to the query.
        Returns only facts above the relevance threshold.
        """
        relevant = []
        for fact in facts:
            score = await self._evaluate_single(query, fact)
            if score >= threshold:
                fact.relevance_score = score
                relevant.append(fact)
        return relevant
    
    async def _evaluate_single(self, query: str, fact: Fact) -> float:
        prompt = f"""
        Evaluate if this memory is relevant to the query.
        
        Query: "{query}"
        
        Memory:
        - Content: "{fact.content}"
        - Source entity: {fact.source_node}
        - Target entity: {fact.target_node}
        - When it became true: {fact.valid_at}
        
        Answer with a single number between 0 and 1:
        - 1.0 = Highly relevant, essential context
        - 0.5 = Somewhat related, may be useful
        - 0.0 = Not relevant, should not be included
        
        Score:
        """
        
        response = await self.llm.generate(prompt, max_tokens=10)
        return float(response.strip())
```

### Caching Strategy

Cache relevance scores for repeated queries:

```python
class RelevanceCache:
    """Cache relevance scores to avoid repeated LLM calls"""
    
    def __init__(self, ttl_seconds: int = 300):
        self.cache: dict[str, float] = {}
        self.ttl = ttl_seconds
        
    def get(self, query: str, fact_id: str) -> Optional[float]:
        key = f"{query}:{fact_id}"
        if key in self.cache:
            entry = self.cache[key]
            if datetime.now() - entry.timestamp < timedelta(seconds=self.ttl):
                return entry.score
        return None
        
    def set(self, query: str, fact_id: str, score: float):
        key = f"{query}:{fact_id}"
        self.cache[key] = CacheEntry(score, datetime.now())
```

## IPC Server

### Architecture

```
┌─────────────────────────────────────────┐
│         Unix Socket Server               │
│  (jsonrpc-server library)                │
└─────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
┌───┴───┐     ┌───┴───┐     ┌───┴───┐
│Memory │     │Prompt │     │Relevance│
│Handler│     │Builder│     │Evaluator│
└───┬───┘     └───┬───┘     └───┬───┘
    │             │              │
┌───┴─────────────┴──────────────┴───┐
│          Graphiti Client            │
└─────────────────────────────────────┘
```

### Server Implementation

```python
import asyncio
import json
from jsonrpc_server import JSONRPCServer

class SibylIpcServer:
    def __init__(self, socket_path: str):
        self.server = JSONRPCServer(socket_path)
        self.graphiti = GraphitiClient()
        self.prompt_builder = PromptBuilder()
        self.relevance = RelevanceEvaluator()
        
    async def start(self):
        # Register handlers
        self.server.register("memory.query", self.handle_memory_query)
        self.server.register("memory.add_episode", self.handle_add_episode)
        self.server.register("memory.get_context", self.handle_get_context)
        self.server.register("prompt.build", self.handle_build_prompt)
        self.server.register("relevance.evaluate", self.handle_relevance)
        
        await self.server.start()
        
    async def handle_memory_query(self, params: dict) -> dict:
        query = params.get("query", "")
        session_id = params.get("session_id")
        limit = params.get("limit", 10)
        
        # Hybrid search
        results = await self.graphiti.search(
            query=query,
            group_id=session_id,
            limit=limit
        )
        
        return {
            "facts": [f.to_dict() for f in results.facts],
            "entities": [e.to_dict() for e in results.entities]
        }
        
    async def handle_add_episode(self, params: dict) -> dict:
        content = params["content"]
        session_id = params["session_id"]
        source = params.get("source", "conversation")
        
        episode = await self.graphiti.add_episode(
            content=content,
            group_id=session_id,
            source_description=source
        )
        
        return {"episode_id": episode.uuid}
        
    async def handle_get_context(self, params: dict) -> dict:
        session_id = params["session_id"]
        max_tokens = params.get("max_tokens", 2000)
        
        # Get facts
        facts = await self.graphiti.search(group_id=session_id, limit=20)
        
        # Filter by relevance (subagent)
        relevant = await self.relevance.evaluate_batch(
            query="",  # Empty for general context
            facts=facts.facts
        )
        
        # Build context string
        context = self.prompt_builder.format_memories(relevant)
        
        # Truncate to token limit
        if estimate_tokens(context) > max_tokens:
            context = truncate_to_tokens(context, max_tokens)
            
        return {"context_str": context}
        
    async def handle_build_prompt(self, params: dict) -> dict:
        session_id = params["session_id"]
        user_query = params["user_query"]
        harness_name = params.get("harness_name", "opencode")
        
        # Get memory context
        memory_context = await self.handle_get_context({
            "session_id": session_id
        })
        
        # Build full prompt
        prompt = self.prompt_builder.build_system_prompt(
            memories=memory_context["context_str"],
            user_query=user_query,
            harness_name=harness_name,
            environment=get_environment_info()
        )
        
        return {"prompt": prompt}
```

## Module Structure

```
python/
├── pyproject.toml
├── sibyl_memory/
│   ├── __init__.py
│   ├── main.py                  # Entry point
│   ├── graphiti_client.py
│   ├── episode_manager.py
│   ├── search.py
│   ├── context_builder.py
│   ├── types.py
│   └── embedder/
│       └── local.py
│   └── llm/
│       └── ollama.py
│
├── sibyl_prompt/
│   ├── __init__.py
│   ├── builder.py               # Prompt assembly
│   ├── templates/
│   │   ├── system.jinja2        # System prompt template
│   │   ├── memory.jinja2        # Memory formatting
│   │   └── tools.jinja2         # Tool descriptions
│   ├── environment.py           # Environment info gathering
│   └── tokenizer.py             # Token counting
│
├── sibyl_ipc_server/
│   ├── __init__.py
│   ├── server.py                # JSON-RPC server
│   ├── handlers.py              # Method handlers
│   ├── protocol.py              # Request/response types
│   └── main.py                  # Server entry point
│
├── sibyl_relevance/
│   ├── __init__.py
│   ├── evaluator.py             # Subagent evaluator
│   ├── cache.py                 # Score caching
│   └── prompts.py               # Evaluation prompts
```

## Dependencies

```toml
# pyproject.toml
[project]
name = "sibyl-python"
version = "0.1.0"
requires-python = ">=3.10"

dependencies = [
    "graphiti-core[falkordb]>=0.17.0",
    "sentence-transformers>=2.2.0",
    "ollama>=0.1.0",
    "jinja2>=3.1.0",
    "pydantic>=2.0.0",
    "tiktoken>=0.5.0",            # Token counting
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-asyncio>=0.21.0",
    "black>=23.0.0",
    "ruff>=0.1.0",
]
```

## Entry Points

```toml
[project.scripts]
sibyl-memory-server = "sibyl_ipc_server.main:main"
```

## Environment Info Gathering

```python
import os
import platform
from datetime import datetime
from pathlib import Path

def get_environment_info() -> dict:
    """Gather environment context for prompt"""
    return {
        "platform": platform.system(),
        "working_directory": os.getcwd(),
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "home": str(Path.home()),
        "shell": os.environ.get("SHELL", "unknown"),
        "editor": os.environ.get("EDITOR", "unknown"),
    }

def get_project_info(project_path: Path) -> dict:
    """Gather project-specific context"""
    info = {}
    
    # Git info
    git_dir = project_path / ".git"
    if git_dir.exists():
        info["branch"] = get_git_branch(project_path)
        info["recent_commits"] = get_recent_commits(project_path, limit=5)
        info["status"] = get_git_status(project_path)
    
    # Project structure
    info["language"] = detect_primary_language(project_path)
    info["framework"] = detect_framework(project_path)
    
    return info
```

## Token Estimation

```python
import tiktoken

def estimate_tokens(text: str) -> int:
    """Estimate token count for a string"""
    encoder = tiktoken.get_encoding("cl100k_base")  # GPT-4 encoding
    return len(encoder.encode(text))

def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """Truncate text to fit within token limit"""
    encoder = tiktoken.get_encoding("cl100k_base")
    tokens = encoder.encode(text)
    if len(tokens) <= max_tokens:
        return text
    truncated = tokens[:max_tokens]
    return encoder.decode(truncated) + "..."
```