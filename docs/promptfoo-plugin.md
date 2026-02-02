# Promptfoo Target Discovery Plugin

An AI-powered agent that analyzes any target specification and generates working [promptfoo](https://promptfoo.dev) configurations for red-teaming.

## Installation

```bash
crab pf install
```

**Requirements:**
- Node.js 18+
- API key: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

## Usage

```bash
# From a file (any format)
crab pf --file target.txt

# From a curl command
crab pf "curl -X POST http://localhost:8080/chat -d '{\"message\":\"hi\"}'"

# Specify output directory
crab pf --file api-spec.json --output ./my-config

# Use Anthropic instead of OpenAI
crab pf --file target.txt --provider anthropic:claude-sonnet-4-20250514

# Verbose output (see agent reasoning)
crab pf --file target.txt --verbose
```

## Supported Input Formats

| Format | Example |
|--------|---------|
| **Curl** | `curl -X POST http://api.example.com/chat -H "Authorization: Bearer $TOKEN" -d '{"message":"hi"}'` |
| **OpenAPI/Swagger** | `openapi.json`, `swagger.yaml` |
| **Postman** | Exported collection JSON |
| **Burp Suite** | Exported XML |
| **Plain text** | Any description of the API |

## What It Does

1. **Parses** the input to understand the target
2. **Probes** the target to verify connectivity and discover request/response format
3. **Generates** a promptfoo YAML config (and custom provider.js if needed)
4. **Verifies** the config works with a mini red-team test

## Output

The agent creates:

```
output-dir/
├── promptfooconfig.yaml   # Main config file
├── provider.js            # Custom provider (if needed for WebSocket, polling, etc.)
└── package.json           # Dependencies (if provider.js uses external packages)
```

## Target Types

| Type | Provider |
|------|----------|
| Simple HTTP | Built-in `http` provider |
| HTTP with auth | Built-in `http` provider with env vars |
| Session-based | Built-in `http` provider with `sessionParser` |
| WebSocket | Custom `provider.js` |
| Async/Polling | Custom `provider.js` |
| GraphQL | Built-in `http` provider |

## Example

```bash
# Start your target
cd my-api && npm start

# Generate config
export OPENAI_API_KEY=sk-...
crab pf --file my-api-docs.txt --output ./redteam-config --verbose

# Run red-team
cd ./redteam-config
promptfoo eval
```

## Options

| Flag | Description |
|------|-------------|
| `--file`, `-f` | Input file path |
| `--output`, `-o` | Output directory (default: current dir) |
| `--provider` | LLM provider (default: `openai:gpt-4o`) |
| `--verbose`, `-v` | Show detailed agent output |
| `--max-turns` | Max agent iterations (default: 30) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `DISCOVERY_PROVIDER` | Default provider (e.g., `anthropic:claude-sonnet-4-20250514`) |

## Uninstall

```bash
crab pf uninstall
```

## How It Works

The plugin uses an LLM agent loop with tools:

1. **probe** - Send HTTP requests to test connectivity
2. **probe_ws** - Test WebSocket endpoints
3. **write_config** - Generate promptfoo YAML
4. **write_provider** - Generate custom JS/Python providers
5. **verify** - Run `promptfoo eval` to test
6. **done** - Signal completion

The agent decides which tools to use based on the target. For simple HTTP APIs, it uses the built-in provider. For complex targets (WebSocket, polling), it generates custom provider code.
