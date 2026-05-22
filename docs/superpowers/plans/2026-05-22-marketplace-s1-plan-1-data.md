# S1 Plan 1 — Data Foundation: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `tech` and `icon` fields to `ResourceDefinition`, populate all 10 resource entries, derive `RESOURCE_ICONS` and `RESOURCE_TECH` lookup records, and add "Reveal X resource" text to the `unlocks` array of the 9 enabling techs that don't already have it.

**Architecture:** Pure data change — no new files, no state fields, no save migration. `trade-system.ts` is the single source of truth; lookup records are derived by a loop at module init time. `tech-definitions.ts` gets text additions only. Plans 2 and 3 both import from these files, so this plan must be merged first.

**Tech Stack:** TypeScript, Vitest

---

## Files changed

| File | Change |
|---|---|
| `src/systems/trade-system.ts` | Add `tech` + `icon` to `ResourceDefinition` interface; populate all 10 entries; derive `RESOURCE_ICONS` and `RESOURCE_TECH` |
| `src/systems/tech-definitions.ts` | Add `'Reveal X resource'` to `unlocks` for 9 techs |
| `tests/systems/trade-system.test.ts` | Add catalog-integrity `describe` block |
| `tests/systems/tech-definitions.test.ts` | Add resource-reveal unlock-text `describe` block |

---

### Task 1: Write failing catalog-integrity tests

**Files:**
- Modify: `tests/systems/trade-system.test.ts`

- [ ] **Step 1: Add imports and new describe block to the test file**

