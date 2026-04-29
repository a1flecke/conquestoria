#!/usr/bin/env bash
# Smoke test: pre-push-review-reminder.sh
# Covers:
#   - Non-push commands: exit 0
#   - Branch ahead of origin/main (no cd prefix): exit 0
#   - Branch behind origin/main (no cd prefix): exit 2
#   - Branch ahead of origin/main via "cd /worktree && git push": exit 0
#   - Branch behind origin/main via "cd /worktree && git push": exit 2
#   - Multi-line command (heredoc body) with cd prefix: path extraction uses line 1 only

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

# ---- SCENARIO A: branch AHEAD of origin/main ----
# origin_a has one commit on main.
# ahead_repo branches from that commit and adds one more → it is ahead.
# We never advance origin_a after creating ahead_repo, so origin/main stays
# an ancestor of HEAD regardless of how git resolves local-path remotes.

origin_a="$tmpdir/origin_a"
git init --bare -q "$origin_a"
setup_a="$tmpdir/setup_a"
git clone -q "$origin_a" "$setup_a" 2>/dev/null
git -C "$setup_a" checkout -b main 2>/dev/null || git -C "$setup_a" checkout -q main
printf 'init\n' > "$setup_a/file.txt"
git -C "$setup_a" add .
git -C "$setup_a" commit -q -m "init"
git -C "$setup_a" push -q -u origin_a main 2>/dev/null || git -C "$setup_a" push -q -u origin main

# Clone alias: 'git clone' uses the remote's name 'origin'; we rename to keep things tidy.
ahead_repo="$tmpdir/ahead"
git clone -q "$origin_a" "$ahead_repo" 2>/dev/null
git -C "$ahead_repo" checkout -q -b feature
printf 'feature\n' > "$ahead_repo/feature.txt"
git -C "$ahead_repo" add .
git -C "$ahead_repo" commit -q -m "feature"

# ---- SCENARIO B: branch BEHIND origin/main ----
# origin_b starts with two commits on main.
# behind_repo clones after only one commit, then origin_b advances.
# behind_repo's branch never incorporates the extra commit → it is behind.

origin_b="$tmpdir/origin_b"
git init --bare -q "$origin_b"
setup_b="$tmpdir/setup_b"
git clone -q "$origin_b" "$setup_b" 2>/dev/null
git -C "$setup_b" checkout -b main 2>/dev/null || git -C "$setup_b" checkout -q main
printf 'init\n' > "$setup_b/file.txt"
git -C "$setup_b" add .
git -C "$setup_b" commit -q -m "init"
git -C "$setup_b" push -q -u origin main 2>/dev/null

behind_repo="$tmpdir/behind"
git clone -q "$origin_b" "$behind_repo" 2>/dev/null
git -C "$behind_repo" checkout -q -b old-branch
printf 'old\n' > "$behind_repo/old.txt"
git -C "$behind_repo" add .
git -C "$behind_repo" commit -q -m "old feature"

# Advance origin_b so behind_repo is now behind.
printf 'extra\n' > "$setup_b/extra.txt"
git -C "$setup_b" add .
git -C "$setup_b" commit -q -m "extra commit on main"
git -C "$setup_b" push -q origin main 2>/dev/null
git -C "$behind_repo" fetch -q origin

run() {
  local payload="$1" repo="${2:-}"
  if [ -n "$repo" ]; then
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

# ---------- no-cd-prefix: hook reads git state from the shell cwd ----------

# Repo that is ahead of origin/main → should pass
out=$(run '{"tool_name":"Bash","tool_input":{"command":"git push -u origin feature"}}' "$ahead_repo")
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow (ahead, no cd), got: $out"; fail=1; }

# Repo that is behind origin/main → should block
out=$(run '{"tool_name":"Bash","tool_input":{"command":"git push -u origin old-branch"}}' "$behind_repo")
[ "$out" = "rc=2" ] || { echo "FAIL: expected block (behind, no cd), got: $out"; fail=1; }

# ---------- cd-prefix path: hook must use the extracted directory ----------

out=$(run "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $ahead_repo && git push -u origin feature\"}}")
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow (ahead, cd prefix), got: $out"; fail=1; }

out=$(run "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $behind_repo && git push -u origin old-branch\"}}")
[ "$out" = "rc=2" ] || { echo "FAIL: expected block (behind, cd prefix), got: $out"; fail=1; }

# ---------- gh pr create is also gated ----------

out=$(run "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $behind_repo && gh pr create --fill\"}}")
[ "$out" = "rc=2" ] || { echo "FAIL: expected block gh pr create (behind, cd prefix), got: $out"; fail=1; }

out=$(run "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cd $ahead_repo && gh pr create --fill\"}}")
[ "$out" = "rc=0" ] || { echo "FAIL: expected allow gh pr create (ahead, cd prefix), got: $out"; fail=1; }

# ---------- multi-line command (heredoc body): path extraction must use line 1 only ----------

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
