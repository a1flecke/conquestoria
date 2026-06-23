# Tech Era Expansion — PR6: Air Domain Architecture + Air Units (Eras 7 & 9)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the `'air'` domain — the architectural gap that has blocked balloon and aircraft units since era 7. Wire two air units end-to-end (`observation_balloon` era 7, `biplane` era 9), add air-specific techs, an anti-air building, a national project, and a legendary wonder. Builds on PR1–PR5.

**Why now:** Hot air balloons were used militarily in 1794 (French Revolution) and extensively in the US Civil War (1860s) — predating practical submarines by two decades. The `domain` type already supports `'land'` and `'naval'`; this PR adds `'air'` as the third pillar.

**Architecture decisions:**
- `'air'` units fly over all terrain (mountains, rivers, water) — not blocked. Movement validation must consult `unit.domain === 'air'` to bypass terrain checks.
- Air units do not occupy a tile in the conventional sense — they hover above it. Ground units on the same tile are unaffected. (No stacking conflict with land/naval units.)
- Air units have no `coastalRequired` — they can be trained in any city with an airfield (era 9) or without one (era 7 balloon, which predates airfields).
- Anti-air: a new `anti_air_battery` building grants ground units defensive bonus against air attacks. No new combat system needed — treat it as a flat `defenseBonus` modifier applied when the attacker `domain === 'air'`.
- Air units do NOT have a `sustainCost` in this PR (no fuel mechanic). Deferred to a future logistics pass.

**Tech additions by era:**

| Era | Track | New tech | Notes |
|---|---|---|---|
| 7 | military | `balloon-corps` | unlocks `observation_balloon` |
| 9 | military | `air-superiority` | prerequisite: `aviation`; unlocks `biplane`, `anti_air_battery` |

Adds 1 tech to era 7 military track (18 → 19 for military; total tree 277 → 278) and 1 to era 9 military track (277+1 → 279 after both). Count assertions in `tech-definitions.test.ts`, `tech-system.test.ts` must be updated.

**Pacing (era 7, 8, 9 unchanged — no new eras):** `observation_balloon` cost 90, production 16/turn era 7 → 6 turns (power-spike band late max 11 ✓). `biplane` cost 200, production 20/turn era 9 → 10 turns (power-spike band late max 11 ✓). `anti_air_battery` cost 170, 20/turn → 9 turns ✓. NP `air_force_command` cost 280, 20/turn → 14 turns (marquee late max 16 ✓).

**Tech Stack:** Same as PR1–PR5. All commands: `bash scripts/run-with-mise.sh yarn <cmd>`.

---

## Global Constraints

- `cost:` NOT `productionCost:` in `TRAINABLE_UNITS`
- Unit fallback icons go in `FALLBACK_ICONS` in `src/renderer/unit-visual-resolver.ts`
- Wonder `cityRequirement` is a string literal — not an object
- Wonder quest steps require `type:` from the union
- Never `Math.random()` — seeded RNG only
- `state.currentPlayer` — never hardcode `'player'`
- `textContent` / `createTextNode()` — never `innerHTML` with game data
- All NPs: `uniquePerEmpire: true`, no `cityYieldBonus`, era ceilings per game-balance.md
- Air units: `domain: 'air'` — must bypass terrain movement checks; no coastal restriction; no tile-stacking conflict with land/naval

---

## Task A — Air Domain Architecture (types + movement system)

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts` (movement validator)

- [ ] **Step 1: Extend `UnitDomain` type** in `types.ts`:

```ts
// Before:
export type UnitDomain = 'land' | 'naval';

// After:
export type UnitDomain = 'land' | 'naval' | 'air';
```

- [ ] **Step 2: Add `isAirUnit()` helper** to `unit-system.ts`:

```ts
export function isAirUnit(unit: { domain?: string }): boolean {
  return unit.domain === 'air';
}
```

- [ ] **Step 3: Update movement validation** in the shared movement helper (grep for `canUnitMoveTo` or the equivalent movement check function in `unit-system.ts`). Add an early-return bypass for air units before terrain checks:

```ts
// Air units fly over all terrain — no terrain restrictions
if (unit.domain === 'air') {
  // Only blocked by: city already at capacity (stacking), or out of movement points.
  // Water/mountain/river checks do not apply.
  return { canMove: true };
}
```

- [ ] **Step 4: Confirm no stacking conflict** — air units and ground/naval units may coexist on the same tile. The spawn-occupancy rule in `game-systems.md` applies only within the same domain. Update the spawn guard in `beast-system.ts` and any free-unit helpers to skip the occupancy check for `domain === 'air'` units (they hover, they don't occupy).

- [ ] **Step 5: Build + unit test**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test tests/systems/unit-system.test.ts
```

