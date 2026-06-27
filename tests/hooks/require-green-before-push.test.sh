#!/usr/bin/env bash
# Functional tests for the Claude push gate's canonical verifier delegation.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/require-green-before-push.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/scripts"

marker="$tmpdir/verifier-ran"
cat > "$tmpdir/scripts/verify-before-push.sh" <<'EOF'
#!/bin/sh
set -eu
printf 'ran\n' >> "$VERIFY_MARKER"
exit "${VERIFY_STUB_STATUS:-0}"
EOF
chmod +x "$tmpdir/scripts/verify-before-push.sh"

run_hook() {
  payload="$1"
  verifier_status="${2:-0}"
  rm -f "$marker"
  set +e
  VERIFY_MARKER="$marker" \
    VERIFY_STUB_STATUS="$verifier_status" \
    CLAUDE_PROJECT_DIR="$tmpdir" \
    bash "$HOOK" <<<"$payload" >/dev/null 2>&1
  hook_status=$?
  set -e
}

run_hook '{"tool_name":"Bash","tool_input":{"command":"git status"}}'
[ "$hook_status" -eq 0 ] || {
  echo "Claude push gate blocked a non-push command"
  exit 1
}
[ ! -f "$marker" ] || {
  echo "Claude push gate verified a non-push command"
  exit 1
}

run_hook "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $tmpdir && git push origin HEAD\"}}"
[ "$hook_status" -eq 0 ] || {
  echo "Claude push gate rejected a passing canonical verifier"
  exit 1
}
[ -f "$marker" ] || {
  echo "Claude push gate did not invoke the canonical verifier"
  exit 1
}

run_hook "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $tmpdir && gh pr create --fill\"}}" 17
[ "$hook_status" -eq 2 ] || {
  echo "Claude push gate did not block verifier failure: $hook_status"
  exit 1
}

run_hook '{"tool_name":"Bash","tool_input":{"command":"echo pushing"}}' 17
[ "$hook_status" -eq 0 ] || {
  echo "Claude push gate matched a push substring"
  exit 1
}
