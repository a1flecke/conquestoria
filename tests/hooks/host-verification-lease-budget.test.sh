#!/usr/bin/env bash
# #1133 items H/J. hvl_acquire_budget_slot/hvl_release_budget_slot are a
# host-wide COUNTING semaphore (as opposed to the single-slot mkdir mutex
# hvl_acquire/hvl_release provide): they cap the TOTAL number of
# concurrently active heavyweight Vitest invocations regardless of which
# command/worktree/agent started them. Before this, plain `yarn test`/
# `test:regular`/`test:intensive-simulations` (scripts/run-test-suite.sh's
# three modes) had NO gating at all.

set -eu
# Same reason host-verification-lease.test.sh and
# host-verification-lease-process-group.test.sh unset CI: GitHub Actions
# always sets CI=true, which this budget (like the mutex) treats as
# "do not coordinate at all" by design.
unset CI || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/host-verification-lease.sh"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
export HVL_DEBUG_TRACE=1
lease_root="$tmpdir/lease-root"
mkdir -p "$lease_root"
export HOST_VERIFICATION_LEASE_ROOT="$lease_root"
# hvl_resolve_host_scope_dir derives the budget directory as dirname(root)/budget
# -- a SIBLING of lease_root, not something inside it -- so every scenario reset
# below must clear both paths explicitly; clearing lease_root alone leaves a
# previous scenario's budget-slot directories in place for the next one.
budget_dir="$tmpdir/budget"

wait_for_marker() {
  # wait_for_marker <marker-file>
  attempts=0
  while [ ! -e "$1" ]; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 100 ]; then
      echo "marker $1 never appeared within 10s" >&2
      exit 1
    fi
    sleep 0.1
  done
}

# holder_script (used only by scenario 1) holds its slot until an explicit
# release-signal file appears, rather than for a fixed `sleep N` duration.
# An earlier version used `sleep 3` holders and a fixed `sleep 0.6` check
# window; that passed every isolated run but failed intermittently the one
# time it ran as part of a real full `yarn test` invocation on a loaded
# host (real contention -- other agents' verification runs, per this repo's
# own concurrent-agents norm -- is exactly the condition this budget exists
# to handle). Under enough scheduling delay, the cumulative wall-clock time
# to launch both holders and confirm their acquire markers can itself
# approach or exceed a fixed 3s hold, so the third holder's 0.6s check
# window could catch a slot the first holder had already, legitimately,
# finished and released -- not a semaphore bug, a fragile fixed-timing
# assertion (the same class of flake `.claude/rules/hooks-and-tooling.md`'s
# "Heavy simulation tests need an explicit, headroom-sized timeout" section
# already warns about, applied to a concurrency test's hold window instead
# of a computation's runtime). Holding until signaled removes wall-clock
# duration from the correctness assertion entirely: no matter how slow or
# fast the host schedules these processes, the first two holders cannot
# release before the third holder's "must still be blocked" check has
# already been observed.
holder_script="$tmpdir/holder.sh"
cat > "$holder_script" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire_budget_slot
: > "\$1"
release_signal="\$2"
attempts=0
while [ ! -e "\$release_signal" ]; do
  attempts=\$((attempts + 1))
  if [ "\$attempts" -ge 300 ]; then
    echo "release signal \$release_signal never appeared within 30s" >&2
    exit 1
  fi
  sleep 0.1
done
hvl_release_budget_slot
EOF
chmod +x "$holder_script"

# --- 1. up to HOST_VERIFICATION_LEASE_BUDGET holders proceed concurrently,
#        the next one waits -----------------------------------------------

export HOST_VERIFICATION_LEASE_BUDGET=2
m1="$tmpdir/m1"; m2="$tmpdir/m2"; m3="$tmpdir/m3"
release1="$tmpdir/release1"; release2="$tmpdir/release2"; release3="$tmpdir/release3"

sh "$holder_script" "$m1" "$release1" &
p1=$!
wait_for_marker "$m1"

sh "$holder_script" "$m2" "$release2" &
p2=$!
wait_for_marker "$m2"

# A third holder must NOT be able to acquire while two are already in --
# m1/m2 are guaranteed to still be holding (they will not release until
# release1/release2 are created below), so this check cannot be racing
# against their own unrelated expiry the way a fixed-sleep hold could.
sh "$holder_script" "$m3" "$release3" &
p3=$!
sleep 0.6
[ ! -e "$m3" ] || {
  echo "a third holder acquired a slot while HOST_VERIFICATION_LEASE_BUDGET=2 already had two live holders" >&2
  exit 1
}

: > "$release1"
: > "$release2"
wait "$p1" 2>/dev/null || true
wait "$p2" 2>/dev/null || true
wait_for_marker "$m3"
: > "$release3"
wait "$p3" 2>/dev/null || true

