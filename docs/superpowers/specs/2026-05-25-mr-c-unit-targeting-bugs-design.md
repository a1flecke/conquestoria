# MR-C: Unit Targeting Bugs — City Assault Entry and 0-MP Attack

**Issues:** #264, #266  
**Date:** 2026-05-25  
**PR strategy:** Single PR — both issues are in `src/systems/attack-targeting.ts` and `src/main.ts`

---

## #264 — Unit Silently Walks Into Hostile City Without Assault Prompt

### Root cause

`canReachCityAssault` in `src/input/selected-unit-tap-intent.ts` (line 25) checks the distance from the unit's **current position** to the target coordinate:

```ts
function canReachCityAssault(state, unitId, targetCoord): boolean {
  const distance = hexDistance(unit.position, targetCoord);  // current position
  return distance > 0 && distance <= profile.range;
}
```

For a melee unit (range 1) standing 2 tiles from a city:
- `distance = 2`, `profile.range = 1` → `canReachCityAssault = false`
- `resolveSelectedUnitTapIntent` returns `{ kind: 'move' }`
- The tap handler executes `executeAnimatedUnitMove`, placing the unit on the city tile
- No capture prompt appears; the unit silently occupies the city hex

The fix must fire the assault flow **after** the unit has moved onto the city tile — not at intent-resolution time.

> **Automation safety:** `animateMovedUnit` is only ever called from player-initiated taps in `main.ts`. It is not invoked by AI move handlers (those call `executeUnitMove` directly without animation). Adding a post-move check here does not affect AI behaviour.

### Fix

**File:** `src/main.ts` — `animateMovedUnit` callback

In the `animateMovedUnit` animation completion callback, after `renderLoop.setGameState(gameState)` and `updateHUD()`, insert a post-move city check **before** the `movementPointsLeft <= 0` branch:

```ts
// Post-move: check if the unit has landed on a hostile major-civ city tile.
// This handles the case where canReachCityAssault returned false because the unit
// was beyond attack range before moving (e.g., melee at distance 2 from city).
const landedUnit = gameState.units[unitId];
if (landedUnit && landedUnit.owner === gameState.currentPlayer) {
  const cityAtDest = Object.values(gameState.cities).find(c =>
    hexKey(c.position) === hexKey(landedUnit.position)
    && c.owner !== gameState.currentPlayer
    && !c.owner.startsWith('mc-')        // exclude minor civ cities
    && (gameState.civilizations[landedUnit.owner]?.diplomacy?.atWarWith?.includes(c.owner) ?? false),
  );
  if (cityAtDest) {
    beginPlayerCityAssault(unitId, cityAtDest.id);
    renderLoop.setGameState(gameState);
    updateHUD();
    // beginPlayerCityAssault handles its own selectNextUnit call.
    return;
  }
}
```

This check fires only when:
1. The unit is owned by the current player (guard against AI move callbacks, which are already impossible here but explicit is safer).
2. The destination tile holds a hostile major-civ city.
3. The player is at war with that city's owner. Minor civ cities (`owner.startsWith('mc-')`) are excluded — they have their own `assault-minor-civ` intent path.

> **Alliance edge case:** If the player is **allied** with the city owner, `canEnterForeignCityPeacefully` would have returned `{kind: 'move'}` from `resolveSelectedUnitTapIntent`, and the unit entering the allied city tile is intentional. The `atWarWith` check here ensures we never fire the assault flow for allied movement.

### Tests (`tests/input/selected-unit-tap-intent.test.ts` and `tests/main.integration.test.ts`)

- `resolveSelectedUnitTapIntent` for a melee unit at distance 2 from an enemy city returns `{ kind: 'move' }` (existing behaviour, regression guard).
- `resolveSelectedUnitTapIntent` for a melee unit at distance 1 from an enemy city returns `{ kind: 'assault-city' }` (positive case, no regression).
- Integration: after `animateMovedUnit` completes with the unit landing on an enemy (at-war) city tile, `beginPlayerCityAssaultChoice` has been called (mock/spy assertion).
- Integration: after `animateMovedUnit` completes with the unit landing on an allied city tile, `beginPlayerCityAssaultChoice` has **not** been called.
- Integration: after `animateMovedUnit` completes with the unit landing on a minor civ city tile (`owner = 'mc-abc'`), `beginPlayerCityAssaultChoice` has **not** been called.

