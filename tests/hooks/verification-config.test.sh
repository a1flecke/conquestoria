#!/usr/bin/env bash
# Declarative wiring checks for the canonical verifier and CI deadline.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

grep -Fq '"verify:push": "sh scripts/verify-before-push.sh --no-mise"' "$ROOT/package.json" || {
  echo "package.json does not expose the canonical verifier"
  exit 1
}

test_job="$(
  sed -n '/^  test:/,/^  web-smoke:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$test_job" | grep -Fq 'timeout-minutes: 15' || {
  echo "GitHub test job has no 15-minute timeout"
  exit 1
}
printf '%s' "$test_job" | grep -Fq 'run: yarn verify:push' || {
  echo "GitHub test job does not use the canonical verifier"
  exit 1
}
