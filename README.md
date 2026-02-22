# Crabcode 🦀

```
     \___/
    ( •_•)
   /)🦀(\
  <      >
```

A lightning-fast tmux-based workspace manager for multi-repo development. Manage multiple projects, start full dev environments in seconds.

## Quick Start

```bash
# 1. Install dependencies
brew install tmux yq    # macOS
# apt install tmux yq   # Linux

# 2. Install crabcode
curl -fsSL https://raw.githubusercontent.com/promptfoo/crabcode/main/install.sh | bash

# 3. Register your project (3 questions: repo path, alias, workspace dir)
cd ~/Dev/my-project
crab init              # → alias: myproj

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

Managing multiple projects? Each gets its own alias:

```bash
crab @pf ws 1          # promptfoo-cloud workspace
crab @cb ws 1          # crabcode workspace
crab projects          # list all registered projects
```

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

Save and restore work across workspace resets. WIPs are stored globally with rich metadata:

```bash
crab wip save            # Save current changes
crab wip save --restart  # Save then restart
crab wip ls              # List all WIPs globally with metadata
crab wip restore         # Interactive restore from all WIPs
crab wip restore <N>     # Restore WIP #N to original workspace
crab wip restore <N> --to <ws>  # Restore to different workspace
crab wip --continue      # Restore most recent WIP (current workspace)
crab wip delete <name>   # Delete a WIP state
```

The global WIP list shows:
- Summary (AI-generated from your changes)
- Workspace number, branch, file count
- Commits ahead of origin/main
- Timestamp

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

### Slack Commands (`crab slack`)

Quick messaging from terminal:

```bash
crab slack @user "message"       # Send DM
crab slack #channel "message"    # Post to channel
crab slack read @user            # View recent messages
crab slack chat @user            # Interactive terminal chat
crab slack sent                  # View your sent messages log
crab slack users                 # List workspace users
crab slack users mike            # Search by name
```

**Setup:** Add to your project config (`~/.crabcode/projects/<alias>.yaml`):

```yaml
slack:
  bot_token: xoxb-your-bot-token
  display_name: "Your Name"  # optional, defaults to git config
```

Messages appear with 🦀 icon and show `[Your Name] message` so recipients know who sent it.

### Multi-Project Commands

Manage multiple repos from a single crabcode install. Each project gets an alias.

```bash
crab init                # Register a new project (asks for alias)
crab init -t <template>  # Register with a template
crab @pf ws 1            # Open workspace 1 for project "pf"
crab @cb config          # Show config for project "cb"
crab ws 1                # Uses default project (or detects from cwd)
crab projects            # List all registered projects
crab projects rm <alias> # Remove a project registration
crab default pf          # Set default project
crab default             # Show current default
```

Project configs live in `~/.crabcode/projects/<alias>.yaml`. When you run commands from a workspace directory, crabcode auto-detects which project you're in.

### Config Commands

```bash
crab init                # Register a project (3 questions)
crab config scan         # Auto-detect .env files and ports
crab config              # Show current configuration
```

### Promptfoo Target Discovery (`crab pf`)

AI-powered agent that analyzes any target and generates working promptfoo configurations.

```bash
crab pf install                              # Install the plugin
crab pf --file target.txt                    # Analyze from file
crab pf "curl -X POST http://..."            # Analyze curl command
crab pf --file api.json --output ./config    # Specify output dir
crab pf --file spec.yaml --verbose           # Show detailed output
crab pf --reasoning high                     # Set reasoning effort (low/medium/high)
crab pf uninstall                            # Remove the plugin
```

**Supported formats:** curl commands, OpenAPI specs, Postman collections, Burp exports, plain text descriptions

**Requirements:** Node.js, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

The agent probes the target, figures out the protocol (HTTP, WebSocket, polling, etc.), generates the config, and verifies it works. Defaults to GPT-5 with `reasoning: low`.

#### Slack Integration (`crab pf serve`)

Let non-technical team members run the discovery agent by DM'ing the Crab bot in Slack. Each user runs their own local daemon with their own API keys.

```bash
crab pf serve --setup          # One-time: set Slack username + provider
crab pf serve                  # Start the polling daemon
crab pf serve -v               # Start with verbose output
```

Users DM the bot with `pf:` prefix to trigger the agent:
```
pf: My API is at http://localhost:8080/chat, POST with JSON { "message": "the prompt" }
```

File attachments (API specs, curl commands) are also supported. Results are posted back to the Slack thread as downloadable files.

### Excalidraw Whiteboard (`crab draw`)

Collaborative whiteboarding with real-time collab via Excalidraw.

```bash
crab draw install              # Install the plugin
crab draw new "architecture"   # Create a new session
crab draw open "architecture"  # Open an existing session
crab draw ls                   # List active sessions
crab draw delete "architecture" # Delete a session
crab draw uninstall            # Remove the plugin
```

Sessions support real-time collaboration — share the URL with teammates to draw together.

### PR Review Commands (`crab review`, `crab court`)

Two modes for reviewing pull requests:

```bash
# Quick single-agent review (fast)
crab review 3230                    # PR number
crab review promptfoo#456           # Submodule PR
crab review https://github.com/...  # Full URL

