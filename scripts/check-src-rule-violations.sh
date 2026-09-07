#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <file> [file...]" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RNG_BASELINE_FILE="$REPO_ROOT/.claude/rng-legacy-baseline.txt"
# Files that never need to route through createSimulationRng: map generation
# (seeded once from the campaign seed string, before gameId exists), the
# canonical LCG primitive it and createSimulationRng both build on, and
# createSimulationRng's own module (#1021). Everywhere else, a NEW
# hand-rolled LCG constant or truncated-id charCodeAt is flagged unless it is
# in RNG_BASELINE_FILE -- see that file's header for what baselining does and
# does not mean.
RNG_EXEMPT_FILES="src/systems/map-generator.ts src/systems/river-system.ts src/systems/seeded-lcg.ts src/systems/simulation-rng.ts"

is_rng_exempt_file() {
  local f="$1" exempt
  for exempt in $RNG_EXEMPT_FILES; do
    [ "$f" = "$exempt" ] && return 0
  done
  return 1
}

is_rng_baselined() {
  local key="$1:$2" line
  [ -f "$RNG_BASELINE_FILE" ] || return 1
  while IFS= read -r line; do
    line="${line%%#*}"
    line="${line%"${line##*[![:space:]]}"}"
    [ "$line" = "$key" ] && return 0
  done < "$RNG_BASELINE_FILE"
  return 1
}

status=0

append_violation() {
  local file="$1"
  local message="$2"
  printf 'check-src-rule-violations: %s\n%s\n' "$file" "$message" >&2
  status=2
}

append_match_block() {
  local label="$1"
  local lines="$2"
  printf -v violations '%s- %s:\n%s\n' "$violations" "$label" "$lines"
}

for file_path in "$@"; do
  case "$file_path" in
    src/*.ts|src/**/*.ts) ;;
    *) continue ;;
  esac

  [ -f "$file_path" ] || continue
  violations=""

  case "$file_path" in
    src/ai/*|src/systems/faction-system.ts)
      : # allowed: capital heuristics
      ;;
    *)
      if grep -nE '\.cities\[0\]' "$file_path" >/dev/null; then
        lines="$(grep -nE '\.cities\[0\]' "$file_path" | head -5)"
        append_match_block "cities[0] used in a UI/recommendation path — cycle all cities (see .claude/rules/ui-panels.md)" "$lines"
      fi
      ;;
  esac

  if grep -nE 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" >/dev/null; then
    lines="$(grep -nE 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" | head -5)"
    append_match_block "Direct state mutation detected. Turn-processing systems must return a new GameState (see .claude/rules/game-systems.md#immutable-turn-processing)" "$lines"
  fi

  if grep -nE 'Math\.random\(' "$file_path" | grep -v '//' >/dev/null; then
    lines="$(grep -nE 'Math\.random\(' "$file_path" | grep -v '//' | head -5)"
    append_match_block "Math.random() is banned in src/ — use seeded RNG (see .claude/rules/game-systems.md#deterministic-rng)" "$lines"
  fi

  # --- hand-rolled simulation RNG (#1021): new LCG constants and truncated-id
  # charCodeAt() calls under src/systems, src/ai, src/core must use
  # createSimulationRng() instead. Pre-existing occurrences are tracked in
  # RNG_BASELINE_FILE by exact path:line and are not re-flagged here; #982
  # shrinks that file as it converts each one. Comment-only lines (matched
  # the same way the Math.random() rule above excludes them) don't count.
  case "$file_path" in
    src/systems/*|src/ai/*|src/core/*)
      if ! is_rng_exempt_file "$file_path"; then
        rng_pattern='([*]\s*(16807|48271|1664525|104729|92821|99991|73937|65599|7919|31337)\b)|(\.charCodeAt\([0-9]+\))'
        rng_lines=""
        rng_count=0
        while IFS=: read -r lineno content; do
          is_rng_baselined "$file_path" "$lineno" && continue
          rng_count=$((rng_count + 1))
          [ "$rng_count" -le 5 ] && rng_lines="${rng_lines}${lineno}:${content}
"
        done < <(grep -nE "$rng_pattern" "$file_path" | grep -v '//' || true)
        if [ -n "$rng_lines" ]; then
          append_match_block "Hand-rolled simulation RNG constant or truncated-id charCodeAt() detected — use createSimulationRng() from src/systems/simulation-rng.ts instead (see .claude/rules/game-systems.md#deterministic-simulation-rng)" "$rng_lines"
        fi
      fi
      ;;
    *) ;;
  esac

  case "$file_path" in
    src/systems/tech-system.ts|src/storage/save-migrations.ts|src/storage/research-cost-migration-v*.ts|src/storage/migrations/steps/*.ts)
      # Explicit state authority / schema migration exception. #1023 split the
      # 1130-line save-migrations.ts into src/storage/migrations/steps/*, so the
      # migration exemption has to follow the step modules there — a versioned
      # migration retiming persisted research is exactly the documented case.
      :
      ;;
    *)
      if grep -nE 'researchProgress[[:space:]]*(\+?=)|researchProgress[[:space:]]*:[[:space:]]*([^,]*researchProgress[[:space:]]*[+\-]|0[,}]?)' "$file_path" | grep -v '//' >/dev/null; then
        lines="$(grep -nE 'researchProgress[[:space:]]*(\+?=)|researchProgress[[:space:]]*:[[:space:]]*([^,]*researchProgress[[:space:]]*[+\-]|0[,}]?)' "$file_path" | grep -v '//' | head -5)"
        append_match_block "Direct researchProgress mutation detected — use applyResearchBonus()/processResearch() in tech-system.ts (except versioned save migrations)" "$lines"
      fi
      ;;
  esac

  if grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" >/dev/null; then
    lines="$(grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" | head -5)"
    append_match_block "Hardcoded 'player' ownership check — use state.currentPlayer (see .claude/rules/ui-panels.md#hot-seat-multiplayer)" "$lines"
  fi

  # --- movement executor bypass (#1025): the low-level position movers
  # (moveUnitWithZoneOfControl / moveUnit) must not be called outside the
  # canonical movement system. New movement executors go through
  # resolveUnitMoveIntent() + executeValidatedUnitMove() (see
  # .claude/rules/movement-actions.md). A genuinely special world-actor path
  # marks the call line 'movement-contract-exempt: <reason>'.
  case "$file_path" in
    src/systems/unit-system.ts|src/systems/unit-movement-system.ts)
      : # sanctioned: unit-system.ts defines the primitives; unit-movement-system.ts is the canonical executor
      ;;
    *)
      mv_lines="$(grep -nE 'moveUnitWithZoneOfControl\(|(^|[^.A-Za-z_])moveUnit\(' "$file_path" \
        | grep -vE 'movement-contract-exempt|^[0-9]+:[[:space:]]*(//|\*)|export function' | head -5 || true)"
      if [ -n "$mv_lines" ]; then
        append_match_block "Low-level unit mover called outside the movement system — route through resolveUnitMoveIntent()/executeValidatedUnitMove(), or mark the line 'movement-contract-exempt: <reason>' (see .claude/rules/movement-actions.md)" "$mv_lines"
      fi
      ;;
  esac

  if grep -nE 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" >/dev/null; then
    lines="$(grep -nE 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" | head -5)"
    append_match_block "innerHTML with interpolated game data — use textContent or data-text placeholders (see .claude/rules/ui-panels.md#unit-info-panels)" "$lines"
  fi

  if grep -nE ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" >/dev/null; then
    lines="$(grep -nE ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" | head -5)"
    append_match_block "Placeholder return field with 'calculated elsewhere' comment — populate it or remove the field (see .claude/rules/game-systems.md#no-dead-return-fields)" "$lines"
  fi

  if [ -n "$violations" ]; then
    append_violation "$file_path" "$violations"
  fi
done

exit "$status"
