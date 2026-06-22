# Tech Era Expansion — PR3: Era 7 (Industrial Revolution)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 30 era 7 techs, the rifleman unit (obsoleting musketeer and crossbowman), era 7 buildings and national projects (including `national_railway` with special-case per-city computation), three era 7 wonders, and complete the balance test suite.

**Architecture:** Builds on PR1 + PR2. `national_railway` NP computes "+1 production per city with railway_station" dynamically in `national-project-system.ts` via a new `computePerCityProduction()` helper (added to the existing `computePerCityGold` pattern). `public_health_service` NP earns two yield types within the era 7 ceiling (total 5 ≤ 7). Rifleman obsoletes musketeer and crossbowman via `obsoletedByTech: 'rifle-tactics'` on those units.

**Tech Stack:** Same as PR1/PR2. All commands: `bash scripts/run-with-mise.sh yarn <cmd>`.

## Global Constraints

- `cost:` NOT `productionCost:` in `TRAINABLE_UNITS`
- Unit fallback icons go in `FALLBACK_ICONS` in `src/renderer/unit-visual-resolver.ts`
- Wonder `cityRequirement` is a string literal — not an object
- Wonder quest steps require `type:` from the union
- Never `Math.random()` — seeded RNG only
- `state.currentPlayer` — never hardcode `'player'`
- `textContent` / `createTextNode()` — never `innerHTML` with game data
- All NPs: `uniquePerEmpire: true`, no `cityYieldBonus`, era ceilings per game-balance.md

---

## Task 18 — Era 7 Tech Definitions (30 techs)

**Files:**
- Modify: `src/systems/tech-definitions-eras5-7.ts`

- [ ] **Step 1: Add `const ERA_7_TECHS: Tech[]` after `ERA_6_TECHS`** and update the export:

