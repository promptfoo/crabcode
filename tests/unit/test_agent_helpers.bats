#!/usr/bin/env bats
# Tests for the agent abstraction layer in crabcode.
# These test the helper functions that make crabcode agent-agnostic
# (supporting claude, codex, and future agents).

load '../test_helper/bats-support/load'
load '../test_helper/bats-assert/load'

PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
CRABCODE="${PROJECT_ROOT}/src/crabcode"

setup() {
  # Isolate tests from real user config
  export TEST_TMPDIR="$(mktemp -d)"
  export HOME="${TEST_TMPDIR}/home"
  mkdir -p "${HOME}/.crabcode/projects" "${HOME}/.claude" "${HOME}/.codex"

  # Source the script (source guard prevents main from running)
  source "${CRABCODE}"

  # Create test project configs
  cat > "${HOME}/.crabcode/projects/codex-project.yaml" << 'EOF'
session_name: codex-test
agent: codex
layout:
  panes:
    - name: terminal
      command: ""
    - name: server
      command: ""
    - name: main
      command: codex --full-auto
EOF

  cat > "${HOME}/.crabcode/projects/claude-project.yaml" << 'EOF'
session_name: claude-test
agent: claude
layout:
  panes:
    - name: terminal
      command: ""
    - name: server
      command: ""
    - name: main
      command: claude --dangerously-skip-permissions
EOF

  # Config with no agent field (tests default behavior)
  cat > "${HOME}/.crabcode/projects/no-agent-project.yaml" << 'EOF'
session_name: no-agent-test
layout:
  panes:
    - name: terminal
      command: ""
    - name: main
      command: claude --dangerously-skip-permissions
EOF
}

teardown() {
  rm -rf "${TEST_TMPDIR}"
}

# =============================================================================
# get_agent_type
# =============================================================================

@test "get_agent_type: returns codex when configured" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  run get_agent_type
  assert_success
  assert_output "codex"
}

@test "get_agent_type: returns claude when configured" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  run get_agent_type
  assert_success
  assert_output "claude"
}

@test "get_agent_type: defaults to claude when agent field missing" {
  CONFIG_FILE="${HOME}/.crabcode/projects/no-agent-project.yaml"
  run get_agent_type
  assert_success
  assert_output "claude"
}

@test "get_agent_type: defaults to claude when config file missing" {
  CONFIG_FILE="/nonexistent/path.yaml"
  run get_agent_type
  assert_success
  assert_output "claude"
}

# =============================================================================
# get_agent_base_cmd
# =============================================================================

@test "get_agent_base_cmd: codex returns codex --full-auto" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  run get_agent_base_cmd
  assert_success
  assert_output "codex --full-auto"
}

@test "get_agent_base_cmd: claude returns claude --dangerously-skip-permissions" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  run get_agent_base_cmd
  assert_success
  assert_output "claude --dangerously-skip-permissions"
}

# =============================================================================
# agent_cmd_continue
# =============================================================================

@test "agent_cmd_continue: codex uses resume --last" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  run agent_cmd_continue "codex --full-auto"
  assert_success
  assert_output "codex resume --last --full-auto"
}

@test "agent_cmd_continue: claude appends --continue" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  run agent_cmd_continue "claude --dangerously-skip-permissions"
  assert_success
  assert_output "claude --dangerously-skip-permissions --continue"
}

# =============================================================================
# agent_cmd_resume
# =============================================================================

@test "agent_cmd_resume: codex uses resume <id>" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  run agent_cmd_resume "codex --full-auto" "session-abc-123"
  assert_success
  assert_output "codex resume session-abc-123 --full-auto"
}

@test "agent_cmd_resume: claude appends --resume <id>" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  run agent_cmd_resume "claude --dangerously-skip-permissions" "session-abc-123"
  assert_success
  assert_output "claude --dangerously-skip-permissions --resume session-abc-123"
}

# =============================================================================
# agent_cmd_with_prompt
# =============================================================================

@test "agent_cmd_with_prompt: appends prompt to command" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  run agent_cmd_with_prompt "codex --full-auto" "fix the bug"
  assert_success
  assert_output "codex --full-auto fix the bug"
}

# =============================================================================
# agent_display_name
# =============================================================================

@test "agent_display_name: codex -> Codex" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  run agent_display_name
  assert_success
  assert_output "Codex"
}

@test "agent_display_name: claude -> Claude" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  run agent_display_name
  assert_success
  assert_output "Claude"
}

