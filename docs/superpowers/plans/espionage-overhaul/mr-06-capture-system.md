# MR 6 — Capture System: Expel / Execute / Interrogate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Caught spies trigger a meaningful three-way verdict choice. The captor always sees the spy's true identity (D1). Interrogation extracts intel over 4 turns and applies it to game state. AI makes verdict choices based on relationship score and war state (D7).

**Prerequisite MRs:** MR 1–5

**Verdict options:**
- **Expel:** Spy unit re-created at owner's capital, `cooldownTurns = 15`, spy record rekeyed under new unit ID
- **Execute:** Spy unit and spy record permanently deleted; confirmation step required; heavy relationship penalty
- **Interrogate (4 turns):** Spy held; each turn rolls for intel from `spy_identity`, `city_location`, `production_queue`, `wonder_in_progress`, `map_area`, `tech_hint`

**Relational penalty by distance:**
- Spy outside all enemy cities (>5 hex): 0 penalty
- Spy near a city (2–5 hex): −10 relationship
- Spy at city boundary (1 hex): −25 relationship
- Spy infiltrated inside city: −50 relationship

**AI verdict logic (D7):**
- At war: 50% execute / 50% interrogate
- Hostile (rel < 30): 40% interrogate / 60% expel
- Neutral/friendly: expel

---

## Task 9: Capture Verdict System with Relational Distance Scaling

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/ui/espionage-panel.ts`
- Modify: `src/main.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/core/turn-manager.ts`
- Create: `tests/systems/espionage-capture.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/espionage-capture.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { expelSpy, executeSpy, startInterrogation, processInterrogation, getSpyCaptureRelationshipPenalty } from '@/systems/espionage-system';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';

describe('relational penalty by distance', () => {
  it('returns 0 when spy is more than 5 hexes from any city', () => {
    expect(getSpyCaptureRelationshipPenalty(10)).toBe(0);
  });
  it('returns -25 when spy is 1 hex from city', () => {
    expect(getSpyCaptureRelationshipPenalty(1)).toBe(-25);
  });
  it('returns -50 when spy is inside city (distance 0)', () => {
    expect(getSpyCaptureRelationshipPenalty(0)).toBe(-50);
  });
});

describe('expelSpy', () => {
  it('sets spy cooldownTurns to 15 and status to cooldown', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    const result = expelSpy(civEsp, 'unit-1', 15);
    expect(result.spies['unit-1'].status).toBe('cooldown');
    expect(result.spies['unit-1'].cooldownTurns).toBe(15);
    expect(result.spies['unit-1'].stolenTechFrom).toEqual({}); // cleared on expulsion
  });
});

describe('executeSpy', () => {
  it('removes spy record entirely', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    const result = executeSpy(civEsp, 'unit-1');
    expect(result.spies['unit-1']).toBeUndefined();
  });
});

describe('interrogation', () => {
  it('starts with 4 turns remaining', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    const result = startInterrogation(civEsp, 'unit-1', 'player');
    const record = Object.values(result.activeInterrogations ?? {})[0]!;
    expect(record.turnsRemaining).toBe(4);
  });

  it('after 4 turns the record is removed', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    let state = startInterrogation(civEsp, 'unit-1', 'player');
    for (let i = 0; i < 4; i++) {
      state = processInterrogation(state, `interro-seed-${i}`, {} as any).state;
    }
    expect(Object.values(state.activeInterrogations ?? {})).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/espionage-capture.test.ts
```

- [ ] **Step 3: Add capture functions to `src/systems/espionage-system.ts`**

```typescript
export function getSpyCaptureRelationshipPenalty(distanceToNearestCity: number): number {
  if (distanceToNearestCity > 5) return 0;
  if (distanceToNearestCity > 1) return -10;
  if (distanceToNearestCity === 1) return -25;
  return -50; // inside city (distance 0)
}

export function expelSpy(
  state: EspionageCivState,
  spyId: string,
  cooldownTurns: number = 15,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) return state;
  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'cooldown',
        cooldownTurns,
        infiltrationCityId: null,
        cityVisionTurnsLeft: 0,
        targetCivId: null,
        targetCityId: null,
        currentMission: null,
        stolenTechFrom: {},   // reset on expulsion — if they re-infiltrate they can steal again
        disguiseAs: null,
      },
    },
  };
}

export function executeSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const { [spyId]: _removed, ...remainingSpies } = state.spies;
  return { ...state, spies: remainingSpies };
}

export function startInterrogation(
  captorEsp: EspionageCivState,
  spyId: string,
  spyOwner: string,
): EspionageCivState {
  const interrogationId = `interro-${spyId}`;
  const record: InterrogationRecord = {
    id: interrogationId,
    spyId,
    spyOwner,
    turnsRemaining: 4,
    extractedIntel: [],
  };
  return {
    ...captorEsp,
    activeInterrogations: {
      ...(captorEsp.activeInterrogations ?? {}),
      [interrogationId]: record,
    },
  };
}

