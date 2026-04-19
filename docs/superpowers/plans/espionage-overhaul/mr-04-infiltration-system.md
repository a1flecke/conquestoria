# MR 4 — Infiltration System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spy units standing on an enemy city tile can attempt infiltration. Success removes the unit from the map and places the spy inside the city. Era 1 (spy_scout) resolves infiltration + scouting in a single roll. Players can voluntarily exfiltrate stationed spies.

**Prerequisite MRs:** MR 1 (physical spy units), MR 2 (detection), MR 3 (disguise)

**Key design decisions:**
- Era 1 single-roll: `spy_scout` infiltration + `scout_area` resolve simultaneously; spy stays on map with 3-turn cooldown
- Era 2+: spy removed from map on success, stationed inside city, issues missions separately
- One spy per enemy city (D4): occupancy check before infiltration
- Cooldown spies stay on the map and can move (D3)
- Spy ID rekey on expulsion/exfiltrate: spy record is rekeyed under the new unit's ID

**Infiltration success formula:**
- Base rate: `spy_scout` = 0.55, `spy_informant` = 0.65, `spy_agent` = 0.70, `spy_operative` = 0.75, `spy_hacker` = 0.80
- Modifier: `-0.004 × cityCI`
- Modifier: `+0.003 × spyExperience`
- Clamp: `[0.10, 0.90]`

---

## Task 7: Infiltration Attempt (% Chance) and City Vision

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/main.ts`
- Create: `tests/systems/espionage-infiltration.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/espionage-infiltration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createEspionageCivState, createSpyFromUnit, attemptInfiltration, getInfiltrationSuccessChance } from '@/systems/espionage-system';
import { createRng } from '@/systems/map-generator';

describe('getInfiltrationSuccessChance', () => {
  it('spy_scout with 0 XP against 0 CI: ~0.55', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 0, 0)).toBeCloseTo(0.55);
  });
  it('high CI reduces success chance', () => {
    const low = getInfiltrationSuccessChance('spy_scout', 0, 0);
    const high = getInfiltrationSuccessChance('spy_scout', 0, 80);
    expect(high).toBeLessThan(low);
  });
  it('clamped to minimum 0.10', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 0, 100)).toBeGreaterThanOrEqual(0.10);
  });
  it('clamped to maximum 0.90', () => {
    expect(getInfiltrationSuccessChance('spy_operative', 100, 0)).toBeLessThanOrEqual(0.90);
  });
});

