# Milestone 3a "Hot Seat" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pass-the-device hot seat multiplayer for up to 8 human players with map size selection, 12 civilizations, and independent fog of war.

**Architecture:** Expand `GameState` with `GameMode` and `HotSeatConfig`. Refactor all hardcoded `'player'` references to use `currentPlayer`. Add turn cycling logic that walks through human players with handoff screens, batches AI turns after the last human, then runs `processTurn()` once per round. Renderer switches fog of war per active player.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, IndexedDB

**Prerequisites:** M2c complete (209 tests, 23 test files). Run `eval "$(mise activate bash)"` before any yarn/node commands.

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `src/core/turn-cycling.ts` | Pure functions: `getNextPlayer`, `getHumanPlayers`, `getAIPlayers`, `isRoundComplete` |
| `src/core/hotseat-events.ts` | Collect and format pending events for handoff summary |
| `src/ui/hotseat-setup.ts` | Game mode selection → map size → player count → sequential civ picks |
| `src/ui/turn-handoff.ts` | Pass-the-device overlay with summary card |
| `tests/core/turn-cycling.test.ts` | Turn cycling logic tests |
| `tests/core/hotseat-events.test.ts` | Event collection tests |
| `tests/systems/civ-definitions.test.ts` | Updated: 12 civs instead of 6 |

### Modified Files
| File | Changes |
|---|---|
| `src/core/types.ts` | Add `GameMode`, `HotSeatConfig`, `HotSeatPlayer`, `GameEvent`, `pendingEvents`; expand `mapSize`; expand `CivBonusEffect`; expand `SaveSlotMeta` |
| `src/systems/civ-definitions.ts` | Add 6 new civilizations (China, Persia, England, Aztec, Japan, India) |
| `src/core/game-state.ts` | Add `createHotSeatGame(config)`, `MAP_DIMENSIONS`; update `createNewGame` for map size |
| `src/core/turn-manager.ts` | Remove hardcoded `'player'` in trade route filtering |
| `src/renderer/render-loop.ts` | Use `currentPlayer` for visibility instead of hardcoded `'player'` |
| `src/ui/civ-select.ts` | Add `disabledCivs`, `headerText` props for sequential picking |
| `src/ui/save-panel.ts` | Separate solo/hot-seat sections; show player names |
| `src/storage/save-manager.ts` | Support `gameMode`/`playerCount`/`playerNames` in metadata |
| `src/main.ts` | Game mode selection, hot seat turn flow, handoff integration, dynamic `currentPlayer` |

---

## Task 1: Types — GameMode, HotSeat, Map Sizes, New Bonus Effects

**Files:** Modify `src/core/types.ts`

- [ ] **Step 1: Add GameMode, HotSeat types, expand mapSize, expand CivBonusEffect, add GameEvent/pendingEvents**

In `src/core/types.ts`, add after the `CombatResult` block and before `Trade & Resources`:

```typescript
// --- Game Modes ---

export type GameMode = 'solo' | 'hotseat';

export interface HotSeatPlayer {
  name: string;
  slotId: string;     // e.g. 'player-1', 'player-2', 'ai-1'
  civType: string;    // e.g. 'egypt', 'rome' — maps to CivDefinition.id
  isHuman: boolean;
}

export interface HotSeatConfig {
  playerCount: number;
  mapSize: 'small' | 'medium' | 'large';
  players: HotSeatPlayer[];
}

export interface GameEvent {
  type: string;
  message: string;
  turn: number;
}
```

Expand `CivBonusEffect` union to add 6 new variants:

```typescript
export type CivBonusEffect =
  | { type: 'faster_wonders'; speedMultiplier: number }
  | { type: 'auto_roads' }
  | { type: 'diplomacy_start_bonus'; bonus: number }
  | { type: 'mounted_movement'; bonus: number }
  | { type: 'free_tech_on_era' }
  | { type: 'faster_military'; speedMultiplier: number }
  | { type: 'extra_tech_speed'; speedMultiplier: number }
  | { type: 'trade_route_bonus'; bonusGold: number }
  | { type: 'naval_bonus'; visionBonus: number }
  | { type: 'combat_production'; productionBonus: number }
  | { type: 'bushido' }
  | { type: 'faster_growth'; foodReduction: number };
```

