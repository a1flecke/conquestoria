# Issue 118 City Capture And War-State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix issue `#118` so major-civ cities can be assaulted from live play, conquest/raze outcomes follow the new occupation rules, and war/peace state cannot silently flip to peace without the human player choosing it.

**Architecture:** Treat this as four connected but reviewable changes. First, extract a shared major-city assault resolution path that works for empty enemy cities and resolves either occupation or razing. Second, add a dedicated occupied-city state instead of overloading the existing revolt system, so newly conquered cities degrade and integrate over exactly 10 turns without accidentally spawning rebels. Third, split peace proposal from peace resolution so `request_peace` consistently means “enqueue a proposal” and only explicit acceptance changes war state.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM UI, existing `GameState` persistence

---

## Bug Analysis

Issue `#118` currently combines two failures:

1. The player cannot take over enemy cities from the live map flow.
2. War state can flip back to peace without player consent because peace “requests” are modeled as immediate bilateral peace.

The new conquest requirements add a third design constraint that the existing code does not support:

3. Conquest is no longer just ownership transfer. A captured city must either become an occupied city with reduced population and a 10-turn integration timer, or be razed for gold and diplomatic fallout.

### Root cause 1: Empty enemy cities are never routed through assault resolution

Current code evidence:

- `handleHexTap(...)` in `src/main.ts` only enters the combat preview path when a defender unit exists on the tapped tile.
- If the tile is in movement range and there is no defender unit, the code falls through to `executeUnitMove(...)`.
- Major-civ city capture only happens inside `executeAttack(...)` after a defender unit dies on a city tile.
- AI has the same structural hole in `src/ai/basic-ai.ts`: it can resolve adjacent unit combat, but it has no shared “assault exposed city” path.

### Root cause 2: Major-city conquest is modeled as a shallow owner swap

Current code evidence:

- `transferCapturedCityOwnership(...)` in `src/systems/city-capture-system.ts` only swaps the city owner and civ city rosters.
- It does not model player choice between occupation and razing.
- It does not reduce population, create a dedicated occupied-city timer, award raze salvage gold, or apply raze diplomacy penalties.
- It also is not a complete territory transfer path. The new implementation must update every tile in `city.ownedTiles`, not only the city object.

### Root cause 3: Existing unrest is the wrong primitive for post-conquest integration

Current code evidence:

- `src/systems/faction-system.ts` treats unrest as pressure-driven instability that can escalate into revolt, rebels, and breakaway states.
- That does not match the requested conquest rule: “start very unhappy, improve over 10 turns, then integrate.”
- The implementation must add a dedicated occupied-city state and derive visible mood from it, rather than storing conquest as ordinary revolt pressure.

### Root cause 4: `request_peace` is modeled as immediate bilateral peace

Current code evidence:

- `evaluateDiplomacy(...)` in `src/ai/ai-diplomacy.ts` can emit `request_peace`.
- `processAITurn(...)` in `src/ai/basic-ai.ts` handles that by calling `makePeace(...)` immediately.
- `applyDiplomaticAction(...)` in `src/systems/diplomacy-system.ts` does the same for the human-side action.
- That means an AI “request” can force peace on the human player with no acceptance step.

---

## Success Criteria

The issue is fixed only when all of the following are true:

1. A player unit can assault an ungarrisoned enemy major-civ city from the live map interaction flow.
2. A successful assault no longer behaves like ordinary movement.
3. The conquering side resolves one of three outcomes through one shared backend path:
   - occupy the city
   - raze the city
   - auto-raze a city whose population is `1`
4. Occupying a city halves its population with `Math.floor(...)`, keeps it at a minimum of `1` after the halving step, and starts a dedicated 10-turn occupation timer.
5. A city with population `1` is destroyed instead of occupied, and that destruction is treated as razing.
6. Razing awards `10 + floor(sum(building.productionCost) / 2)` gold, using the city’s current building list.
7. Razing applies a relationship penalty against the former owner if that owner is still a major civ in `state.civilizations`.
8. Occupied cities visibly start at “very unhappy,” improve over the 10-turn timer, and integrate cleanly at the end of that timer.
9. Occupied-city unhappiness has explicit gameplay cost:
   - turns `10` through `6`: city yields are multiplied by `0.5`
   - turns `5` through `1`: city yields are multiplied by `0.75`
   - turn `0`: occupation clears and yield penalty returns to `1`
10. Occupation does not piggyback on the generic revolt/breakaway path.
11. Territory ownership for the conquered city’s `ownedTiles` transfers on occupation and clears on raze.
12. AI can also assault exposed enemy cities through the same shared conquest resolver. For this issue, AI defaults to `occupy` unless the city is auto-razed because its population is `1`.
13. A successful assault leaves the attacker on the city tile for both occupy and raze outcomes, and consumes all remaining movement for that turn.
14. An AI peace request no longer forces both sides to peace automatically.
15. A human player sees an explicit pending peace request and must accept it before war state changes.
16. Save/load preserves pending peace requests and any new occupied-city state, and older saves without those fields load cleanly.
17. Every MR in this plan passes targeted tests, rule checks, and `yarn build` before push.

---

## Recommended MR Slice Strategy

