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

# --- direct mutation through session.getState() outside game-session.ts/ports.ts ---
case "$file_path" in
  */src/app/game-session.ts|*/src/app/ports.ts)
    : # allowed: game-session.ts is the one sanctioned mutation path; ports.ts is types-only
    ;;
  *)
    if grep -nE 'getState\(\)(\.[A-Za-z0-9_]+[!]?|\[[^]]+\])+\s*=[^=]' "$file_path" | grep -v '//' >/dev/null; then
      lines="$(grep -nE 'getState\(\)(\.[A-Za-z0-9_]+[!]?|\[[^]]+\])+\s*=[^=]' "$file_path" | grep -v '//' | head -5)"
      append "Direct mutation through session.getState() detected -- use session.commit()/session.update() instead (see docs/superpowers/specs/2026-08-15-gamesession-state-mutation-audit-design.md):
$lines"
    fi
    if grep -nE 'delete [A-Za-z0-9_.]*getState\(\)' "$file_path" >/dev/null; then
      lines="$(grep -nE 'delete [A-Za-z0-9_.]*getState\(\)' "$file_path" | head -5)"
      append "delete through session.getState() detected -- build a new object and use session.commit()/session.update() instead:
$lines"
    fi
    ;;
esac

# --- Math.random in src ---
if grep -nE 'Math\.random\(' "$file_path" | grep -v '//' >/dev/null; then
  lines="$(grep -nE 'Math\.random\(' "$file_path" | grep -v '//' | head -5)"
  append "Math.random() is banned in src/ — use seeded RNG (see .claude/rules/game-systems.md#deterministic-rng):
$lines"
fi

# --- research progress is owned by tech-system or a versioned save migration ---
case "$file_path" in
  */src/systems/tech-system.ts|*/src/storage/save-migrations.ts|*/src/storage/research-cost-migration-v*.ts)
    : # explicit state authority / schema migration exception
    ;;
  *)
    if grep -nE 'researchProgress[[:space:]]*(\+?=)|researchProgress[[:space:]]*:[[:space:]]*([^,]*researchProgress[[:space:]]*[+\-]|0[,}]?)' "$file_path" | grep -v '//' >/dev/null; then
      lines="$(grep -nE 'researchProgress[[:space:]]*(\+?=)|researchProgress[[:space:]]*:[[:space:]]*([^,]*researchProgress[[:space:]]*[+\-]|0[,}]?)' "$file_path" | grep -v '//' | head -5)"
      append "Direct researchProgress mutation detected — use applyResearchBonus()/processResearch() in tech-system.ts (except versioned save migrations):
$lines"
    fi
    ;;
esac

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

# --- hardcoded pixel size in sprite-overlay.ts (must derive from hexSize × SPRITE_OVERLAY_WORLD_SIZE_FACTOR) ---
case "$file_path" in
  */src/renderer/sprite-overlay.ts)
    if grep -nE 'width:[0-9]+px|height:[0-9]+px' "$file_path" | grep -v '//\|SPRITE_OVERLAY_WORLD_SIZE_FACTOR' >/dev/null; then
      lines="$(grep -nE 'width:[0-9]+px|height:[0-9]+px' "$file_path" | grep -v '//\|SPRITE_OVERLAY_WORLD_SIZE_FACTOR' | head -5)"
      append "Hardcoded px size in sprite-overlay.ts — wrapper size must derive from camera.hexSize × SPRITE_OVERLAY_WORLD_SIZE_FACTOR (see .claude/rules/sprites.md#sprite-overlay-sizing):
$lines"
    fi
    ;;
esac

# --- hardcoded numeric width/height SVG attribute in v2/index.ts's unit-sprite live fallback ---
# (different syntax from the sprite-overlay.ts check above: this is an SVG attribute, width="128",
# not a CSS style property, width:128px — the DOM overlay wrapper controls actual display size,
# so the inner <svg> must always be responsive: width="100%" height="100%".)
case "$file_path" in
  */src/renderer/sprites/v2/index.ts)
    if grep -nE 'width="[0-9]+"|height="[0-9]+"' "$file_path" | grep -v '//' >/dev/null; then
      lines="$(grep -nE 'width="[0-9]+"|height="[0-9]+"' "$file_path" | grep -v '//' | head -5)"
      append "Hardcoded numeric width/height SVG attribute in v2/index.ts — the DOM overlay wrapper controls display size; the inner <svg> must use width=\"100%\" height=\"100%\" (see .claude/rules/sprites.md#dom-overlay-live-fallback-for-uncovered-unit-sprites):
$lines"
    fi
    ;;
esac

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
