# Sibyl Baseline Verification - 2026-04-17

## Configuration
✅ **Config loaded from ~/.config/sibyl/config.yaml**
- Harness: `opencode` (url: http://localhost:4096, model: glm-5)
- IPC: `/tmp/sibyl-ipc.sock`
- Memory: FalkorDB (localhost:6379)
- Dependencies: auto-start enabled

## Baseline Functionality

### 1. Memory System
✅ **Real-time natural language query**
- Example: `./target/release/sibyl memory --query "What programming languages does the user like?" --json`
- Returns episodes, facts, and relevance scores
- Uses embedding-based search (all-MiniLM-L6-v2, 384 dimensions)

✅ **Memory injection**
- Most relevant memories (10) fetched before sending to harness
- Memories injected into prompt via IPC call to `prompt.build`
- Prompt includes context from memories, entities, and facts

✅ **Memory storage**
- Conversations automatically stored after each session
- Stored as episodes with source description "user conversation"
- Associated with session_id for tracking

### 2. Headless Mode
✅ **Baseline flow verified**:
1. Create OpenCode session
2. Query memory for relevant episodes (10 most relevant)
3. Build prompt with memory context
4. Send message to OpenCode harness
5. Store conversation as new memory episode

Example output:
```
Input: Hello, what is 2+2?
───────────────────────────
Memory Context:
  • User: What is 2+2? Please answer briefly.
  Assistant: 4
  • User: What is 2+2? Answer briefly.
  Assistant: 4
  [... 8 more relevant memories]
───────────────────────────
Response:
4
```

### 3. TUI
✅ **All tests passing (7/7)**:
- simple.test.ts: headless runs (18.3s)
- basic.test.ts: welcome screen (15.2s)
- basic.test.ts: keybindings hint (15.1s)
- basic.test.ts: command hints (15.2s)
- basic.test.ts: help overlay toggle (15.2s)
- basic.test.ts: command palette (15.2s)
- basic.test.ts: status bar with model (15.1s)

✅ **Test framework**: @microsoft/tui-test ^0.0.4
- Note: Requires Node.js 20.X LTS (not Node 25.X)
- Install: `sudo pacman -S fnm` (Arch Linux)
- Use: `eval "$(fnm env --shell bash)" && fnm use 20`

### 4. Dependencies
✅ **Auto-start verified**:
- Python IPC server: auto-started by sibyl when needed
- FalkorDB/Redis: running at localhost:6379
- OpenCode harness: running at localhost:4096

### 5. IPC Communication
✅ **JSON-RPC 2.0 over Unix domain sockets**:
- Methods: `memory.query`, `memory.add_episode`, `prompt.build`, `relevance.evaluate`
- Optimized IPC server: `sibyl_ipc_server.__main_optimized__`
- Embedding-based relevance evaluation (cached)

## Performance Metrics (from AGENTS.md)
- IPC connect: 0.000s
- Memory add_episode: 0.014s
- Memory query: 0.013s
- Memory get_context: 0.013s
- Prompt build: 0.164s (cached environment info)
- Relevance evaluate: 0.026s (embedding-based, cached)
- OpenCode session create: 0.006s
- OpenCode send message: 5.732s (LLM response time)
- Total IPC runtime (excluding embedder init): ~0.24s
- Embedder init: ~8s (one-time startup cost)

## Desired Features (from DRAFT.md) - Status

### Memory System Spec
✅ Real-time natural language query
✅ Memory injection automatically to context
✅ Subagent evaluates memory relevance (embedding-based)
✅ Interface to manage memories (add, search via CLI)
⚠️ Modify and delete memories - not yet implemented
✅ Learned from graphiti (SimpleMemoryStore with FalkorDB)

### Performance
✅ Top-notch performance (sub-second IPC calls)

### UX
✅ Top-notch UX (TUI tests passing)
✅ Keybindings and help overlay
✅ Command palette
✅ Status bar with model info

### Architecture
✅ Rust core and TUI for performance
✅ Python for prompt building and memory
✅ IPC bridge between Rust and Python
✅ Multiple Sibyl instances can run simultaneously

### Supported Harnesses
✅ OpenCode (working)
⚠️ Cursor, Claude Code, mCodex - not yet implemented

## Next Steps

### From DRAFT.md requirements:
1. **Memory management**: Add modify and delete operations
2. **Additional harnesses**: Implement Cursor, Claude Code, mCodex
3. **Plugin system**: Allow users to extend functionality
4. **Skills/tools/workflows**: Create once, use across different LLMs

### TUI UX optimizations:
1. Improve spinner animation during processing
2. Add memory panel scrolling
3. Add conversation history navigation
4. Add command completions for more commands
5. Add theme customization

## Test Commands
```bash
# Headless mode
./target/release/sibyl run --prompt "Hello, what is 2+2?"
./target/release/sibyl run --prompt "Remember that I like Python programming" --json

# Memory query
./target/release/sibyl memory --query "What programming languages does the user like?" --json

# TUI tests (requires Node.js 20.X)
cd tui-tests
eval "$(fnm env --shell bash)" && fnm use 20
npm run test:tui

# Cargo tests
cargo test --package sibyl-deps test_load_config -- --nocapture

# Baseline verification
./baseline_test.sh
```

## Conclusion
**Baseline is WORKING and VERIFIED** ✅

The core functionality meets the requirements from DRAFT.md:
- Config loads correctly from ~/.config/sibyl/config.yaml
- Memory system works with real-time query, injection, and storage
- Headless mode sends messages to OpenCode harness with memory context
- TUI tests pass (7/7)
- Dependencies auto-start when needed
- Performance is excellent (sub-second IPC calls)