Update `GameSettings.mapSize`:

```typescript
mapSize: 'small' | 'medium' | 'large';
```

Add to `GameState`:

```typescript
hotSeat?: HotSeatConfig;
pendingEvents?: Record<string, GameEvent[]>;
```

Update `SaveSlotMeta`:

```typescript
export interface SaveSlotMeta {
  id: string;
  name: string;
  civType: string;
  turn: number;
  lastPlayed: string;
  gameMode?: GameMode;
  playerCount?: number;
  playerNames?: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(m3a): add hot seat types, map sizes, and new civ bonus effects"
```

---

## Task 2: Expand Civilization Roster to 12

**Files:**
- Modify: `src/systems/civ-definitions.ts`
- Modify: `tests/systems/civ-definitions.test.ts`

- [ ] **Step 1: Add 6 new civilizations to CIV_DEFINITIONS array**

Append after Zulu in `src/systems/civ-definitions.ts`:

```typescript
  {
    id: 'china',
    name: 'China',
    color: '#d94a7b',
    bonusName: 'Mandate of Heaven',
    bonusDescription: 'Research speed increased by 20%',
    bonusEffect: { type: 'extra_tech_speed', speedMultiplier: 1.2 },
    personality: {
      traits: ['diplomatic', 'trader'],
      warLikelihood: 0.25,
      diplomacyFocus: 0.7,
      expansionDrive: 0.6,
    },
  },
  {
    id: 'persia',
    name: 'Persia',
    color: '#d9c44a',
    bonusName: 'Silk Road',
    bonusDescription: '+3 gold per trade route',
    bonusEffect: { type: 'trade_route_bonus', bonusGold: 3 },
    personality: {
      traits: ['trader', 'expansionist'],
      warLikelihood: 0.3,
      diplomacyFocus: 0.5,
      expansionDrive: 0.8,
    },
  },
  {
    id: 'england',
    name: 'England',
    color: '#4a6ad9',
    bonusName: 'Rule Britannia',
    bonusDescription: '+1 vision for coastal cities, stronger naval units',
    bonusEffect: { type: 'naval_bonus', visionBonus: 1 },
    personality: {
      traits: ['expansionist', 'aggressive'],
      warLikelihood: 0.5,
      diplomacyFocus: 0.4,
      expansionDrive: 0.85,
    },
  },
  {
    id: 'aztec',
    name: 'Aztec',
    color: '#4ad9a0',
    bonusName: 'Flower Wars',
    bonusDescription: 'Combat victories yield +5 production in nearest city',
    bonusEffect: { type: 'combat_production', productionBonus: 5 },
    personality: {
      traits: ['aggressive'],
      warLikelihood: 0.75,
      diplomacyFocus: 0.15,
      expansionDrive: 0.65,
    },
  },
  {
    id: 'japan',
    name: 'Japan',
    color: '#f0f0f0',
    bonusName: 'Bushido',
    bonusDescription: 'Units fight at full strength when below 50% health',
    bonusEffect: { type: 'bushido' },
    personality: {
      traits: ['aggressive', 'diplomatic'],
      warLikelihood: 0.6,
      diplomacyFocus: 0.5,
      expansionDrive: 0.5,
    },
  },
  {
    id: 'india',
    name: 'India',
    color: '#d97a4a',
    bonusName: 'Subcontinent',
    bonusDescription: 'Cities need 15% less food to grow',
    bonusEffect: { type: 'faster_growth', foodReduction: 0.85 },
    personality: {
      traits: ['diplomatic', 'trader'],
      warLikelihood: 0.15,
      diplomacyFocus: 0.8,
      expansionDrive: 0.6,
    },
  },
```

- [ ] **Step 2: Update tests for 12 civs**

In `tests/systems/civ-definitions.test.ts`, change all `6` references to `12` and add tests for new civs:

```typescript
  it('defines exactly 12 civilizations', () => {
    expect(CIV_DEFINITIONS).toHaveLength(12);
  });

  it('each civ has unique id, name, and color', () => {
    const ids = CIV_DEFINITIONS.map(c => c.id);
    const names = CIV_DEFINITIONS.map(c => c.name);
    const colors = CIV_DEFINITIONS.map(c => c.color);
    expect(new Set(ids).size).toBe(12);
    expect(new Set(names).size).toBe(12);
    expect(new Set(colors).size).toBe(12);
  });

  it('china has extra_tech_speed bonus', () => {
    const china = getCivDefinition('china')!;
    expect(china.bonusEffect.type).toBe('extra_tech_speed');
  });

  it('india has faster_growth bonus', () => {
    const india = getCivDefinition('india')!;
    expect(india.bonusEffect.type).toBe('faster_growth');
  });
```

- [ ] **Step 3: Run tests, verify pass**

```bash
eval "$(mise activate bash)" && yarn test
```

- [ ] **Step 4: Commit**

```bash
git add src/systems/civ-definitions.ts tests/systems/civ-definitions.test.ts
git commit -m "feat(m3a): expand civilization roster to 12 with 6 new civs"
```

---

## Task 3: Turn Cycling Logic

**Files:**
- Create: `src/core/turn-cycling.ts`
- Create: `tests/core/turn-cycling.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/turn-cycling.test.ts
import { describe, it, expect } from 'vitest';
import {
  getHumanPlayers,
  getAIPlayers,
  getNextPlayer,
  isRoundComplete,
} from '@/core/turn-cycling';
import type { HotSeatConfig } from '@/core/types';

const config: HotSeatConfig = {
  playerCount: 3,
  mapSize: 'medium',
  players: [
    { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
    { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
    { name: 'AI Rome', slotId: 'ai-1', civType: 'greece', isHuman: false },
  ],
};

describe('turn-cycling', () => {
  describe('getHumanPlayers', () => {
    it('returns only human players in order', () => {
      const humans = getHumanPlayers(config);
      expect(humans).toHaveLength(2);
      expect(humans[0].slotId).toBe('player-1');
      expect(humans[1].slotId).toBe('player-2');
    });
  });

  describe('getAIPlayers', () => {
    it('returns only AI players', () => {
      const ais = getAIPlayers(config);
      expect(ais).toHaveLength(1);
      expect(ais[0].slotId).toBe('ai-1');
    });
  });

  describe('getNextPlayer', () => {
    it('returns next human player', () => {
      expect(getNextPlayer(config, 'player-1')).toBe('player-2');
    });

    it('wraps to first human after last human', () => {
      expect(getNextPlayer(config, 'player-2')).toBe('player-1');
    });

    it('returns first human for unknown current', () => {
      expect(getNextPlayer(config, 'ai-1')).toBe('player-1');
    });
  });

  describe('isRoundComplete', () => {
    it('returns true when last human player ends turn', () => {
      expect(isRoundComplete(config, 'player-2')).toBe(true);
    });

    it('returns false for non-last human player', () => {
      expect(isRoundComplete(config, 'player-1')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
eval "$(mise activate bash)" && yarn test tests/core/turn-cycling.test.ts
```

- [ ] **Step 3: Implement turn-cycling.ts**

```typescript
// src/core/turn-cycling.ts
import type { HotSeatConfig, HotSeatPlayer } from './types';

export function getHumanPlayers(config: HotSeatConfig): HotSeatPlayer[] {
  return config.players.filter(p => p.isHuman);
}

export function getAIPlayers(config: HotSeatConfig): HotSeatPlayer[] {
  return config.players.filter(p => !p.isHuman);
}

export function getNextPlayer(config: HotSeatConfig, currentSlotId: string): string {
  const humans = getHumanPlayers(config);
  const idx = humans.findIndex(p => p.slotId === currentSlotId);
  if (idx === -1 || idx === humans.length - 1) return humans[0].slotId;
  return humans[idx + 1].slotId;
}

export function isRoundComplete(config: HotSeatConfig, currentSlotId: string): boolean {
  const humans = getHumanPlayers(config);
  return humans[humans.length - 1].slotId === currentSlotId;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
eval "$(mise activate bash)" && yarn test tests/core/turn-cycling.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/turn-cycling.ts tests/core/turn-cycling.test.ts
git commit -m "feat(m3a): add turn cycling logic for hot seat player rotation"
```