@test "agent_display_name: defaults to Claude" {
  CONFIG_FILE="${HOME}/.crabcode/projects/no-agent-project.yaml"
  run agent_display_name
  assert_success
  assert_output "Claude"
}

# =============================================================================
# agent_resume_file
# =============================================================================

@test "agent_resume_file: codex uses .codex-resume-session" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  run agent_resume_file "/tmp/workspace"
  assert_success
  assert_output "/tmp/workspace/.codex-resume-session"
}

@test "agent_resume_file: claude uses .claude-resume-session" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  run agent_resume_file "/tmp/workspace"
  assert_success
  assert_output "/tmp/workspace/.claude-resume-session"
}

# =============================================================================
# agent_print_cmd
# =============================================================================

@test "agent_print_cmd: codex returns codex exec" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  run agent_print_cmd
  assert_success
  assert_output "codex exec"
}

@test "agent_print_cmd: claude returns claude --print" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  run agent_print_cmd
  assert_success
  assert_output "claude --print"
}

# =============================================================================
# agent_cli_exists
# =============================================================================

@test "agent_cli_exists: detects installed codex" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  if command -v codex &>/dev/null; then
    run agent_cli_exists
    assert_success
  else
    run agent_cli_exists
    assert_failure
  fi
}

@test "agent_cli_exists: detects installed claude" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  if command -v claude &>/dev/null; then
    run agent_cli_exists
    assert_success
  else
    run agent_cli_exists
    assert_failure
  fi
}

# =============================================================================
# agent_ensure_system_prompt
# =============================================================================

@test "agent_ensure_system_prompt: codex creates AGENTS.md" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  local ws_dir="${TEST_TMPDIR}/ws-codex"
  mkdir -p "${ws_dir}"

  agent_ensure_system_prompt "${ws_dir}"

  [ -f "${ws_dir}/AGENTS.md" ]
  grep -q "Team Mode" "${ws_dir}/AGENTS.md"
}

@test "agent_ensure_system_prompt: codex does NOT create .claude/CLAUDE.md" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  local ws_dir="${TEST_TMPDIR}/ws-codex2"
  mkdir -p "${ws_dir}"

  agent_ensure_system_prompt "${ws_dir}"

  [ ! -f "${ws_dir}/.claude/CLAUDE.md" ]
}

@test "agent_ensure_system_prompt: claude creates .claude/CLAUDE.md" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  local ws_dir="${TEST_TMPDIR}/ws-claude"
  mkdir -p "${ws_dir}"

  agent_ensure_system_prompt "${ws_dir}"

  [ -f "${ws_dir}/.claude/CLAUDE.md" ]
  grep -q "Team Mode" "${ws_dir}/.claude/CLAUDE.md"
}

@test "agent_ensure_system_prompt: claude does NOT create AGENTS.md" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  local ws_dir="${TEST_TMPDIR}/ws-claude2"
  mkdir -p "${ws_dir}"

  agent_ensure_system_prompt "${ws_dir}"

  [ ! -f "${ws_dir}/AGENTS.md" ]
}

@test "agent_ensure_system_prompt: is idempotent" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  local ws_dir="${TEST_TMPDIR}/ws-idempotent"
  mkdir -p "${ws_dir}"

  agent_ensure_system_prompt "${ws_dir}"
  agent_ensure_system_prompt "${ws_dir}"

  # Should only have one "Team Mode" section
  local count
  count=$(grep -c "^## Team Mode$" "${ws_dir}/AGENTS.md")
  [ "$count" -eq 1 ]
}

# =============================================================================
# agent_capture_session_id
# =============================================================================

@test "agent_capture_session_id: claude finds session from ~/.claude/projects/" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  local ws_dir="/tmp/my-workspace"

  # tr '/.' '--' maps each char: /tmp/my-workspace -> -tmp-my-workspace
  local claude_dir="${HOME}/.claude/projects/-tmp-my-workspace"
  mkdir -p "${claude_dir}"
  touch "${claude_dir}/session-id-abc.jsonl"

  run agent_capture_session_id "${ws_dir}"
  assert_success
  assert_output "session-id-abc"
}

@test "agent_capture_session_id: returns empty when no sessions" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  run agent_capture_session_id "/tmp/nonexistent-ws"
  assert_success
  assert_output ""
}

@test "agent_capture_session_id: codex finds session UUID from ~/.codex/sessions/" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"

  # Set up fake codex sessions with realistic directory structure
  mkdir -p "${HOME}/.codex/sessions/2026/03/10"
  touch "${HOME}/.codex/sessions/2026/03/10/rollout-2026-03-10T21-25-33-019cdb24-92fb-7513-a77b-548656b63eec.jsonl"

  run agent_capture_session_id "/tmp/any-workspace"
  assert_success
  assert_output "019cdb24-92fb-7513-a77b-548656b63eec"
}

