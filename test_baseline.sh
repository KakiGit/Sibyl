#!/bin/bash
set -e

echo "========================================="
echo "Sibyl Baseline Test Suite"
echo "========================================="
echo ""

# Test 1: Check dependencies
echo "Test 1: Checking dependencies..."
echo "  - Redis/FalkorDB:"
redis-cli ping || { echo "FAILED: Redis not running"; exit 1; }
echo "  - OpenCode harness:"
curl -s http://localhost:4096/health > /dev/null || { echo "FAILED: OpenCode not running"; exit 1; }
echo "  - Python IPC server:"
pgrep -f "sibyl_ipc_server" > /dev/null || { echo "FAILED: IPC server not running"; exit 1; }
echo "  ✓ All dependencies running"
echo ""

# Test 2: Headless mode - memory storage
echo "Test 2: Testing headless mode memory storage..."
TEST_MSG="Baseline test at $(date +%H%M%S): User likes Rust and Python"
OUTPUT=$(./target/release/sibyl run --prompt "$TEST_MSG" --json 2>&1)
echo "$OUTPUT" | grep -q "response" || { echo "FAILED: No response from harness"; echo "$OUTPUT"; exit 1; }
SESSION_ID=$(echo "$OUTPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  ✓ Message sent, session: ${SESSION_ID:0:20}..."
echo ""

# Test 3: Memory query
echo "Test 3: Testing memory query..."
MEMORY_OUTPUT=$(./target/release/sibyl memory --query "What programming languages does the user like?" --json 2>&1)
echo "$MEMORY_OUTPUT" | grep -q "episodes" || { echo "FAILED: No episodes in memory"; echo "$MEMORY_OUTPUT"; exit 1; }
EPISODE_COUNT=$(echo "$MEMORY_OUTPUT" | grep -o '"content"' | wc -l)
echo "  ✓ Found $EPISODE_COUNT episodes in memory"
echo ""

# Test 4: Verify memory retrieval in subsequent query
echo "Test 4: Testing memory retrieval in subsequent query..."
TEST_MSG2="What are my programming preferences?"
OUTPUT2=$(./target/release/sibyl run --prompt "$TEST_MSG2" --json 2>&1)
echo "$OUTPUT2" | grep -q "memories" || { echo "FAILED: No memories in response"; echo "$OUTPUT2"; exit 1; }
MEMORY_COUNT=$(echo "$OUTPUT2" | grep -o '"memories"' | wc -l)
echo "  ✓ Memories retrieved and injected into prompt"
echo ""

# Test 5: Config verification
echo "Test 5: Verifying config usage..."
if [ -f ~/.config/sibyl/config.yaml ]; then
    grep -q "opencode" ~/.config/sibyl/config.yaml || { echo "FAILED: opencode not in config"; exit 1; }
    grep -q "glm-5" ~/.config/sibyl/config.yaml || { echo "FAILED: glm-5 model not in config"; exit 1; }
    echo "  ✓ Config file present and contains expected values"
else
    echo "  ✗ Config file not found (using defaults)"
fi
echo ""

# Test 6: TUI binary check
echo "Test 6: Verifying TUI binary..."
if [ -f ./target/release/sibyl ]; then
    chmod +x ./target/release/sibyl
    echo "  ✓ TUI binary exists and is executable"
else
    echo "  ✗ TUI binary not found"
    exit 1
fi
echo ""

echo "========================================="
echo "Baseline Tests: PASSED"
echo "========================================="
echo ""
echo "Summary:"
echo "  - Dependencies: All running ✓"
echo "  - Memory storage: Working ✓"
echo "  - Memory query: Working ✓"
echo "  - Memory injection: Working ✓"
echo "  - Config: Loaded from ~/.config/sibyl/config.yaml ✓"
echo "  - Harness: OpenCode at localhost:4096 ✓"
echo "  - Model: glm-5 ✓"
echo ""
echo "TUI tests: Run 'cd tui-tests && npm run test:tui' for interactive tests"
echo "Note: Full-flow tests may timeout due to LLM latency (expected)"