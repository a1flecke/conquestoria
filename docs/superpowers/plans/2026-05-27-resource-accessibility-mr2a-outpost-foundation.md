# Resource Accessibility MR 2a — Resource Outpost Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `'resource_outpost'` improvement type to the type system, extend `getCivAvailableResources` with an outpost acquisition pass, add an emoji icon for rendering, and charge 2 gold/turn upkeep to outpost owners. No player-visible UI yet — MR 2b adds the Expedition unit that creates outposts.

**Architecture:** `'resource_outpost'` is an `ImprovementType` that workers cannot build (excluded from `BuildableImprovementType`). It is established only by the Expedition unit (MR 2b). The data model re-uses the existing `tile.improvement`, `tile.improvementTurnsLeft`, and `tile.owner` fields — no new state shape. `getCivAvailableResources` gains a second pass that scans all map tiles for completed outposts. Upkeep is deducted in the turn-manager's per-civ gold pass.

**Why this is safe to merge partial (no player-visible surface):** This MR introduces a new ImprovementType value and extends an internal function. Players cannot create outpost tiles without the Expedition unit (MR 2b), so the new code paths are inert until MR 2b ships.

**Tech Stack:** TypeScript, vitest.

---

## Files

- Modify: `src/core/types.ts:202–204` — add `'resource_outpost'` to `ImprovementType`; update `BuildableImprovementType`
- Modify: `src/renderer/hex-renderer.ts:13–22` — add `IMPROVEMENT_ICONS['resource_outpost']`
- Modify: `src/systems/resource-acquisition-system.ts:20–61` — add outpost pass to `getCivAvailableResources`
- Modify: `src/core/turn-manager.ts` — add outpost upkeep deduction
- Modify: `tests/systems/resource-acquisition-system.test.ts` — 4 new outpost tests
- Modify: `tests/core/turn-manager.test.ts` — 1 new upkeep test

---

### Task 1: Add `'resource_outpost'` to types and icons

**Files:**
- Modify: `src/core/types.ts:202–204`
- Modify: `src/renderer/hex-renderer.ts:13–22`

- [ ] **Step 1: Update `ImprovementType` and `BuildableImprovementType` in `types.ts`**

Current (lines 202–205):
```typescript
export type ImprovementType = 'farm' | 'mine' | 'lumber_camp' | 'watermill'
  | 'plantation' | 'pasture' | 'camp' | 'quarry' | 'none';
export type BuildableImprovementType = Exclude<ImprovementType, 'none'>;
export type WorkerActionType = BuildableImprovementType | 'drain_swamp';
```

Replace with:
```typescript
export type ImprovementType = 'farm' | 'mine' | 'lumber_camp' | 'watermill'
  | 'plantation' | 'pasture' | 'camp' | 'quarry' | 'resource_outpost' | 'none';
// resource_outpost is excluded: only Expeditions can establish outposts, not Workers
export type BuildableImprovementType = Exclude<ImprovementType, 'none' | 'resource_outpost'>;
export type WorkerActionType = BuildableImprovementType | 'drain_swamp';
```

- [ ] **Step 2: Add the icon to `IMPROVEMENT_ICONS` in `hex-renderer.ts`**

Current `IMPROVEMENT_ICONS` (starting at line 13):
```typescript
export const IMPROVEMENT_ICONS: Record<string, string> = {
  farm: '🌾',
  // ... other entries
};
```

Add `resource_outpost: '🚩',` to the map. The 🚩 emoji is not used by any existing improvement. Result:
```typescript
export const IMPROVEMENT_ICONS: Record<string, string> = {
  farm: '🌾',
  mine: '⛏️',
  lumber_camp: '🪵',
  watermill: '🌊',
  plantation: '🌿',
  pasture: '🐂',
  camp: '⛺',
  quarry: '⚒️',
  resource_outpost: '🚩',  // ← new; dedicated SVG sprite TBD via Claude Design
};
```

- [ ] **Step 3: Build to confirm type changes compile cleanly**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: Build succeeds. TypeScript will catch any downstream `BuildableImprovementType` exhaustive checks that now need updating; fix any that fail.

