# Structured Tech Unlocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `unlocksUnits`/`unlocksBuildings` typed arrays to `Tech`, migrate all entity names out of free-text `unlocks`, close the test loop so gating and declaration can never drift, and fix the transport-ship tech-tree display gaps that made Transport/Carrack/Galleon/Steamship invisible.

**Architecture:** Four files change. `types.ts` gains two optional typed arrays on `Tech`. `tech-definitions.ts` populates those arrays for all techs that gate units or buildings and simultaneously removes entity names from `unlocks` strings (including three ghost unit strings). `tech-panel.ts` gets a pure `getUnlockLines` helper used at all four render sites. `tech-unlocks-consistency.test.ts` gets four new tests that together form a closed loop: nothing can be gated without being declared, and nothing can be declared without being gated.

**Tech Stack:** TypeScript, Vitest. Run all tests: `bash scripts/run-with-mise.sh yarn test`. Type-check: `bash scripts/run-with-mise.sh yarn build`.

---

## File Map

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `unlocksUnits?: UnitType[]` and `unlocksBuildings?: string[]` to `Tech` interface |
| `src/systems/tech-definitions.ts` | Populate structured arrays on ~42 techs; remove entity name strings from `unlocks` |
| `src/ui/tech-panel.ts` | Add `getUnlockLines` + `getFirstUnlockHint` helpers; update 4 render sites |
| `tests/systems/tech-unlocks-consistency.test.ts` | Add 4 new tests (2 validity + 2 completeness) |
| `.claude/rules/end-to-end-wiring.md` | Add one bullet under trainable-unit wiring checklist |

---

## Task 1: Write the four failing tests

**Files:**
- Modify: `tests/systems/tech-unlocks-consistency.test.ts`

The file currently has two tests checking `"Unlock <Name> unit"` and `"Unlock <Name> building"` string patterns. Add four new tests below the existing ones. They will fail immediately because `Tech` has no `unlocksUnits`/`unlocksBuildings` fields yet — that is expected.

- [ ] **Step 1: Open the existing test file and append four new tests**

The full addition to append after the closing `});` of the existing `describe` block:

```typescript
describe('tech structured unlock arrays', () => {
  it('every unlocksUnits entry is a trainable unit gated by that tech', () => {
    const failures: string[] = [];
    for (const tech of TECH_TREE) {
      for (const unitType of tech.unlocksUnits ?? []) {
        const unit = TRAINABLE_UNITS.find(u => u.type === unitType);
        if (!unit) {
          failures.push(`${tech.id}.unlocksUnits: '${unitType}' is not a known trainable unit`);
          continue;
        }
        if (unit.techRequired !== tech.id) {
          failures.push(
            `${tech.id}.unlocksUnits: '${unitType}' has techRequired '${unit.techRequired}', not '${tech.id}'`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('every unlocksBuildings entry is a building gated by that tech', () => {
    const failures: string[] = [];
    for (const tech of TECH_TREE) {
      for (const buildingId of tech.unlocksBuildings ?? []) {
        const building = BUILDINGS[buildingId];
        if (!building) {
          failures.push(`${tech.id}.unlocksBuildings: '${buildingId}' is not a known building`);
          continue;
        }
        if (building.techRequired !== tech.id) {
          failures.push(
            `${tech.id}.unlocksBuildings: '${buildingId}' has techRequired '${building.techRequired}', not '${tech.id}'`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('every tech-gated trainable unit appears in its tech unlocksUnits', () => {
    const techMap = new Map(TECH_TREE.map(t => [t.id, t]));
    const failures: string[] = [];
    for (const unit of TRAINABLE_UNITS) {
      if (!unit.techRequired) continue;
      if (unit.civTypeRequired) continue; // civ-specific replacements handled by civ-definition tests
      const tech = techMap.get(unit.techRequired);
      if (!tech) {
        failures.push(`unit '${unit.type}' references unknown tech '${unit.techRequired}'`);
        continue;
      }
      if (!(tech.unlocksUnits ?? []).includes(unit.type)) {
        failures.push(
          `unit '${unit.type}' is gated by '${unit.techRequired}' but missing from that tech's unlocksUnits`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('every tech-gated building appears in its tech unlocksBuildings', () => {
    const techMap = new Map(TECH_TREE.map(t => [t.id, t]));
    const failures: string[] = [];
    for (const [buildingId, building] of Object.entries(BUILDINGS)) {
      if (!building.techRequired) continue;
      const tech = techMap.get(building.techRequired);
      if (!tech) {
        failures.push(`building '${buildingId}' references unknown tech '${building.techRequired}'`);
        continue;
      }
      if (!(tech.unlocksBuildings ?? []).includes(buildingId)) {
        failures.push(
          `building '${buildingId}' is gated by '${building.techRequired}' but missing from that tech's unlocksBuildings`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm the new ones fail to compile**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts
```

Expected: TypeScript compile error — `Property 'unlocksUnits' does not exist on type 'Tech'`. This confirms the tests are real and require the type change.

---

## Task 2: Add fields to the Tech interface

**Files:**
- Modify: `src/core/types.ts:462-473`

- [ ] **Step 1: Add the two optional fields to the Tech interface**

Find this block (around line 462):

```typescript
export interface Tech {
  id: string;
  name: string;
  track: TechTrack;
  cost: number;
  prerequisites: string[];   // tech IDs
  unlocks: string[];         // what this tech enables (descriptions)
  era: number;               // 1-3 for milestone 1
  countsForEraAdvancement?: boolean;
  countsForCityMaturity?: boolean;
  pacing?: PacingMetadata;
}
```

Replace with:

```typescript
export interface Tech {
  id: string;
  name: string;
  track: TechTrack;
  cost: number;
  prerequisites: string[];   // tech IDs
  unlocks: string[];         // effect text only — no unit or building names
  unlocksUnits?: UnitType[];      // trainable unit types gated by this tech
  unlocksBuildings?: string[];    // building IDs (keys of BUILDINGS) gated by this tech
  era: number;               // 1-3 for milestone 1
  countsForEraAdvancement?: boolean;
  countsForCityMaturity?: boolean;
  pacing?: PacingMetadata;
}
```

- [ ] **Step 2: Run tests and confirm they now compile but the completeness tests fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts
```

Expected: The two existing pattern tests pass. The four new tests fail with messages like:
```
unit 'archer' is gated by 'archery' but missing from that tech's unlocksUnits
unit 'transport' is gated by 'galleys' but missing from that tech's unlocksUnits
building 'granary' is gated by 'granary-design' but missing from that tech's unlocksBuildings
...
```

- [ ] **Step 3: Commit the type change**

```bash
git add src/core/types.ts tests/systems/tech-unlocks-consistency.test.ts
git commit -m "test(tech): add structured unlock completeness and validity tests

Four new tests in tech-unlocks-consistency enforce that every unit/building
with techRequired appears in its tech's unlocksUnits/unlocksBuildings arrays,
and that every entry in those arrays points to a real gated entity.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Populate tech-definitions.ts — structured arrays and cleanup

**Files:**
- Modify: `src/systems/tech-definitions.ts`

This is the largest task. Each tech that gates a unit or building gets `unlocksUnits`/`unlocksBuildings` added, and the corresponding entity name strings are removed from `unlocks`. Ghost unit strings are also removed.

Apply all changes below to `src/systems/tech-definitions.ts`. The changes are grouped by track.

- [ ] **Step 1: Update the MILITARY track techs (lines ~5-12)**

```typescript
// BEFORE:
{ id: 'stone-weapons', name: 'Stone Weapons', track: 'military', cost: 4, prerequisites: [], unlocks: ['Warriors deal +2 damage', 'Reveal Copper resource', 'Axeman (requires Copper)', 'Bronze Workshop (requires Copper)', 'Armory (requires Copper)'], era: 1, pacing: { band: 'starter', role: 'foundational-military', impact: 1.05, scope: 'military', snowball: 1, urgency: 1.15, situationality: 1, unlockBreadth: 1 } },
{ id: 'archery', name: 'Archery', track: 'military', cost: 10, prerequisites: ['stone-weapons'], unlocks: ['Unlock Archer unit'], era: 1 },
{ id: 'bronze-working', name: 'Bronze Working', track: 'military', cost: 10, prerequisites: ['stone-weapons'], unlocks: ['Spearman (no resource needed)', 'Swordsman (requires Iron)', 'Reveal Iron resource'], era: 2 },
{ id: 'horseback-riding', name: 'Horseback Riding', track: 'military', cost: 55, prerequisites: ['animal-husbandry'], unlocks: ['Unlock Stable', 'Horseman (requires Horses)', 'Cavalry Academy (requires Horses)'], era: 2 },
{ id: 'fortification', name: 'Fortification', track: 'military', cost: 60, prerequisites: ['bronze-working'], unlocks: ['Unlock Walls building', 'pikeman'], era: 3 },
{ id: 'iron-forging', name: 'Iron Forging', track: 'military', cost: 80, prerequisites: ['bronze-working', 'mining-tech'], unlocks: ['Knight (requires Horses + Iron)', 'Iron Foundry (requires Iron)', 'War Academy (requires Iron)'], era: 3 },
{ id: 'siege-warfare', name: 'Siege Warfare', track: 'military', cost: 90, prerequisites: ['iron-forging', 'engineering'], unlocks: ['Catapult (requires Stone)', 'Ballista (requires Iron)', 'Siege Workshop (requires Stone)'], era: 4 },
{ id: 'tactics', name: 'Tactics', track: 'military', cost: 100, prerequisites: ['iron-forging'], unlocks: ['Units get +10% combat bonus', 'Musketeer', 'Crossbowman (requires Copper)'], era: 4 },
```

```typescript
// AFTER:
{ id: 'stone-weapons', name: 'Stone Weapons', track: 'military', cost: 4, prerequisites: [], unlocks: ['Warriors deal +2 damage', 'Reveal Copper resource'], unlocksUnits: ['axeman'], unlocksBuildings: ['bronze-workshop', 'armory'], era: 1, pacing: { band: 'starter', role: 'foundational-military', impact: 1.05, scope: 'military', snowball: 1, urgency: 1.15, situationality: 1, unlockBreadth: 1 } },
{ id: 'archery', name: 'Archery', track: 'military', cost: 10, prerequisites: ['stone-weapons'], unlocks: [], unlocksUnits: ['archer'], era: 1 },
{ id: 'bronze-working', name: 'Bronze Working', track: 'military', cost: 10, prerequisites: ['stone-weapons'], unlocks: ['Reveal Iron resource'], unlocksUnits: ['spearman', 'swordsman'], era: 2 },
{ id: 'horseback-riding', name: 'Horseback Riding', track: 'military', cost: 55, prerequisites: ['animal-husbandry'], unlocks: [], unlocksUnits: ['horseman', 'cavalry'], unlocksBuildings: ['stable', 'cavalry-academy'], era: 2 },
{ id: 'fortification', name: 'Fortification', track: 'military', cost: 60, prerequisites: ['bronze-working'], unlocks: [], unlocksUnits: ['pikeman'], unlocksBuildings: ['walls'], era: 3 },
{ id: 'iron-forging', name: 'Iron Forging', track: 'military', cost: 80, prerequisites: ['bronze-working', 'mining-tech'], unlocks: [], unlocksUnits: ['knight'], unlocksBuildings: ['iron-foundry', 'war-academy'], era: 3 },
{ id: 'siege-warfare', name: 'Siege Warfare', track: 'military', cost: 90, prerequisites: ['iron-forging', 'engineering'], unlocks: [], unlocksUnits: ['catapult', 'ballista'], unlocksBuildings: ['siege-workshop'], era: 4 },
{ id: 'tactics', name: 'Tactics', track: 'military', cost: 100, prerequisites: ['iron-forging'], unlocks: ['Units get +10% combat bonus'], unlocksUnits: ['musketeer', 'crossbowman'], era: 4 },
```

Note: All three original strings in `horseback-riding.unlocks` were entity names (Stable, Horseman, Cavalry Academy) — all move to the structured arrays, leaving `unlocks: []`.

- [ ] **Step 2: Update the ECONOMY track techs (lines ~15-23)**

Only `animal-husbandry`, `currency`, `banking`, and `global-logistics` change:

```typescript
// BEFORE:
{ id: 'animal-husbandry', name: 'Animal Husbandry', track: 'economy', cost: 12, prerequisites: ['gathering'], unlocks: ['Reveal Horses resource', 'Reveal Sheep resource', 'Ranch (requires Horses)'], era: 2 },
{ id: 'currency', name: 'Currency', track: 'economy', cost: 60, prerequisites: ['pottery'], unlocks: ['Unlock Marketplace building', 'Reveal Incense resource', 'Reveal Gold resource'], era: 3 },
{ id: 'banking', name: 'Banking', track: 'economy', cost: 95, prerequisites: ['trade-routes', 'mathematics'], unlocks: ['+20% gold in all cities'], era: 4 },
{ id: 'global-logistics', name: 'Global Logistics', track: 'economy', cost: 155, prerequisites: ['trade-routes', 'banking'], unlocks: ['Late-era supply chains and wonder distribution requirements'], era: 5, countsForEraAdvancement: false, countsForCityMaturity: true },
```

```typescript
// AFTER:
{ id: 'animal-husbandry', name: 'Animal Husbandry', track: 'economy', cost: 12, prerequisites: ['gathering'], unlocks: ['Reveal Horses resource', 'Reveal Sheep resource'], unlocksBuildings: ['ranch'], era: 2 },
{ id: 'currency', name: 'Currency', track: 'economy', cost: 60, prerequisites: ['pottery'], unlocks: ['Reveal Incense resource', 'Reveal Gold resource'], unlocksBuildings: ['marketplace'], era: 3 },
{ id: 'banking', name: 'Banking', track: 'economy', cost: 95, prerequisites: ['trade-routes', 'mathematics'], unlocks: ['+20% gold in all cities'], unlocksBuildings: ['bank'], era: 4 },
{ id: 'global-logistics', name: 'Global Logistics', track: 'economy', cost: 155, prerequisites: ['trade-routes', 'banking'], unlocks: ['Late-era supply chains and wonder distribution requirements'], unlocksBuildings: ['stock_exchange'], era: 5, countsForEraAdvancement: false, countsForCityMaturity: true },
```

- [ ] **Step 3: Update the SCIENCE track techs (lines ~26-34)**

Only `writing`, `wheel`, `mathematics`, `engineering`, and `astronomy` change:

```typescript
// BEFORE:
{ id: 'writing', name: 'Writing', track: 'science', cost: 10, prerequisites: ['fire'], unlocks: ['Unlock Library building'], era: 1 },
{ id: 'wheel', name: 'The Wheel', track: 'science', cost: 10, prerequisites: ['fire'], unlocks: ['Foundational mechanics knowledge'], era: 2 },
{ id: 'mathematics', name: 'Mathematics', track: 'science', cost: 60, prerequisites: ['writing'], unlocks: ['Unlock Archive building'], era: 2 },
{ id: 'engineering', name: 'Engineering', track: 'science', cost: 80, prerequisites: ['mathematics', 'wheel'], unlocks: ['Unlock Aqueduct, Forge'], era: 3 },
{ id: 'astronomy', name: 'Astronomy', track: 'science', cost: 90, prerequisites: ['mathematics'], unlocks: ['Unlock Observatory building'], era: 4 },
```

```typescript
// AFTER:
{ id: 'writing', name: 'Writing', track: 'science', cost: 10, prerequisites: ['fire'], unlocks: [], unlocksBuildings: ['library'], era: 1 },
{ id: 'wheel', name: 'The Wheel', track: 'science', cost: 10, prerequisites: ['fire'], unlocks: ['Foundational mechanics knowledge'], unlocksBuildings: ['caravanserai'], era: 2 },
{ id: 'mathematics', name: 'Mathematics', track: 'science', cost: 60, prerequisites: ['writing'], unlocks: [], unlocksBuildings: ['archive'], era: 2 },
{ id: 'engineering', name: 'Engineering', track: 'science', cost: 80, prerequisites: ['mathematics', 'wheel'], unlocks: [], unlocksBuildings: ['aqueduct', 'forge'], era: 3 },
{ id: 'astronomy', name: 'Astronomy', track: 'science', cost: 90, prerequisites: ['mathematics'], unlocks: [], unlocksBuildings: ['observatory'], era: 4 },
```

- [ ] **Step 4: Update the CIVICS track techs (lines ~36-44)**

Only `code-of-laws`, `state-workforce`, `civil-service`, and `drama-poetry` change:

```typescript
// BEFORE:
{ id: 'code-of-laws', name: 'Code of Laws', track: 'civics', cost: 10, prerequisites: ['tribal-council'], unlocks: ['Unlock Monument building'], era: 1 },
{ id: 'state-workforce', name: 'State Workforce', track: 'civics', cost: 55, prerequisites: ['early-empire'], unlocks: ['Unlock Lumbermill, Quarry', 'Masonry Works (requires Stone)'], era: 2 },
{ id: 'civil-service', name: 'Civil Service', track: 'civics', cost: 75, prerequisites: ['state-workforce'], unlocks: ['Unlock Forum building'], era: 3 },
{ id: 'drama-poetry', name: 'Drama & Poetry', track: 'civics', cost: 80, prerequisites: ['philosophy', 'code-of-laws'], unlocks: ['Unlock Amphitheater building'], era: 4 },
```

```typescript
// AFTER:
{ id: 'code-of-laws', name: 'Code of Laws', track: 'civics', cost: 10, prerequisites: ['tribal-council'], unlocks: [], unlocksBuildings: ['monument'], era: 1 },
{ id: 'state-workforce', name: 'State Workforce', track: 'civics', cost: 55, prerequisites: ['early-empire'], unlocks: [], unlocksBuildings: ['lumbermill', 'quarry-building', 'masonry-works'], era: 2 },
{ id: 'civil-service', name: 'Civil Service', track: 'civics', cost: 75, prerequisites: ['state-workforce'], unlocks: [], unlocksBuildings: ['forum'], era: 3 },
{ id: 'drama-poetry', name: 'Drama & Poetry', track: 'civics', cost: 80, prerequisites: ['philosophy', 'code-of-laws'], unlocks: [], unlocksBuildings: ['amphitheater'], era: 4 },
```

- [ ] **Step 5: Update the SCIENCE track — philosophy**

```typescript
// BEFORE:
{ id: 'philosophy', name: 'Philosophy', track: 'science', cost: 70, prerequisites: ['writing'], unlocks: ['Unlock Temple building'], era: 3 },
```

```typescript
// AFTER:
{ id: 'philosophy', name: 'Philosophy', track: 'science', cost: 70, prerequisites: ['writing'], unlocks: [], unlocksBuildings: ['temple'], era: 3 },
```

- [ ] **Step 6: Update the EXPLORATION track techs (lines ~46-54)**

Only `harbor-tech` changes. Also fix `harbor-building` (maritime) which incorrectly claims to unlock Harbor:

```typescript
// BEFORE (exploration track):
{ id: 'harbor-tech', name: 'Harbors', track: 'exploration', cost: 70, prerequisites: ['sailing', 'currency'], unlocks: ['Unlock Harbor building'], era: 3 },
```

```typescript
// AFTER (exploration track):
{ id: 'harbor-tech', name: 'Harbors', track: 'exploration', cost: 70, prerequisites: ['sailing', 'currency'], unlocks: [], unlocksBuildings: ['harbor'], era: 3 },
```

- [ ] **Step 7: Update the AGRICULTURE track — foraging**

```typescript
// BEFORE:
{ id: 'foraging', name: 'Foraging', track: 'agriculture', cost: 5, prerequisites: [], unlocks: ['Food storage', 'Reveal Ivory resource', 'Reveal Furs resource'], era: 1 },
```

```typescript
// AFTER:
{ id: 'foraging', name: 'Foraging', track: 'agriculture', cost: 5, prerequisites: [], unlocks: ['Food storage', 'Reveal Ivory resource', 'Reveal Furs resource'], unlocksUnits: ['expedition'], era: 1 },
```

- [ ] **Step 8: Update the MARITIME track techs (lines ~96-105)**

This fixes the transport ship display gaps and removes three ghost unit strings:

```typescript
// BEFORE:
{ id: 'fishing', name: 'Fishing', track: 'maritime', cost: 10, prerequisites: ['rafts'], unlocks: ['Fishing boat'], era: 1 },
{ id: 'galleys', name: 'Galleys', track: 'maritime', cost: 45, prerequisites: ['fishing', 'sailing'], unlocks: ['Galley'], era: 2 },
{ id: 'navigation', name: 'Navigation', track: 'maritime', cost: 50, prerequisites: ['galleys'], unlocks: ['Navigator'], era: 2 },
{ id: 'triremes', name: 'Triremes', track: 'maritime', cost: 85, prerequisites: ['navigation'], unlocks: ['Trireme'], era: 3 },
{ id: 'harbor-building', name: 'Harbor Building', track: 'maritime', cost: 80, prerequisites: ['galleys'], unlocks: ['Harbor'], era: 3 },
{ id: 'caravels', name: 'Caravels', track: 'maritime', cost: 125, prerequisites: ['triremes', 'harbor-building'], unlocks: ['Caravel'], era: 4 },
{ id: 'naval-warfare', name: 'Naval Warfare', track: 'maritime', cost: 130, prerequisites: ['triremes'], unlocks: ['Warship'], era: 4 },
{ id: 'amphibious-warfare', name: 'Amphibious Warfare', track: 'maritime', cost: 175, prerequisites: ['caravels', 'naval-warfare'], unlocks: ['Troop Transport'], era: 5, countsForEraAdvancement: false },
```

```typescript
// AFTER:
{ id: 'fishing', name: 'Fishing', track: 'maritime', cost: 10, prerequisites: ['rafts'], unlocks: [], unlocksBuildings: ['dock'], era: 1 },
{ id: 'galleys', name: 'Galleys', track: 'maritime', cost: 45, prerequisites: ['fishing', 'sailing'], unlocks: [], unlocksUnits: ['galley', 'transport'], era: 2 },
{ id: 'navigation', name: 'Navigation', track: 'maritime', cost: 50, prerequisites: ['galleys'], unlocks: [], unlocksUnits: ['carrack'], era: 2 },
{ id: 'triremes', name: 'Triremes', track: 'maritime', cost: 85, prerequisites: ['navigation'], unlocks: [], unlocksUnits: ['trireme', 'galleon'], era: 3 },
{ id: 'harbor-building', name: 'Harbor Building', track: 'maritime', cost: 80, prerequisites: ['galleys'], unlocks: ['Maritime infrastructure — prerequisite for Caravels'], era: 3 },
{ id: 'caravels', name: 'Caravels', track: 'maritime', cost: 125, prerequisites: ['triremes', 'harbor-building'], unlocks: [], unlocksUnits: ['steamship'], era: 4 },
{ id: 'naval-warfare', name: 'Naval Warfare', track: 'maritime', cost: 130, prerequisites: ['triremes'], unlocks: ['Unlocks advanced naval tactics'], era: 4 },
{ id: 'amphibious-warfare', name: 'Amphibious Warfare', track: 'maritime', cost: 175, prerequisites: ['caravels', 'naval-warfare'], unlocks: [], unlocksUnits: ['troop_transport'], era: 5, countsForEraAdvancement: false },
```

Notes:
- `fishing`: 'Fishing boat' removed (no such unit type). `unlocksBuildings: ['dock']` added.
- `galleys`: 'Galley' removed. `unlocksUnits: ['galley', 'transport']` added — **this is the primary bug fix**.
- `navigation`: 'Navigator' removed (ghost). `unlocksUnits: ['carrack']` added.
- `triremes`: 'Trireme' removed. `unlocksUnits: ['trireme', 'galleon']` added.
- `harbor-building`: 'Harbor' removed (incorrect — Harbor.techRequired is `harbor-tech`, not this tech). Replaced with accurate description.
- `caravels`: 'Caravel' removed (ghost). `unlocksUnits: ['steamship']` added.
- `naval-warfare`: 'Warship' removed (ghost). Replaced with accurate description. No trainable unit has `techRequired: 'naval-warfare'`.
- `amphibious-warfare`: 'Troop Transport' removed. `unlocksUnits: ['troop_transport']` added.

- [ ] **Step 9: Update the ESPIONAGE track techs (lines ~139-148)**

```typescript
// BEFORE:
{ id: 'espionage-scouting', name: 'Scouting Networks', track: 'espionage', cost: 40, prerequisites: [], unlocks: ['Recruit spies', 'Passive city surveillance', 'Scout Area mission', 'Monitor Troops mission'], era: 1 },
{ id: 'lookouts', name: 'Lookouts', track: 'espionage', cost: 25, prerequisites: ['espionage-scouting'], unlocks: ['Scout Hound unit (Shadow Warden for Persia, War Hound for Rome)'], era: 1 },
{ id: 'espionage-informants', name: 'Informant Rings', track: 'espionage', cost: 80, prerequisites: ['espionage-scouting'], unlocks: ['Gather Intel mission', 'Identify Resources mission', 'Monitor Diplomacy mission', 'Second spy slot'], era: 2 },
{ id: 'spy-networks', name: 'Spy Networks', track: 'espionage', cost: 85, prerequisites: ['espionage-informants', 'disguise'], unlocks: ['Spy ring'], era: 3 },
{ id: 'cryptography', name: 'Cryptography', track: 'espionage', cost: 125, prerequisites: ['spy-networks'], unlocks: ['Cipher bureau'], era: 4 },
{ id: 'counter-intelligence', name: 'Counter-Intelligence', track: 'espionage', cost: 130, prerequisites: ['spy-networks', 'sabotage'], unlocks: ['Security agency'], era: 4 },
{ id: 'cyber-warfare', name: 'Cyber Warfare', track: 'espionage', cost: 185, prerequisites: ['digital-surveillance'], unlocks: ['Cyber Attack', 'Election Interference'], era: 5 },
```

```typescript
// AFTER:
{ id: 'espionage-scouting', name: 'Scouting Networks', track: 'espionage', cost: 40, prerequisites: [], unlocks: ['Recruit spies', 'Passive city surveillance', 'Scout Area mission', 'Monitor Troops mission'], unlocksUnits: ['spy_scout'], unlocksBuildings: ['safehouse'], era: 1 },
{ id: 'lookouts', name: 'Lookouts', track: 'espionage', cost: 25, prerequisites: ['espionage-scouting'], unlocks: [], unlocksUnits: ['scout_hound'], era: 1 },
{ id: 'espionage-informants', name: 'Informant Rings', track: 'espionage', cost: 80, prerequisites: ['espionage-scouting'], unlocks: ['Gather Intel mission', 'Identify Resources mission', 'Monitor Diplomacy mission', 'Second spy slot'], unlocksUnits: ['spy_informant'], unlocksBuildings: ['intelligence-agency'], era: 2 },
{ id: 'spy-networks', name: 'Spy Networks', track: 'espionage', cost: 85, prerequisites: ['espionage-informants', 'disguise'], unlocks: ['Spy ring'], unlocksUnits: ['spy_agent'], era: 3 },
{ id: 'cryptography', name: 'Cryptography', track: 'espionage', cost: 125, prerequisites: ['spy-networks'], unlocks: ['Cipher bureau'], unlocksUnits: ['spy_operative'], era: 4 },
{ id: 'counter-intelligence', name: 'Counter-Intelligence', track: 'espionage', cost: 130, prerequisites: ['spy-networks', 'sabotage'], unlocks: [], unlocksBuildings: ['security-bureau'], era: 4 },
{ id: 'cyber-warfare', name: 'Cyber Warfare', track: 'espionage', cost: 185, prerequisites: ['digital-surveillance'], unlocks: ['Cyber Attack', 'Election Interference'], unlocksUnits: ['spy_hacker'], era: 5 },
```

Notes:
- `espionage-scouting`: keeps mission strings, gains `unlocksUnits` and `unlocksBuildings`.
- `lookouts`: 'Scout Hound unit (Shadow Warden for Persia, War Hound for Rome)' removed from string. `unlocksUnits: ['scout_hound']` added (civ-specific replacements excluded per spec §5).
- `counter-intelligence`: 'Security agency' removed — it is a building name reference and spec §2 requires entity names move to structured arrays. `unlocksBuildings: ['security-bureau']` covers it.

- [ ] **Step 10: Update the ECONOMY track — trade-routes**

```typescript
// BEFORE:
{ id: 'trade-routes', name: 'Trade Routes', track: 'economy', cost: 85, prerequisites: ['currency'], unlocks: ['Enable trade routes between cities'], era: 4 },
```

```typescript
// AFTER:
{ id: 'trade-routes', name: 'Trade Routes', track: 'economy', cost: 85, prerequisites: ['currency'], unlocks: ['Enable trade routes between cities'], unlocksUnits: ['caravan'], era: 4 },
```

- [ ] **Step 11: Update the AGRICULTURE track — granary-design**

```typescript
// BEFORE:
{ id: 'granary-design', name: 'Granary Design', track: 'agriculture', cost: 10, prerequisites: ['foraging'], unlocks: ['Granary upgrade'], era: 2 },
```

```typescript
// AFTER:
{ id: 'granary-design', name: 'Granary Design', track: 'agriculture', cost: 10, prerequisites: ['foraging'], unlocks: ['Granary upgrade'], unlocksBuildings: ['granary'], era: 2 },
```

Note: 'Granary upgrade' is effect text (it describes the nature of the building) — kept.

- [ ] **Step 12: Run the four new tests and verify they all pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts
```

Expected: All 6 tests pass (2 existing + 4 new). If any completeness test still fails, the error message will name the missing unit or building — add it to the correct tech's array.

- [ ] **Step 13: Run the full test suite and verify no regressions**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: All tests pass.

- [ ] **Step 14: Commit**

```bash
git add src/core/types.ts src/systems/tech-definitions.ts
git commit -m "feat(tech): add structured unlocksUnits/unlocksBuildings to Tech

Populates unlocksUnits and unlocksBuildings on all 42 techs that gate
trainable units or buildings. Removes entity names from unlocks strings
(now effect-text only). Fixes transport-ship display gap: Transport,
Carrack, Galleon, Steamship now appear in the tech tree. Removes three
ghost unit strings: Navigator, Caravel, Warship.

Closes the test loop — all four completeness and validity tests pass.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update tech-panel.ts to display from structured arrays

**Files:**
- Modify: `src/ui/tech-panel.ts`

- [ ] **Step 1: Add the two new imports at the top of the file**

After the existing imports (after line 10 `import { TECH_TREE } from '@/systems/tech-system';`), add:

```typescript
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { BUILDINGS } from '@/systems/city-system';
```

- [ ] **Step 2: Add the two helper functions**

Insert these two functions immediately before the exported `TechPanelCallbacks` interface (before line 12). They are pure functions with no side effects:

```typescript
function getUnlockLines(tech: Tech): string[] {
  const lines = [...tech.unlocks];
  for (const unitType of tech.unlocksUnits ?? []) {
    const def = UNIT_DEFINITIONS[unitType];
    if (def) lines.push(def.name);
  }
  for (const buildingId of tech.unlocksBuildings ?? []) {
    const building = BUILDINGS[buildingId];
    if (building) lines.push(building.name);
  }
  return lines;
}

function getFirstUnlockHint(tech: Tech): string {
  return getUnlockLines(tech)[0] ?? 'New options for your empire';
}
```

- [ ] **Step 3: Update the four render sites**

**Site 1** (line 87 — HUD subtitle when no turns remaining):
```typescript
// BEFORE:
? `${titleCase(currentTech.track)} · ${currentTech.unlocks[0] ?? 'New options for your empire'}`

// AFTER:
? `${titleCase(currentTech.track)} · ${getFirstUnlockHint(currentTech)}`
```

**Site 2** (line 93 — advisor "Why next" text):
```typescript
// BEFORE:
why.textContent = `Why next: ${currentTech.unlocks[0] ?? 'Keeps your current plan moving.'}`;

// AFTER:
why.textContent = `Why next: ${getFirstUnlockHint(currentTech)}`;
```

**Site 3** (line 213 — tree node tooltip):
```typescript
// BEFORE:
detail.textContent = `${node.tech.unlocks[0] ?? 'New options'}${etaSegment} · Cost: ${node.tech.cost}`;

// AFTER:
detail.textContent = `${getFirstUnlockHint(node.tech)}${etaSegment} · Cost: ${node.tech.cost}`;
```

**Site 4** (line 258 — inspector panel full unlock list):
```typescript
// BEFORE:
unlocks.textContent = selectedNode.tech.unlocks.join(', ') || 'New options for your empire';

// AFTER:
unlocks.textContent = getUnlockLines(selectedNode.tech).join(', ') || 'New options for your empire';
```

- [ ] **Step 4: Build to confirm no TypeScript errors**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 5: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/tech-panel.ts
git commit -m "feat(ui/tech): derive unlock display from structured arrays

Tech panel now reads unlocksUnits and unlocksBuildings to build the
unlock hint shown in HUD, advisor text, tree node tooltips, and the
inspector panel. The 'unlocks' string array is now effect-text only.

Transport ships (Transport, Carrack, Galleon, Steamship) are now
visible in the tech panel for players researching the maritime track.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Add the prevention rule

**Files:**
- Modify: `.claude/rules/end-to-end-wiring.md`

- [ ] **Step 1: Add one bullet to the trainable-unit wiring checklist**

Open `.claude/rules/end-to-end-wiring.md`. Find the line:

```
- Adding a `UnitType` to `TRAINABLE_UNITS` without all six wirings is "dead computed data" and is a bug.
```

Insert the following block immediately after that line (before the `## Production icons must be wired end-to-end` heading):

```markdown
## Tech unlock arrays must be wired end-to-end
- When you add a `TRAINABLE_UNIT` with `techRequired`, add its `type` to that tech's `unlocksUnits` array in `src/systems/tech-definitions.ts`.
- When you add a `BUILDING` with `techRequired`, add its `id` to that tech's `unlocksBuildings` array in `src/systems/tech-definitions.ts`.
- The completeness tests in `tests/systems/tech-unlocks-consistency.test.ts` will fail if either is omitted — treat a failing completeness test as a required fix, not a warning.
- Civ-specific unit replacements (`civTypeRequired` set) are excluded from `unlocksUnits` and from the completeness test.
```

- [ ] **Step 2: Run the full test suite one final time**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/end-to-end-wiring.md
git commit -m "docs(rules): require unlocksUnits/unlocksBuildings when adding gated entities

Adds a rule to end-to-end-wiring.md that requires populating the new
Tech structured arrays whenever a TRAINABLE_UNIT or BUILDING is added
with techRequired. The completeness tests enforce this mechanically.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
