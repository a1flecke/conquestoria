#!/bin/sh
# Splits the vitest suite into two tiers (#608). Most tests are cheap and
# safe to run on every local push-gate. A small set of multi-city/era/seed
# simulation tests are CPU-heavy enough that running them locally on a
# machine that's also running other Claude Code worktree agents can
# oversubscribe CPU and produce spurious timeouts even with no code
# regression — see .claude/rules/hooks-and-tooling.md.
#
# fast: excludes SLOW_TEST_FILES. Used by the local git pre-push hook, the
#       Claude Code push-gate hook, and `yarn test:fast` for day-to-day
#       iteration.
# slow: runs ONLY SLOW_TEST_FILES. For a developer working directly on one
#       of these systems (`yarn test:slow`). CI's `yarn verify:push` does
#       NOT use this split — it runs the full `yarn test` (fast + slow) as
#       the required merge gate, on isolated hardware where contention isn't
#       a factor.
#
# Adding a new heavy multi-city/era/seed simulation test? Add its path to
# SLOW_TEST_FILES below, and give it an explicit headroom-sized timeout per
# .claude/rules/hooks-and-tooling.md.

set -eu

SLOW_TEST_FILES="tests/ai/ai-prepared-turn.test.ts
tests/ai/basic-ai-worker-roads.test.ts
tests/app/determinism-guard.test.ts
tests/app/simulation-determinism.test.ts
tests/core/turn-manager-beasts.test.ts
tests/integration/save-load-mass-discovery.test.ts
tests/storage/save-compat-matrix.test.ts
tests/integration/pacing-simulation.test.ts
tests/ui/tech-panel.test.ts
tests/systems/pacing-production-budget.test.ts
tests/systems/pacing-reference-economy.test.ts
tests/systems/start-placement-system.test.ts
tests/systems/world-pressure-fairness.test.ts
tests/systems/minor-civ-economy-longrun.test.ts
tests/systems/minor-civ-league-longrun.test.ts
tests/scripts/test-tier-selection.test.ts"

MODE="${1:-}"
if [ "$#" -gt 0 ]; then
  shift
fi
LIST_FILES=0
if [ "${1:-}" = "--list-files" ]; then
  LIST_FILES=1
  shift
fi

run_vitest() {
  if [ "$LIST_FILES" -eq 1 ]; then
    exec yarn vitest list --filesOnly "$@"
  fi
  exec yarn vitest run "$@"
}

has_root_relative_filter() {
  for arg in "$@"; do
    case "$arg" in
      tests/*) return 0 ;;
    esac
  done
  return 1
}

# Any remaining Vitest arguments (such as root-relative focused test paths) are
# kept in "$@" and passed through to the final invocation in both modes.
case "$MODE" in
  fast)
    for f in $SLOW_TEST_FILES; do
      # Vitest resolves exclusions beneath `test.dir` (`tests/`), while slow
      # positional filters intentionally stay root-relative for callers.
      exclude_path="${f#tests/}"
      set -- "$@" --exclude "$exclude_path"
    done
    run_vitest "$@"
    ;;
  slow)
    # A root-relative filter narrows slow mode to that focus. Passing the
    # entire slow list alongside it makes Vitest select their union instead.
    if has_root_relative_filter "$@"; then
      run_vitest "$@"
    fi
    # shellcheck disable=SC2086
    run_vitest $SLOW_TEST_FILES "$@"
    ;;
  *)
    echo "Usage: run-tests-by-tier.sh fast|slow [-- extra vitest args]" >&2
    exit 2
    ;;
esac