```ts
const ERA_7_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'rifle-tactics', name: 'Rifle Tactics', track: 'military', cost: 220,
    prerequisites: ['grenade-warfare', 'professional-army'],
    unlocks: ['Rifleman replaces musketeer and crossbowman'], unlocksUnits: ['rifleman'], era: 7 },
  { id: 'field-artillery', name: 'Field Artillery', track: 'military', cost: 215,
    prerequisites: ['precision-casting', 'military-logistics'],
    unlocks: ['Cannon units gain +5 strength; field artillery maneuver bonus'], era: 7 },

  // ECONOMY (2)
  { id: 'industrialism', name: 'Industrialism', track: 'economy', cost: 220,
    prerequisites: ['joint-stock-companies', 'steam-power-tech'],
    unlocks: ['+2 production all cities'], unlocksBuildings: ['factory'], era: 7 },
  { id: 'free-trade', name: 'Free Trade', track: 'economy', cost: 215,
    prerequisites: ['mercantilism'],
    unlocks: ['Trade routes capacity +2; foreign trade routes yield +3 gold'], era: 7 },

  // SCIENCE (2)
  { id: 'steam-power-tech', name: 'Steam Power', track: 'science', cost: 220,
    prerequisites: ['hydraulics', 'blast-furnace-tech'],
    unlocks: ['+2 production per factory; enables railway'], unlocksBuildings: ['steam_engine'], era: 7 },
  { id: 'chemistry', name: 'Chemistry', track: 'science', cost: 215,
    prerequisites: ['natural-history', 'anatomy'],
    unlocks: ['+1 science per mine improvement'], era: 7 },

  // CIVICS (2)
  { id: 'nationalism', name: 'Nationalism', track: 'civics', cost: 220,
    prerequisites: ['parliamentary-reform'],
    unlocks: ['+1 production per population in capital'], era: 7 },
  { id: 'civil-service-reform', name: 'Civil Service Reform', track: 'civics', cost: 215,
    prerequisites: ['separation-of-powers', 'parliamentary-reform'],
    unlocks: ['+2 gold per city with a market or guildhall'], era: 7 },

  // EXPLORATION (2)
  { id: 'colonial-expansion', name: 'Colonial Expansion', track: 'exploration', cost: 220,
    prerequisites: ['land-survey'],
    unlocks: ['New settler cost reduced by 15%'], era: 7 },
  { id: 'railway-expansion', name: 'Railway Expansion', track: 'exploration', cost: 215,
    prerequisites: ['colonial-administration', 'steam-power-tech'],
    unlocks: ['Land units move at double speed on roads'], era: 7 },

  // AGRICULTURE (2)
  { id: 'mechanized-farming', name: 'Mechanized Farming', track: 'agriculture', cost: 215,
    prerequisites: ['crop-rotation'],
    unlocks: ['+1 food per farm; farm build time reduced'], era: 7 },
  { id: 'canning', name: 'Canning', track: 'agriculture', cost: 220,
    prerequisites: ['tobacco-trade'],
    unlocks: ['+2 food per coastal city; naval trade routes supply bonus'], era: 7 },

  // MEDICINE (2)
  { id: 'germ-theory', name: 'Germ Theory', track: 'medicine', cost: 220,
    prerequisites: ['surgery', 'epidemic-control'],
    unlocks: ['+1 population growth rate in all cities'], unlocksBuildings: ['public_hospital'], era: 7 },
  { id: 'sanitation', name: 'Sanitation', track: 'medicine', cost: 215,
    prerequisites: ['epidemic-control'],
    unlocks: ['Famine and plague events halved in frequency'], era: 7 },

  // PHILOSOPHY (2)
  { id: 'utilitarianism', name: 'Utilitarianism', track: 'philosophy', cost: 220,
    prerequisites: ['enlightenment'],
    unlocks: ['+1 gold per 5 population empire-wide'], era: 7 },
  { id: 'dialectics', name: 'Dialectics', track: 'philosophy', cost: 215,
    prerequisites: ['social-contract'],
    unlocks: ['+1 science per 3 population empire-wide'], era: 7 },

  // ARTS (2)
  { id: 'romantic-literature', name: 'Romantic Literature', track: 'arts', cost: 220,
    prerequisites: ['portrait-art', 'baroque-music'],
    unlocks: ['+2 gold per wonder in empire'], era: 7 },
  { id: 'opera', name: 'Opera', track: 'arts', cost: 215,
    prerequisites: ['baroque-music'],
    unlocks: ['+1 gold per culture building empire-wide'], unlocksBuildings: ['opera_house'], era: 7 },

  // MARITIME (2)
  { id: 'naval-supremacy', name: 'Naval Supremacy', track: 'maritime', cost: 220,
    prerequisites: ['frigate-construction', 'trade-winds'],
    unlocks: ['Naval units gain +1 movement'], era: 7 },
  { id: 'ironclad-hull', name: 'Ironclad Hull', track: 'maritime', cost: 215,
    prerequisites: ['steel-plate-armor', 'frigate-construction'],
    unlocks: ['Ironclad unlocked — armored warship'], unlocksUnits: ['ironclad'], era: 7 },

  // METALLURGY (2)
  { id: 'bessemer-process', name: 'Bessemer Process', track: 'metallurgy', cost: 220,
    prerequisites: ['steel-plate-armor', 'industrialism'],
    unlocks: ['+3 production in cities with blast furnace'], era: 7 },
  { id: 'precision-machining', name: 'Precision Machining', track: 'metallurgy', cost: 215,
    prerequisites: ['bessemer-process'],
    unlocks: ['All military unit production costs -10%'], era: 7 },

  // CONSTRUCTION (2)
  { id: 'iron-bridges', name: 'Iron Bridges', track: 'construction', cost: 220,
    prerequisites: ['aqueduct-expansion', 'bessemer-process'],
    unlocks: ['Roads now cross rivers freely; +1 gold per road connection'], era: 7 },
  { id: 'public-works', name: 'Public Works', track: 'construction', cost: 215,
    prerequisites: ['fortification-engineering'],
    unlocks: ['+2 production per city with a library and market'], era: 7 },

  // COMMUNICATION (2)
  { id: 'telegraph', name: 'Telegraph', track: 'communication', cost: 220,
    prerequisites: ['newspaper-press', 'courier-network'],
    unlocks: ['Intelligence reports arrive 1 turn faster; +1 gold per city'], era: 7 },
  { id: 'public-education', name: 'Public Education', track: 'communication', cost: 215,
    prerequisites: ['newspaper-press'],
    unlocks: ['+2 science in all cities with a university or library'], unlocksBuildings: ['public_school'], era: 7 },

  // ESPIONAGE (2)
  { id: 'secret-police', name: 'Secret Police', track: 'espionage', cost: 220,
    prerequisites: ['counter-espionage', 'propaganda'],
    unlocks: ['Unrest events in your cities reduced by 50%'], era: 7 },
  { id: 'industrial-espionage', name: 'Industrial Espionage', track: 'espionage', cost: 215,
    prerequisites: ['propaganda'],
    unlocks: ['Spies can steal production progress from foreign cities'], era: 7 },

  // SPIRITUALITY (2)
  { id: 'secular-humanism-tech', name: 'Secular Humanism', track: 'spirituality', cost: 220,
    prerequisites: ['ecumenical-council', 'utilitarianism'],
    unlocks: ['+1 science per 2 population; temple yields doubled'], era: 7 },
  { id: 'liberation-theology', name: 'Liberation Theology', track: 'spirituality', cost: 215,
    prerequisites: ['missionary-zeal'],
    unlocks: ['+2 food in cities with temples; +1 science per monastery'], era: 7 },
];
```

