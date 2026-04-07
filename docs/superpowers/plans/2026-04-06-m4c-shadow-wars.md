# M4c — Shadow Wars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend espionage to stages 3-4 (spy rings and shadow operations), add spy promotions, introduce breakaway faction pressure (unrest + revolt), add 4 new civilizations, and ship the icon legend QoL feature.

**Architecture:** Three new system layers: (1) espionage-system.ts extended with 8 new missions and promotion logic; (2) new faction-system.ts for unrest/revolt; (3) turn-manager.ts wired to call faction tick each turn. All unrest state lives on `City`. Rebel units during revolt reuse the barbarian unit infrastructure (owner `'rebels'`, treated like barbarians by AI). Stage 3 breakaway (full faction secession) is deliberately deferred to M4d.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, EventBus

---

## Background & Conventions

Before starting ANY task, read these files:
- `CLAUDE.md` — project conventions, hot-seat rules, seeded RNG rules
- `.claude/rules/game-systems.md` — deterministic RNG, bilateral diplomacy, state mutation rules
- `.claude/rules/ui-panels.md` — innerHTML prohibition, notification rules, HUD rules
- `.claude/rules/end-to-end-wiring.md` — compute-must-render rule

**Critical rules:**
1. **NEVER use `Math.random()`** — use `createRng()` from `src/systems/map-generator.ts`
2. **NEVER hardcode `'player'`** — use `state.currentPlayer`
3. **NEVER use `innerHTML` with game-generated strings** — use `document.createElement()` + `textContent`
4. **Seeded RNG pattern** — derive seed from `state.turn` + context string

**Test command:** `eval "$(mise activate bash)" && yarn test --run`
**Build command:** `eval "$(mise activate bash)" && yarn build`

---

## File Structure

| File | Change |
|------|--------|
| `src/core/types.ts` | New types: SpyMissionType stage 3-4, SpyPromotion, City unrest fields, advisorDisabledUntil on Civilization, game events |
| `src/systems/espionage-system.ts` | Stage 3-4 mission logic, spy promotions |
| `src/systems/faction-system.ts` | NEW — unrest pressure, revolt, rebel spawning |
| `src/systems/civ-definitions.ts` | 4 new civs: Spain, Viking, Prydain, Annuvin |
| `src/core/turn-manager.ts` | Wire processFactionTurn, apply unrest yield penalties |
| `src/main.ts` | Set conquestTurn when city is captured (line ~690) |
| `src/ui/espionage-panel.ts` | Show stage 3-4 missions, spy promotions |
| `src/ui/icon-legend.ts` | NEW — toggleable icon legend overlay |
| `src/main.ts` | Wire icon legend toggle button |
| `src/renderer/hex-renderer.ts` | Render unrest/revolt icons on cities |
| `src/ui/advisor-system.ts` | Add Spymaster/Chancellor warnings for unrest |
| `src/ai/basic-ai.ts` | AI: use stage 3-4 missions, respond to unrest |
| `tests/systems/espionage-stage3-4.test.ts` | NEW |
| `tests/systems/spy-promotions.test.ts` | NEW |
| `tests/systems/faction-system.test.ts` | NEW |
| `tests/systems/civ-definitions.test.ts` | Updated: 4 new civs |

---

## Task 1: Types

**Files:** `src/core/types.ts`

### Steps

- [ ] **Step 1: Extend SpyMissionType with stage 3-4 missions**

In `src/core/types.ts`, find:
```typescript
export type SpyMissionType =
  | 'scout_area'
  | 'monitor_troops'
  | 'gather_intel'
  | 'identify_resources'
  | 'monitor_diplomacy';
```

Replace with:
```typescript
export type SpyMissionType =
  // Stage 1 (espionage-scouting tech)
  | 'scout_area'          // reveal fog around target city
  | 'monitor_troops'      // report unit movements near city
  // Stage 2 (espionage-informants tech)
  | 'gather_intel'        // reveal tech progress, treasury, treaties
  | 'identify_resources'  // reveal strategic resources in city territory
  | 'monitor_diplomacy'   // see trade partners and relationships
  // Stage 3 (spy-networks or sabotage tech)
  | 'steal_tech'          // copy one tech target has that you don't
  | 'sabotage_production' // target city loses 3-5 turns of production progress
  | 'incite_unrest'       // increase spyUnrestBonus in target city
  | 'counter_espionage'   // passive defensive assignment (increases CI score)
  // Stage 4 (cryptography or counter-intelligence tech)
  | 'assassinate_advisor' // disable one advisor for 10 turns
  | 'forge_documents'     // diplomatic relationship penalty between two other civs
  | 'fund_rebels'         // escalate unrest in already-unrest city
  | 'arms_smuggling';     // spawn hostile units near target city
```

- [ ] **Step 2: Add SpyPromotion type and update Spy interface**

After the `EspionageState` type, add:
```typescript
export type SpyPromotion = 'infiltrator' | 'handler' | 'sentinel';
// infiltrator: bonus to direct-effect missions (steal, sabotage, assassinate, arms)
// handler:     bonus to influence missions (incite, forge, fund_rebels, counter_esp)
// sentinel:    bonus to counter-intelligence and detection avoidance
```

In the `Spy` interface, add two fields after `cooldownTurns`:
```typescript
  promotion?: SpyPromotion;          // set once, permanent
  promotionAvailable: boolean;       // true when XP >= 60 and no promotion yet
```

- [ ] **Step 3: Add unrest fields to City**

In the `City` interface, add after `grid`/`gridSize`:
```typescript
  unrestLevel: 0 | 1 | 2;     // 0=stable, 1=unrest, 2=revolt
  unrestTurns: number;         // turns spent at current unrest level (>= 1)
  conquestTurn?: number;       // turn this city was captured; cleared after 15 turns
  spyUnrestBonus: number;      // bonus pressure injected by enemy espionage; decays 5/turn
```

- [ ] **Step 4: Add advisorDisabledUntil to Civilization**

In the `Civilization` interface, add after `diplomacy`:
```typescript
  advisorDisabledUntil?: Partial<Record<AdvisorType, number>>; // turn number until re-enabled
```

- [ ] **Step 5: Add new game events**

In `GameEvents`, add:
```typescript
  'faction:unrest-started': { cityId: string; owner: string };
  'faction:revolt-started': { cityId: string; owner: string };
  'faction:unrest-resolved': { cityId: string; owner: string };
  'espionage:spy-promoted': { civId: string; spyId: string; promotion: SpyPromotion };
  'espionage:advisor-assassinated': { targetCivId: string; advisorType: AdvisorType; disabledUntilTurn: number };
  'espionage:documents-forged': { civA: string; civB: string; relationshipPenalty: number };
```

- [ ] **Step 6: Update new city defaults**

