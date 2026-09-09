#!/usr/bin/env sh
# The fast and slow tiers must be disjoint and their commands must cover the
# same heavy simulation files, so CI can safely run them in separate jobs.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

fake_bin="$tmpdir/bin"
log="$tmpdir/log"
mkdir -p "$fake_bin"

cat > "$fake_bin/yarn" <<'EOF'
#!/bin/sh
printf 'yarn %s\n' "$*" >> "$TEST_LOG"
EOF
chmod +x "$fake_bin/yarn"

PATH="$fake_bin:$PATH" TEST_LOG="$log" \
  sh "$ROOT/scripts/run-tests-by-tier.sh" fast --run tests/systems/city-system.test.ts
fast_command="$(cat "$log")"

: > "$log"
PATH="$fake_bin:$PATH" TEST_LOG="$log" \
  sh "$ROOT/scripts/run-tests-by-tier.sh" slow --run tests/systems/city-system.test.ts
slow_command="$(cat "$log")"

for slow_file in \
  tests/ai/ai-prepared-turn.test.ts \
  tests/ai/basic-ai-worker-roads.test.ts \
  tests/app/determinism-guard.test.ts \
  tests/app/simulation-determinism.test.ts \
  tests/core/turn-manager-beasts.test.ts \
  tests/integration/save-load-mass-discovery.test.ts \
  tests/storage/save-compat-matrix.test.ts \
  tests/integration/pacing-simulation.test.ts \
  tests/ui/tech-panel.test.ts \
  tests/systems/pacing-production-budget.test.ts \
  tests/systems/pacing-reference-economy.test.ts \
  tests/systems/start-placement-system.test.ts \
  tests/systems/world-pressure-fairness.test.ts \
  tests/systems/minor-civ-economy-longrun.test.ts \
  tests/systems/minor-civ-league-longrun.test.ts; do
  printf '%s\n' "$fast_command" | grep -Fq -- "--exclude $slow_file" || {
    echo "fast tier does not exclude $slow_file" >&2
    exit 1
  }
  printf '%s\n' "$slow_command" | grep -Fq -- "$slow_file" || {
    echo "slow tier does not include $slow_file" >&2
    exit 1
  }
done

printf '%s\n' "$fast_command" | grep -Fq 'tests/systems/city-system.test.ts' || {
  echo 'fast tier did not forward focused Vitest filters' >&2
  exit 1
}
printf '%s\n' "$slow_command" | grep -Fq 'tests/systems/city-system.test.ts' || {
  echo 'slow tier did not forward focused Vitest filters' >&2
  exit 1
}