---

## Task 4: Hot Seat Event Collection

**Files:**
- Create: `src/core/hotseat-events.ts`
- Create: `tests/core/hotseat-events.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/hotseat-events.test.ts
import { describe, it, expect } from 'vitest';
import {
  collectEvent,
  getEventsForPlayer,
  clearEventsForPlayer,
  generateSummary,
} from '@/core/hotseat-events';
import { createNewGame } from '@/core/game-state';
import type { GameEvent } from '@/core/types';

describe('hotseat-events', () => {
  it('collectEvent adds event to pending for a player', () => {
    const pending: Record<string, GameEvent[]> = {};
    collectEvent(pending, 'player-1', { type: 'city:grew', message: 'City grew', turn: 5 });
    expect(pending['player-1']).toHaveLength(1);
  });

  it('getEventsForPlayer returns empty array when no events', () => {
    expect(getEventsForPlayer({}, 'player-1')).toEqual([]);
  });

  it('clearEventsForPlayer removes events for that player only', () => {
    const pending: Record<string, GameEvent[]> = {
      'player-1': [{ type: 'test', message: 'hi', turn: 1 }],
      'player-2': [{ type: 'test', message: 'yo', turn: 1 }],
    };
    clearEventsForPlayer(pending, 'player-1');
    expect(pending['player-1']).toHaveLength(0);
    expect(pending['player-2']).toHaveLength(1);
  });

  it('generateSummary produces summary from game state', () => {
    const state = createNewGame(undefined, 'summary-test');
    const summary = generateSummary(state, 'player');
    expect(summary.turn).toBe(1);
    expect(summary.era).toBe(1);
    expect(typeof summary.gold).toBe('number');
    expect(typeof summary.cities).toBe('number');
    expect(typeof summary.units).toBe('number');
  });
});
```

- [ ] **Step 2: Implement hotseat-events.ts**

```typescript
// src/core/hotseat-events.ts
import type { GameState, GameEvent } from './types';

export function collectEvent(
  pending: Record<string, GameEvent[]>,
  civId: string,
  event: GameEvent,
): void {
  if (!pending[civId]) pending[civId] = [];
  pending[civId].push(event);
}

export function getEventsForPlayer(
  pending: Record<string, GameEvent[]>,
  civId: string,
): GameEvent[] {
  return pending[civId] ?? [];
}

export function clearEventsForPlayer(
  pending: Record<string, GameEvent[]>,
  civId: string,
): void {
  pending[civId] = [];
}

export interface TurnSummary {
  turn: number;
  era: number;
  gold: number;
  cities: number;
  units: number;
  currentResearch: string | null;
  researchProgress: number;
  sciencePerTurn: number;
  atWarWith: string[];
  allies: string[];
  events: GameEvent[];
}

export function generateSummary(
  state: GameState,
  civId: string,
): TurnSummary {
  const civ = state.civilizations[civId];
  const pending = state.pendingEvents ?? {};

  const allies = civ?.diplomacy?.treaties
    .filter(t => t.type === 'alliance')
    .map(t => t.civA === civId ? t.civB : t.civA) ?? [];

  return {
    turn: state.turn,
    era: state.era,
    gold: civ?.gold ?? 0,
    cities: civ?.cities.length ?? 0,
    units: civ?.units.length ?? 0,
    currentResearch: civ?.techState.currentResearch ?? null,
    researchProgress: civ?.techState.researchProgress ?? 0,
    atWarWith: civ?.diplomacy?.atWarWith ?? [],
    allies,
    events: pending[civId] ?? [],
  };
}
```

- [ ] **Step 3: Run tests, verify pass**

```bash
eval "$(mise activate bash)" && yarn test tests/core/hotseat-events.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/core/hotseat-events.ts tests/core/hotseat-events.test.ts
git commit -m "feat(m3a): add hot seat event collection and turn summary generation"
```

---

## Task 5: Map Size Support & createHotSeatGame

**Files:**
- Modify: `src/core/game-state.ts`
- Modify: `tests/core/game-state.test.ts`

- [ ] **Step 1: Add MAP_DIMENSIONS and createHotSeatGame**

