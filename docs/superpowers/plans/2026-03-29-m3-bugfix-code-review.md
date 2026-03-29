# M3 Bugfix & Code Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 13 bugs and quality issues found during comprehensive code review after M3c, plus update CLAUDE.md to prevent recurrence.

**Architecture:** All fixes are localized to existing files. No new systems. Most fixes are 1-5 line changes. The unit spawn fix requires a new event handler in main.ts and unit creation logic in turn-manager.ts. CLAUDE.md gets new rules to catch these bug classes.

**Tech Stack:** TypeScript, Vitest, Canvas 2D

---

## Task 1: Trained units never spawn

The most critical bug. When a city finishes training a unit, `processCity` returns `completedUnit` and `turn-manager.ts:44` emits `city:unit-trained`, but no code creates the actual unit or adds it to game state.

**Files:**
- Modify: `src/core/turn-manager.ts:40-46`
- Modify: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/core/turn-manager.test.ts
import { foundCity } from '@/systems/city-system';

it('spawns a unit when city completes unit training', () => {
  const state = createNewGame(undefined, 'unit-spawn-test', 'small');
  const bus = new EventBus();

  // Found a city for player
  const startPos = state.units[state.civilizations.player.units[0]].position;
  const city = foundCity('player', startPos, state.map);
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);

  // Queue a warrior and set progress to nearly complete
  city.productionQueue = ['warrior'];
  city.productionProgress = 24; // warrior costs 25, +1 production from city center will complete it

  const unitCountBefore = Object.values(state.units).filter(u => u.owner === 'player').length;
  const newState = processTurn(state, bus);
  const unitCountAfter = Object.values(newState.units).filter(u => u.owner === 'player').length;

  expect(unitCountAfter).toBe(unitCountBefore + 1);
  expect(newState.civilizations.player.units.length).toBe(unitCountBefore + 1);
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `yarn test --run tests/core/turn-manager.test.ts`
Expected: FAIL — unit count unchanged

- [ ] **Step 3: Implement unit spawning in turn-manager.ts**

Replace lines 40-46 in `src/core/turn-manager.ts`:

```typescript
      if (result.completedUnit) {
        bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
        // Actually create the unit at the city position
        const newUnit = createUnit(result.completedUnit, civId, city.position);
        newState.units[newUnit.id] = newUnit;
        newState.civilizations[civId].units.push(newUnit.id);
      }
```

- [ ] **Step 4: Run test, verify PASS**

Run: `yarn test --run tests/core/turn-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `yarn test --run`
Expected: All pass

---

## Task 2: Add new unit types to TRAINABLE_UNITS

M3c added swordsman, pikeman, musketeer to `UNIT_DEFINITIONS` but they're missing from `TRAINABLE_UNITS`. Players can never build them. Each requires a tech prerequisite.

**Files:**
- Modify: `src/systems/city-system.ts:48-53`
- Modify: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/systems/city-system.test.ts (or create if not testing TRAINABLE_UNITS)
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

describe('TRAINABLE_UNITS', () => {
  it('includes all combat unit types from UNIT_DEFINITIONS', () => {
    const trainableTypes = TRAINABLE_UNITS.map(u => u.type);
    for (const [type, def] of Object.entries(UNIT_DEFINITIONS)) {
      if (def.strength > 0) {
        expect(trainableTypes, `missing ${type}`).toContain(type);
      }
    }
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Expected: FAIL — missing swordsman, pikeman, musketeer

- [ ] **Step 3: Update TRAINABLE_UNITS**

In `src/systems/city-system.ts`, replace lines 48-53:

```typescript
export const TRAINABLE_UNITS: Array<{ type: UnitType; name: string; cost: number; techRequired?: string }> = [
  { type: 'warrior', name: 'Warrior', cost: 25 },
  { type: 'scout', name: 'Scout', cost: 20 },
  { type: 'worker', name: 'Worker', cost: 30 },
  { type: 'settler', name: 'Settler', cost: 50 },
  { type: 'swordsman', name: 'Swordsman', cost: 50, techRequired: 'iron-forging' },
  { type: 'pikeman', name: 'Pikeman', cost: 70, techRequired: 'pike-square' },
  { type: 'musketeer', name: 'Musketeer', cost: 90, techRequired: 'gunpowder' },
];
```

Also update the city panel (`src/ui/city-panel.ts:92-99`) to filter units by tech:

```typescript
  const completedTechs = state.civilizations[state.currentPlayer].techState.completed;
  const availableUnits = TRAINABLE_UNITS.filter(u => !u.techRequired || completedTechs.includes(u.techRequired));

  html += '<div style="margin-top:12px;font-size:12px;opacity:0.5;margin-bottom:8px;">Units</div>';
  for (const u of availableUnits) {
```

- [ ] **Step 4: Run test, verify PASS**

- [ ] **Step 5: Run all tests**

---

## Task 3: Tile ownership border color for hot seat

`hex-renderer.ts:147` hardcodes `tile.owner === 'player'` for blue vs red. In hot seat, all non-'player' civs see their tiles as red.

**Files:**
- Modify: `src/renderer/hex-renderer.ts:146-149`
- Modify: `src/renderer/render-loop.ts:76` (pass currentPlayer)

- [ ] **Step 1: Update drawHexMap to accept currentPlayer**

In `src/renderer/hex-renderer.ts`, update the `drawHexMap` signature to accept `currentPlayer: string`:

```typescript
export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  villagePositions?: Set<string>,
  currentPlayer?: string,
): void {
```

Pass it to `drawHex`:

```typescript
    drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage, currentPlayer);
```

Update `drawHex` signature and the ownership check:

```typescript
function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  tile: HexTile, isVillage: boolean = false,
  currentPlayer?: string,
): void {
  // ... existing code ...

  // Draw ownership indicator (at end of function)
  if (tile.owner) {
    ctx.strokeStyle = tile.owner === currentPlayer ? 'rgba(74,144,217,0.5)' : 'rgba(217,74,74,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
```

- [ ] **Step 2: Pass currentPlayer from render-loop**

In `src/renderer/render-loop.ts:76`:

```typescript
    drawHexMap(this.ctx, this.state.map, this.camera, villagePositions, this.state.currentPlayer);
```

- [ ] **Step 3: Run all tests, verify PASS**

- [ ] **Step 4: Verify build succeeds**

Run: `yarn build`

---

## Task 4: Advisor hardcoded 'player' references

Multiple advisor triggers reference `state.civilizations.player` instead of `state.civilizations[state.currentPlayer]`.

**Files:**
- Modify: `src/ui/advisor-system.ts`

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/ui/advisor-system.test.ts
it('triggers found_city for non-player civ in hot seat', () => {
  const state = createNewGame(undefined, 'advisor-hotseat');
  // Simulate hot seat with different currentPlayer
  state.currentPlayer = 'ai-1';
  const city = foundCity('ai-1', { q: 10, r: 10 }, state.map);
  state.cities[city.id] = city;
  state.civilizations['ai-1'].cities.push(city.id);
  state.civilizations['ai-1'].isHuman = true;

  const bus = new EventBus();
  const advisor = new AdvisorSystem(bus);
  const messages: string[] = [];
  bus.on('advisor:message', (data: any) => messages.push(data.message));

  advisor.check(state);
  // Should get found_city or explore message for ai-1's city
  expect(messages.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test, verify behavior**

- [ ] **Step 3: Replace all `state.civilizations.player` with `state.civilizations[state.currentPlayer]`**

In `src/ui/advisor-system.ts`, apply this replacement for ALL trigger functions that use `state.civilizations.player` or hardcoded `.player`:

For triggers at lines 30, 38, 59, 79: Change `c.owner === 'player'` to `c.owner === state.currentPlayer` and `u.owner === 'player'` to `u.owner === state.currentPlayer`.

For triggers at lines 101-116: Change `state.civilizations.player?.diplomacy` to `state.civilizations[state.currentPlayer]?.diplomacy`.

For triggers at lines 140-186: Change `state.civilizations.player?.cities` to `state.civilizations[state.currentPlayer]?.cities`, `state.civilizations.player?.visibility` to `state.civilizations[state.currentPlayer]?.visibility`, and `u.owner === 'player'` to `u.owner === state.currentPlayer`.

Use `replace_all` for these patterns:
- `state.civilizations.player` → `state.civilizations[state.currentPlayer]`
- `u.owner === 'player'` → `u.owner === state.currentPlayer` (inside trigger functions only)
- `c.owner === 'player'` → `c.owner === state.currentPlayer` (inside trigger functions only)

- [ ] **Step 4: Run all tests, verify PASS**

---

## Task 5: AI attacks without war check

`basic-ai.ts:82` attacks any non-owned, non-barbarian unit without checking diplomatic status.

**Files:**
- Modify: `src/ai/basic-ai.ts:80-84`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// Add to tests/ai/basic-ai.test.ts
it('does not attack units of civs it is not at war with', () => {
  const state = createNewGame(undefined, 'ai-no-attack');
  const bus = new EventBus();

  // Ensure AI is not at war with player
  expect(state.civilizations['ai-1'].diplomacy.atWarWith).not.toContain('player');

  // Place AI warrior adjacent to player warrior
  const aiWarriorId = state.civilizations['ai-1'].units.find(
    id => state.units[id]?.type === 'warrior'
  )!;
  const playerWarriorId = state.civilizations.player.units.find(
    id => state.units[id]?.type === 'warrior'
  )!;
  state.units[aiWarriorId].position = { q: 10, r: 10 };
  state.units[playerWarriorId].position = { q: 10, r: 11 };

  const playerHealthBefore = state.units[playerWarriorId].health;
  const result = processAITurn(state, 'ai-1', bus);
  const playerUnit = result.units[playerWarriorId];

  // Player unit should not have been attacked
  expect(playerUnit).toBeDefined();
  expect(playerUnit.health).toBe(playerHealthBefore);
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Add war check to AI combat**

In `src/ai/basic-ai.ts`, around line 82, add war check:

```typescript
        if (occupant && occupant.owner !== civId && occupant.owner !== 'barbarian') {
          // Only attack if at war (or it's a minor civ at war with us)
          const atWar = civ.diplomacy?.atWarWith.includes(occupant.owner) ?? false;
          const isMcAtWar = occupant.owner.startsWith('mc-') &&
            newState.minorCivs[occupant.owner]?.diplomacy.atWarWith.includes(civId);
          if (!atWar && !isMcAtWar && occupant.owner !== 'barbarian') continue;
```

Wait — barbarians are already filtered above. The check should be:

```typescript
        if (occupant && occupant.owner !== civId) {
          const isBarbarian = occupant.owner === 'barbarian';
          const atWar = civ.diplomacy?.atWarWith.includes(occupant.owner) ?? false;
          if (!isBarbarian && !atWar) continue;
```

- [ ] **Step 4: Run test, verify PASS**

- [ ] **Step 5: Run all tests**

---

## Task 6: City panel only shows first city

`main.ts:267` always opens `cities[0]`. Players with multiple cities can't manage any others.

**Files:**
- Modify: `src/main.ts:266-284`

- [ ] **Step 1: Add city cycling to togglePanel**

In `src/main.ts`, add a module-level variable to track the current city index:

```typescript
let currentCityIndex = 0;
```

Modify the city panel section in `togglePanel`:

```typescript
  } else if (panel === 'city') {
    const playerCities = currentCiv().cities;
    if (playerCities.length === 0) {
      showNotification('No cities founded yet!', 'info');
      return;
    }
    // Cycle through cities if panel is already open (re-toggled)
    if (currentCityIndex >= playerCities.length) currentCityIndex = 0;
    const cityId = playerCities[currentCityIndex];
    const city = gameState.cities[cityId];
    if (!city) return;
    currentCityIndex = (currentCityIndex + 1) % playerCities.length;
```

- [ ] **Step 2: Add city name navigation hint if multiple cities**

In `src/ui/city-panel.ts`, show a hint when there are multiple cities. Add a `cityCount` parameter:

In the panel header, if `cityCount > 1`:
```html
<div style="font-size:10px;opacity:0.5;">Tap City button again for next city</div>
```

- [ ] **Step 3: Verify build succeeds**

---

## Task 7: Seeded RNG for combat

`combat-system.ts:69,73` uses `Math.random()`. All other systems use seeded RNG.

**Files:**
- Modify: `src/systems/combat-system.ts`
- Modify: `src/main.ts` (pass turn for seed)
- Modify: `tests/systems/combat-system.test.ts`

- [ ] **Step 1: Write determinism test**

```typescript
// Add to tests/systems/combat-system.test.ts
it('produces deterministic results with same seed', () => {
  const attacker = { id: 'a', type: 'warrior' as const, owner: 'p1', position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false };
  const defender = { ...attacker, id: 'd', owner: 'p2', position: { q: 1, r: 0 } };
  const map = generateMap(10, 10, 'combat-seed');

  const result1 = resolveCombat(attacker, defender, map, 42);
  const result2 = resolveCombat(attacker, defender, map, 42);
  expect(result1.attackerDamage).toBe(result2.attackerDamage);
  expect(result1.defenderDamage).toBe(result2.defenderDamage);
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Add seed parameter to resolveCombat**

```typescript
export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
  seed?: number,
): CombatResult {
  // Seeded RNG
  let rngState = seed ?? (Date.now() * 16807);
  const rng = () => {
    rngState = (rngState * 48271) % 2147483647;
    return rngState / 2147483647;
  };

  // ... existing code, replace Math.random() with rng() ...
  const randomFactor = 0.8 + rng() * 0.4;
  // ...
  const baseDamage = 30 + rng() * 20;
```

- [ ] **Step 4: Update callers to pass seed**

In `src/main.ts`, where `resolveCombat` is called (line 456):
```typescript
const seed = gameState.turn * 16807 + attacker.id.charCodeAt(0) + defender.id.charCodeAt(0);
const result = resolveCombat(unit, unitAtHex[1], gameState.map, seed);
```

In `src/ai/basic-ai.ts` (line 83):
```typescript
const seed = newState.turn * 16807 + unit.id.charCodeAt(0);
const result = resolveCombat(unit, occupant, newState.map, seed);
```

- [ ] **Step 5: Run all tests, verify PASS**

---

## Task 8: declareWar deduplication

`diplomacy-system.ts:53` appends without checking for duplicates.

**Files:**
- Modify: `src/systems/diplomacy-system.ts:51-54`
- Modify: `tests/systems/diplomacy-system.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('does not duplicate atWarWith entries', () => {
  const state = createDiplomacyState(['a', 'b'], 'a');
  const warOnce = declareWar(state, 'b', 1);
  const warTwice = declareWar(warOnce, 'b', 2);
  expect(warTwice.atWarWith.filter(id => id === 'b').length).toBe(1);
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Add dedup guard**

In `src/systems/diplomacy-system.ts:51-54`:

```typescript
  let newState = {
    ...state,
    atWarWith: state.atWarWith.includes(targetCivId)
      ? [...state.atWarWith]
      : [...state.atWarWith, targetCivId],
    events: [...state.events],
  };
```

- [ ] **Step 4: Run tests, verify PASS**

---

## Task 9: Wire up applyProductionBonus

`applyProductionBonus` exists but is never called. Civ bonuses are dead code.

**Files:**
- Modify: `src/systems/city-system.ts:129-183` (processCity)
- Modify: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { processCity, applyProductionBonus, foundCity, BUILDINGS } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';

it('applies civ production bonus to speed up building', () => {
  const map = generateMap(30, 30, 'bonus-test');
  const tile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
  const city = foundCity('p1', tile.coord, map);
  city.productionQueue = ['monument']; // monument costs 30
  city.productionProgress = 0;

  // With 1.5x bonus, 20 production should become 30 effective
  const bonus = { type: 'faster_wonders' as const, speedMultiplier: 0.5 };
  const multiplier = applyProductionBonus('monument', bonus);
  // speedMultiplier 0.5 means 50% faster = 2x production
  expect(multiplier).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Add bonusEffect parameter to processCity**

In `src/systems/city-system.ts`, add optional `bonusEffect` param to `processCity`:

```typescript
export function processCity(
  city: City,
  map: GameMap,
  foodYield: number,
  productionYield: number = 0,
  bonusEffect?: CivBonusEffect,
): CityProcessResult {
```

In the production section, apply the bonus:

```typescript
  if (newQueue.length > 0) {
    const currentItem = newQueue[0];
    const bonusMultiplier = applyProductionBonus(currentItem, bonusEffect);
    const effectiveProduction = Math.round(productionYield * bonusMultiplier);
    newProgress += effectiveProduction;
```

Wait — looking at the existing applyProductionBonus, it returns a multiplier where speedMultiplier 0.7 means 30% faster. The function returns `bonusEffect.speedMultiplier` directly, which is less than 1 for "faster" (0.7 = 70% of time needed). This means it should reduce cost, not increase production. Let me re-check...

Actually the function is designed so the caller applies it to cost: `effectiveCost = cost * multiplier`. So speedMultiplier 0.7 = 70% of the cost. The current processCity compares `newProgress >= cost`. So we should apply it to the cost comparison, not production.

In processCity, change:
```typescript
    if (building && newProgress >= building.productionCost) {
```
to:
```typescript
    const effectiveCost = Math.round(building.productionCost * applyProductionBonus(currentItem, bonusEffect));
    if (building && newProgress >= effectiveCost) {
```

And similarly for units.

- [ ] **Step 3: Pass bonusEffect from turn-manager**

In `src/core/turn-manager.ts:34`, get the civ's bonus and pass it:

```typescript
      const civDef = getCivDefinition(civ.civType ?? '');
      const result = processCity(city, newState.map, yields.food, yields.production, civDef?.bonusEffect);
```

Add import: `import { getCivDefinition } from '@/systems/civ-definitions';`

- [ ] **Step 4: Run all tests, verify PASS**

---

## Task 10: Show building yields in city panel

Buildings show description but not yield values. Relates to issue #12.

**Files:**
- Modify: `src/ui/city-panel.ts:84-89`

- [ ] **Step 1: Update build item display**

In `src/ui/city-panel.ts`, for each building in the available list, show yields:

```typescript
  for (const b of availableBuildings) {
    const turns = yields.production > 0 ? Math.ceil(b.productionCost / yields.production) : '∞';
    const yieldParts: string[] = [];
    if (b.yields.food) yieldParts.push(`+${b.yields.food} 🌾`);
    if (b.yields.production) yieldParts.push(`+${b.yields.production} ⚒️`);
    if (b.yields.gold) yieldParts.push(`+${b.yields.gold} 💰`);
    if (b.yields.science) yieldParts.push(`+${b.yields.science} 🔬`);
    const yieldStr = yieldParts.length > 0 ? yieldParts.join(' ') + ' · ' : '';
    html += `<div class="build-item" data-item-id="${b.id}" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
      <div style="font-weight:bold;font-size:13px;">🏗️ ${b.name}</div>
      <div style="font-size:11px;opacity:0.7;">${yieldStr}${turns} turns</div>
      <div style="font-size:10px;opacity:0.5;">${b.description}</div>
    </div>`;
  }
```

- [ ] **Step 2: Verify build succeeds**

---

## Task 11: HUD shows more economy info

HUD only shows gold and research. No science/food/production rates.

**Files:**
- Modify: `src/main.ts:121-133` (updateHUD function)

- [ ] **Step 1: Update HUD to show yields**

```typescript
function updateHUD(): void {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const civ = currentCiv();
  const nameLabel = gameState.hotSeat ? `${civ.name} · ` : '';

  // Calculate total yields from all cities
  let totalGold = 0;
  let totalScience = 0;
  for (const cityId of civ.cities) {
    const city = gameState.cities[cityId];
    if (city) {
      const yields = calculateCityYields(city, gameState.map);
      totalGold += yields.gold;
      totalScience += yields.science;
    }
  }

  const researchLabel = civ.techState.currentResearch ? `${civ.techState.currentResearch}` : 'None';

  hud.innerHTML = `
    <div style="display:flex;gap:12px;">
      <span>💰 ${civ.gold} (+${totalGold})</span>
      <span>🔬 ${researchLabel} (+${totalScience})</span>
    </div>
    <div>${nameLabel}Turn ${gameState.turn} · Era ${gameState.era}</div>
  `;
}
```

Add import at top of main.ts:
```typescript
import { calculateCityYields } from '@/systems/resource-system';
```

Note: `calculateCityYields` is already imported in some UI files but may need adding to main.ts imports.

- [ ] **Step 2: Verify build succeeds**

---

## Task 12: Update CLAUDE.md with prevention rules

Based on the bug patterns found, add rules to CLAUDE.md that would have prevented these issues.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add consistency rules to CLAUDE.md**

Append the following sections:

```markdown
## Consistency Rules

### Type-Driven Completeness
- When a union type or enum is extended (e.g., adding a new UnitType, TechTrack, or AdvisorType), update ALL consumers: UI lists, switch statements, renderer mappings, definitions arrays, and tests. Search for the old type values to find all usage sites.
- Never hardcode lists that duplicate a type definition. Derive from the source of truth or import from a shared constant.

### Bilateral State Updates
- When two entities interact (war, peace, treaties), ALWAYS update BOTH sides of the relationship. If `declareWar(a, b)` updates A's state, also call `declareWar(b, a)`.
- Check main.ts diplomatic action handlers against basic-ai.ts handlers — they must use the same bilateral pattern.

### Event Handlers Must Have Effects
- Every `bus.emit('event', data)` that represents a game action (unit trained, building complete) must have a handler that actually mutates game state. Emitting an event without a state change is a bug, not a feature.
- When `processCity` returns `completedUnit`, the caller MUST create the unit and add it to state.

### Hot Seat Compatibility
- NEVER use hardcoded `'player'` as a civ ID in game logic or UI. Always use `state.currentPlayer` or the civ's `.id` property.
- Test all UI triggers with non-'player' currentPlayer values.

### Deterministic Game State
- NEVER use `Math.random()` in game logic. Always use a seeded RNG derived from turn number and entity IDs for reproducibility.
- Only use `Math.random()` for non-gameplay purposes (e.g., initial civ selection in createNewGame).

### AI Behavior
- AI must check diplomatic status before attacking. Only attack units belonging to civs in the `atWarWith` array or barbarians.
```

- [ ] **Step 2: Add a `.claude/rules/game-systems.md` file**

```markdown
---
paths:
  - "src/systems/**"
  - "src/core/**"
  - "src/ai/**"
---

# Game Systems Rules

- All game systems must use seeded RNG, never Math.random()
- When extending union types (UnitType, TechTrack, etc.), grep for all existing values to find every consumer that needs updating
- Bilateral state: war/peace/treaty updates must always update both parties
- processCity completedUnit must result in actual unit creation by the caller
- AI combat must check isAtWar before attacking non-barbarian units
```

- [ ] **Step 3: Add a `.claude/rules/ui-panels.md` file**

```markdown
---
paths:
  - "src/ui/**"
  - "src/main.ts"
---

# UI Panel Rules

- Never reference `state.civilizations.player` directly. Always use `state.civilizations[state.currentPlayer]`
- Never reference `u.owner === 'player'` in UI logic. Always use `state.currentPlayer`
- When displaying lists derived from type definitions (tech tracks, unit types, building categories), derive from the source of truth — never hardcode
- Building/unit lists in city panel must show yield values, not just descriptions
- All panels must call updateHUD() after state mutations
```

- [ ] **Step 4: Verify CLAUDE.md is under 200 lines**

---

## Task 13: Run full test suite and build

- [ ] **Step 1: Run all tests**

Run: `yarn test --run`
Expected: All pass

- [ ] **Step 2: Run production build**

Run: `yarn build`
Expected: Build succeeds

- [ ] **Step 3: Commit all changes**

```bash
git add -A
git commit -m "fix: 13 bugs from M3 code review + CLAUDE.md prevention rules"
```
