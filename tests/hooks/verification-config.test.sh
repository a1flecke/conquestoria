#!/usr/bin/env bash
# Declarative wiring checks for the canonical verifier and CI deadline.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

grep -Fq '"verify:push": "sh scripts/verify-before-push.sh --no-mise"' "$ROOT/package.json" || {
  echo "package.json does not expose the canonical verifier"
  exit 1
}
grep -Fq '"verify:pr": "sh scripts/verify-pr.sh"' "$ROOT/package.json" || {
  echo "package.json does not expose the durable PR verifier"
  exit 1
}
grep -Fq '"verify:pr:status": "sh scripts/read-pr-verification-result.sh"' "$ROOT/package.json" || {
  echo "package.json does not expose the PR verification status reader"
  exit 1
}

test_fast_job="$(
  sed -n '/^  test-fast:/,/^  test-slow:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$test_fast_job" | grep -Fq 'timeout-minutes: 15' || {
  echo "GitHub fast test job has no 15-minute timeout"
  exit 1
}
printf '%s' "$test_fast_job" | grep -Fq 'run: yarn verify:push --fast' || {
  echo "GitHub fast test job does not use the fast canonical verifier"
  exit 1
}
if printf '%s' "$test_fast_job" | grep -Fq 'Install audio test tooling'; then
  echo "GitHub fast test job runs pirate audio tooling in the parallel suite"
  exit 1
fi

test_slow_job="$(
  sed -n '/^  test-slow:/,/^  test:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$test_slow_job" | grep -Fq 'timeout-minutes: 15' || {
  echo "GitHub slow test job has no 15-minute timeout"
  exit 1
}
printf '%s' "$test_slow_job" | grep -Fq 'run: yarn test:slow' || {
  echo "GitHub slow test job does not run the slow tier"
  exit 1
}
if printf '%s' "$test_slow_job" | grep -Fq 'run: yarn verify:push'; then
  echo "GitHub slow test job duplicates the fast verifier"
  exit 1
fi

test_aggregator_job="$(
  sed -n '/^  test:/,/^  pirate-audio-reproducibility:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$test_aggregator_job" | grep -Fq 'needs: [test-fast, test-slow]' || {
  echo "GitHub test aggregate job does not require both test partitions"
  exit 1
}
printf '%s' "$test_aggregator_job" | grep -Fq 'if: ${{ always()' || {
  echo "GitHub test aggregate job does not run after failed partitions"
  exit 1
}
printf '%s' "$test_aggregator_job" | grep -Fq 'FAST_RESULT: ${{ needs.test-fast.result }}' || {
  echo "GitHub test aggregate job does not inspect the fast partition result"
  exit 1
}
printf '%s' "$test_aggregator_job" | grep -Fq 'SLOW_RESULT: ${{ needs.test-slow.result }}' || {
  echo "GitHub test aggregate job does not inspect the slow partition result"
  exit 1
}
if printf '%s' "$test_aggregator_job" | grep -Fq 'run: yarn verify:push'; then
  echo "GitHub test aggregate job reruns the verifier"
  exit 1
fi

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
printf '%s' "$pirate_audio_job" | grep -Fq "run: RUN_PIRATE_SFX_DETERMINISM=1 yarn vitest run tests/audio/pirate-sfx-generator.test.ts" || {
  echo "Pirate audio reproducibility job does not run the scoped generator test"
  exit 1
}
if printf '%s' "$pirate_audio_job" | grep -Fq -- ' -t '; then
  echo "Pirate audio reproducibility job skips catalog or format coverage"
  exit 1
fi

grep -Fq 'VITEST_MAX_WORKERS' "$ROOT/vite.config.ts" || {
  echo "Vitest worker count cannot be overridden with the official environment variable"
  exit 1
}
grep -Fq "process.env.CI ? '100%' : '25%'" "$ROOT/vite.config.ts" || {
  echo "Vitest does not declare separate local and CI worker budgets"
  exit 1
}
grep -Fq 'CONQUESTORIA_VITEST_CACHE_DIR' "$ROOT/vite.config.ts" || {
  echo "Vitest does not use the worktree cache override"
  exit 1
}
grep -Fq "dir: resolve(__dirname, 'tests')" "$ROOT/vite.config.ts" || {
  echo "Vitest does not limit discovery to the tests directory"
  exit 1
}
grep -Fxq '.vite/' "$ROOT/.gitignore" || {
  echo "worktree-local Vite caches are not ignored"
  exit 1
}
grep -Fxq '.verification/' "$ROOT/.gitignore" || {
  echo "worktree-local durable verification artifacts are not ignored"
  exit 1
}
grep -Fq '"test:durable": "sh scripts/run-durable-test-suite.sh full -- sh scripts/run-test-suite.sh full"' "$ROOT/package.json" || {
  echo "package.json does not expose the durable full-suite runner"
  exit 1
}
grep -Fq '"test:durable:status": "sh scripts/read-durable-test-result.sh full"' "$ROOT/package.json" || {
  echo "package.json does not expose the durable full-suite status reader"
  exit 1
}
grep -Fq 'Never chain `yarn build && yarn test`' "$ROOT/AGENTS.md" || {
  echo "AGENTS.md permits chained build and test verification"
  exit 1
}
grep -Fq 'verify the remote branch ref equals local `HEAD`' "$ROOT/AGENTS.md" || {
  echo "AGENTS.md does not require remote SHA confirmation after incomplete push output"
  exit 1
}