In `src/core/game-state.ts`, add:

```typescript
import type { GameState, Civilization, Unit, HotSeatConfig } from './types';

export const MAP_DIMENSIONS = {
  small: { width: 30, height: 30, maxPlayers: 3 },
  medium: { width: 50, height: 50, maxPlayers: 5 },
  large: { width: 80, height: 80, maxPlayers: 8 },
} as const;
```

Update `createNewGame` to accept map size:

```typescript
export function createNewGame(civType?: string, seed?: string, mapSize?: 'small' | 'medium' | 'large'): GameState {
  const gameSeed = seed ?? `game-${Date.now()}`;
  const dims = MAP_DIMENSIONS[mapSize ?? 'small'];
  const map = generateMap(dims.width, dims.height, gameSeed);
  // ... rest stays the same but use mapSize in settings
```

Add `createHotSeatGame`:

```typescript
export function createHotSeatGame(config: HotSeatConfig, seed?: string): GameState {
  const gameSeed = seed ?? `hotseat-${Date.now()}`;
  const dims = MAP_DIMENSIONS[config.mapSize];
  const map = generateMap(dims.width, dims.height, gameSeed);
  const startPositions = findStartPositions(map, config.players.length);
  const allSlotIds = config.players.map(p => p.slotId);

  const civilizations: Record<string, Civilization> = {};
  const units: Record<string, Unit> = {};

  for (let i = 0; i < config.players.length; i++) {
    const player = config.players[i];
    const civDef = getCivDefinition(player.civType);
    const startBonus = civDef?.bonusEffect.type === 'diplomacy_start_bonus'
      ? (civDef.bonusEffect as { type: 'diplomacy_start_bonus'; bonus: number }).bonus
      : 0;

    const civ: Civilization = {
      id: player.slotId,
      name: player.isHuman ? player.name : (civDef?.name ?? player.name),
      color: civDef?.color ?? '#888888',
      isHuman: player.isHuman,
      civType: player.civType,
      cities: [],
      units: [],
      techState: createTechState(),
      gold: 0,
      visibility: createVisibilityMap(),
      score: 0,
      diplomacy: createDiplomacyState(allSlotIds, player.slotId, startBonus),
    };

    const settler = createUnit('settler', player.slotId, startPositions[i]);
    const warrior = createUnit('warrior', player.slotId, startPositions[i]);
    units[settler.id] = settler;
    units[warrior.id] = warrior;
    civ.units = [settler.id, warrior.id];
    updateVisibility(civ.visibility, [settler, warrior], map);
    civilizations[player.slotId] = civ;
  }

  const barbarianCamps: Record<string, any> = {};
  const campCount = config.mapSize === 'large' ? 8 : config.mapSize === 'medium' ? 5 : 3;
  for (let i = 0; i < campCount; i++) {
    const camp = spawnBarbarianCamp(map, startPositions, Object.values(barbarianCamps));
    if (camp) barbarianCamps[camp.id] = camp;
  }

  return {
    turn: 1, era: 1, civilizations, map, units, cities: {}, barbarianCamps,
    marketplace: createMarketplaceState(),
    tutorial: { active: false, currentStep: 'welcome', completedSteps: [] },
    currentPlayer: config.players[0].slotId,
    gameOver: false, winner: null,
    hotSeat: config, pendingEvents: {},
    settings: {
      mapSize: config.mapSize, soundEnabled: true, musicEnabled: true,
      musicVolume: 0.5, sfxVolume: 0.7, tutorialEnabled: false,
      advisorsEnabled: { builder: true, explorer: true, chancellor: true, warchief: true },
    },
  };
}
```

Tutorial is disabled for hot seat. Barbarian camps scale with map size (3/5/8).

- [ ] **Step 2: Add tests**

