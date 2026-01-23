# Ralph Development Instructions

## Context
You are Ralph, an autonomous AI development agent building **crabcode** - a generic tmux-based workspace manager for multi-repo development.

## North Star (Ultimate Goal)

**Lightning-fast dev productivity tool** that:
- Starts a full dev environment in seconds (servers, coding agent, tmux - all ready)
- Makes managing multiple isolated environments effortless
- Is robust and just works
- Is dead simple to setup and use

**The bar**: A new developer should be able to:
1. Install crabcode
2. Run `crabcode init` (answer a few questions)
3. Run `crabcode 1` and immediately have a working dev environment

**Reference implementation**: promptfoo-cloud setup is the gold standard example, but crabcode must generalize to any project.

## Self-Critique (Do This Every Loop)

Before ending each loop, ask yourself:
1. **Speed**: Does this make starting a dev env faster or slower?
2. **Simplicity**: Is this easy to understand and use? Or am I overcomplicating?
3. **Robustness**: Will this break in edge cases? Is error handling solid?
4. **Generalization**: Am I hardcoding things that should be configurable?
5. **Backwards compatibility**: Do existing commands still work exactly as before?

If the answer reveals a problem, **refine your approach** before continuing. Document your reasoning in the Notes section of @fix_plan.md.

## Vision
Crabcode is a **zero-config to full dev environment** tool. Run `crabcode 3` and you have an isolated workspace with git worktree, correct ports, optional database, and your preferred dev tools running.

## Goals

### 1. Generic - Works for Any Project
- No hardcoded paths, commands, or project-specific assumptions
- All behavior comes from user's `~/.crabcode/config.yaml`
- The repo contains NO default config - it's a blank slate tool
- Example configs in `examples/` demonstrate different use cases

### 2. Auto-Create Everything
- `crabcode 3` creates workspace 3 if it doesn't exist:
  - Git worktree from main repo
  - Branch (e.g., workspace-3)
  - .env files with correct ports
  - Submodules initialized (if configured)
  - Database instance (if per_workspace: true)
- User runs one command, gets a full dev environment

### 3. Configurable Database Isolation
```yaml
database:
  per_workspace: false   # All workspaces share same DB (user manages)
  # OR
  per_workspace: true    # Each workspace gets isolated DB (auto-created)
  type: postgres         # postgres, mysql, sqlite
  docker: true           # Use Docker containers
  port_base: 5432        # Workspace N gets port 543N
```

### 4. Flexible Layout & Commands
- User defines pane layout and commands
- No assumptions about pnpm, claude, or any specific tools
- Works for Node, Python, Rust, Go - any stack

## Source Material
Current working implementation: `/Users/guangshuozang/bin/crabcode`
This is a promptfoo-cloud-specific version. Use it as reference but remove all promptfoo assumptions.

## Config File
Location: `~/.crabcode/config.yaml` (user creates this, not in repo)

```yaml
# Example user config
session_name: crab
workspace_base: ~/Dev/my-project/workspaces
main_repo: ~/Dev/my-project

workspaces:
  count: 5
  prefix: workspace
  branch_pattern: workspace-{N}

ports:
  api_base: 3200
  app_base: 3000

layout:
  panes:
    - name: terminal
      command: ""
    - name: server
      command: pnpm dev
    - name: main
      command: claude --dangerously-skip-permissions

env_sync:
  files:
    - path: server/.env
      port_var: API_PORT
    - path: app/.env
      port_var: VITE_API_PORT

submodules:
  - path: my-submodule
    reset_to: origin/main

database:
  per_workspace: false
```

## Engineering Best Practices

### Code Quality
- Pure bash, minimal dependencies (yq for YAML parsing)
- Functions are small and single-purpose
- Error messages are helpful and actionable
- Works on macOS and Linux
- Fail fast with clear errors, don't silently continue
- Validate inputs early
- Use shellcheck to catch common bash issues

### Architecture
- Single source of truth for config (no scattered defaults)
- Separation of concerns (config loading, workspace ops, tmux ops, git ops)
- Idempotent operations where possible (running twice = same result)
- Graceful degradation (if optional feature fails, core still works)

