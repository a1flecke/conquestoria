# Tech Era Expansion — PR2: Era 6 (Gunpowder Age)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 30 era 6 techs, the grenadier unit, era 6 buildings and national projects (including rewiring `stock_exchange` to `joint-stock-companies`), and three era 6 wonders.

**Architecture:** Builds directly on PR1's National Project mechanic and `tech-definitions-eras5-7.ts`. All era 6 content goes into `tech-definitions-eras5-7.ts` and `city-system.ts`. Existing `stock_exchange` building's `techRequired` is changed from the relocated `global-logistics` stub to the new era 6 `joint-stock-companies` tech.

**Tech Stack:** Same as PR1. All commands: `bash scripts/run-with-mise.sh yarn <cmd>`.

## Global Constraints

- `cost:` NOT `productionCost:` in `TRAINABLE_UNITS`
- Unit fallback icons go in `FALLBACK_ICONS` in `src/renderer/unit-visual-resolver.ts`
- Wonder `cityRequirement` is a string literal (`'any'` / `'river'` / `'coastal'`) — not an object
- Wonder quest steps require `type:` field from the union
- Never `Math.random()` — seeded RNG only
- `state.currentPlayer` — never hardcode `'player'`
- `textContent` / `createTextNode()` for dynamic DOM text — never `innerHTML` with game strings
- All NPs: `uniquePerEmpire: true`, era ceilings per `.claude/rules/game-balance.md`

---

## Task 14 — Era 6 Tech Definitions (30 techs)

**Files:**
- Modify: `src/systems/tech-definitions-eras5-7.ts`

- [ ] **Step 1: Add `const ERA_6_TECHS: Tech[]` after `ERA_5_TECHS`** and add it to the export:

```ts
const ERA_6_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'rifle-tactics', name: 'Rifle Tactics', track: 'military', cost: 185,
    prerequisites: ['black-powder', 'professional-army'],
    unlocks: ['Musketeer-class units replaced by riflemen'], unlocksUnits: ['rifleman'], era: 6 },
  { id: 'grenade-warfare', name: 'Grenade Warfare', track: 'military', cost: 185,
    prerequisites: ['black-powder', 'military-logistics'],
    unlocks: ['Grenadier unlocked — anti-fortification specialist'], unlocksUnits: ['grenadier'], era: 6 },

  // ECONOMY (2)
  { id: 'joint-stock-companies', name: 'Joint-Stock Companies', track: 'economy', cost: 185,
    prerequisites: ['guilds', 'colonial-trade'],
    unlocks: ['Stock Exchange unlocked'], unlocksBuildings: ['stock_exchange'], era: 6 },
  { id: 'mercantilism', name: 'Mercantilism', track: 'economy', cost: 180,
    prerequisites: ['colonial-trade', 'taxation'],
    unlocks: ['Trade route capacity +1; +5% gold empire-wide'], era: 6 },

  // SCIENCE (2)
  { id: 'natural-history', name: 'Natural History', track: 'science', cost: 185,
    prerequisites: ['scientific-method', 'optics'],
    unlocks: ['+2 science per natural wonder in empire territory'], unlocksBuildings: ['natural_history_museum'], era: 6 },
  { id: 'hydraulics', name: 'Hydraulics', track: 'science', cost: 180,
    prerequisites: ['scientific-method', 'irrigation'],
    unlocks: ['+2 production in river cities'], era: 6 },

  // CIVICS (2)
  { id: 'separation-of-powers', name: 'Separation of Powers', track: 'civics', cost: 185,
    prerequisites: ['constitutional-law'],
    unlocks: ['+1 gold per era-appropriate building empire-wide'], era: 6 },
  { id: 'parliamentary-reform', name: 'Parliamentary Reform', track: 'civics', cost: 180,
    prerequisites: ['civic-humanism', 'constitutional-law'],
    unlocks: ['+5% production empire-wide'], era: 6 },

  // EXPLORATION (2)
  { id: 'land-survey', name: 'Land Survey', track: 'exploration', cost: 185,
    prerequisites: ['colonial-charter', 'renaissance-architecture'],
    unlocks: ['+1 tile yield in settled frontier cities'], era: 6 },
  { id: 'colonial-administration', name: 'Colonial Administration Tech', track: 'exploration', cost: 180,
    prerequisites: ['colonial-charter', 'mercantilism'],
    unlocks: ['Colonial Administration national project available'], era: 6 },

  // AGRICULTURE (2)
  { id: 'crop-rotation', name: 'Crop Rotation', track: 'agriculture', cost: 180,
    prerequisites: ['plantation-farming'],
    unlocks: ['Farms yield +1 food; granaries add +1 food'], era: 6 },
  { id: 'tobacco-trade', name: 'Tobacco Trade', track: 'agriculture', cost: 185,
    prerequisites: ['distillation', 'colonial-trade'],
    unlocks: ['+2 gold per plantation improvement'], era: 6 },

  // MEDICINE (2)
  { id: 'surgery', name: 'Surgery', track: 'medicine', cost: 185,
    prerequisites: ['anatomy'],
    unlocks: ['Units in cities heal 2 additional HP per turn'], unlocksBuildings: ['surgery_guild'], era: 6 },
  { id: 'epidemic-control', name: 'Epidemic Control', track: 'medicine', cost: 180,
    prerequisites: ['herbalist-guilds'],
    unlocks: ['City population loss from famine halved'], era: 6 },

  // PHILOSOPHY (2)
  { id: 'enlightenment', name: 'Enlightenment', track: 'philosophy', cost: 185,
    prerequisites: ['empiricism', 'rationalism'],
    unlocks: ['+1 science per two population in cities'], era: 6 },
  { id: 'social-contract', name: 'Social Contract', track: 'philosophy', cost: 180,
    prerequisites: ['rationalism', 'civic-humanism'],
    unlocks: ['+2 gold per city with a market'], era: 6 },

  // ARTS (2)
  { id: 'baroque-music', name: 'Baroque Music', track: 'arts', cost: 185,
    prerequisites: ['classical-music-form'],
    unlocks: ['+1 gold per culture building; morale bonus'], unlocksBuildings: ['concert_hall'], era: 6 },
  { id: 'portrait-art', name: 'Portrait Art', track: 'arts', cost: 180,
    prerequisites: ['renaissance-painting'],
    unlocks: ['+1 gold per art gallery in empire'], era: 6 },

  // MARITIME (2)
  { id: 'trade-winds', name: 'Trade Winds', track: 'maritime', cost: 185,
    prerequisites: ['deep-sea-routes', 'circumnavigation'],
    unlocks: ['Naval units gain +1 movement'], era: 6 },
  { id: 'frigate-construction', name: 'Frigate Construction', track: 'maritime', cost: 180,
    prerequisites: ['naval-gunnery'],
    unlocks: ['Frigate unlocked — fast armed escort'], unlocksUnits: ['frigate'], era: 6 },

  // METALLURGY (2)
  { id: 'precision-casting', name: 'Precision Casting', track: 'metallurgy', cost: 185,
    prerequisites: ['cannon-casting'],
    unlocks: ['Cannon units gain +5 strength; cannon cost -10%'], era: 6 },
  { id: 'steel-plate-armor', name: 'Steel Plate Armor', track: 'metallurgy', cost: 180,
    prerequisites: ['blast-furnace-tech'],
    unlocks: ['Land melee units gain +3 defense strength'], era: 6 },

  // CONSTRUCTION (2)
  { id: 'fortification-engineering', name: 'Fortification Engineering', track: 'construction', cost: 185,
    prerequisites: ['renaissance-architecture'],
    unlocks: ['Walls provide +5 defense strength to garrison'], unlocksBuildings: ['star_fort'], era: 6 },
  { id: 'aqueduct-expansion', name: 'Aqueduct Expansion', track: 'construction', cost: 180,
    prerequisites: ['vaulted-ceilings', 'hydraulics'],
    unlocks: ['+2 food in all cities with aqueduct'], era: 6 },

  // COMMUNICATION (2)
  { id: 'newspaper-press', name: 'Newspaper Press', track: 'communication', cost: 185,
    prerequisites: ['printing-press', 'postal-service'],
    unlocks: ['+2 science empire-wide; reduces unhappiness from war'], era: 6 },
  { id: 'courier-network', name: 'Courier Network', track: 'communication', cost: 180,
    prerequisites: ['postal-service'],
    unlocks: ['+1 gold per road connection between your cities'], era: 6 },

  // ESPIONAGE (2)
  { id: 'counter-espionage', name: 'Counter-Espionage', track: 'espionage', cost: 185,
    prerequisites: ['black-chambers'],
    unlocks: ['-25% chance enemy spies succeed against your cities'], era: 6 },
  { id: 'propaganda', name: 'Propaganda', track: 'espionage', cost: 180,
    prerequisites: ['diplomatic-networks'],
    unlocks: ['Spy missions to flip loyalties available in foreign cities'], era: 6 },

  // SPIRITUALITY (2)
  { id: 'ecumenical-council', name: 'Ecumenical Council', track: 'spirituality', cost: 185,
    prerequisites: ['reformation'],
    unlocks: ['+2 gold per city with a temple empire-wide'], era: 6 },
  { id: 'missionary-zeal', name: 'Missionary Zeal', track: 'spirituality', cost: 180,
    prerequisites: ['monastic-orders'],
    unlocks: ['Missionaries spread religion to conquered cities faster'], era: 6 },
];
```

