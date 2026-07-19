#!/usr/bin/env bash
# Functional tests for the repository pre-push hook.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.githooks/pre-push"

[ -x "$HOOK" ] || {
  echo "repository pre-push hook is missing or not executable"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

git init -q "$tmpdir"
git -C "$tmpdir" config user.name Test
git -C "$tmpdir" config user.email test@example.com
printf 'base\n' > "$tmpdir/base.txt"
git -C "$tmpdir" add base.txt
git -C "$tmpdir" commit -q -m base
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
git -C "$tmpdir" add scripts
git -C "$tmpdir" commit -q -m "add verification stubs"

head_sha="$(git -C "$tmpdir" rev-parse HEAD)"
zero_sha="$(printf '0%.0s' {1..40})"

run_hook() {
  payload="$1"
  verifier_status="${2:-0}"
  rm -f "$marker" "$args_log"
  set +e
  (
    cd "$tmpdir"
    printf '%s\n' "$payload" |
      VERIFY_MARKER="$marker" \
      VERIFY_ARGS_LOG="$args_log" \
      VERIFY_STUB_STATUS="$verifier_status" \
      bash "$HOOK" origin unused
  ) >/dev/null 2>&1
  hook_status=$?
  set -e
}

run_hook "refs/heads/main $head_sha refs/heads/main $zero_sha"
[ "$hook_status" -eq 0 ] || {
  echo "pre-push rejected a clean HEAD push"
  exit 1
}
[ -f "$marker" ] || {
  echo "pre-push did not invoke the canonical verifier"
  exit 1
}
grep -q -- '--fast' "$args_log" || {
  echo "pre-push did not invoke the canonical verifier with --fast (#608)"
  exit 1
}

run_hook "HEAD $head_sha refs/heads/from-head $zero_sha"
[ "$hook_status" -eq 0 ] || {
  echo "pre-push rejected a clean HEAD refspec"
  exit 1
}
[ -f "$marker" ] || {
  echo "pre-push skipped verification for a HEAD refspec"
  exit 1
}

printf 'dirty\n' > "$tmpdir/dirty.txt"
run_hook "refs/heads/main $head_sha refs/heads/main $zero_sha"
[ "$hook_status" -ne 0 ] || {
  echo "pre-push accepted a dirty worktree"
  exit 1
}
rm -f "$tmpdir/dirty.txt"

previous_sha="$(git -C "$tmpdir" rev-parse HEAD)"
printf 'second\n' > "$tmpdir/second.txt"
git -C "$tmpdir" add second.txt
git -C "$tmpdir" commit -q -m second
head_sha="$(git -C "$tmpdir" rev-parse HEAD)"

run_hook "refs/heads/other $previous_sha refs/heads/other $zero_sha"
[ "$hook_status" -ne 0 ] || {
  echo "pre-push verified the current worktree while pushing another SHA"
  exit 1
}

run_hook "refs/tags/v1 $head_sha refs/tags/v1 $zero_sha"
[ "$hook_status" -eq 0 ] || {
  echo "pre-push rejected a tag-only update"
  exit 1
}
[ ! -f "$marker" ] || {
  echo "pre-push ran the full verifier for a tag-only update"
  exit 1
}

run_hook "refs/heads/main $head_sha refs/heads/main $zero_sha" 19
[ "$hook_status" -eq 19 ] || {
  echo "pre-push did not propagate verifier failure: expected 19, got $hook_status"
  exit 1
}
