# Marketplace S2a+S2b — Resource Improvements & Acquisition Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new tile improvement types (plantation, pasture, camp, quarry), expand the resource catalog from 10 to 16 entries, and wire a stateless `getCivAvailableResources` helper that gatekeeps resources behind both tech and matching completed improvement — then surface the result in the marketplace panel and territory inspection panel.

**Architecture:** Pure TDD on the data layer first (types → trade-system → tech-definitions → map generators), then renderer, then the pure acquisition logic, then the two UI panels that consume it. Tasks 1 and 2 share a commit because `IMPROVEMENT_BUILD_TURNS` is typed `Record<ImprovementType, number>` — TypeScript exhaustiveness enforcement means the union and the Record object must be extended simultaneously or the build breaks.

**Tech Stack:** TypeScript + Vitest (node env default; `// @vitest-environment jsdom` per-file for UI tests); `bash scripts/run-with-mise.sh yarn test` for all test runs; `bash scripts/run-with-mise.sh yarn build` for type-check.

**Spec:** `docs/superpowers/specs/2026-05-22-marketplace-s2ab-improvements-and-acquisition-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/core/types.ts` | Modify | Extend `ImprovementType`, `LuxuryResource`, `StrategicResource` unions |
| `src/systems/improvement-system.ts` | Modify | Add 4 new `IMPROVEMENT_DEFINITIONS` + `IMPROVEMENT_BUILD_TURNS` entries |
| `src/systems/trade-system.ts` | Modify | Add `requiredImprovement` field, change `terrain` to `string \| string[]`, add 6 new resources |
| `src/systems/tech-definitions.ts` | Modify | Add "Reveal X resource" lines to 6 tech `unlocks` arrays |
| `src/systems/map-generator.ts` | Modify | Derive `TERRAIN_RESOURCES` from `RESOURCE_DEFINITIONS`, hills 10% probability, remove stone secondary pass |
| `src/systems/balanced-map-generator.ts` | Modify | Extend `LUXURY_RESOURCES` array with 4 new luxury entries |
| `src/renderer/hex-renderer.ts` | Modify | Export `IMPROVEMENT_ICONS` const, add 4 new improvement icon entries |
| `src/systems/resource-acquisition-system.ts` | **Create** | Pure `getCivAvailableResources(state, civId)` function |
| `src/ui/marketplace-panel.ts` | Modify | Binary "✓ Owned" / "✗ Not available" badge; "Your Resources" summary section |
| `src/ui/territory-inspection-panel.ts` | Modify | 6-state acquisition status line after resource name |
| `tests/systems/improvement-system.test.ts` | Modify | Add terrain validity tests for 4 new improvements |
| `tests/systems/trade-system.test.ts` | Modify | Update count (10→16), add `requiredImprovement` coverage tests |
| `tests/systems/tech-definitions.test.ts` | Modify | Add 6 reveal-string tests |
| `tests/systems/map-generator.test.ts` | Modify | Catalog coverage test; stone-on-mountain test |
| `tests/renderer/hex-renderer.test.ts` | Modify | Verify 4 new entries in exported `IMPROVEMENT_ICONS` |
| `tests/systems/resource-acquisition-system.test.ts` | **Create** | 11 spec-fidelity conjunction tests |
| `tests/ui/marketplace-panel.test.ts` | **Create** | Binary badge + Your Resources + currentPlayer coverage |
| `tests/ui/territory-inspection-panel.test.ts` | Modify | 6 acquisition status state tests |

---

## Task 1: Extend ImprovementType union + add IMPROVEMENT_DEFINITIONS (same commit)

**Files:**
- Modify: `src/core/types.ts:166-167`
- Modify: `src/systems/improvement-system.ts:34-83`
- Modify: `tests/systems/improvement-system.test.ts`

### Why same commit?

`IMPROVEMENT_BUILD_TURNS` is typed `Record<ImprovementType, number>`. TypeScript will fail if `ImprovementType` gains new members without corresponding entries in the Record literal. `yarn build` (which runs `tsc`) enforces this — so both the union extension and the new IMPROVEMENT_DEFINITIONS + BUILD_TURNS entries must land together.