Both must exit 0 before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts
git commit -m "feat(air-domain): add 'air' UnitDomain type + bypass terrain movement for air units"
```

---

## Task B — Era-7 Air Tech + `observation_balloon` Unit (End-to-End)

**Historical context:** Observation balloons were tethered hydrogen-filled bags used for artillery spotting in the US Civil War (1861–1865), Franco-Prussian War (1870–1871), and the Russo-Japanese War. They are slower than cavalry and entirely non-combat — their value is long-range vision.

**Files:**
- Modify: `src/systems/tech-definitions-eras5-7.ts`
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/renderer/unit-visual-resolver.ts`
- Modify: `src/renderer/sprites/units.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/audio/sfx-catalog.ts`
- Modify: `src/ai/basic-ai.ts`

### B1 — Tech

- [ ] **Add `balloon-corps` tech** to `ERA_7_TECHS` in `tech-definitions-eras5-7.ts`:

```ts
{ id: 'balloon-corps', name: 'Balloon Corps', track: 'military', cost: 215,
  prerequisites: ['field-artillery', 'chemistry'],
  unlocks: ['Observation balloon provides +3 vision radius over enemy territory'],
  unlocksUnits: ['observation_balloon'], era: 7 },
```

- [ ] **Update tech count assertions:**
  - `tests/systems/tech-definitions.test.ts`: military track `18 → 19`; total `277 → 278`; update the `has exactly N techs` test description
  - `tests/systems/tech-system.test.ts`: same two assertions; update `techs span eras 1-9` (still 9 eras, count unchanged)

### B2 — Unit Wiring

- [ ] **Add `'observation_balloon'` to `UnitType`** in `types.ts` — after `'machine_gunner'` (keeping military units grouped):

```ts
| 'observation_balloon'
```

- [ ] **Add to `UNIT_DEFINITIONS`** in `unit-system.ts`:

```ts
observation_balloon: {
  type: 'observation_balloon',
  name: 'Observation Balloon',
  movementPoints: 1,
  visionRange: 4,   // core value — aerial long-range vision
  strength: 6,
  canFoundCity: false,
  canBuildImprovements: false,
  productionCost: 90,
  domain: 'air',
  attackProfile: { kind: 'none' },  // no attack — pure recon
},
```

Add to `UNIT_DESCRIPTIONS`:

```ts
observation_balloon: 'Tethered hydrogen balloon used for aerial reconnaissance. Cannot attack. Provides unmatched long-range vision over enemy territory. Extremely fragile.',
```

- [ ] **Add to `TRAINABLE_UNITS`** in `city-system.ts`:

```ts
{ type: 'observation_balloon', cost: 90, techRequired: 'balloon-corps',
  pacing: { band: 'power-spike', role: 'air-recon', impact: 1.2, scope: 'military', snowball: 1.0, urgency: 1.0, situationality: 1.4, unlockBreadth: 1 } },
```

- [ ] **Add `PRODUCTION_ICONS` entry:**

```ts
observation_balloon: '🎈',
```

- [ ] **Add to `FALLBACK_ICONS`** in `src/renderer/unit-visual-resolver.ts`:

```ts
observation_balloon: '🎈',
```

- [ ] **Add locomotion to `LOCOMOTION_CLASS`** in `sfx-catalog.ts`:

```ts
observation_balloon: 'humanoid',   // placeholder — air-specific SFX class deferred
```

- [ ] **Add `ObservationBalloonSprite`** to `src/renderer/sprites/units.tsx` — geometric placeholder:

```tsx
// TODO(art): Replace with full art: tethered gas bag silhouette, gondola basket, rope lines, faction-colored envelope panels, drift-smoke effect.
export function ObservationBalloonSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  // ... geometric balloon: oval envelope, rectangular gondola, rope strands
}
```

- [ ] **Add to `UNIT_SPRITE_CATALOG`** in `sprite-catalog.ts`:

```ts
observation_balloon: withMotion('observation_balloon', ObservationBalloonSprite),
```

Also add `'humanoid'` to `UNIT_MOTION_STYLES`:

```ts
observation_balloon: 'humanoid',
```

- [ ] **Add AI balloon training** in `basic-ai.ts`:

