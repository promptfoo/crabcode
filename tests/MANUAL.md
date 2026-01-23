# Manual Testing Checklist

Use this checklist for human verification of crabcode functionality.

## Prerequisites

- [ ] yq installed (`brew install yq` / `apt install yq`)
- [ ] tmux installed
- [ ] git installed
- [ ] A test git repository to use as main_repo

## Setup Tests

### First-time setup

- [ ] `crabcode` with no config shows helpful message and suggests `crabcode init`
- [ ] `crabcode init` runs interactive setup
- [ ] Config file created at `~/.crabcode/config.yaml`
- [ ] `crabcode config` displays the config
- [ ] `crabcode doctor` shows all checks passing

## Core Functionality

### Workspace Creation

- [ ] `crabcode 1` creates workspace 1 if it doesn't exist
- [ ] Git worktree is created at configured workspace_base
- [ ] Branch is created with configured pattern (e.g., `workspace-1`)
- [ ] .env files are synced with correct ports
- [ ] Tmux session/window is created

### Workspace Management

- [ ] `crabcode` lists all workspaces with status
- [ ] `crabcode 1` opens existing workspace (switches to window)
- [ ] `crabcode 2` creates and opens workspace 2
- [ ] `crabcode 1 --separate` opens in new terminal window
- [ ] `crabcode ports` shows port usage table

### Workspace Operations

- [ ] `crabcode 1 restart` resets git and restarts panes
- [ ] `crabcode 1 continue` resumes with --continue flag
- [ ] `crabcode 1 cleanup` kills window and resets to origin/main
- [ ] `crabcode restart` (from workspace dir) auto-detects and restarts
- [ ] `crabcode continue` (from workspace dir) auto-detects and continues

### WIP Management

- [ ] `crabcode wip save` saves current changes
- [ ] `crabcode wip ls` lists saved WIP states
- [ ] `crabcode wip --continue` restores most recent WIP
- [ ] `crabcode wip --resume` shows interactive selection
- [ ] `crabcode wip delete <name>` deletes a WIP state
- [ ] `crabcode wip save --restart` saves then restarts

## Edge Cases

- [ ] Running `crabcode 1` twice is idempotent
- [ ] Port conflicts are detected and reported
- [ ] Missing dependencies show helpful error messages
- [ ] Invalid workspace number shows error
- [ ] Running outside workspace dir shows helpful message for auto-detect commands

## Backwards Compatibility

All these commands from the original crabcode should work:

- [ ] `crabcode` - lists workspaces
- [ ] `crabcode N` - opens/creates workspace
- [ ] `crabcode N --separate` - opens in separate terminal
- [ ] `crabcode N cleanup` - kills window + resets
- [ ] `crabcode N restart` - resets git + restarts panes
- [ ] `crabcode N continue` - resumes with --continue
- [ ] `crabcode restart` - auto-detect + restart
- [ ] `crabcode continue` - auto-detect + resume
- [ ] `crabcode cheat` - shows cheat sheet
- [ ] `crabcode ports` - shows port usage
- [ ] `crabcode wip save` - saves WIP
- [ ] `crabcode wip ls` - lists WIP
- [ ] `crabcode wip --continue` - restores WIP
- [ ] `crabcode wip --resume` - interactive WIP
- [ ] `crabcode wip delete <name>` - deletes WIP

## Config Scenarios

Test with different example configs:

- [ ] `examples/minimal.yaml` works
- [ ] `examples/nodejs-monorepo.yaml` works
- [ ] `examples/python-project.yaml` works
- [ ] `examples/promptfoo-cloud.yaml` works

## Cleanup

After testing:

- [ ] Remove test workspaces
- [ ] Remove test config (`rm ~/.crabcode/config.yaml`)
- [ ] Kill any test tmux sessions