describe('attemptInfiltration', () => {
  function makeSpy() {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    const { state } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed');
    return state;
  }

  it('on success: spy status becomes stationed, city vision granted, unit removed signal returned', () => {
    const civEsp = makeSpy();
    const result = attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-enemy-1', { q: 5, r: 3 }, 0, 'success-seed-hit');
    expect(result.civEsp.spies['unit-1'].status).toBe('stationed');
    expect(result.civEsp.spies['unit-1'].infiltrationCityId).toBe('city-enemy-1');
    expect(result.civEsp.spies['unit-1'].cityVisionTurnsLeft).toBe(5);
    expect(result.removeUnitFromMap).toBe(true);
  });

  it('on failure (not caught): spy stays idle, short cooldown, unit stays on map', () => {
    const civEsp = makeSpy();
    const result = attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-enemy-1', { q: 5, r: 3 }, 0, 'failure-seed-miss');
    if (result.removeUnitFromMap) return; // only test the failure path
    expect(result.civEsp.spies['unit-1'].status).toBe('cooldown');
    expect(result.civEsp.spies['unit-1'].cooldownTurns).toBeGreaterThan(0);
  });

  it('era1 spy_scout infiltration also grants scout_area result immediately', () => {
    const civEsp = makeSpy();
    const result = attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-enemy-1', { q: 5, r: 3 }, 0, 'success-seed-hit');
    expect(result.era1ScoutResult).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/espionage-infiltration.test.ts
```

- [ ] **Step 3: Add infiltration functions to `src/systems/espionage-system.ts`**

```typescript
const INFILTRATION_BASE: Partial<Record<UnitType, number>> = {
  spy_scout: 0.55,
  spy_informant: 0.65,
  spy_agent: 0.70,
  spy_operative: 0.75,
  spy_hacker: 0.80,  // digital cover is hardest to detect; scales best with XP
};

export function getInfiltrationSuccessChance(
  unitType: UnitType,
  experience: number,
  cityCI: number,
): number {
  const base = INFILTRATION_BASE[unitType] ?? 0.50;
  const expBonus = experience * 0.003;
  const ciPenalty = cityCI * 0.004;
  return Math.max(0.10, Math.min(0.90, base + expBonus - ciPenalty));
}

export interface InfiltrationResult {
  civEsp: EspionageCivState;
  removeUnitFromMap: boolean;
  caught: boolean;
  era1ScoutResult?: MissionResult;
}

const INFILTRATION_FAIL_COOLDOWN = 3;
const INFILTRATION_CATCH_CHANCE = 0.25; // of all failures, this % get caught

export function attemptInfiltration(
  state: EspionageCivState,
  spyId: string,
  unitType: UnitType,
  targetCityId: string,
  targetPosition: HexCoord,
  cityCI: number,
  seed: string,
): InfiltrationResult {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'idle') throw new Error(`Spy ${spyId} cannot infiltrate`);

  const rng = createRng(seed);
  const chance = getInfiltrationSuccessChance(unitType, spy.experience, cityCI);
  const roll = rng();

  if (roll < chance) {
    // Success
    const era1 = unitType === 'spy_scout';
    const updatedSpy: Spy = {
      ...spy,
      status: era1 ? 'idle' : 'stationed',
      infiltrationCityId: targetCityId,
      cityVisionTurnsLeft: 5,
      position: { ...targetPosition },
      experience: Math.min(100, spy.experience + 5),
    };
    return {
      civEsp: { ...state, spies: { ...state.spies, [spyId]: updatedSpy } },
      removeUnitFromMap: !era1,
      caught: false,
      era1ScoutResult: era1 ? { tilesToReveal: [] } : undefined, // tiles resolved by caller
    };
  } else {
    // Failure
    const catchRoll = rng();
    const caught = catchRoll < INFILTRATION_CATCH_CHANCE;
    const updatedSpy: Spy = {
      ...spy,
      status: caught ? 'captured' : 'cooldown',
      cooldownTurns: caught ? 0 : INFILTRATION_FAIL_COOLDOWN,
    };
    return {
      civEsp: { ...state, spies: { ...state.spies, [spyId]: updatedSpy } },
      removeUnitFromMap: false,
      caught,
    };
  }
}
```

- [ ] **Step 4: Decrement city vision each turn in `src/core/turn-manager.ts`**

In the espionage turn loop, after `processSpyTurn`, add city-vision decrement. Use `newState` (not `state`) to avoid mutating the input:

```typescript
for (const [spyId, spy] of Object.entries(newState.espionage![civId].spies)) {
  if (spy.cityVisionTurnsLeft && spy.cityVisionTurnsLeft > 0) {
    const newLeft = spy.cityVisionTurnsLeft - 1;
    newState.espionage![civId].spies[spyId] = {
      ...spy,
      cityVisionTurnsLeft: newLeft,
    };
    // Reveal city tile while vision remains
    if (spy.infiltrationCityId) {
      const city = newState.cities[spy.infiltrationCityId];
      if (city && newState.civilizations[civId]?.visibility?.tiles) {
        newState.civilizations[civId].visibility.tiles[`${city.position.q},${city.position.r}`] = 'visible';
      }
    }
  }
}
```

- [ ] **Step 5: Render infiltrated-spy indicator on cities in `src/renderer/render-loop.ts`**

Add a helper to draw a small indicator on city tiles where the current player has an infiltrated spy. In `render()`, after `drawCities`:

```typescript
this.drawInfiltratedSpyIndicators();
```

Add the private method:

```typescript
private drawInfiltratedSpyIndicators(): void {
  if (!this.state) return;
  const civEsp = this.state.espionage?.[this.state.currentPlayer];
  if (!civEsp) return;
  for (const spy of Object.values(civEsp.spies)) {
    if (spy.status !== 'stationed' && spy.status !== 'on_mission' && spy.status !== 'cooldown') continue;
    if (!spy.infiltrationCityId) continue;
    const city = this.state.cities[spy.infiltrationCityId];
    if (!city) continue;
    const pixel = hexToPixel(city.position, this.camera.hexSize);
    const screen = this.camera.worldToScreen(pixel.x, pixel.y);
    const size = this.camera.hexSize * this.camera.zoom;
    this.ctx.font = `${size * 0.3}px system-ui`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('👁', screen.x + size * 0.5, screen.y - size * 0.4);
  }
}
```

- [ ] **Step 6: Add "Infiltrate" button to `src/ui/selected-unit-info.ts`**

Add `onInfiltrate?: (unitId: string) => void` to `SelectedUnitInfoCallbacks`.

In `renderSelectedUnitInfo`, after the disguise section, add:

```typescript
if (isSpyUnitType(unit.type) && callbacks.onInfiltrate) {
  const spyRecord = state.espionage?.[unit.owner]?.spies[unitId];
  const isAvailable = !spyRecord || spyRecord.status === 'idle' || (spyRecord.status === 'cooldown' && spyRecord.cooldownTurns === 0);
  const enemyCityHere = Object.values(state.cities).some(
    c => c.owner !== unit.owner && c.position.q === unit.position.q && c.position.r === unit.position.r,
  );
  if (isAvailable && enemyCityHere) {
    actionsDiv.appendChild(makeButton('Infiltrate City', '#7c3aed', () => callbacks.onInfiltrate!(unitId)));
  }
  if (spyRecord?.status === 'cooldown' && (spyRecord.cooldownTurns ?? 0) > 0) {
    const cd = document.createElement('span');
    cd.style.cssText = 'font-size:10px;opacity:0.6;align-self:center;';
    cd.textContent = `Infiltrate available in ${spyRecord.cooldownTurns} turns`;
    actionsDiv.appendChild(cd);
  }
}
```

- [ ] **Step 7: Wire `onInfiltrate` and `onExfiltrate` in `src/main.ts`**

```typescript
onInfiltrate: (unitId) => {
  const unit = gameState.units[unitId];
  if (!unit || !gameState.espionage?.[gameState.currentPlayer]) return;
  const targetCity = Object.values(gameState.cities).find(
    c => c.owner !== gameState.currentPlayer && c.position.q === unit.position.q && c.position.r === unit.position.r,
  );
  if (!targetCity) { showNotification('No enemy city at this location.', 'info'); return; }

  // D4: one spy per enemy city — block if a spy is already inside
  const alreadyInside = Object.values(gameState.espionage![gameState.currentPlayer].spies)
    .some(s => s.infiltrationCityId === targetCity.id &&
               (s.status === 'stationed' || s.status === 'on_mission' || s.status === 'cooldown'));
  if (alreadyInside) { showNotification('You already have a spy in that city.', 'info'); return; }

  const cityCI = gameState.espionage![targetCity.owner]?.counterIntelligence[targetCity.id] ?? 0;
  const seed = `infiltrate-${unitId}-${gameState.turn}`;
  const result = attemptInfiltration(
    gameState.espionage![gameState.currentPlayer],
    unitId, unit.type as UnitType, targetCity.id, targetCity.position, cityCI, seed,
  );
  gameState.espionage![gameState.currentPlayer] = result.civEsp;

  if (result.removeUnitFromMap) {
    // Era 2+: spy removed from map, stationed inside city
    delete gameState.units[unitId];
    gameState.civilizations[gameState.currentPlayer].units =
      gameState.civilizations[gameState.currentPlayer].units.filter(id => id !== unitId);
    showNotification(`Spy successfully infiltrated ${targetCity.name}. Open Intel panel to issue orders.`, 'success');
    bus.emit('espionage:spy-infiltrated', { civId: gameState.currentPlayer, spyId: unitId, cityId: targetCity.id });
  } else if (result.era1ScoutResult !== undefined) {
    // Era 1 (spy_scout): infiltration + scout resolve together; spy stays on map with cooldown
    const scoutMissionResult = resolveMissionResult('scout_area', targetCity.owner, targetCity.id, gameState, gameState.currentPlayer, unitId);
    const cooldown = 3;
    gameState.espionage![gameState.currentPlayer].spies[unitId] = {
      ...gameState.espionage![gameState.currentPlayer].spies[unitId],
      status: 'cooldown',
      cooldownTurns: cooldown,
      infiltrationCityId: null,
      cityVisionTurnsLeft: 0,
    };
    gameState.units[unitId] = { ...unit, hasActed: true, movementPointsLeft: 0 };
    showNotification(`Scout Agent gathered basic intel on ${targetCity.name}. Next infiltration in ${cooldown} turns.`, 'success');
  } else if (result.caught) {
    showNotification(`Spy was caught attempting to infiltrate ${targetCity.name}!`, 'warning');
    bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: targetCity.owner, spyOwner: gameState.currentPlayer, spyId: unitId, cityId: targetCity.id });
  } else {
    showNotification(`Spy failed to infiltrate ${targetCity.name}. Lying low for ${result.civEsp.spies[unitId]?.cooldownTurns ?? 3} turns.`, 'info');
    gameState.units[unitId] = { ...unit, hasActed: true, movementPointsLeft: 0 };
  }

  renderLoop.setGameState(gameState);
},

// Voluntary exfiltration: recall a stationed spy back to the map (owner's capital)
onExfiltrate: (spyId) => {
  const ownerEsp = gameState.espionage?.[gameState.currentPlayer];
  const spy = ownerEsp?.spies[spyId];
  if (!spy || spy.status !== 'stationed') return;

  const capital = gameState.cities[gameState.civilizations[gameState.currentPlayer]?.cities[0]];
  if (!capital) { showNotification('Cannot exfiltrate — no capital found.', 'warning'); return; }

  const newUnit = createUnit(spy.unitType, gameState.currentPlayer, capital.position);
  gameState.units[newUnit.id] = newUnit;
  gameState.civilizations[gameState.currentPlayer].units.push(newUnit.id);

  // Rekey the spy record under the new unit ID, preserve experience and history
  const updatedSpy: Spy = {
    ...spy,
    id: newUnit.id,
    status: 'cooldown',
    cooldownTurns: 8,   // shorter than expulsion (15) since voluntary
    infiltrationCityId: null,
    cityVisionTurnsLeft: 0,
  };
  const { [spyId]: _old, ...remainingSpies } = ownerEsp!.spies;
  gameState.espionage![gameState.currentPlayer] = {
    ...ownerEsp!,
    spies: { ...remainingSpies, [newUnit.id]: updatedSpy },
  };
  showNotification(`Spy exfiltrated. Available again in ${updatedSpy.cooldownTurns} turns.`, 'info');
  renderLoop.setGameState(gameState);
},
```

Also wire spy capture notification (fires for both the captor and the owner):

```typescript
bus.on('espionage:spy-caught-infiltrating', ({ capturingCivId, spyOwner, spyId, cityId }) => {
  // Verdict choice for the capturing player
  if (capturingCivId === gameState.currentPlayer) {
    showEspionageCaptureChoice(spyId, spyOwner, cityId);
  }
  // Notification for the spy owner (persistent in the notification log)
  if (spyOwner === gameState.currentPlayer) {
    const spy = gameState.espionage?.[spyOwner]?.spies[spyId];
    const city = gameState.cities[cityId];
    showNotification(
      `${spy?.name ?? 'Your spy'} was caught trying to infiltrate ${city?.name ?? 'an enemy city'}! Awaiting verdict.`,
      'warning',
    );
  }
});
```

Add the new events to `GameEventMap` in `types.ts`:
```typescript
'espionage:spy-infiltrated': { civId: string; spyId: string; cityId: string };
'espionage:spy-caught-infiltrating': { capturingCivId: string; spyOwner: string; spyId: string; cityId: string };
```

Add city-capture cleanup for stationed spies. In `src/systems/espionage-system.ts`, update `cleanupSpiesTargetingDestroyedCities` (already exists) to also handle `'stationed'` status. Change from:
```typescript
if ((spy.status === 'traveling' || spy.status === 'on_mission') && spy.targetCityId) {
```
To:
```typescript
if ((spy.status === 'on_mission' || spy.status === 'stationed') && spy.targetCityId) {
```
When a stationed spy's city is captured, the spy is auto-exfiltrated with `cooldown` of 5. Emit `espionage:spy-auto-exfiltrated` to notify the owning player.

Add `onExfiltrate` to `EspionagePanelCallbacks` and show `[Exfiltrate (8 turn cooldown)]` button next to stationed spies in the espionage panel spy summaries section.

- [ ] **Step 8: Run full test suite**

```bash
yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/espionage-system.ts src/core/turn-manager.ts src/renderer/render-loop.ts src/ui/selected-unit-info.ts src/ui/espionage-panel.ts src/main.ts src/core/types.ts tests/systems/espionage-infiltration.test.ts
git commit -m "feat(espionage): infiltration — % chance, city vision, era-1 single-roll, exfiltrate action, city-capture cleanup"
```
