# Crabcode

A lightning-fast tmux-based workspace manager for multi-repo development. Start a full dev environment in seconds.

## Quick Start

```bash
# 1. Install dependencies
brew install tmux yq    # macOS
# apt install tmux yq   # Linux

# 2. Install crabcode
curl -fsSL https://raw.githubusercontent.com/promptfoo/crabcode/main/install.sh | bash

# 3. Setup your config
crab init

# 4. Start your first workspace
crab ws 1
```

## What It Does

Run `crab ws 1` and get:
- Git worktree created from your main repo
- A dedicated branch (e.g., `workspace-1`)
- Isolated ports (e.g., API on 3201, app on 3001)
- .env files synced with correct ports
- Tmux window with terminal, server, and your preferred tools
- Shared volume for local experiments (`.local/`)

## Commands

Use `crab` (or `crabcode`) for all commands.

### Workspace Commands (`crab ws`)

```bash
crab ws                  # List all workspaces
crab ws new              # Create next available workspace
crab ws <N>              # Open/create workspace N
crab ws <N> restart      # Reset git + restart panes
crab ws <N> cleanup      # Kill window + reset to origin/main
crab ws <N> continue     # Resume with --continue flag
crab ws <N> --separate   # Open in new terminal window
```

### Shortcuts (auto-detect workspace)

```bash
crab <N>                 # Shorthand for: crab ws <N>
crab restart             # Restart current workspace
crab cleanup             # Cleanup current workspace
crab continue            # Continue current workspace
```

### WIP Commands (`crab wip`)

Save and restore work across workspace resets:

```bash
crab wip save            # Save current changes
crab wip save --restart  # Save then restart
crab wip ls              # List saved WIP states
crab wip --continue      # Restore most recent WIP
crab wip --resume        # Interactive WIP selection
crab wip delete <name>   # Delete a WIP state
```

### Toolkit Commands (`crab tk`)

Share files and folders:

```bash
crab tk share <path>                      # Upload → temp URL
crab tk share <path> --to ssh:user@host   # SSH transfer
crab tk share <path> --to slack:#channel  # Slack upload
crab tk share <path> --to email:addr      # Email attachment
crab tk share <path> --serve              # Local HTTP server + QR
crab tk share <path> --zip                # Just create archive
```

Options: `--include-git`, `--include-deps`, `--port=8080`

Auto-excludes: `node_modules`, `.git`, `vendor`, `venv`, `dist`, `build`...

### Other Commands

```bash
crab init                # Interactive config setup
crab config              # Show configuration
crab doctor              # Diagnose issues
crab ports               # Show port usage
crab shared              # Show shared volume info
crab cheat               # Show cheat sheet
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
    - path: app/.env
      port_var: VITE_API_BASE_URL

submodules:
  - path: my-submodule
    reset_to: origin/main
    install_command: pnpm install

cleanup:
  preserve_files: ".env"

# Shared volume for local experiments
shared_volume:
  enabled: true
  path: ~/.crabcode/shared
  link_as: .local

# Toolkit config (optional)
toolkit:
  slack:
    token: xoxb-your-token
    default_channel: "#dev"
```

See `examples/` for more configuration examples.

## Requirements

- bash
- tmux
- git
- [yq](https://github.com/mikefarah/yq) (YAML parsing)
- zip (for toolkit share)

```bash
# macOS
brew install tmux yq zip

# Ubuntu/Debian
apt install tmux yq zip
```

## Installation

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/promptfoo/crabcode/main/install.sh | bash
```

### Manual

```bash
git clone https://github.com/promptfoo/crabcode.git
cd crabcode
chmod +x src/crabcode
sudo ln -s $(pwd)/src/crabcode /usr/local/bin/crabcode
sudo ln -s $(pwd)/src/crabcode /usr/local/bin/crab
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
| `Ctrl+a n/p` | Next/previous window |
| `Ctrl+a d` | Detach |
| `Ctrl+a z` | Toggle zoom |
| `Option+arrows` | Navigate panes |

## New Computer Setup

1. **Install dependencies:**
   ```bash
   brew install tmux yq zip git   # macOS
   ```

2. **Install crabcode:**
   ```bash
   curl -fsSL https://raw.githubusercontent.com/promptfoo/crabcode/main/install.sh | bash
   ```

3. **Add to PATH** (if needed):
   ```bash
   echo 'export PATH="$PATH:$HOME/.local/bin"' >> ~/.zshrc
   source ~/.zshrc
   ```

4. **Clone your project:**
   ```bash
   git clone --recursive git@github.com:your-org/your-project.git ~/Dev/your-project
   ```

5. **Setup crabcode:**
   ```bash
   crab init
   # Follow prompts to configure your project
   ```

6. **Verify setup:**
   ```bash
   crab doctor
   ```

7. **Start working:**
   ```bash
   crab ws 1
   ```

## License

MIT