```ts
if (
  civ.techState.completed.includes('balloon-corps') &&
  !civUnits.some(u => u.type === 'observation_balloon') &&
  city.productionQueue.length === 0
) {
  // Queue one balloon per civ — pure recon, never needs multiples early
  newState = { ...newState, cities: { ...newState.cities, [cityId]: { ...city, productionQueue: ['observation_balloon'] } } };
}
```

- [ ] **Build + test**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

- [ ] **Commit**

```bash
git add src/systems/tech-definitions-eras5-7.ts src/core/types.ts src/systems/unit-system.ts \
  src/systems/city-system.ts src/renderer/unit-visual-resolver.ts src/renderer/sprites/units.tsx \
  src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts src/ai/basic-ai.ts \
  tests/systems/tech-definitions.test.ts tests/systems/tech-system.test.ts
git commit -m "feat(air): add balloon-corps tech + observation_balloon unit — era 7 air recon end-to-end"
```

---

## Task C — Era-9 Air Tech + `biplane` Unit + `anti_air_battery` Building (End-to-End)

**Historical context:** WWI biplanes (1914–1918) were used for reconnaissance, dogfighting, and ground attack. The biplane era runs 1903–1935; monoplane fighters take over in the mid-1930s (just at era 10). Anti-aircraft guns were first deployed in WWI as field artillery pointed skyward.

**Files (same pattern as Task B plus buildings):**
- Modify: `src/systems/tech-definitions-eras9.ts`
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/renderer/unit-visual-resolver.ts`
- Modify: `src/renderer/sprites/units.tsx`
- Modify: `src/renderer/sprites/buildings.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/audio/sfx-catalog.ts`
- Modify: `src/ai/basic-ai.ts`

### C1 — Techs

- [ ] **Add `air-superiority` tech** to `TECH_TREE_ERAS_9` in `tech-definitions-eras9.ts`:

```ts
{ id: 'air-superiority', name: 'Air Superiority', track: 'military', cost: 275,
  prerequisites: ['aviation', 'general-mobilization'],
  unlocks: ['Biplane fighters can attack land and naval units; anti-aircraft batteries protect ground forces'],
  unlocksUnits: ['biplane'],
  unlocksBuildings: ['anti_air_battery'], era: 9 },