Keep this issue in four reviewable, always-green MRs.

### MR 1: Shared City Assault And Conquest Outcomes

Scope:

- shared major-city resolution helper
- territory transfer/clear across all `ownedTiles`
- occupy vs raze backend outcomes
- auto-raze for population `1`
- gold salvage and raze diplomacy penalty
- AI path for assaulting exposed enemy cities

Why first:

- It puts all state mutation in one canonical place before any new UI is added
- It delivers backend value without temporarily shipping the wrong player-facing rule

### MR 2: Player Capture Choice And Occupied-City Presentation

Scope:

- live player assault routing for empty enemy cities
- player-facing occupy/raze choice panel
- explicit pending assault-choice state
- occupied-city timer ticking and visible mood
- occupied-city yield penalty integration
- city panel / renderer presentation for occupied cities

Why second:

- It depends on MR 1’s backend primitives
- It is the first MR that changes the live player conquest flow, so it must include the real choice behavior and its integration tests

### MR 3: Peace Requests Become Player-Choice State

Scope:

- change `request_peace` into proposal semantics everywhere
- add persisted pending peace request state plus legacy-load normalization
- stop AI from auto-forcing peace on human players
- add backend regressions for enqueue/accept/reject behavior and save/load

### MR 4: Surface Pending Peace Requests In The Diplomacy UI

Scope:

- surface accept/reject in diplomacy UI
- add peace-request notification routing
- add UI regression coverage

Do not combine these MRs unless a blocker forces it.

---

## File Map

### Files to modify or add

- `src/main.ts`
  - route enemy-city taps through assault resolution, open the occupy/raze panel for player captures, and apply accepted peace requests
- `src/input/selected-unit-tap-intent.ts`
  - shared player tap intent resolver used directly by `handleHexTap(...)`
- `src/input/city-assault-flow.ts`
  - pending assault-choice state plus final occupy/raze resolution for the live player path
- `src/systems/city-capture-system.ts`
  - shared major-city assault resolution, occupation outcome, raze outcome, tile-owner transfer/clear, salvage gold
- `src/systems/city-occupation-system.ts`
  - dedicated occupied-city timer, yield penalty helper, visible mood derivation, integration completion helper
- `src/core/turn-manager.ts`
  - tick occupied-city timers each turn
- `src/core/types.ts`
  - add typed occupied-city state and pending diplomacy request state
- `src/core/game-state.ts`
  - initialize new state fields on new games
- `src/storage/save-manager.ts`
  - preserve and normalize occupied-city and pending diplomacy request state on load
- `src/ai/basic-ai.ts`
  - use the shared city assault helper and choose `occupy` by default for AI captures
- `src/systems/diplomacy-system.ts`
  - separate “request peace” from “make peace” and normalize proposal semantics
- `src/ui/city-capture-panel.ts`
  - blocking player decision panel for `Occupy` vs `Raze`
- `src/ui/city-panel.ts`
  - show occupied-city countdown and mood text
- `src/renderer/city-renderer.ts`
  - expose/render occupied-city mood distinctly from generic unrest
- `src/ui/diplomacy-panel.ts`
  - surface pending peace requests and remove contradictory war actions
- `src/ui/notification-routing.ts`
  - notify the player about peace requests and city raze/capture outcomes if needed

### Tests to modify or add

- `tests/systems/city-capture-system.test.ts`
- `tests/ai/basic-ai.test.ts`
- `tests/systems/city-occupation-system.test.ts`
- `tests/input/selected-unit-tap-intent.test.ts`
- `tests/input/city-assault-flow.test.ts`
- `tests/ui/city-capture-panel.test.ts`
- `tests/ui/city-panel.test.ts`
- `tests/renderer/city-renderer.test.ts`
- `tests/core/turn-manager.test.ts`
- `tests/systems/diplomacy-system.test.ts`
- `tests/core/game-state.test.ts`
- `tests/storage/save-persistence.test.ts`
- `tests/ui/diplomacy-panel.test.ts`
- `tests/ui/notification-routing.test.ts`

Do not create speculative fixture files for this issue. Prefer small, file-local helpers inside the mirrored test file that uses them.

---

### Task 1: Shared City Assault And Conquest Outcomes

**Files:**
- Modify: `src/systems/city-capture-system.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/systems/city-capture-system.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Add the failing conquest regressions**

Add to `tests/systems/city-capture-system.test.ts`:

```ts
function makeExposedCityCaptureState({
  population,
  buildings,
}: {
  population: number;
  buildings: string[];
}): GameState {
  const state = createNewGame(undefined, 'capture-empty-city', 'small');
  state.civilizations.player.cities = [];
  state.civilizations['ai-1'].cities = [];
  state.civilizations.player.diplomacy.relationships['ai-1'] = 0;
  state.civilizations['ai-1'].diplomacy.relationships.player = 0;

  state.cities.athens = {
    ...foundCity('ai-1', { q: 1, r: 0 }, state.map),
    id: 'athens',
    name: 'Athens',
    owner: 'ai-1',
    position: { q: 1, r: 0 },
    population,
    buildings,
    ownedTiles: [{ q: 1, r: 0 }, { q: 1, r: 1 }],
  };
  state.civilizations['ai-1'].cities = ['athens'];
  state.map.tiles[hexKey({ q: 1, r: 0 })].owner = 'ai-1';
  state.map.tiles[hexKey({ q: 1, r: 1 })].owner = 'ai-1';

  return state;
}
```

```ts
it('occupies a captured city by halving population and transferring all owned tiles', () => {
  const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary', 'library'] });

  const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

  expect(result.state.cities.athens.owner).toBe('player');
  expect(result.state.cities.athens.population).toBe(3);
  expect(result.state.cities.athens.occupation).toEqual(
    expect.objectContaining({ originalOwnerId: 'ai-1', turnsRemaining: 10 }),
  );
  for (const coord of result.state.cities.athens.ownedTiles) {
    expect(result.state.map.tiles[hexKey(coord)].owner).toBe('player');
  }
});