---

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/improvement-system.test.ts` **before** any implementation changes:

```ts
describe('new improvement terrain validity', () => {
  function makeTile(terrain: string, improvement = 'none'): HexTile {
    return {
      coord: { q: 0, r: 0 },
      terrain: terrain as import('@/core/types').TerrainType,
      elevation: 'lowland',
      resource: null,
      improvement: improvement as import('@/core/types').ImprovementType,
      improvementTurnsLeft: 0,
      owner: 'p1',
      hasRiver: false,
      wonder: null,
    };
  }

  it('plantation is allowed on grassland', () => {
    expect(canBuildImprovement(makeTile('grassland'), 'plantation' as BuildableImprovementType)).toBe(true);
  });

  it('plantation is rejected on hills', () => {
    expect(canBuildImprovement(makeTile('hills'), 'plantation' as BuildableImprovementType)).toBe(false);
  });

  it('pasture is allowed on plains', () => {
    expect(canBuildImprovement(makeTile('plains'), 'pasture' as BuildableImprovementType)).toBe(true);
  });

  it('pasture is rejected on jungle', () => {
    expect(canBuildImprovement(makeTile('jungle'), 'pasture' as BuildableImprovementType)).toBe(false);
  });

  it('camp is allowed on forest', () => {
    expect(canBuildImprovement(makeTile('forest'), 'camp' as BuildableImprovementType)).toBe(true);
  });

  it('camp is allowed on tundra', () => {
    expect(canBuildImprovement(makeTile('tundra'), 'camp' as BuildableImprovementType)).toBe(true);
  });

  it('camp is rejected on plains', () => {
    expect(canBuildImprovement(makeTile('plains'), 'camp' as BuildableImprovementType)).toBe(false);
  });

  it('quarry is allowed on mountain', () => {
    expect(canBuildImprovement(makeTile('mountain'), 'quarry' as BuildableImprovementType)).toBe(true);
  });

  it('quarry is rejected on grassland', () => {
    expect(canBuildImprovement(makeTile('grassland'), 'quarry' as BuildableImprovementType)).toBe(false);
  });

  it('plantation yields food and gold', () => {
    const bonus = getImprovementYieldBonus('plantation' as import('@/core/types').ImprovementType);
    expect(bonus.food).toBe(1);
    expect(bonus.gold).toBe(1);
  });

  it('pasture yields food', () => {
    const bonus = getImprovementYieldBonus('pasture' as import('@/core/types').ImprovementType);
    expect(bonus.food).toBe(1);
    expect(bonus.gold).toBe(0);
  });

  it('camp yields food', () => {
    const bonus = getImprovementYieldBonus('camp' as import('@/core/types').ImprovementType);
    expect(bonus.food).toBe(1);
    expect(bonus.gold).toBe(0);
  });

  it('quarry yields production', () => {
    const bonus = getImprovementYieldBonus('quarry' as import('@/core/types').ImprovementType);
    expect(bonus.production).toBe(1);
    expect(bonus.food).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/improvement-system.test.ts
```

Expected: TypeScript errors or runtime errors — `'plantation'` is not in `BuildableImprovementType`, `IMPROVEMENT_DEFINITIONS['plantation']` is undefined.

- [ ] **Step 3: Extend `ImprovementType` in `src/core/types.ts`**

Change line 166:
```ts
// Before:
export type ImprovementType = 'farm' | 'mine' | 'lumber_camp' | 'watermill' | 'none';

// After:
export type ImprovementType = 'farm' | 'mine' | 'lumber_camp' | 'watermill'
  | 'plantation' | 'pasture' | 'camp' | 'quarry' | 'none';
```

Also extend the resource unions at lines 864–865:
```ts
// Before:
export type LuxuryResource = 'silk' | 'wine' | 'spices' | 'gems' | 'ivory' | 'incense';
export type StrategicResource = 'copper' | 'iron' | 'horses' | 'stone';

// After:
export type LuxuryResource = 'silk' | 'wine' | 'spices' | 'gems' | 'ivory' | 'incense'
  | 'gold' | 'silver' | 'furs' | 'sheep';
export type StrategicResource = 'copper' | 'iron' | 'horses' | 'stone' | 'cattle' | 'salt';
```

- [ ] **Step 4: Extend `IMPROVEMENT_DEFINITIONS` and `IMPROVEMENT_BUILD_TURNS` in `src/systems/improvement-system.ts`**

Add four entries to `IMPROVEMENT_DEFINITIONS` (after the `watermill` entry, before the closing `}`):

```ts
  plantation: {
    type: 'plantation',
    name: 'Plantation',
    buildTurns: 4,
    validTerrains: ['grassland', 'plains', 'jungle', 'desert'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 1, production: 0, gold: 1, science: 0 },
    preservesTerrain: true,
  },
  pasture: {
    type: 'pasture',
    name: 'Pasture',
    buildTurns: 3,
    validTerrains: ['grassland', 'plains', 'hills'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 1, production: 0, gold: 0, science: 0 },
    preservesTerrain: true,
  },
  camp: {
    type: 'camp',
    name: 'Camp',
    buildTurns: 3,
    validTerrains: ['forest', 'tundra'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 1, production: 0, gold: 0, science: 0 },
    preservesTerrain: true,
  },
  quarry: {
    type: 'quarry',
    name: 'Quarry',
    buildTurns: 5,
    validTerrains: ['mountain'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 0, production: 1, gold: 0, science: 0 },
    preservesTerrain: true,
  },
```

Extend `IMPROVEMENT_BUILD_TURNS` (add before `none: 0`):

```ts
  plantation: IMPROVEMENT_DEFINITIONS.plantation.buildTurns,
  pasture: IMPROVEMENT_DEFINITIONS.pasture.buildTurns,
  camp: IMPROVEMENT_DEFINITIONS.camp.buildTurns,
  quarry: IMPROVEMENT_DEFINITIONS.quarry.buildTurns,
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/improvement-system.test.ts
```

Expected: All tests PASS. Also verify build:

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: TypeScript compilation succeeds (no exhaustiveness errors).

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/systems/improvement-system.ts tests/systems/improvement-system.test.ts
git commit -m "feat(types+improvements): extend ImprovementType/LuxuryResource/StrategicResource unions and add plantation/pasture/camp/quarry definitions"
```

---

## Task 2: Extend trade-system — ResourceDefinition shape and 16 resource catalog

**Files:**
- Modify: `src/systems/trade-system.ts:1-26`
- Modify: `tests/systems/trade-system.test.ts`

---

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/trade-system.test.ts` (inside the existing `describe('trade-system', ...)` block, after the existing catalog tests):

```ts
  describe('S2a catalog — 16 resources', () => {
    it('defines exactly 16 resources (10 luxury + 6 strategic)', () => {
      expect(RESOURCE_DEFINITIONS).toHaveLength(16);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'luxury')).toHaveLength(10);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'strategic')).toHaveLength(6);
    });

    it('all 6 new resources appear in RESOURCE_DEFINITIONS', () => {
      const ids = RESOURCE_DEFINITIONS.map(r => r.id);
      for (const id of ['gold', 'silver', 'furs', 'cattle', 'sheep', 'salt']) {
        expect(ids, `missing resource "${id}"`).toContain(id);
      }
    });

    it('every resource has a non-empty requiredImprovement field', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(
          (r as { requiredImprovement?: string }).requiredImprovement,
          `${r.id} missing requiredImprovement`,
        ).toBeTruthy();
      }
    });

    it('requiredImprovement values are valid BuildableImprovementTypes', () => {
      const valid = new Set(['farm', 'mine', 'lumber_camp', 'watermill', 'plantation', 'pasture', 'camp', 'quarry']);
      for (const r of RESOURCE_DEFINITIONS) {
        const imp = (r as { requiredImprovement?: string }).requiredImprovement;
        expect(valid.has(imp ?? ''), `${r.id}.requiredImprovement "${imp}" is not a valid BuildableImprovementType`).toBe(true);
      }
    });

    it('stone has requiredImprovement of quarry', () => {
      const stone = RESOURCE_DEFINITIONS.find(r => r.id === 'stone');
      expect((stone as unknown as { requiredImprovement: string }).requiredImprovement).toBe('quarry');
    });

    it('horses has requiredImprovement of pasture', () => {
      const horses = RESOURCE_DEFINITIONS.find(r => r.id === 'horses');
      expect((horses as unknown as { requiredImprovement: string }).requiredImprovement).toBe('pasture');
    });

    it('silk has requiredImprovement of plantation', () => {
      const silk = RESOURCE_DEFINITIONS.find(r => r.id === 'silk');
      expect((silk as unknown as { requiredImprovement: string }).requiredImprovement).toBe('plantation');
    });

    it('ivory has requiredImprovement of camp', () => {
      const ivory = RESOURCE_DEFINITIONS.find(r => r.id === 'ivory');
      expect((ivory as unknown as { requiredImprovement: string }).requiredImprovement).toBe('camp');
    });
  });
```

Also update the existing count test (it currently asserts `10`). Find this block:

```ts
    it('defines 10 resources (6 luxury + 4 strategic)', () => {
      expect(RESOURCE_DEFINITIONS).toHaveLength(10);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'luxury')).toHaveLength(6);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'strategic')).toHaveLength(4);
    });
```

Replace it with:

```ts
    it('defines 16 resources (10 luxury + 6 strategic)', () => {
      expect(RESOURCE_DEFINITIONS).toHaveLength(16);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'luxury')).toHaveLength(10);
      expect(RESOURCE_DEFINITIONS.filter(r => r.type === 'strategic')).toHaveLength(6);
    });
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/trade-system.test.ts
```

Expected: Count tests fail (still 10 resources), requiredImprovement tests fail (field does not exist yet).

- [ ] **Step 3: Update `ResourceDefinition` interface and add field to all 16 resources**

In `src/systems/trade-system.ts`, change the `ResourceDefinition` interface:

```ts
// Before:
export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string;       // terrain it spawns on
  basePrice: number;
  tech: string;          // enabling tech id — added by S1
  icon: string;          // emoji for map rendering and legend — added by S1
}

