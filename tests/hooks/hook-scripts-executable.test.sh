#!/usr/bin/env bash
# Every hook command registered in .claude/settings.json and .agents/hooks.json must be an executable file (#1564).
# A hook whose script lost its executable bit fails with "permission denied", which Claude Code treats as a
# NON-blocking error (and Antigravity fails closed): the guard silently stops working or breaks every tool call.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SETTINGS="$ROOT/.claude/settings.json"
AGY_HOOKS="$ROOT/.agents/hooks.json"

fail() { echo "FAIL: $*" >&2; exit 1; }

# 1. Claude Code hooks (.claude/settings.json), with $CLAUDE_PROJECT_DIR resolved to this checkout.
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

[ "$count" -ge 6 ] || fail "expected at least 6 registered Claude hook commands, found $count"

# 2. Antigravity hooks (.agents/hooks.json), resolved relative to .agents/ (the directory containing hooks.json).
agy_count=0
if [ -f "$AGY_HOOKS" ]; then
  agy_commands="$(jq -r '.. | objects | select(.type? == "command") | .command' "$AGY_HOOKS")"
  [ -n "$agy_commands" ] || fail "found no hook commands in $AGY_HOOKS"
  while IFS= read -r cmd; do
    [ -n "$cmd" ] || continue
    path="${cmd%% *}"
    path="${path//\"/}"
    case "$path" in
      /*) resolved="$path" ;;
      *) resolved="$ROOT/.agents/$path" ;;
    esac
    [ -f "$resolved" ] || fail "Antigravity hook command does not exist: $cmd (resolved: $resolved)"
    [ -x "$resolved" ] || fail "Antigravity hook script is not executable: $resolved"
    agy_count=$((agy_count + 1))
  done <<EOF
$agy_commands
EOF
  [ "$agy_count" -ge 5 ] || fail "expected at least 5 registered Antigravity hook commands, found $agy_count"
fi

echo "hook-scripts-executable.test.sh: $count Claude + $agy_count Antigravity hook scripts are executable"