it('auto-razes a size-1 city instead of occupying it', () => {
  const state = makeExposedCityCaptureState({ population: 1, buildings: ['granary'] });

  const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

  expect(result.outcome).toBe('razed');
  expect(result.state.cities.athens).toBeUndefined();
  expect(result.goldAwarded).toBe(30);
});

it('awards salvage gold and applies a raze relationship penalty', () => {
  const state = makeExposedCityCaptureState({ population: 4, buildings: ['granary', 'library', 'monument'] });
  const before = state.civilizations['ai-1'].diplomacy.relationships.player;

  const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

  expect(result.goldAwarded).toBe(10 + Math.floor((40 + 16 + 30) / 2));
  expect(result.state.cities.athens).toBeUndefined();
  expect(result.state.civilizations['ai-1'].diplomacy.relationships.player).toBe(before - 40);
});
```

Add to `tests/ai/basic-ai.test.ts`:

```ts
function makeAdjacentExposedCityState({ population }: { population: number }): GameState {
  const state = createNewGame(undefined, 'ai-city-capture', 'small');
  state.currentPlayer = 'ai-1';
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations.player.diplomacy.relationships['ai-1'] = -60;
  state.civilizations['ai-1'].diplomacy.relationships.player = -60;

  state.units['ai-attacker'] = {
    ...Object.values(state.units).find(unit => unit.owner === 'ai-1' && unit.type === 'warrior')!,
    id: 'ai-attacker',
    owner: 'ai-1',
    position: { q: 0, r: 0 },
    movementPointsLeft: 2,
    hasMoved: false,
  };

  state.cities['city-player'] = {
    ...foundCity('player', { q: 1, r: 0 }, state.map),
    id: 'city-player',
    name: 'Memphis',
    owner: 'player',
    position: { q: 1, r: 0 },
    population,
    ownedTiles: [{ q: 1, r: 0 }],
  };
  state.civilizations.player.cities = ['city-player'];
  state.map.tiles[hexKey({ q: 1, r: 0 })].owner = 'player';

  return state;
}
```

```ts
it('assaults and occupies an exposed enemy city', () => {
  const state = makeAdjacentExposedCityState({ population: 5 });

  const result = processAITurn(state, 'ai-1', new EventBus());

  expect(result.cities['city-player'].owner).toBe('ai-1');
  expect(result.cities['city-player'].population).toBe(2);
  expect(result.cities['city-player'].occupation?.turnsRemaining).toBe(10);
});
```

- [ ] **Step 2: Run the red tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts tests/input/selected-unit-tap-intent.test.ts tests/ai/basic-ai.test.ts
```

Expected:

- there is no occupy/raze resolver
- AI still cannot assault exposed cities

- [ ] **Step 3: Implement one shared conquest resolver**

In `src/systems/city-capture-system.ts`, add:

```ts
export type MajorCityCaptureDisposition = 'occupy' | 'raze';

export function computeRazeGold(city: City): number
export function resolveMajorCityCapture(
  state: GameState,
  cityId: string,
  newOwnerId: string,
  disposition: MajorCityCaptureDisposition,
  turn: number,
): {
  state: GameState;
  outcome: 'occupied' | 'razed';
  goldAwarded: number;
}
```

Rules:

- if `city.population <= 1`, force the disposition to `raze`
- occupation:
  - set `city.owner = newOwnerId`
  - set `city.population = Math.max(1, Math.floor(city.population / 2))`
  - keep existing buildings
  - add `occupation = { originalOwnerId: previousOwnerId, turnsRemaining: 10 }`
  - remove the city from the previous owner’s city list and add it once to the new owner’s city list
  - set every tile in `city.ownedTiles` to `owner = newOwnerId`
- raze:
  - remove the city from `state.cities`
  - remove the city id from the previous owner’s city list
  - clear `owner` on every tile in `city.ownedTiles`
  - award `10 + floor(sum(building.productionCost) / 2)` gold to the conqueror
  - apply `-40` relationship to the former owner toward the conqueror and the conqueror toward the former owner

- [ ] **Step 4: Route only the AI assault path through the shared resolver**

In `src/ai/basic-ai.ts`:

