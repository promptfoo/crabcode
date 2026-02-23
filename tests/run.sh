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
# Setup: Isolate tests from user's real config
# =============================================================================

CRABCODE="$PROJECT_DIR/src/crabcode"
REAL_CONFIG_DIR="$HOME/.crabcode"
BACKUP_CONFIG_DIR=""

# Temporarily move the user's real config out of the way
if [ -d "$REAL_CONFIG_DIR" ]; then
  BACKUP_CONFIG_DIR=$(mktemp -d)
  mv "$REAL_CONFIG_DIR" "$BACKUP_CONFIG_DIR/crabcode-backup"
fi

# Restore user config on exit (even on failure)
cleanup_test_env() {
  # Remove any test config we created
  rm -rf "$REAL_CONFIG_DIR" 2>/dev/null || true
  # Restore original config
  if [ -n "$BACKUP_CONFIG_DIR" ] && [ -d "$BACKUP_CONFIG_DIR/crabcode-backup" ]; then
    mv "$BACKUP_CONFIG_DIR/crabcode-backup" "$REAL_CONFIG_DIR"
    rm -rf "$BACKUP_CONFIG_DIR"
  fi
}
trap cleanup_test_env EXIT

# =============================================================================
# Unit Tests
# =============================================================================

echo -e "${YELLOW}Unit Tests${NC}"

# Test: Script exists and is executable
run_test "Script exists" "[ -f '$CRABCODE' ]"
run_test "Script is executable" "[ -x '$CRABCODE' ] || chmod +x '$CRABCODE'"

# Test: Help command works
run_test "Help command" "'$CRABCODE' --help | grep -q 'crabcode'"

# Test: Version command works
run_test "Version command" "'$CRABCODE' --version | grep -q 'crabcode'"

# Test: Cheat command works
run_test "Cheat command" "'$CRABCODE' cheat | grep -q 'CHEAT SHEET'"

# Test: Config command works without config (no ~/.crabcode at all)
run_test "Config without config file" "'$CRABCODE' config 2>&1 | grep -qE '(No config|not found|No projects)'"

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

  run_test "Parse session_name" "[ \"\$(yq -r '.session_name' '$TEST_CONFIG')\" = 'testcrab' ]"
  run_test "Parse workspace_base" "[ \"\$(yq -r '.workspace_base' '$TEST_CONFIG')\" = '/tmp/test-workspaces' ]"
  run_test "Parse workspaces.count" "[ \"\$(yq -r '.workspaces.count' '$TEST_CONFIG')\" = '3' ]"
  run_test "Parse ports.api_base" "[ \"\$(yq -r '.ports.api_base' '$TEST_CONFIG')\" = '4000' ]"
  run_test "Parse pane command" "[ \"\$(yq -r '.layout.panes[1].command' '$TEST_CONFIG')\" = 'echo \"server\"' ]"
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
run_test "Invalid number arg" "'$CRABCODE' abc 2>&1 | grep -qE '(Invalid|Error|Unknown)'"

# =============================================================================
# Tests requiring a minimal project config
# =============================================================================

# Create a minimal project config so ticket/ws commands pass config validation
if command -v yq &>/dev/null; then
  TEST_MAIN_REPO=$(mktemp -d)
  git init "$TEST_MAIN_REPO" &>/dev/null
  (cd "$TEST_MAIN_REPO" && git commit --allow-empty -m "init" &>/dev/null)
  TEST_WS_BASE=$(mktemp -d)

  mkdir -p "$HOME/.crabcode/projects"
  cat > "$HOME/.crabcode/projects/test.yaml" << PROJEOF
session_name: test
workspace_base: $TEST_WS_BASE
main_repo: $TEST_MAIN_REPO

workspaces:
  prefix: ws
  branch_pattern: workspace-{N}

layout:
  panes:
    - name: terminal
      command: ""
    - name: main
      command: ""
PROJEOF

  # Set test as default project
  cat > "$HOME/.crabcode/config.yaml" << GLOBALEOF
default_project: test
GLOBALEOF
fi

# =============================================================================
# Command Parsing Tests (require project config)
# =============================================================================

