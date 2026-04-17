# Sibyl Baseline Status (2026-04-17)

## Verified Features ✓

### Configuration System
- Config file: `~/.config/sibyl/config.yaml`
- Properly loaded with all settings:
  - Harness: opencode (url: http://localhost:4096, model: glm-5)
  - IPC socket: /tmp/sibyl-ipc.sock
  - Dependencies: auto-start enabled
  - Memory backend: falkordb (localhost:6379)

### Headless Mode (`sibyl run`)
- Command: `./target/release/sibyl run --prompt "..." --json`
- Working baseline:
  1. Prompt sent to OpenCode harness ✓
  2. 10 most relevant memories retrieved ✓
  3. Memories injected into system prompt ✓
  4. Response received from harness ✓
  5. Conversation stored in memory ✓
  6. JSON output with all metadata ✓

### Memory System (`sibyl memory`)
- Command: `./target/release/sibyl memory --query "..." --json`
- Real-time natural language query ✓
- Returns episodes, facts, and relevance scores ✓
- Embedding-based search (all-MiniLM-L6-v2, 384 dims) ✓

### Dependencies
- Auto-started:
  - Python IPC server (optimized version) ✓
  - FalkorDB/Redis at localhost:6379 ✓
  - OpenCode harness at localhost:4096 ✓

### TUI (`sibyl tui`)
- Tests: 7/7 passing ✓
  - Welcome screen ✓
  - Keybindings hint ✓
  - Command hints ✓
  - Help overlay toggle ✓
  - Command palette ✓
  - Status bar with model name ✓
  - Headless mode test ✓
- Node.js 20.X LTS required (via fnm) ✓

### Performance Metrics
- IPC connect: 0.000s
- Memory add_episode: 0.014s
- Memory query: 0.013s
- Prompt build: 0.164s
- Relevance evaluate: 0.026s
- OpenCode session create: 0.006s
- Total IPC runtime: ~0.24s
- Embedder init: ~8s (one-time)

## Architecture ✓
- Hybrid Rust + Python ✓
- IPC: JSON-RPC 2.0 over Unix sockets ✓
- Memory: SimpleMemoryStore + FalkorDB ✓
- Harness: OpenCode REST client ✓

## Partially Implemented

### Memory Management Interface
- **Implemented**: Query/search memories ✓
- **Missing**: Add, modify, delete operations (CLI interface not exposed)
- **Note**: Backend supports all operations via IPC

## Not Implemented

### Plugin System
- Referenced in architecture but not yet implemented
- Would allow custom workflows, skills, tools

### Additional Harnesses
- Current: OpenCode only ✓
- Planned: Cursor, Claude Code, mCodex (not implemented)

## Testing

### Automated Tests
- `./verify_baseline.sh` - Quick baseline check
- `./test_baseline.sh` - Comprehensive test suite
- TUI tests: `cd tui-tests && npm run test:tui`

### Manual Verification Commands
```bash
# Test headless mode
./target/release/sibyl run --prompt "What is 2+2?" --json

# Test memory query
./target/release/sibyl memory --query "math" --json

# Test TUI
./target/release/sibyl tui

# Run TUI tests
cd tui-tests && eval "$(fnm env --shell bash)" && fnm use 20 && npm run test:tui
```

## Next Steps

1. **Memory Management CLI**: Add commands for manual memory operations
   - `sibyl memory add <content>`
   - `sibyl memory delete <uuid>`
   - `sibyl memory list`
   - `sibyl memory clear`

2. **UX Improvements**: Review TUI for potential enhancements
   - Memory panel interaction (view, select, delete)
   - Keyboard shortcuts optimization
   - Loading indicators for operations

3. **Plugin System**: Implement plugin architecture
   - Plugin discovery/loading
   - Plugin API for skills/tools/workflows
   - Plugin configuration

4. **Additional Harnesses**: Add support for Cursor, Claude Code, mCodex
   - Harness abstraction layer
   - Configuration per harness
   - Harness-specific features

## Documentation Updated
- AGENTS.md: Updated baseline verification section ✓
- BASELINE_STATUS.md: Created comprehensive status document ✓
- Test scripts: Added verification automation ✓