- when an adjacent enemy major city is exposed and already at war, move onto the tile and call `resolveMajorCityCapture(..., 'occupy', ...)`
- after a successful assault, keep the attacker on the city tile and set `movementPointsLeft = 0`
- do not add separate ad hoc AI-only capture logic

- [ ] **Step 5: Verify green**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts tests/ai/basic-ai.test.ts
scripts/check-src-rule-violations.sh src/systems/city-capture-system.ts src/ai/basic-ai.ts
./scripts/run-with-mise.sh yarn build
```

- [ ] **Step 6: Commit the first MR**

```bash
git add src/systems/city-capture-system.ts src/ai/basic-ai.ts tests/systems/city-capture-system.test.ts tests/ai/basic-ai.test.ts
git commit -m "fix(combat): resolve exposed city assaults"
```

---

### Task 2: Player Capture Choice And Occupied-City Presentation

**Files:**
- Create: `src/systems/city-occupation-system.ts`
- Create: `src/input/city-assault-flow.ts`
- Create: `src/ui/city-capture-panel.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/main.ts`
- Modify: `src/input/selected-unit-tap-intent.ts`
- Modify: `src/ui/city-panel.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `tests/systems/city-occupation-system.test.ts`
- Modify: `tests/input/selected-unit-tap-intent.test.ts`
- Modify: `tests/input/city-assault-flow.test.ts`
- Modify: `tests/ui/city-capture-panel.test.ts`
- Modify: `tests/ui/city-panel.test.ts`
- Modify: `tests/renderer/city-renderer.test.ts`
- Modify: `tests/core/game-state.test.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

**Player Truth Table:**
- Before assaulting a size-1 city: no choice panel appears; the city is auto-razed after the assault resolves
- Before assaulting a size-2+ city: the attacker reaches the city, then sees a blocking panel with `Occupy` and `Raze`
- Choosing `Occupy`: the city remains on the map, shows reduced population, and displays `Occupied: 10 turns to integrate`
- Choosing `Raze`: the city disappears, the player gets the shown gold amount immediately, and the map is interactive again
- After either choice: the attacker remains on the city hex and has no movement left for the turn

**Misleading UI Risks:**
- A non-blocking toast is not enough; the player must make the occupy/raze choice before continuing map actions
- Reusing generic revolt icons without explicit occupied-city text would make the new rule feel like an existing unrest bug

**Interaction Replay Checklist:**
- assault empty size-1 city
- assault empty size-4 city and confirm the choice panel appears
- assault defended size-4 city
- choose `Occupy`
- reopen the city panel on the next turn and confirm the countdown dropped by 1
- choose `Raze`
- save and reload an occupied city game, then reopen the city panel

- [ ] **Step 1: Add failing occupied-city and capture-choice regressions**

Add to `tests/systems/city-occupation-system.test.ts`:

```ts
function makeOccupiedCityState({ turnsRemaining }: { turnsRemaining: number }): GameState {
  const state = createNewGame(undefined, 'occupied-city', 'small');
  state.cities.athens = {
    ...foundCity('player', { q: 1, r: 0 }, state.map),
    id: 'athens',
    name: 'Athens',
    owner: 'player',
    position: { q: 1, r: 0 },
    occupation: { originalOwnerId: 'ai-1', turnsRemaining },
  };
  state.civilizations.player.cities = ['athens'];
  return state;
}
```

```ts
it('decays occupied-city mood over 10 turns and then clears occupation', () => {
  const state = makeOccupiedCityState({ turnsRemaining: 10 });

  let afterFive = state;
  for (let i = 0; i < 5; i++) afterFive = tickOccupiedCities(afterFive);

  let afterTen = state;
  for (let i = 0; i < 10; i++) afterTen = tickOccupiedCities(afterTen);

  expect(getOccupiedCityMood(afterFive.cities.athens)).toBe(1);
  expect(afterTen.cities.athens.occupation).toBeUndefined();
});
```

Add to `tests/core/turn-manager.test.ts`:

```ts
it('applies occupied-city yield penalties until integration completes', () => {
  const state = createNewGame(undefined, 'occupied-yields', 'small');
  const city = foundCity('player', { q: 1, r: 0 }, state.map);
  city.id = 'athens';
  city.population = 4;
  city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 8 };
  state.cities[city.id] = city;
  state.civilizations.player.cities = [city.id];

  const turnOne = processTurn(state, new EventBus());
  const cityAfterTurnOne = turnOne.cities.athens;

  expect(cityAfterTurnOne.occupation?.turnsRemaining).toBe(7);
  expect(getOccupiedCityYieldMultiplier(cityAfterTurnOne)).toBe(0.5);
});
```

Add to `tests/input/selected-unit-tap-intent.test.ts`:

```ts
it('returns assault-city for an ungarrisoned enemy major city in movement range', () => {
  const state = makeTapAssaultFixture();

  const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 });

  expect(intent).toEqual({ kind: 'assault-city', cityId: 'enemyCity' });
});
```

Add to `tests/input/city-assault-flow.test.ts`:

```ts
it('creates a pending player choice for a size-2 city and finalizes occupy onto the city hex', () => {
  const state = makePlayerAssaultState({ population: 4 });

  const pending = beginPlayerCityAssaultChoice(state, 'unit-1', 'athens');
  const result = finalizePlayerCityAssaultChoice(state, pending, 'occupy', state.turn);

  expect(pending.preview.occupiedPopulation).toBe(2);
  expect(result.state.units['unit-1'].position).toEqual({ q: 1, r: 0 });
  expect(result.state.units['unit-1'].movementPointsLeft).toBe(0);
  expect(result.state.cities.athens.owner).toBe('player');
});

