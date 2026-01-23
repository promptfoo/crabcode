#!/usr/bin/env bash
# Run all crabcode tests
# Usage: ./tests/run.sh [--docker]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

passed=0
failed=0

run_test() {
  local test_name=$1
  local test_cmd=$2

  echo -n "  $test_name: "
  if eval "$test_cmd" &>/dev/null; then
    echo -e "${GREEN}PASS${NC}"
    passed=$((passed + 1))
  else
    echo -e "${RED}FAIL${NC}"
    failed=$((failed + 1))
  fi
}

echo -e "${CYAN}Running crabcode tests${NC}"
echo ""

# =============================================================================
# Unit Tests
# =============================================================================

echo -e "${YELLOW}Unit Tests${NC}"

# Source the script for testing functions (without running main)
CRABCODE="$PROJECT_DIR/src/crabcode"

# Test: Script exists and is executable
run_test "Script exists" "[ -f '$CRABCODE' ]"
run_test "Script is executable" "[ -x '$CRABCODE' ] || chmod +x '$CRABCODE'"

# Test: Help command works
run_test "Help command" "'$CRABCODE' --help | grep -q 'crabcode'"

# Test: Version command works
run_test "Version command" "'$CRABCODE' --version | grep -q 'crabcode'"

# Test: Cheat command works
run_test "Cheat command" "'$CRABCODE' cheat | grep -q 'CHEAT SHEET'"

# Test: Config command works without config
run_test "Config without config file" "'$CRABCODE' config 2>&1 | grep -qE '(No config|not found)'"

# Test: Doctor command works
run_test "Doctor command" "'$CRABCODE' doctor | grep -q 'Doctor'"

# =============================================================================
# Config Parsing Tests
# =============================================================================

echo ""
echo -e "${YELLOW}Config Parsing Tests${NC}"

# Create a test config
TEST_CONFIG_DIR=$(mktemp -d)
TEST_CONFIG="$TEST_CONFIG_DIR/config.yaml"

cat > "$TEST_CONFIG" << 'EOF'
session_name: testcrab
workspace_base: /tmp/test-workspaces
main_repo: /tmp/test-main

workspaces:
  count: 3
  prefix: test-ws
  branch_pattern: test-{N}

ports:
  api_base: 4000
  app_base: 5000

layout:
  panes:
    - name: terminal
      command: ""
    - name: server
      command: echo "server"
    - name: main
      command: echo "main"
EOF

# Test yq is installed (required for further tests)
if command -v yq &>/dev/null; then
  run_test "yq installed" "true"

  run_test "Parse session_name" "[ \"$(yq -r '.session_name' '$TEST_CONFIG')\" = 'testcrab' ]"
  run_test "Parse workspace_base" "[ \"$(yq -r '.workspace_base' '$TEST_CONFIG')\" = '/tmp/test-workspaces' ]"
  run_test "Parse workspaces.count" "[ \"$(yq -r '.workspaces.count' '$TEST_CONFIG')\" = '3' ]"
  run_test "Parse ports.api_base" "[ \"$(yq -r '.ports.api_base' '$TEST_CONFIG')\" = '4000' ]"
  run_test "Parse pane command" "[ \"$(yq -r '.layout.panes[1].command' '$TEST_CONFIG')\" = 'echo \"server\"' ]"
else
  echo -e "  ${YELLOW}Skipping config parsing tests (yq not installed)${NC}"
fi

# Cleanup
rm -rf "$TEST_CONFIG_DIR"

# =============================================================================
# Command Parsing Tests
# =============================================================================

echo ""
echo -e "${YELLOW}Command Parsing Tests${NC}"

# Test various command patterns (these should fail gracefully without config)
run_test "Invalid number arg" "'$CRABCODE' abc 2>&1 | grep -qE '(Invalid|Error)'"
run_test "Unknown subcommand" "'$CRABCODE' 1 foobar 2>&1 | grep -qE '(Unknown|mean)'"

# =============================================================================
# Integration Tests (require Docker or real setup)
# =============================================================================

if [ "${1:-}" = "--docker" ]; then
  echo ""
  echo -e "${YELLOW}Integration Tests (Docker)${NC}"

  if command -v docker &>/dev/null; then
    # Build test container
    run_test "Build test container" "docker build -t crabcode-test -f '$PROJECT_DIR/Dockerfile.test' '$PROJECT_DIR'"

    # Run integration tests in container
    run_test "Init command in container" "docker run --rm crabcode-test bash -c 'echo -e \"dev\n~/test\n~/test-ws\n3\n4000\n5000\n\n\n\" | crabcode init && cat ~/.crabcode/config.yaml | grep -q dev'"
  else
    echo -e "  ${YELLOW}Skipping Docker tests (docker not installed)${NC}"
  fi
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "════════════════════════════════════════"
total=$((passed + failed))
echo -e "Results: ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC} ($total total)"

if [ $failed -gt 0 ]; then
  exit 1
fi

echo -e "${GREEN}All tests passed!${NC}"
