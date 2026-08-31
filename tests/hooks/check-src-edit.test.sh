#!/usr/bin/env bash
# Smoke test: check-src-edit.sh must exit 2 with feedback when a Write/Edit
# under src/ contains a known rule violation, and exit 0 for clean files or
# files outside src/. The hook reads the actual file contents on disk, so the
# test writes fixture files under a temp src/ tree and points the hook at them.
set -u
HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/check-src-edit.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/src/ui" "$tmp/src/systems" "$tmp/src/ai"

fail=0

run_hook() {
  local file="$1"
  echo "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$file\"}}" \
    | bash "$HOOK" 2>&1
}

expect_block() {
  local file="$1" name="$2"
  out="$(run_hook "$file")"; rc=$?
  if [ "$rc" != "2" ]; then
    echo "expected exit 2 for $name ($file), got $rc"; echo "$out"; fail=1
  fi
}

expect_allow() {
  local file="$1" name="$2"
  out="$(run_hook "$file")"; rc=$?
  if [ "$rc" != "0" ]; then
    echo "expected exit 0 for $name ($file), got $rc"; echo "$out"; fail=1
  fi
}

# --- block: cities[0] in a UI file ---
cat > "$tmp/src/ui/panel.ts" <<'EOF'
const c = state.civ.cities[0];
EOF
expect_block "$tmp/src/ui/panel.ts" "cities[0] in src/ui"

# --- allow: cities[0] in src/ai (capital heuristic exception) ---
cat > "$tmp/src/ai/basic-ai.ts" <<'EOF'
const capital = civ.cities[0];
EOF
expect_allow "$tmp/src/ai/basic-ai.ts" "cities[0] allowed in src/ai"

# --- block: direct mutation through session.getState() in src/app ---
cat > "$tmp/src/ui/panel.ts" <<'EOF'
session.getState().cities[cityId] = enqueueCityProduction(city, itemId);
EOF
expect_block "$tmp/src/ui/panel.ts" "getState() mutation in src/ui"

# --- allow: reading getState() without mutating it ---
cat > "$tmp/src/ui/reader.ts" <<'EOF'
const city = session.getState().cities[cityId];
EOF
expect_allow "$tmp/src/ui/reader.ts" "getState() read-only in src/ui"

# --- block: Math.random in src ---
cat > "$tmp/src/systems/rng-bug.ts" <<'EOF'
const x = Math.random();
EOF
expect_block "$tmp/src/systems/rng-bug.ts" "Math.random in src"

# --- block: hardcoded 'player' ownership check ---
cat > "$tmp/src/ui/owner-check.ts" <<'EOF'
if (unit.owner === 'player') doStuff();
EOF
expect_block "$tmp/src/ui/owner-check.ts" "hardcoded 'player'"

# --- block: direct state mutation in turn processing ---
cat > "$tmp/src/systems/mutation.ts" <<'EOF'
state.cities[id] = { ...city };
EOF
expect_block "$tmp/src/systems/mutation.ts" "direct state mutation"

# --- block: direct research-progress mutation outside the tech authority ---
cat > "$tmp/src/systems/research-bug.ts" <<'EOF'
civilization.techState.researchProgress += reward;
EOF
expect_block "$tmp/src/systems/research-bug.ts" "direct research progress mutation"

# --- allow: tech-system owns research progress transitions ---
cat > "$tmp/src/systems/tech-system.ts" <<'EOF'
return { ...state, researchProgress: state.researchProgress + sciencePoints };
EOF
expect_allow "$tmp/src/systems/tech-system.ts" "tech-system research progress transition"

# --- allow: read-only intelligence snapshot ---
cat > "$tmp/src/systems/research-intel.ts" <<'EOF'
return { researchProgress: target.techState.researchProgress };
EOF
expect_allow "$tmp/src/systems/research-intel.ts" "research progress intelligence snapshot"

# --- block: innerHTML with template literal interpolation ---
cat > "$tmp/src/ui/xss.ts" <<'EOF'
el.innerHTML = `<div>${name}</div>`;
EOF
expect_block "$tmp/src/ui/xss.ts" "innerHTML with template literal"

