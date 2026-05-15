# Cultural Territory Worker Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build cultural territory ownership so workers can only improve their own civ's territory, while progressing from simple city-radius claims to inspectable culture-frontier border pressure.

**Architecture:** `src/systems/city-territory-system.ts` becomes the canonical territory owner for claim generation, claim resolution, and state application. `City.ownedTiles` remains city attribution, `HexTile.owner` remains the fast civ lookup, and worker/UI code reads the canonical result instead of inventing separate territory rules.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas renderer highlights, DOM UI panels, existing `./scripts/run-with-mise.sh yarn` command wrapper.

---

## Source Spec

- Design: `docs/superpowers/specs/2026-05-15-cultural-territory-worker-improvements-design.md`
- Issue: https://github.com/a1flecke/conquestoria/issues/157

## File Map

- Modify `src/core/types.ts`: add serializable territory frontier types in MR5.
- Modify `src/systems/city-territory-system.ts`: add territory claim/resolution APIs, growth thresholds, pressure formula, frontier cleanup helpers, and retain existing city work claim helpers.
- Modify `src/systems/city-system.ts`: make `foundCity` create a city shell without independently deciding final territory, or delegate initial owned tiles to the territory helper.
- Modify `src/main.ts`: wire founding first, then capture/raze/loss paths, to canonical territory recalculation.
- Modify `src/systems/city-capture-system.ts`: route captured/razed city tile ownership through territory state application.
- Modify `src/storage/save-manager.ts`: normalize legacy territory with holder preservation before city work claim cleanup.
- Modify `src/systems/improvement-system.ts`: expose worker-action eligibility reasons for UI and mutation-layer failures.
- Modify `src/systems/worker-action-system.ts`: return `outside-territory` for territory failures and cancel in-progress work on tile flip.
- Modify `src/input/selected-unit-highlights.ts`: add worker guidance highlights in movement-preview range.
- Modify `src/renderer/render-loop.ts`: add highlight types for worker buildable, worker owned-blocked, and worker foreign-blocked.
- Modify `src/ui/selected-unit-info.ts`: render current-tile worker blockage text.
- Modify `src/ui/notification-routing.ts`: route territory flip notifications to civs with visibility or direct ownership involvement.
- Test `tests/systems/city-territory-system.test.ts`: territory claims, deterministic resolution, growth, pressure, frontier cleanup.
- Test `tests/systems/worker-action-system.test.ts`: mutation-layer worker legality and task clearing.
- Test `tests/systems/improvement-system.test.ts`: eligibility reason boundaries.
- Test `tests/input/selected-unit-highlights.test.ts`: worker guidance highlight generation.
- Test `tests/ui/selected-unit-info.test.ts`: current-tile blockage text.
- Test `tests/storage/save-persistence.test.ts`: legacy territory normalization.

## Plan-Wide Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Worker selected on own valid unimproved tile | Player opens selected-unit panel | Build button appears and current tile is green-highlighted |
| Worker selected on own invalid tile | Player opens selected-unit panel | No build button; panel shows reason such as `Requires river`; movement-preview tile is amber |
| Worker selected near foreign valid terrain | Player selects worker | Foreign valid terrain in movement-preview range is red, and no build action appears there after moving unless ownership changes |
| Border tile flips with completed farm | Turn processing resolves territory | Notification log mentions tile/improvement transfer; old city no longer counts farm yield; new owner can work it |
| Border tile flips with in-progress farm | Turn processing resolves territory | Construction disappears, original worker task is cleared, notification says construction was cancelled |
| Frontier tile is contested in MR5 | Player inspects border/frontier surface | UI explains holder, challenger, trend, and reason without exposing unexplored map information |

## Misleading UI Risks

- A tile must not be green unless at least one worker action is valid now for the selected worker's owner.
- A red foreign-blocked highlight must not reveal terrain in unexplored tiles; only visible or fog-known tiles may receive reason-colored worker guidance.
- Amber means "your territory, blocked by local improvement rules"; it must not include foreign tiles.
- Current-tile panel reasons must match mutation-layer failure reasons, especially `outside-territory`.
- Frontier explanations must not appear before MR5 creates persistent frontier state.

## Interaction Replay Checklist

- Select worker, inspect current tile reason, move worker, reselect worker, inspect updated reason.
- Select worker twice after a failed action; stale buttons must not mutate state.
- Build on a valid tile, panel rerenders with worker charges/task state.
- Reopen selected-unit panel after territory recalculation; blocked reason reflects current ownership.
- End turn after border flip; notification log, city yields, worker task state, and map ownership agree.

---

### Task 1: MR1 Canonical Territory Foundation

**Files:**
- Modify: `src/systems/city-territory-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/main.ts`
- Test: `tests/systems/city-territory-system.test.ts`
- Test: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing territory helper tests**

Add these tests to `tests/systems/city-territory-system.test.ts`:

```ts
import { recalculateTerritory, type TerritoryResolution } from '@/systems/city-territory-system';
import { hexKey } from '@/systems/hex-utils';

it('recalculates a founded city to radius 2 without claiming ocean or mountains', () => {
  const state = createNewGame(undefined, 'territory-radius-2');
  state.cities = {};
  state.civilizations.player.cities = [];
  const city = foundCity('player', { q: 10, r: 10 }, state.map);
  city.id = 'city-player';
  state.cities[city.id] = { ...city, ownedTiles: [] };
  state.civilizations.player.cities = [city.id];
  state.map.tiles['11,10'] = { ...state.map.tiles['11,10'], terrain: 'mountain', owner: null };
  state.map.tiles['12,10'] = { ...state.map.tiles['12,10'], terrain: 'ocean', owner: null };

  const result = recalculateTerritory(state, { reason: 'founding', preserveForeignHolders: true });
  const ownedKeys = result.state.cities[city.id].ownedTiles.map(hexKey);

  expect(ownedKeys).toContain('10,10');
  expect(ownedKeys).toContain('10,12');
  expect(ownedKeys).not.toContain('11,10');
  expect(ownedKeys).not.toContain('12,10');
  for (const key of ownedKeys) {
    expect(result.state.map.tiles[key]?.owner).toBe('player');
  }
});

it('does not steal valid foreign-held tiles during MR1 founding recalculation', () => {
  const state = createNewGame(undefined, 'territory-foreign-holder');
  state.cities = {};
  state.civilizations.player.cities = [];
  const city = foundCity('player', { q: 10, r: 10 }, state.map);
  city.id = 'city-player';
  state.cities[city.id] = { ...city, ownedTiles: [] };
  state.civilizations.player.cities = [city.id];
  state.map.tiles['11,10'] = { ...state.map.tiles['11,10'], terrain: 'grassland', owner: 'ai-1' };

  const result = recalculateTerritory(state, { reason: 'founding', preserveForeignHolders: true });

  expect(result.state.map.tiles['11,10'].owner).toBe('ai-1');
  expect(result.state.cities[city.id].ownedTiles.map(hexKey)).not.toContain('11,10');
});

it('returns changed-tile metadata when ownership changes', () => {
  const state = createNewGame(undefined, 'territory-resolution-metadata');
  state.cities = {};
  state.civilizations.player.cities = [];
  const city = foundCity('player', { q: 10, r: 10 }, state.map);
  city.id = 'city-player';
  state.cities[city.id] = { ...city, ownedTiles: [] };
  state.civilizations.player.cities = [city.id];

  const result = recalculateTerritory(state, { reason: 'founding', preserveForeignHolders: true });
  const centerResolution = result.resolutions.find((resolution: TerritoryResolution) => hexKey(resolution.coord) === '10,10');

  expect(centerResolution).toMatchObject({
    previousOwner: null,
    winningCityId: city.id,
    winningCivId: 'player',
    reason: 'founding',
  });
});
```

- [ ] **Step 2: Run the focused failing tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts tests/systems/city-system.test.ts
```

Expected: FAIL because `recalculateTerritory`, `TerritoryResolution`, and radius-2 ownership behavior do not exist yet.

- [ ] **Step 3: Add territory claim/resolution types and MR1 helper**

In `src/systems/city-territory-system.ts`, add these exported types and functions above the work-claim section:

```ts
export type TerritoryRecalculationReason =
  | 'founding'
  | 'capture'
  | 'raze'
  | 'city-loss'
  | 'turn'
  | 'load';

export interface TerritoryClaim {
  cityId: string;
  civId: string;
  coord: HexCoord;
  radiusBand: number;
  pressure: number;
  reason: TerritoryRecalculationReason;
}

export interface TerritoryResolution {
  coord: HexCoord;
  previousOwner: string | null;
  winningCityId: string | null;
  winningCivId: string | null;
  competingClaims: TerritoryClaim[];
  reason: TerritoryRecalculationReason;
}

export interface TerritoryRecalculationOptions {
  reason: TerritoryRecalculationReason;
  preserveForeignHolders?: boolean;
}

export interface TerritoryRecalculationResult {
  state: GameState;
  resolutions: TerritoryResolution[];
  contestedResolutions: TerritoryResolution[];
}