Then update the export to include era 6:

```ts
export const TECH_TREE_ERAS_5_7: Tech[] = [
  ...RELOCATED_STUBS,
  ...ERA_5_TECHS,
  ...ERA_6_TECHS,
];
```

- [ ] **Step 2: Rewire `stock_exchange` tech prereq** — in `src/systems/city-system.ts`, find the `stock_exchange` building definition and change:

```ts
techRequired: 'global-logistics',
```

to:

```ts
techRequired: 'joint-stock-companies',
```

- [ ] **Step 3: Build + consistency test**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts
bash scripts/run-with-mise.sh yarn build
```

Expected: consistency passes for all era 6 techs. Note that `rifleman`, `grenadier`, `frigate`, `natural_history_museum`, `surgery_guild`, `concert_hall`, `star_fort` consistency failures will be resolved in Tasks 15–17.

- [ ] **Step 4: Commit**

```bash
git add src/systems/tech-definitions-eras5-7.ts src/systems/city-system.ts
git commit -m "feat(tech-tree): add 30 era 6 tech definitions; rewire stock_exchange to joint-stock-companies"
```

---

## Task 15 — Grenadier Unit (Full Wiring)

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/renderer/unit-visual-resolver.ts`
- Modify: `src/ai/basic-ai.ts`

- [ ] **Step 1: Add `'grenadier'` to `UnitType`** union in `types.ts` — after `'cannon'`.

- [ ] **Step 2: Add to `UNIT_DEFINITIONS`** in `unit-system.ts`, after `cannon`:

```ts
grenadier: {
  type: 'grenadier',
  name: 'Grenadier',
  movementPoints: 2,
  visionRange: 2,
  strength: 32,
  canFoundCity: false,
  canBuildImprovements: false,
  productionCost: 130,
  domain: 'land',
  attackProfile: { kind: 'explosive', range: 1, bonusVsBuildings: 10, targets: ['unit', 'city'] },
},
```

Add to `UNIT_DESCRIPTIONS`:

```ts
grenadier: 'Grenade-throwing infantry. +10 bonus strength vs fortifications and city walls. Good vs entrenched defenders.',
```

- [ ] **Step 3: Add to `TRAINABLE_UNITS`** in `city-system.ts` — note `cost:` not `productionCost:`:

```ts
{ type: 'grenadier', cost: 130, techRequired: 'grenade-warfare' },
```

- [ ] **Step 4: Add `PRODUCTION_ICONS` entry**:

```ts
grenadier: '💥',
```

- [ ] **Step 5: Add to `FALLBACK_ICONS`** in `src/renderer/unit-visual-resolver.ts`:

```ts
grenadier: '💥',
```

- [ ] **Step 6: Add AI grenadier training** in `basic-ai.ts`:

```ts
if (
  civ.techState.completed.includes('grenade-warfare') &&
  !civUnits.some(u => u.type === 'grenadier') &&
  city.productionQueue.length === 0
) {
  newState = {
    ...newState,
    cities: { ...newState.cities, [cityId]: { ...city, productionQueue: ['grenadier'] } },
  };
}
```

- [ ] **Step 7: Build + consistency test**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts
bash scripts/run-with-mise.sh yarn build
```

Expected: grenadier consistency passes. Build exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/renderer/unit-visual-resolver.ts src/ai/basic-ai.ts
git commit -m "feat(units): add grenadier — full wiring, anti-fortification specialist"
```