In `src/systems/city-system.ts`, in the `foundCity` function, add the new City fields to the returned object:
```typescript
  unrestLevel: 0,
  unrestTurns: 0,
  spyUnrestBonus: 0,
```
(`conquestTurn` is omitted — undefined by default for founded cities)

Also update `src/core/game-state.ts` if it creates cities directly (check for any city literal construction there).

- [ ] **Step 7: Update Spy creation to include promotionAvailable**

In `src/systems/espionage-system.ts`, in `recruitSpy`, add `promotionAvailable: false` to the `Spy` object:
```typescript
  const spy: Spy = {
    ...
    promotion: undefined,
    promotionAvailable: false,
  };
```

- [ ] **Step 8: Run tests to verify baseline still passes**

```
eval "$(mise activate bash)" && yarn test --run
```

Expected: all existing tests pass. Fix any TypeScript errors from new required fields.

---

## Task 2: Espionage Stage 3-4 Missions

**Files:** `src/systems/espionage-system.ts`

### Steps

- [ ] **Step 1: Add stage 3-4 missions to MISSION_BASE_SUCCESS and MISSION_DURATIONS**

In `espionage-system.ts`, extend `MISSION_BASE_SUCCESS`:
```typescript
const MISSION_BASE_SUCCESS: Record<SpyMissionType, number> = {
  // Stage 1-2 (unchanged)
  scout_area: 0.90,
  monitor_troops: 0.85,
  gather_intel: 0.70,
  identify_resources: 0.75,
  monitor_diplomacy: 0.70,
  // Stage 3
  steal_tech: 0.50,
  sabotage_production: 0.60,
  incite_unrest: 0.55,
  counter_espionage: 0.80,  // passive — mostly used for CI score, not rolled
  // Stage 4
  assassinate_advisor: 0.45,
  forge_documents: 0.55,
  fund_rebels: 0.60,
  arms_smuggling: 0.50,
};
```

Extend `MISSION_DURATIONS`:
```typescript
const MISSION_DURATIONS: Record<SpyMissionType, number> = {
  // Stage 1-2 (unchanged)
  scout_area: 1,
  monitor_troops: 2,
  gather_intel: 3,
  identify_resources: 4,
  monitor_diplomacy: 3,
  // Stage 3
  steal_tech: 6,
  sabotage_production: 4,
  incite_unrest: 5,
  counter_espionage: 0,   // passive — no turn timer
  // Stage 4
  assassinate_advisor: 6,
  forge_documents: 5,
  fund_rebels: 6,
  arms_smuggling: 4,
};
```

Extend `XP_PER_MISSION`:
```typescript
  steal_tech: 15,
  sabotage_production: 12,
  incite_unrest: 12,
  counter_espionage: 5,
  assassinate_advisor: 18,
  forge_documents: 15,
  fund_rebels: 12,
  arms_smuggling: 12,
```

- [ ] **Step 2: Add tech gating for stage 3-4**

Replace `getAvailableMissions`:
```typescript
const STAGE_1_TECHS = ['espionage-scouting'];
const STAGE_2_TECHS = ['espionage-informants'];
const STAGE_3_TECHS = ['spy-networks', 'sabotage'];      // either unlocks stage 3
const STAGE_4_TECHS = ['cryptography', 'counter-intelligence']; // either unlocks stage 4

const STAGE_1_MISSIONS: SpyMissionType[] = ['scout_area', 'monitor_troops'];
const STAGE_2_MISSIONS: SpyMissionType[] = ['gather_intel', 'identify_resources', 'monitor_diplomacy'];
const STAGE_3_MISSIONS: SpyMissionType[] = ['steal_tech', 'sabotage_production', 'incite_unrest', 'counter_espionage'];
const STAGE_4_MISSIONS: SpyMissionType[] = ['assassinate_advisor', 'forge_documents', 'fund_rebels', 'arms_smuggling'];

export function getAvailableMissions(completedTechs: string[]): SpyMissionType[] {
  const missions: SpyMissionType[] = [];
  if (STAGE_1_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_1_MISSIONS);
  if (STAGE_2_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_2_MISSIONS);
  if (STAGE_3_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_3_MISSIONS);
  if (STAGE_4_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_4_MISSIONS);
  return missions;
}
```

- [ ] **Step 3: Add MissionResult fields for stage 3-4**

In the `MissionResult` interface, add:
```typescript
  // steal_tech
  stolenTechId?: string;
  // sabotage_production
  productionLost?: number;       // turns of production destroyed
  // incite_unrest / fund_rebels
  unrestInjected?: number;       // spyUnrestBonus amount added
  // assassinate_advisor
  assassinatedAdvisor?: AdvisorType;
  disabledUntilTurn?: number;
  // forge_documents
  forgeCivA?: string;
  forgeCivB?: string;
  forgeRelationshipPenalty?: number;
  // arms_smuggling
  spawnedUnitType?: UnitType;
  spawnPosition?: HexCoord;
```

- [ ] **Step 4: Implement resolveMissionResult for stage 3-4**

Add cases to the `switch` in `resolveMissionResult`. Import `AdvisorType` from `../core/types` at the top.

```typescript
case 'steal_tech': {
  const targetCiv = gameState.civilizations[targetCivId];
  const myCiv = gameState.civilizations[gameState.currentPlayer];
  if (!targetCiv || !myCiv) return {};
  const theyHave = targetCiv.techState.completed;
  const iHave = new Set(myCiv.techState.completed);
  const stealable = theyHave.filter(t => !iHave.has(t));
  if (stealable.length === 0) return {};
  // Pick deterministically (caller passes RNG seed via context — use turn+spy as seed)
  const rng = createRng(`steal-${targetCivId}-${targetCityId}`);
  const idx = Math.floor(rng() * stealable.length);
  return { stolenTechId: stealable[idx] };
}

case 'sabotage_production': {
  const targetCity = gameState.cities[targetCityId];
  if (!targetCity || targetCity.productionQueue.length === 0) return {};
  const lostTurns = 3 + Math.floor(createRng(`sab-${targetCityId}`)() * 3); // 3-5
  return { productionLost: lostTurns };
}

case 'incite_unrest': {
  return { unrestInjected: 25 };
}

case 'fund_rebels': {
  const targetCity = gameState.cities[targetCityId];
  if (!targetCity || targetCity.unrestLevel === 0) return {};
  return { unrestInjected: 35 };
}

case 'counter_espionage': {
  return {}; // passive — handled by assignSpyDefensive
}

case 'assassinate_advisor': {
  const advisorTypes: AdvisorType[] = ['builder', 'explorer', 'chancellor', 'warchief', 'treasurer', 'scholar', 'spymaster'];
  const rng = createRng(`assassin-${targetCivId}-${gameState.turn}`);
  const idx = Math.floor(rng() * advisorTypes.length);
  const assassinatedAdvisor = advisorTypes[idx];
  const disabledUntilTurn = gameState.turn + 10;
  return { assassinatedAdvisor, disabledUntilTurn };
}

case 'forge_documents': {
  const allCivIds = Object.keys(gameState.civilizations).filter(
    id => id !== targetCivId && id !== gameState.currentPlayer,
  );
  if (allCivIds.length < 1) return {};
  const rng = createRng(`forge-${targetCivId}-${gameState.turn}`);
  const idx = Math.floor(rng() * allCivIds.length);
  return { forgeCivA: targetCivId, forgeCivB: allCivIds[idx], forgeRelationshipPenalty: -25 };
}

case 'arms_smuggling': {
  const targetCity = gameState.cities[targetCityId];
  if (!targetCity) return {};
  // Pick a spawn position near the target city (1-2 hexes away) using seeded RNG
  const rng = createRng(`arms-${targetCityId}-${gameState.turn}`);
  const offsets = [
    { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
  ];
  const offset = offsets[Math.floor(rng() * offsets.length)];
  const spawnPosition: HexCoord = {
    q: targetCity.position.q + offset.q,
    r: targetCity.position.r + offset.r,
  };
  return { spawnedUnitType: 'warrior', spawnPosition };
}
```