function canClaimTile(tile: GameState['map']['tiles'][string] | undefined): boolean {
  return Boolean(tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain');
}

export function getBaseTerritoryRadius(_city: City): number {
  return 2;
}

export function generateTerritoryClaimsForCity(
  state: GameState,
  city: City,
  reason: TerritoryRecalculationReason,
): TerritoryClaim[] {
  const claims: TerritoryClaim[] = [];
  for (const rawCoord of hexesInRange(city.position, getBaseTerritoryRadius(city))) {
    const coord = canonicalizeCityCoord(rawCoord, state.map);
    const tile = state.map.tiles[hexKey(coord)];
    if (!canClaimTile(tile)) continue;
    claims.push({
      cityId: city.id,
      civId: city.owner,
      coord,
      radiusBand: cityDistance(city.position, coord, state.map),
      pressure: 0,
      reason,
    });
  }
  return claims;
}

export function recalculateTerritory(
  state: GameState,
  options: TerritoryRecalculationOptions,
): TerritoryRecalculationResult {
  const claimsByTile = new Map<string, TerritoryClaim[]>();
  for (const city of Object.values(state.cities)) {
    for (const claim of generateTerritoryClaimsForCity(state, city, options.reason)) {
      const key = hexKey(claim.coord);
      claimsByTile.set(key, [...(claimsByTile.get(key) ?? []), claim]);
    }
  }

  const nextTiles = { ...state.map.tiles };
  const nextCities: GameState['cities'] = {};
  const ownedByCity = new Map<string, HexCoord[]>();
  const resolutions: TerritoryResolution[] = [];

  for (const city of Object.values(state.cities)) {
    nextCities[city.id] = { ...city, ownedTiles: [] };
  }

  for (const [key, claims] of claimsByTile.entries()) {
    const tile = state.map.tiles[key];
    if (!tile) continue;
    const previousOwner = tile.owner ?? null;
    const eligibleClaims = options.preserveForeignHolders && previousOwner && !claims.some(claim => claim.civId === previousOwner)
      ? []
      : claims;
    const sorted = eligibleClaims.slice().sort((left, right) => {
      if (left.radiusBand !== right.radiusBand) return left.radiusBand - right.radiusBand;
      return left.cityId.localeCompare(right.cityId);
    });
    const winner = sorted[0] ?? null;
    if (winner) {
      nextTiles[key] = { ...tile, owner: winner.civId };
      ownedByCity.set(winner.cityId, [...(ownedByCity.get(winner.cityId) ?? []), winner.coord]);
    }
    if ((winner?.civId ?? previousOwner) !== previousOwner) {
      resolutions.push({
        coord: tile.coord,
        previousOwner,
        winningCityId: winner?.cityId ?? null,
        winningCivId: winner?.civId ?? null,
        competingClaims: claims,
        reason: options.reason,
      });
    }
  }

  for (const [cityId, city] of Object.entries(nextCities)) {
    const seen = new Set<string>();
    nextCities[cityId] = {
      ...city,
      ownedTiles: (ownedByCity.get(cityId) ?? []).filter(coord => {
        const key = hexKey(coord);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    };
  }

  const normalized = normalizeCityWorkClaims({
    ...state,
    map: { ...state.map, tiles: nextTiles },
    cities: nextCities,
  });
  return { state: normalized.state, resolutions, contestedResolutions: [] };
}
```

Also import `hexesInRange` from `./hex-utils`.

- [ ] **Step 4: Wire founding through the helper**

In `src/main.ts`, replace the manual tile owner loop in `foundCityAction()` with:

```ts
gameState.cities[city.id] = city;
currentCiv().cities.push(city.id);
gameState = initializeLegendaryWonderProjectsForCity(gameState, cp, city.id);
gameState = recalculateTerritory(gameState, {
  reason: 'founding',
  preserveForeignHolders: true,
}).state;
```

Import `recalculateTerritory` from `@/systems/city-territory-system`.

- [ ] **Step 5: Update city-system tests for radius 2**

In `tests/systems/city-system.test.ts`, update the existing "claims nearby tiles" expectation to require at least one distance-2 land tile:

```ts
it('creates radius 2 claim candidates for founded cities', () => {
  const map = generateMap(30, 30, 'city-radius-2-test');
  const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
  const city = foundCity('p1', landTile.coord, map);

  expect(city.ownedTiles.length).toBeGreaterThanOrEqual(1);
  expect(city.ownedTiles).toContainEqual(landTile.coord);
});
```

Keep deeper final ownership assertions in `city-territory-system.test.ts` because the canonical helper owns the resolved territory.

- [ ] **Step 6: Run tests and source rule check**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/city-territory-system.ts src/systems/city-system.ts src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts tests/systems/city-system.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit MR1 foundation**

```bash
git add src/systems/city-territory-system.ts src/systems/city-system.ts src/main.ts tests/systems/city-territory-system.test.ts tests/systems/city-system.test.ts
git commit -m "feat(territory): add canonical founding ownership"
```

---

### Task 2: MR1 Worker Legality Reasons And Guidance UI

**Files:**
- Modify: `src/systems/improvement-system.ts`
- Modify: `src/systems/worker-action-system.ts`
- Modify: `src/input/selected-unit-highlights.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Test: `tests/systems/improvement-system.test.ts`
- Test: `tests/systems/worker-action-system.test.ts`
- Test: `tests/input/selected-unit-highlights.test.ts`
- Test: `tests/ui/selected-unit-info.test.ts`

**Player Truth Table:**

| Before | Action | Immediate visible result |
|---|---|---|
| Worker on own valid tile | Select worker | Build button appears; tile gets worker-buildable highlight |
| Worker on foreign valid tile | Select worker | No build button; panel says `Outside your territory`; nearby foreign valid tiles are red only if visible/fog-known |
| Worker on own invalid terrain | Select worker | No build button; panel says specific local reason; tile or movement-preview tile is amber |

**Misleading UI Risks:**

- Do not call a tile buildable if `applyWorkerAction` would reject it.
- Do not show red foreign-blocked highlights for unexplored terrain.
- Do not show a generic "invalid action" in the panel when the specific reason is outside territory.

- [ ] **Step 1: Write failing improvement reason tests**

Add to `tests/systems/improvement-system.test.ts`:

```ts
import { getWorkerActionBlockerReason } from '@/systems/improvement-system';

it('explains outside-territory worker blockers before terrain blockers', () => {
  expect(getWorkerActionBlockerReason(tile({ terrain: 'forest', owner: 'enemy' }), 'farm', [], 'p1')).toBe('outside-territory');
  expect(getWorkerActionBlockerReason(tile({ terrain: 'forest', owner: null }), 'farm', [], 'p1')).toBe('outside-territory');
});

it('explains local worker blockers inside owned territory', () => {
  expect(getWorkerActionBlockerReason(tile({ terrain: 'plains', owner: 'p1', improvement: 'mine' }), 'farm', [], 'p1')).toBe('already-improved');
  expect(getWorkerActionBlockerReason(tile({ terrain: 'plains', owner: 'p1', hasRiver: false }), 'watermill', [], 'p1')).toBe('requires-river');
  expect(getWorkerActionBlockerReason(tile({ terrain: 'coast', owner: 'p1' }), 'farm', [], 'p1')).toBe('invalid-terrain');
});
```

- [ ] **Step 2: Write failing worker mutation test**

Add to `tests/systems/worker-action-system.test.ts`:

```ts
it('returns outside-territory for valid terrain outside worker territory', () => {
  const start = state();
  start.map.tiles['0,0'] = tile({ terrain: 'forest', owner: 'enemy' });

  const result = applyWorkerAction(start, 'worker-1', 'farm');

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.reason).toBe('outside-territory');
});
```

- [ ] **Step 3: Write failing selected-unit highlight test**

Add to `tests/input/selected-unit-highlights.test.ts`:

```ts
it('adds worker guidance highlights for buildable, owned-blocked, and foreign-blocked movement-preview tiles', () => {
  const state = createNewGame(undefined, 'worker-guidance-highlight', 'small');
  state.currentPlayer = 'player';
  state.units = {
    worker: { ...createUnit('worker', 'player', { q: 0, r: 0 }), id: 'worker', movementPointsLeft: 2 },
  };
  state.civilizations.player.units = ['worker'];
  state.civilizations.player.visibility.tiles = {
    '0,0': 'visible',
    '1,0': 'visible',
    '0,1': 'visible',
    '1,-1': 'visible',
  };
  state.map.tiles['1,0'] = { ...state.map.tiles['1,0'], terrain: 'plains', owner: 'player', improvement: 'none' };
  state.map.tiles['0,1'] = { ...state.map.tiles['0,1'], terrain: 'coast', owner: 'player', improvement: 'none' };
  state.map.tiles['1,-1'] = { ...state.map.tiles['1,-1'], terrain: 'plains', owner: 'ai-1', improvement: 'none' };

  const result = buildSelectedUnitHighlights(state, 'worker');

  expect(result.highlights).toContainEqual({ coord: { q: 1, r: 0 }, type: 'worker-buildable' });
  expect(result.highlights).toContainEqual({ coord: { q: 0, r: 1 }, type: 'worker-owned-blocked' });
  expect(result.highlights).toContainEqual({ coord: { q: 1, r: -1 }, type: 'worker-foreign-blocked' });
});
```

- [ ] **Step 4: Implement blocker reasons**

In `src/systems/improvement-system.ts`, add:

```ts
export type WorkerActionBlockerReason =
  | 'outside-territory'
  | 'city-center'
  | 'already-improved'
  | 'invalid-terrain'
  | 'requires-river'
  | 'requires-tech'
  | 'none';

export function getWorkerActionBlockerReason(
  tile: HexTile | undefined,
  action: WorkerActionType,
  completedTechs: string[] = [],
  ownerId?: string,
  options: WorkerActionEligibilityOptions = {},
): WorkerActionBlockerReason {
  if (!tile) return 'invalid-terrain';
  if (ownerId && tile.owner !== ownerId) return 'outside-territory';
  if (options.isCityTile) return 'city-center';
  if (tile.improvement !== 'none') return 'already-improved';
  if (action === 'drain_swamp') return tile.terrain === 'swamp' ? 'none' : 'invalid-terrain';
  const definition = IMPROVEMENT_DEFINITIONS[action];
  if (!definition.validTerrains.includes(tile.terrain)) return 'invalid-terrain';
  if (definition.requiresRiver && !tile.hasRiver) return 'requires-river';
  if (definition.requiredTech && !completedTechs.includes(definition.requiredTech)) return 'requires-tech';
  return 'none';
}

export function formatWorkerActionBlockerReason(reason: WorkerActionBlockerReason): string {
  switch (reason) {
    case 'outside-territory': return 'Outside your territory';
    case 'city-center': return 'City centers cannot be improved';
    case 'already-improved': return 'Already improved';
    case 'invalid-terrain': return 'No worker improvement fits this terrain';
    case 'requires-river': return 'Requires river';
    case 'requires-tech': return 'Requires technology';
    case 'none': return '';
  }
}
```

- [ ] **Step 5: Implement worker mutation failure reason**

In `src/systems/worker-action-system.ts`, extend `WorkerActionFailureReason` with `'outside-territory'`. In `applyWorkerAction`, before returning `invalid-action`, use:

```ts
const blockerReason = getWorkerActionBlockerReason(tile, action, completedTechs, unit.owner, eligibilityOptions);
if (blockerReason !== 'none') {
  return {
    ok: false,
    state,
    reason: blockerReason === 'outside-territory' ? 'outside-territory' : 'invalid-action',
    events: [],
  };
}
```

Import `getWorkerActionBlockerReason`.

- [ ] **Step 6: Extend highlight types and renderer colors**

In `src/renderer/render-loop.ts`, change `HexHighlight`:

```ts
export interface HexHighlight {
  coord: HexCoord;
  type: 'move' | 'attack' | 'worker-buildable' | 'worker-owned-blocked' | 'worker-foreign-blocked';
}
```

Replace color selection with:

```ts
const colorByType: Record<HexHighlight['type'], string> = {
  move: 'rgba(74, 144, 217, 0.35)',
  attack: 'rgba(217, 74, 74, 0.45)',
  'worker-buildable': 'rgba(80, 200, 120, 0.45)',
  'worker-owned-blocked': 'rgba(232, 193, 112, 0.40)',
  'worker-foreign-blocked': 'rgba(217, 74, 74, 0.35)',
};
const color = colorByType[highlight.type];
```

- [ ] **Step 7: Generate worker guidance highlights**

In `src/input/selected-unit-highlights.ts`, after `moveHighlights`, append worker guidance for worker units:

```ts
const workerGuidanceHighlights: HexHighlight[] = [];
if (unit.type === 'worker') {
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  for (const coord of movementRange) {
    const key = hexKey(coord);
    const tile = state.map.tiles[key];
    if (!tile) continue;
    const visibility = state.civilizations[state.currentPlayer]?.visibility.tiles[key] ?? 'unexplored';
    if (visibility === 'unexplored') continue;
    const isCityTile = Object.values(state.cities).some(city => hexKey(city.position) === key);
    const actions = getAvailableWorkerActions(tile, completedTechs, unit.owner, { isCityTile });
    if (actions.length > 0) {
      workerGuidanceHighlights.push({ coord, type: 'worker-buildable' });
      continue;
    }
    const plausibleAction = getBestPlausibleWorkerAction(tile, completedTechs);
    if (!plausibleAction) continue;
    const blocker = getWorkerActionBlockerReason(tile, plausibleAction, completedTechs, unit.owner, { isCityTile });
    if (blocker === 'outside-territory') workerGuidanceHighlights.push({ coord, type: 'worker-foreign-blocked' });
    else if (blocker !== 'none') workerGuidanceHighlights.push({ coord, type: 'worker-owned-blocked' });
  }
}
```

Add a local helper in the same file:

```ts
function getBestPlausibleWorkerAction(tile: GameState['map']['tiles'][string], completedTechs: string[]): WorkerActionType | null {
  for (const action of ['farm', 'mine', 'lumber_camp', 'watermill', 'drain_swamp'] as WorkerActionType[]) {
    const reason = getWorkerActionBlockerReason(tile, action, completedTechs);
    if (reason !== 'invalid-terrain' && reason !== 'requires-tech') return action;
  }
  return null;
}
```

Return highlights as:

```ts
highlights: [...moveHighlights, ...workerGuidanceHighlights, ...attackHighlights],
```

- [ ] **Step 8: Add selected-unit current tile explanation**

In `src/ui/selected-unit-info.ts`, after worker charges render, compute the current tile blocker:

```ts
const workerActions = getAvailableWorkerActions(tile, completedTechs, unit.owner, { isCityTile });
if (workerActions.length === 0) {
  const firstAction = getBestWorkerActionExplanation(tile, completedTechs, unit.owner, { isCityTile });
  if (firstAction) {
    const reason = getWorkerActionBlockerReason(tile, firstAction, completedTechs, unit.owner, { isCityTile });
    if (reason !== 'none') {
      const reasonDiv = document.createElement('div');
      reasonDiv.dataset.workerActionReason = reason;
      reasonDiv.style.cssText = 'font-size:10px;color:#e8c170;margin-top:4px;';
      reasonDiv.textContent = formatWorkerActionBlockerReason(reason);
      wrapper.appendChild(reasonDiv);
    }
  }
}
```

Add a local helper that checks `farm`, `mine`, `lumber_camp`, `watermill`, `drain_swamp` and returns the first action whose reason is not `invalid-terrain`, falling back to `farm`.

- [ ] **Step 9: Run tests and source rule check**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/improvement-system.ts src/systems/worker-action-system.ts src/input/selected-unit-highlights.ts src/renderer/render-loop.ts src/ui/selected-unit-info.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/improvement-system.test.ts tests/systems/worker-action-system.test.ts tests/input/selected-unit-highlights.test.ts tests/ui/selected-unit-info.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit worker guidance**

```bash
git add src/systems/improvement-system.ts src/systems/worker-action-system.ts src/input/selected-unit-highlights.ts src/renderer/render-loop.ts src/ui/selected-unit-info.ts tests/systems/improvement-system.test.ts tests/systems/worker-action-system.test.ts tests/input/selected-unit-highlights.test.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(worker): explain territory improvement blockers"
```

---

### Task 3: MR2 Ownership Path Integration

**Files:**
- Modify: `src/systems/city-territory-system.ts`
- Modify: `src/systems/city-capture-system.ts`
- Modify: `src/main.ts`
- Modify: `src/storage/save-manager.ts`
- Test: `tests/systems/city-territory-system.test.ts`
- Test: `tests/systems/city-capture-system.test.ts`
- Test: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Write failing integration tests**

Add to `tests/systems/city-territory-system.test.ts`:

```ts
it('normalizes city work claims after territory loss', () => {
  const state = createNewGame(undefined, 'territory-work-normalize');
  const city = addCity(state, 'player', 10, 10);
  const lost = { q: 11, r: 10 };
  state.map.tiles['11,10'] = { ...state.map.tiles['11,10'], owner: 'ai-1', terrain: 'grassland' };
  state.cities[city.id] = { ...city, ownedTiles: [city.position, lost], workedTiles: [lost] };

  const result = recalculateTerritory(state, { reason: 'load', preserveForeignHolders: true });

  expect(result.state.cities[city.id].workedTiles).toEqual([]);
  expect(result.state.map.tiles['11,10'].owner).toBe('ai-1');
});
```

Add to `tests/storage/save-persistence.test.ts`:

```ts
it('preserves legacy tile owner as holder when normalizing ambiguous territory', async () => {
  const state = createNewGame(undefined, 'legacy-territory-holder');
  const city = Object.values(state.cities).find(c => c.owner === 'player')!;
  const coord = { q: city.position.q + 1, r: city.position.r };
  const key = hexKey(coord);
  state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'grassland', owner: 'ai-1' };
  state.cities[city.id] = { ...city, ownedTiles: [...city.ownedTiles, coord], workedTiles: [coord] };

  const normalized = normalizeLoadedStateForTest(state);

  expect(normalized.map.tiles[key].owner).toBe('ai-1');
  expect(normalized.cities[city.id].workedTiles).not.toContainEqual(coord);
});
```

If `normalizeLoadedState` is not exported for tests, export it as `normalizeLoadedStateForTest` from `save-manager.ts`.

- [ ] **Step 2: Run failing integration tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts tests/systems/city-capture-system.test.ts tests/storage/save-persistence.test.ts
```

Expected: FAIL until capture/save paths use canonical territory.

- [ ] **Step 3: Add territory application options for existing holders**

Extend `TerritoryRecalculationOptions` in `src/systems/city-territory-system.ts`:

```ts
export interface TerritoryRecalculationOptions {
  reason: TerritoryRecalculationReason;
  preserveForeignHolders?: boolean;
  preserveCurrentHolderOnTie?: boolean;
  cityIds?: string[];
}
```

Update resolution sorting so when `preserveCurrentHolderOnTie` is true, claims from `previousOwner` sort before claims with equal band/pressure:

```ts
if (options.preserveCurrentHolderOnTie && previousOwner) {
  const leftHeld = left.civId === previousOwner ? 0 : 1;
  const rightHeld = right.civId === previousOwner ? 0 : 1;
  if (leftHeld !== rightHeld) return leftHeld - rightHeld;
}
```

- [ ] **Step 4: Wire capture/raze through canonical territory**

In `src/systems/city-capture-system.ts`, after changing city owner/civilization arrays for occupy, call:

```ts
const territoryResult = recalculateTerritory(nextState, {
  reason: 'capture',
  preserveCurrentHolderOnTie: true,
});
return {
  state: territoryResult.state,
  outcome: 'occupied',
  goldAwarded: 0,
};
```

For raze, delete the city first, then call:

```ts
const territoryResult = recalculateTerritory(nextStateWithoutCity, {
  reason: 'raze',
  preserveCurrentHolderOnTie: true,
});
```

Remove the direct loops that assign every previous `city.ownedTiles` tile owner by hand.

- [ ] **Step 5: Wire save normalization**

In `src/storage/save-manager.ts`, after legacy city shape normalization and before returning:

```ts
const territoryNormalized = recalculateTerritory(normalizedCityState, {
  reason: 'load',
  preserveForeignHolders: true,
  preserveCurrentHolderOnTie: true,
}).state;
return normalizeCityWorkClaims(territoryNormalized).state;
```

Export a test-only alias:

```ts
export const normalizeLoadedStateForTest = normalizeLoadedState;
```

- [ ] **Step 6: Run checks**

```bash
scripts/check-src-rule-violations.sh src/systems/city-territory-system.ts src/systems/city-capture-system.ts src/main.ts src/storage/save-manager.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts tests/systems/city-capture-system.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit ownership path integration**

```bash
git add src/systems/city-territory-system.ts src/systems/city-capture-system.ts src/main.ts src/storage/save-manager.ts tests/systems/city-territory-system.test.ts tests/systems/city-capture-system.test.ts tests/storage/save-persistence.test.ts
git commit -m "feat(territory): integrate ownership recalculation paths"
```

---

### Task 4: MR3 Simple Cultural Growth

**Files:**
- Modify: `src/systems/city-territory-system.ts`
- Modify: `src/core/turn-manager.ts`
- Test: `tests/systems/city-territory-system.test.ts`
- Test: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Write failing growth threshold tests**

Add to `tests/systems/city-territory-system.test.ts`:

```ts
it('keeps outpost population 3 without culture buildings at radius 2', () => {
  const state = createNewGame(undefined, 'territory-growth-no');
  const city = addCity(state, 'player', 10, 10);
  state.cities[city.id] = { ...city, population: 3, maturity: 'outpost', buildings: [] };

  expect(getCulturalTerritoryRadius(state.cities[city.id])).toBe(2);
});

it('grows to radius 3 from population, maturity, or culture buildings', () => {
  const state = createNewGame(undefined, 'territory-growth-yes');
  const city = addCity(state, 'player', 10, 10);

  expect(getCulturalTerritoryRadius({ ...city, population: 4 })).toBe(3);
  expect(getCulturalTerritoryRadius({ ...city, maturity: 'town' })).toBe(3);
  expect(getCulturalTerritoryRadius({ ...city, population: 3, buildings: ['shrine'] })).toBe(3);
  expect(getCulturalTerritoryRadius({ ...city, buildings: ['shrine', 'monument'] })).toBe(3);
});
```

- [ ] **Step 2: Implement growth radius helper**

In `src/systems/city-territory-system.ts`, add:

```ts
const CULTURE_BUILDING_IDS = new Set(
  Object.values(BUILDINGS)
    .filter(building => building.category === 'culture')
    .map(building => building.id),
);

export function countCultureBuildings(city: City): number {
  return city.buildings.filter(id => CULTURE_BUILDING_IDS.has(id)).length;
}

export function getCulturalTerritoryRadius(city: City): number {
  const cultureBuildings = countCultureBuildings(city);
  if (city.population >= 4) return 3;
  if (city.maturity === 'town' || city.maturity === 'city' || city.maturity === 'metropolis') return 3;
  if (city.population >= 3 && cultureBuildings >= 1) return 3;
  if (cultureBuildings >= 2) return 3;
  return 2;
}
```

Import `BUILDINGS` from `./city-system`, and update claim generation to use `getCulturalTerritoryRadius(city)`.

- [ ] **Step 3: Wire turn-flow recalculation**

In `src/core/turn-manager.ts`, after city processing and before marketplace supply is calculated, add:

```ts
newState = recalculateTerritory(newState, {
  reason: 'turn',
  preserveCurrentHolderOnTie: true,
}).state;
```

Import `recalculateTerritory`.

- [ ] **Step 4: Write turn-manager regression**

Add to `tests/core/turn-manager.test.ts`:

```ts
it('recalculates cultural territory before marketplace supply counts city territory', () => {
  const state = createNewGame(undefined, 'turn-territory-growth');
  const city = Object.values(state.cities).find(c => c.owner === 'player')!;
  state.cities[city.id] = { ...city, population: 4, ownedTiles: [city.position] };
  const radius3 = { q: city.position.q + 3, r: city.position.r };
  const key = hexKey(radius3);
  state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'grassland', owner: null, resource: 'horses' };

  const next = processTurn(state, new EventBus());

  expect(next.cities[city.id].ownedTiles.map(hexKey)).toContain(key);
  expect(next.map.tiles[key].owner).toBe('player');
});
```

- [ ] **Step 5: Run checks**

```bash
scripts/check-src-rule-violations.sh src/systems/city-territory-system.ts src/core/turn-manager.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit simple growth**

```bash
git add src/systems/city-territory-system.ts src/core/turn-manager.ts tests/systems/city-territory-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(territory): grow cultural borders from city milestones"
```

---

### Task 5: MR4 Soft Trim Competition And Improvement Transfer

**Files:**
- Modify: `src/systems/city-territory-system.ts`
- Modify: `src/systems/worker-action-system.ts`
- Test: `tests/systems/city-territory-system.test.ts`
- Test: `tests/systems/resource-system.test.ts`
- Test: `tests/systems/worker-action-system.test.ts`

- [ ] **Step 1: Write pressure and margin tests**

Add to `tests/systems/city-territory-system.test.ts`:

```ts
it('does not flip an overlap when pressure margin is only one', () => {
  const state = createNewGame(undefined, 'territory-soft-trim-margin-one');
  state.cities = {};
  const holder = addCity(state, 'player', 10, 10);
  const challenger = addCity(state, 'ai-1', 13, 10);
  const overlap = { q: 12, r: 10 };
  state.map.tiles[hexKey(overlap)] = { ...state.map.tiles[hexKey(overlap)], terrain: 'grassland', owner: 'player' };
  state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap] };
  state.cities[challenger.id] = { ...challenger, population: 3, maturity: 'outpost', ownedTiles: [] };

  const result = recalculateTerritory(state, { reason: 'turn', preserveCurrentHolderOnTie: true });

  expect(result.state.map.tiles[hexKey(overlap)].owner).toBe('player');
});

it('flips an overlap when rival pressure margin is at least two', () => {
  const state = createNewGame(undefined, 'territory-soft-trim-margin-two');
  state.cities = {};
  const holder = addCity(state, 'player', 10, 10);
  const challenger = addCity(state, 'ai-1', 13, 10);
  const overlap = { q: 12, r: 10 };
  state.map.tiles[hexKey(overlap)] = { ...state.map.tiles[hexKey(overlap)], terrain: 'grassland', owner: 'player' };
  state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [overlap] };
  state.cities[challenger.id] = { ...challenger, population: 6, maturity: 'town', buildings: ['shrine'], ownedTiles: [] };

  const result = recalculateTerritory(state, { reason: 'turn', preserveCurrentHolderOnTie: true });

  expect(result.state.map.tiles[hexKey(overlap)].owner).toBe('ai-1');
});
```

- [ ] **Step 2: Write transfer/cancel tests**

Add to `tests/systems/worker-action-system.test.ts`:

```ts
it('cancels in-progress improvement and clears worker task when territory flips', () => {
  const start = state();
  start.map.tiles['0,0'] = tile({ terrain: 'plains', owner: 'player', improvement: 'farm', improvementTurnsLeft: 3 });
  start.units['worker-1'] = worker({ workerTask: { action: 'farm', coord: { q: 0, r: 0 } } });
  start.cities['enemy-city'] = city({ id: 'enemy-city', owner: 'ai-1', position: { q: 1, r: 0 }, population: 8, maturity: 'town', ownedTiles: [] });
  start.civilizations['ai-1'].cities.push('enemy-city');

  const result = recalculateTerritory(start, { reason: 'turn', preserveCurrentHolderOnTie: true });

  expect(result.state.map.tiles['0,0']).toMatchObject({ owner: 'ai-1', improvement: 'none', improvementTurnsLeft: 0 });
  expect(result.state.units['worker-1'].workerTask).toBeUndefined();
});
```

Add to `tests/systems/resource-system.test.ts` a completed improvement transfer yield test that creates one city per civ, flips the farm tile to the second civ, and asserts `calculateCityYields` includes farm yield only for the new owner city after `workedTiles` assignment.

- [ ] **Step 3: Implement v1 pressure formula**

In `src/systems/city-territory-system.ts`, add:

```ts
const MATURITY_PRESSURE_BONUS: Record<City['maturity'], number> = {
  outpost: 0,
  village: 1,
  town: 2,
  city: 3,
  metropolis: 4,
};