Update the export:

```ts
export const TECH_TREE_ERAS_5_7: Tech[] = [
  ...RELOCATED_STUBS,
  ...ERA_5_TECHS,
  ...ERA_6_TECHS,
  ...ERA_7_TECHS,
];
```

**Movement stacking note:** `trade-winds` (era 6, +1 naval) and `naval-supremacy` (era 7, +1 naval) stack to +2 naval movement. Per `.claude/rules/game-balance.md` the empire-wide cap is +2. This is the exact ceiling — do NOT add any further naval movement bonuses without updating the movement inventory table in that file.

- [ ] **Step 2: Build + consistency test**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts
bash scripts/run-with-mise.sh yarn build
```

Note remaining failures for `rifleman`, `ironclad`, `factory`, `steam_engine`, `public_hospital`, `opera_house`, `public_school` — resolved in Tasks 19–20.

- [ ] **Step 3: Commit**

```bash
git add src/systems/tech-definitions-eras5-7.ts
git commit -m "feat(tech-tree): add 30 era 7 tech definitions (Industrial Revolution)"
```

---

## Task 19 — Rifleman Unit (Full Wiring, Obsoletes Musketeer + Crossbowman)

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/renderer/unit-visual-resolver.ts`
- Modify: `src/ai/basic-ai.ts`

- [ ] **Step 1: Add `'rifleman'` to `UnitType`** union in `types.ts` — after `'grenadier'`.

- [ ] **Step 2: Add to `UNIT_DEFINITIONS`** in `unit-system.ts`, after `grenadier`:

```ts
rifleman: {
  type: 'rifleman',
  name: 'Rifleman',
  movementPoints: 2,
  visionRange: 2,
  strength: 42,
  canFoundCity: false,
  canBuildImprovements: false,
  productionCost: 140,
  domain: 'land',
  attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
},
```

Add to `UNIT_DESCRIPTIONS`:

```ts
rifleman: 'Industrial-era infantry with accurate rifles. Obsoletes musketeer and crossbowman. Stronger and cheaper to upgrade than its predecessors.',
```

- [ ] **Step 3: Add to `TRAINABLE_UNITS`** in `city-system.ts` — note `cost:` not `productionCost:`:

```ts
{ type: 'rifleman', cost: 140, techRequired: 'rifle-tactics' },
```

Add `obsoletedByTech: 'rifle-tactics'` to musketeer and crossbowman entries:

```ts
{ type: 'musketeer', cost: 100, techRequired: 'gunpowder', obsoletedByTech: 'rifle-tactics' },
{ type: 'crossbowman', cost: 80, techRequired: 'archery', obsoletedByTech: 'rifle-tactics' },
```