# --- allow: clean src file ---
cat > "$tmp/src/systems/clean.ts" <<'EOF'
export function add(a: number, b: number): number { return a + b; }
EOF
expect_allow "$tmp/src/systems/clean.ts" "clean src file"

# --- allow: file outside src/ ---
mkdir -p "$tmp/tests"
cat > "$tmp/tests/example.test.ts" <<'EOF'
const x = Math.random();
EOF
expect_allow "$tmp/tests/example.test.ts" "non-src file ignored"

# --- allow: missing file (defensive no-op) ---
expect_allow "$tmp/src/does-not-exist.ts" "missing file"

# --- allow: empty payload (no file_path) ---
out="$(echo '{}' | bash "$HOOK" 2>&1)"; rc=$?
if [ "$rc" != "0" ]; then
  echo "expected exit 0 for empty payload, got $rc ($out)"; fail=1
fi

# --- block: bare createElement('button') without adjacent style in src/ui/ ---
cat > "$tmp/src/ui/bare.ts" <<'EOF'
const btn = document.createElement('button');
btn.textContent = 'Do it';
btn.addEventListener('click', () => {});
EOF
expect_block "$tmp/src/ui/bare.ts" "bare button in src/ui"

# --- allow: button with adjacent style assignment ---
cat > "$tmp/src/ui/styled.ts" <<'EOF'
const btn = document.createElement('button');
btn.style.background = '#e8c170';
btn.style.color = '#1f1a12';
btn.textContent = 'OK';
EOF
expect_allow "$tmp/src/ui/styled.ts" "styled button in src/ui"

# --- allow: createGameButton call (no bare createElement) ---
cat > "$tmp/src/ui/game-btn.ts" <<'EOF'
const btn = createGameButton('label', 'primary');
EOF
expect_allow "$tmp/src/ui/game-btn.ts" "createGameButton call (no createElement)"

# --- allow: ui-kit.ts is exempt ---
cat > "$tmp/src/ui/ui-kit.ts" <<'EOF'
const btn = document.createElement('button');
btn.textContent = label;
EOF
expect_allow "$tmp/src/ui/ui-kit.ts" "bare button in ui-kit.ts (exempt)"

# --- sprite-overlay.ts: block hardcoded px size ---
mkdir -p "$tmp/src/renderer"
cat > "$tmp/src/renderer/sprite-overlay.ts" <<'EOF'
wrapper.style.cssText = `position:absolute;width:128px;height:128px;`;
EOF
expect_block "$tmp/src/renderer/sprite-overlay.ts" "hardcoded 128px in sprite-overlay.ts"

# --- sprite-overlay.ts: allow dynamic size derived from hexSize ---
cat > "$tmp/src/renderer/sprite-overlay.ts" <<'EOF'
const wrapSizePx = camera.hexSize * SPRITE_OVERLAY_WORLD_SIZE_FACTOR;
wrapper.style.cssText = `position:absolute;width:${wrapSizePx}px;height:${wrapSizePx}px;overflow:hidden;`;
EOF
expect_allow "$tmp/src/renderer/sprite-overlay.ts" "dynamic hexSize-derived size in sprite-overlay.ts"

# --- v2/index.ts: block hardcoded numeric SVG width/height attribute ---
mkdir -p "$tmp/src/renderer/sprites/v2"
cat > "$tmp/src/renderer/sprites/v2/index.ts" <<'EOF'
const svg = rawSvg.replace(/width="\d+"/, 'width="128" height="128"');
EOF
expect_block "$tmp/src/renderer/sprites/v2/index.ts" "hardcoded width=\"128\" in v2/index.ts"

# --- v2/index.ts: allow the correct responsive-percentage replacement ---
cat > "$tmp/src/renderer/sprites/v2/index.ts" <<'EOF'
const svg = rawSvg.replace(
  /(<svg\b[^>]*?)\swidth="\d+"\s+height="\d+"/,
  '$1 width="100%" height="100%"',
);
EOF
expect_allow "$tmp/src/renderer/sprites/v2/index.ts" "width=\"100%\" replacement in v2/index.ts"

exit "$fail"
