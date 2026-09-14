# Circuitry fork of OpenCode

Enterprise opencode distribution for Circuitry. The `release` branch tracks upstream `dev`
plus our patches; releases are built by the [`release` workflow](.github/workflows/release.yml)
(workflow_dispatch → version input) and published to
[GitHub Releases](https://github.com/Circuitry-ai/opencode/releases).

## Fork patches (vs upstream dev)

1. **Well-known precedence** — enterprise remote config outranks the user's personal global
   config (managed policy wins); the stored credential is sent as a Bearer token on the
   well-known fetch.
2. **Enterprise login/logout UI** — Settings → Providers "Company server" card and a status
   popover badge (sign in/out + signed-in email). Login drives the control-plane device flow
   and stores the credential through the existing `auth.set`/`auth.remove` API; the desktop
   main process installs the enterprise guard plugin after login.
   Default server: `https://opencode.circuitry.ai`.

## Install (team)

```bash
# CLI — download the binary for your platform from the latest release, e.g.
curl -fsSLO https://github.com/Circuitry-ai/opencode/releases/latest/download/opencode-darwin-arm64
chmod +x opencode-darwin-arm64 && sudo mv opencode-darwin-arm64 /usr/local/bin/opencode

# Desktop — grab the .dmg / .exe / .deb / .rpm from the same release page.
```

Builds are **unsigned** (macOS Gatekeeper: right-click → Open; Windows SmartScreen: More info
→ Run anyway). Auto-update points at this fork's releases, not anomalyco's.

After install, sign in once:

```bash
opencode auth login https://opencode.circuitry.ai
```

or use the desktop app's Company server sign-in.

## Making a release

1. Rebase `release` on upstream `dev` (and our patches), push to the fork.
2. Actions → release → Run workflow → pick a version (e.g. `1.18.31-cp.1`).
3. All artifacts (CLI binaries for darwin/linux/windows + desktop packages + auto-update
   metadata) attach to the new release automatically.
