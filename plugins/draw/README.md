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
npx tsc --noEmit
npm run build
cd ..
npm run test:integration
```

The integration tests connect the UI Socket.IO client to the Draw server over loopback WebSocket and polling transports. They verify room joins, scene updates, cursor updates, state requests, and disconnects. They also check that the built UI serves its Excalidraw stylesheet.

The unit tests exercise parser compatibility, rejection of malformed binary headers, Nano ID's six-character session suffixes and Draw storage in temporary directories. They do not open a browser or sharing tunnel. CI runs these checks on Node.js 20, 22, and 24 alongside the repository's Bats and Shellcheck jobs.

The UI overrides vulnerable versions pinned by Excalidraw and its Mermaid converter: Nano ID, lodash-es, and Sass. The Sass update also removes the old Chokidar/Braces dependency chain. Keep these overrides until the upstream dependency ranges include patched releases, and preserve Node.js 20 compatibility when updating them. Browser checks should cover drawing and Mermaid-to-Excalidraw conversion as well as the build.
