# conquestoria

## Dual Release

Conquestoria has two supported local build targets:

- Web/PWA for GitHub Pages and iPad play.
- Personal unsigned macOS app built with Tauri.

Use the web build for GitHub Pages:

```bash
./scripts/run-with-mise.sh yarn build
```

Use the desktop frontend build for Tauri:

```bash
./scripts/run-with-mise.sh yarn build:tauri
```

Run the macOS app in development:

```bash
./scripts/run-with-mise.sh yarn tauri:dev
```

Build the personal macOS app and DMG:

```bash
./scripts/run-with-mise.sh yarn tauri:build:mac
./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts
```

The macOS build is unsigned and not notarized. It is intended for local personal use, not public distribution. Gameplay, save data, rendering, and UI behavior should remain shared between the web/PWA and macOS releases.