```typescript
  it('createNewGame accepts mapSize parameter', () => {
    const state = createNewGame(undefined, 'test-seed', 'medium');
    expect(state.map.width).toBe(50);
    expect(state.map.height).toBe(50);
    expect(state.settings.mapSize).toBe('medium');
  });

  it('createHotSeatGame creates correct number of civs', () => {
    const config: HotSeatConfig = {
      playerCount: 3,
      mapSize: 'medium',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
        { name: 'AI Greece', slotId: 'ai-1', civType: 'greece', isHuman: false },
      ],
    };
    const state = createHotSeatGame(config, 'hs-test');
    expect(Object.keys(state.civilizations)).toHaveLength(3);
    expect(state.hotSeat).toBeDefined();
    expect(state.hotSeat!.playerCount).toBe(3);
    expect(state.currentPlayer).toBe('player-1');
    expect(state.civilizations['player-1'].civType).toBe('egypt');
    expect(state.civilizations['ai-1'].isHuman).toBe(false);
    expect(state.map.width).toBe(50); // medium map
  });
```

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```bash
git add src/core/game-state.ts tests/core/game-state.test.ts
git commit -m "feat(m3a): add map size support and createHotSeatGame"
```

---

## Task 6: Refactor Hardcoded 'player' References

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Fix turn-manager.ts trade route filtering**

In `src/core/turn-manager.ts`, replace the hardcoded `owner === 'player'` trade route block (lines ~110-116) to iterate all civs:

```typescript
  // --- Process marketplace ---
  if (newState.marketplace) {
    // Trade route income for each civ
    for (const [civId, civ] of Object.entries(newState.civilizations)) {
      const civRouteIncome = processTradeRouteIncome(
        newState.marketplace.tradeRoutes.filter(r => {
          const city = newState.cities[r.fromCityId];
          return city?.owner === civId;
        }),
      );
      newState.civilizations[civId].gold += civRouteIncome;
    }
    // ... fashion and price update stay the same
  }
```

- [ ] **Step 2: Fix render-loop.ts visibility**

In `src/renderer/render-loop.ts`, replace:

```typescript
    const playerVis = this.state.civilizations.player?.visibility;
```

with:

```typescript
    const currentCiv = this.state.civilizations[this.state.currentPlayer];
    const playerVis = currentCiv?.visibility;
```

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```bash
git add src/core/turn-manager.ts src/renderer/render-loop.ts
git commit -m "refactor(m3a): replace hardcoded 'player' with currentPlayer in turn manager and renderer"
```

---

## Task 7: Turn Handoff UI

**Files:**
- Create: `src/ui/turn-handoff.ts`

- [ ] **Step 1: Create handoff screen with two phases**

