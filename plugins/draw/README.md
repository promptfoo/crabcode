# Draw development checks

From `plugins/draw`, install the server dependencies and run its build and session tests:

```sh
npm ci
npm test
```

Build the UI from its own lockfile:

```sh
cd ui
npm ci
npm run build
```

The tests exercise Nano ID's six-character session suffixes and Draw storage in temporary directories. They do not open a browser or sharing tunnel. CI runs these checks on Node.js 20, 22, and 24 alongside the repository's Bats and Shellcheck jobs.
