#!/usr/bin/env bash
# Claude Code PostToolUse hook — inspects the most recent Write/Edit target
# and returns exit 2 with stderr feedback if it contains known bug patterns.
#
# This script is fired by settings.json after every Write/Edit under src/.
# Exit 2 means "non-blocking error"; the tool already ran, stderr goes back
# to Claude as feedback for its next turn.

set -u

payload="$(cat)"
file_path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"

# Only police TypeScript source under src/
case "$file_path" in
  */src/*.ts|*/src/**/*.ts|*/src/*.tsx|*/src/**/*.tsx) : ;;
  *) exit 0 ;;
esac

[ -f "$file_path" ] || exit 0

violations=""

append() {
  violations+="- $1
"
}

# --- cities[0] outside known-OK files ---
case "$file_path" in
  */src/ai/*|*/src/systems/faction-system.ts)
    : # allowed: capital heuristics
    ;;
  *)
    if grep -nE '\.cities\[0\]' "$file_path" >/dev/null; then
      lines="$(grep -nE '\.cities\[0\]' "$file_path" | head -5)"
      append "cities[0] used in a UI/recommendation path — cycle all cities (see .claude/rules/ui-panels.md):
$lines"
    fi
    ;;
esac

# --- direct state mutation in turn processing ---
if grep -nE 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" >/dev/null; then
  lines="$(grep -nE 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" | head -5)"
  append "Direct state mutation detected. Turn-processing systems must return a new GameState (see .claude/rules/game-systems.md#immutable-turn-processing):
$lines"
fi

# --- Math.random in src ---
if grep -nE 'Math\.random\(' "$file_path" | grep -v '//' >/dev/null; then
  lines="$(grep -nE 'Math\.random\(' "$file_path" | grep -v '//' | head -5)"
  append "Math.random() is banned in src/ — use seeded RNG (see .claude/rules/game-systems.md#deterministic-rng):
$lines"
fi

# --- hardcoded 'player' ownership check ---
if grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" >/dev/null; then
  lines="$(grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" | head -5)"
  append "Hardcoded 'player' ownership check — use state.currentPlayer (see .claude/rules/ui-panels.md#hot-seat-multiplayer):
$lines"
fi

# --- innerHTML with template-literal game text ---
if grep -nE 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" >/dev/null; then
  lines="$(grep -nE 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" | head -5)"
  append "innerHTML with interpolated game data — use textContent or data-text placeholders (see .claude/rules/ui-panels.md#unit-info-panels):
$lines"
fi

# --- bare createElement('button') without style in src/ui/ ---
# Exceptions: ui-kit.ts (implementation) and primary-action-bar.ts (custom icon-bar design)
case "$file_path" in
  */src/ui/ui-kit.ts|*/src/ui/primary-action-bar.ts)
    : # exempt
    ;;
  */src/ui/*.ts)
    # For each line that contains createElement('button'), check lines N..N+8
    # for any style assignment (any .style. access, cssText, Object.assign with style,
    # or a createGameButton call). If none found, flag the button as bare/unstyled.
    bare_lines=""
    while IFS= read -r line_num; do
      block="$(sed -n "${line_num},$((line_num + 8))p" "$file_path" 2>/dev/null)"
      if ! printf '%s' "$block" | grep -qE '\.style\.|cssText|createGameButton|Object\.assign'; then
        src_line="$(sed -n "${line_num}p" "$file_path" 2>/dev/null)"
        bare_lines="${bare_lines}${line_num}: ${src_line}
"
      fi
    done < <(grep -nE "createElement\('button'\)" "$file_path" 2>/dev/null | cut -d: -f1)
    if [ -n "$bare_lines" ]; then
      append "Bare createElement('button') without adjacent style assignment in src/ui/ — use createGameButton() from src/ui/ui-kit.ts (see .claude/rules/ui-panels.md#no-bare-buttons):
${bare_lines}"
    fi
    ;;
esac

# --- dead return field (heuristic: literal 0/null followed by 'computed' comment) ---
if grep -nE ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" >/dev/null; then
  lines="$(grep -nE ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" | head -5)"
  append "Placeholder return field with 'calculated elsewhere' comment — populate it or remove the field (see .claude/rules/game-systems.md#no-dead-return-fields):
$lines"
fi

# --- Object.assign(window or React import in sprite files ---
case "$file_path" in
  */src/renderer/sprites/*.tsx|*/src/renderer/sprites/*.ts)
    if grep -nE 'Object\.assign\(window' "$file_path" >/dev/null; then
      lines="$(grep -nE 'Object\.assign\(window' "$file_path" | head -5)"
      append "Object.assign(window,...) is banned in sprite files — use named exports (see .claude/rules/sprites.md):
$lines"
    fi
    if grep -nE "from ['\"]react['\"]|from ['\"]react-dom" "$file_path" >/dev/null; then
      lines="$(grep -nE "from ['\"]react['\"]|from ['\"]react-dom" "$file_path" | head -5)"
      append "React imports are banned in sprite files — use the custom jsx-runtime (see .claude/rules/sprites.md):
$lines"
    fi
    ;;
esac

if [ -n "$violations" ]; then
  printf 'check-src-edit: possible rule violations in %s\n%s\n' "$file_path" "$violations" >&2
  exit 2
fi

exit 0