# --- 2. a nested acquisition (HVL_BUDGET_HELD already set) is a no-op,
#        does not consume a second slot, AND the matching pair of releases
#        actually frees the real slot -----------------------------------
#
# hvl_resolve_host_scope_dir derives the budget directory as a SIBLING of
# HOST_VERIFICATION_LEASE_ROOT (dirname of it), not something reset by this
# file's own `rm -rf "$lease_root"` between scenarios -- so a slot leaked
# here would still be sitting in "$tmpdir/budget" when scenario 4 runs. An
# earlier implementation tracked nesting with a plain "already held" flag
# rather than a depth counter: HVL_BUDGET_NESTED reflected only the LAST
# acquire call's nested-ness, so both of two releases below (one real, one
# nested, called in acquire order) read it as nested and skipped the real
# release -- the actual slot was never removed. This regressed silently
# until the real budget-directory contents were inspected directly, which is
# exactly what the assertion below now does.

rm -rf "$lease_root" "$budget_dir"; mkdir -p "$lease_root"
nested_script="$tmpdir/nested.sh"
cat > "$nested_script" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire_budget_slot
first_nested="\$HVL_BUDGET_NESTED"
hvl_acquire_budget_slot
second_nested="\$HVL_BUDGET_NESTED"
printf 'first=%s second=%s\n' "\$first_nested" "\$second_nested" > "\$1"
hvl_release_budget_slot
hvl_release_budget_slot
EOF
chmod +x "$nested_script"
nested_out="$tmpdir/nested-out"
HOST_VERIFICATION_LEASE_BUDGET=1 sh "$nested_script" "$nested_out"
grep -Fxq 'first=0 second=1' "$nested_out" || {
  echo "nested acquisition did not report itself as nested (contents: $(cat "$nested_out"))" >&2
  exit 1
}
[ -z "$(find "$budget_dir" -mindepth 1 2>/dev/null)" ] || {
  echo "a matched nested acquire/release pair leaked a slot: $(find "$budget_dir" -mindepth 1 2>/dev/null)" >&2
  exit 1
}

# --- 3. CI=true is a no-op, same as the mkdir mutex ------------------------

rm -rf "$lease_root" "$budget_dir"; mkdir -p "$lease_root"
ci_script="$tmpdir/ci.sh"
cat > "$ci_script" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire_budget_slot
printf 'skipped=%s\n' "\$HVL_BUDGET_SKIPPED" > "\$1"
hvl_release_budget_slot
EOF
chmod +x "$ci_script"
ci_out="$tmpdir/ci-out"
CI=true sh "$ci_script" "$ci_out"
grep -Fxq 'skipped=1' "$ci_out" || {
  echo "CI=true did not skip budget coordination (contents: $(cat "$ci_out"))" >&2
  exit 1
}
[ ! -d "$budget_dir" ] || [ -z "$(ls -A "$budget_dir" 2>/dev/null)" ] || {
  echo "CI=true left behind a budget marker" >&2
  exit 1
}

# --- 4. many holders racing to acquire SIMULTANEOUSLY never oversubscribe
#        the budget ---------------------------------------------------------
#
# Scenarios 1-3 above sequence holders one at a time (wait_for_marker
# between each), which cannot exercise real concurrent contention for the
# SAME slot. An earlier implementation of hvl_acquire_budget_slot counted
# live marker files and then wrote its own -- a classic time-of-check-to-
# time-of-use race across those two separate steps -- and passed scenarios
# 1-3 every time locally, but reliably let a 3rd/4th holder in once several
# real `yarn test` processes were racing for real on a genuinely busy host.
# This scenario reproduces that condition directly: N holders launched as
# close to simultaneously as this shell can manage (no staggering), racing
# for a budget far smaller than N.

rm -rf "$lease_root" "$budget_dir"; mkdir -p "$lease_root"
export HOST_VERIFICATION_LEASE_BUDGET=3
race_log="$tmpdir/race.log"
: > "$race_log"
race_script="$tmpdir/race.sh"
cat > "$race_script" <<EOF
#!/bin/sh
set -eu
. "$LIB"
hvl_acquire_budget_slot
echo "\$\$ acquired" >> "$race_log"
sleep 0.3
echo "\$\$ released" >> "$race_log"
hvl_release_budget_slot
EOF
chmod +x "$race_script"

race_pids=""
race_n=10
race_i=0
while [ "$race_i" -lt "$race_n" ]; do
  sh "$race_script" >/dev/null 2>&1 &
  race_pids="$race_pids $!"
  race_i=$((race_i + 1))
done
for race_pid in $race_pids; do
  wait "$race_pid" 2>/dev/null || true
done