Find and update these entries (search for `type: 'musketeer'` and `type: 'crossbowman'` in TRAINABLE_UNITS).

- [ ] **Step 4: Add `PRODUCTION_ICONS` entry**:

```ts
rifleman: '🔫',
```

- [ ] **Step 5: Add to `FALLBACK_ICONS`** in `src/renderer/unit-visual-resolver.ts`:

```ts
rifleman: '🔫',
```

- [ ] **Step 6: Add AI rifleman training** in `basic-ai.ts`:

```ts
if (
  civ.techState.completed.includes('rifle-tactics') &&
  !civUnits.some(u => u.type === 'rifleman') &&
  city.productionQueue.length === 0
) {
  newState = {
    ...newState,
    cities: { ...newState.cities, [cityId]: { ...city, productionQueue: ['rifleman'] } },
  };
}
```

- [ ] **Step 7: Write obsolescence test** — add to `tests/systems/city-system.test.ts`:

```ts
describe('rifleman obsoletes musketeer and crossbowman', () => {
  const dummyMap = { width: 1, height: 1, tiles: {}, wrapsHorizontally: false, rivers: [] } as any;

  it('musketeer is dequeued when rifle-tactics is researched', () => {
    const city = {
      id: 'c1', name: 'Test', owner: 'p1', position: { q: 0, r: 0 },
      population: 1, food: 0, foodNeeded: 10, buildings: [],
      productionQueue: ['musketeer'], productionProgress: 0,
      ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'town',
    } as any;
    const result = processCity(city, dummyMap, 2, 0, undefined, ['rifle-tactics'], undefined, 7);
    expect(result.city.productionQueue).not.toContain('musketeer');
  });

  it('crossbowman is dequeued when rifle-tactics is researched', () => {
    const city = {
      id: 'c1', name: 'Test', owner: 'p1', position: { q: 0, r: 0 },
      population: 1, food: 0, foodNeeded: 10, buildings: [],
      productionQueue: ['crossbowman'], productionProgress: 0,
      ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'town',
    } as any;
    const result = processCity(city, dummyMap, 2, 0, undefined, ['rifle-tactics'], undefined, 7);
    expect(result.city.productionQueue).not.toContain('crossbowman');
  });
});
```

- [ ] **Step 8: Run tests + build**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts
bash scripts/run-with-mise.sh yarn build
```

Expected: obsolescence tests pass, rifleman consistency passes, build exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/renderer/unit-visual-resolver.ts src/ai/basic-ai.ts tests/systems/city-system.test.ts
git commit -m "feat(units): add rifleman — full wiring, obsoletes musketeer and crossbowman"
```

---

## Task 20 — Era 7 Buildings + National Projects

**Files:**
- Modify: `src/systems/national-project-system.ts`
- Modify: `src/systems/city-system.ts`

The `national_railway` NP yields "+1 production per city with railway_station building". This is per-city production scaling — add a `computePerCityProduction()` helper to `national-project-system.ts` (parallel to the existing `computePerCityGold`).

- [ ] **Step 1: Add `computePerCityProduction` to `national-project-system.ts`** — inside the existing helper block (after `computePerCityGold`):

```ts
// Per-city production NPs — allowlist required for each entry
function computePerCityProduction(buildingId: string, state: GameState, civId: string): number | null {
  if (buildingId === 'national_railway') {
    const cityCount = Object.values(state.cities).filter(
      c => c.owner === civId && c.buildings.includes('railway_station')
    ).length;
    return cityCount; // +1 production per city with railway_station
  }
  return null;
}
```

Then update `getNationalProjectCivYieldBonus` to call this helper after the gold check:

```ts
const perCityGold = computePerCityGold(buildingId, state, civId);
if (perCityGold !== null) {
  totals = addYield(totals, scaleYield({ gold: perCityGold }, multiplier));
  continue;
}

const perCityProduction = computePerCityProduction(buildingId, state, civId);
if (perCityProduction !== null) {
  totals = addYield(totals, scaleYield({ production: perCityProduction }, multiplier));
  continue;
}
```

