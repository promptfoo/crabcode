# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately through [GitHub Security
Advisories](https://github.com/promptfoo/crabcode/security/advisories/new).
Avoid public issues or pull requests containing working exploits, credentials,
private documents, or other sensitive data.

## Scope and sensitive assets

Crabcode is a local developer-workspace manager with optional collaboration,
messaging, AI-agent, target-discovery, and tax-document plugins. Its security
boundary includes `src/crabcode`, installation scripts, workspace management,
and production code under `plugins/`.

Protect the developer's source trees and Git history, SSH keys, API keys, Slack
tokens, `.env` files, `~/.crabcode` configuration, saved sessions, tax documents,
and generated reports. A component running on a developer's machine must not
expose these assets simply because it can access them locally.

## Threat model and trust boundaries

- The authenticated local operator is trusted to choose projects, start tools,
  configure integrations, and intentionally run their own commands.
- Repository contents, Git metadata, branch names, filenames, project
  configuration, imported documents, plugin inputs, API responses, Slack
  messages, shared links, HTTP requests, and WebSocket payloads can be
  attacker-controlled. Parse them as data rather than treating them as trusted
  shell commands, filesystem paths, agent instructions, or authorization.
- Draw-plugin HTTP and Socket.IO servers may be exposed outside the developer's
  machine through collaboration tunnels. Shared-session participants and
  arbitrary remote requests must not receive access beyond the intended drawing
  session.
- Messaging integrations must distinguish the configured, authorized operator
  from other workspace users, bot messages, attachments, and message metadata.
- AI providers, agent-generated output, remote targets, and imported content
  cross an external trust boundary. Model output is not authorization to read
  unrelated files, disclose secrets, or expand an operator-approved action.
- Tax inputs, extracted records, taxpayer profiles, and generated filings are
  sensitive personal and financial data, even when stored on a local machine.

## Required security properties

- Network handlers must never expose arbitrary local files. Paths supplied by
  requests, query parameters, uploaded content, session identifiers, or socket
  messages must resolve inside the explicitly intended UI, session, or output
  directory; reject traversal, absolute-path escapes, and unsafe symlinks.
- Remote collaboration must not disclose another session's drawings, workspace
  contents, credentials, or local configuration, and must not permit unexpected
  filesystem writes or command execution.
- Untrusted repository data, filenames, branch names, YAML values, and plugin
  input must not become shell syntax or executable commands through `eval`,
  interpolation, command substitution, or unsafe process invocation.
- Workspace creation, cleanup, WIP restoration, file sharing, archive handling,
  and plugin installation must stay inside their authorized paths and must not
  overwrite, delete, upload, or expose unrelated files.
- Secrets and personal data must not appear in logs, error messages, share
  links, analytics, Slack messages, generated agent context, or network requests
  unless the operator explicitly requested that disclosure.
- Slack-triggered operations must enforce sender authorization before reading
  attachments, invoking tools or agents, changing files, or returning results.
- URL-based probing is an intentional product feature only for targets selected
  by the authorized operator. Untrusted content must not silently redirect
  privileged requests or forward credentials to an attacker-controlled target.
- Parsers and network endpoints must enforce reasonable input size, resource,
  and timeout limits when abuse can affect an exposed service or local system.

## Reportability and severity

Report vulnerabilities when a realistic attacker can cross one of these trust
boundaries and reach a meaningful security impact. Relevant examples include
arbitrary file disclosure from a collaboration endpoint, unauthorized command
execution from repository or integration data, secret exfiltration, destructive
workspace-path traversal, cross-session access, and exposure of taxpayer data.

Treat remotely reachable access to SSH keys, API tokens, `.env` files, source
code, tax documents, or the developer's shell as high-impact. Account for actual
tunnel exposure, attacker access, existing authorization, and practical
preconditions instead of assuming every local-only issue is internet-facing.

An authenticated developer deliberately running their own command, scanning a
target they selected, or opening their own local file is not by itself a
security vulnerability. Documentation examples and test fixtures are in scope
when they alter production behavior, CI trust boundaries, distributed artifacts,
or demonstrate an actual exposure; otherwise, evaluate the production path.
