---
description: Validate and ship the current Conquestoria branch without merging it
---

Prepare the current branch for delivery. Read `AGENTS.md` and the applicable
project policies, inspect `git status`, the committed branch delta, and the
local uncommitted delta. Use `./scripts/run-with-mise.sh` for all normal
project Node/Yarn commands.

Run the smallest missing focused validation first, then the repository's
required pre-delivery verification. Inspect the final diff, commit any
intended changes, push the branch, and create or update the pull request.
Report the branch, PR URL, checks, and anything not verified.

Never merge or approve a pull request unless the user explicitly asks in this
conversation. Do not bypass destructive-command protections or start a second
heavy verification while an equivalent one is active.