```

- [ ] **Wire `observation_balloon` to existing `aviation` tech** — add to `aviation`'s existing entry in `tech-definitions-eras9.ts`:

The `aviation` tech currently has `unlocksBuildings: ['airfield']`. No change needed for the biplane since `air-superiority` is its gate. Nothing to add here — `aviation` stays as is.

- [ ] **Update tech count assertions:** military track `19 → 20` (era-7 balloon-corps was already 19; this era-9 addition makes it 20); total `278 → 279`. Update `tech-definitions.test.ts` and `tech-system.test.ts`.

### C2 — `biplane` Unit Wiring

- [ ] **Add `'biplane'` to `UnitType`** in `types.ts` — after `'observation_balloon'`.

- [ ] **Add to `UNIT_DEFINITIONS`**:

```ts
biplane: {
  type: 'biplane',
  name: 'Biplane',
  movementPoints: 4,
  visionRange: 3,
  strength: 34,
  canFoundCity: false,
  canBuildImprovements: false,
  productionCost: 200,
  domain: 'air',
  attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
},
```

Add to `UNIT_DESCRIPTIONS`:

```ts
biplane: 'WWI-era fabric-and-wood fighter aircraft. Fast air unit that can attack land and naval targets from altitude. Vulnerable to dedicated anti-air batteries. Obsoleted by monoplane fighters.',
```

- [ ] **Add to `TRAINABLE_UNITS`**:

```ts
{ type: 'biplane', cost: 200, techRequired: 'air-superiority',
  pacing: { band: 'power-spike', role: 'air-strike', impact: 1.5, scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
```

- [ ] **Add `PRODUCTION_ICONS`:**

```ts
biplane: '✈️',
```

- [ ] **Add to `FALLBACK_ICONS`:**

```ts
biplane: '✈️',
```

- [ ] **Add locomotion:**

```ts
biplane: 'humanoid',   // placeholder — air-specific SFX class deferred
```

- [ ] **Add `BiplaneSprite`** to `units.tsx` — geometric placeholder:

```tsx
// TODO(art): Replace with full art: WWI biplane, double fabric wings with struts and wire bracing, round engine cowling, open cockpit, roundel markings in faction color, propeller blur.
export function BiplaneSprite({ palette, svgOnly = false }: UnitSpriteProps): string { ... }
```

- [ ] **Add to `UNIT_SPRITE_CATALOG`** and `UNIT_MOTION_STYLES`:

```ts
biplane: withMotion('biplane', BiplaneSprite),
// motion: 'humanoid'
```

- [ ] **AI biplane training:**

```ts
if (
  civ.techState.completed.includes('air-superiority') &&
  !civUnits.some(u => u.type === 'biplane') &&
  city.productionQueue.length === 0
) {
  newState = { ...newState, cities: { ...newState.cities, [cityId]: { ...city, productionQueue: ['biplane'] } } };
}
```

### C3 — `anti_air_battery` Building

- [ ] **Add to `BUILDINGS`** in `city-system.ts`:

```ts
anti_air_battery: {
  id: 'anti_air_battery', name: 'Anti-Air Battery', category: 'military',
  yields: { food: 0, production: 0, gold: 0, science: 0 },
  productionCost: 170,
  description: 'Flak guns on city rooftops. All city defenders gain +8 defense strength against air unit attacks.',
  techRequired: 'air-superiority',
  // No yield bonus — value is the anti-air combat modifier, not empire-wide yields
},
```

- [ ] **Add anti-air combat modifier** to the combat resolution helper (search for `defenseBonus` or the combat strength calculator). Add:

```ts
// Anti-air: +8 defense when the attacking unit is air domain
if (attacker.domain === 'air' && defenderCity.buildings.includes('anti_air_battery')) {
  defenseStrength += 8;
}
```

- [ ] **Add `PRODUCTION_ICONS`:**

```ts
anti_air_battery: '🔫',
```

- [ ] **Add `AntiAirBatterySprite`** to `buildings.tsx` — geometric placeholder:

```tsx
// TODO(art): Replace with: WWI-era ring-mounted flak cannon on sandbag emplacement, crew operating elevation wheel, shell casings at base, searchlight beam.
export function AntiAirBatterySprite({ palette, svgOnly = false }: BuildingSpriteProps): string { ... }
```

- [ ] **Add to `BUILDING_SPRITE_CATALOG`.**

- [ ] **Build + full test**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

- [ ] **Commit**

```bash
git add src/systems/tech-definitions-eras9.ts src/core/types.ts src/systems/unit-system.ts \
  src/systems/city-system.ts src/renderer/unit-visual-resolver.ts src/renderer/sprites/units.tsx \
  src/renderer/sprites/buildings.tsx src/renderer/sprites/sprite-catalog.ts \
  src/audio/sfx-catalog.ts src/ai/basic-ai.ts \
  tests/systems/tech-definitions.test.ts tests/systems/tech-system.test.ts
git commit -m "feat(air): add air-superiority tech + biplane unit + anti_air_battery — era 9 air combat end-to-end"
```

---

## Task D — Air National Project: `air_force_command`

**Historical context:** Royal Flying Corps (UK, 1912), German Luftstreitkräfte (1916), US Army Air Service (1918) — every major power institutionalized air power as a dedicated military branch by WWI's end. This NP represents that organizational moment.

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/renderer/sprites/buildings.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`

- [ ] **Add `air_force_command` NP** to `BUILDINGS`:

```ts
air_force_command: {
  id: 'air_force_command', name: 'Air Force Command', category: 'military',
  yields: { food: 0, production: 3, gold: 0, science: 2 }, productionCost: 280,
  description: 'Centralised aviation command. +3 production and +2 science empire-wide. Your air units gain +4 strength in combat.',
  techRequired: 'air-superiority',
  uniquePerEmpire: true,
  nationalProject: { homeEra: 9 },
  civYieldBonus: { production: 3, science: 2 },
  // Two keys: production 3 ≤ 3, science 2 ≤ 3; total 5 ≤ 9 (era 9 ceiling) ✓
},
```

- [ ] **Air force combat bonus** — in the same combat resolution path where `anti_air_battery` is checked, add:

```ts
// Air Force Command: air units +4 strength if attacker's civ has built this NP
if (attacker.domain === 'air' && attackerHasNP('air_force_command', state, attacker.owner)) {
  attackStrength += 4;
}
```

- [ ] **Add `PRODUCTION_ICONS`:**

```ts
air_force_command: '🛫',
```

- [ ] **Add `AirForceCommandSprite`** to `buildings.tsx` — geometric placeholder:

```tsx
// TODO(art): Replace with: neoclassical HQ building with aviation crest above entrance, propeller trophy on plinth, biplanes silhouetted in formation through a tall arched window.
export function AirForceCommandSprite({ palette, svgOnly = false }: BuildingSpriteProps): string { ... }
```

- [ ] **Add to `BUILDING_SPRITE_CATALOG`.**

- [ ] **Update balance test** in `tests/systems/national-project-balance.test.ts` — era-9 NP count goes from 3 → 4:

```ts
it('has exactly 4 era 9 national projects', () => { expect(era9NPs).toHaveLength(4); });
```

- [ ] **Run balance test:**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/national-project-balance.test.ts
```

- [ ] **Commit**

```bash
git add src/systems/city-system.ts src/renderer/sprites/buildings.tsx src/renderer/sprites/sprite-catalog.ts \
  tests/systems/national-project-balance.test.ts
git commit -m "feat(air): add air_force_command national project — era 9, production+science bonus"
```

---

## Task E — Air Legendary Wonder: `wright-flyer`

**Historical context:** The Wright Brothers' first powered flight on December 17, 1903 at Kitty Hawk, NC lasted 12 seconds and covered 120 feet. It was the single most consequential transportation event of the 20th century.

**Yield design:** `civYieldBonus: { science: 5, production: 2 }` — two keys, science 5 ≤ 6, production 2 ≤ 6 ✓. Era 9 wonder. `cityRequirement: 'any'`.

**Files:**
- Modify: `src/systems/approved-legendary-wonder-roster.ts`
- Modify: `src/systems/legendary-wonder-definitions.ts`
- Modify: `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`
- Modify: `src/systems/legendary-wonder-landmark-catalog.ts`
- Modify: `src/systems/wonder-codex/legendary-content.ts`
- Modify: `docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md`
- Modify: `tests/systems/legendary-wonder-definitions.test.ts` (30 → 31)
- Modify: `tests/systems/legendary-wonder-system.test.ts` (30 → 31)
- Modify: `tests/systems/legendary-wonder-landmark-catalog.test.ts` (add `['wright-flyer', 'wright-flyer-bespoke']`)
- Modify: `tests/systems/wonder-definitions.test.ts` (era 9 count 4 → 5)

- [ ] **Step 1: Approved roster** — add after `hoover-dam`:

```ts
{ id: 'wright-flyer', name: 'Wright Flyer' },
```

- [ ] **Step 2: Wonder definition**:

```ts
'wright-flyer': {
  id: 'wright-flyer',
  name: 'Wright Flyer',
  era: 9,
  productionCost: 320,
  requiredTechs: ['aviation', 'air-superiority'],
  requiredResources: [],
  cityRequirement: 'any',
  questSteps: [
    { id: 'pioneer-aviation', type: 'research_count', track: 'military', targetCount: 3,
      description: 'Complete 3 military technologies in the aviation era.' },
    { id: 'build-airfields', type: 'buildings-in-multiple-cities', targetCount: 2,
      cityScope: 'empire', minimumBuildingsPerCity: 3,
      description: 'Establish airfields in 2 cities.' },
  ],
  reward: {
    summary: '+5 science and +2 production empire-wide. Your air units gain +1 movement.',
    civYieldBonus: { science: 5, production: 2 },
    // Movement note: +1 air unit movement. Air units are a new class with no prior movement bonus,
    // so this does not violate the +2 empire-wide cap (which was defined for land and naval).
    // Document in game-balance.md movement inventory as 'air: +1 move (first bonus ever)'.
  },
},
```

- [ ] **Step 3: Add bespoke asset key** to `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` array and `BESPOKE_ASSETS` map in `legendary-wonder-bespoke-assets.ts`.

- [ ] **Step 4: Add `drawWrightFlyer` function** — geometric placeholder:

```ts
// TODO(art): Replace with: Kitty Hawk beach at dawn — biplane on wooden rail launcher, Kill Devil Hill in background, two figures in bowler hats watching, propeller frozen at 3 o'clock.
function drawWrightFlyer(options: LegendaryWonderBespokeDrawOptions): void {
  const { ctx, cx, cy, radius: r, metadata } = options;
  markBespoke(ctx, 'wright-flyer-bespoke');
  // sky gradient, beach horizon, biplane outline, figures silhouettes
  ...
}
```

- [ ] **Step 5: Landmark catalog** — add after `hoover-dam`:

```ts
'wright-flyer': landmark('wright-flyer', 'signal', 'wide', 'horizon', '#1a2838', '#c8a040', '#fff8d0', 1.1, 'dedicationGlow', 'glint', 'scaffold', 'wright-flyer-bespoke'),
```

- [ ] **Step 6: Codex content** — add `legendary()` call with `factSourceIds: ['loc-about']`, `imageSourceId: 'image-foundry'` (placeholder — update when LOC image available), tone `'discovery'`, tags `['science', 'military', 'modern', 'engineering']`.

- [ ] **Step 7: Ledger row** — add to atlas source ledger.

- [ ] **Step 8: Update movement stacking table** in `.claude/rules/game-balance.md`:

```
| `wright-flyer` wonder | wonder | air units | +1 move | era 9+ (permanent) |
```

- [ ] **Step 9: Update wonder test** — era 9 count 4 → 5 (storm-signal-spire + 3 PR5 wonders + wright-flyer).

- [ ] **Step 10: Build + full test suite**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

- [ ] **Step 11: Commit**

```bash
git add src/systems/approved-legendary-wonder-roster.ts src/systems/legendary-wonder-definitions.ts \
  src/renderer/wonders/legendary-wonder-bespoke-assets.ts src/systems/legendary-wonder-landmark-catalog.ts \
  src/systems/wonder-codex/legendary-content.ts \
  docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md \
  .claude/rules/game-balance.md \
  tests/systems/legendary-wonder-definitions.test.ts tests/systems/legendary-wonder-system.test.ts \
  tests/systems/legendary-wonder-landmark-catalog.test.ts tests/systems/wonder-definitions.test.ts
git commit -m "feat(air): add wright-flyer legendary wonder — era 9, +5 science +2 production +1 air movement"
```

---

## Task F — Placeholder Art & Sound (Post-PR6 Follow-Up)

### F1 — Unit Sprites

| Unit | Target description for `generate-sprite-prompt` |
|---|---|
| `observation_balloon` | Tethered hydrogen envelope: oval gas bag with faction-colored panels, rope net holding a wicker gondola basket, observer with binoculars leaning out, tether line descending off-canvas |
| `biplane` | WWI biplane: double canvas wings with wooden strut bracing and taut wire, round radial engine cowling, open cockpit with goggled pilot, roundel in faction color on upper wing, propeller motion blur |

### F2 — Building Sprites

| Building | Target description |
|---|---|
| `anti_air_battery` | Ring-mounted Krupp flak cannon on sandbag emplacement, four crew members at elevation and traverse wheels, brass shell casings at base, searchlight beam sweeping above |
| `air_force_command` | Neoclassical military headquarters, stone eagle with spread wings over portico, aviation wing crest carved above entrance, biplanes in formation silhouetted through a tall arched window, parade ground |

### F3 — Wonder Bespoke Asset

| Wonder | Target |
|---|---|
| `wright-flyer` | Kitty Hawk beach at first light: wooden 18-foot rail launcher on flat sand, Flyer 1 biplane poised at one end (Orville prone at controls), Wilbur standing to the right in bowler hat, Kill Devil Hill in background, Atlantic horizon, grey December sky |

### F4 — SFX

`observation_balloon` and `biplane` currently inherit `'humanoid'` locomotion SFX. Dedicated sounds to add in a future audio sprint:
- `observation_balloon`: slow ambient gas hiss, gentle rocking creak
- `biplane`: radial engine rattle on takeoff, Doppler pass on attack run

### F5 — Wonder Codex Images

`wright-flyer` uses `'image-foundry'` placeholder. Replace with Library of Congress photograph of the actual first flight (public domain) once the image pipeline is extended.

---

## PR6 Verification Gate

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Both must exit 0.

**Manual smoke test:**
1. Research `balloon-corps` (era 7) → `observation_balloon` appears in production queue; has vision 4, no attack option
2. Air unit moves freely onto mountain/water tile — not blocked
3. Land unit on the same tile as observation_balloon — no stacking conflict
4. Research `air-superiority` (era 9) → `biplane` in queue, `anti_air_battery` in building queue
5. Biplane attacks enemy land unit → combat resolves; enemy in city with `anti_air_battery` takes reduced damage
6. Build `air_force_command` NP → biplane gains +4 strength on attack
7. Capture `wright-flyer` wonder → all biplanes show +1 movement in unit panel
8. Tech panel lists `balloon-corps` (era 7 military) and `air-superiority` (era 9 military) with correct prerequisites

**Create PR:**
```
Title: feat(air-domain): PR6 — Air domain architecture + observation balloon (era 7) + biplane (era 9)
Target: main
```
