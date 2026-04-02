# AGENTS.md

Guidance for AI agents and developers working on `promptfoo/crabcode`.

## Repository Purpose

`crabcode` is a tmux-based multi-workspace manager for multi-repo development. The primary CLI is the Bash script in `src/crabcode`; it creates Git worktrees, manages tmux panes, saves/restores WIP state, integrates with Slack/Linear, and supports multiple coding agents.

Codex is the default agent, but the codebase intentionally supports both Codex and Claude through the agent abstraction helpers in `src/crabcode`. Preserve that abstraction and avoid hardcoding one agent's session paths, CLI flags, or config file layout in new features.

## Common Commands

```bash
# Run all local tests
make test

# Run Bats unit tests only
make test-unit

# Run integration tests
make test-integration

# Run integration or e2e tests in Docker
make test-docker
make test-e2e

# Lint the main shell script
make lint

# Install the local CLI to /usr/local/bin
make install
```

For focused unit coverage while iterating on the agent abstraction, run:

```bash
./tests/bats/bin/bats tests/unit/test_agent_helpers.bats
```

## Code Layout

- `src/crabcode`: main CLI implementation and all workspace, agent, sync, Slack, WIP, and plugin commands.
- `Makefile`: test, lint, Docker test, and install entrypoints.
- `.github/workflows/test.yml`: Bats + Shellcheck CI with a required `CI Success` aggregate check.
- `.github/workflows/release-please.yml`: release automation driven by Conventional Commit subjects.
- `tests/unit/`: Bats tests for shell helper behavior.
- `tests/run.sh` and `tests/e2e/`: integration and Dockerized end-to-end test harnesses.
- `tests/MANUAL.md`: manual QA notes for scenarios that are hard to fully automate.

## Implementation Rules

- Keep shell changes compatible with `set -e` and existing Bash style in `src/crabcode`.
- Prefer extending the agent helper functions (`get_agent_type`, `agent_*_for_type`, `agent_sync_*`) instead of branching directly on `claude` or `codex` throughout command handlers.
- When adding repo-level agent instructions to generated workspaces, write to `AGENTS.md` for Codex mode and `.claude/CLAUDE.md` for Claude mode through the existing helper functions.
- Keep user-facing command output concise and consistent with the existing colored status helpers (`info`, `success`, `warn`, `error`).
- Do not commit generated runtime state from `~/.crabcode`, `.local/`, or test artifacts.

## Validation

- Run `make lint` after editing `src/crabcode`.
- Run `make test-unit` for helper/command logic changes.
- Run `make test-integration` or `make test-docker` when worktree, tmux, or filesystem behavior changes.
- Run `make test-e2e` for risky changes to workspace lifecycle, agent startup, or plugin orchestration when Docker coverage is practical.

## Git Workflow

- Do not commit directly to `main`; use a feature branch and open a PR.
- Use Conventional Commit subjects (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `build:`, `ci:`, `chore:`) so release-please can infer changelog entries and version bumps.
- Keep PR descriptions specific about user-facing command changes and list the validation commands you ran.