- [ ] **Step 5: Apply mission results in processEspionageTurn**

In `processEspionageTurn`, inside the `mission_succeeded` event handler, add result application for stage 3-4 missions after the existing `scout_area` application:

```typescript
// steal_tech
if (evt.missionType === 'steal_tech' && result.stolenTechId) {
  const stolenId = result.stolenTechId as string;
  if (!state.civilizations[civId].techState.completed.includes(stolenId)) {
    state.civilizations[civId].techState.completed.push(stolenId);
    bus.emit('tech:completed', { civId, techId: stolenId });
  }
}

// sabotage_production
if (evt.missionType === 'sabotage_production' && result.productionLost) {
  const spyTarget = updatedEsp.spies[evt.spyId];
  if (spyTarget?.targetCityId) {
    const tc = state.cities[spyTarget.targetCityId];
    if (tc) {
      const lostProgress = (result.productionLost as number) * 5; // ~5 production/turn lost
      state.cities[spyTarget.targetCityId] = {
        ...tc,
        productionProgress: Math.max(0, tc.productionProgress - lostProgress),
      };
    }
  }
}

// incite_unrest / fund_rebels — inject spyUnrestBonus
if ((evt.missionType === 'incite_unrest' || evt.missionType === 'fund_rebels') && result.unrestInjected) {
  const spyTarget = updatedEsp.spies[evt.spyId];
  if (spyTarget?.targetCityId) {
    const tc = state.cities[spyTarget.targetCityId];
    if (tc) {
      state.cities[spyTarget.targetCityId] = {
        ...tc,
        spyUnrestBonus: Math.min(50, tc.spyUnrestBonus + (result.unrestInjected as number)),
      };
    }
  }
}

// assassinate_advisor
if (evt.missionType === 'assassinate_advisor' && result.assassinatedAdvisor && result.disabledUntilTurn) {
  const tc = state.civilizations[spy?.targetCivId ?? ''];
  if (tc) {
    tc.advisorDisabledUntil = {
      ...tc.advisorDisabledUntil,
      [result.assassinatedAdvisor as AdvisorType]: result.disabledUntilTurn as number,
    };
    bus.emit('espionage:advisor-assassinated', {
      targetCivId: spy?.targetCivId ?? '',
      advisorType: result.assassinatedAdvisor as AdvisorType,
      disabledUntilTurn: result.disabledUntilTurn as number,
    });
  }
}

// forge_documents
if (evt.missionType === 'forge_documents' && result.forgeCivA && result.forgeCivB) {
  const penalty = (result.forgeRelationshipPenalty as number) ?? -25;
  const civA = result.forgeCivA as string;
  const civB = result.forgeCivB as string;
  if (state.civilizations[civA]) {
    state.civilizations[civA].diplomacy = modifyRelationship(
      state.civilizations[civA].diplomacy, civB, penalty,
    );
  }
  if (state.civilizations[civB]) {
    state.civilizations[civB].diplomacy = modifyRelationship(
      state.civilizations[civB].diplomacy, civA, penalty,
    );
  }
  bus.emit('espionage:documents-forged', {
    civA, civB, relationshipPenalty: penalty,
  });
}

// arms_smuggling — spawn a hostile unit near the target city
if (evt.missionType === 'arms_smuggling' && result.spawnPosition) {
  const { createUnit } = await import('./unit-system'); // use existing createUnit
  // Import at top of file instead of inline — add to imports
  const pos = result.spawnPosition as HexCoord;
  const hostileUnit = createUnit('warrior', 'rebels', pos);
  state.units[hostileUnit.id] = hostileUnit;
  bus.emit('unit:created', { unit: hostileUnit });
}
```

**Note:** Add `import { createUnit } from './unit-system';` at the top of espionage-system.ts (not inline).

- [ ] **Step 6: Decay spyUnrestBonus each turn**

At the end of `processEspionageTurn`, before returning state, add a pass to decay `spyUnrestBonus` on all cities:

```typescript
// Decay spy unrest bonus 5 per turn (minimum 0)
for (const cityId of Object.keys(state.cities)) {
  const city = state.cities[cityId];
  if (city.spyUnrestBonus > 0) {
    state.cities[cityId] = { ...city, spyUnrestBonus: Math.max(0, city.spyUnrestBonus - 5) };
  }
}
```

- [ ] **Step 7: Run tests**

```
eval "$(mise activate bash)" && yarn test --run
```

Expected: all tests pass. Fix any type errors.

---

## Task 3: Spy Promotions

**Files:** `src/systems/espionage-system.ts`

### Steps

- [ ] **Step 1: Add promotion logic constants**

Add after `XP_PER_MISSION`:
```typescript
const PROMOTION_XP_THRESHOLD = 60;

// Missions that lean toward each promotion category
const INFILTRATOR_MISSIONS = new Set<SpyMissionType>([
  'steal_tech', 'sabotage_production', 'assassinate_advisor', 'arms_smuggling',
]);
const HANDLER_MISSIONS = new Set<SpyMissionType>([
  'incite_unrest', 'forge_documents', 'fund_rebels', 'monitor_diplomacy',
]);
// Sentinel: anything else (defensive, intel)
```

- [ ] **Step 2: Add checkAndApplyPromotion function**

