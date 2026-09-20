#!/usr/bin/env bash
# #1133 items C/D. run-durable-test-suite.sh now streams its wrapped
# command's output live (not just capturing it silently until the end) and
# drops the real job's pid into a separate `<scope>-suite.job-pid` file as
# soon as it's known; read-durable-test-result.sh uses that pid to tell a
# genuinely active run apart from an abandoned one (a stale `.running`
# marker whose recorded process actually died) -- previously
# indistinguishable, both reported "still running" (exit 3) forever, which
# is the exact bug #1133 cites: "even that reader trusts a `.running` marker
# without checking whether its PID/job is still alive."

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$ROOT/scripts/run-durable-test-suite.sh"
READER="$ROOT/scripts/read-durable-test-result.sh"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
export HOST_VERIFICATION_LEASE_ROOT="$tmpdir/host-lease-root"
repo="$tmpdir/worktree-a"
mkdir -p "$repo/scripts"
cp "$RUNNER" "$READER" "$ROOT/scripts/host-verification-lease.sh" "$ROOT/scripts/run-under-host-lease.sh" "$repo/scripts/"
cp "$ROOT/.gitignore" "$repo/.gitignore"

git -C "$repo" init -q
git -C "$repo" config user.email durable-test@example.invalid
git -C "$repo" config user.name durable-test
touch "$repo/initial"
git -C "$repo" add initial .gitignore
git -C "$repo" commit -qm initial
git -C "$repo" add scripts
git -C "$repo" commit -qm runner

# --- 1. while genuinely running: status is "active", job-pid is real and
#        live, and the durable log streams live (not silently captured and
#        dumped only at the end) ------------------------------------------

(
  cd "$repo"
  sh scripts/run-durable-test-suite.sh full -- sh -c 'echo first-line; sleep 2; echo second-line'
) > "$tmpdir/runner.log" 2>&1 &
runner_pid=$!

attempts=0
while ! grep -Fq 'first-line' "$repo/.verification/full-suite.log" 2>/dev/null; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 100 ] || { echo "durable log never streamed its first line live" >&2; exit 1; }
  sleep 0.1
done
grep -Fq 'second-line' "$repo/.verification/full-suite.log" 2>/dev/null && {
  echo "durable log already has the second line before the job could have printed it -- not a real live stream" >&2
  exit 1
}

[ -f "$repo/.verification/full-suite.job-pid" ] || {
  echo "job-pid file was never created while the run was active" >&2
  exit 1
}
job_pid="$(cat "$repo/.verification/full-suite.job-pid")"
kill -0 "$job_pid" 2>/dev/null || {
  echo "registered job_pid $job_pid is not actually alive" >&2
  exit 1
}

set +e
(
  cd "$repo"
  sh scripts/read-durable-test-result.sh full
) > "$tmpdir/active-read.log" 2>&1
active_status=$?
set -e
[ "$active_status" -eq 3 ] || {
  echo "expected exit 3 (active) while genuinely running, got $active_status" >&2
  cat "$tmpdir/active-read.log" >&2
  exit 1
}
grep -Fxq 'STATUS: active' "$tmpdir/active-read.log" || {
  echo "reader did not print STATUS: active" >&2
  cat "$tmpdir/active-read.log" >&2
  exit 1
}

wait "$runner_pid"
grep -Fq 'second-line' "$repo/.verification/full-suite.log" || {
  echo "durable log is missing output from after the reader checked mid-run" >&2
  exit 1
}

# --- 2. a stale marker whose recorded process is genuinely dead reports
#        "abandoned", not "active" forever ---------------------------------

rm -rf "$repo/.verification"
mkdir -p "$repo/.verification"
dead_pid=99999
while kill -0 "$dead_pid" 2>/dev/null; do
  dead_pid=$((dead_pid + 1))
done
printf 'pid=%s\nworktree=%s\nhead=%s\nstarted_at=2000-01-01T00:00:00Z\n' \
  "$dead_pid" "$repo" "$(git -C "$repo" rev-parse HEAD)" > "$repo/.verification/full-suite.running"
printf '%s\n' "$dead_pid" > "$repo/.verification/full-suite.job-pid"

set +e
(
  cd "$repo"
  sh scripts/read-durable-test-result.sh full
) > "$tmpdir/abandoned-read.log" 2>&1
abandoned_status=$?
set -e
[ "$abandoned_status" -eq 4 ] || {
  echo "expected exit 4 (abandoned) for a dead recorded job, got $abandoned_status" >&2
  cat "$tmpdir/abandoned-read.log" >&2
  exit 1
}
grep -Fxq 'STATUS: abandoned' "$tmpdir/abandoned-read.log" || {
  echo "reader did not print STATUS: abandoned" >&2
  cat "$tmpdir/abandoned-read.log" >&2
  exit 1
}

echo "all run-durable-test-suite live-tee/abandoned-detection scenarios passed"
