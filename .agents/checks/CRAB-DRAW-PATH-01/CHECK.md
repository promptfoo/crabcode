---
schema_version: 1
name: CRAB-DRAW-PATH-01
revision: "2026-09-04"
description: Keep Draw HTTP asset requests inside the bundled UI directory.
applicability:
  when: A pull request changes how the Draw HTTP server maps request paths to local UI files.
  paths:
    - /plugins/draw/src/server/http.ts
hints:
  keywords:
    - path traversal
    - static assets
    - collaboration tunnel
---

# Draw static asset containment

Treat every HTTP URL path as attacker-controlled. Decode and normalize it before
checking containment, and reject absolute paths, traversal segments, unsafe
symlinks, and sibling paths that only share the UI directory's string prefix.

Before `existsSync`, `statSync`, `readFileSync`, or `createReadStream`, verify that
the final target stays inside `plugins/draw/ui/dist`. Apply the check to the path
that the filesystem will actually open; a canonical `path.relative` boundary is
preferred over a raw string-prefix comparison.

The server can be shared through a collaboration tunnel. Report a finding when a
remote request can read a file outside the intended UI directory. Use the
repository `SECURITY.md` threat model and account for the real tunnel precondition.