---

## Task 16 — Era 6 Buildings + National Projects

**Files:**
- Modify: `src/systems/city-system.ts`

Add 5 regular buildings and 3 national projects to `BUILDINGS`, plus `PRODUCTION_ICONS` entries.

The `colonial_administration` NP has per-city scaling (+2 gold per city beyond the 4th). Its `civYieldBonus` is intentionally omitted from the building definition — the computation lives in `national-project-system.ts` `computePerCityGold()`, which already has it in the allowlist. No `cityYieldBonus` — empire-wide only.

- [ ] **Step 1: Add 5 regular buildings** (after era 5 buildings block):

```ts
// ERA 6 REGULAR BUILDINGS
natural_history_museum: {
  id: 'natural_history_museum', name: 'Natural History Museum', category: 'science',
  yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 180,
  description: 'Museum of natural specimens. +3 science.',
  techRequired: 'natural-history',
},
surgery_guild: {
  id: 'surgery_guild', name: 'Surgery Guild', category: 'science',
  yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 170,
  description: 'Surgical practice hall. +2 science. Units heal +2 HP/turn in this city.',
  techRequired: 'surgery',
},
concert_hall: {
  id: 'concert_hall', name: 'Concert Hall', category: 'culture',
  yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 175,
  description: 'Grand venue for baroque performance. +2 gold.',
  techRequired: 'baroque-music',
},
star_fort: {
  id: 'star_fort', name: 'Star Fort', category: 'military',
  yields: { food: 0, production: 1, gold: 0, science: 0 }, productionCost: 185,
  description: 'Angled bastion fortification. +1 production. +5 defense strength to garrisoned units.',
  techRequired: 'fortification-engineering',
},
stock_exchange: {
  id: 'stock_exchange', name: 'Stock Exchange', category: 'economy',
  yields: { food: 0, production: 0, gold: 4, science: 0 }, productionCost: 195,
  description: 'Financial market hub. +4 gold.',
  techRequired: 'joint-stock-companies',
},
```

Note: if `stock_exchange` was already defined earlier in `BUILDINGS`, find it and update `techRequired` instead of adding a duplicate.

- [ ] **Step 2: Add 3 era 6 national projects** (after the era 5 NPs):

```ts
// Era 6 — homeEra: 6
grand_cipher_bureau: {
  id: 'grand_cipher_bureau', name: 'Grand Cipher Bureau', category: 'espionage',
  yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 250,
  description: 'National cryptography ministry. +1 gold empire-wide. Enemy spy success rates reduced.',
  techRequired: 'counter-espionage',
  uniquePerEmpire: true, nationalProject: { homeEra: 6 },
  civYieldBonus: { gold: 1 },
},
military_academy: {
  id: 'military_academy', name: 'Military Academy', category: 'military',
  yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 255,
  description: 'Officer training institution. +2 production empire-wide. New units spawn with 1 bonus XP.',
  techRequired: 'rifle-tactics',
  uniquePerEmpire: true, nationalProject: { homeEra: 6 },
  civYieldBonus: { production: 2 },
},
colonial_administration: {
  id: 'colonial_administration', name: 'Colonial Administration', category: 'economy',
  yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 250,
  description: '+2 gold per city beyond your 4th empire-wide (scales with colonial expansion).',
  techRequired: 'colonial-administration',
  uniquePerEmpire: true, nationalProject: { homeEra: 6 },
  // No civYieldBonus — per-city computation in national-project-system.ts computePerCityGold()
  // Allowlisted in .claude/rules/game-balance.md
},
```

- [ ] **Step 3: Add `PRODUCTION_ICONS` entries**:

```ts
// Era 6 regular buildings
natural_history_museum: '🦕',
surgery_guild: '🩺',
concert_hall: '🎹',
star_fort: '⭐',
stock_exchange: '📈',
// Era 6 NPs
grand_cipher_bureau: '🔒',
military_academy: '🎖️',
colonial_administration: '🌍',
```

