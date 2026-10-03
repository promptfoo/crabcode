# Draw development checks

From `plugins/draw`, install the server dependencies and run its build, session, and parser tests:

```sh
npm ci
npm test
```

Build the UI from its own lockfile:

```sh
cd ui
npm ci
npm run build
cd ..
npm run test:integration
```

The integration tests connect the UI Socket.IO client to the Draw server over loopback WebSocket and polling transports. They verify room joins, scene updates, cursor updates, state requests, and disconnects.

The unit tests exercise parser compatibility, rejection of malformed binary headers, Nano ID's six-character session suffixes and Draw storage in temporary directories. They do not open a browser or sharing tunnel. CI runs these checks on Node.js 20, 22, and 24 alongside the repository's Bats and Shellcheck jobs.
