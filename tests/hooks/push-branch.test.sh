#!/usr/bin/env bash
# scripts/push-branch.sh: the one narrow, no-argument way for any agent to publish its feature branch, including
# after a rebase, without a human approval (#1260). It may only push the CURRENT branch to origin under the SAME
# name, with a lease pinned to the exact remote tip this clone last saw, and only once the branch is based on the
# latest origin/main. Everything else is refused, and it must be structurally incapable of more.
#
# Real git, no network: a bare repo stands in for origin.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
PUSH="$ROOT/scripts/push-branch.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -x "$PUSH" ] || fail "0: scripts/push-branch.sh is missing or not executable"

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
  git -C "$tmp/origin.git" update-ref -d refs/heads/feature 2>/dev/null || true
  rm -rf "$tmp/work"
  git clone -q "$tmp/origin.git" "$tmp/work" 2>/dev/null
  mkdir -p "$tmp/work/scripts"
  cp -p "$PUSH" "$tmp/work/scripts/push-branch.sh"   # untracked: it must not be part of any branch
  (cd "$tmp/work" && git checkout -q -b feature && echo mine > mine.txt && git add mine.txt && git commit -q -m feature-work)
}

land_on_main() {
  (cd "$tmp/seed" && echo "$1" > "$1.txt" && git add "$1.txt" && git commit -q -m "landed-$1" && git push -q origin main)
}

# run <args...>: run the work clone's copy from an unrelated cwd; sets OUT, ERR, STATUS.
run() {
  STATUS=0
  (cd "$tmp" && "$tmp/work/scripts/push-branch.sh" "$@") >"$tmp/out" 2>"$tmp/err" || STATUS=$?
  OUT="$(cat "$tmp/out")"
  ERR="$(cat "$tmp/err")"
}
head_of() { git -C "$tmp/work" rev-parse HEAD; }
remote_of() { git -C "$tmp/origin.git" rev-parse "refs/heads/$1" 2>/dev/null || echo none; }
main_remote() { git -C "$tmp/origin.git" rev-parse refs/heads/main; }
commit_work() { (cd "$tmp/work" && echo "$1" >> mine.txt && git commit -q -am "$1"); }
sync_work() { (cd "$tmp/work" && git fetch -q origin main && git rebase -q origin/main); }

# --- 1. first push of a new branch ------------------------------------------------------
new_work
main_before="$(main_remote)"
run
[ "$STATUS" -eq 0 ] || fail "1: first push exit $STATUS: $ERR"
[ "$(remote_of feature)" = "$(head_of)" ] || fail "1: remote branch is not HEAD"
[ "$(main_remote)" = "$main_before" ] || fail "1: main moved"
echo "ok 1: first push publishes the branch"

# --- 2. fast-forward push -----------------------------------------------------------------
commit_work second
run
[ "$STATUS" -eq 0 ] || fail "2: fast-forward exit $STATUS: $ERR"
[ "$(remote_of feature)" = "$(head_of)" ] || fail "2: remote is not HEAD"
echo "ok 2: fast-forward push works"

# --- 3. already published: a no-op is fine ------------------------------------------------
run
[ "$STATUS" -eq 0 ] || fail "3: no-op exit $STATUS: $ERR"
echo "ok 3: nothing to push is not an error"

# --- 4. rebased (diverged) branch is published with a pinned lease -----------------------
land_on_main one
old_remote="$(remote_of feature)"
sync_work
[ "$(head_of)" != "$old_remote" ] || fail "4: fixture did not diverge"
run
[ "$STATUS" -eq 0 ] || fail "4: rebased push exit $STATUS: $ERR"
[ "$(remote_of feature)" = "$(head_of)" ] || fail "4: remote is not the rebased HEAD"
[ "$(main_remote)" != "$(head_of)" ] || fail "4: main was overwritten"
git -C "$tmp/work" merge-base --is-ancestor origin/main HEAD || fail "4: not based on main"
echo "ok 4: a rebased branch is published with a lease"

# --- 5. refusals: nothing is pushed, exit 2 and a sync-main/push-branch message ----------
refuses() {
  label="$1"; shift
  before_remote="$(remote_of feature)"
  run "$@"
  [ "$STATUS" -eq 2 ] || fail "5: $label: expected exit 2, got $STATUS ($OUT / $ERR)"
  [ "$(remote_of feature)" = "$before_remote" ] || fail "5: $label: remote branch changed"
  printf '%s' "$ERR" | grep -q 'push-branch' || fail "5: $label: no push-branch message: $ERR"
  return 0
}

commit_work third
refuses 'any argument' --force
refuses 'branch-like argument' main
refuses 'empty argument' ''

# not based on the latest origin/main -> must run sync-main first
land_on_main two
refuses 'branch behind origin/main'
printf '%s' "$ERR" | grep -q 'sync-main' || fail "5: behind-main message does not point at sync-main.sh"
sync_work