```typescript
export function checkAndApplyPromotion(
  spy: Spy,
  lastMissionType: SpyMissionType,
): Spy {
  if (spy.promotion !== undefined) return spy;          // already promoted
  if (spy.experience < PROMOTION_XP_THRESHOLD) return spy; // not enough XP

  // Auto-promote based on last mission type
  let promotion: SpyPromotion;
  if (INFILTRATOR_MISSIONS.has(lastMissionType)) {
    promotion = 'infiltrator';
  } else if (HANDLER_MISSIONS.has(lastMissionType)) {
    promotion = 'handler';
  } else {
    promotion = 'sentinel';
  }

  return { ...spy, promotion, promotionAvailable: false };
}
```

- [ ] **Step 3: Apply promotion bonus in getSpySuccessChance**

Add a `promotion` parameter:
```typescript
export function getSpySuccessChance(
  spyExperience: number,
  counterIntel: number,
  missionType: SpyMissionType,
  promotion?: SpyPromotion,
): number {
  const base = MISSION_BASE_SUCCESS[missionType];
  const expBonus = spyExperience * 0.003;
  const ciPenalty = counterIntel * 0.004;

  let promotionBonus = 0;
  if (promotion === 'infiltrator' && INFILTRATOR_MISSIONS.has(missionType)) {
    promotionBonus = 0.10; // +10% for matching mission type
  } else if (promotion === 'handler' && HANDLER_MISSIONS.has(missionType)) {
    promotionBonus = 0.10;
  } else if (promotion === 'sentinel') {
    promotionBonus = 0.05; // small generic defensive bonus
  }

  return Math.max(0.05, Math.min(0.98, base + expBonus + promotionBonus - ciPenalty));
}
```

Update callers of `getSpySuccessChance` in `processSpyTurn` to pass `spy.promotion`.

- [ ] **Step 4: Check promotion after successful mission**

In `processSpyTurn`, in the success branch, after awarding XP, call `checkAndApplyPromotion`:
```typescript
updated.experience = Math.min(100, updated.experience + XP_PER_MISSION[mission.type]);
const promoted = checkAndApplyPromotion(updated, mission.type);
if (promoted.promotion && !updated.promotion) {
  updated = promoted;
  events.push({ type: 'spy_promoted', spyId, promotion: promoted.promotion! });
}
```

Add `'spy_promoted'` to `SpyTurnEvent`:
```typescript
export interface SpyTurnEvent {
  type: 'mission_succeeded' | 'mission_failed' | 'spy_expelled' | 'spy_captured' | 'spy_arrived' | 'spy_promoted';
  spyId: string;
  missionType?: SpyMissionType;
  promotion?: SpyPromotion;
  result?: Record<string, unknown>;
}
```

Handle `spy_promoted` in `processEspionageTurn`:
```typescript
case 'spy_promoted':
  bus.emit('espionage:spy-promoted', {
    civId, spyId: evt.spyId, promotion: evt.promotion!,
  });
  break;
```

- [ ] **Step 5: Run tests**

```
eval "$(mise activate bash)" && yarn test --run
```

---

## Task 4: Faction System (Unrest + Revolt)

**Files:** `src/systems/faction-system.ts` (NEW), `src/main.ts` (set conquestTurn on capture)

### Steps

- [ ] **Step 1: Set conquestTurn when city is captured**

In `src/main.ts`, around line 690, after the existing owner-transfer code:
```typescript
// Set conquestTurn for unrest pressure calculation
gameState.cities[cityAtTarget.id] = {
  ...gameState.cities[cityAtTarget.id],
  conquestTurn: gameState.turn,
  unrestLevel: 0,      // reset — unrest will build up from pressure
  unrestTurns: 0,
  spyUnrestBonus: 0,
};
```

- [ ] **Step 2: Create faction-system.ts**

Create `src/systems/faction-system.ts` with:

```typescript
// src/systems/faction-system.ts
import type { GameState, City, HexCoord, UnitType } from '../core/types';
import type { EventBus } from '../core/event-bus';
import { createRng } from './map-generator';
import { createUnit } from './unit-system';
import { hexDistance } from './hex-utils';

// --- Unrest pressure thresholds ---
const UNREST_TRIGGER_PRESSURE = 40;   // pressure > 40 → unrest
const REVOLT_UNREST_TURNS = 5;        // turns at unrest before revolt
const CONQUEST_UNREST_DURATION = 15;  // turns conquestTurn persists (then cleared)
const GOLD_APPEASE_COST_PER_POP = 15; // gold cost to appease = population × this
const MAX_PRESSURE_EMPIRE = 30;       // cap on empire-size contribution
const MAX_PRESSURE_DISTANCE = 20;     // cap on distance contribution
const MAX_PRESSURE_WAR = 24;          // cap on war weariness contribution

// --- Pressure computation ---

export function computeUnrestPressure(cityId: string, state: GameState): number {
  const city = state.cities[cityId];
  if (!city) return 0;
  const owner = city.owner;
  const civ = state.civilizations[owner];
  if (!civ) return 0;

  let pressure = 0;

  // Empire overextension: extra cities over threshold of 5 add pressure
  const cityCount = civ.cities.length;
  const overextension = Math.max(0, (cityCount - 5) * 3);
  pressure += Math.min(MAX_PRESSURE_EMPIRE, overextension);

  // Distance from capital: first city in civ.cities is assumed to be capital
  const capitalId = civ.cities[0];
  const capital = state.cities[capitalId];
  if (capital && capitalId !== cityId) {
    const dist = hexDistance(city.position, capital.position);
    pressure += Math.min(MAX_PRESSURE_DISTANCE, Math.max(0, (dist - 5) * 2));
  }

  // Recent conquest penalty
  if (city.conquestTurn !== undefined) {
    const turnsSinceConquest = state.turn - city.conquestTurn;
    if (turnsSinceConquest < CONQUEST_UNREST_DURATION) {
      pressure += 25;
    }
  }

  // War weariness: each active war adds 8
  const atWarCount = civ.diplomacy.atWarWith?.length ?? 0;
  pressure += Math.min(MAX_PRESSURE_WAR, atWarCount * 8);

  // Spy unrest bonus (from enemy incite_unrest / fund_rebels missions)
  pressure += city.spyUnrestBonus;

  return Math.min(100, pressure);
}

// --- Resolution helpers ---

export function canGarrisonCity(cityId: string, state: GameState): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  return Object.values(state.units).some(
    u => u.owner === city.owner &&
         hexDistance(u.position, city.position) === 0,
  );
}

export function getCityAppeaseCost(city: City): number {
  return city.population * GOLD_APPEASE_COST_PER_POP;
}

// --- Revolt: spawn rebel units ---

function spawnRebelUnits(city: City, state: GameState, seed: string): GameState {
  const rng = createRng(seed);
  const offsets: HexCoord[] = [
    { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
  ];
  const unitType: UnitType = city.population >= 4 ? 'swordsman' : 'warrior';
  const spawnCount = 1 + Math.floor(rng() * 2); // 1-2 rebels

  for (let i = 0; i < spawnCount; i++) {
    const offset = offsets[Math.floor(rng() * offsets.length)];
    const pos: HexCoord = { q: city.position.q + offset.q, r: city.position.r + offset.r };
    const key = `${pos.q},${pos.r}`;
    if (!state.map.tiles[key]) continue; // off-map
    const rebel = createUnit(unitType, 'rebels', pos);
    state.units[rebel.id] = rebel;
  }

  return state;
}

// --- Main faction tick ---

export function processFactionTurn(state: GameState, bus: EventBus): GameState {
  const newState = state; // mutated in place (consistent with espionage pattern)

  for (const cityId of Object.keys(newState.cities)) {
    const city = newState.cities[cityId];
    if (!city) continue;

    // Clear expired conquestTurn
    if (city.conquestTurn !== undefined &&
        (newState.turn - city.conquestTurn) >= CONQUEST_UNREST_DURATION) {
      newState.cities[cityId] = { ...city, conquestTurn: undefined };
    }

    const pressure = computeUnrestPressure(cityId, newState);
    let updated = { ...newState.cities[cityId] };

    if (updated.unrestLevel === 0) {
      if (pressure > UNREST_TRIGGER_PRESSURE) {
        // Escalate to unrest
        updated = { ...updated, unrestLevel: 1, unrestTurns: 0 };
        newState.cities[cityId] = updated;
        bus.emit('faction:unrest-started', { cityId, owner: city.owner });
      }
      // else: stable, nothing to do
    } else if (updated.unrestLevel === 1) {
      const garrisoned = canGarrisonCity(cityId, newState);
      if (pressure <= UNREST_TRIGGER_PRESSURE || garrisoned) {
        // Resolve unrest if pressure drops or city is garrisoned
        updated = { ...updated, unrestLevel: 0, unrestTurns: 0 };
        newState.cities[cityId] = updated;
        bus.emit('faction:unrest-resolved', { cityId, owner: city.owner });
      } else {
        updated = { ...updated, unrestTurns: updated.unrestTurns + 1 };
        if (updated.unrestTurns >= REVOLT_UNREST_TURNS) {
          // Escalate to revolt
          updated = { ...updated, unrestLevel: 2, unrestTurns: 0 };
          newState.cities[cityId] = updated;
          const newStateWithRebels = spawnRebelUnits(updated, newState, `revolt-${cityId}-${newState.turn}`);
          Object.assign(newState, newStateWithRebels);
          bus.emit('faction:revolt-started', { cityId, owner: city.owner });
        } else {
          newState.cities[cityId] = updated;
        }
      }
    } else if (updated.unrestLevel === 2) {
      // Revolt: check if all nearby rebels are defeated AND pressure is resolved
      const nearbyRebels = Object.values(newState.units).filter(
        u => u.owner === 'rebels' && hexDistance(u.position, city.position) <= 3,
      );
      const garrisoned = canGarrisonCity(cityId, newState);
      if (nearbyRebels.length === 0 && (pressure <= UNREST_TRIGGER_PRESSURE || garrisoned)) {
        updated = { ...updated, unrestLevel: 0, unrestTurns: 0 };
        newState.cities[cityId] = updated;
        bus.emit('faction:unrest-resolved', { cityId, owner: city.owner });
      }
      // else: revolt continues — city remains locked
    }
  }

  return newState;
}

// --- Query helpers for city-system and UI ---

export function getUnrestYieldMultiplier(city: City): number {
  if (city.unrestLevel === 2) return 0.5;  // revolt: 50% yields
  if (city.unrestLevel === 1) return 0.75; // unrest: 75% yields
  return 1.0;
}

export function isCityProductionLocked(city: City): boolean {
  return city.unrestLevel === 2; // revolt halts production
}
```

- [ ] **Step 3: Run tests**

```
eval "$(mise activate bash)" && yarn test --run
```

---

## Task 5: Turn Manager Wiring

**Files:** `src/core/turn-manager.ts`

### Steps

- [ ] **Step 1: Import and call processFactionTurn**

Add import at the top:
```typescript
import { processFactionTurn, getUnrestYieldMultiplier, isCityProductionLocked } from '@/systems/faction-system';
```

After the `processEspionageTurn` call (line ~337), add:
```typescript
// --- Process faction unrest / revolt ---
newState = processFactionTurn(newState, bus);
```

- [ ] **Step 2: Apply unrest yield penalties**

In the city processing loop (around line 55), modify yield application:
```typescript
const yields = calculateCityYields(city, newState.map, civDef?.bonusEffect);
const unrestMultiplier = getUnrestYieldMultiplier(city);
const effectiveFood = Math.floor(yields.food * unrestMultiplier);
const effectiveProduction = isCityProductionLocked(city) ? 0 : Math.floor(yields.production * unrestMultiplier);

totalScience += Math.floor(yields.science * unrestMultiplier);
totalGold += Math.floor(yields.gold * unrestMultiplier);
const result = processCity(city, newState.map, effectiveFood, effectiveProduction, civDef?.bonusEffect);
```

- [ ] **Step 3: Advance advisor disability timers**

At the end of the per-civilization loop, add:
```typescript
// Clear expired advisor disability
if (civ.advisorDisabledUntil) {
  const stillDisabled: Partial<Record<AdvisorType, number>> = {};
  for (const [advisor, untilTurn] of Object.entries(civ.advisorDisabledUntil)) {
    if ((untilTurn as number) > newState.turn) {
      stillDisabled[advisor as AdvisorType] = untilTurn as number;
    }
  }
  newState.civilizations[civId].advisorDisabledUntil = Object.keys(stillDisabled).length > 0
    ? stillDisabled
    : undefined;
}
```

- [ ] **Step 4: Run tests**

```
eval "$(mise activate bash)" && yarn test --run
```

---

## Task 6: Renderer — Unrest/Revolt City Icons

**Files:** `src/renderer/hex-renderer.ts` (or `src/renderer/city-renderer.ts`)

### Steps

- [ ] **Step 1: Locate city icon rendering**

Search `hex-renderer.ts` and `city-renderer.ts` for where city icons are drawn (look for where population or city name is rendered). Add unrest indicators after existing city rendering.

- [ ] **Step 2: Render unrest icon**

In the city render pass, after the existing city marker, check `city.unrestLevel`:

