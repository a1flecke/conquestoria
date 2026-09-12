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

# --- #1025: block a low-level unit mover called outside the movement system ---
cat > "$tmp/src/systems/sneaky-move.ts" <<'EOF'
export function sneak(state, unit, coord) {
  return moveUnitWithZoneOfControl(state, unit, coord, 1).unit;
}
EOF
expect_block "$tmp/src/systems/sneaky-move.ts" "moveUnitWithZoneOfControl outside movement system"

# --- #1025: allow it when the call line carries the exempt marker ---
cat > "$tmp/src/systems/world-actor-move.ts" <<'EOF'
export function armadaStep(state, unit, coord, cost) {
  return moveUnitWithZoneOfControl(state, unit, coord, cost).unit; // movement-contract-exempt: world-actor ocean step
}
EOF
expect_allow "$tmp/src/systems/world-actor-move.ts" "moveUnitWithZoneOfControl with exempt marker"

# --- #1025: allow it inside the sanctioned canonical executor ---
cat > "$tmp/src/systems/unit-movement-system.ts" <<'EOF'
const movement = moveUnitWithZoneOfControl(state, moved, step, cost);
EOF
expect_allow "$tmp/src/systems/unit-movement-system.ts" "moveUnitWithZoneOfControl in unit-movement-system.ts"

# --- #1025: removeUnit() must not trip the moveUnit( substring match ---
cat > "$tmp/src/systems/lifecycle.ts" <<'EOF'
nextState = removeUnit(nextState, updatedUnit);
EOF
expect_allow "$tmp/src/systems/lifecycle.ts" "removeUnit is not a movement-executor bypass"

# --- #995: block single-side declareWar()/makePeace() outside diplomacy-system ---
cat > "$tmp/src/ai/war-planner.ts" <<'EOF'
export function plan(state, a, b) {
  const next = declareWar(state.civilizations[a].diplomacy, b, state.turn);
  return makePeace(next, b, state.turn);
}
EOF
expect_block "$tmp/src/ai/war-planner.ts" "single-side declareWar/makePeace outside diplomacy-system"

# --- #995: allow declareMajorWar()/makeMajorPeace() (the bilateral transitions) ---
cat > "$tmp/src/ai/war-planner-ok.ts" <<'EOF'
export function plan(state, a, b) {
  return makeMajorPeace(declareMajorWar(state, a, b), a, b);
}
EOF
expect_allow "$tmp/src/ai/war-planner-ok.ts" "declareMajorWar/makeMajorPeace are bilateral and allowed"

# --- #995: allow single-side forms inside the sanctioned minor-civ war paths ---
cat > "$tmp/src/systems/minor-civ-actions.ts" <<'EOF'
nextMajor.diplomacy = declareWar(nextMajor.diplomacy, minorCivId, state.turn);
nextMinor.diplomacy = makePeace(nextMinor.diplomacy, majorCivId, state.turn);
EOF
expect_allow "$tmp/src/systems/minor-civ-actions.ts" "single-side forms allowed in minor-civ-actions.ts"

# --- #1003: block single-side signTreaty() outside diplomacy-system ---
cat > "$tmp/src/ai/treaty-planner.ts" <<'EOF'
export function propose(state, a, b) {
  return signTreaty(state.civilizations[a].diplomacy, a, b, 'alliance', -1, state.turn);
}
EOF
expect_block "$tmp/src/ai/treaty-planner.ts" "single-side signTreaty outside diplomacy-system"

# --- #1003: allow signTreaty() inside diplomacy-system.ts (commitTreatyAgreement) ---
cat > "$tmp/src/systems/diplomacy-system.ts" <<'EOF'
export function commitTreatyAgreement(state, civAId, civBId, type, bus) {
  const aState = signTreaty(civA.diplomacy, civAId, civBId, type, turns, state.turn, cap);
  const bState = signTreaty(civB.diplomacy, civBId, civAId, type, turns, state.turn, cap);
  return state;
}
EOF
expect_allow "$tmp/src/systems/diplomacy-system.ts" "signTreaty allowed inside diplomacy-system.ts"

