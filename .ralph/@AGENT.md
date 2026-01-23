# Crabcode - Agent Build Instructions

## What is Crabcode?
A tmux-based workspace manager for multi-repo development. Currently used for promptfoo-cloud development with 5 isolated git worktrees.

## Project Structure
```
crabcode-what-crab/
├── .ralph/              # Ralph configuration
│   ├── PROMPT.md        # Development instructions
│   ├── @fix_plan.md     # Task list
│   ├── @AGENT.md        # This file
│   └── specs/           # Detailed specifications
├── src/
│   └── crabcode         # Main script (bash)
├── tests/               # Test scripts
├── examples/            # Example configurations
└── README.md
```

## Prerequisites
- bash 4.0+
- tmux
- git
- yq (for YAML parsing) - install with `brew install yq`

## Project Setup
```bash
# Copy source to work on
cp ~/bin/crabcode src/crabcode
chmod +x src/crabcode

# Install yq for YAML parsing
brew install yq
```

## Development Commands

### Test the script locally
```bash
# Test from this project directory
./src/crabcode

# Or add to PATH temporarily
export PATH="$PWD/src:$PATH"
crabcode
```

### Run tests
```bash
# Run all tests
./tests/run_tests.sh

# Run specific test
./tests/test_config.sh
```

## Key Files

### Source crabcode location
`/Users/guangshuozang/bin/crabcode` - The current working implementation (copy from here)

### Config file location (target)
`~/.crabcode/config.yaml` - Global configuration

### Workspace location (current)
`~/Dev-Promptfoo/subfolder/cloud-workspace-{1-5}`

## Testing Workflow
1. Make changes to `src/crabcode`
2. Test against real workspaces: `./src/crabcode 1`
3. Verify WIP commands work: `./src/crabcode wip save`
4. Check port management: `./src/crabcode ports`
5. Verify cheat sheet: `./src/crabcode cheat`

## Key Learnings
- Script is pure bash - keep it that way
- Use yq for YAML parsing (cross-platform, simple)
- Config file is optional - must work without it
- All paths should expand ~ properly
- Backwards compatibility is critical

## Feature Development Quality Standards

### Testing Requirements
- Test against actual promptfoo-cloud workspaces
- Verify all commands in the testing checklist work
- No regressions in existing functionality

### Git Workflow Requirements
1. **Commit with Clear Messages**:
   ```bash
   git add .
   git commit -m "feat(config): add YAML config file support"
   ```

2. **Branch Naming**: `feature/<name>`, `fix/<name>`

3. **Ralph Integration**:
   - Update .ralph/@fix_plan.md with new tasks before starting work
   - Mark items complete upon completion

### Feature Completion Checklist
Before marking ANY feature as complete, verify:

- [ ] All existing crabcode commands still work
- [ ] `crabcode` - lists workspaces
- [ ] `crabcode 1` - opens workspace 1
- [ ] `crabcode 1 restart` - resets and restarts
- [ ] `crabcode wip save` - saves work in progress
- [ ] `crabcode ports` - shows port usage
- [ ] Changes committed with descriptive messages
- [ ] .ralph/@fix_plan.md task marked as complete
