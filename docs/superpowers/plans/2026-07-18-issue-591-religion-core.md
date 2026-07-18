# Religion Core Implementation Plan (#524 MR4, issue #591)

> **For agentic workers:** Execute inline in this session (project policy forbids subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add religion as a real game system — founding via a new "milestone" national project (Sacred Council), invented per-civ names, three boons (Serenity/Tithes/Fervor), and passive faith spread/conversion between cities.

**Architecture:** Two new state slices (`religions`, `cityFaith`), one new system pair (`religion-definitions.ts` data, `religion-system.ts` logic), a new `milestone` flag on the existing `NationalProject` type that bypasses the build-window/fade machinery at exactly the sites that currently assume every NP fades. Boon effects plug into the existing per-city happiness-row list and per-civ gross-gold accumulator — the same seams `.claude/rules/game-balance.md` already documents for other economy terms.

**Tech Stack:** TypeScript, vitest. No new deps.

## Global Constraints

- Religion names are **invented, culture-flavored, never real-world faiths** (per user decision on file, matches project convention for wonder/quest content).
- No war-gate on spread or Tithes (user decision this session — matches unrest-contagion precedent, which also ignores diplomacy).
- `conversionProgress` is singular per city (`{ toReligionId, points }`, not a map) — when the locally-strongest religion for a city changes to a **different** religion than the one currently tracked, `points` resets to 0 for the new target. When it's the same tracked religion, points accumulate normally. ("Weaker records stall but are not erased" refers to *other cities'* progress toward other religions, not a multi-target ledger inside one city — the type only ever holds one target.)
- Religions are never deleted once founded (permanent world fact, same precedent as `completedLegendaryWonders`) — only per-city `cityFaith` entries get cleaned up, and only when their city is actually removed (`raze`), never on ownership transfer (the city record persists across capture, so `cityFaith` persists for free — no explicit code needed there).
- Fervor's MR4 description says ONLY "faster conversion" — never mention territory/loyalty (that's MR6, and promising it now would be a new dead promise).
- This MR is economy-affecting (Serenity happiness, Tithes gold) — pacing gates (`pacing-audit.test.ts`, `pacing-reference-economy.test.ts`) must be re-run and any snapshot shift justified in the PR body.
- PR body: grep the drafted body for `closes?\s+#\d+` (case-insensitive) before running `gh pr create` — this exact arc has hit the false-auto-close bug twice already (#595, #600) from negated "never closes #524" phrasing GitHub's parser doesn't understand negation on.

---

## Drift-checked facts (verified against `main` @ edf2a6a6, 2026-07-18)

| Fact | Location |
|---|---|
| `NationalProject { homeEra: number }` | `src/core/types.ts:447` |
| Build-window filter (production queue availability) | `src/systems/city-system.ts:1767-1771` inside `getAvailableBuildings` |
| Build-window dequeue guard | `src/systems/city-system.ts:1946-1963` inside `processCity` |
| Fade/expiry | `src/systems/national-project-system.ts`: `getNationalProjectMultiplier`, `getActiveNationalProjectsForCiv`, `getNationalProjectCivYieldBonus`, `expireNationalProjects` |
| `expireNationalProjects` removes ANY built NP once `era - eraBuilt >= 3`, unconditionally | `src/systems/national-project-system.ts:110-144` — **milestone NPs must be excluded here or Sacred Council silently vanishes from the holy city after 3 eras even though the religion it founded persists forever** |
| era-3 NP cost/pacing norms (120-125 production, `pacing.band: 'marquee', role: 'national-project'`) | `src/systems/city-system.ts:278-304` (`philosophers_circle`, `road_corps`, `iron_legion`) |
| Temple building already gated on `philosophy`, era 3 | `.claude/rules/game-balance.md` happiness inventory |
| `requiresBuildings: string[]` already supported generically | `Building` type + `getAvailableBuildings` line 1764-1766 |
| Per-city unrest pressure rows (Serenity's insertion point) | `getUnrestPressureBreakdown` in `src/systems/faction-system.ts:46-105` — per-city rows like `Happiness buildings` already follow the `-amount*2` pressure-reduction convention |
| Per-civ gross gold accumulator (Tithes' insertion point) | `projectCivGrossGold` in `src/systems/economy-system.ts:491-565`, insert after the `getClaimedTrophyGoldPerTurn` line |
| City ownership transfer (capture, `occupy` disposition) keeps the city record — `cityFaith` persists automatically | `src/systems/city-capture-system.ts` `resolveMajorCityCapture` occupy branch |
| City raze deletes the city record — `cityFaith` must be explicitly cleaned up here | `src/systems/city-capture-system.ts` raze branch, `delete nextCities[cityId]` |
| `hasMetCivilization(state, viewerCivId, targetCivId)` for discovery-gated notifications | `src/systems/discovery-system.ts:77` |
| `deliver: NotificationSink` from `createNotificationDelivery` — the only path for game-consequence notifications per `.claude/rules/ui-panels.md` | `src/ui/notification-delivery.ts` |
| Full-screen pending-choice modal precedent (model the boon modal on this) | `src/ui/required-choice-panel.ts` — DOM-built, `textContent` only, `createGameButton` |
| 29 civ ids need name candidates | `src/systems/civ-definitions.ts` (egypt, rome, greece, mongolia, babylon, zulu, china, persia, england, aztec, japan, india, france, germany, gondor, rohan, russia, ottoman, shire, isengard, spain, viking, prydain, annuvin, wakanda, avalon, lothlorien, narnia, atlantis) |
| `migrateSaveToCurrent` already has an unconditional post-migration-loop hook (added in MR3) | `src/storage/save-migrations.ts` — `normalizeCrisisArchetypes` runs right before the final return; add sibling defaults for `religions`/`cityFaith` there or as an equivalent unconditional default |

---

## Task 1: Types + state slices + save migration defaults

**Files:**
- Modify: `src/core/types.ts` (`Religion`, `CityFaith`, `state.religions`, `state.cityFaith`, `NationalProject.milestone`, events)
- Modify: `src/storage/save-migrations.ts`
- Test: `tests/storage/save-migrations.test.ts`

- [ ] **Step 1: Add types**

```ts
// src/core/types.ts — new interfaces, near ActiveCrisis
export type ReligionBoon = 'serenity' | 'tithes' | 'fervor';

export interface Religion {
  id: string;            // 'religion-<ownerCivId>'
  name: string;
  ownerCivId: string;
  boon?: ReligionBoon;    // absent = pending choice, no effects
  foundedTurn: number;
}

export interface CityFaith {
  religionId: string;
  isHolyCity?: true;
  conversionProgress?: { toReligionId: string; points: number };
  // loyaltyProgress added by MR6 (#593)
}
```

Add to `GameState`: `religions?: Record<string, Religion>; cityFaith?: Record<string, CityFaith>;` — **optional**, matching `activeCrises`/`pirates`/`espionage`'s established convention. (Course-corrected during implementation: non-optional broke 36 TS errors across 20 pre-existing minimal-literal-`GameState` test fixtures that don't spread every field. Optional + `?? {}` at read sites is the actual codebase-wide pattern for late-added slices — defaulted to `{}` in `createNewGame` and `migrateSaveToCurrent` regardless, so real gameplay code never sees `undefined`, only test fixtures that predate this field do.)

Add to `NationalProject`: `milestone?: true;`

Add events (find the `GameEvents` interface, insert near `'crisis:started'`):
```ts
'religion:founded': { religionId: string; civId: string; cityId: string; name: string };
'religion:city-converted': { cityId: string; toReligionId: string; fromReligionId?: string };
```

- [ ] **Step 2: Wire defaults into `createNewGame`**

Read `src/core/game-state.ts`'s `createNewGame` function fully first. Add `religions: {}, cityFaith: {}` to the returned `GameState` literal, in the same style as neighboring empty-record defaults (e.g. wherever `barbarianCamps: {}` or similar already sits).

- [ ] **Step 3: Write failing migration test**

```ts
// tests/storage/save-migrations.test.ts
describe('#591 MR4 — religion state defaults', () => {
  it('defaults religions and cityFaith to {} for a save predating this feature', () => {
    const save = createNewGame('rome', 'religion-defaults-drift', 'small');
    delete (save as Record<string, unknown>).religions;
    delete (save as Record<string, unknown>).cityFaith;
    const migrated = migrateSaveToCurrent(save);
    expect(migrated.religions).toEqual({});
    expect(migrated.cityFaith).toEqual({});
  });
});
```

- [ ] **Step 4: Run to verify failure, then add the defaulting**

Run: `bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations.test.ts`

In `src/storage/save-migrations.ts`, find the `normalizeCrisisArchetypes` call site added in MR3 (right before `migrateSaveToCurrent`'s final return) and add a sibling default, e.g.:

```ts
function withReligionDefaults(state: GameState): GameState {
  return {
    ...state,
    religions: state.religions ?? {},
    cityFaith: state.cityFaith ?? {},
  };
}
```

Chain it into the same final-return expression `normalizeCrisisArchetypes` uses (read the exact current code first — do not guess the variable name).

- [ ] **Step 5: Run to verify pass, commit**

```bash
git add src/core/types.ts src/core/game-state.ts src/storage/save-migrations.ts tests/storage/save-migrations.test.ts
git commit -m "feat(religion): add religion/cityFaith state slices + save defaults (#591 MR4)"
```

---

## Task 2: `religion-definitions.ts`

**Files:**
- Create: `src/systems/religion-definitions.ts`
- Test: `tests/systems/religion-definitions.test.ts`

**Interfaces:**
- Produces: `NAME_CANDIDATES: Record<string, string[]>` (keyed by civType id, 2 invented names each) + `NEUTRAL_NAME_CANDIDATES: string[]` (for custom/unlisted civ types); `CONVERSION_THRESHOLD = 100`; `OWN_CITY_ACCRUAL = 15`; `FOREIGN_ADJACENT_ACCRUAL = 7`; `FOREIGN_ADJACENT_CAP = 2`; `TRADE_ROUTE_ACCRUAL = 5`; `OCCUPATION_ACCRUAL = 5` (unused until MR5 — export it anyway so MR5 doesn't redefine it); `FERVOR_MULTIPLIER = 1.25`; `TITHES_CAP = 10`; `BOON_DESCRIPTIONS: Record<ReligionBoon, string>`.

- [ ] **Step 1: Write the data file**

```ts
import type { ReligionBoon } from '@/core/types';

export const CONVERSION_THRESHOLD = 100;
export const OWN_CITY_ACCRUAL = 15;
export const FOREIGN_ADJACENT_ACCRUAL = 7;
export const FOREIGN_ADJACENT_CAP = 2;
export const TRADE_ROUTE_ACCRUAL = 5;
// Wired starting MR5 (#592) — occupied cities accrue toward the occupier's faith.
// Defined here now so MR5 doesn't need to touch this file's constant block.
export const OCCUPATION_ACCRUAL = 5;
export const FERVOR_MULTIPLIER = 1.25;
export const TITHES_CAP = 10;

// Invented, culture-flavored faith names — NEVER real-world religions (project
// convention, matches wonder/quest content rules). 2 candidates per civ id; seeded
// pick + player rename at founding.
export const NAME_CANDIDATES: Record<string, string[]> = {
  egypt: ['Cult of the River Dawn', 'Order of the Sundered Sky'],
  rome: ['Cult of the Eternal Hearth', 'Order of the Twelve Standards'],
  greece: ['Path of the Wine-Dark Sea', 'Circle of the First Light'],
  mongolia: ['Way of the Endless Steppe', 'Cult of the Sky Father'],
  babylon: ['Order of the Hanging Star', 'Cult of the River Reeds'],
  zulu: ['Path of the Rising Spear', 'Circle of the Great Kraal'],
  china: ['Way of the Jade Harmony', 'Order of the Silk Dawn'],
  persia: ['Cult of the Burning Garden', 'Order of the Golden Road'],
  england: ['Order of the White Cliff', 'Cult of the Grey Tide'],
  aztec: ['Path of the Fifth Sun', 'Cult of the Feathered Rain'],
  japan: ['Way of the Cherry Watch', 'Order of the Still Water'],
  india: ['Path of the Monsoon Bell', 'Circle of the Sacred Peacock'],
  france: ['Order of the Gilded Lily', 'Cult of the Northern Rose'],
  germany: ['Order of the Iron Oak', 'Cult of the Black Forest'],
  gondor: ['Order of the White Tree', 'Cult of the Sea-Kings'],
  rohan: ['Path of the Horse Lords', 'Circle of the Golden Hall'],
  russia: ['Cult of the Frozen Bell', 'Order of the Northern Bear'],
  ottoman: ['Order of the Crescent Watch', 'Path of the Red Tulip'],
  shire: ['Circle of the Green Hill', 'Order of the Second Breakfast'], // kid-readable, playful, matches Shire tone
  isengard: ['Cult of the Broken Stone', 'Order of the Grinding Wheel'],
  spain: ['Order of the Golden Coast', 'Cult of the Iron Sun'],
  viking: ['Path of the Longship Star', 'Order of the Frost Raven'],
  prydain: ['Circle of the Cauldron Born', 'Order of the Grey King'],
  annuvin: ['Cult of the Hollow Crown', 'Order of the Undying Mist'],
  wakanda: ['Order of the Panther Star', 'Cult of the Vibrant Heart'],
  avalon: ['Order of the Lake Mist', 'Circle of the Once and Future'],
  lothlorien: ['Circle of the Golden Mallorn', 'Order of the Starlit Bough'],
  narnia: ['Circle of the Deep Magic', 'Order of the Eternal Snow'],
  atlantis: ['Cult of the Sunken Star', 'Order of the Tidal Throne'],
};

export const NEUTRAL_NAME_CANDIDATES: string[] = [
  'Order of the First Dawn',
  'Circle of the Wandering Star',
  'Path of the Quiet Flame',
];

export const BOON_DESCRIPTIONS: Record<ReligionBoon, string> = {
  serenity: '+1 happiness in every city that follows your faith.',
  tithes: `+1 gold per turn from every foreign city that follows your faith, up to +${TITHES_CAP} gold.`,
  // MR4-honest: only conversion speed. Territory/loyalty effects ship in MR6 (#593) —
  // do not add wording here until that MR actually implements them.
  fervor: 'Your faith spreads 25% faster.',
};
```

- [ ] **Step 2: Write tests**

```ts
// tests/systems/religion-definitions.test.ts
import { describe, it, expect } from 'vitest';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { NAME_CANDIDATES, NEUTRAL_NAME_CANDIDATES, BOON_DESCRIPTIONS } from '@/systems/religion-definitions';

describe('#591 MR4 — religion definitions', () => {
  it('has at least 2 name candidates for every playable civ id', () => {
    for (const civId of Object.keys(CIV_DEFINITIONS)) {
      expect(NAME_CANDIDATES[civId]?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('has a non-empty neutral pool for custom civs', () => {
    expect(NEUTRAL_NAME_CANDIDATES.length).toBeGreaterThanOrEqual(2);
  });

  it('no candidate name matches a real-world major religion (spot check)', () => {
    const bannedSubstrings = ['christ', 'islam', 'muslim', 'buddh', 'hindu', 'judai', 'jewish', 'catholic', 'protestant'];
    const all = [...Object.values(NAME_CANDIDATES).flat(), ...NEUTRAL_NAME_CANDIDATES];
    for (const name of all) {
      const lower = name.toLowerCase();
      for (const banned of bannedSubstrings) {
        expect(lower).not.toContain(banned);
      }
    }
  });

  it('fervor description mentions only conversion speed, not territory/loyalty (MR4 honesty)', () => {
    const lower = BOON_DESCRIPTIONS.fervor.toLowerCase();
    expect(lower).not.toMatch(/territory|loyalty|flip/);
  });
});
```

- [ ] **Step 3: Run, verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-definitions.test.ts` — if the civ-id coverage test fails, read `CIV_DEFINITIONS`'s actual keys (my grep above may have missed or added an id) and fix the `NAME_CANDIDATES` table, not the test.

- [ ] **Step 4: Commit**

```bash
git add src/systems/religion-definitions.ts tests/systems/religion-definitions.test.ts
git commit -m "feat(religion): add religion-definitions.ts (names, constants, boon table) (#591 MR4)"
```

---

## Task 3: `milestone` national project — bypass build-window/fade at all three sites

**Files:**
- Modify: `src/systems/city-system.ts` (two bypass sites)
- Modify: `src/systems/national-project-system.ts` (`expireNationalProjects`)
- Modify: `.claude/rules/game-balance.md` (contract clause)
- Test: `tests/systems/national-project-balance.test.ts`, `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/systems/national-project-balance.test.ts — add near existing NP contract tests
describe('#591 MR4 — milestone national projects', () => {
  it('every milestone NP has no civYieldBonus/cityYieldBonus and is uniquePerEmpire', () => {
    for (const building of Object.values(BUILDINGS)) {
      if (!building.nationalProject?.milestone) continue;
      expect(building.civYieldBonus).toBeUndefined();
      expect(building.cityYieldBonus).toBeUndefined();
      expect(building.uniquePerEmpire).toBe(true);
    }
  });
});
```

```ts
// tests/systems/city-system.test.ts — add near existing getAvailableBuildings / processCity NP tests
describe('#591 MR4 — milestone NP has no upper build-window bound', () => {
  it('stays available in getAvailableBuildings far beyond homeEra + 1', () => {
    // Use a real milestone building once Task 3 defines sacred_council (era 3); assert
    // getAvailableBuildings still includes it at era 10 given the temple prereq is met
    // and it hasn't been built yet, unlike a normal NP which would drop out after era 4.
  });

  it('is never dropped by the belt-and-suspenders dequeue guard regardless of era', () => {
    // Queue sacred_council, advance era far past homeEra+1, run processCity, assert it
    // is NOT in droppedProductionItems and remains in productionQueue.
  });
});
```

```ts
// tests/systems/national-project-system.test.ts (create if it doesn't exist — check first)
describe('#591 MR4 — expireNationalProjects never expires a milestone NP', () => {
  it('leaves a milestone NP in builtNationalProjects and city.buildings at era - eraBuilt >= 3', () => {
    // Build a minimal state with builtNationalProjects['civ:sacred_council'] eraBuilt=1,
    // newEra=10 (delta 9, far past the normal >=3 expiry threshold), city.buildings
    // includes 'sacred_council'. Assert expireNationalProjects leaves both untouched
    // and returns expired: [].
  });

  it('still expires a normal (non-milestone) NP at delta >= 3, unaffected by this change', () => {
    // Regression: use an existing non-milestone NP id (e.g. 'philosophers_circle') and
    // assert the existing expiry behavior is unchanged.
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/national-project-balance.test.ts tests/systems/city-system.test.ts tests/systems/national-project-system.test.ts`

- [ ] **Step 3: Add the `milestone` bypass in `getAvailableBuildings`**

Replace:
```ts
    if (b.nationalProject) {
      const currentEra = era ?? 1;
      if (currentEra < b.nationalProject.homeEra || currentEra > b.nationalProject.homeEra + 1) return false;
      if (b.uniquePerEmpire && civId && builtNationalProjectKeys?.has(`${civId}:${b.id}`)) return false;
    }
```
with:
```ts
    if (b.nationalProject) {
      const currentEra = era ?? 1;
      const belowWindow = currentEra < b.nationalProject.homeEra;
      const aboveWindow = !b.nationalProject.milestone && currentEra > b.nationalProject.homeEra + 1;
      if (belowWindow || aboveWindow) return false;
      if (b.uniquePerEmpire && civId && builtNationalProjectKeys?.has(`${civId}:${b.id}`)) return false;
    }
```

- [ ] **Step 4: Add the bypass in the dequeue guard**

Replace:
```ts
      const inWindow = era >= bldg.nationalProject.homeEra && era <= bldg.nationalProject.homeEra + 1;
```
with:
```ts
      const inWindow = era >= bldg.nationalProject.homeEra
        && (bldg.nationalProject.milestone || era <= bldg.nationalProject.homeEra + 1);
```

- [ ] **Step 5: Add the bypass in `expireNationalProjects`**

In `src/systems/national-project-system.ts`, replace:
```ts
  for (const [key, record] of Object.entries(state.builtNationalProjects ?? {})) {
    if (newEra - record.eraBuilt >= 3) {
      const buildingId = key.split(':').slice(1).join(':');
      toExpire.push({ civId: record.civId, cityId: record.cityId, buildingId });
    }
  }
```
with:
```ts
  for (const [key, record] of Object.entries(state.builtNationalProjects ?? {})) {
    const buildingId = key.split(':').slice(1).join(':');
    if (BUILDINGS[buildingId]?.nationalProject?.milestone) continue; // permanent — see #591 MR4
    if (newEra - record.eraBuilt >= 3) {
      toExpire.push({ civId: record.civId, cityId: record.cityId, buildingId });
    }
  }
```

- [ ] **Step 6: Add the `game-balance.md` contract clause**

Add to `.claude/rules/game-balance.md`, in the "National Project Lifecycle Contract" section:

```markdown
## Milestone National Projects (#591 MR4)

`NationalProject.milestone?: true` marks a one-time permanent-trigger project (e.g. Sacred Council):
- Buildable from `homeEra` onward — **no upper build-window bound** (`getAvailableBuildings` and the
  belt-and-suspenders dequeue guard in `processCity` both skip the `homeEra + 1` upper check for
  milestone NPs).
- **Never expires** — `expireNationalProjects` skips milestone NPs unconditionally, regardless of
  era delta. The building stays in `city.buildings` and `builtNationalProjects` forever.
- **No `civYieldBonus`/`cityYieldBonus`** — its effect is a one-time state-mutating side effect
  (e.g. founding a religion), not an ongoing yield. Enforced by `national-project-balance.test.ts`.
- Still `uniquePerEmpire: true` — one per civ, same as every other national project.
```

- [ ] **Step 7: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/national-project-balance.test.ts tests/systems/city-system.test.ts tests/systems/national-project-system.test.ts`

- [ ] **Step 8: Commit**

```bash
git add src/systems/city-system.ts src/systems/national-project-system.ts .claude/rules/game-balance.md tests/systems/national-project-balance.test.ts tests/systems/city-system.test.ts tests/systems/national-project-system.test.ts
git commit -m "feat(national-project): add milestone flag (no build-window cap, never expires) (#591 MR4)"
```

---

## Task 4: Sacred Council building definition

**Files:**
- Modify: `src/systems/city-system.ts` (add `sacred_council` to `BUILDINGS`, add to `PRODUCTION_ICONS`)
- Test: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe('#591 MR4 — sacred_council national project shape', () => {
  it('requires a temple, is gated on philosophy, era 3, milestone, no yield bonus', () => {
    const b = BUILDINGS.sacred_council;
    expect(b.requiresBuildings).toEqual(['temple']);
    expect(b.techRequired).toBe('philosophy');
    expect(b.nationalProject).toEqual({ homeEra: 3, milestone: true });
    expect(b.uniquePerEmpire).toBe(true);
    expect(b.civYieldBonus).toBeUndefined();
  });

  it('has a production icon', () => {
    expect(PRODUCTION_ICONS.sacred_council).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts`

- [ ] **Step 3: Add the definition**

Add near the other era-3 national projects (after `iron_legion`, before the `// Era 4` comment):

```ts
  sacred_council: {
    id: 'sacred_council', name: 'Sacred Council', category: 'culture',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 120,
    description: 'Founds your empire\'s faith. One-time — permanent effect, never fades.',
    techRequired: 'philosophy', requiresBuildings: ['temple'],
    pacing: { band: 'marquee', role: 'national-project', impact: 1.5, scope: 'empire', snowball: 1.3, urgency: 1.1, situationality: 1, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 3, milestone: true },
  },
```

Add `sacred_council: '⛩️'` to `PRODUCTION_ICONS` (pick an icon not already used elsewhere in that map — check first).

- [ ] **Step 4: Run to verify pass, commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(religion): add Sacred Council milestone national project (#591 MR4)"
```

---

## Task 5: `religion-system.ts` core — founding, boon choice, strongest-pressure, turn processing

**Files:**
- Create: `src/systems/religion-system.ts`
- Test: `tests/systems/religion-system.test.ts`

**Interfaces:**
- Consumes: `Religion`, `CityFaith` (Task 1); `NAME_CANDIDATES`, `NEUTRAL_NAME_CANDIDATES`, accrual constants, `CONVERSION_THRESHOLD`, `FERVOR_MULTIPLIER` (Task 2); `seededLcg` (`@/systems/seeded-lcg`); `hexNeighbors`/`mapDistance` (`@/systems/hex-utils`); `state.marketplace.tradeRoutes` shape (already used by crisis-system.ts, MR3).
- Produces: `foundReligion(state, civId, cityId, bus): GameState`; `chooseBoon(state, religionId, boon): GameState`; `getStrongestPressure(state, cityId): { religionId: string; accrual: number } | null`; `processReligionTurn(state, bus): GameState`.

- [ ] **Step 1: Write failing tests for `foundReligion`**

```ts
// tests/systems/religion-system.test.ts
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { foundReligion, chooseBoon, getStrongestPressure, processReligionTurn } from '@/systems/religion-system';
import { makeReligionFixture } from './helpers/religion-fixture'; // new fixture, see Step 2

describe('#591 MR4 — foundReligion', () => {
  it('creates a religion, marks the building city as holy, and has capital + building city adopt it', () => {
    const { state, civId, capitalId, templeCity } = makeReligionFixture();
    const bus = new EventBus();
    const next = foundReligion(state, civId, templeCity, bus);
    const religionId = `religion-${civId}`;
    expect(next.religions[religionId]).toMatchObject({ ownerCivId: civId, boon: undefined });
    expect(next.cityFaith[templeCity]).toMatchObject({ religionId, isHolyCity: true });
    expect(next.cityFaith[capitalId]).toMatchObject({ religionId });
  });

  it('is a no-op if the civ already has a religion (uniquePerEmpire enforced at the state layer too, not just NP queueing)', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const bus = new EventBus();
    const founded = foundReligion(state, civId, templeCity, bus);
    const second = foundReligion(founded, civId, templeCity, bus);
    expect(second).toBe(founded);
  });

  it('picks a name from NAME_CANDIDATES deterministically by seed', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const a = foundReligion(state, civId, templeCity, new EventBus());
    const b = foundReligion(state, civId, templeCity, new EventBus());
    expect(a.religions[`religion-${civId}`].name).toBe(b.religions[`religion-${civId}`].name);
  });

  it('emits religion:founded exactly once', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('religion:founded', e => events.push(e));
    foundReligion(state, civId, templeCity, bus);
    expect(events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Write the fixture helper**

```ts
// tests/systems/helpers/religion-fixture.ts
// Mirror the shape/style of tests/systems/helpers/crisis-fixture.ts (read it first for
// exact City/Civilization field completeness) -- minimal state with:
// - civId 'p1', capitalId 'capital' (population 5, no buildings), templeCity 'temple-city'
//   (population 4, buildings: ['temple'], distinct position from capital)
// - state.religions: {}, state.cityFaith: {}
// - a second civ 'p2' with its own city, for cross-civ spread/conversion tests
// - state.marketplace: { tradeRoutes: [], prices: {}, priceHistory: {}, purchasedResources: [] }
//   (or reuse createMarketplaceState() from '@/systems/trade-system' for a valid default)
export function makeReligionFixture(overrides: ...): { state: GameState; civId: string; capitalId: string; templeCity: string; otherCivId: string; otherCity: string } { ... }
```

- [ ] **Step 3: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-system.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement `foundReligion`**

```ts
// src/systems/religion-system.ts
import type { City, GameState, Religion, ReligionBoon } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { seededLcg } from './seeded-lcg';
import { NAME_CANDIDATES, NEUTRAL_NAME_CANDIDATES, CONVERSION_THRESHOLD, OWN_CITY_ACCRUAL, FOREIGN_ADJACENT_ACCRUAL, FOREIGN_ADJACENT_CAP, TRADE_ROUTE_ACCRUAL, FERVOR_MULTIPLIER } from './religion-definitions';
import { getCapitalCityId } from './capital-system';
import { mapDistance } from './hex-utils';

function pickReligionName(civType: string, seed: number): string {
  const pool = NAME_CANDIDATES[civType] ?? NEUTRAL_NAME_CANDIDATES;
  const rng = seededLcg(seed);
  return pool[Math.floor(rng() * pool.length)];
}

export function foundReligion(
  state: GameState,
  civId: string,
  buildingCityId: string,
  bus: EventBus,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  const alreadyHasReligion = Object.values(state.religions).some(r => r.ownerCivId === civId);
  if (alreadyHasReligion) return state;

  const religionId = `religion-${civId}`;
  const seed = state.turn * 92821 + civId.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 17;
  const name = pickReligionName(civ.civType, seed);

  const religion: Religion = { id: religionId, name, ownerCivId: civId, foundedTurn: state.turn };
  const capitalId = getCapitalCityId(state, civId);

  const cityFaith = { ...state.cityFaith };
  cityFaith[buildingCityId] = { religionId, isHolyCity: true };
  if (capitalId && capitalId !== buildingCityId) {
    cityFaith[capitalId] = { religionId };
  }

  const nextState: GameState = {
    ...state,
    religions: { ...state.religions, [religionId]: religion },
    cityFaith,
  };
  bus.emit('religion:founded', { religionId, civId, cityId: buildingCityId, name });
  return nextState;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-system.test.ts`

- [ ] **Step 6: Write + implement `chooseBoon`**

Test:
```ts
describe('#591 MR4 — chooseBoon', () => {
  it('sets the boon on the owner\'s religion', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const founded = foundReligion(state, civId, templeCity, new EventBus());
    const next = chooseBoon(founded, `religion-${civId}`, 'serenity');
    expect(next.religions[`religion-${civId}`].boon).toBe('serenity');
  });

  it('is a no-op for a nonexistent religion id', () => {
    const { state } = makeReligionFixture();
    expect(chooseBoon(state, 'no-such-religion', 'tithes')).toBe(state);
  });
});
```

Implementation:
```ts
export function chooseBoon(state: GameState, religionId: string, boon: ReligionBoon): GameState {
  const religion = state.religions[religionId];
  if (!religion) return state;
  return { ...state, religions: { ...state.religions, [religionId]: { ...religion, boon } } };
}
```

- [ ] **Step 7: Run, commit**

```bash
git add src/systems/religion-system.ts tests/systems/religion-system.test.ts tests/systems/helpers/religion-fixture.ts
git commit -m "feat(religion): foundReligion + chooseBoon (#591 MR4)"
```

---

## Task 6: Passive spread — `getStrongestPressure` + `processReligionTurn`

**Files:**
- Modify: `src/systems/religion-system.ts`
- Test: `tests/systems/religion-system.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('#591 MR4 — getStrongestPressure', () => {
  it('returns null for a city with no nearby religion sources', () => {
    const { state } = makeReligionFixture();
    expect(getStrongestPressure(state, 'capital')).toBeNull();
  });

  it('picks the religion with the highest accrual, tie-broken by religion id', () => {
    // Build two religions with equal accrual pressure on the same target city; assert
    // the lexicographically-smaller religion id wins (matches weightedPick-style
    // tie-break convention used elsewhere in this codebase, e.g. crisis-system.ts).
  });

  it('caps foreign-adjacent accrual at 2 source cities (FOREIGN_ADJACENT_CAP)', () => {
    // 3+ adjacent foreign follower cities of the same religion should not accrue more
    // than 2 * FOREIGN_ADJACENT_ACCRUAL.
  });

  it('applies the Fervor multiplier when the source religion\'s owner chose fervor', () => {
    // Same geometry, boon: 'fervor' vs boon: 'serenity' -- fervor's accrual should be
    // exactly FERVOR_MULTIPLIER times higher (floored per the constant's own "floor" note).
  });
});

describe('#591 MR4 — processReligionTurn', () => {
  it('accrues points toward the strongest pressure each turn', () => { ... });

  it('resets points when the strongest target religion changes to a different one', () => {
    // Force a city's strongest religion to flip from religion A to religion B between
    // two ticks (e.g. by changing which adjacent city follows which faith) and assert
    // points reset to a fresh small accrual, not carried over from A.
  });

  it('converts a city at >= 100 points, fires religion:city-converted, clears progress', () => {
    // Run enough turns (or seed points near threshold via state override) to cross 100.
  });

  it('never accrues progress in a holy city, even under maximum pressure', () => {
    // Regression per the issue's explicit requirement -- surround the holy city with
    // multiple strong rival-religion sources and assert cityFaith[holyCityId] is
    // unchanged after many ticks.
  });

  it('does not touch a city already following the strongest-pressure religion (already converted, no self-progress)', () => { ... });

  it('is deterministic: identical result on cloned state', () => {
    const { state } = makeReligionFixture();
    const bus = new EventBus();
    const a = processReligionTurn(structuredClone(state), bus);
    const b = processReligionTurn(structuredClone(state), new EventBus());
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement `getStrongestPressure`**

```ts
interface PressureSource {
  religionId: string;
  accrual: number;
}

export function getStrongestPressure(state: GameState, cityId: string): PressureSource | null {
  const city = state.cities[cityId];
  if (!city) return null;
  const sources = new Map<string, number>(); // religionId -> accrual

  for (const religion of Object.values(state.religions)) {
    const followerCityIds = Object.entries(state.cityFaith)
      .filter(([, faith]) => faith.religionId === religion.id)
      .map(([id]) => id);
    if (followerCityIds.length === 0) continue;

    const fervorMultiplier = religion.boon === 'fervor' ? FERVOR_MULTIPLIER : 1;
    let accrual = 0;

    if (city.owner === religion.ownerCivId) {
      // Own-civ city: +OWN_CITY_ACCRUAL if adjacent to OR trade-routed with a follower city.
      const hasOwnSource = followerCityIds.some(fid => {
        if (fid === cityId) return false;
        const followerCity = state.cities[fid];
        if (!followerCity) return false;
        return mapDistance(state.map, city.position, followerCity.position) === 1;
      });
      if (hasOwnSource) accrual += OWN_CITY_ACCRUAL;
    } else {
      const adjacentCount = Math.min(FOREIGN_ADJACENT_CAP, followerCityIds.filter(fid => {
        const followerCity = state.cities[fid];
        return followerCity && mapDistance(state.map, city.position, followerCity.position) === 1;
      }).length);
      accrual += adjacentCount * FOREIGN_ADJACENT_ACCRUAL;
    }

    const hasTradeRouteSource = (state.marketplace?.tradeRoutes ?? []).some(route => {
      const otherId = route.fromCityId === cityId ? route.toCityId : route.toCityId === cityId ? route.fromCityId : null;
      return otherId && followerCityIds.includes(otherId);
    });
    if (hasTradeRouteSource) accrual += TRADE_ROUTE_ACCRUAL;

    if (accrual > 0) sources.set(religion.id, Math.round(accrual * fervorMultiplier));
  }

  if (sources.size === 0) return null;
  const sorted = [...sources.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { religionId: sorted[0][0], accrual: sorted[0][1] };
}
```

Re-verify the exact `TradeRoute` field names (`fromCityId`/`toCityId`) against `src/core/types.ts` before finalizing — MR3's crisis-system.ts used this same shape, but confirm it hasn't drifted.

- [ ] **Step 4: Implement `processReligionTurn`**

```ts
export function processReligionTurn(state: GameState, bus: EventBus): GameState {
  let cityFaith = { ...state.cityFaith };
  let changed = false;

  for (const cityId of Object.keys(state.cities).sort()) {
    const city = state.cities[cityId];
    const faith = cityFaith[cityId];
    if (faith?.isHolyCity) continue; // holy cities never accrue

    const pressure = getStrongestPressure(state, cityId);
    if (!pressure) continue;
    if (faith?.religionId === pressure.religionId) continue; // already follows the strongest religion

    const existingProgress = faith?.conversionProgress;
    const carriedPoints = existingProgress?.toReligionId === pressure.religionId ? existingProgress.points : 0;
    const nextPoints = carriedPoints + pressure.accrual;

    if (nextPoints >= CONVERSION_THRESHOLD) {
      const fromReligionId = faith?.religionId;
      cityFaith = { ...cityFaith, [cityId]: { religionId: pressure.religionId } };
      changed = true;
      bus.emit('religion:city-converted', { cityId, toReligionId: pressure.religionId, fromReligionId });
    } else {
      cityFaith = {
        ...cityFaith,
        [cityId]: { ...(faith ?? {}), religionId: faith?.religionId ?? pressure.religionId, conversionProgress: { toReligionId: pressure.religionId, points: nextPoints } },
      };
      changed = true;
    }
  }

  return changed ? { ...state, cityFaith } : state;
}
```

Note the `religionId: faith?.religionId ?? pressure.religionId` line: a city with NO faith at all needs *some* `religionId` value to satisfy the `CityFaith` type while progress accrues toward conversion — using the pressure target as a placeholder "not yet converted, tracking toward X" religionId is consistent with how `conversionProgress.toReligionId` already names the real target; re-read this against the locked type once implemented and adjust if a cleaner shape (e.g. making `religionId` on `CityFaith` optional) reads better — flag this as an implementation judgment call in the PR body if changed from the issue's literal interface.

- [ ] **Step 5: Wire into turn processing**

Find where `processCrisisTurn`/`processCrisisScheduler`-equivalent turn-system calls are threaded in `src/core/turn-manager.ts` (same file MR3 touched) and add `processReligionTurn` in the same per-turn sequence, after city yield processing (religions read `state.cities`/`state.marketplace` which must already reflect this turn's state, so ordering matters less than "runs once per turn" — but read the surrounding turn-manager.ts sequence first to slot it in consistently with similar systems like crisis processing).

- [ ] **Step 6: Run to verify pass, commit**

```bash
git add src/systems/religion-system.ts src/core/turn-manager.ts tests/systems/religion-system.test.ts
git commit -m "feat(religion): passive spread + conversion (processReligionTurn) (#591 MR4)"
```

---

## Task 7: Boon effects — Serenity happiness, Tithes gold

**Files:**
- Modify: `src/systems/faction-system.ts` (`getUnrestPressureBreakdown`)
- Modify: `src/systems/economy-system.ts` (`projectCivGrossGold`)
- Modify: `.claude/rules/game-balance.md` (happiness inventory row)
- Test: `tests/systems/faction-system.test.ts`, `tests/systems/economy-system.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/systems/faction-system.test.ts
describe('#591 MR4 — Serenity happiness row', () => {
  it('adds a Religious serenity pressure-reduction row for a city following its owner\'s serenity-boon faith', () => { ... });
  it('does not add the row when the boon is not serenity, or the city follows a different faith', () => { ... });
});
```

```ts
// tests/systems/economy-system.test.ts
describe('#591 MR4 — Tithes gold', () => {
  it('adds +1 gold per foreign city following the tithes-boon religion, capped at TITHES_CAP', () => { ... });
  it('contributes 0 when the boon is not tithes', () => { ... });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement Serenity**

In `src/systems/faction-system.ts`, add near `getCityHappinessFromBuildings` usage inside `getUnrestPressureBreakdown`:

```ts
  const cityFaith = state.cityFaith?.[cityId];
  if (cityFaith) {
    const religion = state.religions?.[cityFaith.religionId];
    if (religion && religion.ownerCivId === owner && religion.boon === 'serenity') {
      rows.push({ label: 'Religious serenity', amount: -2 }); // +1 happiness * -2 pressure convention
    }
  }
```

Add the corresponding row to `.claude/rules/game-balance.md`'s Happiness Inventory table: `| Religious serenity (boon) | city (faith-following) | +1 | era 3+ (Sacred Council + serenity boon) |`.

- [ ] **Step 4: Implement Tithes**

Add a helper (in `religion-system.ts`, imported by `economy-system.ts` — check for a circular-import risk first, same diligence as MR3's `crisis-system.ts` importing `city-work-system.ts`):

```ts
// religion-system.ts
export function getReligionTithesGold(state: GameState, civId: string): number {
  const religion = Object.values(state.religions).find(r => r.ownerCivId === civId && r.boon === 'tithes');
  if (!religion) return 0;
  const foreignFollowerCount = Object.entries(state.cityFaith)
    .filter(([cityId, faith]) => faith.religionId === religion.id && state.cities[cityId]?.owner !== civId)
    .length;
  return Math.min(TITHES_CAP, foreignFollowerCount);
}
```

In `src/systems/economy-system.ts`'s `projectCivGrossGold`, add after the `getClaimedTrophyGoldPerTurn` line:
```ts
  grossGold += getReligionTithesGold(state, civId);
```

- [ ] **Step 5: Run to verify pass, commit**

```bash
git add src/systems/faction-system.ts src/systems/economy-system.ts src/systems/religion-system.ts .claude/rules/game-balance.md tests/systems/faction-system.test.ts tests/systems/economy-system.test.ts
git commit -m "feat(religion): wire Serenity happiness + Tithes gold boon effects (#591 MR4)"
```

---

## Task 8: Sacred Council completion → found religion; boon-pending AI heuristic; city lifecycle

**Files:**
- Modify: `src/core/turn-manager.ts` (production-completion hook — find where `completedBuilding` from `CityProcessResult` is consumed and other building-completion side effects (e.g. legendary wonder progress, national project registration) already live)
- Modify: `src/ai/basic-ai.ts` or `src/ai/ai-production.ts` (AI boon choice heuristic — find where AI-owned pending decisions are resolved each turn, e.g. AI tech choice, for the right file)
- Modify: `src/systems/city-capture-system.ts` (raze path: delete `cityFaith[cityId]`)
- Test: `tests/core/turn-manager.test.ts` or equivalent, `tests/ai/*.test.ts`, `tests/systems/city-capture-system.test.ts`

- [ ] **Step 1: Find the existing building-completion side-effect dispatch**

Read `src/core/turn-manager.ts` around wherever `result.completedBuilding` (from `CityProcessResult`, `src/systems/city-system.ts`) is handled per civ per turn — national projects likely already have a branch here for registering into `state.builtNationalProjects`. Add: `if (result.completedBuilding === 'sacred_council') nextState = foundReligion(nextState, civId, cityId, bus);` in the same conditional cluster.

- [ ] **Step 2: Write a turn-manager-level test**

```ts
// Wherever building-completion effects are already tested for this file
it('#591 MR4: completing Sacred Council founds a religion at the building city', () => {
  // Full turn-manager fixture with a city that has Temple + philosophy + enough
  // production queued for sacred_council to complete this turn. Assert
  // state.religions has exactly one entry owned by the civ after processTurn.
});
```

- [ ] **Step 3: AI boon heuristic**

Find where AI civs make deterministic per-turn choices already (tech priority selection is the closest existing analog — check `src/ai/basic-ai.ts` or wherever `ai-production.ts`'s per-turn AI loop lives). Add a step: for every AI civ with a religion where `boon` is undefined, choose immediately:

```ts
// religion-system.ts
export function chooseAiBoon(state: GameState, civId: string): ReligionBoon {
  const civ = state.civilizations[civId];
  const atWar = (civ?.diplomacy.atWarWith?.length ?? 0) > 0;
  const cities = (civ?.cities ?? []).map(id => state.cities[id]).filter((c): c is City => !!c);
  const avgUnrest = cities.length ? cities.reduce((sum, c) => sum + c.unrestLevel, 0) / cities.length : 0;
  if (avgUnrest >= 1) return 'serenity';
  if (atWar) return 'fervor';
  return 'tithes';
}
```

Wire it into the AI per-turn pass: for each AI civ, `if (religion && religion.boon === undefined) nextState = chooseBoon(nextState, religion.id, chooseAiBoon(nextState, civId));`.

- [ ] **Step 4: Write AI boon test**

```ts
it('#591 MR4: AI picks serenity when unhappy, fervor when at war, else tithes', () => { ... 3 cases ... });
it('#591 MR4: AI chooses immediately (never leaves its own religion pending)', () => {
  // After one full AI turn pass with a founded-but-boonless AI religion, assert boon is set.
});
```

- [ ] **Step 5: City lifecycle — raze cleanup**

In `src/systems/city-capture-system.ts`'s raze branch, alongside `delete nextCities[cityId];`, add:
```ts
  const nextCityFaith = { ...state.cityFaith };
  delete nextCityFaith[cityId];
```
and thread `cityFaith: nextCityFaith` into the raze path's `nextState` literal.

- [ ] **Step 6: Write lifecycle tests**

```ts
// tests/systems/city-capture-system.test.ts
it('#591 MR4: deletes cityFaith when a city is razed', () => { ... });
it('#591 MR4: preserves cityFaith when a city is captured (occupy), just under the new owner', () => {
  // Confirms the "kept on ownership transfer" rule holds with NO explicit code needed
  // beyond not touching cityFaith in the occupy branch -- a regression test, not new logic.
});
```

- [ ] **Step 7: Run full suite for this task's files, commit**

```bash
git add src/core/turn-manager.ts src/ai/*.ts src/systems/religion-system.ts src/systems/city-capture-system.ts tests/
git commit -m "feat(religion): wire Sacred Council founding, AI boon choice, city lifecycle (#591 MR4)"
```

---

## Task 9: UI — city panel Faith row, boon modal, diplomacy panel religion summary

**Files:**
- Modify: `src/ui/city-panel.ts` (Faith row)
- Create: `src/ui/religion-boon-modal.ts` (model on `src/ui/required-choice-panel.ts`)
- Modify: `src/ui/diplomacy-panel.ts` (religion summary block)
- Modify: `src/main.ts` (wire the modal open/close + boon choice callback, same pattern as other modals)
- Test: `tests/ui/city-panel-religion.test.ts` (new, mirrors `city-panel-crisis.test.ts`'s structure), `tests/ui/religion-boon-modal.test.ts`, `tests/ui/diplomacy-panel.test.ts`

- [ ] **Step 1: City panel Faith row — write failing test**

Mirror `tests/ui/city-panel-crisis.test.ts`'s `withFamineCrisis`/fixture pattern, but for `cityFaith`. Assert: faith name renders, holy-city label renders when `isHolyCity`, in-progress conversion shows source religion name + derived turns-remaining (`Math.ceil((CONVERSION_THRESHOLD - points) / accrual)`, display-only — do not store a materialized "turns left" field).

- [ ] **Step 2: Implement the Faith row**

Add a data block + `setText` calls following the exact pattern the crisis chips already use in this file (`getCrisisDisplayName`-style lookup, `data-text` attribute, populate via `setText` after `panel.innerHTML = html`).

- [ ] **Step 3: Boon modal — write failing test, then implement**

Model directly on `src/ui/required-choice-panel.ts`: full-screen overlay, `createGameButton` for each of the 3 boon choices, `textContent` for all copy (XSS-safe), descriptions pulled from `BOON_DESCRIPTIONS`. Wire `onChooseBoon(religionId, boon)` callback through `main.ts` the same way `onChooseResearch` is wired for the required-choice panel — find that wiring site and mirror it.

- [ ] **Step 4: Diplomacy panel religion summary — write failing test, then implement**

Add a small block near the top of `createDiplomacyPanel` (after the `playerCiv`/`playerDiplomacy` setup, before the `civRows` loop) showing the player's own religion name, boon (or "choose a boon" prompt if pending), and own/foreign follower counts — all sourced from `state.religions`/`state.cityFaith` filtered to `ownerCivId === state.currentPlayer`.

- [ ] **Step 5: Run all UI tests, commit**

```bash
git add src/ui/city-panel.ts src/ui/religion-boon-modal.ts src/ui/diplomacy-panel.ts src/main.ts tests/ui/
git commit -m "feat(religion): city panel Faith row, boon modal, diplomacy religion summary (#591 MR4)"
```

---

## Task 10: Full gates + inline review + PR

- [ ] **Step 1:** `bash scripts/run-with-mise.sh yarn test` — 0 failures.
- [ ] **Step 2:** `bash scripts/run-with-mise.sh yarn build` — 0 type errors.
- [ ] **Step 3:** Re-run `tests/systems/pacing-audit.test.ts` and `tests/systems/pacing-reference-economy.test.ts` (Serenity/Tithes are economy-affecting) — document any snapshot shift in the PR body per `.claude/rules/game-balance.md`.
- [ ] **Step 4:** Inline multi-dimensional review (gameplay balance, fun, ages 7-43, play styles, difficulty modes, AI, UI/UX, architecture/extensibility, data, SFX, save compatibility, solo/hot-seat regressions) — same rigor as MR3's review. Specifically check:
  - Does `state.currentPlayer` gate the diplomacy panel's religion summary and the boon modal correctly for hot-seat?
  - Does a human civ's pending boon actually re-prompt at the start of THEIR turn specifically (not any turn)?
  - SFX: is there an existing generic "national project completed" or "milestone" stinger this can reuse, or does Sacred Council's founding need a bespoke moment flagged for later (MR7 audio polish already covers stingers per the arc plan)?
  - Grep the PR body draft for `closes?\s+#\d+` before opening.
- [ ] **Step 5:** `git fetch origin main && git rebase origin/main`, re-run build+test.
- [ ] **Step 6:** Open the PR (title: `feat(religion): religion core — state, Sacred Council, boons, passive spread (#591 MR4)`), reference #591/#587, do NOT use the literal substring "closes #524" anywhere.