it('creates a pending player choice for a size-2 city and finalizes raze onto the city hex', () => {
  const state = makePlayerAssaultState({ population: 4 });

  const pending = beginPlayerCityAssaultChoice(state, 'unit-1', 'athens');
  const result = finalizePlayerCityAssaultChoice(state, pending, 'raze', state.turn);

  expect(result.state.units['unit-1'].position).toEqual({ q: 1, r: 0 });
  expect(result.state.units['unit-1'].movementPointsLeft).toBe(0);
  expect(result.state.cities.athens).toBeUndefined();
});
```

Add to `tests/ui/city-capture-panel.test.ts`:

```ts
it('shows occupy and raze outcomes for a newly conquered city', () => {
  const container = document.createElement('div');
  const panel = createCityCapturePanel(container, {
    cityName: 'Athens',
    occupiedPopulation: 3,
    razeGold: 53,
    onOccupy: () => {},
    onRaze: () => {},
  });

  const rendered = panel.innerHTML ?? panel.textContent ?? '';
  expect(rendered).toContain('Occupy');
  expect(rendered).toContain('Raze');
  expect(rendered).toContain('Population 3');
  expect(rendered).toContain('53 gold');
});
```

Add to `tests/ui/city-capture-panel.test.ts`:

```ts
it('calls the selected callback exactly once', () => {
  const container = document.createElement('div');
  const onOccupy = vi.fn();
  const onRaze = vi.fn();
  const panel = createCityCapturePanel(container, {
    cityName: 'Athens',
    occupiedPopulation: 3,
    razeGold: 53,
    onOccupy,
    onRaze,
  });

  panel.querySelector('[data-action=\"occupy\"]')?.dispatchEvent(new Event('click'));

  expect(onOccupy).toHaveBeenCalledTimes(1);
  expect(onRaze).not.toHaveBeenCalled();
});
```

Add to `tests/ui/city-panel.test.ts`:

```ts
it('shows occupied-city integration countdown', () => {
  const { container, city, state } = makeMultiCityFixture();
  city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 7 };

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });
  const rendered = panel.innerHTML ?? panel.textContent ?? '';

  expect(rendered).toContain('Occupied');
  expect(rendered).toContain('7 turns');
});
```

Add to `tests/renderer/city-renderer.test.ts`:

```ts
function makeVisibleOccupiedCityState({ turnsRemaining }: { turnsRemaining: number }): GameState {
  const state = createNewGame(undefined, 'occupied-render', 'small');
  const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler')!;
  const city = foundCity('player', settler.position, state.map);
  city.id = 'occupied-city';
  city.occupation = { originalOwnerId: 'ai-1', turnsRemaining };
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';
  return state;
}
```

```ts
it('renders an occupied-city badge separately from ordinary unrest', () => {
  const state = makeVisibleOccupiedCityState({ turnsRemaining: 9 });
  const mock = new MockCanvasContext();
  const ctx = mock as unknown as CanvasRenderingContext2D;
  const camera = {
    zoom: 1,
    hexSize: 48,
    isHexVisible: () => true,
    worldToScreen: (x: number, y: number) => ({ x, y }),
  } as unknown as Camera;

  drawCities(ctx, state, camera, 'player');

  const overlayTexts = mock.fillTextCalls.map(call => call.text);
  expect(overlayTexts).toContain('☹');
});
```

Add to `tests/storage/save-persistence.test.ts`:

```ts
it('round-trips occupied city state through save and load', async () => {
  const state = createNewGame(undefined, 'occupied-save', 'small');
  state.cities.athens = {
    ...foundCity('player', { q: 1, r: 0 }, state.map),
    id: 'athens',
    name: 'Athens',
    owner: 'player',
    position: { q: 1, r: 0 },
  };
  state.civilizations.player.cities = ['athens'];
  state.cities.athens.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 6 };

  await saveGame('slot-occupied-city', state);
  const loaded = await loadGame('slot-occupied-city');

  expect(loaded?.cities.athens.occupation).toEqual(state.cities.athens.occupation);
});
```

- [ ] **Step 2: Run the red tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-occupation-system.test.ts tests/input/selected-unit-tap-intent.test.ts tests/input/city-assault-flow.test.ts tests/ui/city-capture-panel.test.ts tests/ui/city-panel.test.ts tests/renderer/city-renderer.test.ts tests/core/turn-manager.test.ts tests/storage/save-persistence.test.ts tests/core/game-state.test.ts
```

- [ ] **Step 3: Add dedicated occupied-city state**

In `src/core/types.ts`, add:

```ts
export interface OccupiedCityState {
  originalOwnerId: string;
  turnsRemaining: number;
}
```

And on `City`:

```ts
occupation?: OccupiedCityState;
```

In `src/core/game-state.ts`, initialize new cities without `occupation`.