Add `national_railway` to the per-city allowlist comment at the top of the file:
```
// Per-city-scaling allowlist — see .claude/rules/game-balance.md
// grand_bazaar: +1 gold per city
// colonial_administration: +2 gold per city beyond 4th
// national_railway: +1 production per city with railway_station
```

- [ ] **Step 2: Add `national_railway` test** to `tests/systems/national-project-system.test.ts`:

```ts
it('national_railway: +1 production per city with railway_station', () => {
  const state = makeState({
    era: 7,
    cities: {
      c1: { id: 'c1', owner: 'p1', name: 'A', position: { q: 0, r: 0 }, population: 2, food: 0, foodNeeded: 10, buildings: ['railway_station'], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'town' } as any,
      c2: { id: 'c2', owner: 'p1', name: 'B', position: { q: 1, r: 0 }, population: 2, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'town' } as any,
      c3: { id: 'c3', owner: 'p1', name: 'C', position: { q: 2, r: 0 }, population: 2, food: 0, foodNeeded: 10, buildings: ['railway_station'], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'town' } as any,
    },
    builtNationalProjects: {
      'p1:national_railway': { civId: 'p1', cityId: 'c1', eraBuilt: 7 },
    },
  });
  const bonus = getNationalProjectCivYieldBonus(state, 'p1');
  expect(bonus.production).toBe(2); // 2 cities with railway_station
});
```

- [ ] **Step 3: Add `railway_station` building** to `BUILDINGS` in `city-system.ts` (so the test can reference it; needed before the NP that requires it):

```ts
railway_station: {
  id: 'railway_station', name: 'Railway Station', category: 'production',
  yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 220,
  description: 'Steam rail terminus. +2 production, +1 gold. Required for National Railway NP.',
  techRequired: 'railway-expansion',
},
```

- [ ] **Step 4: Add 6 regular buildings + 3 national projects** to `BUILDINGS`:

```ts
// ERA 7 REGULAR BUILDINGS
factory: {
  id: 'factory', name: 'Factory', category: 'production',
  yields: { food: 0, production: 4, gold: 0, science: 0 }, productionCost: 225,
  description: 'Steam-powered manufacturing plant. +4 production.',
  techRequired: 'industrialism',
},
steam_engine: {
  id: 'steam_engine', name: 'Steam Engine', category: 'production',
  yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 210,
  description: 'Industrial steam prime mover. +2 production, +1 gold.',
  techRequired: 'steam-power-tech',
},
public_hospital: {
  id: 'public_hospital', name: 'Public Hospital', category: 'science',
  yields: { food: 2, production: 0, gold: 0, science: 1 }, productionCost: 215,
  description: 'City hospital with trained surgeons. +2 food, +1 science.',
  techRequired: 'germ-theory',
},
opera_house: {
  id: 'opera_house', name: 'Opera House', category: 'culture',
  yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 220,
  description: 'Grand opera venue. +3 gold.',
  techRequired: 'opera',
},
public_school: {
  id: 'public_school', name: 'Public School', category: 'science',
  yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 210,
  description: 'State-funded schooling. +3 science.',
  techRequired: 'public-education',
},

// Era 7 NATIONAL PROJECTS — homeEra: 7
national_railway: {
  id: 'national_railway', name: 'National Railway', category: 'production',
  yields: { food: 0, production: 1, gold: 1, science: 0 }, productionCost: 305,
  description: '+1 production per city with a railway station empire-wide. +1 gold per trade route.',
  techRequired: 'railway-expansion',
  uniquePerEmpire: true, nationalProject: { homeEra: 7 },
  // civYieldBonus intentionally absent — per-city production computed in national-project-system.ts
  // Tracked under national_railway in computePerCityProduction(); allowlisted in game-balance.md
},
public_health_service: {
  id: 'public_health_service', name: 'Public Health Service', category: 'science',
  yields: { food: 3, production: 0, gold: 0, science: 2 }, productionCost: 300,
  description: 'National public health network. +3 food and +2 science all cities.',
  techRequired: 'germ-theory',
  uniquePerEmpire: true, nationalProject: { homeEra: 7 },
  civYieldBonus: { food: 3, science: 2 },
  // Two keys: food 3 ≤ 3, science 2 ≤ 3; total 5 ≤ 7 (era 7 ceiling) ✓
},
imperial_war_college: {
  id: 'imperial_war_college', name: 'Imperial War College', category: 'military',
  yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 305,
  description: 'National officer training institution. +3 production empire-wide.',
  techRequired: 'field-artillery',
  uniquePerEmpire: true, nationalProject: { homeEra: 7 },
  civYieldBonus: { production: 3 },
},
```