# Walk the log IN THE ORDER EACH LINE WAS APPENDED (small appends to one
# file are atomic, so this order is a real, valid serialization of the
# actual acquire/release calls -- no wall-clock timestamps needed): a
# running count of "acquired" minus "released" must never exceed the
# budget. This is exactly the invariant the earlier buggy implementation
# violated under real contention.
race_max_live="$(awk '
  { if ($2 == "acquired") { live++ } else { live-- }
    if (live > max) { max = live } }
  END { print max + 0 }
' "$race_log")"
race_event_count="$(wc -l < "$race_log" | tr -d ' ')"
[ "$race_event_count" -eq "$(( race_n * 2 ))" ] || {
  echo "expected $((race_n * 2)) acquire/release log lines from $race_n racing holders, got $race_event_count" >&2
  cat "$race_log" >&2
  exit 1
}
[ "$race_max_live" -le "$HOST_VERIFICATION_LEASE_BUDGET" ] || {
  echo "budget oversubscribed: $race_max_live holders live at once against a budget of $HOST_VERIFICATION_LEASE_BUDGET" >&2
  cat "$race_log" >&2
  exit 1
}

# --- 5. a descendant process acquiring a DIFFERENT budget domain is never
#        treated as a nested no-op just because an ancestor process holds a
#        real slot in some OTHER domain --------------------------------------
#
# This is the actual root cause behind scenarios 1-4 above failing
# intermittently the couple of times this file ran as part of a real,
# non-isolated `yarn test full` invocation (never once in 15+ standalone
# runs, under dash, or under synthetic CPU stress): `run-test-suite.sh
# full` acquires the REAL, default-rooted budget once around vitest + the
# entire hook-test suite, so every hook test -- including every scenario
# above -- runs as a DESCENDANT of that held slot. The reentrancy depth
# counter is exported, so it is inherited by descendant processes, not just
# genuine nested function calls within the same process. Before this
# scenario existed, the counter was a single global name: a descendant
# resolving a completely different (test-overridden) budget directory would
# still see the ancestor's inherited depth as "already held" and skip real
# mkdir contention entirely, so all of scenarios 1-4's holders "succeeded"
# instantly with no real coordination happening at all. The fix keys the
# depth counter by a hash of the resolved budget directory; this scenario
# proves a genuinely different domain is never mistaken for the same one.

rm -rf "$lease_root" "$budget_dir"; mkdir -p "$lease_root"
# Each domain's root needs a DIFFERENT PARENT directory -- the budget dir is
# resolved as dirname(HOST_VERIFICATION_LEASE_ROOT)/budget, so two roots
# sharing one parent (e.g. "$tmpdir/domain-a-root" and "$tmpdir/domain-b-root"
# both under "$tmpdir") would collide on the exact same budget directory and
# defeat the point of this scenario.
domain_a_root="$tmpdir/domain-a/lease-root"; mkdir -p "$domain_a_root"
domain_b_root="$tmpdir/domain-b/lease-root"; mkdir -p "$domain_b_root"
domain_b_budget_dir="$tmpdir/domain-b/budget"

ancestor_script="$tmpdir/ancestor.sh"
cat > "$ancestor_script" <<EOF
#!/bin/sh
set -eu
. "$LIB"
export HOST_VERIFICATION_LEASE_ROOT="$domain_a_root"
export HOST_VERIFICATION_LEASE_BUDGET=1
hvl_acquire_budget_slot
ancestor_nested="\$HVL_BUDGET_NESTED"

descendant_script="\$1"
cat > "\$descendant_script" <<INNER
#!/bin/sh
set -eu
. "$LIB"
export HOST_VERIFICATION_LEASE_ROOT="$domain_b_root"
export HOST_VERIFICATION_LEASE_BUDGET=1
hvl_acquire_budget_slot
printf 'descendant_nested=%s\n' "\\\$HVL_BUDGET_NESTED" > "\$2"
hvl_release_budget_slot
INNER
chmod +x "\$descendant_script"
sh "\$descendant_script" "\$2"

printf 'ancestor_nested=%s\n' "\$ancestor_nested" >> "\$2"
hvl_release_budget_slot
EOF
chmod +x "$ancestor_script"
domain_out="$tmpdir/domain-out"
descendant_script_path="$tmpdir/descendant.sh"
sh "$ancestor_script" "$descendant_script_path" "$domain_out"

grep -Fxq 'ancestor_nested=0' "$domain_out" || {
  echo "ancestor's own real acquisition was not reported as non-nested (contents: $(cat "$domain_out"))" >&2
  exit 1
}
grep -Fxq 'descendant_nested=0' "$domain_out" || {
  echo "a descendant process acquiring a DIFFERENT budget domain was wrongly treated as a nested no-op of its ancestor's unrelated real acquisition (contents: $(cat "$domain_out"))" >&2
  exit 1
}
[ -z "$(find "$domain_b_budget_dir" -mindepth 1 2>/dev/null)" ] || {
  echo "domain B's slot was not actually released" >&2
  exit 1
}

echo "all host-verification-lease budget scenarios passed"
