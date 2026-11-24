---
name: ship
description: Validate, rebase, push, and open or update a pull request for the current Conquestoria feature branch without merging or approving it.
---

# Ship Branch

Prepare the current Conquestoria feature branch for delivery without merging or approving it.

## Steps

1. **Inspect branch state**:
   - Read `GEMINI.md` and applicable `.claude/rules/*.md` policies.
   - Check `git status --short --branch`, `git diff --stat origin/main...HEAD`, and `git diff --stat` (inspect full diffs when source files changed).
   - Confirm you are on a named feature branch in a linked worktree (never `main`) and that `git config --worktree --get core.hooksPath` returns `.githooks`.

2. **Run missing validation and required verification**:
   - Run `./scripts/dev.sh verify-impact` to confirm every required evidence item for the branch diff.
   - Run the smallest missing focused validation first, then required pre-delivery checks (`./scripts/run-with-mise.sh yarn build`, `./scripts/run-with-mise.sh yarn test:durable`, `./scripts/run-with-mise.sh yarn test:durable:status`, or `./scripts/dev.sh verify-pr` + `./scripts/dev.sh verify-pr-status`).
   - Do not start a second heavy verification while `./scripts/dev.sh verify-status` shows an equivalent run already active.

3. **Rebase, commit, push, and open/update PR**:
   - Commit any intended changes using Conventional Commit style.
   - Rebase onto latest `origin/main` with `./scripts/sync-main.sh`.
   - Publish with `./scripts/push-branch.sh` (allow the full 1800 s timeout for the pre-push gate unless reusing a clean `verify:pr` proof).
   - Create or update the PR body exclusively through `./scripts/pr-body.sh` in `/tmp/pr-bodies/`.

4. **Report**:
   - Report the branch name, PR URL, verification checks run (and anything not verified).
   - Never merge or approve a pull request unless the user explicitly asks in the current conversation, and never bypass destructive-command protections.
