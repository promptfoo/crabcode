# Crabcode

A lightning-fast tmux-based workspace manager for multi-repo development. Start a full dev environment in seconds.

## Quick Start

```bash
# 1. Install dependencies
brew install tmux yq    # macOS
# apt install tmux yq   # Linux

# 2. Install crabcode
curl -fsSL https://raw.githubusercontent.com/promptfoo/crabcode/main/install.sh | bash

# 3. Setup (2 questions: repo path + workspace dir)
cd ~/Dev/my-project
crab init

# 4. Auto-detect .env files and ports
crab config scan

# 5. Start your first workspace
crab ws 1
```

## What It Does

Run `crab ws 1` and get:
- Git worktree created from your main repo
- A dedicated branch (e.g., `workspace-1`)
- Isolated ports per workspace (auto-detected from .env files)
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

### Config Commands

```bash
crab init                # Minimal setup (2 questions)
crab config scan         # Auto-detect .env files and ports
crab config              # Show current configuration
```

### Other Commands

```bash
crab doctor              # Diagnose issues
crab ports               # Show port usage
crab shared              # Show shared volume info
crab cheat               # Show cheat sheet
```

## Setup Flow

### 1. Initialize (minimal)

```bash
cd ~/Dev/my-project
crab init
```

You'll be asked 2 questions:
- **Main repo path** - where your project lives (defaults to current dir)
- **Workspace directory** - where to create worktrees (defaults to `<repo>-workspaces`)

### 2. Scan for ports

```bash
crab config scan
```

This scans your repo for `.env` and `.env.example` files, finds port variables, and offers to add them to your config.

### 3. Customize config

Edit `~/.crabcode/config.yaml` to set:
- **Layout panes** - your dev server command, main tool
- **Shared volume** - persistent storage across resets
- **Submodules** - if your project has git submodules

## Configuration

Config file: `~/.crabcode/config.yaml`

```yaml
session_name: crab
workspace_base: ~/Dev/my-project-workspaces
main_repo: ~/Dev/my-project

workspaces:
  prefix: ws
  branch_pattern: workspace-{N}

# Auto-detected by 'crab config scan'
env_sync:
  files:
    - path: server/.env
      ports: [API_PORT, ADMIN_PORT]
    - path: app/.env
      ports: [VITE_PORT]

layout:
  panes:
    - name: terminal
      command: ""
    - name: server
      command: pnpm dev
    - name: main
      command: claude

# Optional: persistent storage across resets
shared_volume:
  enabled: true
  path: ~/.crabcode/shared
  link_as: .local

# Optional: git submodule handling
submodules:
  - path: my-submodule
    reset_to: origin/main
    install_command: pnpm install
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

### Reinstall / Update

```bash
# If installed via one-liner, just run it again:
curl -fsSL https://raw.githubusercontent.com/promptfoo/crabcode/main/install.sh | bash

# If installed manually from git:
cd /path/to/crabcode
git pull origin main
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
   cd ~/Dev/your-project
   crab init              # 2 questions: repo path + workspace dir
   crab config scan       # auto-detect .env files and ports
   ```

6. **Edit config for your project:**
   ```bash
   # Set your layout commands in ~/.crabcode/config.yaml
   # - server pane: your dev server (e.g., pnpm dev)
   # - main pane: your main tool (e.g., claude)
   ```

7. **Start working:**
   ```bash
   crab ws 1
   ```

## License

MIT