```typescript
// Unrest/revolt indicators
if (city.unrestLevel === 1) {
  ctx.font = `${Math.floor(hexSize * 0.5)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡', pixelX, pixelY - hexSize * 0.6);  // unrest: lightning bolt
}
if (city.unrestLevel === 2) {
  ctx.font = `${Math.floor(hexSize * 0.6)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔥', pixelX, pixelY - hexSize * 0.6);  // revolt: fire
}
```

The exact `pixelX`, `pixelY`, and `hexSize` variable names must match what the existing renderer uses — check the file before implementing.

- [ ] **Step 3: Run tests and visual check**

```
eval "$(mise activate bash)" && yarn test --run && yarn build
```

---

## Task 7: Advisor System — Unrest Warnings

**Files:** `src/ui/advisor-system.ts`

### Steps

- [ ] **Step 1: Respect advisorDisabledUntil when emitting messages**

In `advisor-system.ts`, find where advisor messages are gated (around line 583 where `advisorsEnabled` is checked). Add a check for the new `advisorDisabledUntil`:

```typescript
// Skip if advisor was assassinated and still disabled
const disabledUntil = state.civilizations[state.currentPlayer]?.advisorDisabledUntil?.[advisor];
if (disabledUntil !== undefined && disabledUntil > state.turn) return;
```

This should be added alongside the existing `advisorsEnabled` check.

- [ ] **Step 2: Add Spymaster/Chancellor unrest warnings**

In the advisor message generation section, add:

```typescript
// Spymaster: warn about cities under unrest/revolt
const unrestCities = state.civilizations[state.currentPlayer]?.cities
  .map(id => state.cities[id])
  .filter(c => c && c.unrestLevel >= 1) ?? [];

if (unrestCities.length > 0 && spymaster enabled) {
  const revolting = unrestCities.filter(c => c.unrestLevel === 2);
  if (revolting.length > 0) {
    bus.emit('advisor:message', {
      advisor: 'spymaster',
      message: `${revolting[0].name} is in open revolt! Defeat the rebels and address their grievances.`,
      icon: '🔥',
    });
  } else {
    bus.emit('advisor:message', {
      advisor: 'chancellor',
      message: `Unrest is rising in ${unrestCities[0].name}. Consider garrisoning a unit or appeasing the population.`,
      icon: '⚡',
    });
  }
}
```

Follow the existing pattern in the file for how/when to emit advisor messages — do not emit every turn, only at turn start.

- [ ] **Step 3: Run tests**

```
eval "$(mise activate bash)" && yarn test --run
```

---

## Task 8: Espionage Panel Update

**Files:** `src/ui/espionage-panel.ts`

### Steps

- [ ] **Step 1: Expose spy promotion info**

In `EspionagePanelData`, add:
```typescript
  spiesWithPromotionAvailable: string[];  // spy IDs eligible for display
```

In `getEspionagePanelData`, populate:
```typescript
  spiesWithPromotionAvailable: spies.filter(s => s.promotionAvailable).map(s => s.id),
```

- [ ] **Step 2: Add mission display names for stage 3-4**

Add a `MISSION_DISPLAY_NAMES` map (can live in `espionage-panel.ts` or be exported from `espionage-system.ts`):

```typescript
export const MISSION_DISPLAY_NAMES: Record<string, string> = {
  scout_area: 'Scout Area',
  monitor_troops: 'Monitor Troops',
  gather_intel: 'Gather Intelligence',
  identify_resources: 'Identify Resources',
  monitor_diplomacy: 'Monitor Diplomacy',
  steal_tech: 'Steal Technology',
  sabotage_production: 'Sabotage Production',
  incite_unrest: 'Incite Unrest',
  counter_espionage: 'Counter-Espionage (Passive)',
  assassinate_advisor: 'Assassinate Advisor',
  forge_documents: 'Forge Documents',
  fund_rebels: 'Fund Rebels',
  arms_smuggling: 'Arms Smuggling',
};
```

This ensures the UI renders mission names as safe text content (not raw type IDs).

The actual DOM rendering of missions happens in `main.ts` — verify there is no `innerHTML` used with mission names. If there is, replace with `textContent`.

---

## Task 9: Icon Legend

**Files:** `src/ui/icon-legend.ts` (NEW), `src/main.ts` (wire button)

### Steps

- [ ] **Step 1: Create icon-legend.ts**

Create `src/ui/icon-legend.ts`:

```typescript
// src/ui/icon-legend.ts

interface LegendEntry {
  icon: string;
  label: string;
  description: string;
}

const LEGEND_ENTRIES: LegendEntry[] = [
  { icon: '✦', label: 'Natural Wonder', description: 'A unique geographic feature granting bonuses to the first civ to discover it.' },
  { icon: '⌂', label: 'Village', description: 'Tribal village — visit with a unit for a one-time reward.' },
  { icon: '💀', label: 'Barbarian Camp', description: 'Hostile camp that spawns raiders. Destroy it for gold.' },
  { icon: '⬡', label: 'City-State', description: 'Independent minor civilization. Trade, ally, or conquer.' },
  { icon: '⚡', label: 'Unrest', description: 'City yields reduced 25%. Garrison a unit or address grievances.' },
  { icon: '🔥', label: 'Revolt', description: 'City in open revolt. Yields halved, production stopped, rebels spawned.' },
  { icon: '⚔', label: 'Unit', description: 'Military unit. Tap to select and view actions.' },
  { icon: '⛏', label: 'Worker', description: 'Building improvements on a hex. Tap to redirect.' },
];

export function createIconLegend(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'icon-legend';
  overlay.style.cssText = [
    'position:fixed', 'bottom:80px', 'left:8px',
    'background:rgba(0,0,0,0.85)', 'color:#fff',
    'border-radius:8px', 'padding:10px 14px',
    'font-size:13px', 'max-width:260px',
    'z-index:200', 'display:none',
  ].join(';');

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:bold;margin-bottom:8px;font-size:14px;';
  title.textContent = 'Map Icon Guide';
  overlay.appendChild(title);

  for (const entry of LEGEND_ENTRIES) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:flex-start;margin-bottom:6px;gap:8px;';

    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = 'font-size:16px;min-width:22px;';
    iconSpan.textContent = entry.icon;

    const textDiv = document.createElement('div');
    const label = document.createElement('div');
    label.style.fontWeight = 'bold';
    label.textContent = entry.label;
    const desc = document.createElement('div');
    desc.style.cssText = 'color:#ccc;font-size:12px;';
    desc.textContent = entry.description;
    textDiv.appendChild(label);
    textDiv.appendChild(desc);

    row.appendChild(iconSpan);
    row.appendChild(textDiv);
    overlay.appendChild(row);
  }

  return overlay;
}

export function toggleIconLegend(): void {
  const el = document.getElementById('icon-legend');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
```

- [ ] **Step 2: Wire into main.ts**

In `main.ts`, after the HUD is built:
1. Import `createIconLegend` and `toggleIconLegend` from `../ui/icon-legend`.
2. Call `document.body.appendChild(createIconLegend())` during init.
3. Find where HUD buttons are created and add a legend toggle button:

```typescript
const legendBtn = document.createElement('button');
legendBtn.textContent = '?';
legendBtn.title = 'Map Icon Guide';
legendBtn.style.cssText = /* match existing HUD button styles */;
legendBtn.addEventListener('click', toggleIconLegend);
// append to HUD button container
```

Check `main.ts` for the existing HUD button pattern and match it exactly.

- [ ] **Step 3: Run tests and build**

```
eval "$(mise activate bash)" && yarn test --run && yarn build
```

---

## Task 10: New Civilizations

**Files:** `src/systems/civ-definitions.ts`

### Steps

- [ ] **Step 1: Add Spain**

```typescript
{
  id: 'spain',
  name: 'Spain',
  color: '#C8102E',
  personality: {
    traits: ['expansionist', 'diplomatic'],
    warLikelihood: 0.4,
    diplomacyFocus: 0.6,
    expansionPriority: 0.7,
    techPriority: 0.5,
  },
  bonusEffect: { type: 'wonder_discovery_bonus', multiplier: 2.0 },
  // Wonder/village discovery yields double rewards
  description: 'Bonus rewards from natural wonders and tribal villages.',
},
```

**Implement the bonus:** In `src/systems/wonder-system.ts` and `src/systems/village-system.ts`, check for `bonusEffect.type === 'wonder_discovery_bonus'` and double the reward when the discovering civ is Spain. Add `wonder_discovery_bonus` to the `CivBonusEffect` type union in `src/core/types.ts`.

- [ ] **Step 2: Add Viking/Norse**

```typescript
{
  id: 'viking',
  name: 'Norse',
  color: '#4A90D9',
  personality: {
    traits: ['aggressive', 'expansionist'],
    warLikelihood: 0.7,
    diplomacyFocus: 0.3,
    expansionPriority: 0.8,
    techPriority: 0.4,
  },
  bonusEffect: { type: 'naval_raid_gold', amount: 30 },
  // Scout/military units gain +1 movement; raiding cities yields gold (handled in combat)
  description: 'Naval raids yield gold, scouts and military move faster.',
},
```

**Implement the bonus:** In `src/systems/combat-system.ts`, when a Viking unit defeats a city unit or captures a city, add `amount` gold to the Viking civ's treasury. In `src/systems/unit-system.ts`, when creating a unit for the Viking civ, add 1 to `movementPoints` if the unit type is `scout`, `warrior`, `swordsman`, or `archer`.

Add `naval_raid_gold` and its `amount` field to `CivBonusEffect`.

- [ ] **Step 3: Add Prydain**

```typescript
{
  id: 'prydain',
  name: 'Prydain',
  color: '#2E8B57',
  personality: {
    traits: ['diplomatic', 'aggressive'],
    warLikelihood: 0.45,
    diplomacyFocus: 0.55,
    expansionPriority: 0.5,
    techPriority: 0.6,
  },
  bonusEffect: { type: 'homeland_defense_bonus', strengthBonus: 5 },
  // +5 combat strength when defending tiles owned by Prydain
  description: 'Combat bonus when defending homeland tiles.',
},
```

**Implement the bonus:** In `src/systems/combat-system.ts`, in the defender strength calculation, if the defender's civ has `bonusEffect.type === 'homeland_defense_bonus'` and the combat tile `owner === defender.owner`, add `strengthBonus` to defender strength.

Add `homeland_defense_bonus` to `CivBonusEffect`.

- [ ] **Step 4: Add Annuvin**

```typescript
{
  id: 'annuvin',
  name: 'Annuvin',
  color: '#4B0082',
  personality: {
    traits: ['aggressive', 'diplomatic'],
    warLikelihood: 0.6,
    diplomacyFocus: 0.4,
    expansionPriority: 0.5,
    techPriority: 0.5,
  },
  bonusEffect: { type: 'espionage_xp_bonus', multiplier: 1.5 },
  // Spies earn 50% more XP per mission; mission durations reduced by 1 turn
  description: 'Espionage network grows faster — spy XP bonus and shorter mission times.',
},
```

**Implement the bonus:** In `src/systems/espionage-system.ts`, in `processSpyTurn` where XP is awarded on success, check if `state.civilizations[civId].civType === 'annuvin'` and multiply XP by `bonusEffect.multiplier`. When `startMission` is called for an Annuvin spy, reduce `turnsTotal` by 1 (min 1). This requires passing `civType` into `startMission` — add an optional `civBonusEffect` parameter or check it in `processEspionageTurn` before calling `startMission`.

Add `espionage_xp_bonus` to `CivBonusEffect`.

- [ ] **Step 5: Update civ-select UI to include new civs**

No code change needed if `civ-select.ts` reads from `CIV_DEFINITIONS` dynamically — verify it does. If it has a hardcoded list, add the 4 new IDs.

- [ ] **Step 6: Run tests**

```
eval "$(mise activate bash)" && yarn test --run
```

---

## Task 11: AI Behavior

**Files:** `src/ai/basic-ai.ts`

### Steps

- [ ] **Step 1: AI uses stage 3-4 missions based on personality**

In `basic-ai.ts`, find where AI chooses spy missions (search for `getAvailableMissions` or espionage assignment logic). Extend the mission-selection logic:

- **Aggressive/Paranoid AI:** prefer `steal_tech`, `sabotage_production`, `arms_smuggling`
- **Diplomatic/Treacherous AI:** prefer `forge_documents`, `incite_unrest`, `fund_rebels`
- **Default:** prefer `gather_intel`, `monitor_diplomacy`

Follow the existing AI personality pattern (`personality.traits` array).

- [ ] **Step 2: AI responds to unrest in its own cities**

In the AI turn processing (where city decisions are made), add unrest response:

```typescript
// Respond to unrest: appease if treasury allows
for (const cityId of civ.cities) {
  const city = newState.cities[cityId];
  if (!city || city.unrestLevel === 0) continue;

  const cost = getCityAppeaseCost(city);
  if (newState.civilizations[civId].gold >= cost) {
    newState.civilizations[civId].gold -= cost;
    // Reset unrest by reducing spyUnrestBonus and resetting unrestTurns
    newState.cities[cityId] = {
      ...city,
      spyUnrestBonus: 0,
      unrestTurns: Math.max(0, city.unrestTurns - 2),
    };
  }
}
```

Import `getCityAppeaseCost` from `faction-system.ts` at the top of `basic-ai.ts`.

- [ ] **Step 3: Run tests**

```
eval "$(mise activate bash)" && yarn test --run
```

---

## Task 12: Tests

**Files:** `tests/systems/espionage-stage3-4.test.ts` (NEW), `tests/systems/spy-promotions.test.ts` (NEW), `tests/systems/faction-system.test.ts` (NEW), `tests/systems/civ-definitions.test.ts` (update)

### Steps

- [ ] **Step 1: Write espionage stage 3-4 tests**

Create `tests/systems/espionage-stage3-4.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getAvailableMissions, resolveMissionResult } from '@/systems/espionage-system';
import type { GameState } from '@/core/types';

describe('espionage stage 3 tech gating', () => {
  it('spy-networks unlocks stage 3 missions', () => {
    const missions = getAvailableMissions(['espionage-scouting', 'espionage-informants', 'spy-networks']);
    expect(missions).toContain('steal_tech');
    expect(missions).toContain('sabotage_production');
    expect(missions).toContain('incite_unrest');
  });

  it('stage 3 not available without spy-networks or sabotage', () => {
    const missions = getAvailableMissions(['espionage-scouting', 'espionage-informants']);
    expect(missions).not.toContain('steal_tech');
  });

  it('cryptography unlocks stage 4 missions', () => {
    const missions = getAvailableMissions(['spy-networks', 'cryptography']);
    expect(missions).toContain('assassinate_advisor');
    expect(missions).toContain('forge_documents');
  });
});

describe('resolveMissionResult — stage 3', () => {
  it('steal_tech returns a tech the target has that you do not', () => {
    const state = /* minimal GameState stub with two civs */ {} as GameState;
    // ... construct minimal state with target civ having 'archery' and current player not having it
    // verify result.stolenTechId === 'archery'
  });

  it('incite_unrest returns unrestInjected: 25', () => {
    // ... minimal state
    // verify result.unrestInjected === 25
  });
});
```

Write concrete test bodies using minimal GameState stubs. Follow the pattern in existing test files (e.g., `tests/systems/determinism.test.ts`).

- [ ] **Step 2: Write spy promotion tests**

Create `tests/systems/spy-promotions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkAndApplyPromotion } from '@/systems/espionage-system';
import type { Spy } from '@/core/types';

describe('spy promotions', () => {
  const baseSpy: Spy = {
    id: 'spy-1', owner: 'player', name: 'Agent Shadow',
    targetCivId: null, targetCityId: null, position: null,
    status: 'idle', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false,
  };

  it('no promotion below XP threshold', () => {
    const spy = { ...baseSpy, experience: 59 };
    const result = checkAndApplyPromotion(spy, 'steal_tech');
    expect(result.promotion).toBeUndefined();
  });

  it('infiltrator promotion for steal_tech mission at 60 XP', () => {
    const spy = { ...baseSpy, experience: 60 };
    const result = checkAndApplyPromotion(spy, 'steal_tech');
    expect(result.promotion).toBe('infiltrator');
  });

  it('handler promotion for incite_unrest mission at 60 XP', () => {
    const spy = { ...baseSpy, experience: 65 };
    const result = checkAndApplyPromotion(spy, 'incite_unrest');
    expect(result.promotion).toBe('handler');
  });

  it('no re-promotion once promoted', () => {
    const spy = { ...baseSpy, experience: 80, promotion: 'infiltrator' as const };
    const result = checkAndApplyPromotion(spy, 'incite_unrest');
    expect(result.promotion).toBe('infiltrator'); // unchanged
  });
});
```

- [ ] **Step 3: Write faction system tests**

Create `tests/systems/faction-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeUnrestPressure, getCityAppeaseCost, getUnrestYieldMultiplier, isCityProductionLocked } from '@/systems/faction-system';
import type { GameState, City } from '@/core/types';

// Build a minimal GameState with one civ, two cities
function makeTestState(): GameState { ... }

describe('computeUnrestPressure', () => {
  it('stable empire of 4 cities has zero pressure', () => {
    const state = makeTestState(); // 4 cities, no wars, no conquest
    const pressure = computeUnrestPressure('city-1', state);
    expect(pressure).toBe(0);
  });

  it('recently conquered city has pressure >= 25', () => {
    const state = makeTestState();
    state.cities['city-1'].conquestTurn = state.turn - 1;
    const pressure = computeUnrestPressure('city-1', state);
    expect(pressure).toBeGreaterThanOrEqual(25);
  });

  it('spyUnrestBonus adds to pressure', () => {
    const state = makeTestState();
    state.cities['city-1'].spyUnrestBonus = 30;
    const pressure = computeUnrestPressure('city-1', state);
    expect(pressure).toBeGreaterThanOrEqual(30);
  });
});

describe('yield multipliers', () => {
  it('stable city has multiplier 1.0', () => {
    const city = { unrestLevel: 0 } as City;
    expect(getUnrestYieldMultiplier(city)).toBe(1.0);
  });

  it('unrest city has multiplier 0.75', () => {
    const city = { unrestLevel: 1 } as City;
    expect(getUnrestYieldMultiplier(city)).toBe(0.75);
  });

  it('revolt city has multiplier 0.5 and production locked', () => {
    const city = { unrestLevel: 2 } as City;
    expect(getUnrestYieldMultiplier(city)).toBe(0.5);
    expect(isCityProductionLocked(city)).toBe(true);
  });
});
```

- [ ] **Step 4: Update civ-definitions.test.ts**

In `tests/systems/civ-definitions.test.ts`, add assertions that the new civs exist and have expected properties:

```typescript
it('spain has wonder_discovery_bonus', () => {
  const def = getCivDefinition('spain');
  expect(def).toBeDefined();
  expect(def?.bonusEffect?.type).toBe('wonder_discovery_bonus');
});
// repeat for viking, prydain, annuvin
```

- [ ] **Step 5: Run all tests**

```
eval "$(mise activate bash)" && yarn test --run && yarn build
```

All tests must pass. All TypeScript errors must be resolved. Build must succeed.

---

## Completion Checklist

Before declaring M4c complete:

- [ ] `yarn test --run` passes (0 failures)
- [ ] `yarn build` succeeds (0 TypeScript errors)
- [ ] Stage 3-4 missions visible in espionage panel when correct techs are researched
- [ ] Spy promotions granted at 60 XP
- [ ] Unrest appears on cities under pressure (⚡ icon rendered)
- [ ] Revolt appears after 5 turns of unrest (🔥 icon, rebels spawned)
- [ ] Revolt cities have halved yields and locked production
- [ ] Garrisoning a unit resolves unrest
- [ ] Spain, Viking, Prydain, Annuvin selectable in civ-select
- [ ] Icon legend opens/closes from HUD button
- [ ] No `Math.random()` calls added
- [ ] No hardcoded `'player'` strings added
- [ ] No `innerHTML` with game-generated strings added
- [ ] Hot seat: espionage panel shows only current player's spies
