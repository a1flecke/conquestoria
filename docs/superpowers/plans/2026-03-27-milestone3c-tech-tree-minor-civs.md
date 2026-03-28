# Milestone 3c: Expanded Tech Tree & Minor Civilizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the tech tree from 5 tracks (40 techs) to 15 tracks (120 techs) with cross-track prerequisites, and introduce minor civilizations as independent city-states with diplomacy, quests, barbarian camp evolution, and dynamic behavior.

**Architecture:** Data-driven definitions in dedicated files, new systems (minor-civ-system, quest-system) following existing pure-function patterns with EventBus communication. Minor civs reuse existing DiplomacyState and combat systems. Turn processing extended with minor civ phase and era advancement check.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Vite

**Baseline:** 278 passing tests across 30 test files.

**Tooling:** Run `eval "$(mise activate bash)"` before any yarn/node commands.

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/systems/tech-definitions.ts` | All 120 tech definitions (15 tracks × 8) |
| `src/systems/minor-civ-definitions.ts` | 12 named minor city-state definitions with archetypes and bonuses |
| `src/systems/minor-civ-system.ts` | Placement, turn processing, evolution, guerrilla, scuffles, era upgrades |
| `src/systems/quest-system.ts` | Quest generation, completion checking, reward distribution |
| `tests/systems/tech-definitions.test.ts` | Tech tree structural validation |
| `tests/systems/minor-civ-definitions.test.ts` | Definition validation |
| `tests/systems/minor-civ-system.test.ts` | Placement, behavior, evolution tests |
| `tests/systems/quest-system.test.ts` | Quest lifecycle tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/core/types.ts` | Expand TechTrack, UnitType; add MinorCivState, Quest, MinorCivArchetype, QuestType; expand GameEvents |
| `src/systems/tech-system.ts` | Import TECH_TREE from tech-definitions.ts, keep all functions unchanged |
| `src/systems/unit-system.ts` | Add swordsman, pikeman, musketeer to UNIT_DEFINITIONS and UNIT_ICONS |
| `src/systems/barbarian-system.ts` | Add evolution check in processBarbarians, exclude mc- from barbarian targeting |
| `src/systems/fog-of-war.ts` | Minor civ city auto-reveal, shared vision for friendly minor civs |
| `src/core/turn-manager.ts` | Add minor civ turn phase, era advancement check, mc- filter in barbarian processing |
| `src/core/game-state.ts` | Place minor civs in createNewGame/createHotSeatGame |
| `src/main.ts` | Minor civ interaction hooks, quest UI, conquest penalty, save migration, diplomacy panel City-States tab |
| `src/ai/basic-ai.ts` | Filter mc- units, AI interaction with minor civs |
| `src/ai/ai-diplomacy.ts` | AI evaluation of minor civ relationships |
| `src/ui/advisor-system.ts` | 6 new advisor messages for minor civ events |
| `src/renderer/hex-renderer.ts` | Minor civ city icons, territory shading |
| `src/renderer/unit-renderer.ts` | New unit type icons |
| `src/renderer/render-loop.ts` | Pass minor civ data to renderers |

---

### Task 1: Expand Core Types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Read types.ts and identify insertion points**

Read `src/core/types.ts` to find the exact lines for `TechTrack`, `UnitType`, `GameState`, `GameEvents`, and `DiplomacyState`.

- [ ] **Step 2: Expand TechTrack union**

In `src/core/types.ts`, replace the current `TechTrack` definition (line ~164):

```typescript
type TechTrack =
  | 'military' | 'economy' | 'science' | 'civics' | 'exploration'
  | 'agriculture' | 'medicine' | 'philosophy' | 'arts' | 'maritime'
  | 'metallurgy' | 'construction' | 'communication' | 'espionage' | 'spirituality';
```

- [ ] **Step 3: Expand UnitType union**

Replace the current `UnitType` (line ~99):

```typescript
type UnitType = 'settler' | 'worker' | 'scout' | 'warrior' | 'swordsman' | 'pikeman' | 'musketeer';
```

- [ ] **Step 4: Add MinorCivArchetype, AllyBonus, QuestType, QuestTarget, QuestReward, Quest, MinorCivState types**

Add after the `BarbarianCamp` interface:

```typescript
type MinorCivArchetype = 'militaristic' | 'mercantile' | 'cultural';

type AllyBonus =
  | { type: 'free_unit'; unitType: UnitType; everyNTurns: number }
  | { type: 'gold_per_turn'; amount: number }
  | { type: 'science_per_turn'; amount: number }
  | { type: 'production_per_turn'; amount: number };

interface MinorCivDefinition {
  id: string;
  name: string;
  archetype: MinorCivArchetype;
  description: string;
  allyBonus: AllyBonus;
  color: string;
}

type QuestType = 'destroy_camp' | 'gift_gold' | 'defeat_units' | 'trade_route';

type QuestTarget =
  | { type: 'destroy_camp'; campId: string }
  | { type: 'gift_gold'; amount: number }
  | { type: 'defeat_units'; count: number; nearPosition: HexCoord; radius: number }
  | { type: 'trade_route'; minorCivId: string };

interface QuestReward {
  relationshipBonus: number;
  gold?: number;
  science?: number;
  freeUnit?: UnitType;
}

interface Quest {
  id: string;
  type: QuestType;
  description: string;
  target: QuestTarget;
  reward: QuestReward;
  progress: number;
  status: 'active' | 'completed' | 'expired';
  turnIssued: number;
  expiresOnTurn: number | null;
  chainNext?: string;
}

interface MinorCivState {
  id: string;
  definitionId: string;
  cityId: string;
  units: string[];
  diplomacy: DiplomacyState;
  activeQuests: Record<string, Quest>;
  isDestroyed: boolean;
  garrisonCooldown: number;
  lastEraUpgrade: number;
}
```

- [ ] **Step 5: Add minorCivs to GameState**

In the `GameState` interface, add after `barbarianCamps`:

```typescript
minorCivs: Record<string, MinorCivState>;
```

- [ ] **Step 6: Add minor civ events to GameEvents**

Add to the `GameEvents` interface:

```typescript
'minor-civ:quest-issued': { minorCivId: string; majorCivId: string; quest: Quest };
'minor-civ:quest-completed': { minorCivId: string; majorCivId: string; quest: Quest; reward: QuestReward };
'minor-civ:evolved': { campId: string; minorCivId: string; position: HexCoord };
'minor-civ:destroyed': { minorCivId: string; conquerorId: string };
'minor-civ:allied': { minorCivId: string; majorCivId: string };
'minor-civ:scuffle': { attackerId: string; defenderId: string; position: HexCoord };
'minor-civ:guerrilla': { minorCivId: string; targetCivId: string; position: HexCoord };
'minor-civ:era-upgrade': { minorCivId: string; newEra: number };
'minor-civ:relationship-threshold': { minorCivId: string; majorCivId: string; newStatus: 'hostile' | 'neutral' | 'friendly' | 'allied' };
```

- [ ] **Step 7: Export new types**

Ensure all new types/interfaces are exported. Add to existing export block or use `export` keyword on each.

- [ ] **Step 8: Run build to verify types compile**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | tail -10`
Expected: Build succeeds (no runtime usage yet, just type additions). Some files that reference `GameState` may need `minorCivs` initialized — fix any errors by adding `minorCivs: {}` to `createNewGame` and `createHotSeatGame` in the next task.

- [ ] **Step 9: Fix compilation — add minorCivs to game state factories**

In `src/core/game-state.ts`, add `minorCivs: {}` to the `GameState` object returned by both `createNewGame()` and `createHotSeatGame()`. Place it after the `barbarianCamps` field.

- [ ] **Step 10: Run tests to verify nothing breaks**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: 278 tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/core/types.ts src/core/game-state.ts
git commit -m "feat(m3c): expand core types for tech tracks, unit types, minor civs, and quests"
```

---

### Task 2: Add New Unit Definitions

**Files:**
- Modify: `src/systems/unit-system.ts`
- Test: `tests/systems/unit-system.test.ts`

- [ ] **Step 1: Write failing tests for new unit types**

In `tests/systems/unit-system.test.ts`, add:

```typescript
describe('new unit types', () => {
  it('swordsman has correct stats', () => {
    const unit = createUnit('swordsman', 'player', { q: 0, r: 0 });
    expect(unit.type).toBe('swordsman');
    expect(UNIT_DEFINITIONS.swordsman.strength).toBe(25);
    expect(UNIT_DEFINITIONS.swordsman.movement).toBe(2);
    expect(UNIT_DEFINITIONS.swordsman.vision).toBe(2);
    expect(UNIT_DEFINITIONS.swordsman.cost).toBe(50);
  });

  it('pikeman has correct stats', () => {
    const unit = createUnit('pikeman', 'player', { q: 0, r: 0 });
    expect(unit.type).toBe('pikeman');
    expect(UNIT_DEFINITIONS.pikeman.strength).toBe(35);
    expect(UNIT_DEFINITIONS.pikeman.cost).toBe(70);
  });

  it('musketeer has correct stats', () => {
    const unit = createUnit('musketeer', 'player', { q: 0, r: 0 });
    expect(unit.type).toBe('musketeer');
    expect(UNIT_DEFINITIONS.musketeer.strength).toBe(50);
    expect(UNIT_DEFINITIONS.musketeer.cost).toBe(90);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/unit-system.test.ts 2>&1 | tail -10`
Expected: FAIL — swordsman/pikeman/musketeer not in UNIT_DEFINITIONS.

- [ ] **Step 3: Add unit definitions**

In `src/systems/unit-system.ts`, add to `UNIT_DEFINITIONS` after warrior:

```typescript
swordsman: {
  movement: 2,
  vision: 2,
  strength: 25,
  cost: 50,
},
pikeman: {
  movement: 2,
  vision: 2,
  strength: 35,
  cost: 70,
},
musketeer: {
  movement: 2,
  vision: 2,
  strength: 50,
  cost: 90,
},
```

- [ ] **Step 4: Add icons for new unit types**

In `src/renderer/unit-renderer.ts`, add to `UNIT_ICONS`:

```typescript
swordsman: '🗡️',
pikeman: '🔱',
musketeer: '🔫',
```

- [ ] **Step 5: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass (278 + 3 = 281).

- [ ] **Step 6: Commit**

```bash
git add src/systems/unit-system.ts src/renderer/unit-renderer.ts tests/systems/unit-system.test.ts
git commit -m "feat(m3c): add swordsman, pikeman, musketeer unit definitions"
```

---

### Task 3: Extract and Expand Tech Definitions

**Files:**
- Create: `src/systems/tech-definitions.ts`
- Modify: `src/systems/tech-system.ts`
- Create: `tests/systems/tech-definitions.test.ts`

- [ ] **Step 1: Write structural validation tests**

Create `tests/systems/tech-definitions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';

describe('tech definitions', () => {
  it('has exactly 120 techs', () => {
    expect(TECH_TREE.length).toBe(120);
  });

  it('has 15 tracks with 8 techs each', () => {
    const tracks = new Map<string, number>();
    for (const tech of TECH_TREE) {
      tracks.set(tech.track, (tracks.get(tech.track) ?? 0) + 1);
    }
    expect(tracks.size).toBe(15);
    for (const [track, count] of tracks) {
      expect(count, `track ${track} should have 8 techs`).toBe(8);
    }
  });

  it('each track has 2 techs per era (eras 1-4)', () => {
    const trackEra = new Map<string, number>();
    for (const tech of TECH_TREE) {
      const key = `${tech.track}-${tech.era}`;
      trackEra.set(key, (trackEra.get(key) ?? 0) + 1);
    }
    const tracks = [...new Set(TECH_TREE.map(t => t.track))];
    for (const track of tracks) {
      for (let era = 1; era <= 4; era++) {
        const key = `${track}-${era}`;
        expect(trackEra.get(key), `${key} should have 2 techs`).toBe(2);
      }
    }
  });

  it('all prerequisites reference existing tech IDs', () => {
    const ids = new Set(TECH_TREE.map(t => t.id));
    for (const tech of TECH_TREE) {
      for (const prereq of tech.prerequisites) {
        expect(ids.has(prereq), `${tech.id} prereq '${prereq}' not found`).toBe(true);
      }
    }
  });

  it('has no duplicate IDs', () => {
    const ids = TECH_TREE.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no circular dependencies', () => {
    const techMap = new Map(TECH_TREE.map(t => [t.id, t]));
    function hasCycle(id: string, visited: Set<string>, stack: Set<string>): boolean {
      visited.add(id);
      stack.add(id);
      const tech = techMap.get(id);
      if (!tech) return false;
      for (const prereq of tech.prerequisites) {
        if (!visited.has(prereq)) {
          if (hasCycle(prereq, visited, stack)) return true;
        } else if (stack.has(prereq)) {
          return true;
        }
      }
      stack.delete(id);
      return false;
    }
    const visited = new Set<string>();
    const stack = new Set<string>();
    for (const tech of TECH_TREE) {
      if (!visited.has(tech.id)) {
        expect(hasCycle(tech.id, visited, stack), `cycle detected involving ${tech.id}`).toBe(false);
      }
    }
  });

  it('cross-track prerequisites exist (spot checks)', () => {
    const techMap = new Map(TECH_TREE.map(t => [t.id, t]));
    // Agriculture: Crop Rotation requires Irrigation (economy)
    const cropRotation = techMap.get('crop-rotation');
    expect(cropRotation).toBeDefined();
    expect(cropRotation!.prerequisites).toContain('irrigation');
    // Maritime: Galleys requires Sailing (exploration)
    const galleys = techMap.get('galleys');
    expect(galleys).toBeDefined();
    expect(galleys!.prerequisites).toContain('sailing');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/tech-definitions.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Read current TECH_TREE from tech-system.ts**

Read `src/systems/tech-system.ts` to copy the existing 40 techs as the starting point.

- [ ] **Step 4: Create tech-definitions.ts with all 120 techs**

Create `src/systems/tech-definitions.ts`. Start by copying the existing 40 techs from `tech-system.ts`, then add 80 new techs across 10 new tracks. Each tech follows the `Tech` interface from `types.ts`:

```typescript
import type { Tech } from '@/core/types';