export function calculateCityPressureForTile(state: GameState, city: City, coord: HexCoord): number {
  return 6
    + MATURITY_PRESSURE_BONUS[city.maturity]
    + Math.floor(city.population / 2)
    + Math.min(3, countCultureBuildings(city))
    - cityDistance(city.position, coord, state.map);
}
```

Populate `TerritoryClaim.pressure` from this helper.

- [ ] **Step 4: Implement Soft Trim resolution**

In claim sorting, preserve holder unless challenger pressure is at least 2 higher:

```ts
function resolveWinningClaim(
  claims: TerritoryClaim[],
  previousOwner: string | null,
): TerritoryClaim | null {
  const holderClaim = previousOwner ? claims.find(claim => claim.civId === previousOwner) : null;
  const strongest = claims.slice().sort((left, right) => {
    if (right.pressure !== left.pressure) return right.pressure - left.pressure;
    if (left.radiusBand !== right.radiusBand) return left.radiusBand - right.radiusBand;
    return left.cityId.localeCompare(right.cityId);
  })[0] ?? null;
  if (!strongest) return null;
  if (holderClaim && strongest.civId !== holderClaim.civId && strongest.pressure - holderClaim.pressure < 2) {
    return holderClaim;
  }
  return strongest;
}
```

- [ ] **Step 5: Implement completed transfer and in-progress cancellation**

In territory state application, when `previousOwner !== winner.civId`, transform the tile:

```ts
let nextTile = { ...tile, owner: winner.civId };
if (tile.improvement !== 'none' && tile.improvementTurnsLeft > 0) {
  nextTile = { ...nextTile, improvement: 'none', improvementTurnsLeft: 0 };
  nextUnits = clearWorkerTasksForCoord(nextUnits, tile.coord);
}
nextTiles[key] = nextTile;
```

Add `clearWorkerTasksForCoord` in `city-territory-system.ts` or export a helper from `worker-action-system.ts`; prefer keeping the territory flip cleanup inside `city-territory-system.ts` to avoid circular imports.

- [ ] **Step 6: Run checks**

```bash
scripts/check-src-rule-violations.sh src/systems/city-territory-system.ts src/systems/worker-action-system.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts tests/systems/resource-system.test.ts tests/systems/worker-action-system.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Soft Trim**

