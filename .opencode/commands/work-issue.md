---
description: Implement a Conquestoria issue through branch, validation, and PR creation
---

Work on issue $ARGUMENTS from start to finish.

Before changing files, read `AGENTS.md`, the applicable `CLAUDE.md` and
`.claude/rules/*.md` policies, and the GitHub issue. Start in an isolated
worktree/feature branch based on current `origin/main`; never discard
unrelated work.

Use `./scripts/run-with-mise.sh` for normal project Node/Yarn commands. Add
the smallest focused regression first, run the narrowest relevant validation,
then inspect the full diff and the repository-required delivery checks before
committing and pushing. Do not start a durable/heavy verification while its
status shows an active equivalent run.

Create or update the pull request and report its URL, changed files, and
verification evidence. Never merge or approve a pull request unless the user
explicitly asks in this conversation.
