#!/usr/bin/env bash
# Run every *.test.sh under tests/hooks/ and aggregate results.
set -u
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
