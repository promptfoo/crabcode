# Changelog

## [0.7.0] - 2026-02-08

### Added
- **Session management**: track and resume Claude conversations
  - `crab session ls` — list sessions with inline summaries
  - `crab session start "name"` — start new named session
  - `crab session resume "name"` — resume existing session
  - `crab session delete "name"` — delete a session
  - Sessions stored in `~/.crabcode/sessions/<project>/`

- **PR Review system**: structured PR review with Claude agent teams
  - `crab review <PR>` — quick review (number, repo#number, or full URL)
  - `crab review new` — interactive mode for multiple PRs + custom context
  - `crab review ls` — list review sessions
  - `crab review resume <PR>` — resume a review
  - PR context auto-fetched via gh CLI

### Changed
- `crab restart` now fully recreates window layout (fixes missing panes after close)
- Team mode always enabled (instructions in .claude/CLAUDE.md)
- Removed `--team` flag (no longer needed)

## [0.6.0] - 2026-02-05

### Added
- **Agent Teams integration**: team mode always enabled in workspaces
  - Team instructions auto-added to `.claude/CLAUDE.md`
  - Claude spawns agent teammates when tasks warrant parallel work
- Environment setup for agent teams feature (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`)
- Tmux teammate mode for split-pane agent display

## [0.5.0] - 2026-02-04

### Added
- **Multi-project support**: manage multiple repos from a single crabcode install
  - `crab @alias <cmd>` — run any command against a specific project
  - `crab projects` — list all registered projects with tmux status
  - `crab default [alias]` — show or set the default project
  - `crab init` now asks for a project alias and writes to `~/.crabcode/projects/<alias>.yaml`
- **cwd-based project detection**: commands like `crab restart` auto-detect which project you're in based on your current directory
- **Per-project WIP isolation**: WIP states stored under `~/.crabcode/wip/<alias>/`
- **Legacy migration**: one-time prompt to migrate `~/.crabcode/config.yaml` to the new per-project format with automatic tmux session rename
- Project context shown in `config`, `doctor`, `status`, and `help` output

### Changed
- Config structure: project configs now live in `~/.crabcode/projects/<alias>.yaml`
- Global config (`~/.crabcode/config.yaml`) now only stores `default_project`
- Templates use `ALIAS_PLACEHOLDER` for `session_name` (was hardcoded `crab`)
- Tmux session names derived from project alias (e.g., `pf`, `cb`) instead of generic `crab`
- `apply_template()` accepts a 4th `alias` parameter

### Fixed
- `crab restart` from a workspace dir now correctly detects the owning project
- Legacy config migration no longer clobbers global config on subsequent `crab init`

## [0.4.0] - 2026-01-18

### Added
- Template system for project-type-aware setup (`crab init -t promptfoo-cloud`)
- Auto-detection of project type from repo contents
- `crab init --list-templates` to show available templates
- `.crabcode.yaml` in-repo config import during init

## [0.3.0] - 2026-01-15

### Added
- Workspace handoff (`crab handoff`, `crab receive`)
- Time travel / snapshots (`crab rewind`, `crab snapshot`)
- Live pairing sessions (`crab pair`, `crab join`, `crab spectate`)
- Mobile companion (`crab mobile serve`, push notifications)
- Slack integration (`crab slack @user "msg"`)
- Toolkit file sharing (`crab tk share`)
- Mood system and status dashboard (`crab mood`, `crab status`)

## [0.2.0] - 2026-01-10

### Added
- WIP save/restore system with global index
- Port spacing and env_sync with refs
- MCP server sync from main repo
- Shared volume support
- Config scan (`crab config scan`)
- Doctor diagnostics (`crab doctor`)

## [0.1.0] - 2026-01-05

### Added
- Initial release
- Tmux-based workspace management with git worktrees
- Configurable layouts with named panes
- Port management and .env file sync
- `crab ws`, `crab restart`, `crab cleanup`, `crab destroy`
