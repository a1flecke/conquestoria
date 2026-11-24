---
name: work-issue
description: Implement a Conquestoria GitHub issue end-to-end in an isolated worktree through focused validation, required verification, and PR creation (never merging or approving).
---

# Work Issue

Implement the requested GitHub issue from start to finish in Conquestoria.

## Steps

1. **Read policy and issue first**:
   - Read `GEMINI.md`, `CLAUDE.md`, the relevant `.claude/rules/*.md` files for the affected area, and the GitHub issue (`gh issue view <number>`).
   - Execute all coding and research inline in the current session (no coding/research subagents or swarms).

2. **Work in an isolated linked worktree off `origin/main`**:
   - Never edit, commit, rebase, or switch branches in the main checkout.
   - If not already in a task worktree, create one off `origin/main` with a named branch (e.g., `antigravity/<issue>-<short-name>`), then run:
     ```bash
     ./scripts/setup-git-hooks.sh
     git config --worktree --get core.hooksPath
     ./scripts/run-with-mise.sh yarn install --immutable
     ```
   - Never discard unrelated work.

3. **Test-first implementation**:
   - Add the smallest focused regression test proving the exact bug or required behavior before modifying production code.
   - Keep gameplay mutations in canonical helpers and wire player-visible behavior all the way to the live UI/renderer path.
   - Use `./scripts/dev.sh <task>` or `./scripts/run-with-mise.sh yarn <cmd>` for all Node/Yarn commands.

4. **Verify according to the impact contract**:
   - Run `./scripts/dev.sh verify-impact` to see the exact required evidence for your changed files.
   - Run every required check (e.g., `./scripts/check-src-rule-violations.sh`, mirrored tests, `./scripts/run-with-mise.sh yarn build`, `./scripts/run-with-mise.sh yarn test:durable`, `./scripts/run-with-mise.sh yarn test:durable:status`, or `./scripts/dev.sh verify-pr` + `./scripts/dev.sh verify-pr-status`).
   - Do not start a durable/heavy verification while `./scripts/dev.sh verify-status` shows an equivalent run already active in this worktree.

5. **Deliver without merging or approving**:
   - Inspect both `git diff --stat origin/main...HEAD` and `git diff --stat`.
   - Rebase with `./scripts/sync-main.sh` if needed, commit, push with `./scripts/push-branch.sh`, and write the PR body via `./scripts/pr-body.sh` in `/tmp/pr-bodies/`.
   - Report the PR URL, changed files, and verification evidence. Never merge or approve a pull request unless the user explicitly asks in the current conversation.