const INTERROGATION_REVEAL_CHANCES: Record<InterrogationIntelType, number> = {
  spy_identity: 0.60,
  city_location: 0.50,
  production_queue: 0.45,
  wonder_in_progress: 0.35,
  map_area: 0.30,
  tech_hint: 0.08,
};

export function processInterrogation(
  captorEsp: EspionageCivState,
  seed: string,
  gameState: GameState,
): { state: EspionageCivState; complete: boolean; newIntel: InterrogationIntel[] } {
  const rng = createRng(seed);
  const records = { ...(captorEsp.activeInterrogations ?? {}) };
  const allNewIntel: InterrogationIntel[] = [];
  let complete = false;

  for (const [id, record] of Object.entries(records)) {
    const newIntel: InterrogationIntel[] = [];

    for (const [intelType, chance] of Object.entries(INTERROGATION_REVEAL_CHANCES) as [InterrogationIntelType, number][]) {
      if (rng() > chance) continue;
      const intel = resolveInterrogationIntel(intelType, record.spyOwner, gameState, rng);
      if (intel) newIntel.push(intel);
    }

    const updatedRecord: InterrogationRecord = {
      ...record,
      turnsRemaining: record.turnsRemaining - 1,
      extractedIntel: [...record.extractedIntel, ...newIntel],
    };
    allNewIntel.push(...newIntel);

    if (updatedRecord.turnsRemaining <= 0) {
      delete records[id];
      complete = true;
    } else {
      records[id] = updatedRecord;
    }
  }

  return {
    state: { ...captorEsp, activeInterrogations: records },
    complete,
    newIntel: allNewIntel,
  };
}

function resolveInterrogationIntel(
  type: InterrogationIntelType,
  spyOwner: string,
  state: GameState,
  rng: () => number,
): InterrogationIntel | null {
  const spyCiv = state.civilizations[spyOwner];
  if (!spyCiv) return null;

  switch (type) {
    case 'spy_identity': {
      const otherSpies = Object.values(state.espionage?.[spyOwner]?.spies ?? {})
        .filter(s => s.status !== 'captured' && s.status !== 'interrogated');
      if (otherSpies.length === 0) return null;
      const spy = otherSpies[Math.floor(rng() * otherSpies.length)];
      return { type, data: { spyId: spy.id, spyName: spy.name, status: spy.status, location: spy.infiltrationCityId } };
    }
    case 'city_location': {
      const cities = spyCiv.cities.map(id => state.cities[id]).filter(Boolean);
      if (cities.length === 0) return null;
      const city = cities[Math.floor(rng() * cities.length)];
      return { type, data: { cityId: city.id, cityName: city.name, position: city.position } };
    }
    case 'production_queue': {
      const cities = spyCiv.cities.map(id => state.cities[id]).filter(c => c?.productionQueue.length > 0);
      if (cities.length === 0) return null;
      const city = cities[Math.floor(rng() * cities.length)];
      return { type, data: { cityId: city.id, cityName: city.name, queue: [...city.productionQueue] } };
    }
    case 'wonder_in_progress': {
      const wonderCities = spyCiv.cities.map(id => state.cities[id])
        .filter(c => c?.productionQueue[0]?.startsWith('legendary:'));
      if (wonderCities.length === 0) return null;
      const city = wonderCities[0];
      return { type, data: { cityId: city.id, wonderId: city.productionQueue[0].replace('legendary:', '') } };
    }
    case 'map_area': {
      const tiles = Object.keys(spyCiv.visibility?.tiles ?? {}).filter(k => spyCiv.visibility.tiles[k] === 'visible');
      if (tiles.length === 0) return null;
      const sample = tiles.slice(0, 8).map(k => {
        const [q, r] = k.split(',').map(Number);
        return { q, r };
      });
      return { type, data: { tiles: sample, note: 'Information may be outdated' } };
    }
    case 'tech_hint': {
      const theirTechs = spyCiv.techState.completed;
      if (theirTechs.length === 0) return null;
      const tech = theirTechs[Math.floor(rng() * theirTechs.length)];
      return { type, data: { techId: tech, researchBonus: 0.05 } };
    }
    default: return null;
  }
}
```

- [ ] **Step 4: Wire interrogation in `src/core/turn-manager.ts` with intel application**

After `processEspionageTurn` in the turn loop:

```typescript
for (const [captorId, captorEsp] of Object.entries(newState.espionage ?? {})) {
  if (!captorEsp.activeInterrogations || Object.keys(captorEsp.activeInterrogations).length === 0) continue;
  const seed = `interro-${captorId}-${newState.turn}`;
  const { state: updatedEsp, complete, newIntel } = processInterrogation(captorEsp, seed, newState);
  newState.espionage![captorId] = updatedEsp;

  // Apply intel to game state
  for (const intel of newIntel) {
    if (intel.type === 'map_area') {
      const tiles = intel.data.tiles as Array<{ q: number; r: number }>;
      if (newState.civilizations[captorId]?.visibility?.tiles) {
        for (const t of tiles) {
          newState.civilizations[captorId].visibility.tiles[`${t.q},${t.r}`] = 'explored'; // stale — shown shadowed
        }
      }
    }
    if (intel.type === 'tech_hint') {
      const bonus = intel.data.researchBonus as number;
      newState.civilizations[captorId].techState = {
        ...newState.civilizations[captorId].techState,
        researchProgress: (newState.civilizations[captorId].techState.researchProgress ?? 0) + Math.floor(bonus * 100),
      };
    }
  }

  if (newIntel.length > 0) bus.emit('espionage:intel-extracted', { captorId, intel: newIntel });
}
```

Add `'espionage:intel-extracted'` to `GameEventMap` in `types.ts`.

- [ ] **Step 5: Add verdict UI to `src/ui/espionage-panel.ts`**

Add a `capturedSpies` section to the panel. When a spy's status is `'captured'`, the *owning* player's panel shows: "Agent Shadow was caught in [City]! Awaiting verdict."

For the captor's side: `showEspionageCaptureChoice` creates a persistent panel with:
- Spy's **true identity always shown** (D1): "You have captured [spy name], a [unit type] belonging to [Civ Name]."
- Three buttons: [Expel] [Execute — confirm?] [Interrogate]

Execute requires a confirmation step (second click with red "Confirm Execution" button) since it's permanent and causes extra relationship damage.

Add an interrogation progress section: for each active `InterrogationRecord` in `captorEsp.activeInterrogations`, show:

```html
<div class="interrogation-progress">
  <span>Interrogating: [spy name] (owner: [civ]) — [N] turns remaining</span>
  <span>Intel extracted: [count] items</span>
  <button>View Intel</button>
