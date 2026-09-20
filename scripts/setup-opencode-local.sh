#!/bin/sh

# Idempotent, non-destructive audit for the repository-scoped OpenCode setup.

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/.opencode/opencode.jsonc"

find_opencode() {
  if command -v opencode >/dev/null 2>&1; then
    command -v opencode
    return 0
  fi
  for candidate in "$HOME"/Library/Application\ Support/ai.opencode.desktop/cli/*/opencode-cli; do
    [ -x "$candidate" ] && { printf '%s\n' "$candidate"; return 0; }
  done
  return 1
}

check() {
  label="$1"
  shift
  if "$@"; then
    printf '✓ %s\n' "$label"
    return 0
  fi
  printf '✗ %s\n' "$label" >&2
  return 1
}

failed=0
opencode_bin="$(find_opencode 2>/dev/null || true)"
check 'OpenCode V2 CLI is available' test -n "$opencode_bin" || failed=1
if [ -n "$opencode_bin" ]; then
  check 'OpenCode reports version 2' sh -c '"$1" --version | grep -Eq "^opencode v2\."' sh "$opencode_bin" || failed=1
fi
check 'project OpenCode configuration exists' test -f "$CONFIG" || failed=1
check 'project configuration disables transcript sharing' grep -Fq '"share": "disabled"' "$CONFIG" || failed=1
check 'project configuration blocks Tailscale administration by agents' grep -Fq '"resource": "tailscale *", "effect": "deny"' "$CONFIG" || failed=1
check 'GitHub CLI is authenticated' sh -c 'gh auth status >/dev/null 2>&1' || failed=1
check 'Git hooks are configured for this worktree' sh -c '[ "$(git config --worktree --get core.hooksPath 2>/dev/null || true)" = .githooks ]' || failed=1
check 'mise is available' sh -c 'mise --version >/dev/null 2>&1' || failed=1

if [ "$failed" -eq 0 ]; then
  printf 'OpenCode project setup is configured. No global OpenCode settings or credentials were changed.\n'
  exit 0
fi

printf 'OpenCode project setup needs attention. Review the failed checks above.\n' >&2
exit 1
