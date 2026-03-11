#!/usr/bin/env bats

load '../test_helper/bats-support/load'
load '../test_helper/bats-assert/load'

PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
CRABCODE="${PROJECT_ROOT}/src/crabcode"

setup() {
  export TEST_TMPDIR="$(mktemp -d)"
  export HOME="${TEST_TMPDIR}/home"
  mkdir -p "${HOME}/.crabcode/projects" "${HOME}/.claude" "${HOME}/.codex"

  source "${CRABCODE}"

  command_exists() { return 0; }
  fetch_pr_data() { echo "mock context"; }
  session_resume() { echo "RESUMED:$1"; }
  session_update() { :; }
  get_agent_type() { echo "claude"; }
  _show_court_intro() { :; }
  _prompt_review_summary() { :; }
  claude() { echo "CLAUDE:$*"; }

  mkdir -p "$(get_sessions_dir)"
}

teardown() {
  rm -rf "${TEST_TMPDIR}"
}

@test "is_negative_response accepts n and no" {
  run is_negative_response "n"
  assert_success

  run is_negative_response "no"
  assert_success

  run is_negative_response "No"
  assert_success

  run is_negative_response "yes"
  assert_failure
}

@test "review_court: answering no starts a fresh session" {
  local session_dir
  session_dir="$(get_sessions_dir)/court-repo-123"
  mkdir -p "${session_dir}"
  echo "stale" > "${session_dir}/stale.txt"

  output="$(review_court "https://github.com/acme/repo/pull/123" <<< "no" 2>&1)"
  status=$?

  [ "${status}" -eq 0 ]
  [[ "${output}" == *"Deleted existing session. Starting fresh..."* ]]
  [[ "${output}" != *"RESUMED:court-repo-123"* ]]
  [[ "${output}" == *"Court review session created: court-repo-123"* ]]
  [ -f "${session_dir}/session.yaml" ]
  [ -f "${session_dir}/context.md" ]
  [ ! -f "${session_dir}/stale.txt" ]
}

@test "review_court: default answer resumes existing session" {
  local session_dir
  session_dir="$(get_sessions_dir)/court-repo-123"
  mkdir -p "${session_dir}"
  echo "stale" > "${session_dir}/stale.txt"

  output="$(review_court "https://github.com/acme/repo/pull/123" <<< "" 2>&1)"
  status=$?

  [ "${status}" -eq 0 ]
  [[ "${output}" == *"RESUMED:court-repo-123"* ]]
  [ -f "${session_dir}/stale.txt" ]
  [ ! -f "${session_dir}/context.md" ]
}
