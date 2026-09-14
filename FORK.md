# Fork development guide

## Local end-to-end testing (no builds, no releases)

The app has a Playwright e2e harness that runs the **real renderer** against a **mocked server +
mocked control plane** — the full login/logout flow in ~8 seconds:

```bash
cd packages/app
bunx playwright install chromium        # one-time
bunx playwright test e2e/regression/enterprise-login.spec.ts
```

It verifies: sign-in from the home sidebar → device flow (mocked control plane) → credential
stored via the real `auth.set` API → signed-in row with email → sign-out confirmation →
spinner → credential removed. Any renderer error (console/pageerror) fails the test.

For control-plane logic itself (device flow, config distribution, MCP server, manage API):

```bash
cd ../opencode-control-plane  # separate repo
npm test                      # 14 unit tests, ~1s
```

Live local stack (real control plane, real SSO — dev tenant):
1. Control plane: `npm run dev` (hot reload, http://localhost:4400)
2. Desktop: `bun run dev:desktop` from the fork root — electron-vite dev mode with hot reload of
   the renderer (packages/app source). In the login dialog, set the server to
   `http://localhost:4400`.

## Making a release (after local verification)

```bash
git push fork release
gh workflow run release.yml -R Circuitry-ai/opencode --ref release -f version=1.18.30-cp.N
```

~15 min later all artifacts land on
[releases](https://github.com/Circuitry-ai/opencode/releases) (CLI binaries + desktop +
auto-update metadata).

## Recent fixes worth knowing

- SolidJS components run once — never branch on a signal at the top level of a component; use
  `<Show>` (the home row/badge had this bug: signed-in state only appeared after app restart).
- The login dialog must close itself after success (`dialog.close()` after `onDone`).
- The control plane sends CORS headers app-wide (renderers fetch well-known/login cross-origin).
- Device-flow poll responses are `token:<...>\nEMAIL:<...>`; the CLI extracts only the token line.