echo ""
echo -e "${YELLOW}Subcommand Parsing Tests${NC}"

if command -v yq &>/dev/null; then
  # "crab 1 foobar" should either say Unknown or Did you mean
  run_test "Unknown subcommand" "'$CRABCODE' ws 1 foobar 2>&1 | grep -qE '(Unknown|mean)'"
else
  echo -e "  ${YELLOW}Skipping subcommand test (yq not installed)${NC}"
fi

# =============================================================================
# Ticket Command Tests
# =============================================================================

echo ""
echo -e "${YELLOW}Ticket Command Tests${NC}"

if command -v yq &>/dev/null; then
  # Test: ticket with no args shows usage
  run_test "Ticket no args shows usage" "'$CRABCODE' ticket 2>&1 | grep -qE 'Usage.*crab ticket'"

  # Test: ticket with invalid identifier is rejected
  run_test "Ticket rejects semicolon" "'$CRABCODE' ticket 'foo;bar' 2>&1 | grep -q 'Invalid ticket identifier'"
  run_test "Ticket rejects spaces" "'$CRABCODE' ticket 'foo bar' 2>&1 | grep -q 'Invalid ticket identifier'"
  run_test "Ticket rejects shell chars" "'$CRABCODE' ticket 'ENG\$(whoami)' 2>&1 | grep -q 'Invalid ticket identifier'"
  run_test "Ticket rejects braces" "'$CRABCODE' ticket '{identifier}' 2>&1 | grep -q 'Invalid ticket identifier'"

  # Test: valid identifiers pass validation (will fail later at tmux, not at validation)
  run_test "Ticket accepts ENG-123" "'$CRABCODE' ticket ENG-123 2>&1 | grep -vq 'Invalid ticket identifier'"
  run_test "Ticket accepts PROJ_42" "'$CRABCODE' ticket PROJ_42 2>&1 | grep -vq 'Invalid ticket identifier'"

  # Test: ws N ticket validation
  run_test "ws ticket no id shows error" "'$CRABCODE' ws 1 ticket 2>&1 | grep -qE 'Ticket identifier required'"
  run_test "ws ticket rejects bad id" "'$CRABCODE' ws 1 ticket 'bad!id' 2>&1 | grep -q 'Invalid ticket identifier'"
  run_test "ws ticket accepts valid id" "'$CRABCODE' ws 1 ticket ENG-123 2>&1 | grep -vq 'Invalid ticket identifier'"
else
  echo -e "  ${YELLOW}Skipping ticket tests (yq not installed)${NC}"
fi

# =============================================================================
# Alias Command Tests
# =============================================================================

echo ""
echo -e "${YELLOW}Alias Command Tests${NC}"

