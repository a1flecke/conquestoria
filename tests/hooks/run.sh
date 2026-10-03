#!/usr/bin/env bash
# Run every *.test.sh under tests/hooks/ and aggregate results.
set -u
# A durable run (`yarn test:durable`) exports DURABLE_FAILURE_KIND_FILE / DURABLE_JOB_PID_FILE so the *lease
# library* can record a cancellation and the job pid for THAT run. This suite executes inside that run, and the
# lease tests below deliberately cancel fake jobs: with the variables inherited they overwrote the real run's
# failure-kind with `cancelled` and its job-pid with a fake pid, so `test:durable:status` reported
# "failed: cancellation recorded" mid-run (observed during #1166/#1025). A hook test must never touch the
# enclosing run's evidence.
unset DURABLE_FAILURE_KIND_FILE DURABLE_JOB_PID_FILE
fail=0
for t in "$(dirname "$0")"/*.test.sh; do
  [ -f "$t" ] || continue
  if bash "$t"; then
    echo "PASS $(basename "$t")"
  else
    echo "FAIL $(basename "$t")"
    fail=1
  fi
done
exit "$fail"
