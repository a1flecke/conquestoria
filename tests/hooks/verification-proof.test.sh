#!/usr/bin/env bash
# #1166: `yarn verify:pr` records a capability proof; the local pre-push gate
# (verify-before-push.sh --regular) consumes it for exactly the same clean
# HEAD instead of re-running a weaker subset of the same verification. A
# stale or mismatched proof must never skip verification.

set -eu
unset CI VERIFY_REUSE_PROOF VERIFY_PR_MAX_SECONDS VERIFY_PR_HARD_MAX_SECONDS HVL_CAPACITY_LANE || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"
bin="$tmp/bin"
mkdir -p "$repo/scripts" "$bin"
cp "$ROOT/scripts/verify-pr.sh" "$ROOT/scripts/read-verification-proof.sh" \
  "$ROOT/scripts/read-pr-verification-result.sh" "$ROOT/scripts/verify-before-push.sh" \
  "$ROOT/scripts/run-under-host-lease.sh" "$ROOT/scripts/host-verification-lease.sh" \
  "$repo/scripts/"
printf 'export default {};\n' > "$repo/scripts/run-with-timeout.mjs"
cat > "$repo/scripts/run-with-mise.sh" <<'EOF'
#!/bin/sh
exec "$@"
EOF
chmod +x "$repo/scripts/"*.sh
printf '.verification/\n' > "$repo/.gitignore"
printf 'one\n' > "$repo/source.txt"

git_repo() { git -C "$repo" -c user.name=t -c user.email=t@example.invalid "$@"; }
git_repo init -q
git_repo add -A
git_repo commit -qm initial

# Every yarn call is logged; FAIL_YARN_SCRIPT makes one script fail, and
# DIRTY_DURING makes the durable suite dirty the tree mid-run.
cat > "$bin/yarn" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$YARN_LOG"
printf '%s %s\n' "$1" "${HVL_CAPACITY_LANE:-unset}" >> "$LANE_LOG"
[ -n "${DIRTY_DURING:-}" ] && [ "$1" = test:durable ] && printf 'x\n' > "$DIRTY_DURING"
[ "$1" = "${FAIL_YARN_SCRIPT:-}" ] && exit 1
exit 0
EOF
# run-with-timeout.mjs <seconds> <label> -- <command...>
cat > "$bin/node" <<'EOF'
#!/bin/sh
shift 3
[ "$1" = "--" ] || exit 98
shift
exec "$@"
EOF
chmod +x "$bin/yarn" "$bin/node"

export PATH="$bin:$PATH"
export YARN_LOG="$tmp/yarn.log"
export LANE_LOG="$tmp/lane.log"
export HOST_VERIFICATION_LEASE_ROOT="$tmp/lease/push-verification-lease"

verify_pr() { ( cd "$repo" && sh scripts/verify-pr.sh ) > "$tmp/verify-pr.out" 2>&1; }
push_gate() { ( cd "$repo" && sh scripts/verify-before-push.sh --regular ) > "$tmp/push.out" 2>&1; }
proof() { ( cd "$repo" && sh scripts/read-verification-proof.sh "$@" ) > "$tmp/proof.out" 2>&1; }
fail() { echo "$1"; for f in verify-pr.out push.out proof.out yarn.log; do [ -f "$tmp/$f" ] && { echo "--- $f"; cat "$tmp/$f"; }; done; exit 1; }

# 1. A clean passing verify:pr grants build + test:full, which satisfies the
#    pre-push requirement (build + test:regular) -- test:full subsumes it.
#    Its durable suite runs in the foreground capacity lane.
verify_pr || fail "scenario 1: verify-pr failed"
grep -Fxq 'test:durable foreground' "$LANE_LOG" || fail "scenario 1: verify-pr's durable suite was not in the foreground lane"
grep -Fxq 'capabilities=build,test:full' "$repo/.verification/pr-verification.status" \
  || fail "scenario 1: a clean passing run did not record build,test:full"
proof build test:regular || fail "scenario 1: proof did not satisfy build + test:regular"
grep -Fxq 'STATUS: satisfied' "$tmp/proof.out" || fail "scenario 1: missing STATUS: satisfied"

# 2. The push gate consumes it: no regular suite, no build.
: > "$YARN_LOG"
push_gate || fail "scenario 2: push gate failed"
[ ! -s "$YARN_LOG" ] || fail "scenario 2: push gate re-ran verification despite a matching proof"
grep -Fq 'reusing verify:pr proof' "$tmp/push.out" || fail "scenario 2: push gate did not say it reused the proof"