At the top of `tests/systems/trade-system.test.ts`, extend the imports to include `RESOURCE_ICONS` and `RESOURCE_TECH` (both don't exist yet — the imports will cause the test run to error, which counts as failing):

```ts
import { describe, it, expect } from 'vitest';
import {
  RESOURCE_DEFINITIONS,
  RESOURCE_ICONS,
  RESOURCE_TECH,
  BASE_PRICES,
  createMarketplaceState,
  calculatePrice,
  detectMonopoly,
  calculateTradeRouteGold,
  updatePrices,
  processFashionCycle,
  processTradeRouteIncome,
} from '@/systems/trade-system';
import { TECH_TREE } from '@/systems/tech-definitions';
```

Then add a new `describe` block inside the outer `describe('trade-system', ...)`, after the existing `RESOURCE_DEFINITIONS` describe block:

```ts
  describe('catalog integrity — tech and icon fields', () => {
    it('every ResourceDefinition entry has a non-empty tech field', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(r.tech, `${r.id} missing tech`).toBeTruthy();
      }
    });

    it('every tech field references a real tech id in TECH_TREE', () => {
      const techIds = new Set(TECH_TREE.map(t => t.id));
      for (const r of RESOURCE_DEFINITIONS) {
        expect(techIds.has(r.tech), `${r.id}.tech "${r.tech}" not found in TECH_TREE`).toBe(true);
      }
    });

    it('every ResourceDefinition entry has a non-empty icon field', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(r.icon, `${r.id} missing icon`).toBeTruthy();
      }
    });

    it('RESOURCE_ICONS has a non-empty entry for every resource id', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(RESOURCE_ICONS[r.id], `RESOURCE_ICONS missing "${r.id}"`).toBeTruthy();
      }
    });

    it('RESOURCE_TECH has a non-empty entry for every resource id', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(RESOURCE_TECH[r.id], `RESOURCE_TECH missing "${r.id}"`).toBeTruthy();
      }
    });

    it('RESOURCE_ICONS values match icon fields on RESOURCE_DEFINITIONS', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(RESOURCE_ICONS[r.id]).toBe(r.icon);
      }
    });

    it('RESOURCE_TECH values match tech fields on RESOURCE_DEFINITIONS', () => {
      for (const r of RESOURCE_DEFINITIONS) {
        expect(RESOURCE_TECH[r.id]).toBe(r.tech);
      }
    });
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/trade-system.test.ts
```

Expected: `RESOURCE_ICONS` and `RESOURCE_TECH` are not exported yet → import error or property-access error. Tests fail. ✓

---

### Task 2: Implement ResourceDefinition fields + lookup records

**Files:**
- Modify: `src/systems/trade-system.ts`

- [ ] **Step 3: Update the ResourceDefinition interface**

Replace the existing `ResourceDefinition` interface:

```ts
export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string;       // terrain it spawns on
  basePrice: number;
  tech: string;          // enabling tech id — added by S1
  icon: string;          // emoji for map rendering and legend — added by S1
}
```

- [ ] **Step 4: Populate all 10 entries with tech and icon**

Replace the `RESOURCE_DEFINITIONS` array:

```ts
export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  // Luxury
  { id: 'silk',    name: 'Silk',    type: 'luxury',    terrain: 'grassland', basePrice: 8,  tech: 'irrigation',       icon: '🧵' },
  { id: 'wine',    name: 'Wine',    type: 'luxury',    terrain: 'plains',    basePrice: 7,  tech: 'pottery',          icon: '🍇' },
  { id: 'spices',  name: 'Spices',  type: 'luxury',    terrain: 'jungle',    basePrice: 10, tech: 'cartography',      icon: '🌶️' },
  { id: 'gems',    name: 'Gems',    type: 'luxury',    terrain: 'hills',     basePrice: 12, tech: 'mining-tech',      icon: '💎' },
  { id: 'ivory',   name: 'Ivory',   type: 'luxury',    terrain: 'forest',    basePrice: 9,  tech: 'foraging',         icon: '🐘' },
  { id: 'incense', name: 'Incense', type: 'luxury',    terrain: 'desert',    basePrice: 6,  tech: 'currency',         icon: '🕯️' },
  // Strategic
  { id: 'copper',  name: 'Copper',  type: 'strategic', terrain: 'hills',     basePrice: 5,  tech: 'stone-weapons',    icon: '🪙' },
  { id: 'iron',    name: 'Iron',    type: 'strategic', terrain: 'hills',     basePrice: 8,  tech: 'bronze-working',   icon: '⚙️' },
  { id: 'horses',  name: 'Horses',  type: 'strategic', terrain: 'plains',    basePrice: 7,  tech: 'animal-husbandry', icon: '🐎' },
  { id: 'stone',   name: 'Stone',   type: 'strategic', terrain: 'mountain',  basePrice: 4,  tech: 'gathering',        icon: '🪨' },
];
```

- [ ] **Step 5: Add RESOURCE_ICONS and RESOURCE_TECH derivation after RESOURCE_DEFINITIONS**

After the existing `BASE_PRICES` derivation loop, add:

```ts
export const RESOURCE_ICONS: Record<string, string> = {};
export const RESOURCE_TECH: Record<string, string> = {};
for (const r of RESOURCE_DEFINITIONS) {
  RESOURCE_ICONS[r.id] = r.icon;
  RESOURCE_TECH[r.id] = r.tech;
}
```

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/trade-system.test.ts
```

Expected: all catalog-integrity tests pass; all previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/systems/trade-system.ts tests/systems/trade-system.test.ts
git commit -m "$(cat <<'EOF'
feat(S1): add tech+icon fields to ResourceDefinition; derive RESOURCE_ICONS/RESOURCE_TECH

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Write failing tech-unlock tests

**Files:**
- Modify: `tests/systems/tech-definitions.test.ts`

- [ ] **Step 8: Add the resource-reveal unlock test block**

Append a new `describe` block inside the outer `describe` in `tests/systems/tech-definitions.test.ts`:

```ts
  describe('resource reveal unlock text', () => {
    const EXPECTED_REVEALS = [
      { techId: 'gathering',        resourceName: 'Stone'   },
      { techId: 'stone-weapons',    resourceName: 'Copper'  },
      { techId: 'foraging',         resourceName: 'Ivory'   },
      { techId: 'pottery',          resourceName: 'Wine'    },
      { techId: 'cartography',      resourceName: 'Spices'  },
      { techId: 'irrigation',       resourceName: 'Silk'    },
      { techId: 'bronze-working',   resourceName: 'Iron'    },
      { techId: 'animal-husbandry', resourceName: 'Horses'  },
      { techId: 'mining-tech',      resourceName: 'Gems'    },
      { techId: 'currency',         resourceName: 'Incense' },
    ];

    for (const { techId, resourceName } of EXPECTED_REVEALS) {
      it(`${techId} includes "Reveal ${resourceName} resource" in unlocks`, () => {
        const tech = TECH_TREE.find(t => t.id === techId);
        expect(tech, `tech "${techId}" not found`).toBeDefined();
        const hasReveal = tech?.unlocks.some(u => u === `Reveal ${resourceName} resource`);
        expect(
          hasReveal,
          `${techId} missing "Reveal ${resourceName} resource" in unlocks: [${tech?.unlocks.join(', ')}]`,
        ).toBe(true);
      });
    }
  });
```

- [ ] **Step 9: Run the tests to confirm they fail (all except animal-husbandry)**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-definitions.test.ts
```

Expected: 9 tests fail (all except `animal-husbandry includes "Reveal Horses resource" in unlocks`).

---

### Task 4: Add "Reveal X resource" to 9 techs

**Files:**
- Modify: `src/systems/tech-definitions.ts`

- [ ] **Step 10: Update the 9 tech entries**

In `src/systems/tech-definitions.ts`, find each of the following tech entries (they are on specific lines — search by `id:`) and append the reveal string to their `unlocks` array. `animal-husbandry` already has it; do not change it.

**`gathering`** — currently `unlocks: ['Foundational economy knowledge']`:
```ts
{ id: 'gathering', name: 'Gathering', track: 'economy', cost: 4, prerequisites: [], unlocks: ['Foundational economy knowledge', 'Reveal Stone resource'], era: 1, pacing: { band: 'starter', role: 'foundational-economy', impact: 1, scope: 'empire', snowball: 1.1, urgency: 1.05, situationality: 1, unlockBreadth: 1.05 } },
```

**`stone-weapons`** — currently `unlocks: ['Warriors deal +2 damage']`:
```ts
{ id: 'stone-weapons', name: 'Stone Weapons', track: 'military', cost: 4, prerequisites: [], unlocks: ['Warriors deal +2 damage', 'Reveal Copper resource'], era: 1, pacing: { band: 'starter', role: 'foundational-military', impact: 1.05, scope: 'military', snowball: 1, urgency: 1.15, situationality: 1, unlockBreadth: 1 } },
```

**`foraging`** — currently `unlocks: ['Food storage']`:
```ts
{ id: 'foraging', name: 'Foraging', track: 'agriculture', cost: 5, prerequisites: [], unlocks: ['Food storage', 'Reveal Ivory resource'], era: 1, pacing: { band: 'starter', role: 'foundational-economy', impact: 1, scope: 'empire', snowball: 1.1, urgency: 1.05, situationality: 1, unlockBreadth: 1.05 } },
```

Wait — check whether `foraging` has a `pacing` field. Look at the actual file. The instructions above give the complete replacement lines for each tech. If a tech doesn't have `pacing`, omit it. Use the `Edit` tool to make a targeted replacement — replace only the `unlocks` array in each tech entry, not the whole line, to avoid disturbing `pacing` or other fields.

Use **one Edit per tech**, replacing only the `unlocks` array value. Examples:

For `gathering` — replace:
```
unlocks: ['Foundational economy knowledge']
```
with:
```
unlocks: ['Foundational economy knowledge', 'Reveal Stone resource']
```

For `stone-weapons` — replace:
```
unlocks: ['Warriors deal +2 damage']
```
with:
```
unlocks: ['Warriors deal +2 damage', 'Reveal Copper resource']
```

For `foraging` — replace:
```
unlocks: ['Food storage']
```
with:
```
unlocks: ['Food storage', 'Reveal Ivory resource']
```

For `pottery` — replace:
```
unlocks: ['Foundational ceramics knowledge']
```
with:
```
unlocks: ['Foundational ceramics knowledge', 'Reveal Wine resource']
```

For `cartography` — replace:
```
unlocks: ['Reveal map edges']
```
with:
```
unlocks: ['Reveal map edges', 'Reveal Spices resource']
```

For `irrigation` — replace:
```
unlocks: ['Farms yield +1 food']
```
with:
```
unlocks: ['Farms yield +1 food', 'Reveal Silk resource']
```

For `bronze-working` — replace:
```
unlocks: ['Unlock Swordsman unit']
```
with:
```
unlocks: ['Unlock Swordsman unit', 'Reveal Iron resource']
```

For `mining-tech` — replace:
```
unlocks: ['Mines yield +1 production']
```
with:
```
unlocks: ['Mines yield +1 production', 'Reveal Gems resource']
```

For `currency` — replace:
```
unlocks: ['Unlock Marketplace building']
```
with:
```
unlocks: ['Unlock Marketplace building', 'Reveal Incense resource']
```

- [ ] **Step 11: Run the tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-definitions.test.ts
```

Expected: all 10 resource-reveal tests pass; the total tech count test (`expect(TECH_TREE.length).toBe(125)`) still passes (no new techs added). All other existing tests pass.

- [ ] **Step 12: Run the full build to check for type errors**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: exits 0. No TypeScript errors from adding `tech`/`icon` fields (they're populated on every entry so `ResourceDefinition` stays concrete).

- [ ] **Step 13: Commit**

```bash
git add src/systems/tech-definitions.ts tests/systems/tech-definitions.test.ts
git commit -m "$(cat <<'EOF'
feat(S1): add Reveal X resource unlock text to 9 enabling techs

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```