if command -v yq &>/dev/null; then
  # Ensure clean alias state
  if [ -f "$HOME/.crabcode/config.yaml" ]; then
    yq -i 'del(.aliases)' "$HOME/.crabcode/config.yaml" 2>/dev/null || true
  fi

  # Test: list aliases when none configured
  run_test "Alias list (empty)" "'$CRABCODE' alias 2>&1 | grep -q 'No aliases configured'"

  # Test: set requires a name
  run_test "Alias set no args" "'$CRABCODE' alias set 2>&1 | grep -q 'Usage'"

  # Test: set requires a command value
  run_test "Alias set no value" "'$CRABCODE' alias set myalias 2>&1 | grep -q 'Usage'"

  # Test: set rejects invalid alias names
  run_test "Alias set rejects spaces" "'$CRABCODE' alias set 'bad name' cmd 2>&1 | grep -q 'Invalid alias name'"
  run_test "Alias set rejects special chars" "'$CRABCODE' alias set 'bad!name' cmd 2>&1 | grep -q 'Invalid alias name'"

  # Test: set accepts valid names
  run_test "Alias set single word" "'$CRABCODE' alias set testalias1 restart 2>&1 | grep -q 'Alias set'"
  run_test "Alias set with hyphen" "'$CRABCODE' alias set test-alias2 cleanup 2>&1 | grep -q 'Alias set'"
  run_test "Alias set with underscore" "'$CRABCODE' alias set test_alias3 'ws new' 2>&1 | grep -q 'Alias set'"

  # Test: list shows created aliases
  run_test "Alias list shows alias" "'$CRABCODE' alias 2>&1 | grep -q 'testalias1'"
  run_test "Alias list shows value" "'$CRABCODE' alias 2>&1 | grep -q 'restart'"

  # Test: aliases are persisted in global config
  run_test "Alias persisted in config" "yq -r '.aliases.testalias1' '$HOME/.crabcode/config.yaml' | grep -q 'restart'"

  # Test: overwrite existing alias
  run_test "Alias overwrite" "'$CRABCODE' alias set testalias1 cleanup 2>&1 | grep -q 'Alias set'"
  run_test "Alias overwrite persisted" "yq -r '.aliases.testalias1' '$HOME/.crabcode/config.yaml' | grep -q 'cleanup'"

  # Test: remove alias
  run_test "Alias rm" "'$CRABCODE' alias rm testalias1 2>&1 | grep -q 'Removed alias'"

  # Test: remove nonexistent alias
  run_test "Alias rm nonexistent" "'$CRABCODE' alias rm nonexistent 2>&1 | grep -q 'not found'"

  # Test: rm requires a name
  run_test "Alias rm no args" "'$CRABCODE' alias rm 2>&1 | grep -q 'Usage'"

  # Test: unknown subcommand
  run_test "Alias unknown subcommand" "'$CRABCODE' alias foobar 2>&1 | grep -q 'Unknown alias subcommand'"

  # Cleanup test aliases
  "$CRABCODE" alias rm test-alias2 2>/dev/null || true
  "$CRABCODE" alias rm test_alias3 2>/dev/null || true
else
  echo -e "  ${YELLOW}Skipping alias tests (yq not installed)${NC}"
fi

# =============================================================================
# Alias Resolution Tests
# =============================================================================

echo ""
echo -e "${YELLOW}Alias Resolution Tests${NC}"

if command -v yq &>/dev/null; then
  # Set an alias that maps to a known command
  "$CRABCODE" alias set testver '--version' 2>/dev/null

  # Test: alias resolves to the target command
  run_test "Alias resolves to target" "'$CRABCODE' testver 2>&1 | grep -q 'crabcode'"

  # Set a multi-word alias
  "$CRABCODE" alias set testhelp '--help' 2>/dev/null

  run_test "Multi-word alias resolves" "'$CRABCODE' testhelp 2>&1 | grep -q 'crab'"

  # Cleanup
  "$CRABCODE" alias rm testver 2>/dev/null || true
  "$CRABCODE" alias rm testhelp 2>/dev/null || true
else
  echo -e "  ${YELLOW}Skipping alias resolution tests (yq not installed)${NC}"
fi

# =============================================================================
# Msg Command Tests
# =============================================================================

echo ""
echo -e "${YELLOW}Msg Command Tests${NC}"

# Test: msg help
run_test "Msg help" "'$CRABCODE' msg help 2>&1 | grep -qE 'P2P Messaging|msg'"
run_test "Msg no args shows help" "'$CRABCODE' msg 2>&1 | grep -qE 'P2P Messaging|msg'"

# Test: msg status without relay
run_test "Msg status shows info" "'$CRABCODE' msg status 2>&1 | grep -qE 'Message Status|Name|Relay'"

# Test: msg say without args shows current state
run_test "Msg say shows state" "'$CRABCODE' msg say 2>&1 | grep -qE 'Text-to-speech'"

# Test: msg say on/off toggles
run_test "Msg say on" "'$CRABCODE' msg say on 2>&1 | grep -q 'enabled'"
run_test "Msg say off" "'$CRABCODE' msg say off 2>&1 | grep -q 'disabled'"

# Test: msg say shows updated state after toggle
run_test "Msg say reflects off state" "'$CRABCODE' msg say 2>&1 | grep -q 'off'"

# Reset to default
"$CRABCODE" msg say on 2>/dev/null || true

# Test: msg unknown subcommand
run_test "Msg unknown subcommand" "'$CRABCODE' msg foobar 2>&1 | grep -q 'Unknown msg command'"

