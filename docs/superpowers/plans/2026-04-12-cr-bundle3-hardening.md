# Code Review Bundle 3 — Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two latent-trap issues: rebel spawns must respect tile occupancy, and `getMinorCivPresentationForPlayer` must not leak a minor civ's color before discovery.

**Architecture:** Both fixes are small, well-contained, and test-first. Rebel spawning iterates the offset list until it finds an unoccupied tile (or gives up). Minor-civ presentation returns a neutral color when `known` is false.

**Tech Stack:** TypeScript, Vitest.

**Reference:** April 12 code review, issues 6 and 7. Baseline SHA: `9eae2dc` (or after Bundles 1 and 2 land).

---

## Task 1: Rebel spawn respects tile occupancy

**Files:**
- Test: `tests/systems/faction-system.test.ts`
- Modify: `src/systems/faction-system.ts` (the `spawnRebelUnitsImmutable` function if Bundle 1 landed, otherwise the `spawnRebelUnits` function at lines 89-106)

- [ ] **Step 1: Write failing test**

Append to `tests/systems/faction-system.test.ts`:

```typescript
it('revolt does not spawn rebels on top of existing units', () => {
  // Pre-populate all six neighbour tiles with friendly units
  const cityPos = { q: 0, r: 0 };
  const neighbours = [
    { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
  ];

  const state = makeState({
    cityPosition: cityPos,
    unrestLevel: 1,
    unrestTurns: REVOLT_UNREST_TURNS - 1,
    cityCount: 6,
    conquestTurn: 0,
    unitPositions: neighbours,
  });

  const before = { ...state.units };
  const next = processFactionTurn(state, new EventBus());

  for (const unitId of Object.keys(next.units)) {
    if (before[unitId]) continue; // pre-existing unit, ignore
    const newUnit = next.units[unitId];
    // Any newly-spawned rebel must NOT share a tile with an existing occupant
    const key = `${newUnit.position.q},${newUnit.position.r}`;
    const occupants = Object.values(before).filter(u =>
      `${u.position.q},${u.position.r}` === key,
    );
    expect(occupants.length).toBe(0);
  }
});
```

If `REVOLT_UNREST_TURNS` is not exported, import it from `@/systems/faction-system` or inline the literal `5`.

- [ ] **Step 2: Run and verify fail**

Run: `yarn test tests/systems/faction-system.test.ts -t "does not spawn rebels on top"`
Expected: FAIL — rebels spawn on tiles that are already occupied.

- [ ] **Step 3: Skip occupied tiles when spawning**

In `src/systems/faction-system.ts`, update the spawn helper. If Bundle 1 landed, edit `spawnRebelUnitsImmutable`; otherwise edit `spawnRebelUnits`.

Replace the inner spawn loop body with (immutable variant shown — adjust for mutating variant analogously):

```typescript
const occupied = new Set<string>();
for (const unit of Object.values(nextUnits)) {
  occupied.add(`${unit.position.q},${unit.position.r}`);
}

for (let i = 0; i < spawnCount; i++) {
  // Try up to the full offset list to find a free tile
  let placed = false;
  const startIdx = Math.floor(rng() * offsets.length);
  for (let step = 0; step < offsets.length && !placed; step++) {
    const offset = offsets[(startIdx + step) % offsets.length];
    const pos: HexCoord = { q: city.position.q + offset.q, r: city.position.r + offset.r };
    const key = `${pos.q},${pos.r}`;
    if (!map.tiles[key]) continue;
    if (occupied.has(key)) continue;
    const rebel = createUnit(unitType, 'rebels', pos);
    nextUnits = { ...nextUnits, [rebel.id]: rebel };
    occupied.add(key);
    placed = true;
  }
  // If no free tile found, silently skip this rebel — better than stacking.
}
```

- [ ] **Step 4: Run the test**

Run: `yarn test tests/systems/faction-system.test.ts`
Expected: PASS, and all prior faction tests still green.

- [ ] **Step 5: Commit**

```bash
git add tests/systems/faction-system.test.ts src/systems/faction-system.ts
git commit -m "fix(m4-review): rebel spawn respects tile occupancy"
```

---

## Task 2: Minor-civ presentation masks color when undiscovered

**Files:**
- Test: `tests/systems/minor-civ-presentation.test.ts`
- Modify: `src/systems/minor-civ-presentation.ts:20-26`

- [ ] **Step 1: Write failing test**

Append to `tests/systems/minor-civ-presentation.test.ts`:

```typescript
it('returns a neutral color when the minor civ is not yet discovered', () => {
  const { state, viewerCivId, undiscoveredMcId } = buildUndiscoveredMcFixture();

  const presentation = getMinorCivPresentationForPlayer(state, viewerCivId, undiscoveredMcId);

  expect(presentation.known).toBe(false);
  expect(presentation.color).toBe('#888');
});
```

Add a helper `buildUndiscoveredMcFixture` at the top of the file (or inline) that builds a minimal state with one minor civ that the viewer has NOT discovered. If the existing fixtures already have a "known: false" case, read them and just assert the color.

- [ ] **Step 2: Run and verify fail**

Run: `yarn test tests/systems/minor-civ-presentation.test.ts -t "neutral color"`
Expected: FAIL — returns the real `def.color`.

- [ ] **Step 3: Mask color behind `known`**

In `src/systems/minor-civ-presentation.ts`, replace the `return` block (lines 21-25) with:

```typescript
return {
  known,
  name: known ? (def?.name ?? unknownName) : unknownName,
  color: known ? (def?.color ?? '#888') : '#888',
};
```

- [ ] **Step 4: Run the test**

Run: `yarn test tests/systems/minor-civ-presentation.test.ts`
Expected: PASS.

- [ ] **Step 5: Audit existing consumers**

Run: `grep -rn "getMinorCivPresentationForPlayer" src/ | grep -v "\.test\."`

For each hit, confirm that using `'#888'` for undiscovered city-states is visually correct (diplomacy panel, notifications, quest presentation). Current call sites render only known city-states in the diplomacy panel list and use color in notification chips — masked color for undiscovered is the desired behaviour.

If any consumer depends on the real color for *internal* logic (not display), switch that call to a new helper `getMinorCivTrueColor(state, mcId)` that returns the raw color regardless of discovery. If no such consumer exists, skip this step.

- [ ] **Step 6: Commit**

```bash
git add tests/systems/minor-civ-presentation.test.ts src/systems/minor-civ-presentation.ts
git commit -m "fix(m4-review): mask minor-civ color until discovered"
```

---

## Task 3: Bundle verification

- [ ] **Step 1: Full suite**

Run: `yarn test`
Expected: All green.

- [ ] **Step 2: Build smoke**

Run: `yarn build`
Expected: Success.

- [ ] **Step 3: Manual sanity check (UI)**

Run: `yarn dev`
Open the game. Start a new game where one or more city-states are off-screen. Open the diplomacy panel. Confirm undiscovered city-states (if any are listed) show neutral grey chips rather than their real color. Stop the dev server.

- [ ] **Step 4: Commit any follow-ups**

```bash
git add -p
git commit -m "fix(m4-review): bundle 3 verification follow-ups"
```

---

**Done when:** all tasks green, rebels never stack, undiscovered city-states present as grey.
