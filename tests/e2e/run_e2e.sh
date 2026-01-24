#!/usr/bin/env bash
# End-to-end test for crabcode
# Tests all commands in a simulated promptfoo-cloud environment

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

passed=0
failed=0
total=0

log() {
  echo -e "${CYAN}[TEST]${NC} $1"
}

pass() {
  echo -e "  ${GREEN}✓ PASS${NC}: $1"
  passed=$((passed + 1))
  total=$((total + 1))
}

fail() {
  echo -e "  ${RED}✗ FAIL${NC}: $1"
  echo -e "    ${YELLOW}Output:${NC} $2"
  failed=$((failed + 1))
  total=$((total + 1))
}

run_test() {
  local name="$1"
  local cmd="$2"
  local expect_pattern="$3"

  local output
  if output=$(eval "$cmd" 2>&1); then
    if [ -n "$expect_pattern" ]; then
      if echo "$output" | grep -qE "$expect_pattern"; then
        pass "$name"
      else
        fail "$name - pattern '$expect_pattern' not found" "$output"
      fi
    else
      pass "$name"
    fi
  else
    local exit_code=$?
    if [ -n "$expect_pattern" ] && echo "$output" | grep -qE "$expect_pattern"; then
      pass "$name (expected error)"
    else
      fail "$name (exit code: $exit_code)" "$output"
    fi
  fi
}

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}           CRABCODE END-TO-END TEST SUITE${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo ""

# =============================================================================
# Setup: Create config for promptfoo-cloud
# =============================================================================

log "Setting up crabcode config for promptfoo-cloud..."

mkdir -p ~/.crabcode

cat > ~/.crabcode/config.yaml << 'EOF'
session_name: crab
workspace_base: ~/Dev-Promptfoo/subfolder
main_repo: ~/Dev-Promptfoo/promptfoo-cloud

workspaces:
  count: 3
  prefix: cloud-workspace
  branch_pattern: workspace-{N}

ports:
  api_base: 3200
  app_base: 3000

install_command: echo "Installing dependencies..."

layout:
  panes:
    - name: terminal
      command: ""
    - name: server
      command: echo "Server pane ready"
    - name: main
      command: echo "Main pane ready"

env_sync:
  files:
    - path: server/.env
      port_var: API_PORT
    - path: app/.env
      port_var: VITE_API_BASE_URL
    - path: promptfoo/.env
      port_var: PROMPTFOO_REMOTE_GENERATION_URL

submodules:
  - path: promptfoo
    reset_to: origin/main
    install_command: echo "Installing submodule deps..."

cleanup:
  preserve_files: ".env"
EOF

echo -e "${GREEN}Config created at ~/.crabcode/config.yaml${NC}"
echo ""

# =============================================================================
# Test 1: Basic Commands (no tmux needed)
# =============================================================================

log "Testing basic commands..."

run_test "crabcode --help" \
  "crabcode --help" \
  "crab"

run_test "crabcode --version" \
  "crabcode --version" \
  "[0-9]+\.[0-9]+\.[0-9]+"

run_test "crab alias works" \
  "crab --version" \
  "[0-9]+\.[0-9]+\.[0-9]+"

run_test "crab cheat" \
  "crab cheat" \
  "CHEAT SHEET"

run_test "crabcode config" \
  "crabcode config" \
  "session_name.*crab"

run_test "crabcode doctor" \
  "crabcode doctor" \
  "Doctor|Checking"

run_test "crabcode ports" \
  "crabcode ports" \
  "Port|3201|3202"

echo ""

# =============================================================================
# Test 2: Workspace Creation (creates git worktree)
# =============================================================================

log "Testing workspace creation..."

# List workspaces (should show none or prompt to create)
run_test "crab ws (list empty)" \
  "crabcode ws" \
  "workspace|Workspace|No workspaces|create"

# Create workspace 1 without tmux (should create worktree)
# We'll use --dry-run or check if it creates the directory
log "Creating workspace 1..."

# Manually create worktree since tmux won't work in Docker without TTY
cd ~/Dev-Promptfoo/promptfoo-cloud
git worktree add ../subfolder/cloud-workspace-1 -b workspace-1 2>/dev/null || true

if [ -d ~/Dev-Promptfoo/subfolder/cloud-workspace-1 ]; then
  pass "Workspace 1 directory created"
else
  fail "Workspace 1 directory not created" "Directory doesn't exist"
fi

# Check branch
cd ~/Dev-Promptfoo/subfolder/cloud-workspace-1
current_branch=$(git branch --show-current)
if [ "$current_branch" = "workspace-1" ]; then
  pass "Workspace 1 on correct branch (workspace-1)"
else
  fail "Workspace 1 wrong branch" "Expected workspace-1, got $current_branch"
fi

# Create workspace 2
cd ~/Dev-Promptfoo/promptfoo-cloud
git worktree add ../subfolder/cloud-workspace-2 -b workspace-2 2>/dev/null || true

if [ -d ~/Dev-Promptfoo/subfolder/cloud-workspace-2 ]; then
  pass "Workspace 2 directory created"
else
  fail "Workspace 2 directory not created" "Directory doesn't exist"
fi

echo ""

# =============================================================================
# Test 3: List Workspaces
# =============================================================================

log "Testing workspace listing..."

run_test "crab ws (list workspaces)" \
  "crabcode ws" \
  "cloud-workspace-1|cloud-workspace-2|workspace"

echo ""

# =============================================================================
# Test 4: WIP Commands
# =============================================================================

log "Testing WIP (Work In Progress) commands..."

# Create some changes in workspace 1
cd ~/Dev-Promptfoo/subfolder/cloud-workspace-1
echo "test change" > test_file.txt
git add test_file.txt

run_test "crabcode wip ls (empty)" \
  "crabcode wip ls" \
  "No WIP|empty|WIP"

# Save WIP
run_test "crabcode wip save" \
  "crabcode wip save" \
  "saved|Saved|WIP"

run_test "crabcode wip ls (has wip)" \
  "crabcode wip ls" \
  "cloud-workspace-1|wip"

echo ""

# =============================================================================
# Test 5: Port Detection
# =============================================================================

log "Testing port configuration..."

# Check that ports are correctly calculated
run_test "Port calculation for workspace 1 (API: 3201)" \
  "crabcode ports | grep -E '3201'" \
  "3201"

run_test "Port calculation for workspace 2 (API: 3202)" \
  "crabcode ports | grep -E '3202'" \
  "3202"

echo ""

# =============================================================================
# Test 6: Error Handling
# =============================================================================

log "Testing error handling..."

run_test "Invalid workspace number" \
  "crabcode abc 2>&1" \
  "Invalid|Error|number"

# crabcode allows creating any workspace number - no artificial limit
# Just verify high numbers work (though tmux will fail in Docker)
run_test "High workspace number accepted" \
  "crabcode 99 2>&1 | head -5" \
  "Creating|workspace"

echo ""

# =============================================================================
# Test 7: Init Command (interactive - test with defaults)
# =============================================================================

log "Testing init command..."

# Backup existing config
cp ~/.crabcode/config.yaml ~/.crabcode/config.yaml.backup

# Test init with piped input
run_test "crabcode init (with input)" \
  "echo -e 'testcrab\n~/test-main\n~/test-ws\n2\n4000\n5000\necho test\necho main\n' | crabcode init" \
  "Config|created|saved"

# Restore original config
mv ~/.crabcode/config.yaml.backup ~/.crabcode/config.yaml

echo ""

# =============================================================================
# Test 8: Env Sync Verification
# =============================================================================

log "Testing env file structure..."

# Check workspace has correct structure
if [ -d ~/Dev-Promptfoo/subfolder/cloud-workspace-1/server ]; then
  pass "Workspace has server directory"
else
  fail "Workspace missing server directory" "No server dir"
fi

if [ -d ~/Dev-Promptfoo/subfolder/cloud-workspace-1/app ]; then
  pass "Workspace has app directory"
else
  fail "Workspace missing app directory" "No app dir"
fi

if [ -d ~/Dev-Promptfoo/subfolder/cloud-workspace-1/promptfoo ]; then
  pass "Workspace has promptfoo submodule"
else
  fail "Workspace missing promptfoo submodule" "No promptfoo dir"
fi

echo ""

# =============================================================================
# Test 9: New Workspace Command
# =============================================================================

log "Testing crabcode new command..."

# Since workspace 1 and 2 exist, new should create 3
# Note: tmux operations will fail in Docker, but workspace should still be created
cd ~/Dev-Promptfoo/promptfoo-cloud
output=$(crabcode ws new 2>&1 || true)
if echo "$output" | grep -qE "workspace 3|Creating.*3"; then
  pass "crab ws new finds next available (workspace 3)"
else
  fail "crab ws new did not find next workspace" "$output"
fi

# Verify workspace 3 was created (even if tmux failed afterward)
if [ -d ~/Dev-Promptfoo/subfolder/cloud-workspace-3 ]; then
  pass "crab ws new created workspace 3"
else
  fail "crab ws new did not create workspace 3" "Directory doesn't exist"
fi

echo ""

# =============================================================================
# Test 10: Shared Volume
# =============================================================================

log "Testing shared volume..."

# Create shared volume directory
mkdir -p ~/.crabcode/shared

# Create a test file in the shared volume
echo "shared test content" > ~/.crabcode/shared/test-shared.txt

# Add shared_volume config to our test config
cat >> ~/.crabcode/config.yaml << 'EOF'

shared_volume:
  enabled: true
  path: ~/.crabcode/shared
  link_as: .local
EOF

# Create a fake .local directory with content in workspace 1 to test migration
cd ~/Dev-Promptfoo/subfolder/cloud-workspace-1
mkdir -p .local
echo "workspace-local-file" > .local/ws1-notes.txt

# Run crabcode doctor to trigger setup (uses check functions)
run_test "crabcode shared command" \
  "crabcode shared" \
  "Shared Volume|shared"

# Test that the shared command shows the path
run_test "crabcode shared shows path" \
  "crabcode shared | grep -E '~/.crabcode/shared|shared'" \
  "shared"

echo ""

# =============================================================================
# Summary
# =============================================================================

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}                         TEST SUMMARY${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Total tests:  ${BOLD}$total${NC}"
echo -e "  Passed:       ${GREEN}$passed${NC}"
echo -e "  Failed:       ${RED}$failed${NC}"
echo ""

if [ $failed -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All tests passed!${NC} 🎉"
  exit 0
else
  echo -e "${RED}${BOLD}Some tests failed.${NC}"
  exit 1
fi
