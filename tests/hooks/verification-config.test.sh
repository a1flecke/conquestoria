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
  echo "GitHub fast test lane has no 15-minute timeout"
  exit 1
}
printf '%s' "$test_fast_job" | grep -Fq 'yarn test:manifest:fast' || {
  echo "GitHub fast test lane does not record its real manifest"
  exit 1
}
printf '%s' "$test_fast_job" | grep -Fq 'yarn test:manifest' || {
  echo "GitHub fast test lane does not record default discovery"
  exit 1
}
printf '%s' "$test_fast_job" | grep -Fq 'sh scripts/run-tests-by-tier.sh fast' || {
  echo "GitHub fast test lane does not run the fast tier directly"
  exit 1
}
if printf '%s' "$test_fast_job" | grep -Eq 'verify:push|yarn build'; then
  echo "GitHub fast test lane rebuilds or invokes the local verifier"
  exit 1
fi

test_slow_job="$(
  sed -n '/^  test-slow:/,/^  hooks:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$test_slow_job" | grep -Fq 'yarn test:manifest:slow' || {
  echo "GitHub slow test lane does not record its real manifest"
  exit 1
}
printf '%s' "$test_slow_job" | grep -Fq 'sh scripts/run-tests-by-tier.sh slow' || {
  echo "GitHub slow test lane does not run the slow tier directly"
  exit 1
}
if printf '%s' "$test_slow_job" | grep -Eq 'verify:push|yarn build|test:hooks'; then
  echo "GitHub slow test lane rebuilds, invokes the local verifier, or duplicates hooks"
  exit 1
fi

hooks_job="$(
  sed -n '/^  hooks:/,/^  pirate-audio-reproducibility:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$hooks_job" | grep -Fq 'run: yarn test:hooks' || {
  echo "GitHub hooks job does not execute hook coverage exactly once"
  exit 1
}

merge_gate_job="$(
  sed -n '/^  merge-gate:/,/^  deploy:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$merge_gate_job" | grep -Fq 'if: ${{ always() }}' || {
  echo "GitHub merge gate does not run after failed or skipped children"
  exit 1
}
printf '%s' "$merge_gate_job" | grep -Fq 'GATE_NEEDS_JSON: ${{ toJSON(needs) }}' || {
  echo "GitHub merge gate does not inspect its child results"
  exit 1
}
printf '%s' "$merge_gate_job" | grep -Fq 'uses: actions/checkout@' || {
  echo "GitHub merge gate cannot read its verifier without checking out the repository"
  exit 1
}
printf '%s' "$merge_gate_job" | grep -Fq 'node scripts/verify-merge-gate.mjs' || {
  echo "GitHub merge gate does not run the fail-closed verifier"
  exit 1
}

deploy_job="$(
  sed -n '/^  deploy:/,$p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$deploy_job" | grep -Fq 'needs: [merge-gate]' || {
  echo "Pages deployment does not wait for the aggregate merge gate"
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