</div>
```

The "View Intel" button opens a list of all `extractedIntel` items rendered as human-readable text:
- `spy_identity` → "Enemy spy [name] is currently [status] in [city/location]"
- `city_location` → "Revealed city [name] at position Q,R"
- `production_queue` → "[City] is producing: [item list]"
- `wonder_in_progress` → "[City] is building wonder [id]"
- `map_area` → "Received map data for [N] tiles (may be outdated)"
- `tech_hint` → "Research hint: [tech name] (+5% progress)"

- [ ] **Step 6: Wire all three verdicts in `src/main.ts`**

```typescript
function showEspionageCaptureChoice(spyId: string, spyOwner: string, cityId: string): void {
  const captorEsp = gameState.espionage?.[gameState.currentPlayer];
  const spy = gameState.espionage?.[spyOwner]?.spies[spyId];
  if (!captorEsp || !spy) return;
  const city = gameState.cities[cityId];
  const spyOwnerName = gameState.civilizations[spyOwner]?.name ?? spyOwner;

  // D1: always reveal true identity to captor regardless of disguise
  const captureMessage = `You have captured ${spy.name}, a ${spy.unitType} belonging to ${spyOwnerName}.`;

  const distanceToCity = 0; // infiltrated = inside city
  const relPenalty = getSpyCaptureRelationshipPenalty(distanceToCity);

  createPersistentChoiceNotification(captureMessage, [
    {
      label: `Expel (${relPenalty} relations)`,
      onClick: () => {
        // 1. Update spy record to cooldown
        const updatedOwnerEsp = expelSpy(gameState.espionage![spyOwner], spyId, 15);
        // 2. Recreate the physical unit at spy owner's capital
        const capital = gameState.cities[gameState.civilizations[spyOwner]?.cities[0]];
        if (capital) {
          const newUnit = createUnit(spy.unitType, spyOwner, capital.position);
          gameState.units[newUnit.id] = newUnit;
          gameState.civilizations[spyOwner].units.push(newUnit.id);
          // 3. Rekey spy record: delete old key, add new key = new unit id
          const { [spyId]: _old, ...rest } = updatedOwnerEsp.spies;
          gameState.espionage![spyOwner] = {
            ...updatedOwnerEsp,
            spies: { ...rest, [newUnit.id]: { ...updatedOwnerEsp.spies[spyId], id: newUnit.id } },
          };
        } else {
          gameState.espionage![spyOwner] = updatedOwnerEsp;
        }
        // 4. Apply relationship penalty
        gameState.civilizations[gameState.currentPlayer].diplomacy = modifyRelationship(
          gameState.civilizations[gameState.currentPlayer].diplomacy, spyOwner, relPenalty,
        );
        showNotification(`${spy.name} expelled. Will return to their capital after 15 turns.`, 'info');
        renderLoop.setGameState(gameState);
      },
    },
    {
      label: 'Execute',
      danger: true,
      confirm: `Execute ${spy.name}? This cannot be undone and will severely damage relations with ${spyOwnerName}.`,
      onClick: () => {
        gameState.espionage![spyOwner] = executeSpy(gameState.espionage![spyOwner], spyId);
        gameState.civilizations[gameState.currentPlayer].diplomacy = modifyRelationship(
          gameState.civilizations[gameState.currentPlayer].diplomacy, spyOwner, relPenalty * 2,
        );
        bus.emit('espionage:spy-executed', { executingCivId: gameState.currentPlayer, spyOwner, spyId, spyName: spy.name });
        showNotification(`${spy.name} has been executed.`, 'warning');
        renderLoop.setGameState(gameState);
      },
    },
    {
      label: 'Interrogate (4 turns)',
      onClick: () => {
        gameState.espionage![gameState.currentPlayer] = startInterrogation(captorEsp, spyId, spyOwner);
        showNotification(`${spy.name} is being interrogated. Check the Intel panel for results.`, 'info');
        renderLoop.setGameState(gameState);
      },
    },
  ]);
}
```

Add `'espionage:spy-executed'` to `GameEventMap` in `types.ts`. Listen for it to notify the spy owner:
```typescript
bus.on('espionage:spy-executed', ({ executingCivId, spyOwner, spyName }) => {
  if (spyOwner === gameState.currentPlayer) {
    showNotification(`${spyName} was executed by ${gameState.civilizations[executingCivId]?.name ?? 'an enemy'}.`, 'error');
  }
});
```

- [ ] **Step 7: Add AI verdict logic to `src/ai/basic-ai.ts`**

```typescript
// AI capture verdict: based on relationship score and temperament
const capturedSpies = Object.values(espState.spies).filter(s => s.status === 'captured');
for (const capturedSpy of capturedSpies) {
  const rel = civ.diplomacy.relationships[capturedSpy.owner]?.score ?? 50;
  const atWar = civ.diplomacy.atWarWith.includes(capturedSpy.owner);
  let verdict: 'expel' | 'execute' | 'interrogate';
  if (atWar) {
    verdict = rng() < 0.5 ? 'execute' : 'interrogate'; // wartime: execute or extract info
  } else if (rel < 30) {
    verdict = rng() < 0.4 ? 'interrogate' : 'expel';   // hostile: prefer interrogate
  } else {
    verdict = 'expel';                                   // neutral/friendly: expel with penalty
  }
  // Apply verdict (same logic as showEspionageCaptureChoice but without UI):
  if (verdict === 'expel') {
    const updatedOwnerEsp = expelSpy(newState.espionage![capturedSpy.owner], capturedSpy.id, 15);
    const capital = newState.cities[newState.civilizations[capturedSpy.owner]?.cities[0]];
    if (capital) {
      const newUnit = createUnit(capturedSpy.unitType, capturedSpy.owner, capital.position);
      newState.units[newUnit.id] = newUnit;
      newState.civilizations[capturedSpy.owner].units.push(newUnit.id);
      const { [capturedSpy.id]: _old, ...rest } = updatedOwnerEsp.spies;
      newState.espionage![capturedSpy.owner] = { ...updatedOwnerEsp, spies: { ...rest, [newUnit.id]: { ...updatedOwnerEsp.spies[capturedSpy.id], id: newUnit.id } } };
    } else {
      newState.espionage![capturedSpy.owner] = updatedOwnerEsp;
    }
  } else if (verdict === 'execute') {
    newState.espionage![capturedSpy.owner] = executeSpy(newState.espionage![capturedSpy.owner], capturedSpy.id);
    bus.emit('espionage:spy-executed', { executingCivId: civId, spyOwner: capturedSpy.owner, spyId: capturedSpy.id, spyName: capturedSpy.name });
  } else {
    newState.espionage![civId] = startInterrogation(newState.espionage![civId], capturedSpy.id, capturedSpy.owner);
  }
}
```

- [ ] **Step 8: Run full test suite**

```bash
yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/espionage-system.ts src/ui/espionage-panel.ts src/main.ts src/ai/basic-ai.ts src/core/turn-manager.ts src/core/types.ts tests/systems/espionage-capture.test.ts
git commit -m "feat(espionage): capture system — expel/execute/interrogate, identity reveal, AI verdict logic, intel application"
```