In `src/systems/city-occupation-system.ts`, add:

```ts
export function getOccupiedCityMood(city: City): 0 | 1 | 2
export function getOccupiedCityYieldMultiplier(city: City): 0.5 | 0.75 | 1
export function tickOccupiedCities(state: GameState): GameState
```

Rules:

- `turnsRemaining >= 6` => mood `2`
- `turnsRemaining >= 1 && <= 5` => mood `1`
- yield multiplier:
  - mood `2` => `0.5`
  - mood `1` => `0.75`
  - no occupation => `1`
- `0` => no occupation
- decrement once per full turn in `turn-manager`
- when the timer reaches `0`, clear `occupation`
- do not convert occupation into rebels or breakaway states

In `src/core/turn-manager.ts`:

- combine occupation penalties with existing unrest penalties by multiplying city yields by `Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city))`
- do not let occupied-city mood spawn rebels or breakaways; occupation is yield pressure only

- [ ] **Step 4: Add explicit pending assault-choice state and replace temporary defaults**

In `src/input/city-assault-flow.ts`, add:

```ts
export interface PendingCityCaptureChoice {
  attackerId: string;
  cityId: string;
  targetCoord: HexCoord;
  occupiedPopulation: number;
  razeGold: number;
}

export function beginPlayerCityAssaultChoice(
  state: GameState,
  attackerId: string,
  cityId: string,
): PendingCityCaptureChoice

export function finalizePlayerCityAssaultChoice(
  state: GameState,
  pending: PendingCityCaptureChoice,
  disposition: MajorCityCaptureDisposition,
  turn: number,
): {
  state: GameState;
  outcome: 'occupied' | 'razed';
  goldAwarded: number;
}
```

Rules:

- `beginPlayerCityAssaultChoice(...)` computes preview only and does not mutate the city yet
- `finalizePlayerCityAssaultChoice(...)`:
  - moves the attacker onto `pending.targetCoord`
  - sets `movementPointsLeft = 0`
  - sets `hasMoved = true`
  - resolves `occupy` or `raze` through `resolveMajorCityCapture(...)`
- attacker outcome is identical for occupy and raze: remain on the target hex and end movement for the turn

In `src/ui/city-capture-panel.ts`, build a blocking overlay with:

- city name
- occupied population outcome
- raze gold outcome
- `Occupy` button
- `Raze` button

In `src/main.ts`:

- keep `let pendingCityCaptureChoice: PendingCityCaptureChoice | null = null;` as transient UI state
- if the player assaults a size-1 city, skip the panel and auto-raze
- if the player assaults a size-2+ city, call `beginPlayerCityAssaultChoice(...)`, assign it to `pendingCityCaptureChoice`, and open the panel
- only finalize the outcome after the click, then clear `pendingCityCaptureChoice`
- while the panel is open, block other map interactions
- keep AI on the backend default `occupy` path for now

Add one real player-flow regression in `tests/input/city-assault-flow.test.ts` that covers:

- empty city tap resolves to `assault-city`
- `beginPlayerCityAssaultChoice(...)` returns the preview
- `finalizePlayerCityAssaultChoice(..., 'occupy')` applies the chosen result

- [ ] **Step 5: Show occupation status in existing city surfaces**

In `src/ui/city-panel.ts`:

- render `Occupied: X turns to integrate` near the population line
- render `Very Unhappy` when mood is `2`, `Unhappy` when mood is `1`

In `src/renderer/city-renderer.ts`:

- render `☹` for occupied mood `2`
- render `⚡` for occupied mood `1`
- keep generic unrest and breakaway badges distinct; occupation must not masquerade as a rebellion

- [ ] **Step 6: Verify green**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-occupation-system.test.ts tests/input/selected-unit-tap-intent.test.ts tests/input/city-assault-flow.test.ts tests/ui/city-capture-panel.test.ts tests/ui/city-panel.test.ts tests/renderer/city-renderer.test.ts tests/core/turn-manager.test.ts tests/storage/save-persistence.test.ts tests/core/game-state.test.ts tests/ai/basic-ai.test.ts
scripts/check-src-rule-violations.sh src/systems/city-occupation-system.ts src/input/city-assault-flow.ts src/input/selected-unit-tap-intent.ts src/core/types.ts src/core/game-state.ts src/core/turn-manager.ts src/main.ts src/ui/city-capture-panel.ts src/ui/city-panel.ts src/renderer/city-renderer.ts src/storage/save-manager.ts
./scripts/run-with-mise.sh yarn build
```

- [ ] **Step 7: Commit the second MR**

```bash
git add src/systems/city-occupation-system.ts src/input/city-assault-flow.ts src/input/selected-unit-tap-intent.ts src/core/types.ts src/core/game-state.ts src/core/turn-manager.ts src/main.ts src/ui/city-capture-panel.ts src/ui/city-panel.ts src/renderer/city-renderer.ts src/storage/save-manager.ts tests/systems/city-occupation-system.test.ts tests/input/selected-unit-tap-intent.test.ts tests/input/city-assault-flow.test.ts tests/ui/city-capture-panel.test.ts tests/ui/city-panel.test.ts tests/renderer/city-renderer.test.ts tests/core/turn-manager.test.ts tests/storage/save-persistence.test.ts tests/core/game-state.test.ts
git commit -m "feat(ui): add occupied city capture choices"
```

---

### Task 3: Peace Requests Become Player-Choice State

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `src/systems/diplomacy-system.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/systems/diplomacy-system.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`
- Modify: `tests/core/game-state.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing diplomacy regressions**

