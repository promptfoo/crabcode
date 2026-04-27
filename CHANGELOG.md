# Changelog

## Unreleased

## [0.14.1](https://github.com/promptfoo/crabcode/compare/v0.14.0...v0.14.1) (2026-04-27)

### Bug Fixes

- draw ui dependabot alerts ([#102](https://github.com/promptfoo/crabcode/issues/102)) ([a00a14b](https://github.com/promptfoo/crabcode/commit/a00a14b9946e7de3e346f50dab3c205ad082a9ad))

## [0.14.0](https://github.com/promptfoo/crabcode/compare/v0.13.1...v0.14.0) (2026-03-18)

### Changed

- Version alignment release: the Codex-default rollout introduced in `0.13.1` is being designated as `0.14.0`. There are no additional functional changes beyond `0.13.1`.

## [0.13.1](https://github.com/promptfoo/crabcode/compare/v0.13.0...v0.13.1) (2026-03-18)

### Features

- **compare:** add PDF file comparison support ([#63](https://github.com/promptfoo/crabcode/issues/63)) ([b27e82b](https://github.com/promptfoo/crabcode/commit/b27e82bc2865f283c809350666264fa3a545a91d))
- **compare:** auto-install poppler for PDF support ([#64](https://github.com/promptfoo/crabcode/issues/64)) ([3046322](https://github.com/promptfoo/crabcode/commit/3046322b0efc6a9c9305be86507e0ff8524262ea))
- add crab tax plugin ([#66](https://github.com/promptfoo/crabcode/issues/66)) ([da92a99](https://github.com/promptfoo/crabcode/commit/da92a99f9266624919f5d286f37e6937a2f1536a))
- default crabcode to codex ([#69](https://github.com/promptfoo/crabcode/issues/69)) ([3c4db33](https://github.com/promptfoo/crabcode/commit/3c4db3345ffc359bf35460b16915ca33510d842c))

### Bug Fixes

- **deps:** update dependency open to v11 ([4f717cb](https://github.com/promptfoo/crabcode/commit/4f717cbb69ce4783e86241a4b1a9a83687265d5f))

## [0.13.0] - 2026-03-11

### Added

- **Slack-powered promptfoo agent** (`crab pf serve`): non-technical team members can DM the Crab bot in Slack to run the target discovery agent
  - `crab pf serve --setup` — one-time config (Slack username, LLM provider)
  - `crab pf serve` — starts local polling daemon
  - Messages prefixed with `pf:` trigger the agent; file attachments supported
  - Results (`promptfooconfig.yaml`) posted back to the Slack thread
  - Each user runs their own daemon with their own API keys — no central server
- **Excalidraw plugin** (`crab draw`): collaborative whiteboarding with real-time collab
  - `crab draw new "name"` — create a new Excalidraw session
  - `crab draw open "name"` — open an existing session
  - `crab draw ls` — list active sessions
  - `crab draw delete "name"` — delete a session (with interactive disambiguation)
  - Real-time collaboration via Excalidraw's collab protocol
- **GPT-5 reasoning support** for `crab pf`: `--reasoning` flag with `low`/`medium`/`high` effort levels for GPT-5 and o-series models
- **Court/Review**: allow starting fresh when a review session already exists

### Changed

- **crab pf** defaults to `openai:gpt-5` with `reasoning: low` (was `openai:gpt-4o`)

### Fixed

- **crab pf**: test prompts now match provider input format
- **crab pf**: replaced broken verify step with smoke + session test, improved session handling

## [0.10.0] - 2026-02-15

### Added

- **WIP session persistence**: `crab wip save` and `crab wip restore` now save and restore Claude sessions across workspace boundaries
- **Court review improvements**: enhanced reviewer and judge prompts to catch silent data corruption
- **Release automation**: set up release-please for automated releases

### Fixed

- **Self-update**: bypass GitHub raw CDN cache so `crab update` always fetches the latest version
- **Messaging**: preserve float precision in listen polling timestamp to prevent missed messages

## [0.9.1] - 2026-02-13

### Added

- **P2P Messaging**: peer-to-peer messaging with self-hosted relay server
  - `crab msg send @user "message"` — send a message to a teammate
  - `crab msg listen` — listen for incoming messages
  - Self-hosted relay via `crab msg relay` (no third-party dependencies)
- **Text-to-speech**: received messages are spoken aloud using system TTS
- **Command aliases**: user-configurable command alias system
  - Define custom aliases in `~/.crabcode/aliases.yaml`
  - `crab alias add <name> <command>` — create aliases for frequently used commands
- **Linear tickets**: `crab ticket <ID>` opens a workspace from a Linear ticket
  - Auto-creates branch, sets up workspace, and links to ticket

### Fixed

- **env_sync**: use config `port_bases` instead of `.env` extraction to prevent compounding port offsets

## [0.8.0] - 2026-02-09

### Added

- **Court Review system**: thorough multi-agent PR review with judge pattern
  - `crab court <PR>` — spawns Judge (Claude) + Reviewer A (Claude teammate) + Reviewer B (Codex)
  - Judge orchestrates reviewers, verifies findings by tracing actual code
  - Resolves disagreements between reviewers, delivers verdict with zero false positives
  - Fun ASCII art intro explaining the 6-phase process
- **WIP restore improvements**: auto-opens workspace after restore
  - Detects if target workspace has uncommitted changes, offers to create new workspace
  - Saves original directory to properly detect "already in workspace"
- **Review output saving**: Claude instructed to save findings to `review-output.md`
  - `crab review ls` shows `[saved]` marker for reviews with output
  - `crab review show <PR>` displays saved review output

### Changed

- Simplified review system: removed `--with-codex` and `collab` modes in favor of `crab court`
- `crab review <PR>` now does quick single-agent review (fast, simple)
- `crab court <PR>` is the thorough option (judge + 2 reviewers)

### Fixed

- WIP restore now properly opens workspace when run from outside (was checking wrong directory)
- Review sessions now run from session directory so Claude can write output files

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

## [0.4.1] - 2026-02-02

### Added

- **Promptfoo plugin**: target discovery agent for automated LLM evaluation
  - `crab pf` commands for running promptfoo against workspace targets
  - Auto-detects dependencies and creates provider configs
- **CrabQL**: announcement banner and product section on landing page
- `crab destroy` command for tearing down workspaces and cleaning up worktrees
- `install_env` config option for injecting environment variables during workspace setup
- ASCII crab mascot throughout CLI output

### Fixed

- Speed up submodule init by copying from main repo instead of network fetch
- Copy `.mcp.json` instead of updating `settings.json` for MCP sync
- Promptfoo plugin: class-based providers, path handling, install from main branch

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