# =============================================================================
# agent_write_resume_file
# =============================================================================

@test "agent_write_resume_file: writes codex resume file" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  local ws_dir="${TEST_TMPDIR}/ws-resume"
  mkdir -p "${ws_dir}"

  agent_write_resume_file "${ws_dir}" "my-session-id"

  [ -f "${ws_dir}/.codex-resume-session" ]
  [ "$(cat "${ws_dir}/.codex-resume-session")" = "my-session-id" ]
}

@test "agent_write_resume_file: writes claude resume file" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  local ws_dir="${TEST_TMPDIR}/ws-resume2"
  mkdir -p "${ws_dir}"

  agent_write_resume_file "${ws_dir}" "claude-sess-456"

  [ -f "${ws_dir}/.claude-resume-session" ]
  [ "$(cat "${ws_dir}/.claude-resume-session")" = "claude-sess-456" ]
}

@test "agent_write_resume_file: skips when session_id is empty" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  local ws_dir="${TEST_TMPDIR}/ws-resume3"
  mkdir -p "${ws_dir}"

  agent_write_resume_file "${ws_dir}" ""

  [ ! -f "${ws_dir}/.codex-resume-session" ]
}

# =============================================================================
# agent_session_dir
# =============================================================================

@test "agent_session_dir: codex returns ~/.codex" {
  CONFIG_FILE="${HOME}/.crabcode/projects/codex-project.yaml"
  run agent_session_dir "/tmp/workspace"
  assert_success
  assert_output "${HOME}/.codex"
}

@test "agent_session_dir: claude returns path under ~/.claude/projects/" {
  CONFIG_FILE="${HOME}/.crabcode/projects/claude-project.yaml"
  # tr '/.' '--' maps each char: /tmp/workspace -> -tmp-workspace
  run agent_session_dir "/tmp/workspace"
  assert_success
  assert_output "${HOME}/.claude/projects/-tmp-workspace"
}

# =============================================================================
# Backward compatibility: WIP metadata
# =============================================================================

@test "backward compat: old metadata with claude_session is readable" {
  local metadata="${TEST_TMPDIR}/old-metadata.json"
  cat > "${metadata}" << 'EOF'
{
  "timestamp": "20260310-120000",
  "slug": "test-wip",
  "summary": "Old format WIP",
  "workspace": 1,
  "branch": "feature-x",
  "commits_ahead": 3,
  "claude_session": "old-session-123",
  "created_at": "2026-03-10T12:00:00-07:00"
}
EOF

  local cs
  cs=$(grep -o '"claude_session"[[:space:]]*:[[:space:]]*"[^"]*"' "${metadata}" | sed 's/"claude_session"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')
  [ "$cs" = "old-session-123" ]
}

@test "backward compat: new metadata has both agent_session and claude_session" {
  local metadata="${TEST_TMPDIR}/new-metadata.json"
  cat > "${metadata}" << 'EOF'
{
  "timestamp": "20260310-130000",
  "slug": "test-wip-new",
  "summary": "New format WIP",
  "workspace": 1,
  "branch": "feature-y",
  "commits_ahead": 2,
  "agent": "codex",
  "agent_session": "codex-session-456",
  "claude_session": "codex-session-456",
  "created_at": "2026-03-10T13:00:00-07:00"
}
EOF

  local as
  as=$(grep -o '"agent_session"[[:space:]]*:[[:space:]]*"[^"]*"' "${metadata}" | sed 's/"agent_session"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')
  [ "$as" = "codex-session-456" ]

  local agent
  agent=$(grep -o '"agent"[[:space:]]*:[[:space:]]*"[^"]*"' "${metadata}" | sed 's/"agent"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')
  [ "$agent" = "codex" ]

  # claude_session also present for backward compat
  local cs
  cs=$(grep -o '"claude_session"[[:space:]]*:[[:space:]]*"[^"]*"' "${metadata}" | sed 's/"claude_session"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')
  [ "$cs" = "codex-session-456" ]
}

# =============================================================================
# Source guard itself
# =============================================================================

@test "source guard: sourcing crabcode does not execute main" {
  # If we got this far, the source guard worked — main() was not called.
  # Verify by checking that we have access to the functions.
  run get_agent_type
  assert_success
}