Add to `tests/systems/diplomacy-system.test.ts`:

```ts
function makeWarState(): GameState {
  const state = createNewGame(undefined, 'peace-request-test', 'small');
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.relationships['ai-1'] = -25;
  state.civilizations['ai-1'].diplomacy.relationships.player = -25;
  state.pendingDiplomacyRequests = [];
  return state;
}
```

```ts
it('request_peace enqueues a proposal instead of clearing war state', () => {
  const state = makeWarState();

  const result = applyDiplomaticAction(state, 'ai-1', 'player', 'request_peace', new EventBus());

  expect(result.civilizations.player.diplomacy.atWarWith).toContain('ai-1');
  expect(result.pendingDiplomacyRequests).toContainEqual(
    expect.objectContaining({ fromCivId: 'ai-1', toCivId: 'player', type: 'peace' }),
  );
});
```

Add to `tests/ai/basic-ai.test.ts`:

```ts
function makeAiPeaceRequestState(): GameState {
  const state = createNewGame(undefined, 'ai-peace-request', 'small');
  state.currentPlayer = 'ai-1';
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.relationships['ai-1'] = 10;
  state.civilizations['ai-1'].diplomacy.relationships.player = 10;
  state.pendingDiplomacyRequests = [];
  return state;
}
```

```ts
it('does not auto-force peace on a human player', () => {
  const state = makeAiPeaceRequestState();
  const result = processAITurn(state, 'ai-1', new EventBus());

  expect(result.civilizations.player.diplomacy.atWarWith).toContain('ai-1');
  expect(result.pendingDiplomacyRequests).toContainEqual(
    expect.objectContaining({ fromCivId: 'ai-1', toCivId: 'player', type: 'peace' }),
  );
});
```

- [ ] **Step 2: Run the red diplomacy tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/diplomacy-system.test.ts tests/ai/basic-ai.test.ts tests/core/game-state.test.ts tests/storage/save-persistence.test.ts
```

- [ ] **Step 3: Introduce persisted pending peace request state**

In `src/core/types.ts`, add:

```ts
export interface PendingDiplomaticRequest {
  id: string;
  type: 'peace';
  fromCivId: string;
  toCivId: string;
  turnIssued: number;
}
```

On `GameState`:

```ts
pendingDiplomacyRequests?: PendingDiplomaticRequest[];
```

In `src/core/game-state.ts`, initialize:

```ts
pendingDiplomacyRequests: [],
```

In `src/storage/save-manager.ts`, normalize older saves:

```ts
loaded.pendingDiplomacyRequests = loaded.pendingDiplomacyRequests ?? [];
```

- [ ] **Step 4: Split request from resolution**

In `src/systems/diplomacy-system.ts`, add:

```ts
export function enqueuePeaceRequest(...)
export function acceptDiplomaticRequest(...)
export function rejectDiplomaticRequest(...)
```

Rules:

- `request_peace` always means proposal
- only `acceptDiplomaticRequest(...)` may call `makePeace(...)`
- duplicate pending peace requests are ignored

In `src/ai/basic-ai.ts`:

- if `decision.action === 'request_peace'`, enqueue a proposal instead of calling `makePeace(...)`

- [ ] **Step 5: Verify green**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/diplomacy-system.test.ts tests/ai/basic-ai.test.ts tests/core/game-state.test.ts tests/storage/save-persistence.test.ts
scripts/check-src-rule-violations.sh src/core/types.ts src/core/game-state.ts src/storage/save-manager.ts src/systems/diplomacy-system.ts src/ai/basic-ai.ts
./scripts/run-with-mise.sh yarn build
```

- [ ] **Step 6: Commit the third MR**

```bash
git add src/core/types.ts src/core/game-state.ts src/storage/save-manager.ts src/systems/diplomacy-system.ts src/ai/basic-ai.ts tests/systems/diplomacy-system.test.ts tests/ai/basic-ai.test.ts tests/core/game-state.test.ts tests/storage/save-persistence.test.ts
git commit -m "fix(diplomacy): require acceptance for peace requests"
```

---

### Task 4: Surface Pending Peace Requests In The Diplomacy UI

