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

test_suite_shard_a_job="$(
  sed -n '/^  test-suite-shard-a:/,/^  test-suite-shard-b:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$test_suite_shard_a_job" | grep -Fq 'timeout-minutes: 15' || {
  echo "GitHub test suite shard A has no 15-minute timeout"
  exit 1
}
printf '%s' "$test_suite_shard_a_job" | grep -Fq 'yarn test:manifest:ci:shard-a' || {
  echo "GitHub test suite shard A does not record its real manifest"
  exit 1
}
printf '%s' "$test_suite_shard_a_job" | grep -Fq 'yarn test:manifest' || {
  echo "GitHub test suite shard A does not record default discovery"
  exit 1
}
printf '%s' "$test_suite_shard_a_job" | grep -Fq 'yarn test:ci:shard-a --report-json artifacts/vitest-results/test-suite-shard-a.json' || {
  echo "GitHub test suite shard A does not run its checked-in shard directly"
  exit 1
}
printf '%s' "$test_suite_shard_a_job" | grep -Fq 'ci-record-phase-timing.mjs --output artifacts/ci-timing/test-suite-shard-a.json --phase test-suite-shard-a' || {
  echo "GitHub test suite shard A does not record its phase timing"
  exit 1
}
printf '%s' "$test_suite_shard_a_job" | grep -Fq 'artifacts/vitest-results/test-suite-shard-a.json' || {
  echo "GitHub test suite shard A does not retain its reporter result"
  exit 1
}
if printf '%s' "$test_suite_shard_a_job" | grep -Eq 'verify:push|yarn build|test:hooks'; then
  echo "GitHub test suite shard A rebuilds, invokes the local verifier, or duplicates hooks"
  exit 1
fi

test_suite_shard_b_job="$(
  sed -n '/^  test-suite-shard-b:/,/^  test-suite-shard-c:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$test_suite_shard_b_job" | grep -Fq 'timeout-minutes: 15' || {
  echo "GitHub test suite shard B has no 15-minute timeout"
  exit 1
}
printf '%s' "$test_suite_shard_b_job" | grep -Fq 'yarn test:manifest:ci:shard-b' || {
  echo "GitHub test suite shard B does not record its real manifest"
  exit 1
}
printf '%s' "$test_suite_shard_b_job" | grep -Fq 'yarn test:ci:shard-b --report-json artifacts/vitest-results/test-suite-shard-b.json' || {
  echo "GitHub test suite shard B does not run its checked-in shard directly"
  exit 1
}
printf '%s' "$test_suite_shard_b_job" | grep -Fq 'ci-record-phase-timing.mjs --output artifacts/ci-timing/test-suite-shard-b.json --phase test-suite-shard-b' || {
  echo "GitHub test suite shard B does not record its phase timing"
  exit 1
}
printf '%s' "$test_suite_shard_b_job" | grep -Fq 'artifacts/vitest-results/test-suite-shard-b.json' || {
  echo "GitHub test suite shard B does not retain its reporter result"
  exit 1
}
if printf '%s' "$test_suite_shard_b_job" | grep -Eq 'verify:push|yarn build|test:hooks'; then
  echo "GitHub test suite shard B rebuilds, invokes the local verifier, or duplicates hooks"
  exit 1
fi

test_suite_shard_c_job="$(
  sed -n '/^  test-suite-shard-c:/,/^  hooks:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$test_suite_shard_c_job" | grep -Fq 'timeout-minutes: 15' || {
  echo "GitHub test suite shard C has no 15-minute timeout"
  exit 1
}
printf '%s' "$test_suite_shard_c_job" | grep -Fq 'yarn test:manifest:ci:shard-c' || {
  echo "GitHub test suite shard C does not record its real manifest"
  exit 1
}
printf '%s' "$test_suite_shard_c_job" | grep -Fq 'yarn test:ci:shard-c --report-json artifacts/vitest-results/test-suite-shard-c.json' || {
  echo "GitHub test suite shard C does not run its checked-in shard directly"
  exit 1
}
printf '%s' "$test_suite_shard_c_job" | grep -Fq 'ci-record-phase-timing.mjs --output artifacts/ci-timing/test-suite-shard-c.json --phase test-suite-shard-c' || {
  echo "GitHub test suite shard C does not record its phase timing"
  exit 1
}
printf '%s' "$test_suite_shard_c_job" | grep -Fq 'artifacts/vitest-results/test-suite-shard-c.json' || {
  echo "GitHub test suite shard C does not retain its reporter result"
  exit 1
}
if printf '%s' "$test_suite_shard_c_job" | grep -Eq 'verify:push|yarn build|test:hooks'; then
  echo "GitHub test suite shard C rebuilds, invokes the local verifier, or duplicates hooks"
  exit 1
fi

hooks_job="$(
  sed -n '/^  hooks:/,/^  pirate-audio-reproducibility:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$hooks_job" | grep -Fq -- '-- yarn test:hooks' || {
  echo "GitHub hooks job does not execute hook coverage exactly once"
  exit 1
}
printf '%s' "$hooks_job" | grep -Fq 'ci-record-phase-timing.mjs --output artifacts/ci-timing/hooks.json --phase hooks' || {
  echo "GitHub hooks job does not record its phase timing"
  exit 1
}

web_build_job="$(
  sed -n '/^  web-build:/,/^  test-suite-shard-a:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$web_build_job" | grep -Fq 'ci-record-phase-timing.mjs --output artifacts/ci-timing/web-build.json --phase web-build' || {
  echo "GitHub web build does not record its phase timing"
  exit 1
}
printf '%s' "$web_build_job" | grep -Fq 'name: ci-timing-web-build' || {
  echo "GitHub web build does not upload its timing record"
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
printf '%s' "$merge_gate_job" | grep -Fq -- '- test-suite-shard-a' || {
  echo "GitHub merge gate does not require test suite shard A"
  exit 1
}
printf '%s' "$merge_gate_job" | grep -Fq -- '- test-suite-shard-b' || {
  echo "GitHub merge gate does not require test suite shard B"
  exit 1
}
printf '%s' "$merge_gate_job" | grep -Fq -- '- test-suite-shard-c' || {
  echo "GitHub merge gate does not require test suite shard C"
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

web_smoke_job="$(
  sed -n '/^  web-smoke:/,/^  tauri-frontend-build:/p' "$ROOT/.github/workflows/deploy.yml"
)"
printf '%s' "$web_smoke_job" | grep -Fq 'if: failure()' || {
  echo "GitHub web smoke job does not retain evidence after a failure"
  exit 1
}
printf '%s' "$web_smoke_job" | grep -Fq 'uses: actions/upload-artifact@' || {
  echo "GitHub web smoke job does not upload Playwright evidence"
  exit 1
}
printf '%s' "$web_smoke_job" | grep -Fq 'test-results' || {
  echo "GitHub web smoke job does not retain Playwright result attachments"
  exit 1
}
printf '%s' "$web_smoke_job" | grep -Fq 'playwright-report' || {
  echo "GitHub web smoke job does not retain the Playwright HTML report"
  exit 1
}
printf '%s' "$web_smoke_job" | grep -Fq 'retention-days: 14' || {
  echo "GitHub web smoke artifacts have no bounded retention"
  exit 1
}

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