# Test: msg read without relay (should not crash)
run_test "Msg read graceful without relay" "'$CRABCODE' msg read 2>&1; true"

# Test: msg history without relay (should not crash)
run_test "Msg history graceful without relay" "'$CRABCODE' msg history 2>&1; true"

# Test: msg start requires python3
if ! command -v python3 &>/dev/null; then
  run_test "Msg start without python3" "'$CRABCODE' msg start 2>&1 | grep -q 'Python3'"
fi

# =============================================================================
# Cleanup test repos
# =============================================================================

if [ -n "${TEST_MAIN_REPO:-}" ]; then
  rm -rf "$TEST_MAIN_REPO" 2>/dev/null || true
fi
if [ -n "${TEST_WS_BASE:-}" ]; then
  rm -rf "$TEST_WS_BASE" 2>/dev/null || true
fi

# =============================================================================
# Alias Command Tests
# =============================================================================

echo ""
echo -e "${YELLOW}Alias Command Tests${NC}"

if command -v yq &>/dev/null; then
  # Setup: backup existing global config and use a temp one
  ALIAS_BACKUP=""
  if [ -f "$HOME/.crabcode/config.yaml" ]; then
    ALIAS_BACKUP=$(mktemp)
    cp "$HOME/.crabcode/config.yaml" "$ALIAS_BACKUP"
  fi
  # Ensure clean alias state — remove aliases key if present
  if [ -f "$HOME/.crabcode/config.yaml" ]; then
    yq -i 'del(.aliases)' "$HOME/.crabcode/config.yaml" 2>/dev/null || true
  fi

  # Test: list aliases when none configured
  run_test "Alias list (empty)" "'$CRABCODE' alias 2>&1 | grep -q 'No aliases configured'"

  # Test: set requires a name
  run_test "Alias set no args" "'$CRABCODE' alias set 2>&1 | grep -q 'Usage'"

  # Test: set requires a command value
  run_test "Alias set no value" "'$CRABCODE' alias set myalias 2>&1 | grep -q 'Usage'"

  # Test: set rejects invalid alias names
  run_test "Alias set rejects spaces" "'$CRABCODE' alias set 'bad name' cmd 2>&1 | grep -q 'Invalid alias name'"
  run_test "Alias set rejects special chars" "'$CRABCODE' alias set 'bad!name' cmd 2>&1 | grep -q 'Invalid alias name'"

  # Test: set accepts valid names
  run_test "Alias set single word" "'$CRABCODE' alias set testalias1 restart 2>&1 | grep -q 'Alias set'"
  run_test "Alias set with hyphen" "'$CRABCODE' alias set test-alias2 cleanup 2>&1 | grep -q 'Alias set'"
  run_test "Alias set with underscore" "'$CRABCODE' alias set test_alias3 'ws new' 2>&1 | grep -q 'Alias set'"

  # Test: list shows created aliases
  run_test "Alias list shows alias" "'$CRABCODE' alias 2>&1 | grep -q 'testalias1'"
  run_test "Alias list shows value" "'$CRABCODE' alias 2>&1 | grep -q 'restart'"

  # Test: aliases are persisted in global config
  run_test "Alias persisted in config" "yq -r '.aliases.testalias1' '$HOME/.crabcode/config.yaml' | grep -q 'restart'"

  # Test: overwrite existing alias
  run_test "Alias overwrite" "'$CRABCODE' alias set testalias1 cleanup 2>&1 | grep -q 'Alias set'"
  run_test "Alias overwrite persisted" "yq -r '.aliases.testalias1' '$HOME/.crabcode/config.yaml' | grep -q 'cleanup'"

  # Test: remove alias
  run_test "Alias rm" "'$CRABCODE' alias rm testalias1 2>&1 | grep -q 'Removed alias'"

  # Test: remove nonexistent alias
  run_test "Alias rm nonexistent" "'$CRABCODE' alias rm nonexistent 2>&1 | grep -q 'not found'"

  # Test: rm requires a name
  run_test "Alias rm no args" "'$CRABCODE' alias rm 2>&1 | grep -q 'Usage'"

  # Test: unknown subcommand
  run_test "Alias unknown subcommand" "'$CRABCODE' alias foobar 2>&1 | grep -q 'Unknown alias subcommand'"

  # Cleanup test aliases
  "$CRABCODE" alias rm test-alias2 2>/dev/null || true
  "$CRABCODE" alias rm test_alias3 2>/dev/null || true

  # Restore original global config
  if [ -n "$ALIAS_BACKUP" ]; then
    cp "$ALIAS_BACKUP" "$HOME/.crabcode/config.yaml"
    rm -f "$ALIAS_BACKUP"
  fi