git -C "$tmp/work" checkout -q main
refuses 'on main'
git -C "$tmp/work" checkout -q --detach
refuses 'detached HEAD'
git -C "$tmp/work" checkout -q feature
echo "ok 5: arguments, a stale base, main and detached HEAD are refused without pushing"

# --- 6. the remote moved since this clone last saw it: refuse, never clobber ------------
run   # publish the synced branch first
[ "$STATUS" -eq 0 ] || fail "6: setup push failed: $ERR"
(
  cd "$tmp/seed" && git fetch -q origin feature && git checkout -q -b other FETCH_HEAD \
    && echo theirs > theirs.txt && git add theirs.txt && git commit -q -m theirs \
    && git push -q origin other:feature && git checkout -q main
)
theirs="$(remote_of feature)"
land_on_main three
sync_work
commit_work fourth
refuses 'remote moved by someone else'
[ "$(remote_of feature)" = "$theirs" ] || fail "6: someone else's commit was overwritten"
printf '%s' "$ERR" | grep -qi 'moved\|fetch' || fail "6: message does not explain the remote moved: $ERR"
echo "ok 6: a remote that moved since the last fetch is never overwritten"

# --- 7. a branch with no remote tracking record but an existing remote branch ----------
new_work
(cd "$tmp/work" && git push -q origin feature)
(cd "$tmp/work" && git update-ref -d refs/remotes/origin/feature)
sync_work
refuses 'remote branch exists but this clone has no record of it'
echo "ok 7: no last-seen tip means no lease and no push"

# --- 8. a rebase in progress is refused ----------------------------------------------------
new_work
(cd "$tmp/seed" && echo upstream > mine.txt && git add mine.txt && git commit -q -m upstream-mine && git push -q origin main)
(cd "$tmp/work" && git fetch -q origin main && { git rebase origin/main >/dev/null 2>&1 || true; })
[ -d "$tmp/work/.git/rebase-merge" ] || [ -d "$tmp/work/.git/rebase-apply" ] || fail "8: fixture did not stop mid-rebase"
refuses 'rebase in progress'
printf '%s' "$ERR" | grep -q 'in progress' || fail "8: no in-progress message"
(cd "$tmp/work" && git rebase --abort)
echo "ok 8: a rebase in progress is refused"

# --- 9. structural guard -----------------------------------------------------------------
# Comments and heredoc text are guidance for the agent, not commands, so strip them first.
code="$(sed "/<<'[A-Z]*'/,/^[A-Z][A-Z]*\$/d; s/[[:space:]]#.*\$//; /^[[:space:]]*#/d" "$PUSH")"
guard() {
  pattern="$1"; reason="$2"
  if printf '%s\n' "$code" | grep -Eq -e "$pattern"; then
    printf '%s\n' "$code" | grep -En -e "$pattern" >&2
    fail "9: scripts/push-branch.sh must not contain this: $reason"
  fi
}
guard '(^|[^A-Za-z_])eval([^A-Za-z_]|$)' 'eval'
guard '(sh|bash|zsh|dash)[[:space:]]+-[A-Za-z]*c([[:space:]]|$)' 'sh -c'
guard '"\$@"|\$\*' 'forwarding caller words'
guard 'git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(reset|clean|restore|checkout|switch|merge|branch|stash|rm|cherry-pick|commit|add|tag|remote|config|filter-branch|gc|prune|reflog|rebase|pull|update-ref)([[:space:]]|$)' 'only fetch, ls-remote, rev-parse, symbolic-ref, merge-base, status and push may run'
guard '--force([^-]|$)|--force-if-includes|--delete|--tags|--mirror|--all|--prune|--no-verify|-f([[:space:]]|$)|[[:space:]]\+[A-Za-z]|[[:space:]]:[A-Za-z]' 'a bare force, delete, tags, mirror, all, no-verify or a +/: refspec'
guard 'refs/heads/(main|master)' 'pushing to main or master by name'
guard '(^|[;&|({[:space:]])(kill|pkill|killall|rm|gh|curl|wget|sudo)([[:space:]]|$)' 'process signalling, deletion, gh or network helpers'
pushes="$(printf '%s\n' "$code" | grep -Ec 'git[[:space:]]+push' || true)"
[ "$pushes" -ge 1 ] && [ "$pushes" -le 3 ] || fail "9: expected 1-3 push command sites (first, fast-forward, lease), found $pushes"
printf '%s\n' "$code" | grep -E 'git[[:space:]]+push' | grep -Eqv 'HEAD:refs/heads/"?\$branch"?' \
  && fail "9: every push must be exactly HEAD:refs/heads/\$branch"
grep -q 'force-with-lease=' "$PUSH" || fail "9: the lease must be pinned (--force-with-lease=<branch>:<sha>)"
echo "ok 9: structural guard"

echo "ALL PASS"