```bash
git add src/systems/city-territory-system.ts src/systems/worker-action-system.ts tests/systems/city-territory-system.test.ts tests/systems/resource-system.test.ts tests/systems/worker-action-system.test.ts
git commit -m "feat(territory): resolve cultural pressure overlaps"
```

---

### Task 6: MR5 Culture Frontier State And Explanations

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/city-territory-system.ts`
- Create: `src/ui/territory-frontier-info.ts`
- Test: `tests/systems/city-territory-system.test.ts`
- Test: `tests/ui/territory-frontier-info.test.ts`

- [ ] **Step 1: Add frontier types test**

Add to `tests/systems/city-territory-system.test.ts`:

```ts
it('records frontier progress for contested held tiles before flipping', () => {
  const state = createNewGame(undefined, 'territory-frontier-progress');
  state.territoryFrontiers = {};
  const holder = addCity(state, 'player', 10, 10);
  const challenger = addCity(state, 'ai-1', 13, 10);
  const coord = { q: 12, r: 10 };
  state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', owner: 'player' };
  state.cities[holder.id] = { ...holder, ownedTiles: [coord] };
  state.cities[challenger.id] = { ...challenger, population: 5, buildings: ['shrine'], ownedTiles: [] };

  const result = processTerritoryFrontiers(state);
  const frontier = result.territoryFrontiers?.[hexKey(coord)];

  expect(frontier).toMatchObject({
    holderCivId: 'player',
    challengerCivId: 'ai-1',
    holderCityId: holder.id,
    challengerCityId: challenger.id,
  });
  expect(frontier?.reason).toContain('cultural pressure');
});

