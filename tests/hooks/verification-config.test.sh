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

pirate_audio_job="$(
  sed -n '/^  pirate-audio-reproducibility:/,/^  web-smoke:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$pirate_audio_job" | grep -Fq 'timeout-minutes: 10' || {
  echo "Pirate audio reproducibility job has no bounded timeout"
  exit 1
}
printf '%s' "$pirate_audio_job" | grep -Fq 'id: pirate-audio-changes' || {
  echo "Pirate audio reproducibility job has no scoped input check"
  exit 1
}
printf '%s' "$pirate_audio_job" | grep -Fq "RUN_PIRATE_SFX_DETERMINISM=1 yarn vitest run tests/audio/pirate-sfx-generator.test.ts" || {
  echo "Pirate audio reproducibility job does not run the scoped determinism test"
  exit 1
}
