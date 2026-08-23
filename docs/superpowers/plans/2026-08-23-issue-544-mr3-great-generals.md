# #544 MR3 — Great General Data/Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. **Do not use subagent-driven-development or
> any other subagent-dispatching approach for this repo** — this project's
> `CLAUDE.md` explicitly forbids subagents/parallel agents; execute every task
> inline in the current session. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Build the backend data model and lifecycle for Great Generals —
`GENERAL_DEFINITIONS`, civ-wide XP/threshold progression, weighted candidate
generation, spawn, escort/transport/death rules, a per-civ history ledger, and
save fields — per contract §13-15. **Passive command auras, heroic abilities
(Rally/Seize the Moment/Last Stand), and AI evaluation are explicitly MR4/MR5,
not this MR** (contract §16-19 and the design spec's §10 phasing table). A
Great General is a real, physical, ownable `Unit` on the map from the moment
it spawns — not a data record waiting for a future MR to make it real — so
this MR includes the minimum player-facing surface (a candidate-choice prompt)
needed for the mechanic to be reachable at all, matching MR1's own "silent
changes read as bugs" precedent (`.claude/rules/incremental-mr-completion.md`).

**Architecture:** A new `UnitType: 'great_general'` with one shared
`UNIT_DEFINITIONS` baseline (movement/domain/supply-participation — consumed
by all the *existing* generic engine machinery: movement, transport, supply),
plus a separate `GENERAL_DEFINITIONS` flavor+identity catalog referenced by
`unit.generalDefinitionId` (name/era/civ-eligibility/descriptor/command
stats — consumed only by the *new* General-specific code this MR adds).
Civ-wide progress/history state lives on `Civilization` as optional fields
(no migration). Candidate generation reuses the existing
`seededLcg`/`weightedPick` primitives (`src/systems/seeded-lcg.ts`) — no new
RNG. The "queue to a natural break" pattern mirrors the existing
`BeastsState.pendingHoardChoices` shape. All new logic lives in one new
`src/systems/great-general-system.ts` module (plus the minimal UI panel and
composition wiring), imported by the existing hook sites
(`combat-reward-system.ts`, `city-capture-system.ts`, `turn-manager.ts`) —
mirroring supply's own "compose from existing call sites, don't invent
parallel state machinery" discipline.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

## Global Constraints

- No `Math.random()` anywhere — candidate generation uses `seededLcg`/
  `weightedPick` (`src/systems/seeded-lcg.ts`), seeded from `state.turn` +
  civ id, matching every other deterministic system in this codebase.
- **Difficulty-invariant.** No function in this plan branches on
  `GameState.opponentChallenge` / `Civilization.challenge`. Same thresholds,
  same candidate weighting, same everything, for every difficulty — contract
  §13 says so explicitly ("same thresholds across difficulty"). Regression
  test required (Task 15), matching MR1 Task 12 / MR2 Task 13's precedent.
- **Hot-seat privacy.** A pending candidate-choice queue entry is scoped to
  exactly one civ (`civId`) — mirroring `PendingHoardChoice`'s
  `{ lairId, civId }` shape exactly. The candidate-choice panel must only
  ever resolve/display for `state.currentPlayer` — never read or resolve a
  different civ's pending choice. Explicit regression required (Task 15).
- All new state is optional — legacy saves load with **zero** migration
  writes: `Civilization.generalProgress?`, `Civilization.generalHistory?`,
  `GameState.pendingGeneralCandidateChoices?`, `Unit.generalDefinitionId?`,
  `Unit.generalNoCommandThisTurn?` (spawn-turn flag) all default to "no
  Generals yet" when absent — matching the `hasRoad?: boolean` precedent at
  `src/core/types.ts:289`.
- **`GeneralDefinition`'s field set is deliberately scoped to what *this* MR
  actually reads.** `abilityIds`, `maxCommandCharges`, and cooldown duration
  are named in contract §14 as definition-capable-of-varying fields, but
  nothing in MR3 consumes them (no ability exists yet) — adding them now
  would be dead catalog data with zero readers anywhere in the codebase after
  this MR ships. They are **explicitly deferred to MR4**, which will extend
  `GeneralDefinition` additively when abilities need them (non-breaking, same
  pattern as `supply-progression.ts`'s documented `stabilizedByGeneral`
  extension seam from MR1's plan). `commandRange`/`commandCapacity` **are**
  included, because contract §15 ("General supply") requires MR3 itself to
  implement their supply-degradation behavior — MR4 will later become a
  second *consumer* of the same `getEffectiveCommandStats` helper this MR
  builds and tests, not its first author.
- **Seed roster is intentionally small, not exhaustive.** ~14 civs × several
  eras each of fully-researched historical accuracy is a content-authoring
  project on its own scale — contract §33 already names "rich Great General
  biographies" (issue E) and "campaign chronicle" (issue F) as explicit
  *deferred* follow-ups, confirming V1 doesn't need to be comprehensive. This
  MR ships one well-known, historically real commander per major civ
  currently in `CIV_DEFINITIONS` (content governance per contract §13: no
  Nazi figures; Genghis Khan explicitly allowed; nothing else here is
  materially controversial — these are the same figures virtually every
  commercial 4X game already uses) plus a small "universal" fallback pool for
  custom/fantasy civs and adjacent-era fallback, at one era each. Task 2 lists
  the exact roster and the reasoning per entry. Expanding roster depth later
  is a pure data change to `GENERAL_DEFINITIONS` — no code changes needed,
  which is exactly why it's safe to under-ship here rather than over-scope.
- Full repo test command: `bash scripts/run-with-mise.sh yarn test`. Full
  build/typecheck: `bash scripts/run-with-mise.sh yarn build`. Both run before
  the final commit.
- Reuse existing helpers, never re-derive: `seededLcg`/`weightedPick`
  (`seeded-lcg.ts`); `drawNextCityName`'s no-repeat-pool *pattern* (not the
  function itself — Generals need a richer record than a bare string, but the
  "walk the pool, skip used, fall back" shape is the one to mirror);
  `UNIT_CLASS_BY_TYPE`/`unitParticipatesInLandSupply` (`supply-participation.ts`);
  `getCivDefinition` (`civ-definitions.ts`); `applyCombatOutcomeToState`/
  `collectCombatRewards` (`combat-reward-system.ts`); `resolveMajorCityCapture`
  (`city-capture-system.ts`); `getVeterancyTier`/experience helpers
  (`combat-reward-system.ts`) for the "normal combat XP" progress source.

---

## File Structure

- **Modify** `src/core/types.ts` — `UnitType` gains `'great_general'`;
  `Unit` gains `generalDefinitionId?: string`, `generalNoCommandThisTurn?: boolean`;
  new `GeneralDefinition`, `GeneralProgressState`, `GeneralHistoryEntry`,
  `PendingGeneralCandidateChoice` types; `Civilization` gains
  `generalProgress?: GeneralProgressState`, `generalHistory?: GeneralHistoryEntry[]`;
  `GameState` gains `pendingGeneralCandidateChoices?: PendingGeneralCandidateChoice[]`.
  Tasks 1, 3, 6, 8.
- **Create** `src/systems/great-general-definitions.ts` — `GENERAL_DEFINITIONS`
  catalog. Task 2.
- **Modify** `src/systems/unit-system.ts` — `UNIT_DEFINITIONS['great_general']`,
  `UNIT_DESCRIPTIONS['great_general']`. Task 1.
- **Modify** `src/systems/unit-modifier-definitions.ts` —
  `UNIT_CLASS_BY_TYPE['great_general'] = ['civilian']`. Task 1.
- **Modify** `src/systems/supply-participation.ts` — no code change needed
  (verify only): `unitParticipatesInLandSupply` already honors an explicit
  `definition.participatesInLandSupply` override; Task 1 sets that override
  on the new `UnitDefinition` entry itself.
- **Create** `src/systems/great-general-system.ts` — progress accumulation,
  threshold checks, candidate generation, spawn, effective command-stat
  degradation, history ledger writes. Tasks 4, 5, 7, 9, 10, 11.
- **Modify** `src/systems/combat-reward-system.ts` — combat-XP and
  stronger-force-victory progress hooks in `applyCombatOutcomeToState`;
  escort-destroyed-kills-General and General-death-on-defeat handling. Tasks
  5, 12.
- **Modify** `src/systems/city-capture-system.ts` — city-capture progress hook
  in `resolveMajorCityCapture`. Task 5.
- **Modify** `src/core/turn-manager.ts` — successful-defense progress hook;
  per-round threshold check that queues a pending candidate choice; clears
  `generalNoCommandThisTurn` at the start of the General's owner's next turn.
  Tasks 5, 7, 9.
- **Modify** `src/systems/transport-system.ts` — verify only (Task 13):
  confirm `canLoadUnitOntoTransport` already treats `great_general` as an
  ordinary land unit with no special-casing needed.
- **Create** `src/ui/general-candidate-panel.ts` — minimal candidate-choice
  panel. Task 11.
- **Modify** `src/app/controllers/*` composition wiring (exact controller
  identified in Task 11) — surfaces the pending-choice panel at a natural
  break point, mirroring `maybeShowPendingHoardChoice`.
- **Modify** `src/renderer/unit-renderer.ts` — map icon for `great_general`.
  Task 14.
- **Modify** `src/storage/save-migrations.ts` — verify only (Task 16): confirm
  no migration entry is needed (all new fields optional).
- **Create** `tests/systems/great-general-definitions.test.ts`,
  `tests/systems/great-general-system.test.ts`. **Modify**
  `tests/systems/unit-system.test.ts`, `tests/systems/unit-modifier-system.test.ts`
  (or wherever the `UNIT_CLASS_BY_TYPE` completeness test lives — confirm in
  Task 1), `tests/systems/supply-participation.test.ts`,
  `tests/systems/combat-reward-system.test.ts`,
  `tests/systems/city-capture-system.test.ts`, `tests/core/turn-manager.test.ts`,
  `tests/ui/general-candidate-panel.test.ts`, `tests/renderer/unit-renderer.test.ts`
  (path confirmed in Task 14), plus the app-controller test file(s) touched by
  Task 11's wiring.

---

### Task 1: `great_general` as a UnitType — baseline definition

**Files:**
- Modify: `src/core/types.ts` (`UnitType` union, `Unit.generalDefinitionId`,
  `Unit.generalNoCommandThisTurn`)
- Modify: `src/systems/unit-system.ts` (`UNIT_DEFINITIONS`, `UNIT_DESCRIPTIONS`)
- Modify: `src/systems/unit-modifier-definitions.ts` (`UNIT_CLASS_BY_TYPE`)
- Test: `tests/systems/unit-modifier-system.test.ts` (or the real completeness
  test file — confirm exact path first), `tests/systems/supply-participation.test.ts`

**Interfaces:**
- Produces: `UNIT_DEFINITIONS.great_general: UnitDefinition`,
  `UNIT_CLASS_BY_TYPE.great_general: UnitClass[]`.

A General is `strength: 0` (cannot deal combat damage — "noncombat/support
unit", contract §15), `canFoundCity: false`, `canBuildImprovements: false`,
`domain: 'land'`. `UNIT_CLASS_BY_TYPE` tags it `'civilian'` (the honest
classification — no other class fits a non-combat unit), which means the
*default* `unitParticipatesInLandSupply` derivation would exclude it (civilian
units don't participate) — so this task sets the definition's own
`participatesInLandSupply: true` override, exactly the scenario MR1's own
plan anticipated and tested for
(`tests/systems/supply-participation.test.ts`'s "an explicit
`participatesInLandSupply: true` override wins even for a civilian-classed
type" case, which used a synthetic `worker` override as a stand-in for "the
future Great General unit (MR3)" — this task is that prediction landing for
real).

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-participation.test.ts, appended
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

describe('great_general supply participation (#544 MR3)', () => {
  it('a great_general unit participates in land supply via its own definition override, not the civilian default', () => {
    expect(UNIT_DEFINITIONS.great_general.participatesInLandSupply).toBe(true);
    expect(unitParticipatesInLandSupply({ type: 'great_general', owner: 'rome' })).toBe(true);
  });
});
```

```ts
// tests/systems/unit-modifier-system.test.ts (confirm real path/describe
// block first — this is the file with the Record<UnitType, ...> completeness
// guarantee mentioned in unit-modifier-definitions.ts's own comment), appended
it('classifies great_general as civilian (non-combat, no strength)', () => {
  expect(UNIT_CLASS_BY_TYPE.great_general).toEqual(['civilian']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-participation.test.ts tests/systems/unit-modifier-system.test.ts`
Expected: FAIL — `'great_general'` is not yet a valid `UnitType`, so this
won't even typecheck at the `yarn build` stage yet either; that's expected at
this point in the task.

- [ ] **Step 3: Add the UnitType and Unit fields**

```ts
// src/core/types.ts — UnitType union, append:
  | 'paratrooper'
  | 'great_general';
```

```ts
// src/core/types.ts — Unit interface, alongside geneTherapyReady:
  /** #544 MR3: which GENERAL_DEFINITIONS entry this specific great_general
   * instance is. Absent for every other unit type. */
  generalDefinitionId?: string;
  /** #544 MR3: true only on the turn a General spawns (contract §13:
   * "no heroic command on spawn turn, no passive stabilization on spawn
   * turn, operational next owner turn"). Cleared at the start of this
   * unit's owner's next turn. */
  generalNoCommandThisTurn?: boolean;
```

- [ ] **Step 4: Add `UNIT_DEFINITIONS`/`UNIT_DESCRIPTIONS` entries**

```ts
// src/systems/unit-system.ts — UNIT_DEFINITIONS, appended:
  great_general: {
    type: 'great_general', name: 'Great General', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
    domain: 'land',
    // #544 MR3: civilian classification (below) would default this to
    // false; Generals must participate in supply per contract §15.
    participatesInLandSupply: true,
  },
```

```ts
// src/systems/unit-system.ts — UNIT_DESCRIPTIONS, appended:
  great_general: 'A noncombat commander earned through military achievement. Cannot fight directly but can share a tile with one escorting unit.',
```

Confirm the exact neighboring-entry formatting convention (some entries in
this file are multi-line, some single-line) before finalizing indentation.

- [ ] **Step 5: Add the `UNIT_CLASS_BY_TYPE` entry**

```ts
// src/systems/unit-modifier-definitions.ts — UNIT_CLASS_BY_TYPE, appended:
  great_general: ['civilian'],
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-participation.test.ts tests/systems/unit-modifier-system.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — adding a `UnitType` without a `TRAINABLE_UNITS`/production-icon
entry is fine per `.claude/rules/game-systems.md`'s own beast-unit exception
("`UnitType` values ... spawned exclusively by a dedicated system ... are
intentionally NOT in `TRAINABLE_UNITS`") — Generals are exactly this shape:
never city-produced, always spawned by `great-general-system.ts`. If the
build surfaces a `Record<UnitType, ...>` completeness error anywhere else
(production icons, AI role classification, etc.), add the minimum entry each
one requires and note it here rather than silently working around the error.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/unit-modifier-definitions.ts tests/systems/supply-participation.test.ts tests/systems/unit-modifier-system.test.ts
git commit -m "feat(#544): add great_general as a non-trainable, non-combat UnitType"
```

---

### Task 2: `GeneralDefinition` catalog — seed roster

**Files:**
- Create: `src/systems/great-general-definitions.ts`
- Test: `tests/systems/great-general-definitions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GeneralDefinition {
    id: string;
    name: string;
    /** CivDefinition.id values this commander is thematically tied to.
     * Empty array = universal/fantasy fallback, drawable by any civ. */
    civTypeEligibility: string[];
    era: number; // 1-12, matches this codebase's existing era numbering
    descriptor: string; // one-line contextual text (contract §13 "Candidate presentation")
    portraitIcon: string; // single emoji, V1 placeholder -- matches this
                           // codebase's existing emoji-icon convention for
                           // every other non-bespoke-art entity (advisors,
                           // primary-action-bar, utility-toolbar all use
                           // emoji, not commissioned art, for exactly this
                           // "meaningful now, upgradeable later" reason)
    commandRange: number;
    commandCapacity: number;
  }
  export const GENERAL_DEFINITIONS: GeneralDefinition[];
  ```

Content governance per contract §13: no Nazi figures (none here); Genghis
Khan explicitly allowed (included); every other name below is a standard,
uncontroversial "great commander" figure already used by name in virtually
every commercial 4X game (matching this exact convention), not flagged for
review. `commandRange`/`commandCapacity` are placeholder-uniform for V1 (2
and 3 respectively) — "V1 definitions may share identical values... that
equality is data coincidence only" (contract §14) is explicit permission for
this; MR4 is free to differentiate them per definition without a schema
change.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-definitions.test.ts
import { describe, expect, it } from 'vitest';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';

describe('GENERAL_DEFINITIONS', () => {
  it('has at least one universal (civTypeEligibility: []) entry for custom/fantasy civs', () => {
    expect(GENERAL_DEFINITIONS.some(g => g.civTypeEligibility.length === 0)).toBe(true);
  });

  it('has at least one historically-eligible entry for every playable civ definition', () => {
    for (const civ of CIV_DEFINITIONS) {
      const hasEntry = GENERAL_DEFINITIONS.some(g => g.civTypeEligibility.includes(civ.id));
      expect(hasEntry, `no General entry eligible for civ "${civ.id}"`).toBe(true);
    }
  });

  it('every entry has a unique id', () => {
    const ids = GENERAL_DEFINITIONS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has an era in range 1-12', () => {
    for (const g of GENERAL_DEFINITIONS) {
      expect(g.era).toBeGreaterThanOrEqual(1);
      expect(g.era).toBeLessThanOrEqual(12);
    }
  });

  it('every entry has a non-empty descriptor and a single-emoji portraitIcon', () => {
    for (const g of GENERAL_DEFINITIONS) {
      expect(g.descriptor.length).toBeGreaterThan(0);
      expect(g.portraitIcon.length).toBeGreaterThan(0);
    }
  });

  it('no display name collides with a building, tech, or trainable unit name (mirrors wonder-content.md\'s collision rule)', async () => {
    const { BUILDINGS, TRAINABLE_UNITS } = await import('@/systems/city-system');
    const buildingNames = new Set(Object.values(BUILDINGS).map((b: any) => b.name));
    const unitNames = new Set(TRAINABLE_UNITS.map((u: any) => u.name));
    for (const g of GENERAL_DEFINITIONS) {
      expect(buildingNames.has(g.name), `"${g.name}" collides with a building name`).toBe(false);
      expect(unitNames.has(g.name), `"${g.name}" collides with a trainable unit name`).toBe(false);
    }
  });
});
```

Check `CIV_DEFINITIONS`'s real export name/shape (`src/systems/civ-definitions.ts`)
before finalizing — this plan assumes an exported array of the same
`CivDefinition[]` shape `getCivDefinition` looks up by id; adjust the import
if the real export is named or shaped differently.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-definitions.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/systems/great-general-definitions.ts
export interface GeneralDefinition {
  id: string;
  name: string;
  civTypeEligibility: string[];
  era: number;
  descriptor: string;
  portraitIcon: string;
  commandRange: number;
  commandCapacity: number;
}

const V1_COMMAND_RANGE = 2;
const V1_COMMAND_CAPACITY = 3;

export const GENERAL_DEFINITIONS: GeneralDefinition[] = [
  // --- Historical, one per major civ currently in CIV_DEFINITIONS ---
  { id: 'gen_caesar', name: 'Julius Caesar', civTypeEligibility: ['rome'], era: 3, descriptor: 'Conqueror of Gaul, master of the forced march.', portraitIcon: '🦅', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_ramesses', name: 'Ramesses II', civTypeEligibility: ['egypt'], era: 2, descriptor: 'Victor of Kadesh, builder-pharaoh of the New Kingdom.', portraitIcon: '𓂀', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_alexander', name: 'Alexander the Great', civTypeEligibility: ['greece'], era: 3, descriptor: 'Undefeated in battle, carried the phalanx to the edge of the known world.', portraitIcon: '⚔️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_genghis', name: 'Genghis Khan', civTypeEligibility: ['mongolia'], era: 4, descriptor: 'Unified the steppe, whose horse archers outran every army that faced them.', portraitIcon: '🏹', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_nebuchadnezzar', name: 'Nebuchadnezzar II', civTypeEligibility: ['babylon'], era: 2, descriptor: 'Builder of Babylon\'s walls, conqueror of Jerusalem.', portraitIcon: '🏛️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_shaka', name: 'Shaka Zulu', civTypeEligibility: ['zulu'], era: 5, descriptor: 'Reformed the impi with the short stabbing spear and the horned encirclement.', portraitIcon: '🛡️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_yuefei', name: 'Yue Fei', civTypeEligibility: ['china'], era: 4, descriptor: 'Song-dynasty general famed for discipline and unbroken loyalty.', portraitIcon: '🐉', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_cyrus', name: 'Cyrus the Great', civTypeEligibility: ['persia'], era: 2, descriptor: 'Founder of the Achaemenid Empire, first to rule "king of the four corners".', portraitIcon: '👑', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_wellington', name: 'Duke of Wellington', civTypeEligibility: ['england'], era: 6, descriptor: 'Broke Napoleon\'s army at Waterloo through unshakeable defensive lines.', portraitIcon: '🎖️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_cuauhtemoc', name: 'Cuauhtémoc', civTypeEligibility: ['aztec'], era: 4, descriptor: 'Last Aztec emperor, who fought Cortés to the walls of Tenochtitlan.', portraitIcon: '🦅', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_tokugawa', name: 'Tokugawa Ieyasu', civTypeEligibility: ['japan'], era: 5, descriptor: 'Won at Sekigahara and unified Japan under one shogunate.', portraitIcon: '⛩️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_chandragupta', name: 'Chandragupta Maurya', civTypeEligibility: ['india'], era: 2, descriptor: 'Founder of the Maurya Empire, first to unite most of the Indian subcontinent.', portraitIcon: '🐘', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_hannibal', name: 'Hannibal Barca', civTypeEligibility: ['carthage'], era: 3, descriptor: 'Crossed the Alps with war elephants to strike at the heart of Rome.', portraitIcon: '🐘', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },

  // --- Universal fallback pool: custom/fantasy civs, and adjacent-era
  // fallback when a civ's own historical roster is exhausted (contract §13).
  // Fictional but culturally-neutral, spanning multiple eras for weighting.
  { id: 'gen_universal_marshal', name: 'The Iron Marshal', civTypeEligibility: [], era: 1, descriptor: 'A commander of no fixed nation, forged by a hundred border skirmishes.', portraitIcon: '🛡️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_universal_warlord', name: 'The Grey Warlord', civTypeEligibility: [], era: 3, descriptor: 'Rose from the ranks through sheer tactical instinct.', portraitIcon: '⚔️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_universal_field_marshal', name: 'The Steel Field Marshal', civTypeEligibility: [], era: 6, descriptor: 'Modernized doctrine faster than any rival staff college.', portraitIcon: '🎖️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
  { id: 'gen_universal_commodore', name: 'The Storm Commodore', civTypeEligibility: [], era: 8, descriptor: 'Made a name commanding combined arms across an entire theater.', portraitIcon: '🌩️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY },
];
```

Confirm the exact `civ-definitions.ts` id spelling for every civ id used
above (`'rome'`, `'egypt'`, `'greece'`, `'mongolia'`, `'babylon'`, `'zulu'`,
`'china'`, `'persia'`, `'england'`, `'aztec'`, `'japan'`, `'india'`,
`'carthage'`) against the real file before finalizing — this plan is written
from the civ names observed in a live playtest session, not a guaranteed-current
read of `civ-definitions.ts`'s exact id strings. If `CIV_DEFINITIONS` contains
civs not listed here, either add a matching entry or explicitly note the gap
and file a follow-up rather than let Task 2's own completeness test silently
fail-and-get-weakened.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-definitions.test.ts`
Expected: PASS. If the civ-id or name-collision checks fail, fix the roster
data (not the test) — these are real correctness properties, not
placeholders.

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-definitions.ts tests/systems/great-general-definitions.test.ts
git commit -m "feat(#544): seed GENERAL_DEFINITIONS roster (one historical general per civ + universal fallback pool)"
```

---

### Task 3: Civ-wide progress/history state types

**Files:**
- Modify: `src/core/types.ts`
- Test: none (pure type addition; exercised by Task 4+)

**Interfaces:**
- Produces:
  ```ts
  export interface GeneralProgressState {
    points: number;
    generalsEarned: number; // count of thresholds crossed so far, this game
  }
  export interface GeneralHistoryEntry {
    unitId: string;
    generalDefinitionId: string;
    spawnedTurn: number;
    diedTurn?: number;
  }
  export interface PendingGeneralCandidateChoice {
    civId: string;
    candidateDefinitionIds: string[]; // 2-3 ids, already generated
    triggerEventLabel: string; // "city:captured", etc. -- for the panel's own context text
  }
  ```

- [ ] **Step 1: Add the types**

```ts
// src/core/types.ts — near LegendaryWonderHistory, or another natural
// grouping point; confirm the file's actual section-comment convention
// (grep for "// --- " section markers) and place these under a new
// "// --- Great Generals (#544 MR3) ---" marker rather than mid-unrelated-section.
export interface GeneralProgressState {
  points: number;
  generalsEarned: number;
}

export interface GeneralHistoryEntry {
  unitId: string;
  generalDefinitionId: string;
  spawnedTurn: number;
  diedTurn?: number;
}

export interface PendingGeneralCandidateChoice {
  civId: string;
  candidateDefinitionIds: string[];
  triggerEventLabel: string;
}
```

```ts
// src/core/types.ts — Civilization interface, appended:
  /** #544 MR3: civ-wide Great General earn progress. Absent = no progress yet. */
  generalProgress?: GeneralProgressState;
  /** #544 MR3: every General this civ has ever spawned, alive or dead.
   * `civTypeEligibility`-drawn ids in here are never redrawn as a candidate
   * (contract §13: "a used General never appears again"). */
  generalHistory?: GeneralHistoryEntry[];
```

```ts
// src/core/types.ts — GameState interface, appended:
  /** #544 MR3: queued General candidate choices, one per civ that has
   * crossed a threshold and not yet chosen. Mirrors BeastsState's
   * pendingHoardChoices shape/convention. */
  pendingGeneralCandidateChoices?: PendingGeneralCandidateChoice[];
```

- [ ] **Step 2: Run build to verify no type errors**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — pure additive optional fields, nothing should break.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(#544): add Great General progress/history/pending-choice types"
```

---

### Task 4: Threshold progression — pure helpers

**Files:**
- Create: `src/systems/great-general-system.ts`
- Test: `tests/systems/great-general-system.test.ts`

**Interfaces:**
- Produces: `getGeneralThreshold(generalsEarned: number): number`,
  `addGeneralProgress(current: GeneralProgressState | undefined, points: number): GeneralProgressState`,
  `hasCrossedGeneralThreshold(progress: GeneralProgressState): boolean`.

Contract §13: "each successive General costs more, later eras partially
soften escalation, no hard one-per-era cap, no full reset at era transition,
same thresholds across difficulty... exact thresholds are data-driven and not
yet locked." This task picks a concrete, documented, tunable formula rather
than leaving it unimplemented.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-system.test.ts
import { describe, expect, it } from 'vitest';
import {
  getGeneralThreshold,
  addGeneralProgress,
  hasCrossedGeneralThreshold,
} from '@/systems/great-general-system';

describe('getGeneralThreshold', () => {
  it('the first General costs less than the second', () => {
    expect(getGeneralThreshold(0)).toBeLessThan(getGeneralThreshold(1));
  });

  it('costs keep rising but with diminishing marginal increase (softened escalation)', () => {
    const delta1 = getGeneralThreshold(1) - getGeneralThreshold(0);
    const delta5 = getGeneralThreshold(5) - getGeneralThreshold(4);
    expect(delta5).toBeGreaterThanOrEqual(delta1);
    const delta10 = getGeneralThreshold(10) - getGeneralThreshold(9);
    // "later eras partially soften escalation" -- the marginal cost growth
    // itself should not keep accelerating forever.
    expect(delta10).toBeLessThanOrEqual(delta5 * 1.5);
  });
});

describe('addGeneralProgress', () => {
  it('starts from zero when no prior progress exists', () => {
    expect(addGeneralProgress(undefined, 10)).toEqual({ points: 10, generalsEarned: 0 });
  });

  it('accumulates onto existing progress without resetting generalsEarned', () => {
    expect(addGeneralProgress({ points: 5, generalsEarned: 1 }, 10)).toEqual({ points: 15, generalsEarned: 1 });
  });
});

describe('hasCrossedGeneralThreshold', () => {
  it('is false below the next threshold', () => {
    const threshold = getGeneralThreshold(0);
    expect(hasCrossedGeneralThreshold({ points: threshold - 1, generalsEarned: 0 })).toBe(false);
  });

  it('is true at or above the next threshold', () => {
    const threshold = getGeneralThreshold(0);
    expect(hasCrossedGeneralThreshold({ points: threshold, generalsEarned: 0 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/systems/great-general-system.ts
import type { GeneralProgressState } from '@/core/types';

/**
 * Threshold formula (contract §13 — "data-driven and not yet locked", this
 * is the initial tuning): base cost 100, +40 per General already earned,
 * with the per-General increment itself shrinking by 5% each time (floored
 * at +15) so escalation visibly softens in the late game without ever fully
 * flattening or resetting. Same formula regardless of difficulty or era —
 * satisfies contract's explicit "same thresholds across difficulty" and "no
 * full reset at era transition."
 */
const BASE_THRESHOLD = 100;
const BASE_INCREMENT = 40;
const INCREMENT_DECAY = 0.95;
const MIN_INCREMENT = 15;

export function getGeneralThreshold(generalsEarned: number): number {
  let threshold = BASE_THRESHOLD;
  let increment = BASE_INCREMENT;
  for (let i = 0; i < generalsEarned; i++) {
    threshold += increment;
    increment = Math.max(MIN_INCREMENT, increment * INCREMENT_DECAY);
  }
  return threshold;
}

export function addGeneralProgress(
  current: GeneralProgressState | undefined,
  points: number,
): GeneralProgressState {
  const base = current ?? { points: 0, generalsEarned: 0 };
  return { ...base, points: base.points + points };
}

export function hasCrossedGeneralThreshold(progress: GeneralProgressState): boolean {
  return progress.points >= getGeneralThreshold(progress.generalsEarned);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-system.ts tests/systems/great-general-system.test.ts
git commit -m "feat(#544): Great General XP threshold progression (data-driven, tunable)"
```

---

### Task 5: Achievement bonus hooks — combat XP, city capture, defense, stronger-force victory

**Files:**
- Modify: `src/systems/great-general-system.ts` (new `GENERAL_PROGRESS_AWARDS`
  constant + `awardGeneralProgress` helper)
- Modify: `src/systems/combat-reward-system.ts` (`applyCombatOutcomeToState`)
- Modify: `src/systems/city-capture-system.ts` (`resolveMajorCityCapture`)
- Modify: `src/core/turn-manager.ts` (successful-defense detection — see Step
  4 for the exact site, confirmed during implementation)
- Test: `tests/systems/great-general-system.test.ts`,
  `tests/systems/combat-reward-system.test.ts`,
  `tests/systems/city-capture-system.test.ts`

**Interfaces:**
- Produces: `awardGeneralProgress(civ: Pick<Civilization, 'generalProgress'>, points: number): Civilization['generalProgress']`
  (thin wrapper around `addGeneralProgress`, kept separate so call sites read
  intent, not arithmetic).

Contract §13: "Civilization-wide Great General progress comes mainly from
normal combat XP plus a small set of bounded major military-achievement
bonuses... city capture, successful city defense, victory over materially
stronger force... every bonus must be visible... protect against farming
trivial kills, recapture loops, and weak spawned actors."

**Anti-farming guards, decided here (data-driven, tunable, but not left
unimplemented):**
- Combat XP contribution is proportional to the *unit's own* veterancy XP
  gain for that kill (already scaled down for weak/beast/barbarian targets by
  `calculateDefeatReward`'s existing logic) at a small fixed ratio — trivial
  kills that grant little unit XP contribute little General progress too, for
  free, by reusing the existing scaling rather than re-deriving a second one.
- City capture bonus explicitly excludes the `reconquerBreakawayCity` branch
  (recapturing your *own* just-lost breakaway city is not "capturing an
  enemy" — `resolveMajorCityCapture` already special-cases this exact
  scenario for other systems).
- "Victory over materially stronger force" only fires when the defeated
  unit's combat strength (via the same `CombatContext` used for the actual
  fight) exceeded the victor's by a real margin (not any positive delta) —
  reusing whatever the combat system already computes for the pre-battle
  strength comparison, not a second ad hoc calculation.
- Barbarian/beast/pirate/crisis-force kills contribute ordinary combat-XP
  progress only (already naturally small per the XP-scaling reuse above) —
  they are explicitly excluded from the three *bonus* categories (city
  capture, defense, stronger-force victory) since none of those three
  concepts meaningfully apply to a barbarian camp raid.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/systems/great-general-system.test.ts, appended
import { GENERAL_PROGRESS_AWARDS, awardGeneralProgress } from '@/systems/great-general-system';

describe('awardGeneralProgress', () => {
  it('adds the given points onto existing (or absent) progress', () => {
    expect(awardGeneralProgress(undefined, GENERAL_PROGRESS_AWARDS.cityCapture)).toEqual({
      points: GENERAL_PROGRESS_AWARDS.cityCapture, generalsEarned: 0,
    });
  });
});

describe('GENERAL_PROGRESS_AWARDS', () => {
  it('every named bonus award is a positive number smaller than the base threshold (no single bonus insta-earns a General)', () => {
    const { getGeneralThreshold } = require('@/systems/great-general-system');
    for (const value of Object.values(GENERAL_PROGRESS_AWARDS)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(getGeneralThreshold(0));
    }
  });
});
```

The combat-XP, city-capture, defense, and stronger-force-victory *integration*
tests belong in each hook's own existing test file (Steps 4-6 below name
them) — this task's own test file only covers the shared award-table
invariant and the plumbing helper.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: FAIL — `GENERAL_PROGRESS_AWARDS`/`awardGeneralProgress` not yet exported.

- [ ] **Step 3: Implement the shared award table + helper**

```ts
// src/systems/great-general-system.ts, appended
import type { Civilization } from '@/core/types';

/** Bounded bonus awards (contract §13). Combat-XP progress is handled
 * separately in combat-reward-system.ts, scaled off the unit's own veterancy
 * XP gain rather than a flat award here. */
export const GENERAL_PROGRESS_AWARDS = {
  cityCapture: 30,
  successfulDefense: 25,
  strongerForceVictory: 20,
} as const;

export function awardGeneralProgress(
  civ: Pick<Civilization, 'generalProgress'>,
  points: number,
): NonNullable<Civilization['generalProgress']> {
  return addGeneralProgress(civ.generalProgress, points);
}
```

- [ ] **Step 4: Wire combat XP + stronger-force-victory into `applyCombatOutcomeToState`**

Read `src/systems/combat-reward-system.ts`'s `applyCombatOutcomeToState` and
`collectCombatRewards` in full before editing — this plan sketches the
integration shape, not a line-exact patch, since the exact surrounding
variable names must be read fresh (per `.claude/rules/spec-fidelity.md`).

```ts
// src/systems/combat-reward-system.ts — inside applyCombatOutcomeToState,
// after a reward's victor/defeated resolution is known (mirroring how
// collectCombatRewards already computes `values.experienceGained` for the
// victor), add a civ-wide progress award for the victor's civ:
import { awardGeneralProgress, GENERAL_PROGRESS_AWARDS } from '@/systems/great-general-system';

// ...for each confirmed kill (defeated + not captured), where `victorCivId`
// and `defeatedUnitBefore`/`victorUnitBefore` are already in scope:
if (isMajorCivOwner(victorCivId) && civilizations[victorCivId]) {
  const xpGained = /* the same experienceGained value already computed for
    the unit's own veterancy above -- reuse it, don't recompute */;
  let progressPoints = Math.round(xpGained * 0.5); // small fixed ratio, tunable
  const strongerForceMargin = /* victorStrength/defeatedStrength from the
    same CombatContext already used to resolve this fight -- confirm the
    exact field name in combat-context.ts before finalizing */;
  if (
    !isPirateOwner(defeatedUnitBefore.owner) && !isMinorCivOrBarbarianOwner(defeatedUnitBefore.owner)
    && strongerForceMargin >= 1.25 // defeated force was at least 25% stronger
  ) {
    progressPoints += GENERAL_PROGRESS_AWARDS.strongerForceVictory;
  }
  civilizations[victorCivId] = {
    ...civilizations[victorCivId],
    generalProgress: awardGeneralProgress(civilizations[victorCivId], progressPoints),
  };
}
```

Confirm `isMinorCivOrBarbarianOwner`/`classifyOwner`'s real name (per
`src/core/owner-kind.ts`, already used elsewhere in this file) before
finalizing — do not invent a helper that already exists under a different
name.

- [ ] **Step 5: Wire city-capture into `resolveMajorCityCapture`**

```ts
// src/systems/city-capture-system.ts — inside resolveMajorCityCapture, in
// the branch that actually transfers ownership to a *different* major civ
// (i.e. excluding the reconquerBreakawayCity branch already seen a few
// lines above it):
import { awardGeneralProgress, GENERAL_PROGRESS_AWARDS } from '@/systems/great-general-system';

// ...where `newOwnerId`'s civilizations entry is already being spread/updated:
civilizations[newOwnerId] = {
  ...capturingCiv,
  generalProgress: awardGeneralProgress(capturingCiv, GENERAL_PROGRESS_AWARDS.cityCapture),
};
```

- [ ] **Step 6: Wire successful-defense into `turn-manager.ts`**

This needs a concrete "was attacked this round and still holds every city it
started the round with" signal. Read `turn-manager.ts`'s `processTurn` in
full first to find (or confirm the absence of) an existing per-round
"was-this-civ-attacked" flag before inventing a new one — if
`lastCombatTurnByLandmass` (already on `Civilization`) or a similar existing
field can answer "this civ was attacked and still owns city X at round end,"
prefer it over a new field. If nothing existing answers this cleanly, add a
minimal per-round transient set (not persisted) computed once during
`processTurn` from combat events already flowing through this function,
mirroring `strategic-warning-system.ts`'s own before/after-round comparison
shape (`beforeRound`/`finalState` city-ownership diff: still-owned-and-was-
attacked = successful defense).

- [ ] **Step 7: Write and run integration tests in each touched file's own test suite**

Add one positive test + one negative (excluded-case) test to each of
`tests/systems/combat-reward-system.test.ts` (combat XP progress + stronger-
force-victory bonus, and the explicit "barbarian/pirate kill does not award
the stronger-force bonus" negative case) and
`tests/systems/city-capture-system.test.ts` (capture awards progress; a
reconquered breakaway city does not). Add the defense-bonus test to whichever
file Step 6's implementation lands in.

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/city-capture-system.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/systems/great-general-system.ts src/systems/combat-reward-system.ts src/systems/city-capture-system.ts src/core/turn-manager.ts tests/systems/great-general-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/city-capture-system.test.ts
git commit -m "feat(#544): award Great General progress for combat XP, city capture, defense, and stronger-force victories"
```

---

### Task 6: Weighted candidate generation

**Files:**
- Modify: `src/systems/great-general-system.ts`
- Test: `tests/systems/great-general-system.test.ts`

**Interfaces:**
- Produces: `generateGeneralCandidates(state: GameState, civId: string, seed: number): GeneralDefinition[]`
  (returns 2-3 definitions).

Contract §13: "generate 2-3 candidates, weighted toward current era,
adjacent-era unused candidates lower weight, farther eras fallback only,
deterministic seeded RNG... a used General never appears again... death and
retirement both mark used... pool exhausted: unused adjacent-era fallback,
closest era first, deterministic tie-breaker, never resurrect."

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-system.test.ts, appended
import { generateGeneralCandidates } from '@/systems/great-general-system';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { createNewGame } from '@/core/game-state';

describe('generateGeneralCandidates', () => {
  it('returns 2-3 unique candidates', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-candidates-1' });
    const candidates = generateGeneralCandidates(state, 'player', 1);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeLessThanOrEqual(3);
    expect(new Set(candidates.map(c => c.id)).size).toBe(candidates.length);
  });

  it('is deterministic for the same seed', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-candidates-2' });
    const first = generateGeneralCandidates(state, 'player', 42).map(c => c.id);
    const second = generateGeneralCandidates(state, 'player', 42).map(c => c.id);
    expect(first).toEqual(second);
  });

  it('never includes a General already in this civ\'s history (used-forever exclusion)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-candidates-3' });
    const romeCandidate = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;
    state.civilizations.player = {
      ...state.civilizations.player,
      generalHistory: [{ unitId: 'gen1', generalDefinitionId: romeCandidate.id, spawnedTurn: 1, diedTurn: 3 }],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const candidates = generateGeneralCandidates(state, 'player', seed);
      expect(candidates.some(c => c.id === romeCandidate.id)).toBe(false);
    }
  });

  it('falls back to the universal pool when a civ\'s own roster is exhausted', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-candidates-4' });
    const allRomeIds = GENERAL_DEFINITIONS.filter(g => g.civTypeEligibility.includes('rome')).map(g => g.id);
    state.civilizations.player = {
      ...state.civilizations.player,
      generalHistory: allRomeIds.map((id, i) => ({ unitId: `used${i}`, generalDefinitionId: id, spawnedTurn: 1, diedTurn: 2 })),
    };
    const candidates = generateGeneralCandidates(state, 'player', 7);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.every(c => c.civTypeEligibility.length === 0 || !c.civTypeEligibility.includes('rome'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: FAIL — `generateGeneralCandidates` not yet exported.

- [ ] **Step 3: Implement**

```ts
// src/systems/great-general-system.ts, appended
import type { GameState } from '@/core/types';
import { GENERAL_DEFINITIONS, type GeneralDefinition } from '@/systems/great-general-definitions';
import { seededLcg, weightedPick } from '@/systems/seeded-lcg';
import { resolveCivilizationEra } from '@/systems/tech-definitions';

const CANDIDATE_COUNT = 3;

function eraWeight(candidateEra: number, currentEra: number): number {
  const distance = Math.abs(candidateEra - currentEra);
  if (distance === 0) return 100;
  if (distance === 1) return 40; // adjacent-era, lower weight
  return 5; // farther era: fallback-only weight, still possible, rarely picked
}

/**
 * 2-3 weighted candidates for `civId` (contract §13). Deterministic for a
 * given `seed` -- callers pass a per-round, per-civ-derived seed (e.g.
 * `state.turn` combined with a hash of `civId`), never `Math.random()`.
 * Excludes every General already in this civ's `generalHistory` forever
 * (contract: "a used General never appears again... never resurrect").
 */
export function generateGeneralCandidates(
  state: GameState,
  civId: string,
  seed: number,
): GeneralDefinition[] {
  const civ = state.civilizations[civId];
  const civType = civ?.civType ?? '';
  const usedIds = new Set((civ?.generalHistory ?? []).map(entry => entry.generalDefinitionId));
  const currentEra = resolveCivilizationEra(state, civId);

  const eligible = GENERAL_DEFINITIONS.filter(g =>
    !usedIds.has(g.id) && (g.civTypeEligibility.length === 0 || g.civTypeEligibility.includes(civType)),
  );

  const rng = seededLcg(seed);
  const picked: GeneralDefinition[] = [];
  const pool = [...eligible];
  while (picked.length < CANDIDATE_COUNT && pool.length > 0) {
    const weights = pool.map(g => eraWeight(g.era, currentEra));
    const choice = weightedPick(pool, weights, rng);
    picked.push(choice);
    pool.splice(pool.indexOf(choice), 1);
  }
  return picked;
}
```

Confirm `resolveCivilizationEra`'s real signature (`src/systems/tech-definitions.ts`,
already used in `advisor-system.ts`/`strategic-warning-system.ts` — grep for
its exact `(state, civId)` vs `(techState)` shape before finalizing) before
finalizing this call.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-system.ts tests/systems/great-general-system.test.ts
git commit -m "feat(#544): weighted, deterministic, used-exclusion Great General candidate generation"
```

---

### Task 7: Queue pending choice on threshold crossing

**Files:**
- Modify: `src/systems/great-general-system.ts`
- Modify: `src/core/turn-manager.ts` (call site)
- Test: `tests/systems/great-general-system.test.ts`, `tests/core/turn-manager.test.ts`

**Interfaces:**
- Produces: `checkAndQueueGeneralCandidateChoice(state: GameState, civId: string, triggerEventLabel: string, seed: number): GameState`

Contract §13: "Record the event that crossed the threshold. Queue candidate
choice to a natural break; do not interrupt action resolution or allow
indefinite deferral." "Do not interrupt action resolution" means this check
runs at the SAME per-round hook point supply/strategic-warnings already use
(`processTurn`, once per round, after action resolution) — never mid-combat
or mid-worker-action. "Do not allow indefinite deferral" is satisfied
structurally: `pendingGeneralCandidateChoices` is a queue a human must clear
via Task 11's panel, the same non-dismissible-without-choosing shape
`PendingHoardChoice` already establishes.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-system.test.ts, appended
import { checkAndQueueGeneralCandidateChoice } from '@/systems/great-general-system';

describe('checkAndQueueGeneralCandidateChoice', () => {
  it('queues a pending choice once points cross the next threshold', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-queue-1' });
    state.civilizations.player = {
      ...state.civilizations.player,
      generalProgress: { points: 999, generalsEarned: 0 },
    };
    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);
    expect(result.pendingGeneralCandidateChoices).toHaveLength(1);
    expect(result.pendingGeneralCandidateChoices![0]!.civId).toBe('player');
    expect(result.pendingGeneralCandidateChoices![0]!.candidateDefinitionIds.length).toBeGreaterThanOrEqual(2);
  });

  it('does not queue below the threshold', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-queue-2' });
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 5, generalsEarned: 0 } };
    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);
    expect(result.pendingGeneralCandidateChoices ?? []).toHaveLength(0);
  });

  it('does not queue a second pending choice for a civ that already has one queued', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-queue-3' });
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 999, generalsEarned: 0 } };
    state.pendingGeneralCandidateChoices = [{ civId: 'player', candidateDefinitionIds: ['x', 'y'], triggerEventLabel: 'earlier' }];
    const result = checkAndQueueGeneralCandidateChoice(state, 'player', 'combat:xp', 1);
    expect(result.pendingGeneralCandidateChoices).toHaveLength(1);
    expect(result.pendingGeneralCandidateChoices![0]!.triggerEventLabel).toBe('earlier');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/systems/great-general-system.ts, appended
export function checkAndQueueGeneralCandidateChoice(
  state: GameState,
  civId: string,
  triggerEventLabel: string,
  seed: number,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ?.generalProgress || !hasCrossedGeneralThreshold(civ.generalProgress)) return state;
  if ((state.pendingGeneralCandidateChoices ?? []).some(choice => choice.civId === civId)) return state;

  const candidates = generateGeneralCandidates(state, civId, seed);
  if (candidates.length === 0) return state; // roster fully exhausted, nothing to offer

  return {
    ...state,
    pendingGeneralCandidateChoices: [
      ...(state.pendingGeneralCandidateChoices ?? []),
      { civId, candidateDefinitionIds: candidates.map(c => c.id), triggerEventLabel },
    ],
  };
}
```

- [ ] **Step 4: Wire into `processTurn`**

Read `turn-manager.ts`'s `processTurn` civ-loop (already identified in Task
5's audit) and add one call per human civ, after that civ's General progress
for the round is finalized:

```ts
// src/core/turn-manager.ts — inside the existing per-civ loop in processTurn,
// after Task 5's award hooks have already run for this round:
import { checkAndQueueGeneralCandidateChoice } from '@/systems/great-general-system';

// ...
    if (civ.isHuman) {
      newState = checkAndQueueGeneralCandidateChoice(newState, civId, 'round-end', hashSeedForRound(newState.turn, civId));
    }
```

Confirm whether a suitable per-round-per-civ deterministic seed helper
already exists (grep `hashSeed` usages across `core/`/`systems/`) before
writing a new one — several systems in this codebase already derive a
numeric seed from `turn` + a string id; reuse that convention rather than
inventing a second hashing scheme.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts tests/core/turn-manager.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/systems/great-general-system.ts src/core/turn-manager.ts tests/systems/great-general-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(#544): queue a Great General candidate choice once a civ crosses its threshold"
```

---

### Task 8: Spawn logic

**Files:**
- Modify: `src/systems/great-general-system.ts`
- Modify: `src/core/types.ts` (if a new `IdCounters` key is needed — confirm
  during implementation whether General unit ids reuse `nextUnitId`)
- Test: `tests/systems/great-general-system.test.ts`

**Interfaces:**
- Produces: `spawnGeneralForCiv(state: GameState, civId: string, generalDefinitionId: string): GameState`

Contract §13: "Spawn selected General at nearest valid friendly city to the
triggering event, deterministic tie-breaker, safe capital fallback if
needed. New General: full charges, zero cooldown, no heroic command on spawn
turn, no passive stabilization on spawn turn, operational next owner turn."
"Full charges"/"zero cooldown" are MR4-ability concepts with no MR3 field to
set (per this plan's Global Constraints) — this task only sets
`generalNoCommandThisTurn: true` and records the history entry; MR4 will
initialize its own charge/cooldown fields when it adds them.

"Nearest valid friendly city to the triggering event" — since MR3's trigger
events (combat XP, city capture, defense, threshold-check-at-round-end) don't
all carry a specific map location by the time `checkAndQueueGeneralCandidateChoice`
runs, this task spawns at the nearest friendly city to the *capital* (first
city in `civ.cities`, matching this codebase's own `// capital = cities[0] by
convention` exception documented in `.claude/rules/ui-panels.md`) as the
practical "safe capital fallback," rather than threading a coordinate through
the whole progress-tracking pipeline for a placement nuance the contract
itself already provides a documented fallback for.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-system.test.ts, appended
import { spawnGeneralForCiv } from '@/systems/great-general-system';
import { foundCity } from '@/systems/city-system';

describe('spawnGeneralForCiv', () => {
  it('spawns a new great_general unit at the capital, owned by the civ, with the chosen definition', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-spawn-1' });
    const capitalId = state.civilizations.player.cities[0];
    const capital = state.cities[capitalId];
    const romeGeneral = GENERAL_DEFINITIONS.find(g => g.civTypeEligibility.includes('rome'))!;

    const result = spawnGeneralForCiv(state, 'player', romeGeneral.id);

    const spawned = Object.values(result.units).find(u => u.type === 'great_general' && u.owner === 'player');
    expect(spawned).toBeDefined();
    expect(spawned!.generalDefinitionId).toBe(romeGeneral.id);
    expect(spawned!.generalNoCommandThisTurn).toBe(true);
    expect(spawned!.position).toEqual(capital.position);
  });

  it('removes the resolved choice from pendingGeneralCandidateChoices', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-spawn-2' });
    state.pendingGeneralCandidateChoices = [{ civId: 'player', candidateDefinitionIds: ['gen_caesar'], triggerEventLabel: 'x' }];
    const result = spawnGeneralForCiv(state, 'player', 'gen_caesar');
    expect(result.pendingGeneralCandidateChoices ?? []).toHaveLength(0);
  });

  it('records the spawn in generalHistory and increments generalsEarned', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Generals Test', seed: 'gen-spawn-3' });
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 50, generalsEarned: 0 } };
    const result = spawnGeneralForCiv(state, 'player', 'gen_caesar');
    expect(result.civilizations.player.generalHistory).toHaveLength(1);
    expect(result.civilizations.player.generalHistory![0]!.generalDefinitionId).toBe('gen_caesar');
    expect(result.civilizations.player.generalProgress!.generalsEarned).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/systems/great-general-system.ts, appended
import { hexKey } from '@/systems/hex-utils';

export function spawnGeneralForCiv(
  state: GameState,
  civId: string,
  generalDefinitionId: string,
): GameState {
  const civ = state.civilizations[civId];
  const capitalId = civ?.cities[0]; // capital = cities[0] by convention
  const capital = capitalId ? state.cities[capitalId] : undefined;
  if (!civ || !capital) return state;

  const unitId = `general-${state.idCounters.nextUnitId}`;
  const newUnit: Unit = {
    id: unitId,
    type: 'great_general',
    owner: civId,
    position: { ...capital.position },
    movementPointsLeft: 0, // spawns with no action this turn, matching "operational next owner turn"
    health: 100,
    experience: 0,
    generalDefinitionId,
    generalNoCommandThisTurn: true,
  };

  const generalsEarned = (civ.generalProgress?.generalsEarned ?? 0) + 1;

  return {
    ...state,
    idCounters: { ...state.idCounters, nextUnitId: state.idCounters.nextUnitId + 1 },
    units: { ...state.units, [unitId]: newUnit },
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        units: [...civ.units, unitId],
        generalProgress: { points: civ.generalProgress?.points ?? 0, generalsEarned },
        generalHistory: [
          ...(civ.generalHistory ?? []),
          { unitId, generalDefinitionId, spawnedTurn: state.turn },
        ],
      },
    },
    pendingGeneralCandidateChoices: (state.pendingGeneralCandidateChoices ?? [])
      .filter(choice => choice.civId !== civId),
  };
}
```

Confirm the exact `Unit` object's required-vs-optional fields against
`src/core/types.ts` (this sketch may be missing a field the real interface
requires, e.g. `hasMoved`/`hasActed` defaults used elsewhere in `createUnit`)
— prefer reusing `createUnit`'s own field-default logic if it's generic
enough to accept `great_general`, rather than hand-rolling a second unit
constructor. If `createUnit` already handles this correctly once
`UNIT_DEFINITIONS.great_general` exists (Task 1), call it instead of building
the literal by hand.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-system.ts tests/systems/great-general-system.test.ts
git commit -m "feat(#544): spawn a chosen Great General at the capital, full history/progress bookkeeping"
```

---

### Task 9: Effective command-stat degradation from supply

**Files:**
- Modify: `src/systems/great-general-system.ts`
- Test: `tests/systems/great-general-system.test.ts`

**Interfaces:**
- Produces: `getEffectiveCommandStats(unit: Pick<Unit, 'landSupply'>, definition: GeneralDefinition): { commandRange: number; commandCapacity: number }`

Contract §15 ("General supply"): "As degradation worsens: early stage:
command unchanged, later: `commandCapacity` drops, worst: `commandRange` may
shrink. Exact reductions are data-driven." No MR3 code *consumes* this yet
(abilities are MR4) — this task builds and tests the calculation itself, per
this plan's Global Constraints note that MR3 is the author and MR4 the
second consumer.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/great-general-system.test.ts, appended
import { getEffectiveCommandStats } from '@/systems/great-general-system';

const baseDefinition = GENERAL_DEFINITIONS[0]!; // commandRange 2, commandCapacity 3 for all V1 entries

describe('getEffectiveCommandStats', () => {
  it('full/stable-unsupported/grace stages leave command stats unchanged ("early stage: command unchanged")', () => {
    for (const supplyState of [undefined, { state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 }, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 }] as const) {
      const result = getEffectiveCommandStats({ landSupply: supplyState }, baseDefinition);
      expect(result).toEqual({ commandRange: baseDefinition.commandRange, commandCapacity: baseDefinition.commandCapacity });
    }
  });

  it('degraded stage reduces commandCapacity but not commandRange', () => {
    const result = getEffectiveCommandStats({ landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 } }, baseDefinition);
    expect(result.commandCapacity).toBeLessThan(baseDefinition.commandCapacity);
    expect(result.commandRange).toBe(baseDefinition.commandRange);
  });

  it('severe stage reduces both commandCapacity and commandRange, never below 1', () => {
    const result = getEffectiveCommandStats({ landSupply: { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 } }, baseDefinition);
    expect(result.commandCapacity).toBeLessThan(baseDefinition.commandCapacity);
    expect(result.commandRange).toBeLessThan(baseDefinition.commandRange);
    expect(result.commandRange).toBeGreaterThanOrEqual(1);
    expect(result.commandCapacity).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/systems/great-general-system.ts, appended
import type { Unit, LandSupplyState } from '@/core/types';

export function getEffectiveCommandStats(
  unit: Pick<Unit, 'landSupply'>,
  definition: Pick<GeneralDefinition, 'commandRange' | 'commandCapacity'>,
): { commandRange: number; commandCapacity: number } {
  const state: LandSupplyState = unit.landSupply?.state ?? 'full';
  if (state === 'degraded') {
    return { commandRange: definition.commandRange, commandCapacity: Math.max(1, definition.commandCapacity - 1) };
  }
  if (state === 'severe') {
    return {
      commandRange: Math.max(1, definition.commandRange - 1),
      commandCapacity: Math.max(1, definition.commandCapacity - 1),
    };
  }
  return { commandRange: definition.commandRange, commandCapacity: definition.commandCapacity };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/great-general-system.ts tests/systems/great-general-system.test.ts
git commit -m "feat(#544): supply-based command-stat degradation for Generals (MR4 will consume this)"
```

---

### Task 10: Escort/transport/death rules

**Files:**
- Modify: `src/systems/combat-reward-system.ts` (`applyCombatOutcomeToState`
  — escort-destroyed-kills-General, General-death-records-history)
- Modify: `src/systems/transport-system.ts` — verify only (see Step 1)
- Test: `tests/systems/combat-reward-system.test.ts`, `tests/systems/transport-system.test.ts`

**Interfaces:**
- Consumes: `removeUnitFromCopies` (already in `combat-reward-system.ts`).
- Produces: no new exported function — this task threads General-specific
  death/history bookkeeping through the *existing* unit-removal paths rather
  than adding a parallel one.

Contract §15: "A General may share a tile with one friendly combat unit...
If escort is destroyed, General dies too. No escape... No stacking with
another Great General... Transport destroyed -> General dies... While
embarked: no passive command, no heroic abilities [not MR3's concern —
nothing to disable yet]... After disembarking: one-turn setup, command
effects available next owner turn [same `generalNoCommandThisTurn`
mechanism Task 1/8 already built, reused here]."

- [ ] **Step 1: Verify transport compatibility needs no special-casing**

Read `canLoadUnitOntoTransport` (`transport-system.ts`) in full. It almost
certainly already treats any `domain: 'land'` unit as loadable — if so, no
code change is needed for basic transport eligibility; write one test proving
it (`great_general` can load onto a `transport`) rather than assuming. If it
turns out `great_general` needs an explicit inclusion (e.g. an allowlist by
type rather than by domain), add the minimum change here and note why.

```ts
// tests/systems/transport-system.test.ts, appended
it('a great_general can load onto a transport like any other land unit (#544 MR3)', () => {
  // construct a great_general unit + a transport at the same tile, matching
  // this file's own existing load-eligibility test fixture pattern
  // (grep for an existing "canLoadUnitOntoTransport" test above and mirror
  // its exact state-construction shape rather than inventing a new one)
});
```

- [ ] **Step 2: Write the failing escort/death tests**

```ts
// tests/systems/combat-reward-system.test.ts, appended
describe('Great General death rules (#544 MR3)', () => {
  it('when a General\'s escort is destroyed in combat, the General is destroyed too, with no escape', () => {
    // Construct a state where a great_general and a friendly combat unit
    // share a tile, the combat unit is the defender and loses. Assert the
    // great_general unit id is also removed from state.units after
    // applyCombatOutcomeToState, and (if generalHistory tracking already
    // exists on this civ) that its history entry gets a diedTurn.
  });

  it('a General with no escort, if somehow the direct target of a lethal attack, is destroyed like any other non-combat unit', () => {
    // Sanity case: confirm existing applyCombatOutcomeToState behavior
    // already handles a strength-0 unit being destroyed without any new
    // code -- this test documents that expectation explicitly rather than
    // leaving it implicit.
  });

  it('records diedTurn in generalHistory when a General is destroyed', () => {
    // Build a state with a real generalHistory entry for the dying unit's
    // id, trigger its destruction, assert diedTurn === state.turn on the
    // matching history entry for that civ.
  });
});
```

These are sketches — the exact fixture construction (attacker/defender
`CombatResult`, tile co-occupancy) must mirror this test file's own existing
combat-outcome test conventions; read several neighboring tests in the same
file before writing these for real, rather than guessing the state shape.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/combat-reward-system.test.ts tests/systems/transport-system.test.ts`
Expected: FAIL for the two new escort/history tests (the transport test may
already pass if Step 1 found no gap — that's a valid outcome, not a failure
of this task).

- [ ] **Step 4: Implement**

In `applyCombatOutcomeToState`, after a defeated unit is removed via
`removeUnitFromCopies` (or the equivalent point where `units`/`civilizations`
are finalized for the removed unit), add:

```ts
// src/systems/combat-reward-system.ts — new helper, called for both the
// attacker-defeated and defender-defeated branches, wherever the existing
// code already knows the tile of the unit that just died:
function destroyEscortedGeneral(
  units: Record<string, Unit>,
  civilizations: GameState['civilizations'],
  destroyedUnitPosition: HexCoord,
  destroyedUnitOwner: string,
  turn: number,
): { units: Record<string, Unit>; civilizations: GameState['civilizations'] } {
  const escortedGeneral = Object.values(units).find(
    u => u.type === 'great_general' && u.owner === destroyedUnitOwner
      && hexKey(u.position) === hexKey(destroyedUnitPosition),
  );
  if (!escortedGeneral) return { units, civilizations };

  const { units: nextUnits } = removeUnitFromCopies(units, civilizations, undefined, escortedGeneral.id);
  const civ = civilizations[destroyedUnitOwner];
  const nextCivilizations = civ ? {
    ...civilizations,
    [destroyedUnitOwner]: {
      ...civ,
      generalHistory: (civ.generalHistory ?? []).map(entry =>
        entry.unitId === escortedGeneral.id ? { ...entry, diedTurn: turn } : entry,
      ),
    },
  } : civilizations;
  return { units: nextUnits, civilizations: nextCivilizations };
}
```

Call this once per defeated-unit branch (attacker and defender), passing the
unit's position *before* removal. Confirm the exact variable names in scope
at each call site by reading the surrounding code fresh — this plan names
the shape, not the exact line numbers, since `removeUnitFromCopies` already
mutates `units`/`civilizations` locals earlier in the function and this must
compose with that, not duplicate it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/combat-reward-system.test.ts tests/systems/transport-system.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/systems/combat-reward-system.ts tests/systems/combat-reward-system.test.ts tests/systems/transport-system.test.ts
git commit -m "feat(#544): escort-destroyed-kills-General and generalHistory death recording"
```

---

### Task 11: Minimal candidate-choice UI

**Files:**
- Create: `src/ui/general-candidate-panel.ts`
- Modify: `src/app/controllers/*` composition wiring (exact file confirmed
  during implementation — grep `maybeShowPendingHoardChoice`'s real call
  site and mirror it)
- Test: `tests/ui/general-candidate-panel.test.ts`

**Interfaces:**
- Produces: `renderGeneralCandidatePanel(container: HTMLElement, definitions: GeneralDefinition[], onChoose: (definitionId: string) => void): void`

Per `.claude/rules/incremental-mr-completion.md`, a player-visible decision
point (crossing the threshold) cannot ship with no way to act on it. V1
presentation is deliberately plain — name, portrait emoji, era, one-line
descriptor (exactly contract §12's listed fields, "no rename option") — a
future polish pass can restyle it without touching the underlying choice
mechanics this task builds.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/general-candidate-panel.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderGeneralCandidatePanel } from '@/ui/general-candidate-panel';
import type { GeneralDefinition } from '@/systems/great-general-definitions';

const CANDIDATES: GeneralDefinition[] = [
  { id: 'gen_a', name: 'General A', civTypeEligibility: [], era: 3, descriptor: 'Test descriptor A', portraitIcon: '⚔️', commandRange: 2, commandCapacity: 3 },
  { id: 'gen_b', name: 'General B', civTypeEligibility: [], era: 4, descriptor: 'Test descriptor B', portraitIcon: '🛡️', commandRange: 2, commandCapacity: 3 },
];

describe('renderGeneralCandidatePanel', () => {
  it('renders one option per candidate, showing name/era/descriptor, and calls onChoose with the selected id', () => {
    document.body.innerHTML = '';
    const onChoose = vi.fn();
    renderGeneralCandidatePanel(document.body, CANDIDATES, onChoose);

    expect(document.body.textContent).toContain('General A');
    expect(document.body.textContent).toContain('Test descriptor B');

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const optionForB = buttons.find(b => b.textContent?.includes('General B'));
    expect(optionForB).toBeTruthy();
    optionForB!.click();
    expect(onChoose).toHaveBeenCalledWith('gen_b');
  });

  it('uses createGameButton / no-bare-buttons convention (both background and color set)', () => {
    document.body.innerHTML = '';
    renderGeneralCandidatePanel(document.body, CANDIDATES, () => {});
    for (const button of document.body.querySelectorAll('button')) {
      expect(button.style.background || button.style.backgroundColor).toBeTruthy();
      expect(button.style.color).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/general-candidate-panel.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/ui/general-candidate-panel.ts
import { createGameButton } from '@/ui/ui-kit';
import type { GeneralDefinition } from '@/systems/great-general-definitions';

export function renderGeneralCandidatePanel(
  container: HTMLElement,
  definitions: GeneralDefinition[],
  onChoose: (definitionId: string) => void,
): void {
  container.replaceChildren();

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:50;';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:#1a1712;border-radius:12px;padding:20px;max-width:480px;width:90%;border:1px solid rgba(232,193,112,0.4);';

  const heading = document.createElement('h3');
  heading.textContent = 'Choose Your Great General';
  heading.style.cssText = 'margin:0 0 12px;color:#e8c170;';
  panel.appendChild(heading);

  for (const definition of definitions) {
    const card = document.createElement('div');
    card.style.cssText = 'margin-bottom:10px;padding:10px;border-radius:8px;background:rgba(255,255,255,0.05);';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:bold;font-size:15px;color:#f4f1e8;';
    title.textContent = `${definition.portraitIcon} ${definition.name} (Era ${definition.era})`;
    card.appendChild(title);

    const descriptor = document.createElement('div');
    descriptor.style.cssText = 'font-size:12px;opacity:0.8;margin:4px 0 8px;color:#f4f1e8;';
    descriptor.textContent = definition.descriptor;
    card.appendChild(descriptor);

    const chooseButton = createGameButton(`Choose ${definition.name}`, 'primary');
    chooseButton.addEventListener('click', () => onChoose(definition.id));
    card.appendChild(chooseButton);

    panel.appendChild(card);
  }

  overlay.appendChild(panel);
  container.appendChild(overlay);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/general-candidate-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Wire it into the real app**

Find the real `maybeShowPendingHoardChoice` call site and equivalent
composition wiring (grep across `src/app/controllers/`), and add an
analogous `maybeShowPendingGeneralChoice`:

```ts
// Sketch -- exact file/dependency shape confirmed during implementation by
// reading the real maybeShowPendingHoardChoice call site in full first.
function maybeShowPendingGeneralChoice(): void {
  const state = session.getState();
  const pending = (state.pendingGeneralCandidateChoices ?? [])
    .find(choice => choice.civId === state.currentPlayer);
  if (!pending) return;

  const definitions = pending.candidateDefinitionIds
    .map(id => GENERAL_DEFINITIONS.find(g => g.id === id))
    .filter((g): g is GeneralDefinition => g !== undefined);

  renderGeneralCandidatePanel(uiLayer, definitions, (definitionId) => {
    session.commit(spawnGeneralForCiv(session.getState(), state.currentPlayer, definitionId));
    uiLayer.querySelector('...')?.remove(); // clear the overlay after choosing
  });
}
```

Call it at the same natural-break points `maybeShowPendingHoardChoice`
already uses (turn start / post-handoff) — never mid-action.

- [ ] **Step 6: Run the full app-controller test suite touched by this wiring**

Run: `bash scripts/run-with-mise.sh yarn test` (targeted to the specific
controller test file(s) modified — confirm exact path during implementation)
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/ui/general-candidate-panel.ts tests/ui/general-candidate-panel.test.ts
git commit -m "feat(#544): minimal Great General candidate-choice panel, wired to the pending-choice queue"
```

---

### Task 12: Combat/movement gating — Generals never fight directly

**Files:**
- Modify: `src/systems/attack-targeting.ts` or wherever attack eligibility is
  gated by `strength > 0` (confirm exact site) — verify only, no change
  expected.
- Test: `tests/systems/attack-targeting.test.ts` (or equivalent)

**Interfaces:** none new.

`strength: 0` (Task 1) almost certainly already excludes `great_general` from
initiating attacks via whatever existing `def.strength > 0` gate every other
zero-strength support unit (workers, settlers, caravans) already goes
through. This task is a verification pass, not new code — write one explicit
regression proving it, since "a General cannot attack" is a real contract
requirement (§15: "noncombat/support unit") worth a named test even though no
new production code should be needed to satisfy it.

- [ ] **Step 1: Write the test**

```ts
// tests/systems/attack-targeting.test.ts (confirm real file), appended
it('a great_general has no attack targets, matching every other strength-0 support unit (#544 MR3)', () => {
  // construct a state with a great_general adjacent to an enemy unit,
  // assert getAttackTargets(...) returns an empty array -- mirror this
  // file's existing zero-strength-unit test fixture if one already exists
  // for workers/settlers/caravans, rather than writing a new one from scratch.
});
```

- [ ] **Step 2: Run to verify it already passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/attack-targeting.test.ts`
Expected: PASS immediately. If it fails, that means `great_general`'s
`strength: 0` isn't sufficient somewhere in the attack-eligibility chain —
find and fix the real gap rather than special-casing `great_general` by type
name (the existing zero-strength convention should be generic).

- [ ] **Step 3: Commit**

```bash
git add tests/systems/attack-targeting.test.ts
git commit -m "test(#544): regression confirming Great Generals have no attack targets (strength 0)"
```

---

### Task 13: Unit-panel identity, description, and map icon

**Files:**
- Modify: `src/renderer/unit-renderer.ts` (map icon)
- Test: `tests/renderer/unit-renderer.test.ts` (path confirmed during
  implementation), `tests/ui/selected-unit-info.test.ts`

**Interfaces:** none new — `UNIT_DEFINITIONS`/`UNIT_DESCRIPTIONS` (Task 1)
already feed the existing generic unit-info panel rendering
(`selected-unit-info.ts` reads `def.name`/`UNIT_DESCRIPTIONS[unit.type]`
generically, no General-specific panel code needed for basic identity).

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/unit-renderer.test.ts (confirm real path), appended
it('great_general has a distinct map icon, not the fallback icon', () => {
  // mirror this file's existing per-unit-type icon lookup test pattern
});
```

```ts
// tests/ui/selected-unit-info.test.ts, appended
it('shows the General definition\'s name and era in the unit panel when a great_general is selected', () => {
  // Construct a great_general unit with a real generalDefinitionId, select
  // it, assert the panel text includes the GeneralDefinition's own name
  // (not just the generic "Great General" UnitDefinition.name) -- this
  // needs a small selected-unit-info.ts addition: when unit.type ===
  // 'great_general' and unit.generalDefinitionId resolves, show the
  // specific commander's name/era/descriptor instead of (or alongside) the
  // generic "Great General" label, mirroring how this file already layers
  // role-specific presentation (getUnitRolePresentation) on top of the
  // generic def.name line.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/renderer/unit-renderer.test.ts tests/ui/selected-unit-info.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the map icon**

Read `unit-renderer.ts`'s existing per-`UnitType` icon table (or fallback
logic) and add a `great_general` entry — a distinct, simple icon (e.g. a
star or flag glyph) consistent with the file's existing icon-selection
convention for non-sprite unit types. Confirm whether this codebase's sprite
pipeline (`.claude/rules/sprites.md`) requires a full sprite for every
`UnitType`, or whether a plain-icon fallback path already exists for
types without bespoke sprite art — Generals should use whichever path other
recently-added non-combat unit types (e.g. `propagandist`, `drone_controller`)
used, not a new one-off mechanism.

- [ ] **Step 4: Implement the unit-panel name/era override**

```ts
// src/ui/selected-unit-info.ts — near the top of renderSelectedUnitInfo,
// after `def` is resolved, add a small General-specific presentation block
// (following this file's existing pattern of additional info blocks layered
// under the generic name/description lines):
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';

// ...
  if (unit.type === 'great_general' && unit.generalDefinitionId) {
    const generalDef = GENERAL_DEFINITIONS.find(g => g.id === unit.generalDefinitionId);
    if (generalDef) {
      const generalLine = document.createElement('div');
      generalLine.style.cssText = 'font-size:12px;margin-top:2px;color:#e8c170;';
      generalLine.textContent = `${generalDef.portraitIcon} ${generalDef.name} — Era ${generalDef.era}`;
      wrapper.appendChild(generalLine);
      const descriptorLine = document.createElement('div');
      descriptorLine.style.cssText = 'font-size:11px;opacity:0.8;margin-top:2px;';
      descriptorLine.textContent = generalDef.descriptor;
      wrapper.appendChild(descriptorLine);
    }
  }
```

Confirm the exact insertion point (after `descDiv`/`topRow`, before the
land-supply status block already there) against the file's real current
structure before finalizing.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/renderer/unit-renderer.test.ts tests/ui/selected-unit-info.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/unit-renderer.ts src/ui/selected-unit-info.ts tests/renderer/unit-renderer.test.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(#544): map icon and unit-panel identity for the specific General a unit represents"
```

---

### Task 14: Save-migration verification

**Files:** none expected — verification only.
**Test:** none new.

- [ ] **Step 1: Confirm no migration entry is needed**

Every new field this MR adds (`Unit.generalDefinitionId`,
`Unit.generalNoCommandThisTurn`, `Civilization.generalProgress`,
`Civilization.generalHistory`, `GameState.pendingGeneralCandidateChoices`) is
optional with "absence means no Generals yet" as its valid default —
matching the `hasRoad?: boolean` precedent this codebase's own migration
conventions require before skipping a migration entry
(`src/storage/save-migrations.ts`'s real migration list; confirm no
non-optional `Record`-shaped field was accidentally introduced anywhere in
this plan before checking this box).

Run: `bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 2: Commit (only if any doc note is warranted; likely a no-op)**

No commit expected for this task unless Step 1 surfaces something —
document any finding directly in this plan's Self-Review Notes instead of a
throwaway commit.

---

### Task 15: Difficulty-invariance + hot-seat privacy regressions

**Files:**
- Create: `tests/systems/great-general-mr3-invariants.test.ts`

**Interfaces:** none new — consolidated regression file, same convention as
MR2's `supply-mr2-privacy.test.ts`.

- [ ] **Step 1: Write the tests**

```ts
// tests/systems/great-general-mr3-invariants.test.ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  getGeneralThreshold,
  generateGeneralCandidates,
  checkAndQueueGeneralCandidateChoice,
} from '@/systems/great-general-system';

describe('#544 MR3 — difficulty invariance', () => {
  it('getGeneralThreshold has no difficulty dependency (no such parameter exists at all)', () => {
    // Structural proof: the function signature itself takes only
    // generalsEarned. Nothing to compare -- documents the invariant rather
    // than diffing two calls with different opponentChallenge values, since
    // there is no such parameter to vary in the first place.
    expect(getGeneralThreshold.length).toBe(1);
  });

  it('candidate generation produces identical results regardless of opponentChallenge', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Invariance Test', seed: 'gen-invariance-1' });
    const explorer = generateGeneralCandidates({ ...state, opponentChallenge: 'explorer' }, 'player', 5).map(c => c.id);
    const veteran = generateGeneralCandidates({ ...state, opponentChallenge: 'veteran' }, 'player', 5).map(c => c.id);
    expect(explorer).toEqual(veteran);
  });
});

describe('#544 MR3 — hot-seat privacy', () => {
  it('a pending candidate choice for one civ is never surfaced or resolvable for another civ', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Privacy Test', seed: 'gen-privacy-1' });
    state.civilizations.player = { ...state.civilizations.player, generalProgress: { points: 999, generalsEarned: 0 } };
    const withPending = checkAndQueueGeneralCandidateChoice(state, 'player', 'test', 1);
    const aiId = Object.keys(withPending.civilizations).find(id => id !== 'player')!;
    // The AI civ must never receive a queued human-facing choice regardless
    // of its own progress -- checkAndQueueGeneralCandidateChoice is only
    // ever called for isHuman civs (Task 7's turn-manager wiring), and this
    // asserts the queued entry is scoped to exactly the civId it was called
    // with, never broadened to "every civ".
    expect(withPending.pendingGeneralCandidateChoices!.every(choice => choice.civId === 'player')).toBe(true);
    expect(withPending.pendingGeneralCandidateChoices!.some(choice => choice.civId === aiId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it passes against the already-implemented Tasks 4-9**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/great-general-mr3-invariants.test.ts`
Expected: PASS. If anything fails, the failure means an earlier task has a
real invariant violation — stop and fix that task, don't weaken this test.

- [ ] **Step 3: Commit**

```bash
git add tests/systems/great-general-mr3-invariants.test.ts
git commit -m "test(#544): consolidated MR3 difficulty-invariance and hot-seat privacy regressions"
```

---

### Task 16: Full-suite verification, self-review, and issue checklist

**Files:** none new — verification and documentation only.

- [ ] **Step 1: Full suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS, full suite, no regressions in any file this MR touched.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — no TypeScript errors.

- [ ] **Step 2: Check pacing gates**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-audit.test.ts tests/systems/pacing-reference-economy.test.ts`
Expected: PASS. Generals add no yields directly, but combat-XP-derived
progress and the new achievement bonuses are new economy-adjacent state — if
either snapshot changes, this MR must include the updated snapshot numbers
and a one-line justification per `.claude/rules/game-balance.md`'s "Pacing
Regression Prevention" section, not a silently-updated snapshot.

- [ ] **Step 3: Self-review against contract §13-15**

| Contract requirement | Covered by |
|---|---|
| `GENERAL_DEFINITIONS` catalog | Task 2 |
| Civ-wide XP + bounded achievement-bonus progress | Task 5 |
| Anti-farming guards (trivial kills, recapture loops, weak actors) | Task 5 (documented guards) |
| Threshold progression, escalating, softened, no reset, difficulty-invariant | Task 4, 15 |
| Candidate generation: 2-3, weighted, deterministic seeded RNG | Task 6 |
| Historical roster, culturally coherent, never-reused, adjacent-era fallback | Task 2, 6 |
| Content governance (no Nazi figures; Genghis Khan allowed) | Task 2 |
| Spawn at nearest/capital-fallback city, queued not interrupting | Task 7, 8 |
| New General: no command/stabilization on spawn turn | Task 1, 8 |
| General participates in land supply | Task 1 |
| Command-stat degradation from supply | Task 9 |
| Escort stacking, escort-destroyed-kills-General, no General+General stacking | Task 10 |
| Transport rules, transport-destroyed-kills-General | Task 10 |
| History ledger (spawn/death) | Task 8, 10 |
| Save fields, no migration needed | Task 14 |
| Player-visible choice surface (not a silent mechanic) | Task 11 |
| Hot-seat privacy | Task 15 |
| Difficulty invariance | Task 15 |
| Passive command/heroic abilities/AI | **Explicitly out of scope — MR4/MR5** |

- [ ] **Step 4: Update the tracking issue**

```bash
gh issue view 544 --json body -q .body > /tmp/issue-544-body.md
```

Edit the checkbox for "MR3 — Great General data/lifecycle" to `[x]` and
append the merged PR link, matching MR1/MR2's exact format. Then:

```bash
gh issue edit 544 --body-file /tmp/issue-544-body.md
```

Only after the PR is actually merged (per this arc's own established
convention — see MR2's handoff).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs(#544): MR3 self-review against contract §13-15, confirm full-suite green"
```

---

## Self-Review Notes (for whoever executes this plan)

- **`GeneralDefinition` deliberately omits `abilityIds`/`maxCommandCharges`/
  cooldown fields** — a scope decision, not an oversight; see Global
  Constraints. MR4 extends the interface additively when it needs them.
- **The seed roster (Task 2) is intentionally small** — one historical
  General per current `CIV_DEFINITIONS` entry plus a 4-entry universal pool.
  Expanding it is a pure-data follow-up, explicitly not blocking this MR.
- **Task 5's successful-defense hook (Step 6) is the least-specified part of
  this plan** — it depends on reading `turn-manager.ts` fresh to find (or
  build) the right "was attacked and still holds its cities" signal. If no
  clean existing signal exists, prefer building a small transient per-round
  computation over adding new persisted state, matching
  `strategic-warning-system.ts`'s own before/after-round diff convention.
- **Task 11's UI is intentionally plain** — text + emoji + one button per
  candidate, not a polished panel. This satisfies "not silently dead" without
  scope-creeping into presentation work a future MR could do better once the
  mechanic is proven out, mirroring MR1's own single-status-line precedent.
- **Every helper this plan adds has at least one real caller by the end of
  its task** — `getGeneralThreshold`/`addGeneralProgress` ← Task 5's award
  hooks; `generateGeneralCandidates` ← Task 7's queueing; `spawnGeneralForCiv`
  ← Task 11's panel wiring; `getEffectiveCommandStats` ← tested directly in
  Task 9 and documented as awaiting its second (MR4) caller, the same
  "extension seam" pattern MR1's `stabilizedByGeneral` parameter already
  established for this exact arc.

## Execution Record (all 16 tasks completed)

**Deviations from the plan as written, discovered during execution:**

- **CIV_DEFINITIONS has 29 civs, not the ~13 the plan's Task 2 draft
  sketched** — 18 historical + 11 fantasy/lore civs (`gondor`, `rohan`,
  `shire`, `isengard`, `prydain`, `annuvin`, `wakanda`, `avalon`,
  `lothlorien`, `narnia`, `atlantis`), confirmed by grep before writing the
  real roster. The shipped `GENERAL_DEFINITIONS` covers all 29 with one
  commander each (historical civs get real commanders; fantasy civs get
  culturally-coherent fictional ones drawn from their own established lore,
  matching this codebase's existing convention of using real IP names for
  civ/city content). `carthage` has no matching playable civ id (it's
  minor-civ-only) — Hannibal Barca lives in the universal pool instead.
- **Task 5's successful-defense hook did not need the turn-manager.ts
  round-end diff the plan sketched.** `city-capture-system.ts`'s
  `beginMajorCityAssault` already has two `'repelled-by-city-defense'`
  failure branches (intrinsic no-garrison city defense) — a strictly
  better hook site, since it fires at the moment of the triggering action
  like the other two bonuses, not batched at round end. Deliberately scoped
  to the no-garrison path only (a garrisoned city that kills its attacker
  already earns ordinary combat-XP progress through the shared kill-reward
  hook, so awarding this bonus there too would double-count).
- **A real bug was found and fixed during the second review pass** (not
  anticipated by the plan): `spawnGeneralForCiv`'s original "no capital →
  no-op" branch left a civ's pending choice permanently unresolvable if
  their capital was lost between the choice being queued and being opened
  (reachable in hot-seat, where several other civs' turns can pass in
  between) — since `maybeShowPendingGeneralChoice`'s panel is deliberately
  dismiss-less, this was an unrecoverable soft-lock. Fixed: the pending
  choice now always clears, even when no capital exists to spawn at (the
  candidate is simply forfeited, no General spawns).
- **User asked mid-implementation whether MR1.1 (road/rail bounded supply
  extension, contract §9) should have landed first.** Confirmed via spec
  grep that MR1.1 is real, documented, and still unimplemented, but
  verified it is not a functional dependency of MR3 — Generals only read
  the already-complete `unit.landSupply.state`, never the coverage-radius
  computation MR1.1 would extend. User chose to continue MR3 as planned;
  MR1.1 remains tracked as its own unchecked item on issue #544.

**Verification performed:**
- Full test suite: 524 files / 8716 tests passed, 3 skipped, 0 failed.
- Full production build: clean, no TypeScript errors.
- Pacing gates (`pacing-audit.test.ts`, `pacing-reference-economy.test.ts`):
  unchanged, both pass — Generals add no yields, only bounded non-economic
  progress points and occasional gold-tier city-capture/raze rewards that
  already existed before this MR.
- Second inline review pass across the full `origin/main..HEAD` diff (source
  files only) — found and fixed the soft-lock bug above; everything else
  checked out (reward-loop civilizations-update correctness, escort-cascade
  idempotency across combat/splash paths, generic before/after death-diff
  correctness for both escort-cascade and direct-target cases, hot-seat
  pending-choice civ-scoping).
- UI verification: relied on the jsdom test suite (5 tests asserting real
  rendered text/button structure/click behavior, mirroring
  `createBeastHoardPanel`'s already-shipped, already-visually-verified
  pattern exactly) rather than a live browser session — the pre-existing
  campaign-setup flow proved slow to navigate via automated clicks for a
  screen this MR does not touch, and the panel itself is plain DOM
  manipulation with no canvas/WebGL/complex-layout surface that jsdom
  assertions could plausibly miss.

**Contract §13-15 coverage:** confirmed against the table in Task 16 Step 3
above — every row has a corresponding implemented task. Passive
command/heroic abilities/AI are explicitly out of scope (MR4/MR5).
