#!/usr/bin/env bash
# scripts/sync-main.sh: the one narrow, no-argument way for any agent (Claude Code, Codex, OpenCode) to bring
# its branch up to date with origin/main without a human approval (#1256). It must rebase a feature branch,
# and refuse everything that could lose work or touch main, and it must be structurally incapable of anything
# beyond `git fetch origin main` + `git rebase origin/main`.
#
# Real git, no network: a bare repo stands in for origin.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
SYNC="$ROOT/scripts/sync-main.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -x "$SYNC" ] || fail "0: scripts/sync-main.sh is missing or not executable"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tmp="$(cd "$tmp" && pwd -P)"

export GIT_AUTHOR_NAME=T GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=T GIT_COMMITTER_EMAIL=t@example.com
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null

git init -q --bare -b main "$tmp/origin.git"
git clone -q "$tmp/origin.git" "$tmp/seed" 2>/dev/null
(
  cd "$tmp/seed"
  git checkout -q -b main 2>/dev/null || true
  echo base > shared.txt
  git add shared.txt
  git commit -q -m base
  git push -q origin main
)

new_work() {
  rm -rf "$tmp/work"
  git clone -q "$tmp/origin.git" "$tmp/work" 2>/dev/null
  mkdir -p "$tmp/work/scripts"
  cp -p "$SYNC" "$tmp/work/scripts/sync-main.sh"
  (cd "$tmp/work" && git checkout -q -b feature && echo mine > mine.txt && git add mine.txt && git commit -q -m feature-work)
}

land_on_main() {
  (cd "$tmp/seed" && echo "$1" > "$1.txt" && git add "$1.txt" && git commit -q -m "landed-$1" && git push -q origin main)
}

# run <args...>: run the work clone's copy from an unrelated cwd; sets OUT, ERR, STATUS.
run() {
  STATUS=0
  (cd "$tmp" && "$tmp/work/scripts/sync-main.sh" "$@") >"$tmp/out" 2>"$tmp/err" || STATUS=$?
  OUT="$(cat "$tmp/out")"
  ERR="$(cat "$tmp/err")"
}
head_of() { git -C "$tmp/work" rev-parse HEAD; }

# --- 1. a behind feature branch is rebased onto the new origin/main, linearly -----
new_work
land_on_main one
land_on_main two
run
[ "$STATUS" -eq 0 ] || fail "1: exit $STATUS: $ERR"
git -C "$tmp/work" merge-base --is-ancestor origin/main HEAD || fail "1: HEAD does not contain origin/main"
[ -f "$tmp/work/one.txt" ] && [ -f "$tmp/work/two.txt" ] && [ -f "$tmp/work/mine.txt" ] || fail "1: files missing after rebase"
[ "$(git -C "$tmp/work" rev-list --merges --count origin/main..HEAD)" -eq 0 ] || fail "1: a merge commit was created"
[ "$(git -C "$tmp/work" rev-list --count origin/main..HEAD)" -eq 1 ] || fail "1: feature commit was not replayed on top"
[ "$(git -C "$tmp/work" symbolic-ref --short HEAD)" = feature ] || fail "1: left the feature branch"
echo "ok 1: behind branch is rebased linearly onto origin/main"

# --- 2. already current is a clean no-op --------------------------------------------
before="$(head_of)"
run
[ "$STATUS" -eq 0 ] || fail "2: up-to-date run exit $STATUS: $ERR"
[ "$(head_of)" = "$before" ] || fail "2: HEAD moved though already current"
echo "ok 2: already up to date does nothing"

# --- 3. untracked files do not block it ---------------------------------------------
land_on_main three
echo scratch > "$tmp/work/untracked.txt"
run
[ "$STATUS" -eq 0 ] || fail "3: untracked file blocked the sync: $ERR"
[ -f "$tmp/work/three.txt" ] || fail "3: not rebased"
echo "ok 3: untracked files are ignored"

