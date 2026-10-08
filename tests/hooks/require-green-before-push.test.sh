#!/usr/bin/env bash
# Functional tests for the Claude push gate's canonical verifier delegation.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.claude/hooks/require-green-before-push.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/scripts"

marker="$tmpdir/verifier-ran"
args_log="$tmpdir/verifier-args"
cat > "$tmpdir/scripts/verify-before-push.sh" <<'EOF'
#!/bin/sh
set -eu
printf 'ran\n' >> "$VERIFY_MARKER"
printf '%s\n' "$*" >> "$VERIFY_ARGS_LOG"
exit "${VERIFY_STUB_STATUS:-0}"
EOF
chmod +x "$tmpdir/scripts/verify-before-push.sh"

run_hook() {
  payload="$1"
  verifier_status="${2:-0}"
  rm -f "$marker" "$args_log"
  set +e
  VERIFY_MARKER="$marker" \
    VERIFY_ARGS_LOG="$args_log" \
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
grep -q -- '--regular' "$args_log" || {
  echo "Claude push gate did not invoke the canonical verifier with --regular (#608)"
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

# --- #1133: defer to the repo's real .githooks/pre-push for a plain `git
#     push` when this worktree's hooks are actually wired up, instead of
#     running the same test+build gate twice. -----------------------------

wired_dir="$tmpdir/wired-worktree"
mkdir -p "$wired_dir/scripts" "$wired_dir/.githooks"
(cd "$wired_dir" && git init --quiet && git config core.hooksPath .githooks)
cat > "$wired_dir/.githooks/pre-push" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$wired_dir/.githooks/pre-push"
cp "$tmpdir/scripts/verify-before-push.sh" "$wired_dir/scripts/verify-before-push.sh"

run_hook_in() {
  # run_hook_in <project-dir> <payload> [verifier-status]
  project_dir="$1"
  payload="$2"
  verifier_status="${3:-0}"
  rm -f "$marker" "$args_log"
  set +e
  VERIFY_MARKER="$marker" \
    VERIFY_ARGS_LOG="$args_log" \
    VERIFY_STUB_STATUS="$verifier_status" \
    CLAUDE_PROJECT_DIR="$project_dir" \
    bash "$HOOK" <<<"$payload" >/dev/null 2>&1
  hook_status=$?
  set -e
}

run_hook_in "$wired_dir" '{"tool_name":"Bash","tool_input":{"command":"git push origin HEAD"}}'
[ "$hook_status" -eq 0 ] || {
  echo "Claude push gate blocked a git push when the repo pre-push hook is wired"
  exit 1
}
[ ! -f "$marker" ] || {
  echo "Claude push gate ran the verifier itself even though .githooks/pre-push is wired (#1133 duplicate-verification regression)"
  exit 1
}

# A wired worktree still runs the verifier itself for gh pr create/merge --
# those never trigger git's own pre-push hook, so there is nothing to defer to.
run_hook_in "$wired_dir" '{"tool_name":"Bash","tool_input":{"command":"gh pr create --fill"}}'
[ "$hook_status" -eq 0 ] || {
  echo "Claude push gate rejected a passing canonical verifier for gh pr create in a wired worktree"
  exit 1
}
[ -f "$marker" ] || {
  echo "Claude push gate deferred a gh pr create to the git pre-push hook, but gh never triggers it"
  exit 1
}

# A worktree whose hooksPath is NOT wired to .githooks still runs the
# verifier itself for a plain git push -- unchanged fallback behavior.
unwired_dir="$tmpdir/unwired-worktree"
mkdir -p "$unwired_dir/scripts"
(cd "$unwired_dir" && git init --quiet)
cp "$tmpdir/scripts/verify-before-push.sh" "$unwired_dir/scripts/verify-before-push.sh"
run_hook_in "$unwired_dir" '{"tool_name":"Bash","tool_input":{"command":"git push origin HEAD"}}'
[ "$hook_status" -eq 0 ] || {
  echo "Claude push gate rejected a passing canonical verifier in an unwired worktree"
  exit 1
}
[ -f "$marker" ] || {
  echo "Claude push gate skipped verification in an unwired worktree (unsafe: #608-style regression)"
  exit 1
}

# --- The gate verifies the session's own worktree (payload cwd), not CLAUDE_PROJECT_DIR (the main checkout) -------

main_dir="$tmpdir/main-checkout"
session_dir="$tmpdir/session-worktree"
mkdir -p "$main_dir/scripts" "$session_dir/scripts" "$session_dir/sub"
(cd "$main_dir" && git init --quiet)
(cd "$session_dir" && git init --quiet)
cat > "$main_dir/scripts/verify-before-push.sh" <<'STUB'
#!/bin/sh
printf 'main\n' >> "$VERIFY_WHO"
exit 0
STUB
cat > "$session_dir/scripts/verify-before-push.sh" <<'STUB'
#!/bin/sh
printf 'session\n' >> "$VERIFY_WHO"
exit "${VERIFY_STUB_STATUS:-0}"
STUB
chmod +x "$main_dir/scripts/verify-before-push.sh" "$session_dir/scripts/verify-before-push.sh"

run_hook_cwd() {
  # run_hook_cwd <cwd> <command> [verifier-status]
  who="$tmpdir/verify-who"
  rm -f "$who"
  set +e
  VERIFY_WHO="$who" VERIFY_STUB_STATUS="${3:-0}" CLAUDE_PROJECT_DIR="$main_dir" \
    bash "$HOOK" <<<"{\"tool_name\":\"Bash\",\"cwd\":\"$1\",\"tool_input\":{\"command\":\"$2\"}}" >/dev/null 2>&1
  hook_status=$?
  set -e
}

run_hook_cwd "$session_dir" "gh pr create --fill"
[ "$(cat "$who" 2>/dev/null)" = "session" ] || {
  echo "Claude push gate verified the main checkout instead of the session worktree: $(cat "$who" 2>/dev/null)"
  exit 1
}

run_hook_cwd "$session_dir/sub" "gh pr merge 5 --rebase" 17
[ "$hook_status" -eq 2 ] && [ "$(cat "$who" 2>/dev/null)" = "session" ] || {
  echo "Claude push gate did not resolve a session subdirectory to its worktree root and block its failure"
  exit 1
}

# A cwd outside any repo (or without a verifier) falls back to CLAUDE_PROJECT_DIR.
run_hook_cwd "$tmpdir" "gh pr create --fill"
[ "$(cat "$who" 2>/dev/null)" = "main" ] || {
  echo "Claude push gate did not fall back to CLAUDE_PROJECT_DIR for a cwd without a verifier"
  exit 1
}