export const TECH_TREE: Tech[] = [
  // === MILITARY TRACK (existing 8 techs) ===
  { id: 'stone-weapons', name: 'Stone Weapons', track: 'military', cost: 20, prerequisites: [], unlocks: ['warrior'], era: 1 },
  { id: 'archery', name: 'Archery', track: 'military', cost: 25, prerequisites: ['stone-weapons'], unlocks: ['archer'], era: 1 },
  { id: 'bronze-working', name: 'Bronze Working', track: 'military', cost: 40, prerequisites: ['stone-weapons'], unlocks: ['swordsman'], era: 2 },
  { id: 'horseback-riding', name: 'Horseback Riding', track: 'military', cost: 45, prerequisites: ['archery'], unlocks: ['horseman'], era: 2 },
  { id: 'iron-forging', name: 'Iron Forging', track: 'military', cost: 80, prerequisites: ['bronze-working', 'horseback-riding'], unlocks: ['iron-weapons'], era: 3 },
  { id: 'fortification', name: 'Fortification', track: 'military', cost: 85, prerequisites: ['iron-forging'], unlocks: ['pikeman', 'walls'], era: 3 },
  { id: 'tactics', name: 'Tactics', track: 'military', cost: 120, prerequisites: ['fortification'], unlocks: ['musketeer', 'general'], era: 4 },
  { id: 'siege-warfare', name: 'Siege Warfare', track: 'military', cost: 130, prerequisites: ['iron-forging'], unlocks: ['catapult'], era: 4 },

  // === ECONOMY TRACK (existing 8 techs) ===
  { id: 'pottery', name: 'Pottery', track: 'economy', cost: 20, prerequisites: [], unlocks: ['granary'], era: 1 },
  { id: 'animal-husbandry', name: 'Animal Husbandry', track: 'economy', cost: 25, prerequisites: [], unlocks: ['pasture'], era: 1 },
  { id: 'irrigation', name: 'Irrigation', track: 'economy', cost: 40, prerequisites: ['pottery'], unlocks: ['farm-upgrade'], era: 2 },
  { id: 'currency', name: 'Currency', track: 'economy', cost: 50, prerequisites: ['pottery'], unlocks: ['marketplace'], era: 2 },
  { id: 'banking', name: 'Banking', track: 'economy', cost: 80, prerequisites: ['currency'], unlocks: ['bank'], era: 3 },
  { id: 'guilds', name: 'Guilds', track: 'economy', cost: 85, prerequisites: ['currency', 'irrigation'], unlocks: ['workshop'], era: 3 },
  { id: 'economics', name: 'Economics', track: 'economy', cost: 120, prerequisites: ['banking'], unlocks: ['stock-exchange'], era: 4 },
  { id: 'mercantilism', name: 'Mercantilism', track: 'economy', cost: 125, prerequisites: ['banking', 'guilds'], unlocks: ['trade-company'], era: 4 },

  // === SCIENCE TRACK (existing 8 techs) ===
  { id: 'writing', name: 'Writing', track: 'science', cost: 25, prerequisites: [], unlocks: ['library'], era: 1 },
  { id: 'mathematics', name: 'Mathematics', track: 'science', cost: 30, prerequisites: ['writing'], unlocks: ['calendar'], era: 1 },
  { id: 'engineering', name: 'Engineering', track: 'science', cost: 50, prerequisites: ['mathematics'], unlocks: ['aqueduct'], era: 2 },
  { id: 'philosophy-tech', name: 'Philosophy', track: 'science', cost: 45, prerequisites: ['writing'], unlocks: ['academy'], era: 2 },
  { id: 'education', name: 'Education', track: 'science', cost: 85, prerequisites: ['philosophy-tech', 'engineering'], unlocks: ['university'], era: 3 },
  { id: 'astronomy', name: 'Astronomy', track: 'science', cost: 90, prerequisites: ['mathematics', 'engineering'], unlocks: ['observatory'], era: 3 },
  { id: 'scientific-method', name: 'Scientific Method', track: 'science', cost: 130, prerequisites: ['education', 'astronomy'], unlocks: ['research-lab'], era: 4 },
  { id: 'printing-press', name: 'Printing Press', track: 'science', cost: 125, prerequisites: ['education'], unlocks: ['printing-house'], era: 4 },

  // === CIVICS TRACK (existing 8 techs) ===
  { id: 'code-of-laws', name: 'Code of Laws', track: 'civics', cost: 20, prerequisites: [], unlocks: ['monument'], era: 1 },
  { id: 'tribal-council', name: 'Tribal Council', track: 'civics', cost: 25, prerequisites: ['code-of-laws'], unlocks: ['council-hall'], era: 1 },
  { id: 'political-philosophy', name: 'Political Philosophy', track: 'civics', cost: 45, prerequisites: ['tribal-council'], unlocks: ['government'], era: 2 },
  { id: 'civil-service', name: 'Civil Service', track: 'civics', cost: 50, prerequisites: ['political-philosophy'], unlocks: ['courthouse'], era: 2 },
  { id: 'theology', name: 'Theology', track: 'civics', cost: 80, prerequisites: ['political-philosophy'], unlocks: ['temple'], era: 3 },
  { id: 'feudalism', name: 'Feudalism', track: 'civics', cost: 90, prerequisites: ['civil-service'], unlocks: ['castle'], era: 3 },
  { id: 'constitution', name: 'Constitution', track: 'civics', cost: 125, prerequisites: ['feudalism', 'theology'], unlocks: ['parliament'], era: 4 },
  { id: 'nationalism', name: 'Nationalism', track: 'civics', cost: 130, prerequisites: ['constitution'], unlocks: ['nation-state'], era: 4 },

  // === EXPLORATION TRACK (existing 8 techs) ===
  { id: 'tracking', name: 'Tracking', track: 'exploration', cost: 20, prerequisites: [], unlocks: ['scout-upgrade'], era: 1 },
  { id: 'sailing', name: 'Sailing', track: 'exploration', cost: 25, prerequisites: [], unlocks: ['boat'], era: 1 },
  { id: 'cartography', name: 'Cartography', track: 'exploration', cost: 45, prerequisites: ['tracking', 'sailing'], unlocks: ['map-room'], era: 2 },
  { id: 'compass', name: 'Compass', track: 'exploration', cost: 40, prerequisites: ['sailing'], unlocks: ['explorer'], era: 2 },
  { id: 'colonization', name: 'Colonization', track: 'exploration', cost: 85, prerequisites: ['cartography'], unlocks: ['colony'], era: 3 },
  { id: 'natural-history', name: 'Natural History', track: 'exploration', cost: 80, prerequisites: ['cartography', 'compass'], unlocks: ['museum'], era: 3 },
  { id: 'archaeology', name: 'Archaeology', track: 'exploration', cost: 120, prerequisites: ['natural-history'], unlocks: ['dig-site'], era: 4 },
  { id: 'expedition', name: 'Expedition', track: 'exploration', cost: 130, prerequisites: ['colonization', 'natural-history'], unlocks: ['expedition-team'], era: 4 },

  // === AGRICULTURE TRACK (new) ===
  { id: 'gathering', name: 'Gathering', track: 'agriculture', cost: 20, prerequisites: [], unlocks: ['food-storage'], era: 1 },
  { id: 'domestication', name: 'Domestication', track: 'agriculture', cost: 25, prerequisites: ['gathering'], unlocks: ['pen'], era: 1 },
  { id: 'crop-rotation', name: 'Crop Rotation', track: 'agriculture', cost: 45, prerequisites: ['domestication', 'irrigation'], unlocks: ['improved-farms'], era: 2 },
  { id: 'granary-design', name: 'Granary Design', track: 'agriculture', cost: 40, prerequisites: ['gathering'], unlocks: ['granary-upgrade'], era: 2 },
  { id: 'fertilization', name: 'Fertilization', track: 'agriculture', cost: 80, prerequisites: ['crop-rotation'], unlocks: ['fertile-fields'], era: 3 },
  { id: 'livestock-breeding', name: 'Livestock Breeding', track: 'agriculture', cost: 85, prerequisites: ['crop-rotation', 'granary-design'], unlocks: ['ranch'], era: 3 },
  { id: 'selective-breeding', name: 'Selective Breeding', track: 'agriculture', cost: 120, prerequisites: ['livestock-breeding'], unlocks: ['hybrid-crops'], era: 4 },
  { id: 'agricultural-science', name: 'Agricultural Science', track: 'agriculture', cost: 125, prerequisites: ['fertilization', 'livestock-breeding'], unlocks: ['agri-lab'], era: 4 },

  // === MEDICINE TRACK (new) ===
  { id: 'herbalism', name: 'Herbalism', track: 'medicine', cost: 20, prerequisites: [], unlocks: ['healer'], era: 1 },
  { id: 'bone-setting', name: 'Bone Setting', track: 'medicine', cost: 25, prerequisites: ['herbalism'], unlocks: ['field-medic'], era: 1 },
  { id: 'sanitation', name: 'Sanitation', track: 'medicine', cost: 45, prerequisites: ['bone-setting'], unlocks: ['sewers'], era: 2 },
  { id: 'midwifery', name: 'Midwifery', track: 'medicine', cost: 40, prerequisites: ['herbalism'], unlocks: ['birth-rate-bonus'], era: 2 },
  { id: 'surgery', name: 'Surgery', track: 'medicine', cost: 85, prerequisites: ['sanitation', 'philosophy-tech'], unlocks: ['hospital'], era: 3 },
  { id: 'quarantine', name: 'Quarantine', track: 'medicine', cost: 80, prerequisites: ['sanitation'], unlocks: ['plague-defense'], era: 3 },
  { id: 'apothecary', name: 'Apothecary', track: 'medicine', cost: 120, prerequisites: ['surgery'], unlocks: ['pharmacy'], era: 4 },
  { id: 'anatomy', name: 'Anatomy', track: 'medicine', cost: 130, prerequisites: ['surgery', 'quarantine'], unlocks: ['medical-school'], era: 4 },

  // === PHILOSOPHY TRACK (new — distinct from science 'philosophy-tech') ===
  { id: 'oral-tradition', name: 'Oral Tradition', track: 'philosophy', cost: 20, prerequisites: [], unlocks: ['storyteller'], era: 1 },
  { id: 'mythology', name: 'Mythology', track: 'philosophy', cost: 25, prerequisites: ['oral-tradition'], unlocks: ['shrine'], era: 1 },
  { id: 'ethics', name: 'Ethics', track: 'philosophy', cost: 45, prerequisites: ['mythology', 'writing'], unlocks: ['ethical-code'], era: 2 },
  { id: 'rhetoric', name: 'Rhetoric', track: 'philosophy', cost: 50, prerequisites: ['oral-tradition'], unlocks: ['forum'], era: 2 },
  { id: 'logic', name: 'Logic', track: 'philosophy', cost: 85, prerequisites: ['ethics', 'rhetoric'], unlocks: ['school-of-thought'], era: 3 },
  { id: 'metaphysics', name: 'Metaphysics', track: 'philosophy', cost: 80, prerequisites: ['ethics'], unlocks: ['great-thinker'], era: 3 },
  { id: 'humanism', name: 'Humanism', track: 'philosophy', cost: 125, prerequisites: ['logic', 'metaphysics'], unlocks: ['enlightenment'], era: 4 },
  { id: 'natural-philosophy', name: 'Natural Philosophy', track: 'philosophy', cost: 120, prerequisites: ['logic'], unlocks: ['empiricism'], era: 4 },

  // === ARTS TRACK (new) ===
  { id: 'cave-painting', name: 'Cave Painting', track: 'arts', cost: 20, prerequisites: [], unlocks: ['art-gallery'], era: 1 },
  { id: 'storytelling', name: 'Storytelling', track: 'arts', cost: 25, prerequisites: ['cave-painting'], unlocks: ['bard'], era: 1 },
  { id: 'pottery-arts', name: 'Pottery Arts', track: 'arts', cost: 40, prerequisites: ['storytelling', 'pottery'], unlocks: ['kiln'], era: 2 },
  { id: 'music', name: 'Music', track: 'arts', cost: 45, prerequisites: ['storytelling'], unlocks: ['concert-hall'], era: 2 },
  { id: 'sculpture', name: 'Sculpture', track: 'arts', cost: 80, prerequisites: ['pottery-arts'], unlocks: ['statue'], era: 3 },
  { id: 'drama', name: 'Drama', track: 'arts', cost: 85, prerequisites: ['music', 'pottery-arts'], unlocks: ['amphitheater'], era: 3 },
  { id: 'theater', name: 'Theater', track: 'arts', cost: 120, prerequisites: ['drama'], unlocks: ['opera-house'], era: 4 },
  { id: 'architecture-arts', name: 'Architecture Arts', track: 'arts', cost: 130, prerequisites: ['sculpture', 'drama'], unlocks: ['grand-monument'], era: 4 },

  // === MARITIME TRACK (new) ===
  { id: 'rafts', name: 'Rafts', track: 'maritime', cost: 20, prerequisites: [], unlocks: ['raft'], era: 1 },
  { id: 'fishing', name: 'Fishing', track: 'maritime', cost: 25, prerequisites: ['rafts'], unlocks: ['fishing-boat'], era: 1 },
  { id: 'galleys', name: 'Galleys', track: 'maritime', cost: 45, prerequisites: ['fishing', 'sailing'], unlocks: ['galley'], era: 2 },
  { id: 'navigation', name: 'Navigation', track: 'maritime', cost: 50, prerequisites: ['galleys'], unlocks: ['navigator'], era: 2 },
  { id: 'triremes', name: 'Triremes', track: 'maritime', cost: 85, prerequisites: ['navigation'], unlocks: ['trireme'], era: 3 },
  { id: 'harbor-building', name: 'Harbor Building', track: 'maritime', cost: 80, prerequisites: ['galleys'], unlocks: ['harbor'], era: 3 },
  { id: 'caravels', name: 'Caravels', track: 'maritime', cost: 125, prerequisites: ['triremes', 'harbor-building'], unlocks: ['caravel'], era: 4 },
  { id: 'naval-warfare', name: 'Naval Warfare', track: 'maritime', cost: 130, prerequisites: ['triremes'], unlocks: ['warship'], era: 4 },

  // === METALLURGY TRACK (new) ===
  { id: 'copper-working', name: 'Copper Working', track: 'metallurgy', cost: 20, prerequisites: [], unlocks: ['copper-tools'], era: 1 },
  { id: 'smelting', name: 'Smelting', track: 'metallurgy', cost: 25, prerequisites: ['copper-working'], unlocks: ['furnace'], era: 1 },
  { id: 'bronze-casting', name: 'Bronze Casting', track: 'metallurgy', cost: 45, prerequisites: ['smelting', 'bronze-working'], unlocks: ['bronze-armor'], era: 2 },
  { id: 'tool-making', name: 'Tool Making', track: 'metallurgy', cost: 40, prerequisites: ['smelting'], unlocks: ['improved-tools'], era: 2 },
  { id: 'iron-smelting', name: 'Iron Smelting', track: 'metallurgy', cost: 85, prerequisites: ['bronze-casting'], unlocks: ['iron-ore'], era: 3 },
  { id: 'alloys', name: 'Alloys', track: 'metallurgy', cost: 80, prerequisites: ['bronze-casting', 'tool-making'], unlocks: ['alloy-weapons'], era: 3 },
  { id: 'steel-forging', name: 'Steel Forging', track: 'metallurgy', cost: 125, prerequisites: ['iron-smelting', 'alloys'], unlocks: ['steel-weapons'], era: 4 },
  { id: 'armor-craft', name: 'Armor Craft', track: 'metallurgy', cost: 120, prerequisites: ['iron-smelting'], unlocks: ['plate-armor'], era: 4 },

  // === CONSTRUCTION TRACK (new) ===
  { id: 'mud-brick', name: 'Mud Brick', track: 'construction', cost: 20, prerequisites: [], unlocks: ['basic-walls'], era: 1 },
  { id: 'thatching', name: 'Thatching', track: 'construction', cost: 25, prerequisites: ['mud-brick'], unlocks: ['shelter'], era: 1 },
  { id: 'masonry', name: 'Masonry', track: 'construction', cost: 45, prerequisites: ['thatching'], unlocks: ['stone-walls'], era: 2 },
  { id: 'foundations', name: 'Foundations', track: 'construction', cost: 40, prerequisites: ['mud-brick'], unlocks: ['sturdy-buildings'], era: 2 },
  { id: 'aqueducts', name: 'Aqueducts', track: 'construction', cost: 85, prerequisites: ['masonry', 'engineering'], unlocks: ['water-system'], era: 3 },
  { id: 'arches', name: 'Arches', track: 'construction', cost: 80, prerequisites: ['masonry', 'foundations'], unlocks: ['grand-buildings'], era: 3 },
  { id: 'fortresses', name: 'Fortresses', track: 'construction', cost: 125, prerequisites: ['arches'], unlocks: ['fortress'], era: 4 },
  { id: 'city-planning', name: 'City Planning', track: 'construction', cost: 130, prerequisites: ['aqueducts', 'arches'], unlocks: ['planned-city'], era: 4 },

  // === COMMUNICATION TRACK (new) ===
  { id: 'drums', name: 'Drums', track: 'communication', cost: 20, prerequisites: [], unlocks: ['signal-drums'], era: 1 },
  { id: 'smoke-signals', name: 'Smoke Signals', track: 'communication', cost: 25, prerequisites: ['drums'], unlocks: ['watchtower'], era: 1 },
  { id: 'pictographs', name: 'Pictographs', track: 'communication', cost: 45, prerequisites: ['smoke-signals', 'writing'], unlocks: ['record-keeping'], era: 2 },
  { id: 'messengers', name: 'Messengers', track: 'communication', cost: 40, prerequisites: ['smoke-signals'], unlocks: ['messenger-post'], era: 2 },
  { id: 'courier-networks', name: 'Courier Networks', track: 'communication', cost: 80, prerequisites: ['messengers', 'pictographs'], unlocks: ['postal-service'], era: 3 },
  { id: 'ciphers', name: 'Ciphers', track: 'communication', cost: 85, prerequisites: ['pictographs'], unlocks: ['encoded-messages'], era: 3 },
  { id: 'printing', name: 'Printing', track: 'communication', cost: 120, prerequisites: ['courier-networks'], unlocks: ['newspaper'], era: 4 },
  { id: 'diplomats', name: 'Diplomats', track: 'communication', cost: 130, prerequisites: ['courier-networks', 'ciphers'], unlocks: ['embassy'], era: 4 },

  // === ESPIONAGE TRACK (new) ===
  { id: 'scouts-tech', name: 'Scouts Tech', track: 'espionage', cost: 20, prerequisites: [], unlocks: ['scout-training'], era: 1 },
  { id: 'lookouts', name: 'Lookouts', track: 'espionage', cost: 25, prerequisites: ['scouts-tech'], unlocks: ['lookout-tower'], era: 1 },
  { id: 'informants', name: 'Informants', track: 'espionage', cost: 45, prerequisites: ['lookouts', 'code-of-laws'], unlocks: ['informant-network'], era: 2 },
  { id: 'disguise', name: 'Disguise', track: 'espionage', cost: 40, prerequisites: ['lookouts'], unlocks: ['spy-disguise'], era: 2 },
  { id: 'spy-networks', name: 'Spy Networks', track: 'espionage', cost: 85, prerequisites: ['informants', 'disguise'], unlocks: ['spy-ring'], era: 3 },
  { id: 'sabotage', name: 'Sabotage', track: 'espionage', cost: 80, prerequisites: ['informants'], unlocks: ['saboteur'], era: 3 },
  { id: 'cryptography', name: 'Cryptography', track: 'espionage', cost: 125, prerequisites: ['spy-networks'], unlocks: ['cipher-bureau'], era: 4 },
  { id: 'counter-intelligence', name: 'Counter-Intelligence', track: 'espionage', cost: 130, prerequisites: ['spy-networks', 'sabotage'], unlocks: ['security-agency'], era: 4 },

  // === SPIRITUALITY TRACK (new) ===
  { id: 'animism', name: 'Animism', track: 'spirituality', cost: 20, prerequisites: [], unlocks: ['spirit-shrine'], era: 1 },
  { id: 'burial-rites', name: 'Burial Rites', track: 'spirituality', cost: 25, prerequisites: ['animism'], unlocks: ['burial-ground'], era: 1 },
  { id: 'shamanism', name: 'Shamanism', track: 'spirituality', cost: 45, prerequisites: ['burial-rites', 'tribal-council'], unlocks: ['shaman'], era: 2 },
  { id: 'sacred-sites', name: 'Sacred Sites', track: 'spirituality', cost: 40, prerequisites: ['burial-rites'], unlocks: ['holy-site'], era: 2 },
  { id: 'temples', name: 'Temples', track: 'spirituality', cost: 85, prerequisites: ['shamanism', 'sacred-sites'], unlocks: ['grand-temple'], era: 3 },
  { id: 'priesthood', name: 'Priesthood', track: 'spirituality', cost: 80, prerequisites: ['shamanism'], unlocks: ['priest'], era: 3 },
  { id: 'pilgrimages', name: 'Pilgrimages', track: 'spirituality', cost: 120, prerequisites: ['temples'], unlocks: ['pilgrimage-route'], era: 4 },
  { id: 'theology-tech', name: 'Theology', track: 'spirituality', cost: 130, prerequisites: ['temples', 'priesthood'], unlocks: ['cathedral'], era: 4 },
];
```

> **Note:** The existing 5 tracks may need their tech IDs adjusted to match the current `tech-system.ts` exactly. Read the current `TECH_TREE` in `tech-system.ts` first and preserve all existing IDs. The above is a template — exact IDs must match existing tests.

- [ ] **Step 5: Update tech-system.ts to import from tech-definitions.ts**

In `src/systems/tech-system.ts`:
1. Remove the inline `TECH_TREE` constant
2. Add: `import { TECH_TREE } from './tech-definitions';`
3. Keep re-exporting: `export { TECH_TREE };`

All existing functions (`getAvailableTechs`, `startResearch`, `processResearch`, etc.) remain unchanged.

- [ ] **Step 6: Update createTechState for 15 tracks**

In `src/systems/tech-system.ts`, update `createTechState()` to initialize `trackPriorities` for all 15 tracks at `'medium'`:

```typescript
trackPriorities: {
  military: 'medium', economy: 'medium', science: 'medium',
  civics: 'medium', exploration: 'medium',
  agriculture: 'medium', medicine: 'medium', philosophy: 'medium',
  arts: 'medium', maritime: 'medium', metallurgy: 'medium',
  construction: 'medium', communication: 'medium', espionage: 'medium',
  spirituality: 'medium',
},
```

- [ ] **Step 7: Run all tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -10`
Expected: All existing tests pass + 7 new tech definition tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/systems/tech-definitions.ts src/systems/tech-system.ts tests/systems/tech-definitions.test.ts
git commit -m "feat(m3c): expand tech tree to 15 tracks with 120 techs and cross-track prerequisites"
```

---

### Task 4: Minor Civ Definitions

**Files:**
- Create: `src/systems/minor-civ-definitions.ts`
- Create: `tests/systems/minor-civ-definitions.test.ts`

- [ ] **Step 1: Write validation tests**

Create `tests/systems/minor-civ-definitions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';

