# Worktree-Safe Local Verification Design

## Goal

Make local commit and push verification trustworthy across Git linked worktrees, aligned with CI, bounded by explicit timeouts, and covered by functional tests.

## Problems to solve

- Repository hooks are opt-in and the current installer writes shared configuration that affects every linked worktree.
- The pre-commit hook clears `GIT_INDEX_FILE`, so partial or alternate-index commits inspect the wrong staged files.
- The pre-push hook ignores the refs supplied on stdin and can test a dirty working tree or a different branch than the one being pushed.
- Hook tests can mask failures and mostly inspect script text instead of executing real behavior.
- `run-with-mise.sh` trusts Git-local hook environment variables and only routes a fresh worktree after the main worktree already has `.pnp.cjs`.
- Mise declares Yarn as `latest` even though `package.json` pins Yarn 4.13.0.
- Vitest's default five-second timeout is too close to full-catalog jsdom test runtime on GitHub runners, while neither the local gate nor the CI job has a total timeout.
- Local Git hooks, Claude's push gate, and CI use overlapping but different verification implementations.

## Architecture

### Canonical verification command

`scripts/verify-before-push.sh` is the single local/CI entry point. It runs:

1. the full Vitest and hook suite;
2. the TypeScript and production Vite build.

Each phase runs through `scripts/run-with-timeout.mjs`. Local direct invocation uses `run-with-mise.sh`; invocation from an already prepared Yarn environment uses `--no-mise`.

### Git hooks

- `pre-commit` remains fast and index-correct. It runs only staged-file guardrails and preserves all Git index environment.
- `pre-push` reads all ref updates from stdin, ignores deletion and tag-only updates, rejects branch updates whose local SHA is not `HEAD`, rejects a dirty working tree, and then runs the canonical verifier.
- Hook installation is worktree-local. `scripts/setup-git-hooks.sh` enables Git's worktree configuration extension and writes `core.hooksPath=.githooks` with `git config --worktree`.

### Worktree and mise boundary

`run-with-mise.sh` clears Git repository-local variables only inside the subprocesses used to discover the current and main worktrees. It never clears the caller's index environment.

In a linked worktree:

- `yarn install` always routes to the main worktree, even before `.pnp.cjs` exists;
- commands requiring dependencies fail with an actionable install instruction when main dependencies are missing;
- hook setup stays in the active linked worktree;
- all existing test/build/dev routing remains active.

Node, Rust, and Yarn versions are exact in `mise.toml`; Yarn matches `packageManager`.

### Timeout policy

- Full-catalog tech-panel interactions get a targeted ten-second Vitest timeout. The structural DOM-identity assertion remains the performance regression, so the timeout is not the only protection.
- Local test and build phases have explicit watchdog deadlines and exit 124 on timeout.
- The GitHub test job has a 15-minute job timeout.
- Timeout values can be shortened by environment variables in functional tests without changing production defaults.

## Testing contract

Functional shell tests must prove:

- pre-commit sees an alternate `GIT_INDEX_FILE` and propagates guardrail failure;
- pre-push accepts clean `HEAD`, rejects dirty state, rejects another branch/SHA, and propagates verifier failure;
- setup changes only the selected linked worktree's hook path;
- run-with-mise survives hook-exported Git variables and routes first install to the main worktree;
- the timeout runner preserves success/failure status and terminates a hung process;
- the canonical verifier is used by the real pre-push hook and Claude push gate;
- mise and package-manager Yarn pins agree;
- repeated tech selections preserve the tree while clearing stale selected/path/edge state.

## Error behavior

Every blocked commit or push prints a direct recovery action. Missing dependencies point to the worktree-safe install command. Wrong-ref pushes ask the user to check out the branch or push from a clean worktree. Timeouts identify the phase and configured deadline.

## Non-goals

- Verifying arbitrary historical SHAs in temporary worktrees.
- Installing hooks automatically during dependency installation.
- Replacing GitHub Actions as the authoritative exact-commit verifier.