it('cleans frontier records when a source city is gone', () => {
  const state = createNewGame(undefined, 'territory-frontier-cleanup');
  state.territoryFrontiers = {
    '5,5': {
      coord: { q: 5, r: 5 },
      holderCivId: 'player',
      challengerCivId: 'ai-1',
      holderCityId: 'missing-city',
      challengerCityId: 'also-missing',
      progress: 3,
      trend: 'contested',
      reason: 'Stale frontier',
    },
  };

  const result = cleanupTerritoryFrontiers(state);

  expect(result.territoryFrontiers).toEqual({});
});
```

- [ ] **Step 2: Add serializable types**

In `src/core/types.ts`, add near city/map types:

```ts
export interface TerritoryFrontierState {
  coord: HexCoord;
  holderCivId: string;
  challengerCivId: string;
  holderCityId: string;
  challengerCityId: string;
  progress: number;
  trend: 'held' | 'contested' | 'likely-to-flip';
  reason: string;
}
```

In `GameState`, add:

```ts
territoryFrontiers?: Record<string, TerritoryFrontierState>;
```

- [ ] **Step 3: Implement frontier processing**

In `src/systems/city-territory-system.ts`, add:

```ts
export function cleanupTerritoryFrontiers(state: GameState): GameState {
  const next: Record<string, TerritoryFrontierState> = {};
  for (const [key, frontier] of Object.entries(state.territoryFrontiers ?? {})) {
    if (!state.cities[frontier.holderCityId] || !state.cities[frontier.challengerCityId]) continue;
    const tile = state.map.tiles[key];
    if (!tile || tile.owner !== frontier.holderCivId) continue;
    next[key] = frontier;
  }
  return { ...state, territoryFrontiers: next };
}