// After:
export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string | string[];  // spawn terrain(s) — multi-terrain for furs, cattle, sheep
  basePrice: number;
  tech: string;
  icon: string;
  requiredImprovement: BuildableImprovementType;
}
```

Add the import for `BuildableImprovementType` at the top of the file:

```ts
import type { BuildableImprovementType, MarketplaceState, ResourceType, TradeRoute } from '@/core/types';
```

Replace `RESOURCE_DEFINITIONS` array with the full 16-entry catalog:

```ts
export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  // Luxury
  { id: 'silk',    name: 'Silk',    type: 'luxury',    terrain: 'grassland',           basePrice: 8,  tech: 'irrigation',       icon: '🧵', requiredImprovement: 'plantation' },
  { id: 'wine',    name: 'Wine',    type: 'luxury',    terrain: 'plains',               basePrice: 7,  tech: 'pottery',          icon: '🍇', requiredImprovement: 'plantation' },
  { id: 'spices',  name: 'Spices',  type: 'luxury',    terrain: 'jungle',               basePrice: 10, tech: 'cartography',      icon: '🌶️', requiredImprovement: 'plantation' },
  { id: 'gems',    name: 'Gems',    type: 'luxury',    terrain: 'hills',                basePrice: 12, tech: 'mining-tech',      icon: '💎', requiredImprovement: 'mine' },
  { id: 'ivory',   name: 'Ivory',   type: 'luxury',    terrain: 'forest',               basePrice: 9,  tech: 'foraging',         icon: '🐘', requiredImprovement: 'camp' },
  { id: 'incense', name: 'Incense', type: 'luxury',    terrain: 'desert',               basePrice: 6,  tech: 'currency',         icon: '🕯️', requiredImprovement: 'plantation' },
  { id: 'gold',    name: 'Gold',    type: 'luxury',    terrain: 'hills',                basePrice: 15, tech: 'currency',         icon: '⭐', requiredImprovement: 'mine' },
  { id: 'silver',  name: 'Silver',  type: 'luxury',    terrain: 'hills',                basePrice: 11, tech: 'mining-tech',      icon: '🥈', requiredImprovement: 'mine' },
  { id: 'furs',    name: 'Furs',    type: 'luxury',    terrain: ['forest', 'tundra'],   basePrice: 9,  tech: 'foraging',         icon: '🦊', requiredImprovement: 'camp' },
  { id: 'sheep',   name: 'Sheep',   type: 'luxury',    terrain: ['hills', 'plains'],    basePrice: 7,  tech: 'animal-husbandry', icon: '🐑', requiredImprovement: 'pasture' },
  // Strategic
  { id: 'copper',  name: 'Copper',  type: 'strategic', terrain: 'hills',                basePrice: 5,  tech: 'stone-weapons',    icon: '🪙', requiredImprovement: 'mine' },
  { id: 'iron',    name: 'Iron',    type: 'strategic', terrain: 'hills',                basePrice: 8,  tech: 'bronze-working',   icon: '⚙️', requiredImprovement: 'mine' },
  { id: 'horses',  name: 'Horses',  type: 'strategic', terrain: 'plains',               basePrice: 7,  tech: 'animal-husbandry', icon: '🐎', requiredImprovement: 'pasture' },
  { id: 'stone',   name: 'Stone',   type: 'strategic', terrain: 'mountain',             basePrice: 4,  tech: 'gathering',        icon: '🪨', requiredImprovement: 'quarry' },
  { id: 'cattle',  name: 'Cattle',  type: 'strategic', terrain: ['grassland', 'plains'],basePrice: 5,  tech: 'domestication',    icon: '🐄', requiredImprovement: 'pasture' },
  { id: 'salt',    name: 'Salt',    type: 'strategic', terrain: 'hills',                basePrice: 5,  tech: 'pottery',          icon: '🧂', requiredImprovement: 'mine' },
];
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/trade-system.test.ts
```

Expected: All tests PASS. Verify build compiles cleanly:

```bash
bash scripts/run-with-mise.sh yarn build
```

- [ ] **Step 5: Commit**

```bash
git add src/systems/trade-system.ts tests/systems/trade-system.test.ts
git commit -m "feat(trade-system): add requiredImprovement field and expand resource catalog to 16 entries"
```

---

## Task 3: Add "Reveal X resource" lines to tech-definitions

**Files:**
- Modify: `src/systems/tech-definitions.ts`
- Modify: `tests/systems/tech-definitions.test.ts`

---

- [ ] **Step 1: Write failing tests**

Open `tests/systems/tech-definitions.test.ts` and add a new `describe` block:

```ts
describe('S2a resource reveal strings', () => {
  it('domestication unlocks reveal of Cattle', () => {
    const tech = TECH_TREE.find(t => t.id === 'domestication');
    expect(tech?.unlocks).toContain('Reveal Cattle resource');
  });

  it('pottery unlocks reveal of Salt', () => {
    const tech = TECH_TREE.find(t => t.id === 'pottery');
    expect(tech?.unlocks).toContain('Reveal Salt resource');
  });

  it('animal-husbandry unlocks reveal of Sheep', () => {
    const tech = TECH_TREE.find(t => t.id === 'animal-husbandry');
    expect(tech?.unlocks).toContain('Reveal Sheep resource');
  });

  it('foraging unlocks reveal of Furs', () => {
    const tech = TECH_TREE.find(t => t.id === 'foraging');
    expect(tech?.unlocks).toContain('Reveal Furs resource');
  });

  it('currency unlocks reveal of Gold', () => {
    const tech = TECH_TREE.find(t => t.id === 'currency');
    expect(tech?.unlocks).toContain('Reveal Gold resource');
  });

  it('mining-tech unlocks reveal of Silver', () => {
    const tech = TECH_TREE.find(t => t.id === 'mining-tech');
    expect(tech?.unlocks).toContain('Reveal Silver resource');
  });
});
```

Verify import of `TECH_TREE` is already present. If not, add:
```ts
import { TECH_TREE } from '@/systems/tech-definitions';
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-definitions.test.ts
```

Expected: 6 tests FAIL — the reveal strings don't exist yet.

- [ ] **Step 3: Add reveal strings to `src/systems/tech-definitions.ts`**

Locate each tech entry and append the new reveal string to its `unlocks` array. Do NOT change other entries.

```ts
// domestication (currently: unlocks: ['Animal pens'])
unlocks: ['Animal pens', 'Reveal Cattle resource'],

// pottery (currently: unlocks: ['Foundational ceramics knowledge', 'Reveal Wine resource'])
unlocks: ['Foundational ceramics knowledge', 'Reveal Wine resource', 'Reveal Salt resource'],

// animal-husbandry (currently: unlocks: ['Reveal Horses resource'])
unlocks: ['Reveal Horses resource', 'Reveal Sheep resource'],

// foraging (currently: unlocks: ['Food storage', 'Reveal Ivory resource'])
unlocks: ['Food storage', 'Reveal Ivory resource', 'Reveal Furs resource'],

// currency (currently: unlocks: ['Unlock Marketplace building', 'Reveal Incense resource'])
unlocks: ['Unlock Marketplace building', 'Reveal Incense resource', 'Reveal Gold resource'],

// mining-tech (currently: unlocks: ['Mines yield +1 production', 'Reveal Gems resource'])
unlocks: ['Mines yield +1 production', 'Reveal Gems resource', 'Reveal Silver resource'],
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-definitions.test.ts
```

Expected: All 6 new tests PASS. Run the full test suite to check for regressions:

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts tests/systems/pacing-audit.test.ts
```

Expected: PASS (those tests examine tech structure and will catch malformed entries).

- [ ] **Step 5: Commit**

```bash
git add src/systems/tech-definitions.ts tests/systems/tech-definitions.test.ts
git commit -m "feat(tech-definitions): add Reveal resource strings for 6 new resources across 6 techs"
```

---

## Task 4: Fix map generators — TERRAIN_RESOURCES derivation, stone on mountain, hills density, LUXURY_RESOURCES

**Files:**
- Modify: `src/systems/map-generator.ts:1-10, 203-227`
- Modify: `src/systems/balanced-map-generator.ts:11`
- Modify: `tests/systems/map-generator.test.ts`

### What changes and why

1. **Derive TERRAIN_RESOURCES from RESOURCE_DEFINITIONS** — eliminates the dual-maintenance risk where `ResourceDefinition.terrain` and the private `TERRAIN_RESOURCES` constant can diverge. After derivation, there is one source of truth.
2. **Stone moves to mountain** — the existing secondary stone pass places stone on hills; the spec corrects this to mountain. The derivation handles this automatically since `stone.terrain === 'mountain'` in Task 2.
3. **Hills probability 10%** — after adding 7 resources to hills terrain (gems, copper, iron, gold, silver, salt, sheep), we reduce the per-tile probability for hills to 10% so each individual resource appears at a reasonable frequency. Other terrains remain at 15%.
4. **LUXURY_RESOURCES in balanced-map-generator** — the hotspot equalization pass uses a hardcoded list; add the 4 new luxuries so they receive the same placement treatment as the original 6.

---

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/map-generator.test.ts`:

```ts
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';

