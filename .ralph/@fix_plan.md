# Fix Plan

## In Progress


## Recently Completed
- [x] Add shared volume feature - symlink `.local` in each workspace to central shared directory (24/24 e2e tests pass)
- [x] Run tests and verify all functionality works (10/10 tests pass)

## Completed
- [x] Build crabcode - generic tmux workspace manager
  - [x] Created src/crabcode (1500+ lines) - full featured script
  - [x] Config-driven with yq for YAML parsing
  - [x] All original commands implemented (list, open, cleanup, restart, continue, wip)
  - [x] New commands: init, config, doctor
  - [x] No promptfoo-specific code (verified with grep)
- [x] Created example configs (4 files)
  - [x] examples/nodejs-monorepo.yaml
  - [x] examples/python-project.yaml
  - [x] examples/promptfoo-cloud.yaml
  - [x] examples/minimal.yaml
- [x] Created README.md with installation and usage
- [x] Created install.sh
- [x] Created tests/run.sh (unit tests)
- [x] Created tests/MANUAL.md (manual testing checklist)
- [x] Created Dockerfile.test
- [x] Created Makefile

## Notes

### Self-Critique (Loop 1-3)

1. **Speed**: Config-driven approach means one-time setup, then fast `crabcode N` commands. Good.

2. **Simplicity**:
   - `crabcode init` walks through setup interactively
   - `crabcode doctor` helps diagnose issues
   - Cheat sheet available via `crabcode cheat`

3. **Robustness**:
   - Validates config on load
   - Checks for required tools (yq, tmux, git)
   - Graceful error messages

4. **Generalization**:
   - All paths, commands, ports come from config
   - No hardcoded project-specific values
   - Works for any language/stack

5. **Backwards Compatibility**:
   - All original commands preserved with same syntax
   - Added new commands (init, config, doctor) that don't conflict

### Architecture Decisions

- Single script in src/crabcode for simplicity
- Uses yq for YAML parsing (only external dependency beyond bash/git/tmux)
- Config at ~/.crabcode/config.yaml keeps it out of repos
- WIP storage at ~/.crabcode/wip/ for persistence

### Remaining Work

- Need bash commands approved to run tests
- Tests framework ready but not yet executed
