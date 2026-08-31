#!/usr/bin/env bash
# Failure-classification contract for run-test-suite.sh's `full` mode (#892).
# Confirms Vitest pool/runner-infrastructure failures are distinguished from
# real product-test assertion failures, using both synthetic log fixtures
# and one real Vitest run to keep the fixtures honest.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNNER="$ROOT/scripts/run-test-suite.sh"

[ -x "$RUNNER" ] || {
  echo "run-test-suite.sh is missing or not executable" >&2
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
fake_bin="$tmpdir/bin"
mkdir -p "$fake_bin"

# --- fixture-driven classification: synthetic yarn output ---------------

run_with_fixture() {
  # run_with_fixture <fixture-file> <vitest-exit-code>
  fixture="$1"
  vitest_exit="$2"
  kind_file="$tmpdir/kind"
  rm -f "$kind_file"

  cat > "$fake_bin/yarn" <<EOF
#!/bin/sh
cat "$fixture"
exit $vitest_exit
EOF
  chmod +x "$fake_bin/yarn"

  set +e
  (
    cd "$ROOT"
    PATH="$fake_bin:$PATH" DURABLE_FAILURE_KIND_FILE="$kind_file" \
      sh "$RUNNER" full
  ) >/dev/null 2>&1
  fixture_status=$?
  set -e
  [ -f "$kind_file" ] && cat "$kind_file" || echo 'none'
}

# A. genuine assertion failure -> product-test
cat > "$tmpdir/assertion-failure.log" <<'EOF'
 RUN  v4.1.9 /repo

 ❯ tests/tmp-scratch/fake-failure.test.ts (1 test | 1 failed) 8ms
     × fails on purpose 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/tmp-scratch/fake-failure.test.ts > scratch > fails on purpose
AssertionError: expected 1 to be 2 // Object.is equality

 Test Files  1 failed (1)
      Tests  1 failed (1)
EOF
kind="$(run_with_fixture "$tmpdir/assertion-failure.log" 1)"
[ "$kind" = 'product-test' ] || {
  echo "expected product-test for a genuine assertion failure, got: $kind" >&2
  exit 1
}

# B. pool startup failure ("Timeout waiting for worker to respond") -> runner-infrastructure
cat > "$tmpdir/pool-timeout.log" <<'EOF'
 RUN  v4.1.9 /repo

Error: [vitest-pool-runner]: Timeout waiting for worker to respond
    at Runner.withTimeout (file:///repo/node_modules/vitest/dist/chunks/cli-api.js:3041:1)
    at Runner.waitForStart (file:///repo/node_modules/vitest/dist/chunks/cli-api.js:3027:1)
EOF
kind="$(run_with_fixture "$tmpdir/pool-timeout.log" 1)"
[ "$kind" = 'runner-infrastructure' ] || {
  echo "expected runner-infrastructure for a pool-startup timeout, got: $kind" >&2
  exit 1
}

# C. worker exited unexpectedly -> runner-infrastructure
cat > "$tmpdir/worker-exit.log" <<'EOF'
 RUN  v4.1.9 /repo

Error: Worker exited unexpectedly
    at ChildProcess.emitUnexpectedExit (file:///repo/node_modules/vitest/dist/chunks/cli-api.js:3023:1)
EOF
kind="$(run_with_fixture "$tmpdir/worker-exit.log" 1)"
[ "$kind" = 'runner-infrastructure' ] || {
  echo "expected runner-infrastructure for an unexpected worker exit, got: $kind" >&2
  exit 1
}

# D. Node OOM crash -> runner-infrastructure
cat > "$tmpdir/oom.log" <<'EOF'

<--- Last few GCs --->

FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
EOF
kind="$(run_with_fixture "$tmpdir/oom.log" 1)"
[ "$kind" = 'runner-infrastructure' ] || {
  echo "expected runner-infrastructure for a Node OOM crash, got: $kind" >&2
  exit 1
}

# E. mixed output: a real product failure alongside a pool error -> product-test wins
cat > "$tmpdir/mixed.log" <<'EOF'
 RUN  v4.1.9 /repo

 ❯ tests/tmp-scratch/fake-failure.test.ts (1 test | 1 failed) 8ms
     × fails on purpose 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/tmp-scratch/fake-failure.test.ts > scratch > fails on purpose
AssertionError: expected 1 to be 2 // Object.is equality

Error: [vitest-pool-runner]: Timeout waiting for worker to respond

 Test Files  1 failed (1)
      Tests  1 failed (1)
EOF
kind="$(run_with_fixture "$tmpdir/mixed.log" 1)"
[ "$kind" = 'product-test' ] || {
  echo "expected product-test to take precedence when a real failure and a pool error both appear, got: $kind" >&2
  exit 1
}

# F. unrecognized non-zero exit with no known marker -> falls back to product-test,
#    never silently to a passing/no-op classification.
cat > "$tmpdir/unknown.log" <<'EOF'
some unrelated tool crash with no recognizable Vitest shape at all
EOF
kind="$(run_with_fixture "$tmpdir/unknown.log" 1)"
[ "$kind" = 'product-test' ] || {
  echo "expected the safe product-test default for an unrecognized failure, got: $kind" >&2
  exit 1
}

# G. success is never classified at all (no failure_kind file content).
cat > "$tmpdir/passing.log" <<'EOF'
 Test Files  3 passed (3)
      Tests  10 passed (10)
EOF
# A passing yarn vitest run still needs tests/hooks/run.sh to succeed for
# run-test-suite.sh's `full` mode to exit 0; fake that too.
cat > "$fake_bin/bash" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$fake_bin/bash"
kind_file="$tmpdir/kind-pass"
rm -f "$kind_file"
cat > "$fake_bin/yarn" <<EOF
#!/bin/sh
cat "$tmpdir/passing.log"
exit 0
EOF
chmod +x "$fake_bin/yarn"
(
  cd "$ROOT"
  PATH="$fake_bin:$PATH" DURABLE_FAILURE_KIND_FILE="$kind_file" \
    sh "$RUNNER" full
) >/dev/null 2>&1
pass_status=$?
[ "$pass_status" -eq 0 ] || {
  echo "a passing fixture unexpectedly failed run-test-suite.sh full" >&2
  exit 1
}
[ ! -s "$kind_file" ] || {
  echo "a passing run should never write a failure_kind" >&2
  exit 1
}

# --- real Vitest run: keep the fixture text honest against the actually
#     installed Vitest version, not just a hand-written guess. -----------

real_scratch_dir="$ROOT/tests/hooks/classification-assertion-probe-892"
mkdir -p "$real_scratch_dir"
cat > "$real_scratch_dir/real-failure.test.ts" <<'EOF'
import { describe, it, expect } from 'vitest';
describe('classification fixture', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
EOF
cleanup_real() {
  rm -rf "$real_scratch_dir"
}
trap 'cleanup_real; rm -rf "$tmpdir"' EXIT

real_log="$tmpdir/real-vitest-output.log"
(
  cd "$ROOT"
  yarn vitest run "tests/hooks/classification-assertion-probe-892/real-failure.test.ts"
) > "$real_log" 2>&1 || true
grep -Eq 'Failed Tests [0-9]+' "$real_log" || {
  echo "the installed Vitest no longer prints a 'Failed Tests N' banner for a real assertion failure -- update classify_vitest_log's product-test marker" >&2
  cat "$real_log" >&2
  exit 1
}

echo "all run-test-suite.sh classification scenarios passed"