# Court review - thorough multi-agent review
crab court 3230                     # Judge + 2 reviewers
```

**Court Review** uses the judge pattern:
- **Judge (Claude)**: Orchestrates, verifies findings, delivers verdict
- **Reviewer A (Claude teammate)**: Independent code review
- **Reviewer B (Codex)**: Independent code review

The judge traces every finding to actual code, resolves disagreements, and produces a verdict with zero false positives.

```bash
crab review ls              # List review sessions
crab review show <PR>       # View saved review output
crab review resume <PR>     # Resume a review
crab review delete <PR>     # Delete a review session
```

### Session Management (`crab session`)

Track and resume Claude conversations across workspaces:

```bash
crab session start "feature-x"    # Start a named session
crab session resume "feature-x"   # Resume an existing session
crab session ls                   # List sessions with summaries
crab session delete "feature-x"   # Delete a session
```

### Linear Tickets (`crab ticket`)

Open a workspace directly from a Linear ticket:

```bash
crab ticket ENG-1234             # Creates branch, sets up workspace, links ticket
```

### P2P Messaging (`crab msg`)

Peer-to-peer messaging with self-hosted relay:

```bash
crab msg send @user "message"    # Send a message
crab msg listen                  # Listen for incoming messages (with TTS)
crab msg relay                   # Run your own relay server
```

### Command Aliases (`crab alias`)

Define custom shortcuts for frequently used commands:

```bash
crab alias add deploy "ws 1 restart"   # Create an alias
crab alias ls                          # List aliases
```

Aliases are stored in `~/.crabcode/aliases.yaml`.

### Other Commands

```bash
crab doctor              # Diagnose issues
crab ports               # Show port usage
crab shared              # Show shared volume info
crab cheat               # Show cheat sheet
crab update              # Self-update to latest version
```

## Setup Flow

### 1. Register your project

```bash
cd ~/Dev/my-project
crab init
```

You'll be asked 3 questions:
- **Main repo path** - where your project lives (defaults to current dir)
- **Project alias** - short name like `pf`, `cb` (defaults to repo dirname)
- **Workspace directory** - where to create worktrees (defaults to `<repo>-workspaces`)

This creates `~/.crabcode/projects/<alias>.yaml`.

### 2. Scan for ports

```bash
crab config scan
```

This scans your repo for `.env` and `.env.example` files, finds port variables, and offers to add them to your config.

### 3. Customize config

Edit `~/.crabcode/projects/<alias>.yaml` to set:
- **Layout panes** - your dev server command, main tool
- **Shared volume** - persistent storage across resets
- **Submodules** - if your project has git submodules

### 4. Add more projects

```bash
cd ~/Dev/another-project
crab init              # → alias: another
crab projects          # see both projects
```

## Configuration

```
~/.crabcode/
  config.yaml              # global prefs (default_project)
  projects/
    pf.yaml                # per-project config
    cb.yaml                # per-project config
  wip/
    pf/                    # per-project WIP isolation
    cb/
```

Per-project config (`~/.crabcode/projects/<alias>.yaml`):

```yaml
session_name: pf
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

**Core:**
- bash, tmux, git, [yq](https://github.com/mikefarah/yq), zip

**For plugins (`crab pf`, `crab draw`):**
- Node.js 20+
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (for `crab pf`)
- Slack bot token (for `crab pf serve`)

**For PR reviews (`crab review`, `crab court`):**
- [gh](https://cli.github.com/), [Claude Code](https://claude.ai/code)
- Optional: [Codex CLI](https://github.com/openai/codex) (for court review)

```bash
# macOS
brew install tmux yq zip gh
npm install -g @anthropic-ai/claude-code
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
   crab init              # 3 questions: repo path, alias, workspace dir
   crab config scan       # auto-detect .env files and ports
   ```

6. **Edit config for your project:**
   ```bash
   # Set your layout commands in ~/.crabcode/projects/<alias>.yaml
   # - server pane: your dev server (e.g., pnpm dev)
   # - main pane: your main tool (e.g., claude)
   ```

7. **Start working:**
   ```bash
   crab ws 1
   ```

## FAQ

### Why Git worktrees instead of branches?

With branches, switching context means stashing changes, checking out, reinstalling deps, and restarting servers. With worktrees, each workspace is a separate directory - switch instantly by changing tmux windows. No stashing, no reinstalling, no waiting.

### Can I use crabcode with multiple projects?

Yes! Each project gets an alias and its own config at `~/.crabcode/projects/<alias>.yaml`. Run `crab init` in each project directory. Use `crab @alias <cmd>` to target a specific project, or just run commands from a workspace directory — crabcode auto-detects which project you're in.

```bash
crab @pf ws 1          # explicit project
crab ws 1              # uses default or auto-detects from cwd
crab projects          # see all registered projects
crab default pf        # set default project
```

### How do I clean up old workspaces?

```bash
crab ws <N> cleanup    # Reset single workspace to origin/main
crab ws <N> destroy    # Completely remove workspace and worktree
```

### How is Crabcode different from Clawdbot?

Completely unrelated projects with similar names:

| | Crabcode | [Clawdbot](https://github.com/clawdbot/clawdbot) |
|---|---|---|
| **Purpose** | Workspace manager | Personal AI assistant |
| **Tech** | Bash, tmux, Git worktrees | Node.js, WebSockets |
| **Use case** | Parallel development environments | Messaging integrations |

## License

MIT