export function processTerritoryFrontiers(state: GameState): GameState {
  const territory = recalculateTerritory(state, { reason: 'turn', preserveCurrentHolderOnTie: true });
  const frontiers: Record<string, TerritoryFrontierState> = { ...(territory.state.territoryFrontiers ?? {}) };
  for (const resolution of territory.resolutions) {
    const holder = resolution.previousOwner;
    const challenger = resolution.winningCivId;
    if (!holder || !challenger || holder === challenger) continue;
    const holderClaim = resolution.competingClaims.find(claim => claim.civId === holder);
    const challengerClaim = resolution.competingClaims.find(claim => claim.civId === challenger);
    if (!holderClaim || !challengerClaim) continue;
    const key = hexKey(resolution.coord);
    const previous = frontiers[key]?.progress ?? 0;
    const delta = Math.max(1, challengerClaim.pressure - holderClaim.pressure);
    const progress = Math.min(10, previous + delta);
    frontiers[key] = {
      coord: resolution.coord,
      holderCivId: holder,
      challengerCivId: challenger,
      holderCityId: holderClaim.cityId,
      challengerCityId: challengerClaim.cityId,
      progress,
      trend: progress >= 8 ? 'likely-to-flip' : 'contested',
      reason: `${challenger} cultural pressure is challenging ${holder}.`,
    };
  }
  return cleanupTerritoryFrontiers({ ...territory.state, territoryFrontiers: frontiers });
}
```

Populate `contestedResolutions` inside `recalculateTerritory` whenever two or more claims compete for a tile, the previous holder keeps ownership, and the strongest challenger has positive pressure against the holder. `processTerritoryFrontiers` must read `contestedResolutions`, not ownership-change `resolutions`, so frontier progress records before a flip.

- [ ] **Step 4: Add inspectable explanation UI**

Create `src/ui/territory-frontier-info.ts`:

```ts
import type { TerritoryFrontierState } from '@/core/types';

