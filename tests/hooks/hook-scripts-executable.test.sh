#!/usr/bin/env bash
# Every hook command registered in .claude/settings.json must be an executable file (#1564). A hook whose script lost its
# executable bit fails with "permission denied", which Claude Code treats as a NON-blocking error: the guard it was meant to
# be silently stops working (block-pattern-kill.sh was committed 100644 and did exactly that).

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SETTINGS="$ROOT/.claude/settings.json"

fail() { echo "FAIL: $*" >&2; exit 1; }

# The first word of each hook command, with $CLAUDE_PROJECT_DIR resolved to this checkout.
commands="$(jq -r '.. | objects | select(.type? == "command") | .command' "$SETTINGS")"
[ -n "$commands" ] || fail "found no hook commands in $SETTINGS"

count=0
while IFS= read -r cmd; do
  [ -n "$cmd" ] || continue
  path="${cmd%% *}"                      # drop arguments
  path="${path//\"/}"                    # drop the quotes around "$CLAUDE_PROJECT_DIR"
  path="${path//\$CLAUDE_PROJECT_DIR/$ROOT}"
  [ -f "$path" ] || fail "hook command does not exist: $cmd"
  [ -x "$path" ] || fail "hook script is not executable (its guard silently does nothing): $path"
  count=$((count + 1))
done <<EOF
$commands
EOF

[ "$count" -ge 6 ] || fail "expected at least 6 registered hook commands, found $count"
echo "hook-scripts-executable.test.sh: $count hook scripts are executable"