- [ ] **Step 4: Run existing tests**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```
Expected: All existing tests pass (no new code paths exercised yet).

- [ ] **Step 5: Commit the type change**

```bash
git add src/core/types.ts src/renderer/hex-renderer.ts
git commit -m "feat(resources): add resource_outpost ImprovementType and 🚩 icon"
```

---

### Task 2: Write failing tests for the outpost acquisition pass

**Files:**
- Modify: `tests/systems/resource-acquisition-system.test.ts`

These tests must fail until Task 3 implements the outpost pass.

- [ ] **Step 1: Add 4 outpost tests**

Find the existing `getCivAvailableResources` describe block in `tests/systems/resource-acquisition-system.test.ts` and add the following tests inside it:

```typescript
describe('outpost pass (Pillar 2)', () => {
  function makeStateWithOutpost(opts: {
    outpostOwner: string;
    resourceId: string;
    improvementTurnsLeft: number;
    playerTech: string[];
    tileInCityTerritory?: boolean;
  }): GameState {
    const state = createMinimalGameState(); // use whatever test helper creates a minimal state
    const civId = opts.outpostOwner;
    const tileCoord = { q: 10, r: 10 };
    const tileKey = hexKey(tileCoord);

    // Place resource tile with outpost
    state.map.tiles[tileKey] = {
      coord: tileCoord,
      terrain: 'hills',
      elevation: 'flat',
      resource: opts.resourceId,
      improvement: 'resource_outpost',
      improvementTurnsLeft: opts.improvementTurnsLeft,
      owner: civId,
      hasRiver: false,
      wonder: null,
    };

    // Set tech
    state.civilizations[civId].techState.completed = opts.playerTech;

    // Optionally put tile in city ownedTiles (to test the city-territory path doesn't interfere)
    if (opts.tileInCityTerritory) {
      const cityId = state.civilizations[civId].cities[0];
      if (cityId && state.cities[cityId]) {
        state.cities[cityId].ownedTiles.push(tileCoord);
      }
    }

    return state;
  }

  it('grants the resource when outpost is complete (improvementTurnsLeft === 0)', () => {
    const state = makeStateWithOutpost({
      outpostOwner: 'player',
      resourceId: 'iron',
      improvementTurnsLeft: 0,
      playerTech: ['bronze-working'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('iron')).toBe(true);
  });

  it('does NOT grant the resource when outpost is still in progress (improvementTurnsLeft > 0)', () => {
    const state = makeStateWithOutpost({
      outpostOwner: 'player',
      resourceId: 'iron',
      improvementTurnsLeft: 1,
      playerTech: ['bronze-working'],
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('iron')).toBe(false);
  });

  it('does NOT grant the resource when outpost is pillaged (improvement = none)', () => {
    const state = makeStateWithOutpost({
      outpostOwner: 'player',
      resourceId: 'iron',
      improvementTurnsLeft: 0,
      playerTech: ['bronze-working'],
    });
    // Simulate pillage
    const tileKey = hexKey({ q: 10, r: 10 });
    state.map.tiles[tileKey].improvement = 'none';
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('iron')).toBe(false);
  });

  it('does NOT grant the resource to a different civ', () => {
    const state = makeStateWithOutpost({
      outpostOwner: 'player',
      resourceId: 'iron',
      improvementTurnsLeft: 0,
      playerTech: ['bronze-working'],
    });
    // ai-1 also has the tech but does not own the outpost
    state.civilizations['ai-1'].techState.completed = ['bronze-working'];
    const result = getCivAvailableResources(state, 'ai-1');
    expect(result.has('iron')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/resource-acquisition-system.test.ts 2>&1 | grep -E "FAIL|outpost pass"
```
Expected: Tests fail because the outpost pass doesn't exist yet.

---

### Task 3: Implement the outpost acquisition pass

**Files:**
- Modify: `src/systems/resource-acquisition-system.ts:20–61`

- [ ] **Step 1: Add pass 2 to `getCivAvailableResources`**

After the existing city-territory loop (ends around line 58), add:

```typescript
  // Pass 2 — resource outpost tiles owned by this civ (outside city territory)
  // Linear scan over all tiles is acceptable: 60×40 = 2,400 tiles maximum.
  for (const tile of Object.values(state.map.tiles)) {
    if (
      tile.improvement !== 'resource_outpost' ||
      tile.improvementTurnsLeft !== 0 ||
      tile.owner !== civId ||
      !tile.resource
    ) continue;

    const def = resourceDefMap.get(tile.resource as ResourceType);
    if (!def) continue;
    if (!completedTechs.has(def.tech)) continue;

    result.add(tile.resource as ResourceType);
  }
```

- [ ] **Step 2: Run the new tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/resource-acquisition-system.test.ts 2>&1 | tail -15
```
Expected: All 4 outpost pass tests pass.

- [ ] **Step 3: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: Succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/systems/resource-acquisition-system.ts tests/systems/resource-acquisition-system.test.ts
git commit -m "feat(resources): outpost acquisition pass in getCivAvailableResources"
```

---

### Task 4: Write failing test for outpost upkeep

**Files:**
- Modify: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Add the upkeep test**

Find the turn-manager test file. Add inside a relevant describe block (or add a new one `describe('outpost upkeep')`):

```typescript
it('deducts 2 gold per completed outpost from the owning civ each turn', () => {
  const state = createMinimalTurnState(); // or whatever helper the file uses
  const civId = state.currentPlayer;
  const civ = state.civilizations[civId];

  // Give civ 20 gold
  civ.gold = 20;

  // Place 2 completed outposts owned by civ
  const keys = ['3,3', '7,7'];
  for (const key of keys) {
    const [q, r] = key.split(',').map(Number);
    state.map.tiles[key] = {
      coord: { q, r },
      terrain: 'hills',
      elevation: 'flat',
      resource: 'iron',
      improvement: 'resource_outpost',
      improvementTurnsLeft: 0,
      owner: civId,
      hasRiver: false,
      wonder: null,
    };
  }

  // Place one in-progress outpost — should NOT charge upkeep
  state.map.tiles['9,9'] = {
    coord: { q: 9, r: 9 },
    terrain: 'hills',
    elevation: 'flat',
    resource: 'iron',
    improvement: 'resource_outpost',
    improvementTurnsLeft: 1,  // not complete yet
    owner: civId,
    hasRiver: false,
    wonder: null,
  };

  // Run one turn
  const newState = processTurn(state); // or whatever the turn-manager export is

  const newGold = newState.civilizations[civId].gold;
  // 2 completed outposts × 2 gold = 4 gold deducted
  expect(newGold).toBeLessThanOrEqual(20 - 4);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/core/turn-manager.test.ts 2>&1 | grep -E "FAIL|outpost upkeep"
```
Expected: Test fails (upkeep not yet implemented).

---

### Task 5: Implement outpost upkeep in the turn-manager

**Files:**
- Modify: `src/core/turn-manager.ts`

- [ ] **Step 1: Find the per-civ gold processing pass**

Search for where building maintenance or gold income is processed per civ. Look for a pattern like:

```typescript
// building maintenance
const maintenance = city.buildings.reduce((sum, bId) => sum + (BUILDINGS[bId]?.maintenanceCost ?? 0), 0);
```

This is where you add outpost upkeep.

- [ ] **Step 2: Add the outpost upkeep deduction**

In the per-civ (or per-turn) gold processing section, after building maintenance, add:

```typescript
    // Resource outpost upkeep: 2 gold/turn per completed outpost owned by this civ
    const outpostUpkeep = Object.values(nextState.map.tiles).filter(
      tile =>
        tile.improvement === 'resource_outpost' &&
        tile.improvementTurnsLeft === 0 &&
        tile.owner === civId,
    ).length * 2;

    nextState = {
      ...nextState,
      civilizations: {
        ...nextState.civilizations,
        [civId]: {
          ...nextState.civilizations[civId],
          gold: nextState.civilizations[civId].gold - outpostUpkeep,
        },
      },
    };
```

**Important:** Follow the immutable spread-copy pattern used throughout turn-manager. Never mutate `state.civilizations[civId]` directly.

- [ ] **Step 3: Run the upkeep test**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/core/turn-manager.test.ts 2>&1 | grep -E "PASS|FAIL|outpost"
```
Expected: The outpost upkeep test passes.

- [ ] **Step 4: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 5: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: Succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/core/turn-manager.ts tests/core/turn-manager.test.ts
git commit -m "feat(resources): 2 gold/turn upkeep for completed resource outposts"
```