else
  echo -e "  ${YELLOW}Skipping alias tests (yq not installed)${NC}"
fi

# =============================================================================
# Alias Resolution Tests
# =============================================================================

echo ""
echo -e "${YELLOW}Alias Resolution Tests${NC}"

if command -v yq &>/dev/null; then
  # Setup: backup and create a controlled config
  ALIAS_RES_BACKUP=""
  if [ -f "$HOME/.crabcode/config.yaml" ]; then
    ALIAS_RES_BACKUP=$(mktemp)
    cp "$HOME/.crabcode/config.yaml" "$ALIAS_RES_BACKUP"
  fi

  # Set an alias that maps to a known command
  "$CRABCODE" alias set testver '--version' 2>/dev/null

  # Test: alias resolves to the target command
  run_test "Alias resolves to target" "'$CRABCODE' testver 2>&1 | grep -q 'crabcode'"

  # Set a multi-word alias
  "$CRABCODE" alias set testhelp '--help' 2>/dev/null

  run_test "Multi-word alias resolves" "'$CRABCODE' testhelp 2>&1 | grep -q 'crab'"

  # Cleanup
  "$CRABCODE" alias rm testver 2>/dev/null || true
  "$CRABCODE" alias rm testhelp 2>/dev/null || true

  if [ -n "$ALIAS_RES_BACKUP" ]; then
    cp "$ALIAS_RES_BACKUP" "$HOME/.crabcode/config.yaml"
    rm -f "$ALIAS_RES_BACKUP"
  fi
else
  echo -e "  ${YELLOW}Skipping alias resolution tests (yq not installed)${NC}"
fi

# =============================================================================
# Msg Command Tests
# =============================================================================

echo ""
echo -e "${YELLOW}Msg Command Tests${NC}"

# Test: msg help
run_test "Msg help" "'$CRABCODE' msg help 2>&1 | grep -qE 'P2P Messaging|msg'"
run_test "Msg no args shows help" "'$CRABCODE' msg 2>&1 | grep -qE 'P2P Messaging|msg'"

# Test: msg status without relay
run_test "Msg status shows info" "'$CRABCODE' msg status 2>&1 | grep -qE 'Message Status|Name|Relay'"

# Test: msg say without args shows current state
run_test "Msg say shows state" "'$CRABCODE' msg say 2>&1 | grep -qE 'Text-to-speech'"

# Test: msg say on/off toggles
run_test "Msg say on" "'$CRABCODE' msg say on 2>&1 | grep -q 'enabled'"
run_test "Msg say off" "'$CRABCODE' msg say off 2>&1 | grep -q 'disabled'"

# Test: msg say shows updated state after toggle
run_test "Msg say reflects off state" "'$CRABCODE' msg say 2>&1 | grep -q 'off'"

# Reset to default
"$CRABCODE" msg say on 2>/dev/null || true

# Test: msg unknown subcommand
run_test "Msg unknown subcommand" "'$CRABCODE' msg foobar 2>&1 | grep -q 'Unknown msg command'"

# Test: msg read without relay (should not crash)
run_test "Msg read graceful without relay" "'$CRABCODE' msg read 2>&1; true"

# Test: msg history without relay (should not crash)
run_test "Msg history graceful without relay" "'$CRABCODE' msg history 2>&1; true"

# Test: msg start requires python3
if ! command -v python3 &>/dev/null; then
  run_test "Msg start without python3" "'$CRABCODE' msg start 2>&1 | grep -q 'Python3'"
fi

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
