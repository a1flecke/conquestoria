# Tauri macOS App Design

## Purpose

Conquestoria should support two releases from one shared game:

- a GitHub Pages/PWA release for iPad and browser play at `/conquestoria/`
- a personal macOS desktop release for the maintainer's laptop

The desktop release will use Tauri v2 to produce an unsigned macOS `.app` bundle and `.dmg`. The work must preserve the existing web/PWA behavior and avoid forking gameplay, renderer, storage format, or UI logic by distribution.

## Scope

In scope:

- Add Tauri v2 as a desktop packaging target.
- Produce an unsigned macOS `.app` and `.dmg`.
- Keep `yarn build` as the GitHub Pages/PWA production build.
- Add explicit desktop scripts named `tauri:dev`, `tauri:build`, and `tauri:build:mac` unless implementation discovers a Tauri CLI constraint that requires different names.
- Add native save import/export dialogs through a platform capability boundary.
- Add app polish: app name, window title, app icon, menu basics, sensible window defaults, and fullscreen-capable windowed launch.
- Add automated checks for shared save behavior, build-mode separation, and desktop bundle artifacts.
- Update `AGENTS.md` during implementation with dual-release architecture guidance.

Out of scope:

- Apple Developer signing.
- Notarization.
- Auto-updater support.
- File associations.
- Recent files menu.
- Native Rust rendering or audio.
- Gameplay changes that only apply to macOS.

## Distribution Architecture

The existing TypeScript game remains the shared core. Gameplay systems, Canvas rendering, DOM UI panels, save serialization, and storage data structures must remain distribution-neutral.

The web/PWA distribution keeps the current hosted assumptions:

- Vite base path `/conquestoria/`
- manifest link and PWA behavior
- service worker registration for `/conquestoria/sw.js`
- IndexedDB/localStorage save behavior

The macOS distribution is a Tauri wrapper around the same frontend. Tauri-specific behavior belongs in:

- `src-tauri/` for Rust shell, bundle config, menus, permissions, icon, and window defaults
- a narrow TypeScript platform capability layer for frontend calls that differ by distribution

Shared game modules must not directly import Tauri packages or branch on macOS/Tauri globals. If the UI needs a desktop-only capability, it should ask the platform layer whether that capability exists.

## Build And Packaging

Vite needs distribution-aware asset paths. The default web build must keep `base: '/conquestoria/'`. The Tauri build must use a relative base such as `./` so bundled JavaScript, CSS, and public assets resolve from inside the app bundle.

The desktop build must avoid registering the web service worker path inside the Tauri webview. Service worker behavior is a web/PWA concern.

Tauri config should:

- use the Vite dev server for desktop development
- use the Vite build output for bundling
- identify the product as `Conquestoria`
- create a resizable window titled `Conquestoria`
- launch windowed by default
- support native fullscreen
- set sensible initial and minimum dimensions for laptop play
- produce unsigned macOS `.app` and `.dmg` artifacts

The package scripts should make the distribution choice explicit. `yarn build` remains the web build. `yarn tauri:build:mac` should be the documented command for producing the personal macOS `.app` and `.dmg`.

## Native Features

### Save Import And Export

Add a TypeScript platform capability boundary for save files. The UI should call capability functions rather than browser or Tauri APIs directly.

Required capabilities:

- export a serialized save to a user-chosen destination
- import a user-chosen save file
- report cancellation without treating it as an error
- surface invalid save data as a clear error

The save data format must remain shared. A save exported from the macOS app should be compatible with the browser/PWA import path where browser APIs allow it, and browser-exported saves should be compatible with the macOS app.

The Tauri implementation should use Tauri dialog/filesystem APIs. The web implementation should preserve existing browser/PWA behavior or use browser-native file download/input behavior.

### App Polish

Desktop polish should live in the Tauri layer rather than gameplay code:

- app name and bundle identity
- app icon
- default window size and minimum size
- windowed launch with fullscreen available
- basic macOS menu behavior: About, Quit, Hide, and standard edit actions when available through Tauri's normal menu APIs

The app icon should be a simple Conquestoria-specific icon generated or drawn for this milestone and wired into the Tauri icon pipeline.

## Graphics And Audio

Graphics and audio stay shared through Canvas 2D, Web Audio, and HTML audio. Tauri on macOS should use the platform webview to run the same frontend.

The implementation should not move rendering or audio into Rust/native code. That would create a second engine path without a clear benefit for this milestone.

Desktop-specific graphics/audio work is limited to presentation and verification:

- verify the canvas renders crisply and nonblank at Retina/high-DPI sizes
- preserve performance by avoiding unnecessary desktop-only renderer changes
- keep audio unlock/playback behavior compatible with user interaction in the webview
- support fullscreen through the Tauri window layer

If Retina performance is poor, the implementation plan may introduce a measured pixel-ratio cap through a shared renderer setting. It should not tune rendering blindly before testing.

## Automated Verification

Automate the reliable checks and defer true OS-shell acceptance to the maintainer's personal laptop run.

Code-level tests should cover the platform/save boundary with mocked adapters:

- browser fallback behavior
- Tauri save export success
- Tauri save import success
- canceled native dialog
- invalid JSON or invalid save shape
- valid save round-trip through the existing save manager path

Build-mode tests or assertions should prove:

- web builds keep `/conquestoria/`
- desktop builds use relative asset paths
- service worker registration is skipped in Tauri

Web smoke automation should run against the Vite app and verify the shared frontend still renders and can start or load a game. The implementation plan should choose Playwright or another browser runner explicitly and justify any new dependency.

Desktop packaging verification should run the Tauri build path and assert that the expected unsigned macOS `.app` and `.dmg` artifacts exist.

Tauri WebDriver automation is not a required macOS gate because Tauri's official desktop WebDriver path does not support macOS WKWebView. Native dialog behavior, fullscreen behavior, icon appearance, Finder/DMG presentation, and audio after real user interaction can be accepted by the maintainer after installing and running the app.

## Repo Guidance

During implementation, update `AGENTS.md` with dual-release architecture rules:

- GitHub Pages/PWA and macOS/Tauri are distribution layers around one shared game.
- Shared gameplay, UI, rendering, and save format code must stay distribution-neutral.
- Release-specific behavior should enter shared code only through a small platform capability boundary.
- Shared modules should not directly import Tauri APIs.
- Shared modules should not branch on macOS/Tauri globals.
- Future native-only features should first be classified as platform-layer capabilities, shared capability interfaces, or deferred desktop-specific features.
- Desktop packaging/platform changes should verify the web `/conquestoria/` path still works.

This guidance should reduce the chance that future release-specific concerns leak into shared game code.

## Implementation Shape

The implementation plan should split the work into independently verifiable steps:

1. Add Tauri v2 scaffold and scripts without changing gameplay behavior.
2. Make Vite, index, and service-worker behavior distribution-aware.
3. Add the platform capability boundary and wire save import/export through it.
4. Add native Tauri save dialogs and filesystem permissions.
5. Add macOS app polish: icon, window defaults, menu basics, fullscreen-capable windowed launch, and `.app`/`.dmg` bundle config.
6. Add automated tests and artifact checks.
7. Document dual-release commands and limitations.

The highest-risk implementation failure is not Tauri setup itself. It is accidentally breaking GitHub Pages/PWA behavior or allowing desktop-specific assumptions to leak into shared game code. The implementation plan should therefore test build-mode separation and platform-boundary behavior early.