describe('S2a resource catalog coverage', () => {
  it('every ResourceDefinition terrain appears in at least one tile after placeResources', () => {
    // Place resources on a large synthetic tile set covering all terrains
    const terrains = ['grassland','plains','jungle','hills','forest','desert','mountain','tundra'];
    const tiles: Record<string, import('@/core/types').HexTile> = {};
    let q = 0;
    for (const terrain of terrains) {
      // Place 20 tiles of each terrain to ensure at least one gets a resource
      for (let i = 0; i < 20; i++) {
        const key = `${q},0`;
        tiles[key] = {
          coord: { q, r: 0 },
          terrain: terrain as import('@/core/types').TerrainType,
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: null,
          hasRiver: false,
          wonder: null,
        };
        q++;
      }
    }

    // Use a deterministic rng
    const rng = createRng('catalog-coverage-test');
    placeResources(tiles, rng);

    const placedResources = new Set(
      Object.values(tiles).map(t => t.resource).filter(Boolean),
    );

    for (const def of RESOURCE_DEFINITIONS) {
      const terrains = Array.isArray(def.terrain) ? def.terrain : [def.terrain];
      // At least one terrain must appear in our tile set
      const hasCandidateTerrain = terrains.some(t => ['grassland','plains','jungle','hills','forest','desert','mountain','tundra'].includes(t));
      if (!hasCandidateTerrain) continue;
      // With 20 tiles per terrain and repeated random placement, this resource must appear
      // Run placeResources 10 times on fresh tiles to eliminate randomness
      let found = placedResources.has(def.id as string);
      if (!found) {
        for (let attempt = 0; attempt < 9 && !found; attempt++) {
          const freshTiles = Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, { ...t, resource: null }]));
          placeResources(freshTiles, createRng(`catalog-${def.id}-${attempt}`));
          found = Object.values(freshTiles).some(t => t.resource === def.id);
        }
      }
      expect(found, `resource "${def.id}" never placed — terrain mapping may be missing`).toBe(true);
    }
  });

  it('stone is placed on mountain tiles, not hills tiles', () => {
    // Set up tiles with only hills and mountain
    const tiles: Record<string, import('@/core/types').HexTile> = {};
    for (let q = 0; q < 50; q++) {
      const terrain = q < 25 ? 'hills' : 'mountain';
      tiles[`${q},0`] = {
        coord: { q, r: 0 },
        terrain: terrain as import('@/core/types').TerrainType,
        elevation: 'highland',
        resource: null,
        improvement: 'none',
        improvementTurnsLeft: 0,
        owner: null,
        hasRiver: false,
        wonder: null,
      };
    }

    // Run multiple times to gather statistics
    let stoneOnHills = 0;
    let stoneOnMountain = 0;
    for (let i = 0; i < 20; i++) {
      const freshTiles = Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, { ...t, resource: null }]));
      placeResources(freshTiles, createRng(`stone-terrain-${i}`));
      for (const [key, tile] of Object.entries(freshTiles)) {
        if (tile.resource === 'stone') {
          if (tile.terrain === 'hills') stoneOnHills++;
          if (tile.terrain === 'mountain') stoneOnMountain++;
        }
      }
    }

    expect(stoneOnHills, 'stone must not be placed on hills').toBe(0);
    expect(stoneOnMountain, 'stone must be placed on mountain tiles').toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/map-generator.test.ts
```

Expected: stone-on-mountain test FAIL (stone currently placed on hills only); catalog test may fail for new resources not yet in the derivation.

- [ ] **Step 3: Update `src/systems/map-generator.ts`**

Add import at the top:
```ts
import { RESOURCE_DEFINITIONS } from './trade-system';
```

Replace the `TERRAIN_RESOURCES` constant and the `placeResources` function (lines 203–226) with:

```ts
// Probability overrides per terrain type. Hills reduced because it hosts 7 resources
// after S2a; keeps individual resource frequency reasonable.
const TERRAIN_PROBABILITIES: Record<string, number> = {
  hills: 0.10,
};
const DEFAULT_RESOURCE_PROBABILITY = 0.15;

// Derived at module load — eliminates dual-maintenance with ResourceDefinition.terrain
function buildTerrainResourceMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const def of RESOURCE_DEFINITIONS) {
    const terrains = Array.isArray(def.terrain) ? def.terrain : [def.terrain];
    for (const t of terrains) {
      (map[t] ??= []).push(def.id);
    }
  }
  return map;
}

export function placeResources(tiles: Record<string, HexTile>, rng: () => number): void {
  const terrainResources = buildTerrainResourceMap();
  for (const tile of Object.values(tiles)) {
    if (tile.resource) continue;
    const candidates = terrainResources[tile.terrain];
    if (!candidates || candidates.length === 0) continue;
    const prob = TERRAIN_PROBABILITIES[tile.terrain] ?? DEFAULT_RESOURCE_PROBABILITY;
    if (rng() < prob) {
      tile.resource = candidates[Math.floor(rng() * candidates.length)] as typeof tile.resource;
    }
  }
}
```

This removes the old `TERRAIN_RESOURCES` constant, eliminates the secondary stone pass (stone is now in the derived map under `'mountain'`), and applies the hills probability override.

- [ ] **Step 4: Update `src/systems/balanced-map-generator.ts`**

Change line 11:

```ts
// Before:
const LUXURY_RESOURCES = ['silk', 'wine', 'spices', 'gems', 'ivory', 'incense'] as const;

// After:
const LUXURY_RESOURCES = ['silk', 'wine', 'spices', 'gems', 'ivory', 'incense', 'gold', 'silver', 'furs', 'sheep'] as const;
```

No other changes needed — the hotspot placement and zone equalization loops already iterate over this array.

- [ ] **Step 5: Run tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/map-generator.test.ts tests/systems/balanced-map-generator.test.ts tests/systems/continent-map-generator.test.ts
```

Expected: All tests PASS including the new stone-on-mountain and catalog coverage tests.

- [ ] **Step 6: Commit**

```bash
git add src/systems/map-generator.ts src/systems/balanced-map-generator.ts tests/systems/map-generator.test.ts
git commit -m "feat(map-generators): derive TERRAIN_RESOURCES from ResourceDefinitions, move stone to mountain, add 6 new resources to placement, expand LUXURY_RESOURCES"
```

---

## Task 5: Add new improvement icons to hex-renderer

**Files:**
- Modify: `src/renderer/hex-renderer.ts:261-267`
- Modify: `tests/renderer/hex-renderer.test.ts`

---

- [ ] **Step 1: Write failing test**

Open `tests/renderer/hex-renderer.test.ts` and add a test block. The test uses the existing `MockCanvasContext` from that file. We will export an `IMPROVEMENT_ICONS` const from `hex-renderer.ts` so it can be tested without canvas rendering.

Add this import to the test file (at the top, after existing imports):
```ts
import { IMPROVEMENT_ICONS } from '@/renderer/hex-renderer';
```

Add at the end of the test file:

```ts
describe('IMPROVEMENT_ICONS', () => {
  it('has entries for all 4 new improvement types', () => {
    expect(IMPROVEMENT_ICONS['plantation']).toBe('🌿');
    expect(IMPROVEMENT_ICONS['pasture']).toBe('🐂');
    expect(IMPROVEMENT_ICONS['camp']).toBe('⛺');
    expect(IMPROVEMENT_ICONS['quarry']).toBe('⚒️');
  });

  it('retains entries for original improvement types', () => {
    expect(IMPROVEMENT_ICONS['farm']).toBe('🌾');
    expect(IMPROVEMENT_ICONS['mine']).toBe('⛏️');
    expect(IMPROVEMENT_ICONS['lumber_camp']).toBe('🪵');
    expect(IMPROVEMENT_ICONS['watermill']).toBe('💧');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/hex-renderer.test.ts
```

Expected: FAIL — `IMPROVEMENT_ICONS` is not exported, and new improvement types are missing.

- [ ] **Step 3: Lift and export the icons map in `src/renderer/hex-renderer.ts`**

In `hex-renderer.ts`, find the block inside `drawHex` that declares the local `icons` const:

```ts
    const icons: Record<string, string> = {
      farm: '🌾',
      mine: '⛏️',
      lumber_camp: '🪵',
      watermill: '💧',
    };
    const icon = icons[tile.improvement] ?? '◆';
```

Replace with a reference to a module-level exported constant. At the **module level** (top of the file, outside any function), add:

```ts
export const IMPROVEMENT_ICONS: Record<string, string> = {
  farm: '🌾',
  mine: '⛏️',
  lumber_camp: '🪵',
  watermill: '💧',
  plantation: '🌿',
  pasture: '🐂',
  camp: '⛺',
  quarry: '⚒️',
};
```

Inside `drawHex`, replace the local `icons` const + usage with:

```ts
    const icon = IMPROVEMENT_ICONS[tile.improvement] ?? '◆';
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/hex-renderer.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hex-renderer.ts tests/renderer/hex-renderer.test.ts
git commit -m "feat(hex-renderer): export IMPROVEMENT_ICONS and add plantation/pasture/camp/quarry icon entries"
```

---

## Task 6: Create `resource-acquisition-system.ts` — pure `getCivAvailableResources`

**Files:**
- **Create:** `src/systems/resource-acquisition-system.ts`
- **Create:** `tests/systems/resource-acquisition-system.test.ts`

---

- [ ] **Step 1: Write the failing tests (create test file first)**

Create `tests/systems/resource-acquisition-system.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import type { GameState, HexTile } from '@/core/types';

// Minimal GameState builder for acquisition tests.
// Only populates the fields getCivAvailableResources reads.
function buildState(params: {
  civId: string;
  techs: string[];
  cities: Array<{
    id: string;
    position: { q: number; r: number };
    ownedTiles: Array<{ q: number; r: number }>;
  }>;
  tiles: Record<string, Partial<HexTile>>;
}): GameState {
  const cityMap: Record<string, unknown> = {};
  for (const c of params.cities) {
    cityMap[c.id] = {
      id: c.id,
      name: 'TestCity',
      owner: params.civId,
      position: c.position,
      ownedTiles: c.ownedTiles,
      workedTiles: [],
      population: 1,
      food: 0,
      foodNeeded: 10,
      buildings: [],
      productionQueue: [],
      productionProgress: 0,
      focus: 'balanced',
      maturity: 'village',
      grid: [],
      gridSize: 3,
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    };
  }

  const tileMap: Record<string, HexTile> = {};
  for (const [key, overrides] of Object.entries(params.tiles)) {
    const qr = key.split(',').map(Number);
    tileMap[key] = {
      coord: { q: qr[0], r: qr[1] },
      terrain: 'hills',
      elevation: 'highland',
      resource: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      owner: params.civId,
      hasRiver: false,
      wonder: null,
      ...overrides,
    } as HexTile;
  }

  return {
    civilizations: {
      [params.civId]: {
        id: params.civId,
        cities: params.cities.map(c => c.id),
        techState: {
          completed: params.techs,
          currentResearch: null,
          researchQueue: [],
          researchProgress: 0,
          trackPriorities: {},
        },
      },
    },
    cities: cityMap,
    map: { tiles: tileMap, width: 20, height: 20, wrapsHorizontally: false, rivers: [] },
  } as unknown as GameState;
}

const SINGLE_CITY = [{ id: 'city1', position: { q: 0, r: 0 }, ownedTiles: [{ q: 1, r: 0 }] }];

describe('getCivAvailableResources', () => {
  // Test 1: tech without improvement → unavailable
  it('tech without improvement does not grant resource', () => {
    const state = buildState({
      civId: 'p1',
      techs: ['mining-tech'],
      cities: SINGLE_CITY,
      tiles: {
        '1,0': { resource: 'gems', improvement: 'none', improvementTurnsLeft: 0 },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('gems')).toBe(false);
  });

  // Test 2: improvement without tech → unavailable
  it('improvement without tech does not grant resource', () => {
    const state = buildState({
      civId: 'p1',
      techs: [],   // no mining-tech
      cities: SINGLE_CITY,
      tiles: {
        '1,0': { resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0 },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('gems')).toBe(false);
  });

  // Test 3: tech + completed improvement → available
  it('tech + completed improvement (turnsLeft === 0) grants resource', () => {
    const state = buildState({
      civId: 'p1',
      techs: ['mining-tech'],
      cities: SINGLE_CITY,
      tiles: {
        '1,0': { resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0 },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('gems')).toBe(true);
  });

  // Test 4: tech + improvement still in progress → unavailable
  it('tech + improvement in progress (turnsLeft > 0) does not grant resource', () => {
    const state = buildState({
      civId: 'p1',
      techs: ['mining-tech'],
      cities: SINGLE_CITY,
      tiles: {
        '1,0': { resource: 'gems', improvement: 'mine', improvementTurnsLeft: 2 },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('gems')).toBe(false);
  });

  // Test 5: city-center tile + tech only → available (no improvement needed)
  it('city-center tile with tech grants resource without improvement', () => {
    const cityPos = { q: 0, r: 0 };
    const state = buildState({
      civId: 'p1',
      techs: ['mining-tech'],
      cities: [{ id: 'city1', position: cityPos, ownedTiles: [cityPos] }],
      tiles: {
        '0,0': { coord: cityPos, resource: 'gems', improvement: 'none', improvementTurnsLeft: 0 },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('gems')).toBe(true);
  });

  // Test 6: city-center + no tech → unavailable
  it('city-center tile without tech does not grant resource', () => {
    const cityPos = { q: 0, r: 0 };
    const state = buildState({
      civId: 'p1',
      techs: [],   // no mining-tech
      cities: [{ id: 'city1', position: cityPos, ownedTiles: [cityPos] }],
      tiles: {
        '0,0': { coord: cityPos, resource: 'gems', improvement: 'none', improvementTurnsLeft: 0 },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('gems')).toBe(false);
  });

  // Test 7: multi-city — resource on city-2's tile is counted
  it('counts resources on tiles of any owned city, not just the first', () => {
    const state = buildState({
      civId: 'p1',
      techs: ['mining-tech'],
      cities: [
        { id: 'city1', position: { q: 0, r: 0 }, ownedTiles: [{ q: 1, r: 0 }] },  // no gems
        { id: 'city2', position: { q: 10, r: 10 }, ownedTiles: [{ q: 11, r: 10 }] }, // has gems
      ],
      tiles: {
        '1,0': { resource: null, improvement: 'none', improvementTurnsLeft: 0 },
        '11,10': { terrain: 'hills', resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0 },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('gems')).toBe(true);
  });

  // Test 8: furs on tundra + camp + foraging → available
  it('furs on tundra with camp and foraging tech grants resource', () => {
    const state = buildState({
      civId: 'p1',
      techs: ['foraging'],
      cities: SINGLE_CITY,
      tiles: {
        '1,0': { terrain: 'tundra', resource: 'furs', improvement: 'camp', improvementTurnsLeft: 0 },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('furs')).toBe(true);
  });

  // Test 9: cattle on grassland + pasture + domestication → available
  it('cattle on grassland with pasture and domestication tech grants resource', () => {
    const state = buildState({
      civId: 'p1',
      techs: ['domestication'],
      cities: SINGLE_CITY,
      tiles: {
        '1,0': { terrain: 'grassland', resource: 'cattle', improvement: 'pasture', improvementTurnsLeft: 0 },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('cattle')).toBe(true);
  });

  // Test 10: resource on enemy-owned tile (not in p1's ownedTiles) → not returned
  it('resource on tile outside civId territory is not returned', () => {
    // city1 only owns tile '1,0'; tile '5,5' has gems but is not in ownedTiles
    const state = buildState({
      civId: 'p1',
      techs: ['mining-tech'],
      cities: SINGLE_CITY,
      tiles: {
        '1,0': { resource: null },
        '5,5': { terrain: 'hills', resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0, owner: 'enemy' },
      },
    });
    expect(getCivAvailableResources(state, 'p1').has('gems')).toBe(false);
  });

  // Test 11: two qualifying tiles for same resource → Set returns it once
  it('two qualifying tiles for the same resource return it exactly once (Set semantics)', () => {
    const state = buildState({
      civId: 'p1',
      techs: ['mining-tech'],
      cities: [{
        id: 'city1',
        position: { q: 0, r: 0 },
        ownedTiles: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
      }],
      tiles: {
        '1,0': { terrain: 'hills', resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0 },
        '2,0': { terrain: 'hills', resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0 },
      },
    });
    const result = getCivAvailableResources(state, 'p1');
    expect(result.has('gems')).toBe(true);
    expect(result.size).toBe(1);  // Set, not count
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/resource-acquisition-system.test.ts
```

