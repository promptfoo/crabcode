# Crabcode

A generic tmux-based workspace manager for multi-repo development. Lightning-fast dev productivity tool that starts a full dev environment in seconds.

## Quick Start

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/your-org/crabcode/main/install.sh | bash

# Setup
crabcode init

# Start workspace 1
crabcode 1
```

## What It Does

Run `crabcode 1` and get:
- Git worktree created from your main repo
- A dedicated branch (e.g., `workspace-1`)
- Isolated ports (e.g., API on 3201, app on 3001)
- .env files synced with correct ports
- Tmux window with terminal, server, and your preferred dev tools

## Commands

```bash
crabcode              # List all workspaces
crabcode <N>          # Open/create workspace N
crabcode <N> --separate  # Open in separate terminal window
crabcode <N> cleanup  # Kill window + reset to origin/main
crabcode <N> restart  # Reset git + restart panes in place
crabcode <N> continue # Resume session with --continue flag
crabcode restart      # Auto-detect workspace + restart
crabcode continue     # Auto-detect + resume session
crabcode init         # Interactive config setup
crabcode config       # Show current configuration
crabcode doctor       # Diagnose common issues
crabcode cheat        # Show cheat sheet
crabcode ports        # Show port usage across workspaces
```

### WIP (Work In Progress)

Save and restore your work across workspace resets:

```bash
crabcode wip save           # Save current changes
crabcode wip save --restart # Save changes then restart
crabcode wip ls             # List saved WIP states
crabcode wip --continue     # Restore most recent WIP
crabcode wip --resume       # Interactive WIP selection
crabcode wip delete <name>  # Delete a WIP state
```

## Configuration

Config file: `~/.crabcode/config.yaml`

```yaml
session_name: crab
workspace_base: ~/Dev/my-project/workspaces
main_repo: ~/Dev/my-project

workspaces:
  count: 5
  prefix: workspace
  branch_pattern: workspace-{N}

ports:
  api_base: 3200    # ws1=3201, ws2=3202
  app_base: 3000    # ws1=3001, ws2=3002

install_command: pnpm install

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

submodules:
  - path: my-submodule
    reset_to: origin/main
```

See `examples/` for more configuration examples.

## Requirements

- bash
- tmux
- git
- [yq](https://github.com/mikefarah/yq) (for YAML parsing)

Install yq:
```bash
brew install yq       # macOS
apt install yq        # Ubuntu/Debian
```

## Installation

### Using curl

```bash
curl -fsSL https://raw.githubusercontent.com/your-org/crabcode/main/install.sh | bash
```

### Manual

```bash
git clone https://github.com/your-org/crabcode.git
cd crabcode
chmod +x src/crabcode
ln -s $(pwd)/src/crabcode /usr/local/bin/crabcode
```

## Tmux Layout

```
┌─────────────────────────┬─────────────────────────┐
│      terminal           │                         │
│      (shell)            │        main             │
├─────────────────────────┤   (claude/editor)       │
│      server             │                         │
│      (pnpm dev)         │                         │
└─────────────────────────┴─────────────────────────┘
```

## Tmux Keybindings

With prefix `Ctrl+a`:

| Keys | Action |
|------|--------|
| `Option+1,2,3...` | Switch to workspace |
| `Ctrl+a n` | Next window |
| `Ctrl+a p` | Previous window |
| `Ctrl+a d` | Detach |
| `Ctrl+a z` | Toggle zoom |
| `Option+arrows` | Navigate panes |

## License

MIT
