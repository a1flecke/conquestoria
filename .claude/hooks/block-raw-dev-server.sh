#!/usr/bin/env bash
# PreToolUse hook -- blocks starting a dev server by hand (#1564).
#
# A hand-started `yarn dev` / `vite` records nothing and is stopped only by whoever remembers its pid; agents routinely
# did not, leaving servers (and their audio) running on a shared host. scripts/dev-server.sh starts a server for THIS
# worktree on its own port, records it, and stops it on `stop`, on its lifetime elapsing, when the worktree is removed
# and at session end.
#
#   scripts/dev-server.sh start    then   preview_start {url: <the printed URL>}
#   scripts/dev-server.sh stop
#
# Hook contract: tool input arrives as JSON on stdin (NOT in CLAUDE_TOOL_INPUT). See .claude/rules/hooks-and-tooling.md.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$COMMAND" ] || exit 0

# A git/gh/pr-body command may MENTION `yarn dev` in a message; scan only its first line with quoted text removed.
if echo "$COMMAND" | grep -qE '^[[:space:]]*(git|gh)[[:space:]]|pr-body\.sh'; then
  SCAN="$(printf '%s' "$COMMAND" | head -n 1 | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")"
else
  SCAN="$COMMAND"
fi

# The managed script is the one legitimate caller of `yarn dev`; naming it is always fine.
if echo "$SCAN" | grep -qE '(^|[[:space:];&|(])(\./)?scripts/dev-server\.sh([[:space:]]|$)'; then
  exit 0
fi

# Command position only (start, after a separator or subshell opener, or after a wrapper word), so searching for the words
# (`rg "yarn dev" docs`) is not mistaken for running it.
CMDPOS=$'(^|[;&|(`]|(sudo|env|nohup|time|exec|then|do|else)[[:space:]])[[:space:]]*'
WRAP='(\./scripts/run-with-mise\.sh|scripts/run-with-mise\.sh|bash[[:space:]]+scripts/run-with-mise\.sh|sh[[:space:]]+scripts/run-with-mise\.sh)?[[:space:]]*'
if echo "$SCAN" | grep -qE "${CMDPOS}${WRAP}(yarn|npm|npx|pnpm)[[:space:]]+(run[[:space:]]+)?(dev|vite)([[:space:]]|\$)" \
  || echo "$SCAN" | grep -qE "${CMDPOS}${WRAP}(\./node_modules/\.bin/)?vite([[:space:]]|\$)"; then
  cat >&2 <<'EOF'
ERROR: do not start a dev server by hand.

A hand-started server is not recorded anywhere, so nothing stops it when you are done; agents have repeatedly left
servers (and game audio) running on this shared host. Use the managed script instead:

  scripts/dev-server.sh start    serves THIS worktree on its own port and prints the URL, worktree and branch
  scripts/dev-server.sh stop     stops it (it also stops itself after 2h, when the worktree is removed, and at session end)
  scripts/dev-server.sh status   lists every dev server on the host

Open the page with the browser preview's `url` form, e.g. preview_start {url: http://localhost:<port>/conquestoria/}.
See .claude/rules/hooks-and-tooling.md "Dev servers".
EOF
  exit 2
fi

exit 0
