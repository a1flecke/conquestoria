# Conditional macOS CI Design

**Status:** Approved design pending written-spec review

## Goal

Keep GitHub-hosted macOS packaging as a required merge-gate check when a
change can affect the packaged desktop application, while avoiding that costly
job for unrelated work.

## Decision

`desktop-change-check` will determine whether `tauri-macos-build` applies.
The job remains in `merge-gate` in every run: it must succeed when applicable
and must be skipped when not applicable. `tauri-frontend-build` remains
required for every pull request and push to `main`.

The same changed-path policy applies to both events:

- Pull requests compare the pull request base SHA to the checked-out SHA.
- Pushes to `main` compare the event's `before` SHA to the checked-out SHA.
- A manual `workflow_dispatch` run always requests the macOS package build,
  providing an explicit release-validation escape hatch when no changed-file
  range exists.

The workflow must declare `workflow_dispatch` so that escape hatch is actually
available from GitHub Actions.

Every normally required child job must also accept `workflow_dispatch`, so a
manual run on a selected non-`main` ref is a valid full merge-gate run rather
than a guaranteed failure from skipped required children. If a push event has
an all-zero `before` SHA, the change check must conservatively require macOS
packaging instead of attempting an invalid Git diff.

## Desktop-risk inputs

The macOS package build runs when at least one changed path is one of:

- `src-tauri/**` — Tauri configuration, Rust code, entitlements, bundle
  metadata, and desktop assets.
- `src/platform/**` — the shared browser-versus-Tauri capability boundary.
- `public/**`, `index.html`, or `vite.config.ts` — inputs that can change the
  frontend bundle consumed by the Tauri shell.
- `package.json`, `yarn.lock`, `.yarnrc.yml`, `.yarn/**`, or `mise.toml` —
  build tooling, package scripts, dependency resolution, and tool versions.
- `scripts/check-tauri-macos-artifacts.mjs` — the artifact verification that
  the hosted macOS job executes.

The classifier intentionally does not trigger for workflow-only changes,
tests, documentation, ordinary shared gameplay/UI code, or unrelated scripts.
Those changes continue to receive the required Linux web build, complete test
suite, hooks, web smoke test, security analysis, and Tauri frontend build.

## Architecture

A small Node script owns only the deterministic question “does this newline
separated changed-file list contain a desktop-risk input?” It reads paths from
standard input and writes exactly `true` or `false`. The workflow obtains the
event-specific changed-file list and delegates classification to that script.
This keeps GitHub event plumbing out of the policy and makes the policy
directly unit-testable.

`tauri-macos-build` uses only the check's output as its condition. The existing
merge-gate verifier remains fail-closed: a required macOS build cannot be
skipped, failed, cancelled, or omitted; a non-applicable one may be skipped.

## Tests and guardrails

- Add focused Vitest coverage for positive and negative path examples,
  including a mixed input list and an empty list.
- Extend the shell workflow-contract test to require the classifier, the
  pull-request and push diff sources, manual-dispatch behavior, and the
  conditional macOS job/merge-gate wiring.
- Preserve the existing merge-gate tests that distinguish applicable from
  non-applicable macOS results.
- Document the trigger policy in the repository agent guidance so future CI
  changes update the classifier and its focused tests rather than adding broad
  workflow-file triggers.

## Out of scope

- Removing macOS packaging support or the local macOS build commands.
- Making ordinary shared game/UI source changes trigger the hosted macOS
  package build.
- Altering test sharding, Pages deployment, artifact retention, or release
  signing behavior.
