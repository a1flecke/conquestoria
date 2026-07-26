# Vitest Worktree Concurrency Design

## Goal

Allow independent worktrees to run routine tests and builds concurrently without
sharing a writable Vite cache or relying on a repository-wide verification lock.

## Decision

Routine `yarn test`, `test:fast`, `test:slow`, `build`, and `build:tauri` run
directly. Vitest receives an explicit per-process worker budget: the official
`VITEST_MAX_WORKERS` environment variable wins; otherwise CI uses all available
parallelism and local worktrees use 25 percent. This preserves parallel test
files while leaving capacity for up to four local worktree runs.

Vite and Vitest caches live under ignored `.vite/` directories in the active
worktree. Test and non-test Vite commands use separate subdirectories so no
two worktrees write the same cache.

The pre-push verifier also runs directly. If measured evidence later requires
a host-wide queue, it must wrap only that full verifier using an advisory file
lock; routine developer commands must remain concurrent.

## Non-goals

- Changing gameplay, UI, AI, save data, audio, or release behavior.
- Disabling Vitest file isolation or file parallelism.
- Switching Vitest pools without a dedicated compatibility and benchmark pass.
- Enabling Vitest's experimental filesystem module cache.

## Validation

- Hook tests prove routine linked-worktree commands do not invoke the legacy
  lock and use the active worktree cache path.
- Configuration tests prove the local and CI worker-policy branches.
- Build and full test suite remain green.