# --- #1003: allow signTreaty() inside the #846 scenario builder ---
mkdir -p "$tmp/src/testing/scenario-steps"
cat > "$tmp/src/testing/scenario-steps/diplomacy-step.ts" <<'EOF'
export function applyDiplomacyStep(state, step) {
  civA.diplomacy = signTreaty(civA.diplomacy, step.civA, step.civB, 'alliance', -1, state.turn);
  civB.diplomacy = signTreaty(civB.diplomacy, step.civB, step.civA, 'alliance', -1, state.turn);
  return state;
}
EOF
expect_allow "$tmp/src/testing/scenario-steps/diplomacy-step.ts" "signTreaty allowed inside the scenario builder"

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

# --- #1021: block a fresh hand-rolled LCG constant / truncated-id charCodeAt ---
cat > "$tmp/src/systems/fresh-rng.ts" <<'EOF'
export function badSeed(turn: number, unitId: string): number {
  return turn * 48271 + unitId.charCodeAt(0);
}
EOF
expect_block "$tmp/src/systems/fresh-rng.ts" "new hand-rolled LCG constant + truncated-id charCodeAt"

# --- #1021: allow createSimulationRng usage (no bare constant/charCodeAt) ---
cat > "$tmp/src/systems/good-rng.ts" <<'EOF'
import { createSimulationRng } from './simulation-rng';

export function rollVillageOutcome(state: GameState, villageId: string, unitId: string): number {
  const rng = createSimulationRng(state, { domain: 'village-visit', actorId: unitId, targetId: villageId });
  return rng();
}
EOF
expect_allow "$tmp/src/systems/good-rng.ts" "createSimulationRng usage"

# --- #1021: allow a pre-existing baselined occurrence (path:line exact match) ---
# Real baseline entry: src/systems/combat-system.ts:431 (#982 left this
# [LOW]-tagged LCG recurrence body in place -- it's already fed a
# gameId-rooted seed by its caller, just a hand-rolled duplicate of
# seededLcg's body, not a live seed-construction bug).
mkdir -p "$tmp/src/systems"
baselined_line='  rngState = (rngState * 48271) % 2147483647;'
{
  for i in $(seq 1 430); do echo "// padding line $i"; done
  printf '%s\n' "$baselined_line"
} > "$tmp/src/systems/combat-system.ts"
expect_allow "$tmp/src/systems/combat-system.ts" "baselined combat-system.ts:431 occurrence"

# --- #1021: the same offending pattern at a DIFFERENT (non-baselined) line in that
# same file must still be blocked -- proves the baseline is line-precise, not file-wide.
{
  echo '  const rng2 = seededLcg(state.turn * 7919);'
  for i in $(seq 1 130); do echo "// padding line $i"; done
} > "$tmp/src/systems/crisis-system.ts"
expect_block "$tmp/src/systems/crisis-system.ts" "same pattern at a non-baselined line in crisis-system.ts"

# --- #1021: map-generator.ts is permanently exempt regardless of content ---
cat > "$tmp/src/systems/map-generator.ts" <<'EOF'
export function createRng(seed: string): () => number {
  let h = seed.length * 48271;
  return () => (h = (h * 1664525 + 1013904223) | 0) / 4294967296;
}
EOF
expect_allow "$tmp/src/systems/map-generator.ts" "map-generator.ts permanent RNG exemption"

# --- #985: UI/AI may not import omniscient domination authority ---
cat > "$tmp/src/ui/domination-panel.ts" <<'EOF'
import { buildDominationActorFacts } from '@/systems/domination-sovereignty';
EOF
expect_block "$tmp/src/ui/domination-panel.ts" "UI authoritative domination import"

# --- #985: victory must use sovereignty facts, not civilization roster liveness ---
cat > "$tmp/src/systems/victory-system.ts" <<'EOF'
const survivors = state.civilizations[civId].units.length;
EOF
expect_block "$tmp/src/systems/victory-system.ts" "victory roster-based liveness"

# --- #985: canonical liveness consumer remains lawful ---
cat > "$tmp/src/systems/domination-sovereignty.ts" <<'EOF'
import { getCivilizationLiveness } from './civilization-liveness';
const living = getCivilizationLiveness(state, civId);
EOF
expect_allow "$tmp/src/systems/domination-sovereignty.ts" "canonical domination liveness consumer"

# --- #985: city production must use the spy catalog leaf, never the runtime
# espionage system (that edge closes a catalog-initialization import cycle). ---
cat > "$tmp/src/systems/city-system.ts" <<'EOF'
import { isSpyUnitType } from './espionage-system';
EOF
expect_block "$tmp/src/systems/city-system.ts" "city system runtime espionage import"

exit "$fail"