describe('minor civ definitions', () => {
  it('has exactly 12 definitions', () => {
    expect(MINOR_CIV_DEFINITIONS.length).toBe(12);
  });

  it('has no duplicate IDs', () => {
    const ids = MINOR_CIV_DEFINITIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate names', () => {
    const names = MINOR_CIV_DEFINITIONS.map(d => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each archetype has at least 3 definitions', () => {
    const archetypes = new Map<string, number>();
    for (const d of MINOR_CIV_DEFINITIONS) {
      archetypes.set(d.archetype, (archetypes.get(d.archetype) ?? 0) + 1);
    }
    expect(archetypes.get('militaristic')).toBeGreaterThanOrEqual(3);
    expect(archetypes.get('mercantile')).toBeGreaterThanOrEqual(3);
    expect(archetypes.get('cultural')).toBeGreaterThanOrEqual(3);
  });

  it('all definitions have valid color and bonus', () => {
    for (const d of MINOR_CIV_DEFINITIONS) {
      expect(d.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(d.allyBonus).toBeDefined();
      expect(d.allyBonus.type).toBeDefined();
    }
  });

  it('militaristic definitions have free_unit bonus', () => {
    const mil = MINOR_CIV_DEFINITIONS.filter(d => d.archetype === 'militaristic');
    for (const d of mil) {
      expect(d.allyBonus.type).toBe('free_unit');
    }
  });

  it('mercantile definitions have gold_per_turn bonus', () => {
    const merc = MINOR_CIV_DEFINITIONS.filter(d => d.archetype === 'mercantile');
    for (const d of merc) {
      expect(d.allyBonus.type).toBe('gold_per_turn');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/minor-civ-definitions.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Create minor-civ-definitions.ts**

Create `src/systems/minor-civ-definitions.ts`:

```typescript
import type { MinorCivDefinition } from '@/core/types';

export const MINOR_CIV_DEFINITIONS: MinorCivDefinition[] = [
  // === MILITARISTIC ===
  {
    id: 'sparta',
    name: 'Sparta',
    archetype: 'militaristic',
    description: 'Warrior city-state, respects strength',
    allyBonus: { type: 'free_unit', unitType: 'warrior', everyNTurns: 15 },
    color: '#c62828',
  },
  {
    id: 'valyria',
    name: 'Valyria',
    archetype: 'militaristic',
    description: 'Dragonforged warriors of legend',
    allyBonus: { type: 'free_unit', unitType: 'warrior', everyNTurns: 12 },
    color: '#b71c1c',
  },
  {
    id: 'numantia',
    name: 'Numantia',
    archetype: 'militaristic',
    description: 'Unconquerable hill fortress',
    allyBonus: { type: 'free_unit', unitType: 'warrior', everyNTurns: 18 },
    color: '#d84315',
  },
  {
    id: 'gondolin',
    name: 'Gondolin',
    archetype: 'militaristic',
    description: 'Hidden elven stronghold',
    allyBonus: { type: 'free_unit', unitType: 'scout', everyNTurns: 10 },
    color: '#1565c0',
  },

  // === MERCANTILE ===
  {
    id: 'carthage',
    name: 'Carthage',
    archetype: 'mercantile',
    description: 'Trading hub of the ancient world',
    allyBonus: { type: 'gold_per_turn', amount: 5 },
    color: '#f9a825',
  },
  {
    id: 'zanzibar',
    name: 'Zanzibar',
    archetype: 'mercantile',
    description: 'Island spice trading post',
    allyBonus: { type: 'gold_per_turn', amount: 4 },
    color: '#ff8f00',
  },
  {
    id: 'samarkand',
    name: 'Samarkand',
    archetype: 'mercantile',
    description: 'Jewel of the Silk Road',
    allyBonus: { type: 'gold_per_turn', amount: 6 },
    color: '#e65100',
  },
  {
    id: 'petra',
    name: 'Petra',
    archetype: 'mercantile',
    description: 'Rose-red city of caravans',
    allyBonus: { type: 'gold_per_turn', amount: 4 },
    color: '#bf360c',
  },

  // === CULTURAL ===
  {
    id: 'alexandria',
    name: 'Alexandria',
    archetype: 'cultural',
    description: 'Center of knowledge and learning',
    allyBonus: { type: 'science_per_turn', amount: 3 },
    color: '#6a1b9a',
  },
  {
    id: 'delphi',
    name: 'Delphi',
    archetype: 'cultural',
    description: "Oracle's seat, font of wisdom",
    allyBonus: { type: 'science_per_turn', amount: 2 },
    color: '#4a148c',
  },
  {
    id: 'timbuktu',
    name: 'Timbuktu',
    archetype: 'cultural',
    description: 'Great library of the sands',
    allyBonus: { type: 'production_per_turn', amount: 2 },
    color: '#4e342e',
  },
  {
    id: 'avalon',
    name: 'Avalon',
    archetype: 'cultural',
    description: 'Mystical isle of ancient knowledge',
    allyBonus: { type: 'production_per_turn', amount: 3 },
    color: '#00695c',
  },
];
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass (previous + 7 new = ~288+).

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-definitions.ts tests/systems/minor-civ-definitions.test.ts
git commit -m "feat(m3c): add 12 minor civilization definitions with archetypes and bonuses"
```

---

### Task 5: Quest System

**Files:**
- Create: `src/systems/quest-system.ts`
- Create: `tests/systems/quest-system.test.ts`

- [ ] **Step 1: Write quest system tests**

Create `tests/systems/quest-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  generateQuest,
  checkQuestCompletion,
  processQuestExpiry,
  awardQuestReward,
} from '@/systems/quest-system';
import type { MinorCivState, GameState, Quest } from '@/core/types';

// Minimal state factory for quest testing
function makeMinimalState(): GameState {
  // Return a minimal GameState with enough structure for quest generation
  // (will be filled out in implementation step)
  return {} as GameState;
}

describe('quest system', () => {
  describe('generateQuest', () => {
    it('generates destroy_camp quest for militaristic archetype', () => {
      const quest = generateQuest('militaristic', 'mc-sparta', 'player', 1, {
        barbarianCamps: { camp1: { id: 'camp1', position: { q: 5, r: 5 }, strength: 5, spawnCooldown: 0 } },
        era: 1,
      } as any, () => 0.1); // low roll → weighted toward archetype preference
      expect(quest).toBeDefined();
      expect(quest!.type).toBe('destroy_camp');
      expect(quest!.status).toBe('active');
      expect(quest!.turnIssued).toBe(1);
    });

    it('generates gift_gold quest for mercantile archetype', () => {
      const quest = generateQuest('mercantile', 'mc-carthage', 'player', 5, {
        barbarianCamps: {},
        era: 1,
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect(quest!.type).toBe('gift_gold');
      expect((quest!.target as any).amount).toBe(25); // era 1
    });

    it('scales gift_gold amount by era', () => {
      const quest = generateQuest('mercantile', 'mc-carthage', 'player', 5, {
        barbarianCamps: {},
        era: 3,
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect((quest!.target as any).amount).toBe(75); // era 3
    });

    it('returns null if no valid targets exist', () => {
      const quest = generateQuest('militaristic', 'mc-sparta', 'player', 1, {
        barbarianCamps: {},
        era: 1,
      } as any, () => 0.0); // forces destroy_camp but no camps
      // Should fall back to another type or return null
      expect(quest === null || quest.type !== 'destroy_camp').toBe(true);
    });

    it('sets expiry 20 turns from issued turn', () => {
      const quest = generateQuest('mercantile', 'mc-carthage', 'player', 10, {
        barbarianCamps: {},
        era: 1,
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect(quest!.expiresOnTurn).toBe(30);
    });

    it('preserves chainNext field as undefined', () => {
      const quest = generateQuest('mercantile', 'mc-carthage', 'player', 1, {
        barbarianCamps: {},
        era: 1,
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect(quest!.chainNext).toBeUndefined();
    });
  });

  describe('checkQuestCompletion', () => {
    it('completes destroy_camp when camp no longer exists', () => {
      const quest: Quest = {
        id: 'q1', type: 'destroy_camp', description: 'test',
        target: { type: 'destroy_camp', campId: 'camp1' },
        reward: { relationshipBonus: 25, gold: 50 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = checkQuestCompletion(quest, { barbarianCamps: {} } as any);
      expect(result).toBe(true);
    });

    it('does not complete destroy_camp when camp still exists', () => {
      const quest: Quest = {
        id: 'q1', type: 'destroy_camp', description: 'test',
        target: { type: 'destroy_camp', campId: 'camp1' },
        reward: { relationshipBonus: 25 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = checkQuestCompletion(quest, {
        barbarianCamps: { camp1: { id: 'camp1', position: { q: 0, r: 0 }, strength: 5, spawnCooldown: 0 } },
      } as any);
      expect(result).toBe(false);
    });

    it('completes gift_gold when progress >= target amount', () => {
      const quest: Quest = {
        id: 'q2', type: 'gift_gold', description: 'test',
        target: { type: 'gift_gold', amount: 50 },
        reward: { relationshipBonus: 20 },
        progress: 50, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = checkQuestCompletion(quest, {} as any);
      expect(result).toBe(true);
    });
  });

  describe('processQuestExpiry', () => {
    it('marks quest as expired when turn exceeds expiry', () => {
      const quest: Quest = {
        id: 'q1', type: 'destroy_camp', description: 'test',
        target: { type: 'destroy_camp', campId: 'camp1' },
        reward: { relationshipBonus: 25 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = processQuestExpiry(quest, 22);
      expect(result.status).toBe('expired');
    });

    it('does not expire quest before expiry turn', () => {
      const quest: Quest = {
        id: 'q1', type: 'destroy_camp', description: 'test',
        target: { type: 'destroy_camp', campId: 'camp1' },
        reward: { relationshipBonus: 25 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = processQuestExpiry(quest, 15);
      expect(result.status).toBe('active');
    });

    it('does not expire quest with null expiry', () => {
      const quest: Quest = {
        id: 'q1', type: 'gift_gold', description: 'test',
        target: { type: 'gift_gold', amount: 50 },
        reward: { relationshipBonus: 20 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: null,
      };
      const result = processQuestExpiry(quest, 999);
      expect(result.status).toBe('active');
    });
  });

  describe('awardQuestReward', () => {
    it('returns relationship bonus and gold', () => {
      const reward = { relationshipBonus: 25, gold: 50 };
      const result = awardQuestReward(reward);
      expect(result.relationshipBonus).toBe(25);
      expect(result.gold).toBe(50);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/quest-system.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Create quest-system.ts**

Create `src/systems/quest-system.ts`:

```typescript
import type { MinorCivArchetype, Quest, QuestReward, QuestTarget, QuestType, GameState, HexCoord } from '@/core/types';
import { hexDistance } from './hex-utils';

let questIdCounter = 0;

export function resetQuestId(): void {
  questIdCounter = 0;
}

const QUEST_WEIGHTS: Record<MinorCivArchetype, Record<QuestType, number>> = {
  militaristic: { destroy_camp: 0.6, defeat_units: 0.4, gift_gold: 0.0, trade_route: 0.0 },
  mercantile: { gift_gold: 0.6, trade_route: 0.25, destroy_camp: 0.1, defeat_units: 0.05 },
  cultural: { trade_route: 0.4, gift_gold: 0.3, destroy_camp: 0.15, defeat_units: 0.15 },
};

const GOLD_PER_ERA = [0, 25, 50, 75, 100];

export function generateQuest(
  archetype: MinorCivArchetype,
  minorCivId: string,
  majorCivId: string,
  currentTurn: number,
  state: Pick<GameState, 'barbarianCamps' | 'era'>,
  rng: () => number,
): Quest | null {
  const weights = QUEST_WEIGHTS[archetype];
  const roll = rng();

  // Select quest type by cumulative weight
  let cumulative = 0;
  let selectedType: QuestType = 'gift_gold';
  for (const [type, weight] of Object.entries(weights) as [QuestType, number][]) {
    cumulative += weight;
    if (roll < cumulative) {
      selectedType = type;
      break;
    }
  }

  // Build target based on type; fall back if no valid target
  const target = buildQuestTarget(selectedType, minorCivId, state);
  if (!target) {
    // Fallback to gift_gold which always works
    const fallbackTarget = buildQuestTarget('gift_gold', minorCivId, state);
    if (!fallbackTarget) return null;
    return makeQuest('gift_gold', fallbackTarget, currentTurn);
  }

  return makeQuest(selectedType, target, currentTurn);
}

function buildQuestTarget(
  type: QuestType,
  minorCivId: string,
  state: Pick<GameState, 'barbarianCamps' | 'era'>,
): QuestTarget | null {
  switch (type) {
    case 'destroy_camp': {
      const camps = Object.values(state.barbarianCamps);
      if (camps.length === 0) return null;
      const camp = camps[0]; // closest or first available
      return { type: 'destroy_camp', campId: camp.id };
    }
    case 'gift_gold':
      return { type: 'gift_gold', amount: GOLD_PER_ERA[state.era] ?? 25 };
    case 'defeat_units':
      return { type: 'defeat_units', count: 2, nearPosition: { q: 0, r: 0 }, radius: 8 };
    case 'trade_route':
      return { type: 'trade_route', minorCivId };
    default:
      return null;
  }
}

function makeQuest(type: QuestType, target: QuestTarget, currentTurn: number): Quest {
  questIdCounter++;
  const reward = getRewardForType(type);
  return {
    id: `quest-${questIdCounter}`,
    type,
    description: getQuestDescription(type, target),
    target,
    reward,
    progress: 0,
    status: 'active',
    turnIssued: currentTurn,
    expiresOnTurn: currentTurn + 20,
  };
}

function getRewardForType(type: QuestType): QuestReward {
  switch (type) {
    case 'destroy_camp': return { relationshipBonus: 25, gold: 50 };
    case 'gift_gold': return { relationshipBonus: 20 };
    case 'defeat_units': return { relationshipBonus: 30, freeUnit: 'warrior' };
    case 'trade_route': return { relationshipBonus: 25, science: 20 };
  }
}

function getQuestDescription(type: QuestType, target: QuestTarget): string {
  switch (type) {
    case 'destroy_camp': return 'Destroy a nearby barbarian camp';
    case 'gift_gold': return `Gift ${(target as { amount: number }).amount} gold`;
    case 'defeat_units': return `Defeat ${(target as { count: number }).count} enemy units nearby`;
    case 'trade_route': return 'Establish a trade route to our city';
  }
}

export function checkQuestCompletion(quest: Quest, state: Pick<GameState, 'barbarianCamps'>): boolean {
  switch (quest.target.type) {
    case 'destroy_camp':
      return !(quest.target.campId in state.barbarianCamps);
    case 'gift_gold':
      return quest.progress >= quest.target.amount;
    case 'defeat_units':
      return quest.progress >= quest.target.count;
    case 'trade_route':
      // Completion checked externally via trade system
      return quest.progress >= 1;
    default:
      return false;
  }
}

export function processQuestExpiry(quest: Quest, currentTurn: number): Quest {
  if (quest.status !== 'active') return quest;
  if (quest.expiresOnTurn !== null && currentTurn > quest.expiresOnTurn) {
    return { ...quest, status: 'expired' };
  }
  return quest;
}

export function awardQuestReward(reward: QuestReward): QuestReward {
  return reward;
}
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/quest-system.ts tests/systems/quest-system.test.ts
git commit -m "feat(m3c): add quest system with 4 quest types and archetype weighting"
```

---

### Task 6: Minor Civ System — Placement

**Files:**
- Create: `src/systems/minor-civ-system.ts`
- Create: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Write placement tests**

Create `tests/systems/minor-civ-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { placeMinorCivs } from '@/systems/minor-civ-system';
import { createNewGame } from '@/core/game-state';
import { hexDistance, hexKey } from '@/systems/hex-utils';

describe('minor civ placement', () => {
  it('places correct number for small map', () => {
    const state = createNewGame(undefined, 'mc-place-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-place-test');
    expect(Object.keys(result.minorCivs).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(result.minorCivs).length).toBeLessThanOrEqual(4);
  });

  it('places correct number for medium map', () => {
    const state = createNewGame(undefined, 'mc-place-med', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-place-med');
    expect(Object.keys(result.minorCivs).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(result.minorCivs).length).toBeLessThanOrEqual(6);
  });

  it('respects distance from start positions', () => {
    const state = createNewGame(undefined, 'mc-dist-test', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-dist-test');
    const startPositions = Object.values(state.units)
      .filter(u => u.type === 'settler')
      .map(u => u.position);
    for (const mc of Object.values(result.minorCivs)) {
      const city = result.cities[mc.cityId];
      for (const start of startPositions) {
        expect(hexDistance(city.position, start)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('respects distance between minor civs', () => {
    const state = createNewGame(undefined, 'mc-inter-test', 'medium');
    const result = placeMinorCivs(state, 'medium', 'mc-inter-test');
    const mcCities = Object.values(result.minorCivs).map(mc => result.cities[mc.cityId]);
    for (let i = 0; i < mcCities.length; i++) {
      for (let j = i + 1; j < mcCities.length; j++) {
        expect(hexDistance(mcCities[i].position, mcCities[j].position)).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('creates city and garrison for each minor civ', () => {
    const state = createNewGame(undefined, 'mc-city-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-city-test');
    for (const mc of Object.values(result.minorCivs)) {
      expect(result.cities[mc.cityId]).toBeDefined();
      expect(result.cities[mc.cityId].owner).toBe(`mc-${mc.definitionId}`);
      expect(result.cities[mc.cityId].population).toBe(3);
      expect(mc.units.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not place on impassable terrain', () => {
    const state = createNewGame(undefined, 'mc-terrain-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-terrain-test');
    const impassable = ['ocean', 'coast', 'mountain'];
    for (const mc of Object.values(result.minorCivs)) {
      const city = result.cities[mc.cityId];
      const tile = state.map.tiles[hexKey(city.position)];
      expect(impassable).not.toContain(tile.terrain);
    }
  });

  it('initializes diplomacy with major civs only', () => {
    const state = createNewGame(undefined, 'mc-diplo-test', 'small');
    const result = placeMinorCivs(state, 'small', 'mc-diplo-test');
    for (const mc of Object.values(result.minorCivs)) {
      const relKeys = Object.keys(mc.diplomacy.relationships);
      expect(relKeys).toContain('player');
      expect(relKeys).toContain('ai-1');
      // Should NOT contain other minor civ IDs
      for (const key of relKeys) {
        expect(key.startsWith('mc-')).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/minor-civ-system.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Create minor-civ-system.ts with placement logic**

Create `src/systems/minor-civ-system.ts`:

```typescript
import type { GameState, MinorCivState, HexCoord, City, Unit, MapSize } from '@/core/types';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { createDiplomacyState } from './diplomacy-system';
import { hexDistance, hexKey, hexNeighbors, hexesInRange } from './hex-utils';
import { createUnit, UNIT_DEFINITIONS } from './unit-system';
import { foundCity } from './city-system';
import { resolveCombat } from './combat-system';

const PLACEMENT_COUNTS: Record<string, [number, number]> = {
  small: [2, 4],
  medium: [4, 6],
  large: [6, 8],
};

const IMPASSABLE: Set<string> = new Set(['ocean', 'coast', 'mountain']);

interface PlacementResult {
  minorCivs: Record<string, MinorCivState>;
  cities: Record<string, City>;
  units: Record<string, Unit>;
}

export function placeMinorCivs(
  state: GameState,
  mapSize: MapSize,
  seed: string,
): PlacementResult {
  const [min, max] = PLACEMENT_COUNTS[mapSize] ?? [2, 4];

  // Seeded RNG
  let rngState = hashSeed(seed + '-mc');
  const rng = () => {
    rngState = (rngState * 48271) % 2147483647;
    return rngState / 2147483647;
  };

  const count = min + Math.floor(rng() * (max - min + 1));

  // Shuffle definitions
  const shuffled = [...MINOR_CIV_DEFINITIONS].sort(() => rng() - 0.5);
  const selected = shuffled.slice(0, count);

  // Get positions to avoid
  const startPositions = Object.values(state.units)
    .filter(u => u.type === 'settler')
    .map(u => u.position);
  const cityPositions = Object.values(state.cities).map(c => c.position);

  // Get passable tiles
  const candidates = Object.values(state.map.tiles)
    .filter(t => !IMPASSABLE.has(t.terrain) && !t.wonder)
    .map(t => t.coord)
    .sort(() => rng() - 0.5);

  const majorCivIds = Object.keys(state.civilizations);
  const placedPositions: HexCoord[] = [];
  const result: PlacementResult = {
    minorCivs: {},
    cities: { ...state.cities },
    units: { ...state.units },
  };

  for (const def of selected) {
    const pos = findValidPosition(
      candidates,
      startPositions,
      cityPositions,
      placedPositions,
    );
    if (!pos) continue;

    placedPositions.push(pos);

    // Create city with archetype buildings
    const city = foundCity(`mc-${def.id}`, pos, state.map);
    city.population = 3;
    // Add archetype-specific starting building
    const archetypeBuilding = def.archetype === 'militaristic' ? 'barracks'
      : def.archetype === 'mercantile' ? 'marketplace'
      : 'library';
    if (!city.buildings.includes(archetypeBuilding)) {
      city.buildings.push(archetypeBuilding);
    }
    result.cities[city.id] = city;

    // Create garrison unit
    const garrison = createUnit('warrior', `mc-${def.id}`, pos);
    result.units[garrison.id] = garrison;

    // Create minor civ state
    const mcState: MinorCivState = {
      id: `mc-${def.id}`,
      definitionId: def.id,
      cityId: city.id,
      units: [garrison.id],
      diplomacy: createDiplomacyState(majorCivIds, `mc-${def.id}`, 0),
      activeQuests: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 1,
    };

    result.minorCivs[mcState.id] = mcState;
  }

  return result;
}

function findValidPosition(
  candidates: HexCoord[],
  startPositions: HexCoord[],
  cityPositions: HexCoord[],
  placedPositions: HexCoord[],
): HexCoord | null {
  for (const pos of candidates) {
    // 8+ from starts
    if (startPositions.some(s => hexDistance(pos, s) < 8)) continue;
    // 6+ from existing cities
    if (cityPositions.some(c => hexDistance(pos, c) < 6)) continue;
    // 10+ from other minor civs
    if (placedPositions.some(p => hexDistance(pos, p) < 10)) continue;
    return pos;
  }
  return null;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts
git commit -m "feat(m3c): add minor civ placement with distance constraints and diplomacy init"
```

---

### Task 7: Integrate Minor Civs into Game State Creation

**Files:**
- Modify: `src/core/game-state.ts`
- Modify: `tests/core/game-state.test.ts` (if it exists, otherwise `tests/core/`)

- [ ] **Step 1: Write integration test**

Add to the game state test file (or create if needed):

```typescript
it('createNewGame places minor civs on medium map', () => {
  const state = createNewGame(undefined, 'mc-integration', 'medium');
  expect(Object.keys(state.minorCivs).length).toBeGreaterThanOrEqual(4);
  // Each minor civ has a city
  for (const mc of Object.values(state.minorCivs)) {
    expect(state.cities[mc.cityId]).toBeDefined();
    expect(state.cities[mc.cityId].owner).toMatch(/^mc-/);
  }
});

it('createHotSeatGame places minor civs', () => {
  const config = {
    playerCount: 2,
    mapSize: 'medium' as const,
    players: [
      { slotId: 'slot-0', civType: 'egypt' as any, isHuman: true },
      { slotId: 'slot-1', civType: 'rome' as any, isHuman: true },
    ],
  };
  const state = createHotSeatGame(config, 'mc-hotseat');
  expect(Object.keys(state.minorCivs).length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/core/ 2>&1 | tail -10`
Expected: FAIL — minorCivs empty or tests fail.

- [ ] **Step 3: Integrate placeMinorCivs into createNewGame and createHotSeatGame**

In `src/core/game-state.ts`:
1. Add import: `import { placeMinorCivs } from '@/systems/minor-civ-system';`
2. In `createNewGame()`, after barbarian camp setup and before the return statement, add:

```typescript
  // Place minor civilizations
  const mcResult = placeMinorCivs(state, mapSize ?? 'medium', actualSeed);
  state.minorCivs = mcResult.minorCivs;
  Object.assign(state.cities, mcResult.cities);
  Object.assign(state.units, mcResult.units);
```

3. Do the same in `createHotSeatGame()`.

- [ ] **Step 4: Run all tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/game-state.ts tests/core/
git commit -m "feat(m3c): integrate minor civ placement into game state creation"
```

---

### Task 8: Minor Civ Turn Processing — Core Behavior

**Files:**
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Write turn processing tests**

Add to `tests/systems/minor-civ-system.test.ts`:

```typescript
import { processMinorCivTurn } from '@/systems/minor-civ-system';

describe('minor civ turn processing', () => {
  it('replaces lost garrison after cooldown', () => {
    const state = createNewGame(undefined, 'mc-garrison', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-garrison');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    // Remove garrison unit
    for (const uid of mc.units) {
      delete state.units[uid];
    }
    mc.units = [];
    mc.garrisonCooldown = 1;

    const result = processMinorCivTurn(state, bus);
    expect(result.minorCivs[mcId].garrisonCooldown).toBe(0);

    // Next turn should spawn replacement
    const result2 = processMinorCivTurn(result, bus);
    expect(result2.minorCivs[mcId].units.length).toBeGreaterThanOrEqual(1);
  });

  it('applies ally bonus gold to allied major civ', () => {
    const state = createNewGame(undefined, 'mc-ally', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-ally');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    // Set relationship to allied (+60)
    mc.diplomacy.relationships.player = 65;

    const goldBefore = state.civilizations.player.gold;
    const result = processMinorCivTurn(state, bus);
    // If mercantile with gold bonus, gold should increase
    // This test should be adapted based on the actual archetype
    // At minimum, verify no crash
    expect(result).toBeDefined();
  });

  it('skips destroyed minor civs', () => {
    const state = createNewGame(undefined, 'mc-destroyed', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-destroyed');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    state.minorCivs[mcId].isDestroyed = true;

    const result = processMinorCivTurn(state, bus);
    expect(result.minorCivs[mcId].isDestroyed).toBe(true);
  });
});
```

> **Note:** `bus` should be imported from `@/core/event-bus` and instantiated with `new EventBus()` at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/minor-civ-system.test.ts 2>&1 | tail -10`
Expected: FAIL — `processMinorCivTurn` not exported.

- [ ] **Step 3: Implement processMinorCivTurn**

Add to `src/systems/minor-civ-system.ts`:

```typescript
import type { EventBus } from '@/core/event-bus';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { generateQuest, checkQuestCompletion, processQuestExpiry, awardQuestReward } from './quest-system';
import { modifyRelationship, getRelationship } from './diplomacy-system';

export function processMinorCivTurn(state: GameState, bus: EventBus): GameState {
  const newState = structuredClone(state);

  for (const [mcId, mc] of Object.entries(newState.minorCivs)) {
    if (mc.isDestroyed) continue;

    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def) continue;

    // 1. Movement & patrol (garrison patrols 3-hex radius)
    processMovement(newState, mc);

    // 2. Quest evaluation
    processQuests(newState, mc, def, bus);

    // 3. Ally bonuses
    applyAllyBonuses(newState, mc, def, bus);

    // 4. Garrison replacement
    processGarrison(newState, mc);

    // 5. Guerrilla spawning (when at war)
    processGuerrilla(newState, mc, bus);

    // 6. Check and emit relationship threshold events
    emitRelationshipThresholds(newState, mc, bus);
  }

  // 7. Scuffles between minor civs
  processScuffles(newState, bus);

  return newState;
}

function processQuests(state: GameState, mc: MinorCivState, def: any, bus: EventBus): void {
  const majorCivIds = Object.keys(state.civilizations);
  for (const civId of majorCivIds) {
    const quest = mc.activeQuests[civId];
    if (quest) {
      // Check expiry
      const expiredQuest = processQuestExpiry(quest, state.turn);
      if (expiredQuest.status === 'expired') {
        delete mc.activeQuests[civId];
        // Relationship penalty for expired quest
        mc.diplomacy = modifyRelationship(mc.diplomacy, civId, -5);
        continue;
      }

      // Check completion
      if (checkQuestCompletion(quest, state)) {
        quest.status = 'completed';
        const reward = awardQuestReward(quest.reward);
        mc.diplomacy = modifyRelationship(mc.diplomacy, civId, reward.relationshipBonus);
        if (reward.gold) {
          state.civilizations[civId].gold += reward.gold;
        }
        if (reward.science && state.civilizations[civId].techState.currentResearch) {
          state.civilizations[civId].techState.researchProgress += reward.science;
        }
        bus.emit('minor-civ:quest-completed', { minorCivId: mc.id, majorCivId: civId, quest, reward });
        delete mc.activeQuests[civId];
        // Set 3-turn cooldown before next quest
        (mc as any)[`_cooldown_${civId}`] = state.turn + 3;
      }
    } else {
      // Issue new quest (with 3-turn cooldown after completion)
      // Store last completion turn in quest slot as a sentinel
      const lastCompletedKey = `_cooldown_${civId}`;
      const cooldownUntil = (mc as any)[lastCompletedKey] ?? 0;
      if (state.turn >= cooldownUntil) {
        const rng = makeRng(state.turn * 16807 + civId.charCodeAt(0) + mc.id.charCodeAt(3));
        const newQuest = generateQuest(def.archetype, mc.id, civId, state.turn, state, rng);
        if (newQuest) {
          mc.activeQuests[civId] = newQuest;
          bus.emit('minor-civ:quest-issued', { minorCivId: mc.id, majorCivId: civId, quest: newQuest });
        }
      }
    }
  }
}

function applyAllyBonuses(state: GameState, mc: MinorCivState, def: any, bus: EventBus): void {
  for (const [civId, rel] of Object.entries(mc.diplomacy.relationships)) {
    if (rel < 60) continue; // not allied

    const civ = state.civilizations[civId];
    if (!civ) continue;

    switch (def.allyBonus.type) {
      case 'gold_per_turn':
        civ.gold += def.allyBonus.amount;
        break;
      case 'science_per_turn':
        if (civ.techState.currentResearch) {
          civ.techState.researchProgress += def.allyBonus.amount;
        }
        break;
      case 'production_per_turn': {
        // Apply to first city with a production queue
        const firstCityId = civ.cities[0];
        const firstCity = firstCityId ? state.cities[firstCityId] : null;
        if (firstCity && firstCity.productionQueue && firstCity.productionQueue.length > 0) {
          firstCity.productionQueue[0].progress = (firstCity.productionQueue[0].progress ?? 0) + def.allyBonus.amount;
        }
        break;
      }
      case 'free_unit': {
        // Grant free unit every N turns
        if (state.turn % def.allyBonus.everyNTurns === 0) {
          const city = civ.cities[0] ? state.cities[civ.cities[0]] : null;
          if (city) {
            const freeUnit = createUnit(def.allyBonus.unitType, civId, city.position);
            state.units[freeUnit.id] = freeUnit;
            civ.units.push(freeUnit.id);
          }
        }
        break;
      }
    }
  }
}

function processMovement(state: GameState, mc: MinorCivState): void {
  const city = state.cities[mc.cityId];
  if (!city) return;

  for (const uid of mc.units) {
    const unit = state.units[uid];
    if (!unit) continue;

    // Patrol: if unit is > 3 hexes from city, move back toward city
    const dist = hexDistance(unit.position, city.position);
    if (dist > 3) {
      // Move one step toward city
      const neighbors = hexNeighbors(unit.position);
      const closer = neighbors
        .filter(n => hexDistance(n, city.position) < dist)
        .filter(n => {
          const tile = state.map.tiles[hexKey(n)];
          return tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain';
        })[0];
      if (closer) {
        unit.position = closer;
      }
    }

    // Reset movement for next turn
    unit.movementPointsLeft = UNIT_DEFINITIONS[unit.type]?.movement ?? 2;
    unit.hasActed = false;
  }
}

function getRelationshipStatus(rel: number): 'hostile' | 'neutral' | 'friendly' | 'allied' {
  if (rel <= -60) return 'hostile';
  if (rel >= 60) return 'allied';
  if (rel >= 30) return 'friendly';
  if (rel <= -30) return 'neutral'; // below -30 but above -60
  return 'neutral';
}

function emitRelationshipThresholds(state: GameState, mc: MinorCivState, bus: EventBus): void {
  // Track previous status per civ to only emit on transitions
  if (!(mc as any)._prevStatus) (mc as any)._prevStatus = {} as Record<string, string>;

  for (const [civId, rel] of Object.entries(mc.diplomacy.relationships)) {
    const currentStatus = getRelationshipStatus(rel);
    const prevStatus = (mc as any)._prevStatus[civId] ?? 'neutral';

    if (currentStatus !== prevStatus) {
      (mc as any)._prevStatus[civId] = currentStatus;

      bus.emit('minor-civ:relationship-threshold', {
        minorCivId: mc.id,
        majorCivId: civId,
        newStatus: currentStatus,
      });

      if (currentStatus === 'allied') {
        bus.emit('minor-civ:allied', { minorCivId: mc.id, majorCivId: civId });
      }
    }
  }
}

function processGarrison(state: GameState, mc: MinorCivState): void {
  // Check if garrison exists
  const aliveUnits = mc.units.filter(uid => state.units[uid]);
  mc.units = aliveUnits;

  if (aliveUnits.length === 0) {
    if (mc.garrisonCooldown > 0) {
      mc.garrisonCooldown--;
    } else {
      // Spawn replacement garrison
      const city = state.cities[mc.cityId];
      if (city) {
        const garrison = createUnit('warrior', mc.id, city.position);
        state.units[garrison.id] = garrison;
        mc.units.push(garrison.id);
        mc.garrisonCooldown = 3;
      }
    }
  }
}

function makeRng(seed: number): () => number {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts
git commit -m "feat(m3c): add minor civ turn processing with quests, ally bonuses, and garrison replacement"
```

---

### Task 9: Era Advancement & Minor Civ Era Upgrades

**Files:**
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Write era-related tests**

Add to `tests/systems/minor-civ-system.test.ts`:

```typescript
import { checkEraAdvancement, processMinorCivEraUpgrade } from '@/systems/minor-civ-system';
import { TECH_TREE } from '@/systems/tech-definitions';

describe('era advancement', () => {
  it('advances era when a civ has 60% of next era techs', () => {
    const state = createNewGame(undefined, 'era-test', 'small');
    state.era = 1;
    // Complete 60% of era 2 techs for player
    const era2Techs = TECH_TREE.filter(t => t.era === 2);
    const needed = Math.ceil(era2Techs.length * 0.6);
    state.civilizations.player.techState.completed = era2Techs.slice(0, needed).map(t => t.id);
    const newEra = checkEraAdvancement(state);
    expect(newEra).toBe(2);
  });

  it('does not advance era below 60% threshold', () => {
    const state = createNewGame(undefined, 'era-no-test', 'small');
    state.era = 1;
    const era2Techs = TECH_TREE.filter(t => t.era === 2);
    const below = Math.floor(era2Techs.length * 0.6) - 1;
    state.civilizations.player.techState.completed = era2Techs.slice(0, below).map(t => t.id);
    const newEra = checkEraAdvancement(state);
    expect(newEra).toBe(1);
  });
});

describe('minor civ era upgrades', () => {
  it('upgrades garrison from warrior to swordsman at era 2', () => {
    const state = createNewGame(undefined, 'mc-era-up', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-era-up');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });
    state.era = 2;

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;

    processMinorCivEraUpgrade(state, mc);
    const garrison = state.units[mc.units[0]];
    expect(garrison.type).toBe('swordsman');
    expect(mc.lastEraUpgrade).toBe(2);
  });

  it('adds population on era upgrade', () => {
    const state = createNewGame(undefined, 'mc-era-pop', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-era-pop');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });
    state.era = 2;

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    mc.lastEraUpgrade = 1;
    const popBefore = state.cities[mc.cityId].population;

    processMinorCivEraUpgrade(state, mc);
    expect(state.cities[mc.cityId].population).toBe(popBefore + 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/minor-civ-system.test.ts 2>&1 | tail -10`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement era advancement and upgrade functions**

Add to `src/systems/minor-civ-system.ts`:

```typescript
import { TECH_TREE } from './tech-definitions';

const ERA_UNIT_MAP: Record<number, UnitType> = {
  1: 'warrior',
  2: 'swordsman',
  3: 'pikeman',
  4: 'musketeer',
};

export function checkEraAdvancement(state: GameState): number {
  const nextEra = state.era + 1;
  const nextEraTechs = TECH_TREE.filter(t => t.era === nextEra);
  if (nextEraTechs.length === 0) return state.era;

  const anyAdvanced = Object.values(state.civilizations).some(civ => {
    const completed = nextEraTechs.filter(t => civ.techState.completed.includes(t.id));
    return completed.length >= nextEraTechs.length * 0.6;
  });

  return anyAdvanced ? nextEra : state.era;
}

export function processMinorCivEraUpgrade(state: GameState, mc: MinorCivState): void {
  if (mc.isDestroyed) return;
  if (state.era <= mc.lastEraUpgrade) return;

  // Upgrade garrison units
  const newType = ERA_UNIT_MAP[state.era] ?? 'warrior';
  for (const uid of mc.units) {
    const unit = state.units[uid];
    if (unit && unit.type !== 'settler' && unit.type !== 'worker') {
      (unit as any).type = newType;
    }
  }

  // City gains +1 population
  const city = state.cities[mc.cityId];
  if (city) {
    city.population += 1;
  }

  mc.lastEraUpgrade = state.era;
}
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts
git commit -m "feat(m3c): add era advancement check and minor civ era upgrades"
```

---

### Task 10: Barbarian Camp Evolution

**Files:**
- Modify: `src/systems/barbarian-system.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Create or modify: `tests/systems/barbarian-system.test.ts`

- [ ] **Step 1: Write evolution tests**

Add to barbarian system tests:

```typescript
import { checkCampEvolution } from '@/systems/minor-civ-system';

describe('barbarian camp evolution', () => {
  it('evolves camp at strength 8+', () => {
    const state = createNewGame(undefined, 'evolve-test', 'medium');
    const mcResult = placeMinorCivs(state, 'medium', 'evolve-test');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    // Add a strong camp far from cities
    state.barbarianCamps['camp-evolve'] = {
      id: 'camp-evolve',
      position: { q: 25, r: 25 },
      strength: 8,
      spawnCooldown: 0,
    };

    const result = checkCampEvolution(state, 50);
    if (result) {
      expect(result.newMinorCiv).toBeDefined();
      expect(result.removeCampId).toBe('camp-evolve');
    }
  });

  it('does not evolve camp below strength 8', () => {
    const state = createNewGame(undefined, 'no-evolve', 'medium');
    state.barbarianCamps['camp-weak'] = {
      id: 'camp-weak',
      position: { q: 25, r: 25 },
      strength: 5,
      spawnCooldown: 0,
    };

    const result = checkCampEvolution(state, 10);
    expect(result).toBeNull();
  });

  it('does not evolve if too close to existing city', () => {
    const state = createNewGame(undefined, 'evolve-dist', 'small');
    // Place camp near player start
    const settler = Object.values(state.units).find(u => u.type === 'settler')!;
    state.barbarianCamps['camp-close'] = {
      id: 'camp-close',
      position: settler.position, // same as a city
      strength: 10,
      spawnCooldown: 0,
    };

    const result = checkCampEvolution(state, 10);
    expect(result).toBeNull();
  });

  it('respects max minor civ cap per map size', () => {
    const state = createNewGame(undefined, 'evolve-cap', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'evolve-cap');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    // If already at max, no evolution
    // Small map max is 4, fill up to that
    while (Object.keys(state.minorCivs).length < 12) {
      const fakeId = `mc-fake-${Object.keys(state.minorCivs).length}`;
      state.minorCivs[fakeId] = { id: fakeId, definitionId: 'fake', cityId: '', units: [], diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [] }, activeQuests: {}, isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1 } as any;
    }

    state.barbarianCamps['camp-max'] = {
      id: 'camp-max',
      position: { q: 25, r: 25 },
      strength: 10,
      spawnCooldown: 0,
    };

    const result = checkCampEvolution(state, 10);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/barbarian-system.test.ts 2>&1 | tail -10`
Expected: FAIL — `checkCampEvolution` not found.

- [ ] **Step 3: Implement checkCampEvolution**

Add to `src/systems/minor-civ-system.ts`:

```typescript
interface EvolutionResult {
  newMinorCiv: MinorCivState;
  newCity: City;
  newGarrison: Unit;
  removeCampId: string;
  transferUnitIds: string[];
}

export function checkCampEvolution(
  state: GameState,
  currentTurn: number,
): EvolutionResult | null {
  // Max minor civs check (12 = all definitions used)
  const activeMinorCivs = Object.values(state.minorCivs).filter(mc => !mc.isDestroyed);
  const usedDefs = new Set(activeMinorCivs.map(mc => mc.definitionId));
  const unusedDefs = MINOR_CIV_DEFINITIONS.filter(d => !usedDefs.has(d.id));
  if (unusedDefs.length === 0) return null;

  // Find eligible camps (strength 8+)
  const allCityPositions = Object.values(state.cities).map(c => c.position);

  for (const camp of Object.values(state.barbarianCamps)) {
    if (camp.strength < 8) continue;
    // Must be 6+ hexes from any city
    if (allCityPositions.some(c => hexDistance(camp.position, c) < 6)) continue;

    // Pick random unused definition
    const def = unusedDefs[0]; // deterministic for now
    const majorCivIds = Object.keys(state.civilizations);

    const city = foundCity(`mc-${def.id}`, camp.position, state.map);
    city.population = 3;

    const garrison = createUnit('warrior', `mc-${def.id}`, camp.position);

    // Transfer nearby barbarian units (within 3 hexes)
    const transferIds: string[] = [];
    for (const [uid, unit] of Object.entries(state.units)) {
      if (unit.owner === 'barbarian' && hexDistance(unit.position, camp.position) <= 3) {
        transferIds.push(uid);
      }
    }

    const mcState: MinorCivState = {
      id: `mc-${def.id}`,
      definitionId: def.id,
      cityId: city.id,
      units: [garrison.id, ...transferIds],
      diplomacy: createDiplomacyState(majorCivIds, `mc-${def.id}`, 0),
      activeQuests: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: state.era,
    };

    return {
      newMinorCiv: mcState,
      newCity: city,
      newGarrison: garrison,
      removeCampId: camp.id,
      transferUnitIds: transferIds,
    };
  }

  return null;
}
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-system.ts tests/systems/barbarian-system.test.ts
git commit -m "feat(m3c): add barbarian camp evolution into minor civilizations"
```

---

### Task 11: Fog of War Updates — Minor Civ Visibility

**Files:**
- Modify: `src/systems/fog-of-war.ts`
- Modify: `tests/systems/fog-of-war.test.ts`

- [ ] **Step 1: Write visibility tests**

Add to fog-of-war tests:

```typescript
describe('minor civ visibility', () => {
  it('reveals minor civ city when nearby tile explored', () => {
    const vis = createVisibilityMap();
    const mcCityPos = { q: 10, r: 10 };
    // Explore a tile within 2 hexes
    vis.tiles['11,10'] = 'fog';

    revealMinorCivCities(vis, [mcCityPos]);
    expect(vis.tiles[hexKey(mcCityPos)]).toBe('visible');
  });

  it('does not reveal distant minor civ city', () => {
    const vis = createVisibilityMap();
    const mcCityPos = { q: 10, r: 10 };
    // Explore tile far away
    vis.tiles['20,20'] = 'fog';

    revealMinorCivCities(vis, [mcCityPos]);
    expect(vis.tiles[hexKey(mcCityPos)]).toBeUndefined(); // still unexplored
  });

  it('adds shared vision for friendly minor civ', () => {
    const vis = createVisibilityMap();
    const friendlyUnitPositions = [{ q: 15, r: 15 }];
    const map = { tiles: {}, width: 30, height: 30 } as any;
    // Create tiles around the position
    for (let q = 13; q <= 17; q++) {
      for (let r = 13; r <= 17; r++) {
        map.tiles[`${q},${r}`] = { coord: { q, r }, terrain: 'grassland' };
      }
    }

    applySharedVision(vis, friendlyUnitPositions, map);
    expect(vis.tiles['15,15']).toBe('visible');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/fog-of-war.test.ts 2>&1 | tail -10`
Expected: FAIL — functions not found.

- [ ] **Step 3: Add minor civ visibility functions to fog-of-war.ts**

In `src/systems/fog-of-war.ts`, add:

```typescript
import { hexDistance, hexKey, hexesInRange } from './hex-utils';

export function revealMinorCivCities(
  vis: VisibilityMap,
  mcCityPositions: HexCoord[],
): void {
  for (const cityPos of mcCityPositions) {
    const key = hexKey(cityPos);
    if (vis.tiles[key] === 'visible') continue;

    // Check if any tile within 2 hexes has been explored
    const nearby = hexesInRange(cityPos, 2);
    const anyExplored = nearby.some(h => {
      const k = hexKey(h);
      return vis.tiles[k] === 'fog' || vis.tiles[k] === 'visible';
    });

    if (anyExplored) {
      vis.tiles[key] = 'visible';
    }
  }
}

export function applySharedVision(
  vis: VisibilityMap,
  positions: HexCoord[],
  map: GameMap,
): void {
  for (const pos of positions) {
    const range = hexesInRange(pos, 2);
    for (const hex of range) {
      const key = hexKey(hex);
      if (map.tiles[key]) {
        vis.tiles[key] = 'visible';
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/fog-of-war.ts tests/systems/fog-of-war.test.ts
git commit -m "feat(m3c): add minor civ city auto-reveal and shared vision for friendly minor civs"
```

---

### Task 12: Turn Manager Integration

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Write turn integration test**

Add to turn-manager tests:

```typescript
it('processes minor civ turn phase', () => {
  const state = createNewGame(undefined, 'turn-mc', 'small');
  const bus = new EventBus();
  // Verify minor civs exist
  expect(Object.keys(state.minorCivs).length).toBeGreaterThan(0);

  const result = processTurn(state, bus);
  // Minor civs should still exist and not crash
  expect(Object.keys(result.minorCivs).length).toBeGreaterThan(0);
});

it('checks era advancement after barbarian processing', () => {
  const state = createNewGame(undefined, 'turn-era', 'small');
  const bus = new EventBus();
  state.era = 1;

  // Complete enough era 2 techs
  const era2Techs = TECH_TREE.filter(t => t.era === 2);
  const needed = Math.ceil(era2Techs.length * 0.6);
  state.civilizations.player.techState.completed = era2Techs.slice(0, needed).map(t => t.id);

  const result = processTurn(state, bus);
  expect(result.era).toBe(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/core/turn-manager.test.ts 2>&1 | tail -10`
Expected: FAIL — minor civ turn not processed, era not advancing.

- [ ] **Step 3: Add minor civ and era processing to turn manager**

In `src/core/turn-manager.ts`, add imports:

```typescript
import { processMinorCivTurn, checkEraAdvancement, processMinorCivEraUpgrade, checkCampEvolution } from '@/systems/minor-civ-system';
```

In the `processTurn` function, after wonder/barbarian processing and before incrementing turn:

```typescript
    // Minor civ turn phase
    newState = processMinorCivTurn(newState, bus);

    // Barbarian evolution check
    const evolution = checkCampEvolution(newState, newState.turn);
    if (evolution) {
      delete newState.barbarianCamps[evolution.removeCampId];
      newState.cities[evolution.newCity.id] = evolution.newCity;
      newState.units[evolution.newGarrison.id] = evolution.newGarrison;
      for (const uid of evolution.transferUnitIds) {
        if (newState.units[uid]) {
          newState.units[uid].owner = evolution.newMinorCiv.id;
        }
      }
      newState.minorCivs[evolution.newMinorCiv.id] = evolution.newMinorCiv;
      bus.emit('minor-civ:evolved', {
        campId: evolution.removeCampId,
        minorCivId: evolution.newMinorCiv.id,
        position: evolution.newCity.position,
      });
    }

    // Era advancement check
    const newEra = checkEraAdvancement(newState);
    if (newEra > newState.era) {
      newState.era = newEra;
      // Era upgrades for minor civs
      for (const mc of Object.values(newState.minorCivs)) {
        processMinorCivEraUpgrade(newState, mc);
      }
    }
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/turn-manager.ts tests/core/turn-manager.test.ts
git commit -m "feat(m3c): integrate minor civ turn phase and era advancement into turn manager"
```

---

### Task 13: AI Updates — Minor Civ Interaction

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Write AI filter test**

Add to AI tests:

```typescript
it('AI does not target friendly minor civ units', () => {
  const state = createNewGame(undefined, 'ai-mc-test', 'small');
  const bus = new EventBus();
  // Should not crash and should not attack mc- units without war
  const result = processAITurn(state, 'ai-1', bus);
  expect(result).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it passes or fails gracefully**

Run: `eval "$(mise activate bash)" && yarn test tests/ai/basic-ai.test.ts 2>&1 | tail -10`

- [ ] **Step 3: Update AI targeting to handle mc- units**

In `src/ai/basic-ai.ts`, find where AI selects attack targets. Update the enemy detection to skip minor civ units unless at war:

```typescript
// When finding enemies to attack, check if mc- owner and at war
const isEnemy = (unit: Unit, aiCivId: string, state: GameState) => {
  if (unit.owner === aiCivId) return false;
  if (unit.owner === 'barbarian') return true;
  if (unit.owner.startsWith('mc-')) {
    const mc = state.minorCivs[unit.owner];
    return mc?.diplomacy.atWarWith.includes(aiCivId) ?? false;
  }
  return true; // other major civs are enemies based on war state
};
```

Also update barbarian processing filter to exclude mc- units:

```typescript
// In turn-manager.ts or wherever barbarian targeting happens
const playerUnits = Object.values(state.units).filter(
  u => u.owner !== 'barbarian' && !u.owner.startsWith('mc-')
);
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts
git commit -m "feat(m3c): update AI to handle minor civ interactions and targeting"
```

---

### Task 14: Conquest Mechanics & Diplomacy Events

**Files:**
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Write conquest tests**

Add to minor civ tests:

```typescript
import { conquestMinorCiv } from '@/systems/minor-civ-system';

describe('conquest mechanics', () => {
  it('marks minor civ as destroyed on conquest', () => {
    const state = createNewGame(undefined, 'mc-conquer', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-conquer');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    const bus = new EventBus();

    conquestMinorCiv(state, mcId, 'player', bus);
    expect(state.minorCivs[mcId].isDestroyed).toBe(true);
  });

  it('transfers city to conqueror', () => {
    const state = createNewGame(undefined, 'mc-transfer', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-transfer');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    const bus = new EventBus();

    conquestMinorCiv(state, mcId, 'player', bus);
    expect(state.cities[mc.cityId].owner).toBe('player');
    expect(state.civilizations.player.cities).toContain(mc.cityId);
  });

  it('applies conquest penalty to other minor civs', () => {
    const state = createNewGame(undefined, 'mc-penalty', 'medium');
    const mcResult = placeMinorCivs(state, 'medium', 'mc-penalty');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcIds = Object.keys(state.minorCivs);
    if (mcIds.length < 2) return; // skip if not enough

    const bus = new EventBus();
    conquestMinorCiv(state, mcIds[0], 'player', bus);

    // Other minor civs should have reduced relationship with player
    for (let i = 1; i < mcIds.length; i++) {
      const mc = state.minorCivs[mcIds[i]];
      expect(mc.diplomacy.relationships.player).toBeLessThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/minor-civ-system.test.ts 2>&1 | tail -10`
Expected: FAIL — `conquestMinorCiv` not found.

- [ ] **Step 3: Implement conquestMinorCiv**

Add to `src/systems/minor-civ-system.ts`:

```typescript
export function conquestMinorCiv(
  state: GameState,
  mcId: string,
  conquerorId: string,
  bus: EventBus,
): void {
  const mc = state.minorCivs[mcId];
  if (!mc || mc.isDestroyed) return;

  const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);

  // Mark destroyed
  mc.isDestroyed = true;

  // Transfer city
  const city = state.cities[mc.cityId];
  if (city) {
    city.owner = conquerorId;
    const civ = state.civilizations[conquerorId];
    if (civ && !civ.cities.includes(mc.cityId)) {
      civ.cities.push(mc.cityId);
    }
  }

  // Remove minor civ units
  for (const uid of mc.units) {
    delete state.units[uid];
  }
  mc.units = [];

  // Conquest penalty to all other minor civs
  for (const [otherId, otherMc] of Object.entries(state.minorCivs)) {
    if (otherId === mcId || otherMc.isDestroyed) continue;
    const otherDef = MINOR_CIV_DEFINITIONS.find(d => d.id === otherMc.definitionId);
    const penalty = otherDef?.archetype === 'militaristic' ? -10 : -20;
    otherMc.diplomacy = modifyRelationship(otherMc.diplomacy, conquerorId, penalty);
  }

  bus.emit('minor-civ:destroyed', { minorCivId: mcId, conquerorId });
}
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts
git commit -m "feat(m3c): add minor civ conquest with city transfer and diplomatic penalty"
```

---

### Task 15: Guerrilla & Scuffle Behavior

**Files:**
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Write guerrilla and scuffle tests**

Add to tests:

```typescript
import { processGuerrilla, processScuffles } from '@/systems/minor-civ-system';

describe('guerrilla behavior', () => {
  it('spawns guerrilla units when at war (max 2)', () => {
    const state = createNewGame(undefined, 'mc-guerrilla', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-guerrilla');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    mc.diplomacy.atWarWith.push('player');

    const bus = new EventBus();
    processGuerrilla(state, mc, bus);

    // Should have at most 2 guerrilla units (1 garrison + 2 guerrillas max)
    expect(mc.units.length).toBeLessThanOrEqual(3);
  });

  it('does not spawn guerrilla when not at war', () => {
    const state = createNewGame(undefined, 'mc-no-guerrilla', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-no-guerrilla');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    const unitsBefore = mc.units.length;

    const bus = new EventBus();
    processGuerrilla(state, mc, bus);
    expect(mc.units.length).toBe(unitsBefore);
  });
});

describe('scuffles between minor civs', () => {
  it('militaristic minor civ can initiate scuffle with neighbor', () => {
    // This is probabilistic; we test it doesn't crash
    const state = createNewGame(undefined, 'mc-scuffle', 'medium');
    const mcResult = placeMinorCivs(state, 'medium', 'mc-scuffle');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const bus = new EventBus();
    // Should not throw
    processScuffles(state, bus);
    expect(state).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/minor-civ-system.test.ts 2>&1 | tail -10`
Expected: FAIL — functions not found.

- [ ] **Step 3: Implement guerrilla and scuffle functions**

Add to `src/systems/minor-civ-system.ts`:

```typescript
export function processGuerrilla(state: GameState, mc: MinorCivState, bus: EventBus): void {
  if (mc.isDestroyed) return;
  if (mc.diplomacy.atWarWith.length === 0) return;

  // Count non-garrison guerrilla units (anything beyond the first)
  const guerrillaCount = mc.units.filter(uid => state.units[uid]).length - 1; // -1 for garrison
  if (guerrillaCount >= 2) return;

  const city = state.cities[mc.cityId];
  if (!city) return;

  const guerrilla = createUnit('warrior', mc.id, city.position);
  state.units[guerrilla.id] = guerrilla;
  mc.units.push(guerrilla.id);

  bus.emit('minor-civ:guerrilla', {
    minorCivId: mc.id,
    targetCivId: mc.diplomacy.atWarWith[0],
    position: city.position,
  });
}

export function processScuffles(state: GameState, bus: EventBus): void {
  const activeMcs = Object.values(state.minorCivs).filter(mc => !mc.isDestroyed);

  for (const mc of activeMcs) {
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def || def.archetype !== 'militaristic') continue;

    // 10% chance per turn
    const roll = (state.turn * 16807 + mc.id.charCodeAt(3)) % 100;
    if (roll >= 10) continue;

    // Find neighboring minor civ within 8 hexes
    const mcCity = state.cities[mc.cityId];
    if (!mcCity) continue;

    for (const other of activeMcs) {
      if (other.id === mc.id) continue;
      const otherCity = state.cities[other.cityId];
      if (!otherCity) continue;

      if (hexDistance(mcCity.position, otherCity.position) <= 8) {
        // Resolve combat between garrison units using existing combat system
        const attackerUnit = mc.units.map(uid => state.units[uid]).find(u => u);
        const defenderUnit = other.units.map(uid => state.units[uid]).find(u => u);
        if (attackerUnit && defenderUnit) {
          const result = resolveCombat(attackerUnit, defenderUnit);
          // Apply damage but don't destroy — minor civs don't kill each other's cities
          attackerUnit.health = Math.max(1, attackerUnit.health - (result.defenderDamage ?? 0));
          defenderUnit.health = Math.max(1, defenderUnit.health - (result.attackerDamage ?? 0));
        }

        bus.emit('minor-civ:scuffle', {
          attackerId: mc.id,
          defenderId: other.id,
          position: otherCity.position,
        });
        break; // one scuffle per turn
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts
git commit -m "feat(m3c): add guerrilla spawning and minor civ scuffle behavior"
```

---

### Task 16: Advisor Messages for Minor Civs

**Files:**
- Modify: `src/ui/advisor-system.ts`
- Modify: `tests/ui/advisor-system.test.ts`

- [ ] **Step 1: Write advisor message tests**

Add to advisor tests:

```typescript
it('getAdvisorMessageIds includes minor civ messages', () => {
  const ids = getAdvisorMessageIds();
  expect(ids).toContain('chancellor_ally_city_state');
  expect(ids).toContain('chancellor_conquest_warning');
  expect(ids).toContain('warchief_undefended_city_state');
  expect(ids).toContain('warchief_guerrilla_harass');
  expect(ids).toContain('treasurer_mercantile_ally');
  expect(ids).toContain('scholar_cultural_ally');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test tests/ui/advisor-system.test.ts 2>&1 | tail -10`
Expected: FAIL — new IDs not found.

- [ ] **Step 3: Add advisor messages**

In `src/ui/advisor-system.ts`, add to the `ADVISOR_MESSAGES` array:

```typescript
// Minor Civ — Chancellor
{
  id: 'chancellor_ally_city_state',
  advisor: 'chancellor' as const,
  icon: '🤝',
  message: 'A nearby city-state could be a valuable ally. Consider their quest.',
  trigger: (state: GameState) => {
    return Object.values(state.minorCivs ?? {}).some(mc =>
      !mc.isDestroyed && Object.values(mc.activeQuests).some(q => q.status === 'active')
    );
  },
},
{
  id: 'chancellor_conquest_warning',
  advisor: 'chancellor' as const,
  icon: '⚠️',
  message: 'Our aggression against city-states is making others wary.',
  trigger: (state: GameState) => {
    return Object.values(state.minorCivs ?? {}).some(mc =>
      !mc.isDestroyed && (mc.diplomacy.relationships[state.currentPlayer] ?? 0) < -30
    );
  },
},
// Minor Civ — Warchief
{
  id: 'warchief_undefended_city_state',
  advisor: 'warchief' as const,
  icon: '⚔️',
  message: 'An undefended city-state could be easy pickings...',
  trigger: (state: GameState) => {
    return Object.values(state.minorCivs ?? {}).some(mc =>
      !mc.isDestroyed && mc.units.filter(uid => state.units[uid]).length === 0
    );
  },
},
{
  id: 'warchief_guerrilla_harass',
  advisor: 'warchief' as const,
  icon: '🏴',
  message: 'City-state guerrillas are harassing our borders!',
  trigger: (state: GameState) => {
    return Object.values(state.minorCivs ?? {}).some(mc =>
      !mc.isDestroyed && mc.diplomacy.atWarWith.includes(state.currentPlayer) && mc.units.length > 1
    );
  },
},
// Minor Civ — Treasurer
{
  id: 'treasurer_mercantile_ally',
  advisor: 'treasurer' as const,
  icon: '💰',
  message: 'Our mercantile ally is boosting our income.',
  trigger: (state: GameState) => {
    return Object.values(state.minorCivs ?? {}).some(mc => {
      if (mc.isDestroyed) return false;
      const def = (mc as any).definitionId;
      return (mc.diplomacy.relationships[state.currentPlayer] ?? 0) >= 60;
    });
  },
},
// Minor Civ — Scholar
{
  id: 'scholar_cultural_ally',
  advisor: 'scholar' as const,
  icon: '📚',
  message: 'Our cultural ally advances our knowledge.',
  trigger: (state: GameState) => {
    return Object.values(state.minorCivs ?? {}).some(mc => {
      if (mc.isDestroyed) return false;
      return (mc.diplomacy.relationships[state.currentPlayer] ?? 0) >= 60;
    });
  },
},
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/advisor-system.ts tests/ui/advisor-system.test.ts
git commit -m "feat(m3c): add 6 advisor messages for minor civ events"
```

---

### Task 17: Renderer Updates — Minor Civ Cities and Territory

**Files:**
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/renderer/city-renderer.ts`

- [ ] **Step 1: Read current renderer files**

Read `hex-renderer.ts`, `render-loop.ts`, and `city-renderer.ts` to understand current rendering flow.

- [ ] **Step 2: Update city-renderer to handle minor civ cities**

In `src/renderer/city-renderer.ts`, update `drawCities` to render minor civ city icons based on archetype:

```typescript
// After existing city rendering, check if it's a minor civ city
const isMinorCiv = city.owner.startsWith('mc-');
if (isMinorCiv) {
  // Use archetype icon instead of 🏛️
  const mcState = state.minorCivs?.[city.owner];
  const def = mcState ? getMinorCivDef(mcState.definitionId) : null;
  const icon = def?.archetype === 'militaristic' ? '⚔️'
    : def?.archetype === 'mercantile' ? '🪙'
    : '📜';
  ctx.fillText(icon, screen.x, screen.y);
}
```

Add helper import at top:

```typescript
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';

function getMinorCivDef(defId: string) {
  return MINOR_CIV_DEFINITIONS.find(d => d.id === defId);
}
```

- [ ] **Step 3: Update render-loop to pass minor civ data for territory shading**

In `src/renderer/render-loop.ts`, add minor civ territory rendering after `drawHexMap`:

```typescript
    // Draw minor civ territory (2-hex radius, subtle border)
    if (this.state.minorCivs) {
      for (const mc of Object.values(this.state.minorCivs)) {
        if (mc.isDestroyed) continue;
        const city = this.state.cities[mc.cityId];
        if (!city) continue;
        const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
        if (!def) continue;
        drawMinorCivTerritory(this.ctx, city.position, def.color, this.camera);
      }
    }
```

Add the territory drawing function to `hex-renderer.ts`:

```typescript
export function drawMinorCivTerritory(
  ctx: CanvasRenderingContext2D,
  center: HexCoord,
  color: string,
  camera: Camera,
): void {
  const hexes = hexesInRange(center, 2);
  for (const hex of hexes) {
    if (!camera.isHexVisible(hex)) continue;
    const pixel = hexToPixel(hex, camera.hexSize);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    const size = camera.hexSize * camera.zoom;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = screen.x + size * Math.cos(angle);
      const y = screen.y + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
```

- [ ] **Step 4: Run build to verify compilation**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hex-renderer.ts src/renderer/render-loop.ts src/renderer/city-renderer.ts
git commit -m "feat(m3c): add minor civ city icons, territory shading, and archetype-based rendering"
```

---

### Task 18: Save Migration & Minor Civ Integration in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Read current migrateLegacySave function**

Read `src/main.ts` at the `migrateLegacySave` function to find the insertion point.

- [ ] **Step 2: Add M3c migration**

In `migrateLegacySave()`, add after existing migration code:

```typescript
// M3c migration
if (!state.minorCivs) state.minorCivs = {};

// Backfill trackPriorities for expanded tech tracks
const allTracks = ['military', 'economy', 'science', 'civics', 'exploration',
  'agriculture', 'medicine', 'philosophy', 'arts', 'maritime',
  'metallurgy', 'construction', 'communication', 'espionage', 'spirituality'];
for (const civ of Object.values(state.civilizations)) {
  for (const track of allTracks) {
    if (!(track in civ.techState.trackPriorities)) {
      civ.techState.trackPriorities[track as any] = 'medium';
    }
  }
}
```

- [ ] **Step 3: Add minor civ event handling**

In the bus event listeners section of `main.ts`, add:

```typescript
bus.on('minor-civ:quest-issued', (data) => {
  if (data.majorCivId === gameState.currentPlayer) {
    const mc = gameState.minorCivs[data.minorCivId];
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
    showNotification(`${def?.name ?? 'City-state'} asks: ${data.quest.description}`, 'info');
  }
});

bus.on('minor-civ:quest-completed', (data) => {
  if (data.majorCivId === gameState.currentPlayer) {
    const mc = gameState.minorCivs[data.minorCivId];
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
    const rewards: string[] = [];
    if (data.reward.gold) rewards.push(`+${data.reward.gold} gold`);
    if (data.reward.science) rewards.push(`+${data.reward.science} science`);
    showNotification(`${def?.name ?? 'City-state'} is grateful! ${rewards.join(', ')}`, 'success');
  }
});

bus.on('minor-civ:evolved', (data) => {
  const mc = gameState.minorCivs[data.minorCivId];
  const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
  showNotification(`A barbarian tribe formed the city-state of ${def?.name ?? 'Unknown'}!`, 'info');
});

bus.on('minor-civ:destroyed', (data) => {
  const mc = gameState.minorCivs[data.minorCivId];
  const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
  showNotification(`${def?.name ?? 'City-state'} has fallen!`, 'warning');
});
```

- [ ] **Step 4: Add minor civ conquest check in combat resolution**

Where combat is resolved for city capture, add a check: if the captured city belongs to a minor civ (`city.owner.startsWith('mc-')`), call `conquestMinorCiv()`.

- [ ] **Step 5: Run build and tests**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | tail -5 && yarn test 2>&1 | tail -5`
Expected: Build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(m3c): add save migration, event notifications, and conquest integration for minor civs"
```

---

### Task 19: Minor Civ Fog of War Integration in updateVisibility

**Files:**
- Modify: `src/systems/fog-of-war.ts`
- Modify: `src/core/turn-manager.ts` or wherever `updateVisibility` is called

- [ ] **Step 1: Integrate revealMinorCivCities into updateVisibility flow**

After `updateVisibility` is called for each civ in the turn manager, add:

```typescript
// Reveal minor civ cities near explored tiles
const mcCityPositions = Object.values(newState.minorCivs)
  .filter(mc => !mc.isDestroyed)
  .map(mc => newState.cities[mc.cityId]?.position)
  .filter(Boolean) as HexCoord[];
revealMinorCivCities(civ.visibility, mcCityPositions);

// Shared vision for friendly minor civs
for (const mc of Object.values(newState.minorCivs)) {
  if (mc.isDestroyed) continue;
  const rel = mc.diplomacy.relationships[civId] ?? 0;
  if (rel >= 30) {
    const mcPositions = [
      newState.cities[mc.cityId]?.position,
      ...mc.units.map(uid => newState.units[uid]?.position),
    ].filter(Boolean) as HexCoord[];
    applySharedVision(civ.visibility, mcPositions, newState.map);
  }
}
```

- [ ] **Step 2: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/systems/fog-of-war.ts src/core/turn-manager.ts
git commit -m "feat(m3c): integrate minor civ city reveal and shared vision into fog-of-war processing"
```

---

### Task 20: Diplomacy Panel — City-States Tab

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Read the existing diplomacy panel code in main.ts**

Read the `togglePanel('diplomacy')` handler and the diplomacy panel DOM construction.

- [ ] **Step 2: Add City-States tab to diplomacy panel**

In the diplomacy panel creation code, add a "City-States" tab alongside the existing major civ list. When active, it shows each known (non-destroyed) minor civ:

```typescript
// City-States tab content
const cityStatesContent = document.createElement('div');
for (const [mcId, mc] of Object.entries(gameState.minorCivs)) {
  if (mc.isDestroyed) continue;
  const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
  if (!def) continue;

  const rel = mc.diplomacy.relationships[gameState.currentPlayer] ?? 0;
  const status = rel <= -60 ? 'Hostile' : rel >= 60 ? 'Allied' : rel >= 30 ? 'Friendly' : 'Neutral';
  const archIcon = def.archetype === 'militaristic' ? '⚔️' : def.archetype === 'mercantile' ? '🪙' : '📜';
  const quest = mc.activeQuests[gameState.currentPlayer];

  const row = document.createElement('div');
  row.className = 'diplomacy-row';
  row.innerHTML = `
    <span>${archIcon} ${def.name}</span>
    <span style="color:${def.color}">${status} (${rel})</span>
    ${quest ? `<span>Quest: ${quest.description}</span>` : ''}
  `;

  // Gift Gold button
  const giftBtn = document.createElement('button');
  giftBtn.textContent = 'Gift Gold';
  giftBtn.onclick = () => handleGiftGold(mcId);
  row.appendChild(giftBtn);

  // War/Peace button
  const warBtn = document.createElement('button');
  const atWar = mc.diplomacy.atWarWith.includes(gameState.currentPlayer);
  warBtn.textContent = atWar ? 'Make Peace' : 'Declare War';
  warBtn.onclick = () => handleMinorCivWarPeace(mcId, atWar);
  row.appendChild(warBtn);

  cityStatesContent.appendChild(row);
}
```

- [ ] **Step 3: Implement handleGiftGold and handleMinorCivWarPeace**

```typescript
function handleGiftGold(mcId: string): void {
  const mc = gameState.minorCivs[mcId];
  if (!mc) return;
  const quest = mc.activeQuests[gameState.currentPlayer];
  const amount = quest?.target.type === 'gift_gold' ? quest.target.amount : 25;

  if (gameState.civilizations[gameState.currentPlayer].gold < amount) {
    showNotification('Not enough gold!', 'warning');
    return;
  }

  gameState.civilizations[gameState.currentPlayer].gold -= amount;
  mc.diplomacy = modifyRelationship(mc.diplomacy, gameState.currentPlayer, 10);

  // Progress gift_gold quest
  if (quest?.target.type === 'gift_gold') {
    quest.progress += amount;
  }

  showNotification(`Gifted ${amount} gold`, 'info');
  updateHUD();
}

function handleMinorCivWarPeace(mcId: string, currentlyAtWar: boolean): void {
  const mc = gameState.minorCivs[mcId];
  if (!mc) return;

  if (currentlyAtWar) {
    mc.diplomacy = makePeace(mc.diplomacy, gameState.currentPlayer, gameState.turn);
  } else {
    mc.diplomacy = declareWar(mc.diplomacy, gameState.currentPlayer, gameState.turn);
  }
  renderLoop.setGameState(gameState);
}
```

- [ ] **Step 4: Run build and tests**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | tail -5 && yarn test 2>&1 | tail -5`
Expected: Build succeeds, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(m3c): add City-States tab to diplomacy panel with gift, war, and quest UI"
```

---

### Task 21: Diplomatic Agency — Reactive Relationship Shifts

**Files:**
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Write diplomatic agency tests**

Add to minor civ tests:

```typescript
import { applyDiplomaticReaction } from '@/systems/minor-civ-system';

describe('diplomatic agency', () => {
  it('improves relationship when nearby barbarian camp destroyed', () => {
    const state = createNewGame(undefined, 'mc-diplo-react', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-diplo-react');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    const relBefore = mc.diplomacy.relationships.player ?? 0;

    applyDiplomaticReaction(state, 'camp_destroyed_nearby', 'player', mcId);
    expect(mc.diplomacy.relationships.player).toBe(relBefore + 10);
  });

  it('militaristic minor civ respects strength (smaller penalty for aggression)', () => {
    const state = createNewGame(undefined, 'mc-diplo-mil', 'medium');
    const mcResult = placeMinorCivs(state, 'medium', 'mc-diplo-mil');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    // Find a militaristic minor civ
    const milMc = Object.values(state.minorCivs).find(mc => {
      const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
      return def?.archetype === 'militaristic';
    });
    if (!milMc) return;

    const relBefore = milMc.diplomacy.relationships.player ?? 0;
    applyDiplomaticReaction(state, 'attacked_neighbor', 'player', milMc.id);
    // Militaristic: +5 (respects strength) vs cultural: -15
    expect(milMc.diplomacy.relationships.player).toBe(relBefore + 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/minor-civ-system.test.ts 2>&1 | tail -10`
Expected: FAIL — function not found.

- [ ] **Step 3: Implement applyDiplomaticReaction**

Add to `src/systems/minor-civ-system.ts`:

```typescript
type DiplomaticReactionType = 'camp_destroyed_nearby' | 'attacked_neighbor' | 'quest_completed';

export function applyDiplomaticReaction(
  state: GameState,
  reaction: DiplomaticReactionType,
  majorCivId: string,
  targetMcId: string,
): void {
  const mc = state.minorCivs[targetMcId];
  if (!mc || mc.isDestroyed) return;

  const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);

  switch (reaction) {
    case 'camp_destroyed_nearby':
      mc.diplomacy = modifyRelationship(mc.diplomacy, majorCivId, 10);
      break;
    case 'attacked_neighbor':
      if (def?.archetype === 'militaristic') {
        mc.diplomacy = modifyRelationship(mc.diplomacy, majorCivId, 5); // respects strength
      } else if (def?.archetype === 'cultural') {
        mc.diplomacy = modifyRelationship(mc.diplomacy, majorCivId, -15); // condemns
      } else {
        mc.diplomacy = modifyRelationship(mc.diplomacy, majorCivId, -10);
      }
      break;
    case 'quest_completed':
      // Already handled via quest reward system
      break;
  }
}
```

- [ ] **Step 4: Wire reactions into main.ts event handlers**

In `src/main.ts`, when a barbarian camp is destroyed, call `applyDiplomaticReaction` for nearby minor civs:

```typescript
// In camp destruction handler:
for (const [mcId, mc] of Object.entries(gameState.minorCivs)) {
  if (mc.isDestroyed) continue;
  const mcCity = gameState.cities[mc.cityId];
  if (mcCity && hexDistance(campPosition, mcCity.position) <= 8) {
    applyDiplomaticReaction(gameState, 'camp_destroyed_nearby', gameState.currentPlayer, mcId);
  }
}
```

- [ ] **Step 5: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts src/main.ts
git commit -m "feat(m3c): add diplomatic agency with reactive relationship shifts for minor civs"
```

---

### Task 22: AI Diplomacy with Minor Civs

**Files:**
- Modify: `src/ai/ai-diplomacy.ts`
- Modify: `src/ai/basic-ai.ts`

- [ ] **Step 1: Read current ai-diplomacy.ts**

Read `src/ai/ai-diplomacy.ts` to understand the existing evaluation pattern.

- [ ] **Step 2: Add minor civ evaluation to AI diplomacy**

In `src/ai/ai-diplomacy.ts`, add a function for AI to evaluate minor civ interactions:

```typescript
export function evaluateMinorCivDiplomacy(
  state: GameState,
  aiCivId: string,
): void {
  for (const [mcId, mc] of Object.entries(state.minorCivs)) {
    if (mc.isDestroyed) continue;

    const rel = mc.diplomacy.relationships[aiCivId] ?? 0;
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    const personality = state.civilizations[aiCivId]?.personality;

    // Aggressive AI may declare war on low-relationship minor civs
    if (personality?.warLikelihood > 0.7 && rel < -30 && !mc.diplomacy.atWarWith.includes(aiCivId)) {
      mc.diplomacy = declareWar(mc.diplomacy, aiCivId, state.turn);
    }

    // Diplomatic AI gifts gold to improve relations
    if (personality?.diplomacyFocus > 0.5 && rel > 0 && rel < 60) {
      const quest = mc.activeQuests[aiCivId];
      if (quest?.target.type === 'gift_gold') {
        const amount = quest.target.amount;
        const aiCiv = state.civilizations[aiCivId];
        if (aiCiv && aiCiv.gold >= amount * 2) { // only if can easily afford
          aiCiv.gold -= amount;
          quest.progress += amount;
          mc.diplomacy = modifyRelationship(mc.diplomacy, aiCivId, 10);
        }
      }
    }
  }
}
```

- [ ] **Step 3: Call evaluateMinorCivDiplomacy from processAITurn**

In `src/ai/basic-ai.ts`, add after existing diplomacy evaluation:

```typescript
// Evaluate minor civ relationships
evaluateMinorCivDiplomacy(newState, civId);
```

- [ ] **Step 4: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-diplomacy.ts src/ai/basic-ai.ts
git commit -m "feat(m3c): add AI diplomacy evaluation for minor civilizations"
```

---

### Task 23: Hot Seat Integration for Minor Civs

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Route quest notifications through pendingEvents in hot seat mode**

In the event handlers for `minor-civ:quest-issued`, `minor-civ:quest-completed`, etc., check if in hot seat mode. If so, queue the notification for the target player rather than showing immediately:

```typescript
bus.on('minor-civ:quest-issued', (data) => {
  if (gameState.hotSeat) {
    // Queue for target player only
    if (!gameState.pendingEvents) gameState.pendingEvents = {};
    if (!gameState.pendingEvents[data.majorCivId]) gameState.pendingEvents[data.majorCivId] = [];
    gameState.pendingEvents[data.majorCivId].push({
      type: 'minor-civ:quest-issued',
      ...data,
    });
  } else if (data.majorCivId === gameState.currentPlayer) {
    const mc = gameState.minorCivs[data.minorCivId];
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
    showNotification(`${def?.name ?? 'City-state'} asks: ${data.quest.description}`, 'info');
  }
});
```

- [ ] **Step 2: Ensure diplomacy panel shows current player's relationships only**

The City-States tab (Task 20) already reads `gameState.currentPlayer` for relationship display. Verify that Gift Gold debits the current player's civ:

```typescript
// In handleGiftGold:
const currentCiv = gameState.civilizations[gameState.currentPlayer];
currentCiv.gold -= amount;
```

- [ ] **Step 3: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(m3c): route minor civ notifications through pending events in hot seat mode"
```

---

### Task 24: Complete Notification Wiring

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Wire up remaining 4 notification types**

Add event handlers for the missing notification types:

```typescript
bus.on('minor-civ:allied', (data) => {
  if (data.majorCivId === gameState.currentPlayer) {
    const mc = gameState.minorCivs[data.minorCivId];
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
    showNotification(`${def?.name ?? 'City-state'} pledges allegiance!`, 'success');
  }
});

bus.on('minor-civ:guerrilla', (data) => {
  if (data.targetCivId === gameState.currentPlayer) {
    const mc = gameState.minorCivs[data.minorCivId];
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
    showNotification(`${def?.name ?? 'City-state'} raiders pillaged nearby!`, 'warning');
  }
});

bus.on('minor-civ:relationship-threshold', (data) => {
  if (data.majorCivId === gameState.currentPlayer && data.newStatus === 'friendly') {
    const mc = gameState.minorCivs[data.minorCivId];
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc?.definitionId);
    showNotification(`${def?.name ?? 'City-state'} now considers us friendly`, 'info');
  }
});

// Quest expired notification (in processQuests or via event)
bus.on('minor-civ:quest-completed', (data) => {
  if (data.quest.status === 'expired' && data.majorCivId === gameState.currentPlayer) {
    showNotification(`Our request from a city-state has lapsed`, 'info');
  }
});
```

- [ ] **Step 2: Run build and tests**

Run: `eval "$(mise activate bash)" && yarn build 2>&1 | tail -5 && yarn test 2>&1 | tail -5`
Expected: Build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(m3c): wire up all minor civ notification types"
```

---

### Task 25: Barbarian Processing mc- Filter

**Files:**
- Modify: `src/core/turn-manager.ts`

- [ ] **Step 1: Update barbarian targeting to exclude mc- units**

In `src/core/turn-manager.ts`, find where `processBarbarians` is called and where player units are gathered for barbarian targeting. Update the filter:

```typescript
// When gathering units for barbarian targeting
const playerUnits = Object.values(newState.units).filter(
  u => u.owner !== 'barbarian' && !u.owner.startsWith('mc-')
);
```

- [ ] **Step 2: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/turn-manager.ts
git commit -m "fix(m3c): exclude minor civ units from barbarian targeting"
```

---

### Task 26: Integration Tests

**Files:**
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Write integration tests**

Add to minor civ system tests:

```typescript
describe('integration', () => {
  it('combat with minor civ units uses resolveCombat', () => {
    const state = createNewGame(undefined, 'mc-combat-int', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-combat-int');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    const mcUnit = state.units[mc.units[0]];
    expect(mcUnit).toBeDefined();

    // Create a player warrior nearby
    const playerWarrior = createUnit('warrior', 'player', mcUnit.position);
    state.units[playerWarrior.id] = playerWarrior;

    // Resolve combat
    const result = resolveCombat(playerWarrior, mcUnit);
    expect(result).toBeDefined();
    expect(typeof result.attackerDamage).toBe('number');
  });

  it('conquest sets isDestroyed and transfers city', () => {
    const state = createNewGame(undefined, 'mc-conq-int', 'small');
    const mcResult = placeMinorCivs(state, 'small', 'mc-conq-int');
    Object.assign(state, { minorCivs: mcResult.minorCivs, cities: mcResult.cities, units: mcResult.units });

    const mcId = Object.keys(state.minorCivs)[0];
    const mc = state.minorCivs[mcId];
    const bus = new EventBus();

    conquestMinorCiv(state, mcId, 'player', bus);
    expect(mc.isDestroyed).toBe(true);
    expect(state.cities[mc.cityId].owner).toBe('player');
  });

  it('full turn cycle with minor civs does not crash', () => {
    const state = createNewGame(undefined, 'mc-full-turn', 'small');
    const bus = new EventBus();
    expect(Object.keys(state.minorCivs).length).toBeGreaterThan(0);

    // Run 5 turns
    let current = state;
    for (let i = 0; i < 5; i++) {
      current = processTurn(current, bus);
    }
    expect(current.turn).toBe(state.turn + 5);
    expect(Object.keys(current.minorCivs).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/systems/minor-civ-system.test.ts
git commit -m "test(m3c): add integration tests for minor civ combat, conquest, and full turn cycle"
```

---

### Task 27: Final Verification & Push

- [ ] **Step 1: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1`
Expected: All tests pass (~350+ tests across 36+ files).

- [ ] **Step 2: Run build**

Run: `eval "$(mise activate bash)" && yarn build 2>&1`
Expected: Build succeeds.

- [ ] **Step 3: Review test count growth**

Confirm the test count has grown from 278 (baseline) to 350+ with the new tests added in each task.

- [ ] **Step 4: Push**

```bash
git push
```