export function renderTerritoryFrontierInfo(frontier: TerritoryFrontierState): HTMLElement {
  const panel = document.createElement('section');
  panel.dataset.territoryFrontier = frontier.trend;
  const title = document.createElement('div');
  title.textContent = frontier.trend === 'likely-to-flip' ? 'Border likely to shift' : 'Contested border';
  const reason = document.createElement('p');
  reason.textContent = frontier.reason;
  panel.append(title, reason);
  return panel;
}
```

Add a UI test that renders a `likely-to-flip` frontier and asserts visible title and reason text.

- [ ] **Step 5: Run checks**

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/city-territory-system.ts src/ui/territory-frontier-info.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts tests/ui/territory-frontier-info.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit frontier state**

```bash
git add src/core/types.ts src/systems/city-territory-system.ts src/ui/territory-frontier-info.ts tests/systems/city-territory-system.test.ts tests/ui/territory-frontier-info.test.ts
git commit -m "feat(territory): track cultural frontier pressure"
```

---

### Task 7: MR6 Notifications, Balance Review, And Full Verification

**Files:**
- Modify: `src/systems/city-territory-system.ts`
- Modify: `src/ui/notification-routing.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/main.ts`
- Test: `tests/ui/notification-routing.test.ts`
- Test: `tests/systems/city-territory-system.test.ts`

- [ ] **Step 1: Write notification routing tests**

Add to `tests/ui/notification-routing.test.ts`:

```ts
it('routes territory improvement transfer notifications to the previous and new owner when both have intel', () => {
  const state = createNewGame(undefined, 'territory-transfer-notification');
  state.civilizations.player.visibility.tiles['5,5'] = 'visible';
  state.civilizations['ai-1'].visibility.tiles['5,5'] = 'visible';

  const targets = getNotificationTargetsForEvent(state, {
    type: 'territory:tile-flipped',
    coord: { q: 5, r: 5 },
    previousOwner: 'player',
    newOwner: 'ai-1',
    improvement: 'farm',
    constructionCancelled: false,
  });

  expect(targets.sort()).toEqual(['ai-1', 'player']);
});
```

- [ ] **Step 2: Add territory event payload**

In `src/core/types.ts`, extend `GameEvents`:

```ts
'territory:tile-flipped': {
  coord: HexCoord;
  previousOwner: string | null;
  newOwner: string | null;
  improvement: ImprovementType;
  constructionCancelled: boolean;
};
```

- [ ] **Step 3: Emit events from territory changes**

Where `recalculateTerritory` results are applied in turn/founding/capture paths, emit one `territory:tile-flipped` event per ownership change with:

```ts
{
  coord: resolution.coord,
  previousOwner: resolution.previousOwner,
  newOwner: resolution.winningCivId,
  improvement: tileAfter.improvement,
  constructionCancelled: tileBefore.improvement !== 'none' && tileBefore.improvementTurnsLeft > 0,
}
```

Do not emit events from steady-state scans where ownership did not change.

- [ ] **Step 4: Add notification text**

In the notification routing/display layer, use:

```ts
const message = event.constructionCancelled
  ? 'Border shifted; in-progress construction was cancelled.'
  : event.improvement !== 'none'
    ? `Border shifted; ${getImprovementDisplayName(event.improvement)} transferred.`
    : 'Border shifted.';
```

- [ ] **Step 5: Run targeted checks**

```bash
scripts/check-src-rule-violations.sh src/systems/city-territory-system.ts src/ui/notification-routing.ts src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts tests/ui/notification-routing.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full required verification**

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
git diff --stat origin/main...HEAD
git diff --stat
```

Expected: build exits 0, full test exits 0, and diffs contain only intended territory/worker/docs changes.

- [ ] **Step 7: Commit final polish**

```bash
git add src/core/types.ts src/systems/city-territory-system.ts src/ui/notification-routing.ts src/main.ts tests/systems/city-territory-system.test.ts tests/ui/notification-routing.test.ts
git commit -m "feat(territory): notify cultural border changes"
```

## Self-Review

- Spec coverage: MR1-MR6 map to ownership foundation, canonical path integration, growth, Soft Trim, culture frontier, UI feedback, save behavior, and verification.
- UI guardrails: plan includes a truth table, misleading UI risks, replay checklist, and rendered UI tests for panel/highlight/frontier behavior.
- Type consistency: plan uses `TerritoryClaim`, `TerritoryResolution`, `TerritoryFrontierState`, `recalculateTerritory`, and worker blocker reason names consistently.
- Verification coverage: each task includes targeted tests and source rule checks; final task includes build, full test suite, and diff review.