- [ ] **Step 4: Run balance tests + full suite**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/national-project-balance.test.ts
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts
git commit -m "feat(buildings): add 5 era 6 buildings and 3 era 6 national projects"
```

---

## Task 17 — Era 6 Wonders

**Files:**
- Modify: `src/systems/legendary-wonder-definitions.ts`
- Modify: `src/systems/approved-legendary-wonder-roster.ts`
- Modify: `tests/systems/wonder-definitions.test.ts`

- [ ] **Step 1: Add three era 6 wonders** to `LEGENDARY_WONDER_DEFINITIONS_BY_ID`:

```ts
'palace-of-the-sun': {
  id: 'palace-of-the-sun',
  name: 'Palace of the Sun',
  era: 6,
  productionCost: 265,
  requiredTechs: ['baroque-music', 'separation-of-powers'],
  requiredResources: ['gold_resource'],
  cityRequirement: 'any',
  questSteps: [
    {
      id: 'gold-treasury',
      type: 'research_count',
      track: 'economy',
      targetCount: 4,
      description: 'Complete 4 economy technologies.',
    },
    {
      id: 'grand-cities',
      type: 'buildings-in-multiple-cities',
      targetCount: 3,
      cityScope: 'empire',
      minimumBuildingsPerCity: 5,
      description: 'Develop 3 cities to at least 5 buildings each.',
    },
  ],
  reward: {
    summary: '+5 gold and +1 production empire-wide each turn.',
    civYieldBonus: { gold: 5, production: 1 },
  },
},
'iron-arsenal': {
  id: 'iron-arsenal',
  name: 'Iron Arsenal',
  era: 6,
  productionCost: 265,
  requiredTechs: ['precision-casting', 'fortification-engineering'],
  requiredResources: ['iron'],
  cityRequirement: 'any',
  questSteps: [
    {
      id: 'military-techs',
      type: 'research_count',
      track: 'military',
      targetCount: 4,
      description: 'Complete 4 military technologies.',
    },
    {
      id: 'strongholds',
      type: 'defeat_stronghold',
      targetCount: 2,
      description: 'Defeat 2 enemy strongholds or fortified cities.',
    },
  ],
  reward: {
    summary: '+3 production empire-wide each turn. Military production powerhouse.',
    civYieldBonus: { production: 3 },
  },
},
'merchant-admiralty': {
  id: 'merchant-admiralty',
  name: 'Merchant Admiralty',
  era: 6,
  productionCost: 265,
  requiredTechs: ['trade-winds', 'frigate-construction'],
  requiredResources: [],
  cityRequirement: 'coastal',
  questSteps: [
    {
      id: 'naval-routes',
      type: 'trade-routes-established',
      targetCount: 3,
      routeRequirement: 'coastal',
      description: 'Establish 3 coastal or overseas trade routes.',
    },
    {
      id: 'maritime-techs',
      type: 'research_count',
      track: 'maritime',
      targetCount: 3,
      description: 'Complete 3 maritime technologies.',
    },
  ],
  reward: {
    summary: '+6 gold empire-wide each turn. Maritime trading supremacy.',
    civYieldBonus: { gold: 6 },
  },
},
```

- [ ] **Step 2: Add to approved roster**:

```ts
'palace-of-the-sun',
'iron-arsenal',
'merchant-admiralty',
```

- [ ] **Step 3: Run wonder balance tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/wonder-definitions.test.ts
```

Expected: all pass. Verify `merchant-admiralty` gold 6 ≤ 6 ceiling (passes exactly).

- [ ] **Step 4: Full test suite + build**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/systems/legendary-wonder-definitions.ts src/systems/approved-legendary-wonder-roster.ts tests/systems/wonder-definitions.test.ts
git commit -m "feat(wonders): add 3 era 6 wonders (palace-of-the-sun, iron-arsenal, merchant-admiralty)"
```

---

## PR2 Verification Gate

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Both must exit 0.

**Manual smoke test:**
1. Research `grenade-warfare` → grenadier appears in city production queue
2. Research `joint-stock-companies` → stock exchange available (no longer requires `global-logistics`)
3. Research `colonial-administration` → Colonial Administration NP appears in National Projects section
4. With 6 cities, build Colonial Administration → verify +4 gold empire-wide ((6−4)×2)
5. Merchant Admiralty wonder requires coastal city → confirm it's filtered out for inland-only civs

**Create PR:**
```
Title: feat(tech-tree): PR2 — Era 6 (Gunpowder Age)
Target: main
```
