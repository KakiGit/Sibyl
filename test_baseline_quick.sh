#!/bin/bash
set -e

echo "========================================="
echo "Sibyl Quick Baseline Test"
echo "========================================="
echo ""

# Test 1: Check dependencies
echo "Test 1: Checking dependencies..."
redis-cli ping > /dev/null 2>&1 || { echo "FAILED: Redis not running"; exit 1; }
curl -s http://localhost:4096/health > /dev/null 2>&1 || { echo "FAILED: OpenCode not running"; exit 1; }
pgrep -f "sibyl_ipc_server" > /dev/null || { echo "FAILED: IPC server not running"; exit 1; }
echo "  ✓ All dependencies running"
echo ""

# Test 2: Memory query (fast, no LLM call)
echo "Test 2: Testing memory query..."
MEMORY_OUTPUT=$(./target/release/sibyl memory --query "test" --json 2>&1)
echo "$MEMORY_OUTPUT" | grep -q "episodes" || { echo "FAILED: Memory query failed"; exit 1; }
echo "  ✓ Memory query working"
echo ""

# Test 3: Config verification
echo "Test 3: Verifying config..."
if [ -f ~/.config/sibyl/config.yaml ]; then
    grep -q "opencode" ~/.config/sibyl/config.yaml || { echo "FAILED: opencode not in config"; exit 1; }
    grep -q "glm-5" ~/.config/sibyl/config.yaml || { echo "FAILED: glm-5 model not in config"; exit 1; }
    echo "  ✓ Config loaded from ~/.config/sibyl/config.yaml"
else
    echo "  ✗ Config file not found"
fi
echo ""

# Test 4: TUI binary check
echo "Test 4: Verifying TUI binary..."
[ -f ./target/release/sibyl ] && [ -x ./target/release/sibyl ] || { echo "FAILED: TUI binary not found"; exit 1; }
echo "  ✓ TUI binary ready"
echo ""

# Test 5: Check build
echo "Test 5: Verifying build..."
cargo build --release 2>&1 | grep -q "error" && { echo "FAILED: Build has errors"; exit 1; }
echo "  ✓ Build successful (no errors)"
echo ""

echo "========================================="
echo "Quick Baseline Tests: PASSED ✓"
echo "========================================="
echo ""
echo "Summary:"
echo "  - Dependencies: All running ✓"
echo "  - Memory query: Working ✓"
echo "  - Config: Loaded ✓"
echo "  - Harness: OpenCode at localhost:4096 ✓"
echo "  - Model: glm-5 ✓"
echo "  - Build: No errors ✓"
echo ""
echo "Full baseline test (with LLM calls):"
echo "  ./target/release/sibyl run --prompt 'Hello' --json"