Expected: All 11 tests FAIL — the module does not exist yet.

- [ ] **Step 3: Create `src/systems/resource-acquisition-system.ts`**

```ts
import type { GameState, ResourceType } from '@/core/types';
import { RESOURCE_DEFINITIONS } from './trade-system';
import { hexKey } from './hex-utils';

export function getCivAvailableResources(state: GameState, civId: string): Set<ResourceType> {
  const result = new Set<ResourceType>();
  const civ = state.civilizations[civId];
  if (!civ) return result;

  const completedTechs = new Set(civ.techState.completed);
  const resourceMap = new Map(RESOURCE_DEFINITIONS.map(d => [d.id, d]));

  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    const cityKey = hexKey(city.position);

    for (const coord of city.ownedTiles) {
      const key = hexKey(coord);
      const tile = state.map.tiles[key];
      if (!tile?.resource) continue;

      const def = resourceMap.get(tile.resource);
      if (!def) continue;
      if (!completedTechs.has(def.tech)) continue;

      if (key === cityKey) {
        // City-center tile: tech alone is sufficient
        result.add(tile.resource as ResourceType);
      } else {
        // Non-city-center: must have the matching improvement, fully built
        if (
          tile.improvement === def.requiredImprovement &&
          tile.improvementTurnsLeft === 0
        ) {
          result.add(tile.resource as ResourceType);
        }
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to confirm all 11 pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/resource-acquisition-system.test.ts
```

Expected: All 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/resource-acquisition-system.ts tests/systems/resource-acquisition-system.test.ts
git commit -m "feat(resource-acquisition): add getCivAvailableResources pure function with 11 spec-fidelity tests"
```

---

## Task 7: Update marketplace-panel — binary badge and Your Resources section

**Files:**
- Modify: `src/ui/marketplace-panel.ts`
- **Create:** `tests/ui/marketplace-panel.test.ts`

### What changes

1. Replace `countPlayerResources` (tile-count helper) with `getCivAvailableResources`.
2. Change the "You own: N" display to a binary badge: **"✓ Owned"** or **"✗ Not available"**.
3. Add a **"Your Resources"** summary section above the price list with counts by type and empty-state message.
4. The panel still shows all 16 resources — no tech filtering (that's S3).

---

- [ ] **Step 1: Write failing tests**

Create `tests/ui/marketplace-panel.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import type { GameState } from '@/core/types';

function buildMarketState(overrides: Partial<GameState['marketplace']> = {}): GameState['marketplace'] {
  // Minimal marketplace state: only prices needed for panel to render
  const prices: Record<string, number> = {};
  const priceHistory: Record<string, number[]> = {};
  const resources = ['silk','wine','spices','gems','ivory','incense','gold','silver','furs','sheep','copper','iron','horses','stone','cattle','salt'];
  for (const r of resources) {
    prices[r] = 5;
    priceHistory[r] = [5];
  }
  return { prices, priceHistory, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], ...overrides };
}