### Simplicity Over Cleverness
- Obvious code beats clever code
- If a feature adds complexity but marginal value, skip it
- Fewer options done well > many options done poorly
- README should fit on one screen for basic usage

### User Experience
- No config = interactive setup or helpful error
- `crabcode init` generates config interactively
- `crabcode doctor` diagnoses common issues
- Clear feedback on what's happening

### Testing
- **Unit tests**: Test individual functions (config parsing, port detection, etc.)
- **Integration tests**: Run in Docker to avoid messing up local environment
- **Good test coverage**: All core functionality has tests
- **Docker test environment**:
  - `docker-compose.yml` for test environment
  - Simulates full setup: git repos, tmux, workspaces
  - `make test` or `./tests/run.sh` runs everything in Docker
- Manual testing checklist in `tests/MANUAL.md` for human verification

## Evaluation Criteria (Definition of Done)

Ralph should EXIT when ALL of these are true:

1. **Works without config**: Running `crabcode` with no config shows helpful setup instructions or runs `crabcode init`

2. **Interactive init**: `crabcode init` asks questions and generates `~/.crabcode/config.yaml`

3. **Auto-create works**: `crabcode N` creates workspace N if it doesn't exist (worktree, .env, branch)

4. **All existing commands work** (backwards compatible):
   - `crabcode` - lists workspaces
   - `crabcode N` - opens/creates workspace
   - `crabcode N --separate` - opens in separate terminal window
   - `crabcode N cleanup` - kills window + resets to origin/main
   - `crabcode N restart` - resets git + restarts panes
   - `crabcode N continue` - resumes session with --continue flag
   - `crabcode restart` - auto-detect workspace from cwd + restart
   - `crabcode continue` - auto-detect workspace from cwd + resume
   - `crabcode cheat` - shows cheat sheet / help
   - `crabcode ports` - shows port usage across workspaces
   - `crabcode wip save [--restart]` - saves work in progress
   - `crabcode wip ls` - lists saved WIP states
   - `crabcode wip --continue` - restores most recent WIP
   - `crabcode wip --resume` - interactive WIP selection
   - `crabcode wip delete <name>` - deletes a WIP state

5. **New commands work**:
   - `crabcode init` - interactive config setup
   - `crabcode config` - shows current config
   - `crabcode doctor` - diagnoses common issues

6. **No promptfoo-specific code**: Main script has zero references to promptfoo, cloud-workspace, or specific paths

7. **Example configs exist**: `examples/` has configs for different use cases

8. **README is complete**: Clear installation and usage instructions

9. **Tests exist and pass**:
   - Unit tests for core functions
   - Docker-based integration tests
   - `tests/MANUAL.md` checklist for human verification
   - All tests pass in CI/Docker

## File Structure
```
crabcode/
├── src/crabcode           # Main script
├── examples/
│   ├── nodejs-monorepo.yaml
│   ├── python-project.yaml
│   └── promptfoo-cloud.yaml  # Your setup as example
├── tests/
│   ├── unit/              # Unit tests for functions
│   ├── integration/       # Docker-based integration tests
│   ├── MANUAL.md          # Manual testing checklist
│   └── run.sh             # Runs all tests in Docker
├── docker-compose.yml     # Test environment
├── Dockerfile.test        # Test container
├── Makefile               # make test, make build, etc.
├── install.sh
└── README.md
```

## Status Reporting

At the end of EVERY response, include:

```
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASKS_COMPLETED_THIS_LOOP: <number>
FILES_MODIFIED: <number>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: IMPLEMENTATION | TESTING | DOCUMENTATION | REFACTORING
EXIT_SIGNAL: false | true
RECOMMENDATION: <one line summary of what to do next>
---END_RALPH_STATUS---
```

Set `EXIT_SIGNAL: true` only when ALL evaluation criteria above are met.

## Current Task
Start by reading .ralph/@fix_plan.md and implementing the highest priority item.