**Files:**
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/notification-routing.ts`
- Modify: `tests/ui/diplomacy-panel.test.ts`
- Modify: `tests/ui/notification-routing.test.ts`

**Player Truth Table:**
- Before request: rival row shows `Request Peace` only if still at war and no pending request exists
- After AI request arrives: player remains at war and sees `Accept Peace` / `Reject Peace`
- Accept: war clears and `Declare War` appears only after peace is real
- Reject: war remains active and the pending request disappears

**Misleading UI Risks:**
- notification-only is not enough if the diplomacy row still offers contradictory actions
- the row must not imply peace has already happened

**Interaction Replay Checklist:**
- receive an AI peace request while at war
- open diplomacy panel immediately
- accept peace
- reload and confirm no pending request remains
- reject peace and confirm war remains active

- [ ] **Step 1: Add failing UI regressions**

Add to `tests/ui/diplomacy-panel.test.ts`:

```ts
it('shows accept and reject peace actions for a pending ai peace request', () => {
  const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
  state.civilizations.player.diplomacy.atWarWith = ['outsider'];
  state.civilizations.outsider.diplomacy.atWarWith = ['player'];
  state.pendingDiplomacyRequests = [{ id: 'req-1', type: 'peace', fromCivId: 'outsider', toCivId: 'player', turnIssued: state.turn }];

  const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });
  const rendered = panel.innerHTML ?? panel.textContent ?? '';

  expect(rendered).toContain('Accept Peace');
  expect(rendered).toContain('Reject Peace');
  expect(rendered).not.toContain('Declare War');
});
```

Add to `tests/ui/notification-routing.test.ts`:

```ts
it('routes peace-request notifications only to the target player', () => {
  const state = makeState();
  const { sink, calls } = makeSink();

  routePeaceRequested(state, 'ai-1', 'player', sink);

  expect(calls).toEqual([
    expect.objectContaining({ civId: 'player', message: expect.stringMatching(/requested peace/i) }),
  ]);
});
```

- [ ] **Step 2: Run the red UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts tests/ui/notification-routing.test.ts
```

- [ ] **Step 3: Wire the UI callbacks**

In `src/ui/diplomacy-panel.ts`:

- add `onAcceptDiplomaticRequest` and `onRejectDiplomaticRequest` callbacks
- when the current player has a pending request from that civ, render `Accept Peace` and `Reject Peace`
- suppress `Declare War` in that state

In `src/main.ts`:

- pass the new callbacks into `createDiplomacyPanel(...)`
- call `acceptDiplomaticRequest(...)` / `rejectDiplomaticRequest(...)`
- refresh the panel immediately after the choice

- [ ] **Step 4: Add the player-facing notification**

In `src/ui/notification-routing.ts`:

- add `routePeaceRequested(...)`
- emit only to the target player
- keep wording explicit that this is a request, not already-made peace

- [ ] **Step 5: Verify green**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts tests/ui/notification-routing.test.ts tests/systems/diplomacy-system.test.ts tests/ai/basic-ai.test.ts
scripts/check-src-rule-violations.sh src/ui/diplomacy-panel.ts src/main.ts src/ui/notification-routing.ts
./scripts/run-with-mise.sh yarn build
```

- [ ] **Step 6: Commit the fourth MR**

```bash
git add src/ui/diplomacy-panel.ts src/main.ts src/ui/notification-routing.ts tests/ui/diplomacy-panel.test.ts tests/ui/notification-routing.test.ts
git commit -m "fix(ui): require player choice for peace offers"
```

---

## Final Verification For The Full Issue

Before declaring issue `#118` fixed, run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts tests/systems/city-occupation-system.test.ts tests/input/selected-unit-tap-intent.test.ts tests/input/city-assault-flow.test.ts tests/ai/basic-ai.test.ts tests/ui/city-capture-panel.test.ts tests/ui/city-panel.test.ts tests/renderer/city-renderer.test.ts tests/core/turn-manager.test.ts tests/systems/diplomacy-system.test.ts tests/core/game-state.test.ts tests/storage/save-persistence.test.ts tests/ui/diplomacy-panel.test.ts tests/ui/notification-routing.test.ts
scripts/check-src-rule-violations.sh src/systems/city-capture-system.ts src/systems/city-occupation-system.ts src/input/selected-unit-tap-intent.ts src/input/city-assault-flow.ts src/ai/basic-ai.ts src/main.ts src/core/types.ts src/core/game-state.ts src/core/turn-manager.ts src/storage/save-manager.ts src/ui/city-capture-panel.ts src/ui/city-panel.ts src/renderer/city-renderer.ts src/systems/diplomacy-system.ts src/ui/diplomacy-panel.ts src/ui/notification-routing.ts
./scripts/run-with-mise.sh yarn build
git diff --stat origin/main...HEAD
git diff --stat
```

If any command fails, do not push. Fix the branch first.

---

## Self-Review

Spec coverage:

- empty-city conquest: covered by Task 1
- occupy vs raze outcomes: covered by Task 1 and Task 2
- population halving and auto-raze at size 1: covered by Task 1
- occupied-city mood and 10-turn integration: covered by Task 2
- raze gold reward and relationship penalty: covered by Task 1
- involuntary AI peace: covered by Task 3
- player-visible diplomacy consistency: covered by Task 4

Placeholder scan:

- no `TODO`
- no `TBD`
- no unnamed helpers
- every new state field has a named home

Type consistency:

- `resolveMajorCityCapture(...)` is the only major-city resolution helper name used throughout
- `occupation` is the dedicated city state field for post-conquest integration
- `pendingDiplomacyRequests` is the single pending-request field throughout
- `acceptDiplomaticRequest(...)` / `rejectDiplomaticRequest(...)` are the only peace-response helper names used
