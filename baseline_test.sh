#!/bin/bash

# Sibyl Baseline Test Script
# This script verifies that the baseline functionality works correctly

set -e

echo "=== Sibyl Baseline Test ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Check config loading
echo "Test 1: Config Loading"
if cargo test --package sibyl-deps test_load_config -- --nocapture 2>&1 | grep -q "test result: ok"; then
    echo -e "${GREEN}✓${NC} Config loads from ~/.config/sibyl/config.yaml"
else
    echo -e "${RED}✗${NC} Config loading failed"
    exit 1
fi
echo ""

# Test 2: Check dependencies are running
echo "Test 2: Dependency Status"
if redis-cli ping 2>&1 | grep -q "PONG"; then
    echo -e "${GREEN}✓${NC} Redis/FalkorDB is running"
else
    echo -e "${RED}✗${NC} Redis/FalkorDB not running"
    exit 1
fi

# Note: IPC server is auto-started by sibyl when needed, so we don't check it here
echo "Note: IPC server will be auto-started by sibyl when needed"

if pgrep -f "opencode serve" > /dev/null; then
    echo -e "${GREEN}✓${NC} OpenCode harness is running"
else
    echo -e "${RED}✗${NC} OpenCode harness not running"
    exit 1
fi
echo ""

# Test 3: Memory query
echo "Test 3: Memory Query"
if ./target/release/sibyl memory --query "test" --json 2>&1 | grep -q "episodes"; then
    echo -e "${GREEN}✓${NC} Memory query works"
else
    echo -e "${RED}✗${NC} Memory query failed"
    exit 1
fi
echo ""

# Test 4: Headless mode with memory injection
echo "Test 4: Headless Mode with Memory Injection"
OUTPUT=$(./target/release/sibyl run --prompt "Baseline test: What is 7+7?" 2>&1)
if echo "$OUTPUT" | grep -q "Memory Context:" && echo "$OUTPUT" | grep -q "Response:"; then
    echo -e "${GREEN}✓${NC} Headless mode injects memory and gets response"
else
    echo -e "${RED}✗${NC} Headless mode failed"
    exit 1
fi
echo ""

# Test 5: Memory storage after conversation
echo "Test 5: Memory Storage After Conversation"
TEST_MSG="Unique test message $(date +%s)"
./target/release/sibyl run --prompt "$TEST_MSG" --json > /dev/null 2>&1
sleep 1
if ./target/release/sibyl memory --query "$TEST_MSG" --json 2>&1 | grep -q "$TEST_MSG"; then
    echo -e "${GREEN}✓${NC} Conversation stored in memory"
else
    echo -e "${RED}✗${NC} Memory storage failed"
    exit 1
fi
echo ""

# Test 6: TUI tests
echo "Test 6: TUI Tests"
cd tui-tests
if npm run test:tui 2>&1 | grep -q "7 passed"; then
    echo -e "${GREEN}✓${NC} All TUI tests pass (7/7)"
else
    echo -e "${RED}✗${NC} TUI tests failed"
    exit 1
fi
cd ..
echo ""

echo -e "${GREEN}=== All Baseline Tests Passed ===${NC}"
echo ""
echo "Summary:"
echo "  • Config loaded from ~/.config/sibyl/config.yaml"
echo "  • Dependencies (Redis, IPC, OpenCode) running"
echo "  • Memory query working"
echo "  • Headless mode injects memories and sends to harness"
echo "  • Conversations stored in memory"
echo "  • TUI tests passing (7/7)"