function buildState(params: {
  currentPlayer: string;
  civTechs?: string[];
  civCities?: string[];
  cities?: Record<string, unknown>;
  tiles?: Record<string, unknown>;
}): GameState {
  return {
    currentPlayer: params.currentPlayer,
    marketplace: buildMarketState(),
    civilizations: {
      [params.currentPlayer]: {
        id: params.currentPlayer,
        cities: params.civCities ?? ['city1'],
        techState: { completed: params.civTechs ?? [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
      },
    },
    cities: params.cities ?? {
      city1: {
        id: 'city1', owner: params.currentPlayer,
        position: { q: 0, r: 0 },
        ownedTiles: [],
        workedTiles: [],
      },
    },
    map: {
      tiles: params.tiles ?? {},
      width: 10, height: 10, wrapsHorizontally: false, rivers: [],
    },
  } as unknown as GameState;
}

describe('createMarketplacePanel', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows ✓ Owned badge when player has tech + completed improvement for a resource', () => {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['mining-tech'],
      civCities: ['city1'],
      cities: {
        city1: {
          id: 'city1', owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 }, terrain: 'hills', elevation: 'highland',
          resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0,
          owner: 'p1', hasRiver: false, wonder: null,
        },
      },
    });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    expect(panel?.textContent).toContain('✓ Owned');
  });

  it('shows ✗ Not available badge when player has tech but no improvement', () => {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['mining-tech'],
      cities: {
        city1: {
          id: 'city1', owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 }, terrain: 'hills', elevation: 'highland',
          resource: 'gems', improvement: 'none', improvementTurnsLeft: 0,
          owner: 'p1', hasRiver: false, wonder: null,
        },
      },
    });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    expect(panel?.textContent).toContain('✗ Not available');
  });

  it('Your Resources section lists owned resources by type', () => {
    const state = buildState({
      currentPlayer: 'p1',
      civTechs: ['mining-tech', 'foraging'],
      cities: {
        city1: {
          id: 'city1', owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 }, terrain: 'hills', elevation: 'highland',
          resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0,
          owner: 'p1', hasRiver: false, wonder: null,
        },
        '2,0': {
          coord: { q: 2, r: 0 }, terrain: 'forest', elevation: 'lowland',
          resource: 'ivory', improvement: 'camp', improvementTurnsLeft: 0,
          owner: 'p1', hasRiver: false, wonder: null,
        },
      },
    });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    const text = panel?.textContent ?? '';
    expect(text).toContain('Your Resources');
    expect(text).toContain('Gems');   // luxury
    expect(text).toContain('Ivory');  // luxury
  });

  it('Your Resources empty state mentions tech and improvements', () => {
    const state = buildState({ currentPlayer: 'p1', civTechs: [] });

    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const panel = document.getElementById('marketplace-panel');
    const text = panel?.textContent ?? '';
    expect(text).toContain('Your Resources');
    expect(text).toMatch(/tech|research/i);
    expect(text).toMatch(/improvement/i);
  });

  it('uses state.currentPlayer — never hardcoded civ id', () => {
    // Open panel as 'civ2', not 'p1'
    const state = buildState({
      currentPlayer: 'civ2',
      civTechs: ['mining-tech'],
      cities: {
        city1: {
          id: 'city1', owner: 'civ2',
          position: { q: 0, r: 0 },
          ownedTiles: [{ q: 1, r: 0 }],
          workedTiles: [],
        },
      },
      tiles: {
        '1,0': {
          coord: { q: 1, r: 0 }, terrain: 'hills', elevation: 'highland',
          resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0,
          owner: 'civ2', hasRiver: false, wonder: null,
        },
      },
    });
    // 'p1' data doesn't exist in state — if panel hardcodes 'p1' or 'player', this would crash/show wrong data
    createMarketplacePanel(container, state, { onClose: vi.fn() });
    const panel = document.getElementById('marketplace-panel');
    expect(panel?.textContent).toContain('✓ Owned');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: FAIL — "✓ Owned" badge text doesn't exist; "Your Resources" section doesn't exist.

- [ ] **Step 3: Update `src/ui/marketplace-panel.ts`**

Add import at the top of the file:
```ts
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
```

Replace the `countPlayerResources` call at the top of `createMarketplacePanel`:
```ts
// Before:
const playerResources = countPlayerResources(state);

// After:
const ownedResources = getCivAvailableResources(state, state.currentPlayer);
```

In the resource row template HTML, replace the "You own" line:
```ts
// Before:
<div style="font-size:11px;opacity:0.6;">You own: <span data-text="res-owned-${idx}"></span></div>

// After:
<div style="font-size:11px;opacity:0.6;" data-text="res-owned-${idx}"></div>
```

In the `setText` injection loop, replace the owned logic:
```ts
// Before:
const owned = playerResources[def.id] ?? 0;
setText(`res-owned-${idx}`, String(owned));

// After:
// def.id is ResourceType (from ResourceDefinition); ownedResources is Set<ResourceType> — no cast needed
const isOwned = ownedResources.has(def.id);
setText(`res-owned-${idx}`, isOwned ? '✓ Owned' : '✗ Not available');
```

Add a "Your Resources" summary section to the HTML. Insert it between `${fashionBannerHtml}` and the resource rows div. Build the summary **before** the `panel.innerHTML` assignment:

```ts
  // Build "Your Resources" summary — d.id is ResourceType, ownedResources is Set<ResourceType>
  const luxuryOwned = RESOURCE_DEFINITIONS
    .filter(d => d.type === 'luxury' && ownedResources.has(d.id))
    .map(d => d.name);
  const strategicOwned = RESOURCE_DEFINITIONS
    .filter(d => d.type === 'strategic' && ownedResources.has(d.id))
    .map(d => d.name);

  const yourResourcesHtml = `
    <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 12px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:bold;color:#e8c170;margin-bottom:6px;" data-text="your-resources-heading"></div>
      <div data-text="your-resources-body"></div>
    </div>
  `;
```

Insert `${yourResourcesHtml}` in `panel.innerHTML` between the fashion banner and the resource rows div.

Then after the `setText` calls for fashion and resource rows, add:

```ts
  setText('your-resources-heading', 'Your Resources');

  if (luxuryOwned.length === 0 && strategicOwned.length === 0) {
    const emptyEl = panel.querySelector('[data-text="your-resources-body"]');
    if (emptyEl) emptyEl.textContent = 'None yet — research techs and build improvements to harvest resources.';
  } else {
    const bodyEl = panel.querySelector('[data-text="your-resources-body"]');
    if (bodyEl) {
      const luxLine = document.createElement('div');
      luxLine.style.cssText = 'font-size:12px;opacity:0.8;';
      luxLine.textContent = `Luxury (${luxuryOwned.length}): ${luxuryOwned.length > 0 ? luxuryOwned.join(', ') : '—'}`;
      const strLine = document.createElement('div');
      strLine.style.cssText = 'font-size:12px;opacity:0.8;';
      strLine.textContent = `Strategic (${strategicOwned.length}): ${strategicOwned.length > 0 ? strategicOwned.join(', ') : '—'}`;
      bodyEl.appendChild(luxLine);
      bodyEl.appendChild(strLine);
    }
  }
```

Remove the `countPlayerResources` function entirely (it is now dead code).

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/marketplace-panel.test.ts
```

Expected: All 5 tests PASS. Also run the full suite to catch regressions:

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: No regressions.

- [ ] **Step 5: Commit**

```bash
git add src/ui/marketplace-panel.ts tests/ui/marketplace-panel.test.ts
git commit -m "feat(marketplace-panel): replace tile count with binary Owned/Not-available badge and add Your Resources summary section"
```

---

## Task 8: Update territory-inspection-panel — 6-state acquisition status

**Files:**
- Modify: `src/ui/territory-inspection-panel.ts`
- Modify: `tests/ui/territory-inspection-panel.test.ts`

### The 6 states

| Condition | Status shown |
|---|---|
| No reveal tech | *(resource section hidden — S1 behavior, unchanged)* |
| Has tech + tile is viewer's city-center | ✓ Available — city tile, tech researched |
| Has tech + improvement complete (turnsLeft === 0) | ✓ Available — [ImprovementName] built |
| Has tech + improvement in progress (turnsLeft > 0) | ⏳ [ImprovementName] in progress ([N] turns) |
| Has tech + no improvement on tile | ✗ Needs [ImprovementName] to harvest |
| Has tech + tile owned by another civ | [Resource name+type only] — no status line |

The "Foreign territory" state omits the acquisition status entirely: the viewer cannot build improvements on tiles they don't own, so showing ✗ would be misleading.

---

- [ ] **Step 1: Write failing tests**

Open `tests/ui/territory-inspection-panel.test.ts` and add new tests after the existing describe block. The file uses a custom `MockDocument`/`MockElement` — follow the same pattern.

First, add the necessary imports at the top if not already present:
```ts
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
```

Then add at the end of the file, outside the existing `describe`:

```ts
describe('createTerritoryInspectionPanel — S2b acquisition status', () => {
  // The test file uses a custom MockDocument — follow that pattern.
  // All panel text is accessible via panel.textContent (MockElement concatenates children).
  // We must set up the same beforeEach/afterEach that the outer describe block uses,
  // since this is a sibling (not nested inside) the existing describe.
  const originalDocument2 = globalThis.document;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: new MockDocument() as unknown as Document,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument2,
      configurable: true,
    });
  });

  function makeCoord(q: number, r: number) { return { q, r }; }

  function makeTile(overrides: Partial<import('@/core/types').HexTile>): import('@/core/types').HexTile {
    return {
      coord: { q: 1, r: 0 },
      terrain: 'hills',
      elevation: 'highland',
      resource: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      owner: 'p1',
      hasRiver: false,
      wonder: null,
      ...overrides,
    };
  }

  function buildState(params: {
    viewerId: string;
    techs: string[];
    tile: import('@/core/types').HexTile;
    cityPosition?: import('@/core/types').HexCoord;
  }): import('@/core/types').GameState {
    const cityId = 'city1';
    const cityPos = params.cityPosition ?? makeCoord(99, 99); // default: tile is not city center
    const tileKey = `${params.tile.coord.q},${params.tile.coord.r}`;
    return {
      civilizations: {
        [params.viewerId]: {
          id: params.viewerId,
          cities: [cityId],
          techState: { completed: params.techs, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          visibility: { tiles: { [tileKey]: 'visible' } },
        },
      },
      cities: {
        [cityId]: {
          id: cityId, owner: params.viewerId,
          position: cityPos,
          ownedTiles: [params.tile.coord, cityPos],
          workedTiles: [],
        },
      },
      map: {
        tiles: { [tileKey]: params.tile },
        width: 20, height: 20, wrapsHorizontally: false, rivers: [],
      },
      territoryFrontiers: {},
    } as unknown as import('@/core/types').GameState;
  }

  it('shows ✓ Available — city tile when tile is viewer city center with tech', () => {
    const cityPos = makeCoord(1, 0);
    const tile = makeTile({ coord: cityPos, resource: 'gems', improvement: 'none', owner: 'p1' });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile, cityPosition: cityPos });
    const panel = createTerritoryInspectionPanel(state, cityPos, 'p1');
    expect(panel.textContent).toContain('✓ Available');
    expect(panel.textContent).toContain('city tile');
  });

  it('shows ✓ Available — [ImprovementName] built when improvement complete', () => {
    const tile = makeTile({ resource: 'gems', improvement: 'mine', improvementTurnsLeft: 0 });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    expect(panel.textContent).toContain('✓ Available');
    expect(panel.textContent).toContain('Mine built');
  });

  it('shows ⏳ in progress when improvement is under construction', () => {
    const tile = makeTile({ resource: 'gems', improvement: 'mine', improvementTurnsLeft: 3 });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    expect(panel.textContent).toContain('⏳');
    expect(panel.textContent).toContain('Mine');
    expect(panel.textContent).toContain('3');
  });

  it('shows ✗ Needs [ImprovementName] to harvest when no improvement', () => {
    const tile = makeTile({ resource: 'gems', improvement: 'none', improvementTurnsLeft: 0 });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    expect(panel.textContent).toContain('✗ Needs');
    expect(panel.textContent).toContain('Mine');
    expect(panel.textContent).toContain('harvest');
  });

  it('shows ✗ Needs [ImprovementName] when wrong improvement is built', () => {
    // Wrong improvement: plantation instead of mine on a gems tile
    const tile = makeTile({ resource: 'gems', improvement: 'plantation', improvementTurnsLeft: 0 });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    expect(panel.textContent).toContain('✗ Needs');
    expect(panel.textContent).toContain('Mine');
  });

  it('shows no acquisition status for tiles owned by another civ (foreign territory)', () => {
    // tile is owned by 'enemy', not 'p1'
    const tile = makeTile({ resource: 'gems', improvement: 'none', owner: 'enemy' });
    const state = buildState({ viewerId: 'p1', techs: ['mining-tech'], tile });
    const panel = createTerritoryInspectionPanel(state, tile.coord, 'p1');
    const text = panel.textContent ?? '';
    // Resource name should still appear (p1 has the tech)
    expect(text).toContain('Gems');
    // But acquisition status must be absent
    expect(text).not.toContain('✓ Available');
    expect(text).not.toContain('✗ Needs');
    expect(text).not.toContain('⏳');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/territory-inspection-panel.test.ts
```

Expected: The 6 new tests FAIL — no acquisition status line is rendered yet.

- [ ] **Step 3: Update `src/ui/territory-inspection-panel.ts`**

`hexKey` is already imported (line 3). Extend the existing improvement-system import to include `IMPROVEMENT_DEFINITIONS`:

```ts
// Change:
import { getImprovementDisplayName } from '@/systems/improvement-system';

// To:
import { getImprovementDisplayName, IMPROVEMENT_DEFINITIONS } from '@/systems/improvement-system';
```

Find the resource display block (lines 97–102):
```ts
  const resDef = tile.resource
    ? RESOURCE_DEFINITIONS.find(r => r.id === tile.resource)
    : null;
  if (resDef && viewerTechs.has(resDef.tech)) {
    addLine(panel, 'Resource', `${resDef.name} (${resDef.type})`);
  }
```

Replace with:
```ts
  const resDef = tile.resource
    ? RESOURCE_DEFINITIONS.find(r => r.id === tile.resource)
    : null;
  if (resDef && viewerTechs.has(resDef.tech)) {
    addLine(panel, 'Resource', `${resDef.name} (${resDef.type})`);

    // Acquisition status — only shown for tiles the viewer owns.
    // tile.owner !== viewerId covers both foreign-owned (other civ) and unowned (null) tiles:
    // null !== 'p1' is true, so unclaimed tiles are treated as foreign (correct — can't build there).
    const isForeignTile = tile.owner !== viewerId;
    if (!isForeignTile) {
      // Determine if this tile is a city center of the viewing civ
      const tileKey = hexKey(coord);
      const viewerCiv = state.civilizations[viewerId];
      const isCityCenter = (viewerCiv?.cities ?? []).some(cityId => {
        const city = state.cities[cityId];
        return city && hexKey(city.position) === tileKey;
      });

      let statusText: string;
      if (isCityCenter) {
        statusText = '✓ Available — city tile, tech researched';
      } else {
        // resDef.requiredImprovement is BuildableImprovementType (added in Task 2)
        const reqImprov = resDef.requiredImprovement;
        const improvName = getImprovementDisplayName(reqImprov);

        if (tile.improvement === reqImprov && tile.improvementTurnsLeft === 0) {
          statusText = `✓ Available — ${improvName} built`;
        } else if (tile.improvement === reqImprov && tile.improvementTurnsLeft > 0) {
          statusText = `⏳ ${improvName} in progress (${tile.improvementTurnsLeft} turns)`;
        } else {
          statusText = `✗ Needs ${improvName} to harvest`;
        }
      }
      addLine(panel, 'Harvest', statusText);
    }
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/territory-inspection-panel.test.ts
```

Expected: All tests PASS. Run the full suite:

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: No regressions. Build must compile cleanly:

```bash
bash scripts/run-with-mise.sh yarn build
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/territory-inspection-panel.ts tests/ui/territory-inspection-panel.test.ts
git commit -m "feat(territory-inspection-panel): add 6-state resource acquisition status line"
```

---

## Final verification

- [ ] **Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: All tests pass. No regression.

- [ ] **Run a production build to confirm TypeScript exhaustiveness**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: Zero TypeScript errors. The build enforces `Record<ImprovementType, number>` exhaustiveness — if any union member is missing from `IMPROVEMENT_BUILD_TURNS`, the build fails here.

- [ ] **Open a PR**

```bash
gh pr create \
  --title "feat(marketplace): S2a+S2b — resource improvements, acquisition model, and inventory UI" \
  --base main \
  --body "$(cat <<'EOF'
## Summary
- Adds 4 new tile improvement types: Plantation 🌿, Pasture 🐂, Camp ⛺, Quarry ⚒️
- Expands resource catalog from 10 to 16 (adds gold, silver, furs, cattle, sheep, salt)
- Adds `getCivAvailableResources(state, civId)` — pure stateless acquisition model gated on tech + completed improvement
- Marketplace panel: binary ✓/✗ ownership badge replaces misleading tile count; "Your Resources" summary section above price list
- Territory inspection panel: 6-state acquisition status line (city-center, built, in-progress, missing, wrong improvement, foreign tile)
- Fixes stone placement: moved from hills to mountain in map generator
- All 16 resources now placed by map generators; LUXURY_RESOURCES hotspot list updated

## Known limitations
- Wrong-improvement dead end: player who builds the wrong improvement on a resource tile cannot remove it. Inspection panel shows ✗ correctly but offers no remedy.
- Forest-mutation trap: building a farm on a forest tile with ivory/furs mutates terrain to plains, making camp un-buildable. The resource becomes permanently un-harvestable on that tile.
- Old-save stone tiles placed on hills by pre-S2a saves show ✗ Needs Quarry (accurate but irremediable without save migration).
- Tech filtering in marketplace is S3 scope — all 16 resources remain visible regardless of tech.
- Mint, Ranch, Tannery buildings are S4a scope.

## Why this is safe to merge
S2a and S2b ship together per the no-dead-end-UX rule. `getCivAvailableResources` is called from both the marketplace panel and the territory inspection panel in this same PR, so the function is fully wired on merge. No player-visible surface introduced by this PR links to an unimplemented follow-up.

## Out of scope
- Tech-filtered marketplace view → S3
- Per-resource yield/happiness effects → S4a
- Strategic resource prerequisites for units/buildings → S4b
- Mint, Ranch, Tannery buildings → S4a
- Trade routes → S5
EOF
)"
```

---

## Self-review checklist

Run this against the plan before executing:

- [ ] Every task shows the failing test BEFORE the implementation
- [ ] Every new type extension is in the same commit as the corresponding Record extension
- [ ] `getCivAvailableResources` is wired into both the marketplace panel and inspection panel in this PR (no dead computed data)
- [ ] Stone is moved to mountain in both the ResourceDefinition (Task 2) and the map generator (Task 4)
- [ ] LUXURY_RESOURCES in balanced-map-generator includes all 4 new luxury resources
- [ ] `IMPROVEMENT_ICONS` is exported so tests can verify it without canvas setup
- [ ] Territory inspection "Foreign territory" state omits acquisition status (not misleading)
- [ ] All dynamic text via `textContent` — no `innerHTML` with game strings
- [ ] `state.currentPlayer` used everywhere — never hardcoded civ id
- [ ] Hills probability reduced to 10% in `TERRAIN_PROBABILITIES` override map
- [ ] `requiredImprovement` field added to `ResourceDefinition` interface and populated for all 16 entries
- [ ] `countPlayerResources` removed (dead code after Task 7)
- [ ] No `Math.random()` anywhere in new code
