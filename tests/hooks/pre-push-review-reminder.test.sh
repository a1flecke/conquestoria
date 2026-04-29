#!/usr/bin/env bash
# Smoke test: pre-push-review-reminder.sh
# Covers:
#   - Non-push commands: exit 0
#   - Branch ahead of origin/main (no cd prefix): exit 0
#   - Branch behind origin/main (no cd prefix): exit 2
#   - Branch ahead of origin/main via "cd /worktree && git push": exit 0
#   - Branch behind origin/main via "cd /worktree && git push": exit 2

set -u
HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/pre-push-review-reminder.sh"
fail=0

# ---------- helpers ----------

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

GIT_AUTHOR_NAME="Test"
GIT_AUTHOR_EMAIL="test@test.com"
GIT_COMMITTER_NAME="Test"
GIT_COMMITTER_EMAIL="test@test.com"
export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL

# Create a bare "origin" repo with one commit on main.
origin="$tmpdir/origin"
git init --bare -q "$origin"
setup="$tmpdir/setup"
git clone -q "$origin" "$setup" 2>/dev/null
git -C "$setup" checkout -b main 2>/dev/null || git -C "$setup" checkout -q main
printf 'init\n' > "$setup/file.txt"
git -C "$setup" add .
git -C "$setup" commit -q -m "init"
git -C "$setup" push -q -u origin main

# Make a clone that is AHEAD of origin/main.
ahead_repo="$tmpdir/ahead"
git clone -q "$origin" "$ahead_repo" 2>/dev/null
git -C "$ahead_repo" checkout -q -b feature
printf 'feature\n' > "$ahead_repo/feature.txt"
git -C "$ahead_repo" add .
git -C "$ahead_repo" commit -q -m "feature"

# Make a clone that is BEHIND origin/main: clone, then advance origin/main.
behind_repo="$tmpdir/behind"
git clone -q "$origin" "$behind_repo" 2>/dev/null
git -C "$behind_repo" checkout -q -b old-branch
printf 'old\n' > "$behind_repo/old.txt"
git -C "$behind_repo" add .
git -C "$behind_repo" commit -q -m "old feature"
# Advance origin/main so behind_repo is now behind.
printf 'extra\n' > "$setup/extra.txt"
git -C "$setup" add .
git -C "$setup" commit -q -m "extra commit on main"
git -C "$setup" push -q origin main
git -C "$behind_repo" fetch -q origin

run() {
  local payload="$1" repo="${2:-}"
  if [ -n "$repo" ]; then
    # Run hook from that repo's directory so the no-cd-prefix path works.
    (cd "$repo" && bash "$HOOK" <<<"$payload" 2>/dev/null)
  else
    bash "$HOOK" <<<"$payload" 2>/dev/null
  fi
  echo "rc=$?"
}

# ---------- non-push commands always pass ----------

out=$(run '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}')
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow on ls, got: $out"; fail=1; }

out=$(run '{"tool_name":"Bash","tool_input":{"command":"git status"}}')
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow on git status, got: $out"; fail=1; }

out=$(run '{"tool_name":"Bash","tool_input":{"command":"git commit -m foo"}}')
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow on git commit, got: $out"; fail=1; }

# ---------- no-cd-prefix: hook reads from the shell cwd ----------

# Repo that is ahead of origin/main → should pass
out=$(run '{"tool_name":"Bash","tool_input":{"command":"git push -u origin feature"}}' "$ahead_repo")
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow (ahead, no cd), got: $out"; fail=1; }

# Repo that is behind origin/main → should block
out=$(run '{"tool_name":"Bash","tool_input":{"command":"git push -u origin old-branch"}}' "$behind_repo")
[ "$out" = "rc=2" ] || { echo "FAIL: expected block (behind, no cd), got: $out"; fail=1; }

# ---------- cd-prefix path: hook must use the extracted directory ----------

# "cd /ahead_repo && git push" run from the main project dir (hook default)
out=$(run "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $ahead_repo && git push -u origin feature\"}}")
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow (ahead, cd prefix), got: $out"; fail=1; }

# "cd /behind_repo && git push" run from the main project dir (hook default)
out=$(run "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $behind_repo && git push -u origin old-branch\"}}")
[ "$out" = "rc=2" ] || { echo "FAIL: expected block (behind, cd prefix), got: $out"; fail=1; }

# ---------- gh pr create is also gated ----------

out=$(run "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $behind_repo && gh pr create --fill\"}}")
[ "$out" = "rc=2" ] || { echo "FAIL: expected block gh pr create (behind, cd prefix), got: $out"; fail=1; }

out=$(run "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $ahead_repo && gh pr create --fill\"}}")
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow gh pr create (ahead, cd prefix), got: $out"; fail=1; }

# ---------- multi-line command (heredoc body): path extraction must use line 1 only ----------

# Simulate "cd /path && gh pr create --body $(cat <<'EOF'\n...\nEOF\n)"
# The command string has newlines after the first line; the path must still be extracted correctly.
multiline_cmd="cd $ahead_repo && gh pr create --title test --body \"\$(cat <<'EOF'
## Summary
some description
EOF
)\""
multiline_payload="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":$(printf '%s' "$multiline_cmd" | jq -Rs .)}}"
out=$(run "$multiline_payload")
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow (ahead, multi-line cmd), got: $out"; fail=1; }

multiline_cmd_behind="cd $behind_repo && gh pr create --title test --body \"\$(cat <<'EOF'
## Summary
some description
EOF
)\""
multiline_payload_behind="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":$(printf '%s' "$multiline_cmd_behind" | jq -Rs .)}}"
out=$(run "$multiline_payload_behind")
[ "$out" = "rc=2" ] || { echo "FAIL: expected block (behind, multi-line cmd), got: $out"; fail=1; }

exit "$fail"