```typescript
// src/ui/turn-handoff.ts
import type { GameState } from '@/core/types';
import { generateSummary, clearEventsForPlayer } from '@/core/hotseat-events';
import { getCivDefinition } from '@/systems/civ-definitions';

interface HandoffCallbacks {
  onReady: () => void;
}

export function showTurnHandoff(
  container: HTMLElement,
  state: GameState,
  nextCivId: string,
  playerName: string,
  callbacks: HandoffCallbacks,
): void {
  const existing = document.getElementById('turn-handoff');
  if (existing) existing.remove();

  const civ = state.civilizations[nextCivId];
  const civDef = getCivDefinition(civ?.civType ?? '');
  const color = civ?.color ?? civDef?.color ?? '#e8c170';

  const overlay = document.createElement('div');
  overlay.id = 'turn-handoff';
  overlay.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,30,0.98);z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;`;

  // Phase 1: Pass the device
  overlay.innerHTML = `
    <div style="text-align:center;">
      <div style="width:60px;height:60px;border-radius:50%;background:${color};margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:24px;">👤</div>
      <h2 style="font-size:20px;margin:0 0 8px;color:#e8c170;">Pass to</h2>
      <h1 style="font-size:28px;margin:0 0 24px;color:${color};">${playerName}</h1>
      <button id="handoff-confirm" style="padding:14px 32px;border-radius:10px;background:${color};border:none;color:#1a1a2e;font-weight:bold;font-size:16px;cursor:pointer;">I'm ${playerName}</button>
    </div>
  `;

  container.appendChild(overlay);

  document.getElementById('handoff-confirm')?.addEventListener('click', () => {
    // Phase 2: Summary card
    const summary = generateSummary(state, nextCivId);

    const warList = summary.atWarWith.length > 0
      ? summary.atWarWith.map(id => state.civilizations[id]?.name ?? id).join(', ')
      : 'None';
    const allyList = summary.allies.length > 0
      ? summary.allies.map(id => state.civilizations[id]?.name ?? id).join(', ')
      : 'None';
    const eventHtml = summary.events.length > 0
      ? summary.events.map(e => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);">• ${e.message}</div>`).join('')
      : '<div style="font-size:12px;opacity:0.5;">Nothing notable happened.</div>';

    overlay.innerHTML = `
      <div style="max-width:360px;width:100%;text-align:center;">
        <h2 style="font-size:18px;color:${color};margin:0 0 4px;">${playerName}</h2>
        <div style="font-size:13px;opacity:0.6;margin-bottom:16px;">Turn ${summary.turn} · Era ${summary.era}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">💰</div><div style="font-size:14px;">${summary.gold}</div><div style="font-size:10px;opacity:0.5;">Gold</div></div>
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">🏛️</div><div style="font-size:14px;">${summary.cities}</div><div style="font-size:10px;opacity:0.5;">Cities</div></div>
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">⚔️</div><div style="font-size:14px;">${summary.units}</div><div style="font-size:10px;opacity:0.5;">Units</div></div>
          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px;"><div style="font-size:18px;">🔬</div><div style="font-size:14px;">${summary.currentResearch ?? 'None'}</div><div style="font-size:10px;opacity:0.5;">Research</div></div>
        </div>
        <div style="text-align:left;margin-bottom:12px;">
          <div style="font-size:12px;margin-bottom:4px;">⚔️ At war: ${warList}</div>
          <div style="font-size:12px;">🤝 Allies: ${allyList}</div>
        </div>
        <div style="text-align:left;background:rgba(255,255,255,0.04);border-radius:8px;padding:10px;margin-bottom:16px;">
          <div style="font-size:13px;color:#e8c170;margin-bottom:6px;">Since your last turn:</div>
          ${eventHtml}
        </div>
        <button id="handoff-start" style="padding:14px 32px;border-radius:10px;background:${color};border:none;color:#1a1a2e;font-weight:bold;font-size:16px;cursor:pointer;">Start Turn</button>
      </div>
    `;

    // Clear pending events for this player
    if (state.pendingEvents) {
      clearEventsForPlayer(state.pendingEvents, nextCivId);
    }

    document.getElementById('handoff-start')?.addEventListener('click', () => {
      overlay.remove();
      callbacks.onReady();
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/turn-handoff.ts
git commit -m "feat(m3a): add turn handoff overlay with summary card"
```

---

## Task 8: Hot Seat Setup UI

**Files:**
- Create: `src/ui/hotseat-setup.ts`
- Modify: `src/ui/civ-select.ts` (add disabledCivs support)

- [ ] **Step 1: Update civ-select.ts to support disabledCivs and custom header**

Add optional params to `createCivSelectPanel`:

```typescript
export interface CivSelectCallbacks {
  onSelect: (civId: string) => void;
}

export interface CivSelectOptions {
  disabledCivs?: string[];
  headerText?: string;
}

export function createCivSelectPanel(
  container: HTMLElement,
  callbacks: CivSelectCallbacks,
  options?: CivSelectOptions,
): HTMLElement {
```

Grey out disabled civs and filter them from random selection.

- [ ] **Step 2: Create hotseat-setup.ts**

Setup wizard with three stages:
1. Map size picker (Small/Medium/Large cards showing max players)
2. Player count picker (2 to max for chosen size)
3. Sequential civ selection with handoff between players

```typescript
// src/ui/hotseat-setup.ts
import type { HotSeatConfig, HotSeatPlayer } from '@/core/types';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { createCivSelectPanel } from './civ-select';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';

interface HotSeatSetupCallbacks {
  onComplete: (config: HotSeatConfig) => void;
  onCancel: () => void;
}

export function showHotSeatSetup(
  container: HTMLElement,
  callbacks: HotSeatSetupCallbacks,
): void {
  // Stage 1: Map size selection
  // Stage 2: Player count + names
  // Stage 3: Sequential civ picks with handoff screens
  // Calls callbacks.onComplete with finished HotSeatConfig
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/civ-select.ts src/ui/hotseat-setup.ts
git commit -m "feat(m3a): add hot seat setup wizard with sequential civ selection"
```

---

## Task 9: Save System Updates

**Files:**
- Modify: `src/storage/save-manager.ts`
- Modify: `src/ui/save-panel.ts`

- [ ] **Step 1: Update save-manager to include gameMode in metadata**

In `saveGame`, populate `gameMode`, `playerCount`, `playerNames` from `state.hotSeat`:

```typescript
export async function saveGame(slotId: string, name: string, state: GameState): Promise<void> {
  const meta: SaveSlotMeta = {
    id: slotId,
    name,
    civType: state.hotSeat ? 'hotseat' : (state.civilizations[state.currentPlayer]?.civType ?? 'generic'),
    turn: state.turn,
    lastPlayed: new Date().toISOString(),
    gameMode: state.hotSeat ? 'hotseat' : 'solo',
    playerCount: state.hotSeat?.playerCount,
    playerNames: state.hotSeat?.players.filter(p => p.isHuman).map(p => p.name),
  };
  // ...
}
```

- [ ] **Step 2: Update save-panel to show two sections**

Add solo/hot-seat grouping in `createSavePanel`. Hot seat saves show player names.

- [ ] **Step 3: Commit**

```bash
git add src/storage/save-manager.ts src/ui/save-panel.ts
git commit -m "feat(m3a): update save system for hot seat game mode metadata"
```

---

## Task 10: Main.ts Integration

**Files:**
- Modify: `src/main.ts`

This is the largest task. Changes needed:

- [ ] **Step 1: Add game mode selection to init flow**

After "New Game" in save panel, show mode selection (Solo / Hot Seat) instead of going directly to civ select. Solo keeps existing flow. Hot Seat launches `showHotSeatSetup`.

- [ ] **Step 2: Refactor endTurn for hot seat**

Replace single `endTurn` with logic that checks `gameState.hotSeat`:
- If hot seat and not round complete: auto-save, show handoff, advance `currentPlayer`
- If hot seat and round complete: iterate ALL AI civs via `getAIPlayers(hotSeat)` and call `processAITurn(gameState, aiSlotId, bus)` for each. Then run `processTurn()` once. Auto-save. Show handoff for player-1.
- If solo: keep existing flow (single `processAITurn(gameState, 'ai-1', bus)` call)
- **CRITICAL**: Current code hardcodes `processAITurn(gameState, 'ai-1', bus)`. For hot seat, this must loop: `for (const ai of getAIPlayers(hotSeat)) { gameState = processAITurn(gameState, ai.slotId, bus); }`
- Improvement tick (build timers) should run once per round (after all players), not per player turn

- [ ] **Step 3: Update all hardcoded 'player' references in main.ts**

Replace `gameState.civilizations.player` with `gameState.civilizations[gameState.currentPlayer]` throughout:
- `updateHUD` — show current player's name, gold, research
- `handleDiplomaticAction` — use `currentPlayer` instead of `'player'`
- `selectUnit` — only select units owned by `currentPlayer`
- `foundCityAction` — found city for `currentPlayer`
- `handleHexTap` — check unit ownership against `currentPlayer`
- Event listeners — check against `currentPlayer`
- `startGame` — center on `currentPlayer`'s units
- `migrateLegacySave` — add `hotSeat` migration (no-op for solo)

- [ ] **Step 4: Add handoff integration**

Import `showTurnHandoff` and wire it into the turn end flow. After handoff completes, center camera on next player's units and update HUD.

- [ ] **Step 5: Run full test suite and build**

```bash
eval "$(mise activate bash)" && yarn test && yarn build
```

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(m3a): integrate hot seat multiplayer into main game loop"
```

---

## Task 11: Final Integration Test & Push

- [ ] **Step 1: Run full test suite**

```bash
eval "$(mise activate bash)" && yarn test
```

Expected: All tests pass (existing 209 + new tests for turn cycling, events, civs, game state).

- [ ] **Step 2: Run production build**

```bash
eval "$(mise activate bash)" && yarn build
```

Expected: Clean build, no type errors.

- [ ] **Step 3: Push to remote**

```bash
git push
```