- [ ] **Step 5: Add `PRODUCTION_ICONS` entries**:

```ts
// Era 7 regular buildings
railway_station: '🚂',
factory: '🏭',
steam_engine: '⚙️',
public_hospital: '🏥',
opera_house: '🎭',
public_school: '🏫',
// Era 7 NPs
national_railway: '🛤️',
public_health_service: '💊',
imperial_war_college: '🎖️',
```

- [ ] **Step 6: Update game-balance.md movement stacking inventory** — add this row to the table in `.claude/rules/game-balance.md`:

```
| `national_railway` national project | national project | — | (+1 production per railway_station city, no movement) | era 7–9 |
```

- [ ] **Step 7: Run national-project tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/national-project-system.test.ts
bash scripts/run-with-mise.sh yarn test tests/systems/national-project-balance.test.ts
```

Verify `public_health_service`: two keys, both ≤ 3, total ≤ 7. Both test files must pass.

- [ ] **Step 8: Build + full test suite**

```bash
bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/national-project-system.ts src/systems/city-system.ts tests/systems/national-project-system.test.ts .claude/rules/game-balance.md
git commit -m "feat(buildings): add era 7 buildings + NPs; national_railway per-city production"
```

---

## Task 21 — Era 7 Wonders + Final Balance Tests

**Files:**
- Modify: `src/systems/legendary-wonder-definitions.ts`
- Modify: `src/systems/approved-legendary-wonder-roster.ts`
- Modify: `tests/systems/wonder-definitions.test.ts`
- Modify: `tests/systems/national-project-balance.test.ts`

- [ ] **Step 1: Add three era 7 wonders**:

```ts
'iron-parliament': {
  id: 'iron-parliament',
  name: 'Iron Parliament',
  era: 7,
  productionCost: 310,
  requiredTechs: ['civil-service-reform', 'nationalism'],
  requiredResources: ['iron'],
  cityRequirement: 'any',
  questSteps: [
    {
      id: 'civics-techs',
      type: 'research_count',
      track: 'civics',
      targetCount: 4,
      description: 'Complete 4 civics technologies.',
    },
    {
      id: 'city-network',
      type: 'buildings-in-multiple-cities',
      targetCount: 4,
      cityScope: 'empire',
      minimumBuildingsPerCity: 4,
      description: 'Develop 4 cities with at least 4 buildings each.',
    },
  ],
  reward: {
    summary: '+4 gold and +2 science empire-wide each turn.',
    civYieldBonus: { gold: 4, science: 2 },
    // Two keys: gold 4 ≤ 6, science 2 ≤ 6 ✓; not subject to NP two-key ceiling (it is a wonder)
  },
},
'great-locomotive-works': {
  id: 'great-locomotive-works',
  name: 'Great Locomotive Works',
  era: 7,
  productionCost: 310,
  requiredTechs: ['industrialism', 'bessemer-process'],
  requiredResources: ['iron', 'coal'],
  cityRequirement: 'river',
  questSteps: [
    {
      id: 'metallurgy-techs',
      type: 'research_count',
      track: 'metallurgy',
      targetCount: 3,
      description: 'Complete 3 metallurgy technologies.',
    },
    {
      id: 'trade-routes',
      type: 'trade-routes-established',
      targetCount: 4,
      description: 'Establish 4 active trade routes.',
    },
  ],
  reward: {
    summary: '+6 production empire-wide each turn. Industrial manufacturing supremacy.',
    civYieldBonus: { production: 6 },
  },
},
'peoples-museum': {
  id: 'peoples-museum',
  name: "People's Museum",
  era: 7,
  productionCost: 310,
  requiredTechs: ['romantic-literature', 'public-education'],
  requiredResources: [],
  cityRequirement: 'any',
  questSteps: [
    {
      id: 'arts-science-techs',
      type: 'research_count',
      track: 'arts',
      targetCount: 3,
      description: 'Complete 3 arts technologies.',
    },
    {
      id: 'cultural-cities',
      type: 'buildings-in-multiple-cities',
      targetCount: 4,
      cityScope: 'empire',
      minimumBuildingsPerCity: 3,
      description: 'Develop 4 cities with at least 3 buildings each.',
    },
  ],
  reward: {
    summary: '+3 science and +3 gold empire-wide each turn.',
    civYieldBonus: { science: 3, gold: 3 },
    // Two keys: science 3 ≤ 6, gold 3 ≤ 6 ✓
  },
},
```

- [ ] **Step 2: Add to approved roster**:

```ts
'iron-parliament',
'great-locomotive-works',
'peoples-museum',
```

- [ ] **Step 3: Add final balance coverage** to `tests/systems/wonder-definitions.test.ts`:

```ts
describe('era 7 wonders respect yield ceilings', () => {
  const era7Wonders = ALL_WONDER_DEFINITIONS.filter(w => w.era === 7);

  it('has exactly 3 era 7 wonders', () => {
    expect(era7Wonders).toHaveLength(3);
  });

  it('great-locomotive-works has exactly 1 civYieldBonus key', () => {
    const w = era7Wonders.find(w => w.id === 'great-locomotive-works');
    expect(w?.reward.civYieldBonus).toEqual({ production: 6 });
  });

  it('peoples-museum has 2 civYieldBonus keys both <= 6', () => {
    const w = era7Wonders.find(w => w.id === 'peoples-museum');
    const bonus = w?.reward.civYieldBonus ?? {};
    expect(Object.keys(bonus)).toHaveLength(2);
    for (const v of Object.values(bonus) as number[]) {
      expect(v).toBeLessThanOrEqual(6);
    }
  });
});
```

- [ ] **Step 4: Add era 7 NP coverage** to `tests/systems/national-project-balance.test.ts`:

```ts
describe('era 7 national project coverage', () => {
  const era7NPs = nationalProjects.filter(np => np.nationalProject?.homeEra === 7);

  it('has exactly 3 era 7 national projects', () => {
    expect(era7NPs).toHaveLength(3);
  });

  it('public_health_service has two yield keys both <= 3', () => {
    const np = era7NPs.find(np => np.id === 'public_health_service');
    const bonus = np?.civYieldBonus ?? {};
    expect(Object.keys(bonus)).toHaveLength(2);
    for (const [k, v] of Object.entries(bonus) as [string, number][]) {
      expect(v, `public_health_service.${k} exceeds two-key max 3`).toBeLessThanOrEqual(3);
    }
  });

  it('national_railway has no civYieldBonus (per-city scaling)', () => {
    const np = era7NPs.find(np => np.id === 'national_railway');
    expect(np?.civYieldBonus).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run all balance + wonder tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/wonder-definitions.test.ts
bash scripts/run-with-mise.sh yarn test tests/systems/national-project-balance.test.ts
```

Expected: all pass.

- [ ] **Step 6: Full final test suite + build**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Both must exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/systems/legendary-wonder-definitions.ts src/systems/approved-legendary-wonder-roster.ts tests/systems/wonder-definitions.test.ts tests/systems/national-project-balance.test.ts
git commit -m "feat(wonders): add 3 era 7 wonders; complete PR3 balance test suite"
```

---

---

## Task 22 — Placeholder Art & Sound Replacement (Post-PR3 Follow-Up)

All sprites and bespoke assets added in PR3 use `TODO(art)` placeholder shapes generated at runtime. This task tracks replacing each with finished artwork via the `generate-sprite-prompt` skill.

### Era 7 Unit Sprites (src/renderer/sprites/units.tsx)

- [ ] **RiflemanSprite** — Replace TODO(art) placeholder with: industrial-era infantryman in dark-grey uniform with brass buttons, bolt-action rifle at shoulder, peaked cap, brown leather boots. Posed in a firing stance, 192×192 canvas, humanoid motion class.
- [ ] **IroncladSprite** — Replace TODO(art) placeholder with: low-profile armored warship, iron-plated hull with rivet lines, single smokestack emitting black smoke, gun ports along sides, paddle wheels visible, flying a faction pennant. 192×192 canvas, naval motion class.

### Era 7 Building Sprites (src/renderer/sprites/buildings.tsx)

- [ ] **FactorySprite** — Replace TODO(art) with: brick industrial mill with tall chimney stack, arched windows, conveyor belt loading dock, steam escaping from vents.
- [ ] **SteelMillSprite** — Replace TODO(art) with: tall blast furnace with slag chutes, iron ore hoppers at base, orange glow from crucible vents, iron beams stacked nearby.
- [ ] **FieldHospitalSprite** — Replace TODO(art) with: white canvas field tent with red cross pennant, cots visible inside, medic's lantern at entrance, triage flag.
- [ ] **PrintShopSprite** — Replace TODO(art) with: shop-front printing press behind large window, moveable type blocks visible, paper rolls stacked, ink-stained apron hanging by door.
- [ ] **CensusOfficeSprite** — Replace TODO(art) with: neoclassical government bureau with columns, ledger books stacked in windows, census form nailed to bulletin board outside.
- [ ] **NationalRailwaySprite** — Replace TODO(art) with: Victorian railway terminus, arched iron-and-glass roof, steam locomotive on tracks, passenger platform with benches.
- [ ] **GrandArsenalSprite** — Replace TODO(art) with: fortress-like weapons warehouse, iron gate, cannon barrels stacked in courtyard, guard tower, regimental banner.
- [ ] **PeoplesUniversitySprite** — Replace TODO(art) with: grand public hall with ionic columns, students gathered on steps, illuminated reading rooms visible through windows, clock tower.

### Era 7 Wonder Bespoke Assets (src/renderer/wonders/legendary-wonder-bespoke-assets.ts)

- [ ] **drawCrystalPalace** — Replace TODO(art) with: Victorian glass-and-iron exhibition hall — long barrel-vaulted nave of wrought-iron ribs filled with plate glass, arched transept, factory machinery and crystal exhibits visible inside. Use `generate-sprite-prompt` skill.
- [ ] **drawSuezCanal** — Replace TODO(art) with: aerial view of desert canal — massive stone lock gates, steamships queuing to pass through, Mediterranean-blue sea in distance, Egyptian palms lining the banks. Use `generate-sprite-prompt` skill.
- [ ] **drawContinentalCongress** — Replace TODO(art) with: grand domed congress hall — neoclassical facade with ionic columns, central dome above circular debating chamber, national flags flanking entrance, cobblestone plaza with delegates. Use `generate-sprite-prompt` skill.

### Era 7 SFX Notes

No new SFX files are needed for era 7. Rifleman inherits `humanoid` SFX class (same as musketeer/grenadier); ironclad inherits `naval` SFX class (same as galleon/steamship). If a future audio pass distinguishes rifle fire from musket fire, add `rifleman` to the SFX catalog explicitly.

---

## PR3 Verification Gate

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Both must exit 0.

**Manual smoke test:**
1. Research `rifle-tactics` → rifleman appears in queue; musketeer and crossbowman disappear from queue
2. Build National Railway after 3 cities have railway stations → verify +3 production per turn
3. Advance National Railway 2 eras later → `⏳ (fading)` badge visible; production halves
4. Great Locomotive Works requires `river` city → confirm coastal-only civs cannot build it
5. Era 7 tech panel label shows "Industrial Revolution"

**Create PR:**
```
Title: feat(tech-tree): PR3 — Era 7 (Industrial Revolution)
Target: main
```