---

## #266 — Unit With 0 Movement Points Still Shows Attack Highlights

### Root cause

`getAttackTargets` in `src/systems/attack-targeting.ts` (lines 123–137) has no check on `attacker.hasActed` or `attacker.movementPointsLeft`. A unit that used all movement but did not act still returns a full list of attack targets when selected.

The `selected-unit-info.ts` "Found City" button (line 160) is also rendered based on `canFoundCityAt(state, unit.position)` alone, with no check on `unit.movementPointsLeft`. A settler with 0 remaining movement shows a clickable "Found City" button.

### Fix

**Fix 1 — `getAttackTargets`**

**File:** `src/systems/attack-targeting.ts`

Add an early return at the top of `getAttackTargets`:

```ts
export function getAttackTargets(
  state: GameState,
  attacker: Unit,
  options: AttackTargetOptions = {},
): AttackTarget[] {
  // A unit that has already acted cannot attack again this turn.
  if (attacker.hasActed) return [];

  const profile = getUnitAttackProfile(attacker.type);
  // ... rest unchanged
}
```

> **Design note:** `movementPointsLeft === 0` is NOT the right guard because ranged units (range > 1) can attack without moving and may still have `movementPointsLeft > 0`. The correct invariant is `hasActed`, which is set to `true` whenever the unit performs its one action per turn (attack, found city, rest, etc.). A 0-MP unit that has not yet acted (e.g., it spent all movement points walking) should still be able to attack — that is intended behaviour for non-melee units. Only `hasActed` correctly identifies "no action remaining".

**Fix 2 — "Found City" button**

**File:** `src/ui/selected-unit-info.ts` (line 158–170)

The "Found City" action consumes all movement. Guard the enabled path against `unit.movementPointsLeft <= 0`:

```ts
if (def.canFoundCity && callbacks.onFoundCity) {
  if (unit.movementPointsLeft > 0 && canFoundCityAt(state, unit.position)) {
    actionsDiv.appendChild(makeButton('Found City', '#e8c170', callbacks.onFoundCity));
  } else {
    const blockers = unit.movementPointsLeft <= 0
      ? ['No movement remaining']
      : getCityFoundingBlockers(state, unit.position).map(formatCityFoundingBlockerMessage);
    const btn = makeButton('Found City', '#e8c170');
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    btn.title = blockers.join('; ') || 'Cannot found city here';
    actionsDiv.appendChild(btn);
  }
}
```

> **Note on `foundCityAction` in `main.ts`:** The existing `foundCityAction` function (line 1518) already checks `unit.movementPointsLeft` implicitly via `canFoundCityAt`, but the UI button can appear clickable even with 0 MP if the tile is otherwise valid. This fix adds the MP guard at the button-visibility layer in UI code — no change needed in `main.ts`.

### Tests (`tests/systems/attack-targeting.test.ts` and `tests/ui/selected-unit-info.test.ts`)

- `getAttackTargets` with `attacker.hasActed = true` returns `[]` even if targets are in range.
- `getAttackTargets` with `attacker.hasActed = false` and valid targets returns those targets (no regression).
- `getAttackTargets` with a ranged unit (`range = 2`) and `movementPointsLeft = 0` but `hasActed = false` still returns valid targets (ranged-attack-without-movement regression).
- Rendered settler with `movementPointsLeft = 0` on a valid founding tile: "Found City" button is disabled.
- Rendered settler with `movementPointsLeft = 2` on a valid founding tile: "Found City" button is enabled.

### Summary of files changed

| File | Change |
|------|--------|
| `src/main.ts` | Post-move city-assault check in `animateMovedUnit` callback |
| `src/systems/attack-targeting.ts` | Early return in `getAttackTargets` when `attacker.hasActed` |
| `src/ui/selected-unit-info.ts` | "Found City" button guards against `movementPointsLeft <= 0` |
| `tests/input/selected-unit-tap-intent.test.ts` | 2 regression guards for `resolveSelectedUnitTapIntent` |
| `tests/main.integration.test.ts` | 3 integration tests for post-move city assault flow |
| `tests/systems/attack-targeting.test.ts` | 3 new unit tests |
| `tests/ui/selected-unit-info.test.ts` | 2 new render tests |