# 3. VERIFY_REUSE_PROOF=0 and CI both force the real gate.
: > "$YARN_LOG"
( cd "$repo" && VERIFY_REUSE_PROOF=0 sh scripts/verify-before-push.sh --regular ) > "$tmp/push.out" 2>&1 \
  || fail "scenario 3: opt-out push gate failed"
printf 'test:regular\nbuild\n' | cmp -s - "$YARN_LOG" || fail "scenario 3: VERIFY_REUSE_PROOF=0 did not run test:regular then build"
tail -n 2 "$LANE_LOG" | grep -Fxq 'test:regular foreground' || fail "scenario 3: the push gate's regular suite was not in the foreground lane"
: > "$YARN_LOG"
( cd "$repo" && CI=true sh scripts/verify-before-push.sh --regular ) > "$tmp/push.out" 2>&1 \
  || fail "scenario 3: CI push gate failed"
printf 'test:regular\nbuild\n' | cmp -s - "$YARN_LOG" || fail "scenario 3: CI reused a local proof"

# 4. A dirty tree never matches, even with the same HEAD.
printf 'two\n' > "$repo/source.txt"
if proof build test:regular; then fail "scenario 4: a dirty worktree satisfied the proof"; fi
: > "$YARN_LOG"
push_gate || fail "scenario 4: push gate failed"
printf 'test:regular\nbuild\n' | cmp -s - "$YARN_LOG" || fail "scenario 4: dirty tree skipped verification"

# 5. A new commit never matches the old proof.
git_repo commit -qam second
if proof build test:regular; then fail "scenario 5: a proof for the previous HEAD was accepted"; fi

# 6. A run that dirtied the tree while verifying grants no capabilities.
: > "$YARN_LOG"
DIRTY_DURING="$repo/scratch.txt" verify_pr || fail "scenario 6: verify-pr failed"
grep -Fxq 'capabilities=' "$repo/.verification/pr-verification.status" \
  || fail "scenario 6: capabilities granted although the tree changed during verification"
rm -f "$repo/scratch.txt"
if proof build; then fail "scenario 6: proof accepted without capabilities"; fi

# 7. A failed verify:pr is never a proof.
FAIL_YARN_SCRIPT=test:durable verify_pr && fail "scenario 7: failing verify-pr exited 0"
if proof build; then fail "scenario 7: a failed run satisfied the proof"; fi

# 8. A weaker or unknown-format proof never satisfies a stronger requirement.
verify_pr || fail "scenario 8: verify-pr failed"
status_file="$repo/.verification/pr-verification.status"
sed -i.bak 's/^capabilities=.*/capabilities=build,test:regular/' "$status_file"
if proof test:full; then fail "scenario 8: test:regular satisfied test:full"; fi
proof test:regular build || fail "scenario 8: an explicit test:regular capability was not honored"
sed -i.bak 's/^proof_format=.*/proof_format=2/' "$status_file"
if proof build; then fail "scenario 8: an unknown proof_format was accepted"; fi

# 9. End to end through a REAL `git push` and the real .githooks/pre-push.
#    Git exports GIT_DIR and friends to hooks; the proof reader must still
#    resolve this worktree (it silently rejected a valid proof before).
mkdir -p "$repo/.githooks"
cp "$ROOT/.githooks/pre-push" "$repo/.githooks/pre-push"
chmod +x "$repo/.githooks/pre-push"
git_repo add -A
git_repo commit -qm "wire hooks"
git_repo config core.hooksPath .githooks
git init -q --bare "$tmp/remote.git"
git_repo remote add origin "$tmp/remote.git"
# Agents push from LINKED worktrees, where git's hook environment differs from
# a plain checkout -- so push from one.
git_repo worktree add -q "$tmp/linked" -b linked-branch
repo="$tmp/linked"
verify_pr || fail "scenario 9: verify-pr failed"
: > "$YARN_LOG"
git_repo push -q origin HEAD:refs/heads/proof-branch > "$tmp/push.out" 2>&1 || fail "scenario 9: git push with a valid proof failed"
[ ! -s "$YARN_LOG" ] || fail "scenario 9: the real pre-push hook ignored a valid proof and re-ran verification"
grep -Fq 'reusing verify:pr proof' "$tmp/push.out" || fail "scenario 9: the real pre-push hook did not report proof reuse"
# ...and a commit with no proof still gets the full regular gate.
printf 'three\n' > "$repo/source.txt"
git_repo commit -qam third
: > "$YARN_LOG"
git_repo push -q origin HEAD:refs/heads/proof-branch > "$tmp/push.out" 2>&1 || fail "scenario 9: git push without a proof failed"
printf 'test:regular\nbuild\n' | cmp -s - "$YARN_LOG" || fail "scenario 9: a commit without a proof skipped the pre-push gate"

echo "all verification-proof scenarios passed"