# --- 4. refusals: nothing moves, exit 2 with a clear message -------------------------
refuses() {
  label="$1"; shift
  before="$(head_of)"
  run "$@"
  [ "$STATUS" -eq 2 ] || fail "4: $label: expected exit 2, got $STATUS ($OUT / $ERR)"
  [ "$(head_of)" = "$before" ] || fail "4: $label: HEAD moved"
  printf '%s' "$ERR" | grep -q 'sync-main' || fail "4: $label: no sync-main message: $ERR"
  return 0
}

land_on_main four
echo dirty >> "$tmp/work/mine.txt"
refuses 'dirty tracked file'
git -C "$tmp/work" checkout -q -- mine.txt 2>/dev/null || (cd "$tmp/work" && git stash -q && git stash drop -q)

refuses 'any argument' --force
refuses 'task-like argument' origin/main
refuses 'empty argument' ''

git -C "$tmp/work" checkout -q main
refuses 'on main'
git -C "$tmp/work" checkout -q --detach
refuses 'detached HEAD'
git -C "$tmp/work" checkout -q feature
echo "ok 4: dirty tree, arguments, main and detached HEAD are refused without moving anything"

# --- 5. a conflict stops mid-rebase with instructions, and a second run refuses -----
new_work
(cd "$tmp/seed" && echo upstream > mine.txt && git add mine.txt && git commit -q -m upstream-mine && git push -q origin main)
run
[ "$STATUS" -eq 1 ] || fail "5: conflict should exit 1, got $STATUS"
[ -d "$tmp/work/.git/rebase-merge" ] || [ -d "$tmp/work/.git/rebase-apply" ] || fail "5: rebase is not left in progress for resolution"
printf '%s\n%s' "$OUT" "$ERR" | grep -q 'GIT_EDITOR=true git rebase --continue' || fail "5: no continue instruction"
printf '%s\n%s' "$OUT" "$ERR" | grep -qi 'never.*skip\|do not.*skip' || fail "5: no warning against rebase --skip"
run
[ "$STATUS" -eq 2 ] || fail "5: second run during a rebase should refuse (exit 2), got $STATUS"
printf '%s' "$ERR" | grep -q 'in progress' || fail "5: no in-progress message: $ERR"
(cd "$tmp/work" && git rebase --abort)
echo "ok 5: conflict leaves the rebase for resolution; a rerun refuses"

# --- 6. structural guard -----------------------------------------------------------------
# Comments and the conflict-instructions heredoc are text for the agent, not commands, so strip them first.
code="$(sed "/<<'CONFLICT'/,/^CONFLICT\$/d; s/[[:space:]]#.*\$//; /^[[:space:]]*#/d" "$SYNC")"
guard() {
  pattern="$1"; reason="$2"
  if printf '%s\n' "$code" | grep -Eq -e "$pattern"; then
    printf '%s\n' "$code" | grep -En -e "$pattern" >&2
    fail "6: scripts/sync-main.sh must not contain this: $reason"
  fi
}
guard '(^|[^A-Za-z_])eval([^A-Za-z_]|$)' 'eval'
guard '(sh|bash|zsh|dash)[[:space:]]+-[A-Za-z]*c([[:space:]]|$)' 'sh -c'
guard '"\$@"|\$\*' 'forwarding caller words'
guard 'git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(push|reset|clean|restore|checkout|switch|merge|branch|stash|rm|cherry-pick|commit|add|tag|remote|config|filter-branch|gc|prune|reflog)([[:space:]]|$)' 'only fetch and rebase may mutate'
guard '--force|--hard|--skip|--interactive|(^|[[:space:]])-i([[:space:]]|$)|--strategy|-X[[:space:]]|--rebase-merges|--autostash' 'a rebase flag or force flag'
guard '(^|[;&|({[:space:]])(kill|pkill|killall|rm|gh|curl|wget|sudo)([[:space:]]|$)' 'process signalling, deletion, gh or network helpers'
grep -q 'git fetch origin main' "$SYNC" || fail "6: expected the fixed fetch"
grep -q 'git rebase origin/main' "$SYNC" || fail "6: expected the fixed rebase"
echo "ok 6: structural guard"

echo "ALL PASS"
