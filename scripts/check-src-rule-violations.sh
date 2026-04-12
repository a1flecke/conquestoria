#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <file> [file...]" >&2
  exit 1
fi

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

  if grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" >/dev/null; then
    lines="$(grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" | head -5)"
    append_match_block "Hardcoded 'player' ownership check — use state.currentPlayer (see .claude/rules/ui-panels.md#hot-seat-multiplayer)" "$lines"
  fi

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
