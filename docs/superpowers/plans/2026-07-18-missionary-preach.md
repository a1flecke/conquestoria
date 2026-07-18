# Missionary Unit + Preach Action (Issue #592, MR5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do NOT use subagent-driven-development or dispatch any subagents/parallel Agent calls for this plan — this project's CLAUDE.md forbids it explicitly. Execute every task inline in the current session.**

**Goal:** Add a trainable `missionary` civilian unit and a `preach` action that lets players/AI actively push faith conversion, completing `missionary-zeal`'s tech promise ("Missionaries spread religion to conquered cities faster").

**Architecture:** Extend MR4's religion system (`religion-system.ts`, `religion-definitions.ts`, `CityFaith`) with an active-conversion path that sits alongside passive spread. The key structural change: `CityFaith.conversionProgress` moves from a single `{toReligionId, points}` slot to a per-religion `Record<religionId, points>` map, so a missionary's deliberate investment toward religion A is never silently discarded by an unrelated turn tick where ambient pressure points toward religion B — the two are now independent ledger entries that both accumulate against the same `CONVERSION_THRESHOLD`, and conversion resolves to whichever bucket crosses it. A new `conversionCooldownUntilTurn` field on `CityFaith` prevents rapid flip-flopping between *rival* faiths, while explicitly exempting the original owner's own faith so "re-convert a flipped city" keeps working. Missionary charges are baked in at unit-creation time (not read reactively) by teaching the one production-completion call site (`turn-manager.ts:353`) to check `civ.techState.completed` before calling `createUnit`, then overwriting the returned unit's `chargesRemaining`. Trainability threads a `followsOwnFaith: boolean` flag into `getTrainableUnitsForCity`, computed by each of its 7 call sites from data they already have in scope (mirroring how the function already computes `coastal` internally).

**Tech Stack:** TypeScript, Vitest, Canvas 2D (sprite pipeline unaffected — placeholder only this MR).

## Global Constraints

- `UNIT_CLASS_BY_TYPE.missionary = ['civilian']` — never fights, excluded from `general-mobilization`'s 0.85x military discount automatically via `isMilitaryUnitType`'s `!classes.includes('civilian')` check (verified at `src/systems/unit-modifier-definitions.ts:97`) — no extra wiring needed for that exclusion.
- Production cost **16**, movement **2**, no combat stats (strength 0).
- Charges: base 2, or 3 if owner completed `missionary-zeal` **at the moment the unit is created** — never recomputed later.
- `PREACH_POINTS = 50` (two charges converts a fresh city exactly, matching `CONVERSION_THRESHOLD = 100`).
- Occupied-city doubling: `missionary-zeal` owner + target city has `city.occupation != null` → Preach grants **100** instead of 50 (converts a conquered city in one call).
- `OCCUPATION_ACCRUAL = 5`/turn already exists in `religion-definitions.ts`, unused until this MR — wire into `processReligionTurn`.
- Preach is uncapped in volume (no per-turn empire-wide limit) but each **missionary** gets a personal cooldown after acting, and each **city** gets an anti-flip-flop cooldown after converting (scoped to block rival-religion conversions only — the original owner's own faith is always exempt, per the "re-convert a flipped city" use case).
- New constants (this MR, `religion-definitions.ts`): `MISSIONARY_COST = 16`, `MISSIONARY_BASE_CHARGES = 2`, `MISSIONARY_ZEAL_CHARGES = 3`, `PREACH_POINTS = 50`, `PREACH_OCCUPIED_DOUBLE = 100`, `MISSIONARY_ACTION_COOLDOWN_TURNS = 3` (unit can't preach again for 3 turns after preaching — reflects the "action + rest" framing), `CITY_CONVERSION_COOLDOWN_TURNS = 7` (city can't flip to a *different* rival religion for 7 turns after converting; owner's own faith is always exempt from this cooldown).
- No difficulty-mode (explorer/standard/veteran) scaling anywhere in this MR — matches MR4 precedent.
- Copy register: plain language, ages 7-43, no jargon — match MR4's boon-modal tone ("cannot be changed later" style, not "cooldown expires at tick N").
- `PRODUCTION_ICONS['missionary']` entry required or `tests/systems/city-system.test.ts` → `PRODUCTION_ICONS coverage` fails.
- Every new `Tech`/`Building`/`UNIT_DESCRIPTIONS` string touched must stay honest per `.claude/rules/content-description-honesty.md` — no claims beyond what's implemented.
- PR body must never contain `close[sd]?\s+#\d+|fix(e[sd])?\s+#\d+|resolve[sd]?\s+#\d+` (case-insensitive) — grep it before `gh pr create`. Reference #592/#587 only, never "closes #524".

---

## File Map (created/modified)

| File | Change |
|---|---|
| `src/core/types.ts` | Add `'missionary'` to `UnitType`; add `Unit.missionaryCooldownUntilTurn?: number`; change `CityFaith.conversionProgress` shape; add `CityFaith.conversionCooldownUntilTurn?: number` + `conversionCooldownExemptCivId?: string` |
| `src/systems/unit-modifier-definitions.ts` | `UNIT_CLASS_BY_TYPE.missionary = ['civilian']` |
| `src/systems/unit-system.ts` | `UNIT_DEFINITIONS.missionary`, `UNIT_DESCRIPTIONS.missionary` |
| `src/systems/city-system.ts` | `TRAINABLE_UNITS` entry, `PRODUCTION_ICONS.missionary`, `getTrainableUnitsForCity` signature (+`followsOwnFaith`), all internal call sites |
| `src/ai/ai-resource-marketplace.ts`, `src/ai/ai-production.ts` (x2), `src/systems/quest-objective-system.ts`, `src/systems/minor-civ-economy-system.ts`, `src/ui/city-panel.ts` (x2) | Update call sites of `getTrainableUnitsForCity` to compute+pass `followsOwnFaith` |
| `src/systems/religion-definitions.ts` | New constants listed above |
| `src/systems/religion-system.ts` | Restructure `conversionProgress` handling in `processReligionTurn`; add `getCityConversionPoints`/`applyCityConversionPoints` helpers; add `preach()`; add occupation accrual |
| `src/core/turn-manager.ts` | Bake missionary charges at creation (~:353) |
| `src/ui/selected-unit-info.ts` | Preach button + help text |
| `src/ui/unit-delete-confirmation-panel.ts` | Add optional `title` override |
| `src/ai/ai-production.ts` | Missionary production scoring (Fervor-weighted) |
| `src/ai/ai-unit-roles.ts` or a new `src/ai/ai-missionary-dispatch.ts` | Dispatch logic: own unconverted cities first, then friendly minors |
| `src/renderer/sprites/sprite-catalog.ts`, `docs/sprite-design-system.md` | Placeholder registration |
| `src/systems/tech-definitions-eras5-7.ts` | `missionary-zeal` `unlocks` text (~:266) |
| Tests: `tests/systems/religion-system.test.ts`, `tests/systems/religion-spread.test.ts` (rewrite existing assertions for new shape), `tests/systems/city-system.test.ts`, `tests/systems/unit-modifier-system.test.ts` (auto-covered by completeness), `tests/ai/ai-production.test.ts` or equivalent, `tests/ui/selected-unit-info.test.ts` | New + updated coverage |

---

### Task 1: Data model — `UnitType`, `Unit` cooldown field, `CityFaith` restructure

**Files:**
- Modify: `src/core/types.ts:340-342` (UnitType union), `:421` (Unit interface), `:1603-1608` (CityFaith interface)
- Test: `tests/systems/religion-system.test.ts` (new file section, or existing describe block)

**Interfaces:**
- Produces: `UnitType` now includes `'missionary'`. `Unit.missionaryCooldownUntilTurn?: number`. `CityFaith.conversionProgress?: Record<string, number>` (was `{toReligionId, points}`). `CityFaith.conversionCooldownUntilTurn?: number`. `CityFaith.conversionCooldownExemptCivId?: string` (the civ whose faith is always exempt from this city's cooldown — set to the city owner's civ id at the moment the cooldown starts).

- [ ] **Step 1: Add `'missionary'` to `UnitType` union**

Edit `src/core/types.ts:340-342`, insert `missionary` into the civilian cluster:

```typescript
export type UnitType =
  | 'settler' | 'worker' | 'scout' | 'warrior' | 'archer' | 'missionary'
  | 'swordsman' | 'pikeman' | 'musketeer' | 'galley' | 'trireme'
```

- [ ] **Step 2: Add cooldown field to `Unit`**

Edit `src/core/types.ts` near `:421` (right after the existing `chargesRemaining` line):

```typescript
  chargesRemaining?: number; // workers default to 2; omitted on legacy saves
  missionaryCooldownUntilTurn?: number; // set after preach(); missionary can't preach again until state.turn >= this
```

- [ ] **Step 3: Restructure `CityFaith.conversionProgress` and add cooldown fields**

Edit `src/core/types.ts:1603-1608`:

```typescript
export interface CityFaith {
  religionId: string;
  isHolyCity?: true;      // founding city — permanently immune to conversion, under ANY owner
  // Per-religion progress ledger (MR5, #592): keyed by candidate religionId, NOT a single
  // slot. This lets ambient passive pressure toward religion A accumulate independently of
  // missionary-driven preach progress toward religion B in the same city — previously a
  // single {toReligionId, points} slot meant a preach investment could be silently wiped
  // out the moment ambient pressure pointed elsewhere. Conversion fires for whichever
  // religionId's bucket first reaches CONVERSION_THRESHOLD.
  conversionProgress?: Record<string, number>;
  // MR5 anti-flip-flop guard: once set, no religionId OTHER than conversionCooldownExemptCivId's
  // faith may convert this city until state.turn >= conversionCooldownUntilTurn. The exempt
  // civ (the city's owner at the moment of the LAST conversion) can always re-convert its own
  // city immediately — this preserves "preach a flipped city back" as an owner privilege while
  // still stopping rival faiths from ping-ponging a border city turn after turn.
  conversionCooldownUntilTurn?: number;
  conversionCooldownExemptCivId?: string;
  // loyaltyProgress added by MR6 (#593)
}
```

- [ ] **Step 4: Run typecheck to confirm nothing else references the old `conversionProgress` shape yet (expected: religion-system.ts and religion-spread.test.ts will show as broken — that's Task 5/9's job to fix, just confirm scope here)**

Run: `bash scripts/run-with-mise.sh yarn build 2>&1 | grep -A2 "conversionProgress\|toReligionId" | head -60`
Expected: TypeScript errors in `src/systems/religion-system.ts` and possibly `src/ui/city-panel.ts` referencing `.toReligionId`/`.points` on the old shape — confirms the blast radius is exactly those two files (plus test files, which don't block `yarn build`). Do not fix yet; this step is a scope-confirmation checkpoint before Task 5 tackles it.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(religion): add missionary UnitType and restructure CityFaith conversion tracking"
```

---

### Task 2: Missionary unit definitions, classification, sprite placeholder

**Files:**
- Modify: `src/systems/unit-modifier-definitions.ts:9-40` (UNIT_CLASS_BY_TYPE)
- Modify: `src/systems/unit-system.ts:40-...` (UNIT_DEFINITIONS), `:641-...` (UNIT_DESCRIPTIONS)
- Modify: `src/renderer/sprites/sprite-catalog.ts:207-...` (UNIT_SPRITE_CATALOG) — reuse an existing civilian sprite component as placeholder (matches how other placeholder units are handled — verify pattern first)
- Modify: `docs/sprite-design-system.md` (Units table, `civilian` data-kind row group)
- Test: `tests/systems/unit-modifier-system.test.ts` (completeness test already covers this generically — no new test file needed, just confirm it passes)

**Interfaces:**
- Consumes: `UnitClass` type from `unit-modifier-definitions.ts` (Task 1 unaffected).
- Produces: `UNIT_DEFINITIONS.missionary: UnitDefinition`, `UNIT_DESCRIPTIONS.missionary: string`, `UNIT_CLASS_BY_TYPE.missionary: UnitClass[]`.

- [ ] **Step 1: Check how an existing placeholder unit's sprite entry is written (e.g. `observation_balloon`, marked `⚠️ placeholder` in the doc) to match the exact code pattern**

Run: `grep -n "observation_balloon" src/renderer/sprites/sprite-catalog.ts`
Expected: shows whether placeholders reuse an existing sprite component (e.g. `withMotion('observation_balloon', SomeFallbackSprite)`) or a dedicated placeholder function — copy that exact pattern for `missionary`.

- [ ] **Step 2: Add `UNIT_CLASS_BY_TYPE.missionary`**

Edit `src/systems/unit-modifier-definitions.ts`, add alongside `worker: ['civilian'],`:

```typescript
  missionary: ['civilian'],
```

- [ ] **Step 3: Add `UNIT_DEFINITIONS.missionary`**

Edit `src/systems/unit-system.ts`, add alongside the `worker` entry:

```typescript
  missionary: {
    type: 'missionary', name: 'Missionary', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 16,
  },
```

- [ ] **Step 4: Add `UNIT_DESCRIPTIONS.missionary`**

Edit `src/systems/unit-system.ts`, add alongside the `worker` description:

```typescript
  missionary: 'Civilian unit that spreads your faith. Preach in a city to push it toward your religion — preaching a city your own faith already lost brings it back fastest. Missionaries start with 2 charges (3 once Missionary Zeal is researched) and are used up after the last charge.',
```

- [ ] **Step 5: Register sprite placeholder using the pattern found in Step 1**

Edit `src/renderer/sprites/sprite-catalog.ts` — add the `missionary:` line to `UNIT_SPRITE_CATALOG` using whatever placeholder pattern Step 1 revealed (e.g. reusing `WorkerSprite` component with a distinct `data-kind` tag, since missionary is civilian and bespoke art ships in MR7/#594).

- [ ] **Step 6: Add doc table row**

Edit `docs/sprite-design-system.md`, in the Units table, add:

```
| missionary | ⚠️ placeholder | civilian |
```

- [ ] **Step 7: Run typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: no new errors from this task's changes (existing conversionProgress errors from Task 1 still present — that's expected until Task 5).

- [ ] **Step 8: Commit**

```bash
git add src/systems/unit-modifier-definitions.ts src/systems/unit-system.ts src/renderer/sprites/sprite-catalog.ts docs/sprite-design-system.md
git commit -m "feat(religion): missionary unit definition, classification, sprite placeholder"
```

---

### Task 3: Trainability gate — thread `followsOwnFaith` through `getTrainableUnitsForCity`

**Files:**
- Modify: `src/systems/city-system.ts:1683-1694` (`getTrainableUnitsForCity`), `TRAINABLE_UNITS` array (~:1093-1104 area), `PRODUCTION_ICONS` (~:1381+)
- Modify (call sites, add `followsOwnFaith` computation before calling): `src/ui/city-panel.ts:540,569`, `src/ai/ai-resource-marketplace.ts:44`, `src/ai/ai-production.ts:74,270`, `src/systems/quest-objective-system.ts:105`, `src/systems/minor-civ-economy-system.ts:289`
- Test: `tests/systems/city-system.test.ts` (new describe block `missionary trainability`)

**Interfaces:**
- Consumes: `state.cityFaith`, `state.religions` (Task 1's types), `city.owner`, `state.civilizations[owner]`.
- Produces: `getTrainableUnitsForCity(city, completedTechs, map, civType?, availableResources?, followsOwnFaith?: boolean): TrainableUnitEntry[]` — new optional 6th param, defaults to `false` if omitted (fail-closed: missionary simply won't show as trainable rather than silently becoming available, matching the game-balance.md caution about missed call sites). Also exports a new helper `cityFollowsOwnFaith(state: GameState, city: City): boolean` that every call site should use to compute the flag consistently.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/city-system.test.ts`:

```typescript
describe('missionary trainability (#592)', () => {
  function setupReligionCiv(state: GameState, civId: string, cityId: string) {
    const religionId = `religion-${civId}`;
    return {
      ...state,
      religions: { ...(state.religions ?? {}), [religionId]: { id: religionId, name: 'Test Faith', ownerCivId: civId, foundedTurn: 1 } },
      cityFaith: { ...(state.cityFaith ?? {}), [cityId]: { religionId } },
    };
  }

  it('is NOT trainable without a founded religion', () => {
    const state = makeTestState(); // existing test helper in this file
    const city = state.cities['city-1'];
    city.buildings = ['temple'];
    const trainable = getTrainableUnitsForCity(city, [], state.map, undefined, undefined, false);
    expect(trainable.find(u => u.type === 'missionary')).toBeUndefined();
  });

  it('is NOT trainable without a Temple, even with religion + own faith', () => {
    let state = makeTestState();
    const civId = state.cities['city-1'].owner;
    state = setupReligionCiv(state, civId, 'city-1');
    const city = { ...state.cities['city-1'], buildings: [] };
    const trainable = getTrainableUnitsForCity(city, [], state.map, undefined, undefined, true);
    expect(trainable.find(u => u.type === 'missionary')).toBeUndefined();
  });

  it('is NOT trainable when the city follows a foreign faith', () => {
    let state = makeTestState();
    const civId = state.cities['city-1'].owner;
    state = setupReligionCiv(state, civId, 'city-1');
    const city = { ...state.cities['city-1'], buildings: ['temple'] };
    // followsOwnFaith computed as false by caller because cityFaith.religionId belongs to a different civ
    const trainable = getTrainableUnitsForCity(city, [], state.map, undefined, undefined, false);
    expect(trainable.find(u => u.type === 'missionary')).toBeUndefined();
  });

  it('IS trainable when religion founded + own faith + Temple all hold', () => {
    let state = makeTestState();
    const civId = state.cities['city-1'].owner;
    state = setupReligionCiv(state, civId, 'city-1');
    const city = { ...state.cities['city-1'], buildings: ['temple'] };
    const trainable = getTrainableUnitsForCity(city, [], state.map, undefined, undefined, true);
    expect(trainable.find(u => u.type === 'missionary')).toBeDefined();
  });
});
```

(Adjust `makeTestState()`/city-id literals to match whatever test helper this file already uses — grep `tests/systems/city-system.test.ts` for its existing state-builder helper name before writing this; do not invent a new one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "missionary trainability"`
Expected: FAIL — `missionary` not in `TRAINABLE_UNITS`, and `getTrainableUnitsForCity` doesn't accept a 6th param yet.

- [ ] **Step 3: Add `TRAINABLE_UNITS` entry and `PRODUCTION_ICONS` entry**

Edit `src/systems/city-system.ts`, add alongside the `worker`/`settler` entries:

```typescript
  { type: 'missionary', name: 'Missionary', cost: 16, trainedFromBuilding: 'temple' },
```

Edit `PRODUCTION_ICONS` (~:1381+):

```typescript
  missionary: '🙏',
```

- [ ] **Step 4: Update `getTrainableUnitsForCity` signature and add `cityFollowsOwnFaith` helper**

Edit `src/systems/city-system.ts:1683-1694`:

```typescript
export function cityFollowsOwnFaith(state: GameState, city: City): boolean {
  const faith = state.cityFaith?.[city.id];
  if (!faith) return false;
  const religion = state.religions?.[faith.religionId];
  return !!religion && religion.ownerCivId === city.owner;
}

export function getTrainableUnitsForCity(
  city: City,
  completedTechs: string[],
  map: GameMap,
  civType?: string,
  availableResources?: Set<ResourceType>,
  followsOwnFaith: boolean = false,
): TrainableUnitEntry[] {
  const coastal = isCityCoastal(city, map);
  return getTrainableUnitsForCiv(completedTechs, civType, availableResources)
    .filter(unit => !unit.coastalRequired || coastal)
    .filter(unit => !unit.trainedFromBuilding || (city.buildings ?? []).includes(unit.trainedFromBuilding))
    .filter(unit => unit.type !== 'missionary' || followsOwnFaith);
}
```

Note: `trainedFromBuilding: 'temple'` already handles the Temple-gate via the existing filter — `followsOwnFaith` only needs to gate the religion+own-faith conjunction, since "no religion at all" and "foreign faith" both simply fail `cityFollowsOwnFaith`'s check (no religion → no `faith` entry → `false`; foreign faith → `religion.ownerCivId !== city.owner` → `false`).

- [ ] **Step 5: Update all 7 call sites to compute and pass `followsOwnFaith`**

For each call site, insert `cityFollowsOwnFaith(state, city)` (or the local equivalent — some sites may only have `civId`/`cityId` in scope, in which case pass `cityFollowsOwnFaith(state, city)` after resolving `city` from `state.cities[cityId]`):

`src/ui/city-panel.ts:540`:
```typescript
const availableUnits = getTrainableUnitsForCity(city, completedTechs, state.map, currentCiv.civType, playerResources, cityFollowsOwnFaith(state, city));
```

`src/ui/city-panel.ts:569`:
```typescript
const allTechUnlockedUnits = getTrainableUnitsForCity(city, completedTechs, state.map, currentCiv.civType, undefined, cityFollowsOwnFaith(state, city));
```

`src/ai/ai-resource-marketplace.ts:44` and `src/ai/ai-production.ts:74,270`: same pattern — add `cityFollowsOwnFaith(state, city)` as the trailing argument, importing `cityFollowsOwnFaith` from `@/systems/city-system` in each file that doesn't already import it.

`src/systems/quest-objective-system.ts:105`: same pattern.

`src/systems/minor-civ-economy-system.ts:289`: minor civs never found religions (verify with a quick grep: `grep -n "minorCiv.*religion\|religion.*minorCiv" src/systems/*.ts` — expect no hits), so pass `false` explicitly with a one-line comment (`// minor civs never found a religion — missionary never trainable here`) rather than importing the full helper.

- [ ] **Step 6: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "missionary trainability"`
Expected: PASS (all 4 cases).

- [ ] **Step 7: Run full build to catch any missed call site**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: no TypeScript errors about `getTrainableUnitsForCity` arity (the 6th param is optional, so a missed site won't error — cross-check by grepping again: `grep -rn "getTrainableUnitsForCity(" src/ | wc -l` should still be 7 call sites, all touched).

- [ ] **Step 8: Commit**

```bash
git add src/systems/city-system.ts src/ui/city-panel.ts src/ai/ai-resource-marketplace.ts src/ai/ai-production.ts src/systems/quest-objective-system.ts src/systems/minor-civ-economy-system.ts tests/systems/city-system.test.ts
git commit -m "feat(religion): missionary trainability gate (religion + own faith + Temple)"
```

---

### Task 4: Charges baked in at unit creation (turn-manager.ts)

**Files:**
- Modify: `src/core/turn-manager.ts:353` (unit-creation call site)
- Test: `tests/systems/turn-manager.test.ts` or wherever production-completion is already tested — grep first: `grep -rln "createUnit(result.completedUnit" tests/` to find the right test file.

**Interfaces:**
- Consumes: `createUnit(type, owner, position, counters, bonusEffect?): Unit` (unchanged signature, Task unaffected).
- Produces: after this task, a missionary `Unit` created via production completion has `chargesRemaining` set to 3 if `civ.techState.completed.includes('missionary-zeal')` at that exact moment, else 2.

- [ ] **Step 1: Write the failing test**

Find the existing test file covering `city:unit-trained` / production completion (from the grep above) and add:

```typescript
it('missionary gets 3 charges if missionary-zeal is completed at build time, else 2', () => {
  let state = /* existing test-state builder used in this file, with a city queued to produce 'missionary' */;
  // civ WITHOUT missionary-zeal
  let result = processTurn(state, bus); // or whatever this file's existing turn-advance helper is named
  const missionaryNoTech = Object.values(result.units).find(u => u.type === 'missionary');
  expect(missionaryNoTech?.chargesRemaining).toBe(2);

  // civ WITH missionary-zeal completed before the same production completes
  state = { ...state, civilizations: { ...state.civilizations, [civId]: { ...state.civilizations[civId], techState: { ...state.civilizations[civId].techState, completed: [...state.civilizations[civId].techState.completed, 'missionary-zeal'] } } } };
  result = processTurn(state, bus);
  const missionaryWithTech = Object.values(result.units).find(u => u.type === 'missionary');
  expect(missionaryWithTech?.chargesRemaining).toBe(3);
});
```

(Adjust to match this file's actual state-setup and turn-advance helper names — grep the file first, do not guess names.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test -- turn-manager -t "missionary gets 3 charges"`
Expected: FAIL — charges default to `undefined` (createUnit's default: `type === 'worker' ? 2 : undefined`) for missionary today.

- [ ] **Step 3: Bake charges in at the call site**

Edit `src/core/turn-manager.ts` at the block around line 353:

```typescript
      if (result.completedUnit) {
        bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
        const newUnit = createUnit(result.completedUnit, civId, city.position, newState.idCounters, civDef?.bonusEffect);
        if (result.completedUnit === 'missionary') {
          newUnit.chargesRemaining = civ.techState.completed.includes('missionary-zeal')
            ? MISSIONARY_ZEAL_CHARGES
            : MISSIONARY_BASE_CHARGES;
        }
        const unitDef = UNIT_DEFINITIONS[result.completedUnit];
```

Add the import at the top of `turn-manager.ts`:

```typescript
import { MISSIONARY_BASE_CHARGES, MISSIONARY_ZEAL_CHARGES } from './religion-definitions';
```

- [ ] **Step 4: Add the two charge constants to `religion-definitions.ts`** (defined here, in this task, before Step 3's import is used — Task 5 adds the remaining preach/cooldown constants separately and does not redefine these two)

Edit `src/systems/religion-definitions.ts`, add near `OCCUPATION_ACCRUAL`:

```typescript
export const MISSIONARY_COST = 16;
export const MISSIONARY_BASE_CHARGES = 2;
export const MISSIONARY_ZEAL_CHARGES = 3;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test -- turn-manager -t "missionary gets 3 charges"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/turn-manager.ts src/systems/religion-definitions.ts tests/systems/turn-manager.test.ts
git commit -m "feat(religion): bake missionary charges in at creation from build-time tech state"
```

---

### Task 5: `religion-definitions.ts` — remaining constants (preach points, cooldowns)

**Files:**
- Modify: `src/systems/religion-definitions.ts`

**Interfaces:**
- Produces: `PREACH_POINTS = 50`, `PREACH_OCCUPIED_DOUBLE = 100`, `MISSIONARY_ACTION_COOLDOWN_TURNS = 3`, `CITY_CONVERSION_COOLDOWN_TURNS = 7`.

- [ ] **Step 1: Add constants**

Edit `src/systems/religion-definitions.ts`, add near `OCCUPATION_ACCRUAL`:

```typescript
// #592 MR5: active conversion via missionary preach.
export const PREACH_POINTS = 50;
export const PREACH_OCCUPIED_DOUBLE = 100;
// A missionary that just preached needs to "rest" before preaching again — reflects the
// action itself plus recovery, same framing as a worker's multi-turn improvement build.
export const MISSIONARY_ACTION_COOLDOWN_TURNS = 3;
// Anti-flip-flop guard: once a city converts, it can't flip to a DIFFERENT rival religion
// again for this many turns. The city's own owner (at the moment of conversion) is always
// exempt, so preaching a just-flipped city back to its owner's faith is never blocked by
// this cooldown — see CityFaith.conversionCooldownExemptCivId.
export const CITY_CONVERSION_COOLDOWN_TURNS = 7;
```

- [ ] **Step 2: No test needed for bare constants — proceed directly to typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: clean (constants unused so far is fine — Task 4 and Task 6 consume them next).

- [ ] **Step 3: Commit**

```bash
git add src/systems/religion-definitions.ts
git commit -m "feat(religion): add preach and cooldown constants"
```

---

### Task 6: Restructure `processReligionTurn` for per-religion progress map + occupation accrual

**Files:**
- Modify: `src/systems/religion-system.ts:143-183` (`processReligionTurn`)
- Modify: `tests/systems/religion-spread.test.ts` (rewrite 5 existing assertions that use the old `{toReligionId, points}` shape — lines ~103, 114, 131, 144, 168 per the drift-check grep)

**Interfaces:**
- Consumes: `CityFaith.conversionProgress?: Record<string, number>` (Task 1).
- Produces: `getCityConversionPoints(faith: CityFaith | undefined, religionId: string): number` (reads a bucket, 0 if absent) and `applyCityConversionPoints(cityFaith: CityFaith | undefined, religionId: string, delta: number): { cityFaith: CityFaith; converted: boolean }` (adds points to one bucket, returns whether it crossed `CONVERSION_THRESHOLD`) — both exported from `religion-system.ts`, reused by `preach()` in Task 7 so accrual and preach share one code path.

- [ ] **Step 1: Write the failing test — rewrite the 5 existing assertions for the new shape**

Edit `tests/systems/religion-spread.test.ts`. Example rewrite for the assertion at line ~103:

```typescript
// OLD: expect(next.cityFaith!['own-neighbor'].conversionProgress).toEqual({ toReligionId: `religion-${civId}`, points: 15 });
// NEW:
expect(next.cityFaith!['own-neighbor'].conversionProgress).toEqual({ [`religion-${civId}`]: 15 });
```

Apply the same transform to the other 4 assertions (~114, 131, 144, 168), and the seed states at ~114/131 that construct `conversionProgress: { toReligionId: ..., points: ... }` — change those to `conversionProgress: { [religionId]: points }` object literals.

Add one NEW test proving the actual bug fix — independent buckets surviving an ambient-target switch:

```typescript
it('preach-style progress toward religion A survives a later tick where ambient pressure points to religion B (#592)', () => {
  let state = /* seed: city with existing conversionProgress = { [religionA]: 40 }, and ambient geography now favors religionB */;
  const next = processReligionTurn(state, bus);
  // religionA's bucket must still show 40 — untouched by this tick's religionB accrual
  expect(next.cityFaith!['city-x'].conversionProgress?.[religionAId]).toBe(40);
  // religionB's bucket accrues independently
  expect(next.cityFaith!['city-x'].conversionProgress?.[religionBId]).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test -- religion-spread.test.ts`
Expected: FAIL on the old-shape assertions (still asserting old code) and the new test (feature not yet implemented).

- [ ] **Step 3: Add `getCityConversionPoints` / `applyCityConversionPoints` helpers and rewrite `processReligionTurn`**

Edit `src/systems/religion-system.ts`, replace the whole function body (lines 143-183) and add the two new exported helpers above it:

```typescript
export function getCityConversionPoints(faith: CityFaith | undefined, religionId: string): number {
  return faith?.conversionProgress?.[religionId] ?? 0;
}

// Adds `delta` points to religionId's own bucket in cityFaith.conversionProgress, independent
// of any other religion's bucket. Returns the updated CityFaith and whether this delta pushed
// that bucket to/over CONVERSION_THRESHOLD (caller decides whether/how to apply the actual flip).
export function applyCityConversionPoints(
  faith: CityFaith | undefined,
  religionId: string,
  delta: number,
): { cityFaith: CityFaith; converted: boolean } {
  const currentPoints = getCityConversionPoints(faith, religionId);
  const nextPoints = currentPoints + delta;
  const converted = nextPoints >= CONVERSION_THRESHOLD;
  const nextProgress = { ...(faith?.conversionProgress ?? {}), [religionId]: nextPoints };
  return {
    cityFaith: { ...(faith ?? { religionId: faith?.religionId ?? religionId }), conversionProgress: nextProgress },
    converted,
  };
}

// Passive faith spread + conversion (#591 MR4, restructured #592 MR5 for independent
// per-religion progress buckets — see CityFaith.conversionProgress doc comment in types.ts).
// Holy cities never accrue. Cities under an active conversionCooldownUntilTurn only accrue
// toward conversionCooldownExemptCivId's religion (or their current religion, if it's not
// the exempt civ's) — rival religions' passive pressure is paused, not reset, during cooldown.
export function processReligionTurn(state: GameState, bus: EventBus): GameState {
  const cityFaithMap = state.cityFaith ?? {};
  let cityFaith = { ...cityFaithMap };
  let changed = false;

  for (const cityId of Object.keys(state.cities).sort()) {
    const faith = cityFaith[cityId];
    if (faith?.isHolyCity) continue;

    const pressure = getStrongestPressure(state, cityId);
    if (!pressure) continue;
    if (faith?.religionId === pressure.religionId && !getCityConversionPoints(faith, pressure.religionId)) continue;

    const cooldownActive = (faith?.conversionCooldownUntilTurn ?? 0) > state.turn;
    const exemptCivId = faith?.conversionCooldownExemptCivId;
    const pressureReligion = state.religions?.[pressure.religionId];
    const pressureIsExempt = !!exemptCivId && pressureReligion?.ownerCivId === exemptCivId;
    if (cooldownActive && !pressureIsExempt) continue; // rival religion's passive pressure is paused during cooldown

    const { cityFaith: updatedFaith, converted } = applyCityConversionPoints(faith, pressure.religionId, pressure.accrual);

    if (converted) {
      const fromReligionId = faith?.religionId;
      const cityOwner = state.cities[cityId]?.owner;
      cityFaith = {
        ...cityFaith,
        [cityId]: {
          religionId: pressure.religionId,
          conversionCooldownUntilTurn: state.turn + CITY_CONVERSION_COOLDOWN_TURNS,
          conversionCooldownExemptCivId: cityOwner,
        },
      };
      changed = true;
      bus.emit('religion:city-converted', { cityId, toReligionId: pressure.religionId, fromReligionId });
    } else {
      cityFaith = {
        ...cityFaith,
        [cityId]: { ...updatedFaith, religionId: faith?.religionId ?? pressure.religionId },
      };
      changed = true;
    }
  }

  return processOccupationAccrual(changed ? { ...state, cityFaith } : state, bus);
}

// #592 MR5: cities under occupation accrue toward the OCCUPYING civ's faith every turn,
// independent of geography/trade pressure — this is what makes missionary-zeal's doubled
// preach on occupied cities land on top of a baseline that's already moving.
function processOccupationAccrual(state: GameState, bus: EventBus): GameState {
  let cityFaith = { ...(state.cityFaith ?? {}) };
  let changed = false;

  for (const [cityId, city] of Object.entries(state.cities)) {
    if (!city.occupation) continue;
    const occupierReligion = Object.values(state.religions ?? {}).find(r => r.ownerCivId === city.owner);
    if (!occupierReligion) continue;
    const faith = cityFaith[cityId];
    if (faith?.isHolyCity) continue;

    const { cityFaith: updatedFaith, converted } = applyCityConversionPoints(faith, occupierReligion.id, OCCUPATION_ACCRUAL);
    if (converted) {
      const fromReligionId = faith?.religionId;
      cityFaith = {
        ...cityFaith,
        [cityId]: {
          religionId: occupierReligion.id,
          conversionCooldownUntilTurn: state.turn + CITY_CONVERSION_COOLDOWN_TURNS,
          conversionCooldownExemptCivId: city.owner,
        },
      };
      bus.emit('religion:city-converted', { cityId, toReligionId: occupierReligion.id, fromReligionId });
    } else {
      cityFaith = { ...cityFaith, [cityId]: { ...updatedFaith, religionId: faith?.religionId ?? occupierReligion.id } };
    }
    changed = true;
  }

  return changed ? { ...state, cityFaith } : state;
}
```

Add the two new constant imports at the top of `religion-system.ts`:

```typescript
import {
  NAME_CANDIDATES, NEUTRAL_NAME_CANDIDATES, CONVERSION_THRESHOLD,
  OWN_CITY_ACCRUAL, FOREIGN_ADJACENT_ACCRUAL, FOREIGN_ADJACENT_CAP,
  TRADE_ROUTE_ACCRUAL, FERVOR_MULTIPLIER, TITHES_CAP, OCCUPATION_ACCRUAL,
  CITY_CONVERSION_COOLDOWN_TURNS,
} from './religion-definitions';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test -- religion-spread.test.ts religion-system.test.ts`
Expected: PASS.

- [ ] **Step 5: Add occupation-accrual-specific test**

Add to `tests/systems/religion-system.test.ts`:

```typescript
it('occupied city accrues OCCUPATION_ACCRUAL/turn toward the occupier faith (#592)', () => {
  let state = /* seed: civA owns civB's former capital under occupation, civA has founded a religion */;
  const before = getCityConversionPoints(state.cityFaith?.['occupied-city'], `religion-${civAId}`);
  const next = processReligionTurn(state, bus);
  const after = getCityConversionPoints(next.cityFaith?.['occupied-city'], `religion-${civAId}`);
  expect(after - before).toBe(OCCUPATION_ACCRUAL);
});

it('occupation accrual stops once occupation ends', () => {
  let state = /* same seed as above, then occupation cleared (city.occupation = undefined) */;
  const before = getCityConversionPoints(state.cityFaith?.['occupied-city'], `religion-${civAId}`);
  const next = processReligionTurn(state, bus);
  const after = getCityConversionPoints(next.cityFaith?.['occupied-city'], `religion-${civAId}`);
  expect(after).toBe(before); // no growth — occupation.turnsRemaining hit 0 elsewhere clears city.occupation
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test -- religion-system.test.ts -t "occupied city accrues"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/systems/religion-system.ts tests/systems/religion-spread.test.ts tests/systems/religion-system.test.ts
git commit -m "feat(religion): per-religion conversion progress buckets + occupation passive pressure"
```

---

### Task 7: `preach()` action

**Files:**
- Modify: `src/systems/religion-system.ts` (add `preach()`)
- Test: `tests/systems/religion-system.test.ts`

**Interfaces:**
- Consumes: `applyCityConversionPoints`, `getCityConversionPoints` (Task 6), `Unit.missionaryCooldownUntilTurn` (Task 1), `Unit.chargesRemaining` (existing generic field).
- Produces: `preach(state: GameState, unitId: string, cityId: string, bus: EventBus): { state: GameState; ok: true; converted: boolean; unitConsumed: boolean } | { state: GameState; ok: false; reason: 'not-missionary' | 'no-charges' | 'on-cooldown' | 'holy-city' | 'at-war' | 'undiscovered' }`.

- [ ] **Step 1: Write the failing tests — full matrix from the issue**

Add to `tests/systems/religion-system.test.ts`:

```typescript
describe('preach() (#592)', () => {
  // Shared fixture builder — adjust to this file's existing state-seed helper.
  function seedMissionaryScenario(overrides: Partial<{ atWar: boolean; holyCity: boolean; occupied: boolean; zeal: boolean; discovered: boolean }> = {}) { /* ... build state with owner civ, a missionary unit with 2 charges, a target city ... */ }

  it('grants PREACH_POINTS (50) toward a freshly-founded target city, not doubled', () => {
    const { state, bus, unitId, cityId, civId } = seedMissionaryScenario();
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(true);
    expect(getCityConversionPoints(result.state.cityFaith?.[cityId], `religion-${civId}`)).toBe(50);
  });

  it('grants PREACH_OCCUPIED_DOUBLE (100) and converts outright when target is occupied AND owner has missionary-zeal', () => {
    const { state, bus, unitId, cityId, civId } = seedMissionaryScenario({ occupied: true, zeal: true });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok && result.converted).toBe(true);
    expect(result.state.cityFaith?.[cityId].religionId).toBe(`religion-${civId}`);
  });

  it('grants only PREACH_POINTS (50, not doubled) when occupied but owner lacks missionary-zeal', () => {
    const { state, bus, unitId, cityId, civId } = seedMissionaryScenario({ occupied: true, zeal: false });
    const result = preach(state, unitId, cityId, bus);
    expect(getCityConversionPoints(result.state.cityFaith?.[cityId], `religion-${civId}`)).toBe(50);
  });

  it('grants only PREACH_POINTS (50) when owner has missionary-zeal but target is NOT occupied', () => {
    const { state, bus, unitId, cityId, civId } = seedMissionaryScenario({ occupied: false, zeal: true });
    const result = preach(state, unitId, cityId, bus);
    expect(getCityConversionPoints(result.state.cityFaith?.[cityId], `religion-${civId}`)).toBe(50);
  });

  it('refuses to preach a holy city', () => {
    const { state, bus, unitId, cityId } = seedMissionaryScenario({ holyCity: true });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('holy-city');
  });

  it('refuses to preach a city owned by a civ the missionary owner is at war with', () => {
    const { state, bus, unitId, cityId } = seedMissionaryScenario({ atWar: true });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('at-war');
  });

  it('refuses to preach an undiscovered city', () => {
    const { state, bus, unitId, cityId } = seedMissionaryScenario({ discovered: false });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('undiscovered');
  });

  it('consumes one charge per preach and marks the unit for consumption at 0', () => {
    const { state, bus, unitId, cityId } = seedMissionaryScenario(); // starts at 2 charges
    const afterFirst = preach(state, unitId, cityId, bus);
    expect(afterFirst.ok && afterFirst.state.units[unitId]?.chargesRemaining).toBe(1);
    expect(afterFirst.ok && afterFirst.unitConsumed).toBe(false);
    // second preach must wait out MISSIONARY_ACTION_COOLDOWN_TURNS — advance state.turn manually for the test
    const cooledDownState = { ...afterFirst.state, turn: afterFirst.state.turn + MISSIONARY_ACTION_COOLDOWN_TURNS };
    const afterSecond = preach(cooledDownState, unitId, cityId, bus);
    expect(afterSecond.ok && afterSecond.state.units[unitId]).toBeUndefined(); // consumed at 0 charges
    expect(afterSecond.ok && afterSecond.unitConsumed).toBe(true);
  });

  it('refuses to preach again before the personal cooldown elapses', () => {
    const { state, bus, unitId, cityId } = seedMissionaryScenario();
    const first = preach(state, unitId, cityId, bus);
    const second = preach(first.state, unitId, cityId, bus); // same turn, cooldown active
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('on-cooldown');
  });

  it('own cities are a valid preach target (re-convert a flipped city)', () => {
    const { state, bus, unitId, cityId, civId } = seedMissionaryScenario(); // city already owned by civId but flipped to a rival faith
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test -- religion-system.test.ts -t "preach"`
Expected: FAIL — `preach` not exported yet.

- [ ] **Step 3: Implement `preach()`**

Add to `src/systems/religion-system.ts`:

```typescript
export type PreachFailureReason = 'not-missionary' | 'no-charges' | 'on-cooldown' | 'holy-city' | 'at-war' | 'undiscovered';

export type PreachResult =
  | { ok: true; state: GameState; converted: boolean; unitConsumed: boolean }
  | { ok: false; state: GameState; reason: PreachFailureReason };

export function preach(state: GameState, unitId: string, cityId: string, bus: EventBus): PreachResult {
  const unit = state.units[unitId];
  const city = state.cities[cityId];
  if (!unit || unit.type !== 'missionary' || !city) {
    return { ok: false, state, reason: 'not-missionary' };
  }
  if ((unit.chargesRemaining ?? 0) <= 0) return { ok: false, state, reason: 'no-charges' };
  if ((unit.missionaryCooldownUntilTurn ?? 0) > state.turn) return { ok: false, state, reason: 'on-cooldown' };

  const faith = state.cityFaith?.[cityId];
  if (faith?.isHolyCity) return { ok: false, state, reason: 'holy-city' };

  const owner = state.civilizations[unit.owner];
  if (!owner) return { ok: false, state, reason: 'not-missionary' };

  const atWar = (owner.diplomacy.atWarWith ?? []).includes(city.owner);
  if (atWar) return { ok: false, state, reason: 'at-war' };

  const isDiscovered = owner.discoveredCivIds?.includes(city.owner) || city.owner === unit.owner || owner.discoveredCities?.includes(cityId);
  // NOTE: verify the exact discovery-tracking field name against this codebase before
  // finalizing — grep `discoveredCiv|discoveredCit` in types.ts/civ-system.ts; MR4 used a
  // similar discovery gate for Sacred Council founding notifications (commit 97360d1f),
  // reuse that exact helper/field rather than inventing a new one here.
  if (!isDiscovered) return { ok: false, state, reason: 'undiscovered' };

  const religion = Object.values(state.religions ?? {}).find(r => r.ownerCivId === unit.owner);
  if (!religion) return { ok: false, state, reason: 'not-missionary' };

  const hasZeal = owner.techState.completed.includes('missionary-zeal');
  const isDoubled = hasZeal && !!city.occupation;
  const pointsGranted = isDoubled ? PREACH_OCCUPIED_DOUBLE : PREACH_POINTS;

  const { cityFaith: updatedFaith, converted } = applyCityConversionPoints(faith, religion.id, pointsGranted);

  let cityFaith = { ...(state.cityFaith ?? {}) };
  if (converted) {
    cityFaith = {
      ...cityFaith,
      [cityId]: {
        religionId: religion.id,
        conversionCooldownUntilTurn: state.turn + CITY_CONVERSION_COOLDOWN_TURNS,
        conversionCooldownExemptCivId: city.owner,
      },
    };
    bus.emit('religion:city-converted', { cityId, toReligionId: religion.id, fromReligionId: faith?.religionId });
  } else {
    cityFaith = { ...cityFaith, [cityId]: { ...updatedFaith, religionId: faith?.religionId ?? religion.id } };
  }

  const chargesRemaining = (unit.chargesRemaining ?? 0) - 1;
  const unitConsumed = chargesRemaining <= 0;

  let units = state.units;
  if (unitConsumed) {
    const { [unitId]: _removed, ...rest } = state.units;
    units = rest;
  } else {
    units = {
      ...state.units,
      [unitId]: { ...unit, chargesRemaining, missionaryCooldownUntilTurn: state.turn + MISSIONARY_ACTION_COOLDOWN_TURNS },
    };
  }

  let civilizations = state.civilizations;
  if (unitConsumed) {
    civilizations = {
      ...state.civilizations,
      [unit.owner]: { ...owner, units: owner.units.filter(id => id !== unitId) },
    };
  }

  bus.emit('religion:preached', { cityId, unitId, civId: unit.owner, points: pointsGranted, unitConsumed });

  return {
    ok: true,
    state: { ...state, cityFaith, units, civilizations },
    converted,
    unitConsumed,
  };
}
```

Add the constant imports (`PREACH_POINTS`, `PREACH_OCCUPIED_DOUBLE`, `MISSIONARY_ACTION_COOLDOWN_TURNS`) to the existing import block from `religion-definitions`.

**Before finalizing this step**, grep the exact discovery-check helper MR4 used for Sacred Council's founding notification gate (per the drift-check note in the issue: "add missing religion:city-converted notification" commit `97360d1f`) and replace the placeholder `isDiscovered` line with that exact helper/field — do not invent new discovery-tracking state.

Also add `'religion:preached'` to the `GameEvents` type map in `src/core/types.ts` if it doesn't already exist — grep first: `grep -n "'religion:" src/core/types.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test -- religion-system.test.ts -t "preach"`
Expected: PASS (all cases in the matrix).

- [ ] **Step 5: Commit**

```bash
git add src/systems/religion-system.ts src/core/types.ts tests/systems/religion-system.test.ts
git commit -m "feat(religion): preach() action with exact-point matrix, charge consumption, cooldowns"
```

---

### Task 8: UI — Preach button, confirmation-panel title override

**Files:**
- Modify: `src/ui/unit-delete-confirmation-panel.ts` (optional `title` field)
- Modify: `src/ui/selected-unit-info.ts` (Preach button, charges display, help text)
- Test: `tests/ui/selected-unit-info.test.ts` (grep for exact filename first)

**Interfaces:**
- Consumes: `preach()` from Task 7, `createGameButton` from `src/ui/ui-kit.ts` (per `.claude/skills/button-styling.md` — **invoke that skill before writing the button code in this task**), `createUnitDeleteConfirmationPanel`.
- Produces: `SelectedUnitInfoCallbacks.onPreach?: (unitId: string, cityId: string) => void`.

- [ ] **Step 1: Invoke the button-styling skill** (do this before writing any button code)

- [ ] **Step 2: Add optional `title` to `UnitDeleteConfirmationConfig`**

Edit `src/ui/unit-delete-confirmation-panel.ts`:

```typescript
export interface UnitDeleteConfirmationConfig {
  unitName: string;
  title?: string;
  bodyText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

And change the title line:

```typescript
  title.textContent = config.title ?? `Delete ${config.unitName}?`;
```

- [ ] **Step 3: Write the failing test for the button + confirmation copy**

Add to `tests/ui/selected-unit-info.test.ts` (grep the file's existing pattern for worker action buttons first, mirror it exactly):

```typescript
it('shows a Preach button with help text for a missionary adjacent to an eligible city, and calls onPreach on click', () => {
  const { container, state, unit } = /* existing render helper in this file, seeded with a missionary unit adjacent to an eligible city */;
  const onPreach = vi.fn();
  renderSelectedUnitInfo(container, state, unit.id, { onPreach /* ...other required callbacks */ });
  const button = container.querySelector('button[data-action="preach"]');
  expect(button?.textContent).toContain('Preach');
  expect(button?.title || button?.getAttribute('aria-label')).toBeTruthy(); // help text present
  button!.dispatchEvent(new Event('click'));
  expect(onPreach).toHaveBeenCalledWith(unit.id, expect.any(String));
});

it('does not show a Preach button when the missionary has 0 charges', () => {
  const { container, state, unit } = /* same seed, unit.chargesRemaining = 0 */;
  renderSelectedUnitInfo(container, state, unit.id, { onPreach: vi.fn() });
  expect(container.querySelector('button[data-action="preach"]')).toBeNull();
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test -- selected-unit-info -t "Preach"`
Expected: FAIL — no such button yet.

- [ ] **Step 5: Add `onPreach` callback type and render the button**

Edit `src/ui/selected-unit-info.ts`, add to `SelectedUnitInfoCallbacks` (near `onWorkerAction`):

```typescript
  onPreach?: (unitId: string, cityId: string) => void;
```

Add rendering logic in the unit-actions block (mirroring the `canBuildImprovements` worker-charges block, adjacent to it), using `createGameButton` per the button-styling skill's API (exact call shape depends on that skill's guidance fetched in Step 1):

```typescript
  if (unit.type === 'missionary') {
    const charges = unit.chargesRemaining ?? 0;
    const chargeDiv = document.createElement('div');
    chargeDiv.style.cssText = 'font-size:10px;opacity:0.75;margin-top:6px;';
    chargeDiv.textContent = `Missionary Charges: ${charges}`;
    wrapper.appendChild(chargeDiv);

    const eligibleCityId = findEligiblePreachTargetCityId(state, unit); // helper added below
    if (charges > 0 && eligibleCityId && callbacks.onPreach) {
      const btn = createGameButton('Preach', 'primary');
      btn.dataset.action = 'preach';
      btn.title = 'Push this city toward your faith. Uses one charge — the missionary is used up after its last charge.';
      btn.addEventListener('click', () => callbacks.onPreach!(unit.id, eligibleCityId));
      actionsDiv.appendChild(btn);
    }
  }
```

Add the helper function (near the top-level helpers in this file or imported from `religion-system.ts` if the eligibility logic belongs there — prefer importing a shared eligibility check from `religion-system.ts` so UI and the actual `preach()` gate never drift apart; add a `canPreachTarget(state, unit, cityId): boolean` export to `religion-system.ts` in this same task, reusing the same refusal conditions as `preach()` without mutating state):

```typescript
function findEligiblePreachTargetCityId(state: GameState, unit: Unit): string | null {
  const candidates = Object.values(state.cities).filter(city => {
    if (mapDistance(state.map, unit.position, city.position) > 1) return false;
    return canPreachTarget(state, unit, city.id);
  });
  return candidates[0]?.id ?? null;
}
```

- [ ] **Step 6: Wire panel rerender after preach (per ui-panels.md: "panel action mutates state the panel renders → must refresh immediately")**

Find wherever `onWorkerAction` is wired up in the main UI wiring file (grep: `grep -rn "onWorkerAction:" src/main.ts src/ui/*.ts`) and add an analogous `onPreach` wiring that calls `preach()`, then re-renders `selected-unit-info` (and the city panel's Faith row, if that city panel happens to be open) from the returned state — mirror the exact rerender pattern used for `onWorkerAction`.

If `preach()` results in `unitConsumed: true`, show `createUnitDeleteConfirmationPanel` with `title: 'Missionary Used Up'` (not the default "Delete ...?" framing, since this is a successful action, not a destructive one) before finalizing the state update, per the gates checklist's explicit note about this.

- [ ] **Step 7: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test -- selected-unit-info -t "Preach"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/selected-unit-info.ts src/ui/unit-delete-confirmation-panel.ts src/systems/religion-system.ts src/main.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(religion): Preach button, non-destructive consumption confirmation, panel rerender"
```

---

### Task 9: Tech text honesty update

**Files:**
- Modify: `src/systems/tech-definitions-eras5-7.ts:266-268`
- Test: `tests/systems/description-honesty.test.ts` (just confirm it still passes — no new denylist entries needed since this is honest new text, not a repeat of a removed phrase)

**Interfaces:** none new.

- [ ] **Step 1: Update the `unlocks` text**

Edit `src/systems/tech-definitions-eras5-7.ts:266-268`:

```typescript
  { id: 'missionary-zeal', name: 'Missionary Zeal', track: 'spirituality', cost: 120,
    prerequisites: ['monastic-orders'],
    unlocks: ['Preaching in cities conquered from other civilizations is twice as effective; missionaries carry 3 charges instead of 2'], era: 6 },
```

- [ ] **Step 2: Run the honesty and tech-consistency suites**

Run: `bash scripts/run-with-mise.sh yarn test -- description-honesty tech-unlocks-consistency`
Expected: PASS (new text names no building/unit by exact name, so `tech-unlocks-consistency.test.ts`'s "unlocks must not exactly match an entity name" check is unaffected; it's effect-only text).

- [ ] **Step 3: Commit**

```bash
git add src/systems/tech-definitions-eras5-7.ts
git commit -m "fix(religion): missionary-zeal unlocks text states both real effects"
```

---

### Task 10: AI production scoring + dispatch

**Files:**
- Modify: `src/ai/ai-production.ts` (scoring — find the unit candidate-scoring loop, distinct from the building loop at `:337+`)
- Create or modify: dispatch logic — grep `src/ai/ai-unit-roles.ts` and `src/ai/basic-ai.ts` for the existing worker/auto-explore dispatch pattern first, then add a missionary-dispatch function following that same file's convention (do not add a new file if an existing per-turn AI unit-order pass already exists to extend)
- Test: `tests/ai/ai-production.test.ts` (or wherever AI unit scoring is tested — grep first)

**Interfaces:**
- Consumes: `preach()`, `canPreachTarget()` (Task 8/7), `cityFollowsOwnFaith()` (Task 3), `chooseAiBoon`'s existing `fervor` boon detection.
- Produces: a scoring contribution for `missionary` in the AI's unit-candidate list, and a per-turn dispatch pass that orders idle missionaries to preach.

- [ ] **Step 1: Locate the exact unit-scoring loop**

Run: `grep -n "personalityScore\|roleDemandScore" src/ai/ai-production.ts | head -20` — confirm the unit candidate loop's exact structure before writing scoring code (per spec-fidelity.md: verify current code, don't assume).

- [ ] **Step 2: Write the failing test — deterministic scoring + dispatch**

Add to the AI test file found above:

```typescript
it('scores missionary higher for a civ with the Fervor boon than one without, all else equal', () => {
  const stateWithFervor = /* seed: civ with founded religion + fervor boon, city with Temple, follows own faith */;
  const stateWithoutFervor = /* same seed, boon = 'tithes' or undefined */;
  const candidatesWithFervor = getAIProductionCandidates(stateWithFervor, cityId); // exact function name TBD from Step 1's grep
  const candidatesWithoutFervor = getAIProductionCandidates(stateWithoutFervor, cityId);
  const fervorScore = candidatesWithFervor.find(c => c.itemId === 'missionary')?.personalityScore ?? 0;
  const baseScore = candidatesWithoutFervor.find(c => c.itemId === 'missionary')?.personalityScore ?? 0;
  expect(fervorScore).toBeGreaterThan(baseScore);
});

it('AI dispatches an idle missionary to preach its own unconverted city before a friendly minor-civ city', () => {
  const state = /* seed: AI civ with one idle missionary, one own city not yet following own faith, one friendly minor-civ city also eligible */;
  const next = runAiMissionaryDispatch(state, bus); // exact function name TBD from Step 4
  // assert the missionary's charges decreased (it acted) and the OWN city's conversionProgress grew, not the minor civ's
});

it('AI missionary dispatch is deterministic given the same seed/state', () => {
  const state = /* same seed as above */;
  const runA = runAiMissionaryDispatch(state, bus);
  const runB = runAiMissionaryDispatch(state, bus);
  expect(runA.state.cityFaith).toEqual(runB.state.cityFaith);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test -- ai-production -t "missionary"`
Expected: FAIL.

- [ ] **Step 4: Implement scoring**

In `src/ai/ai-production.ts`, in the unit-candidate loop found in Step 1, add a `missionary`-specific contribution to `personalityScore` gated by: civ has founded a religion (reuse the same lookup `preach()` uses), city satisfies `getTrainableUnitsForCity`'s new gate (religion + own faith + Temple — i.e. only score it where it's actually trainable), and boost when `religion.boon === 'fervor'`. Follow this file's existing convention for how other unit types contribute to `personalityScore` (copy the exact numeric-weighting style already used for a comparable civilian/utility unit rather than inventing a new scale).

- [ ] **Step 5: Implement dispatch**

Add a `runAiMissionaryDispatch(state, bus)` function (in `ai-production.ts` if a per-turn AI unit-order pass already lives there, else in `ai-unit-roles.ts` — match whichever file already owns worker/auto-explore dispatch, found via the grep in the task header): for each civ with a founded religion, for each idle missionary (charges > 0, not on cooldown, `hasActed` false), find the highest-priority eligible target by iterating `Object.values(state.cities).sort by id)` (deterministic order) filtered to: own cities failing `cityFollowsOwnFaith` first, then friendly (non-hostile, per existing diplomacy helper) minor-civ cities eligible per `canPreachTarget`; call `preach()` on the first match found; if no match, leave the unit idle. Move the missionary adjacent to its target first if not already in range, using the existing shared movement helper (grep `moveUnitTo` or equivalent — do not write ad hoc pathing).

- [ ] **Step 6: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test -- ai-production -t "missionary"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ai/ai-production.ts src/ai/ai-unit-roles.ts tests/ai/ai-production.test.ts
git commit -m "feat(religion): AI missionary production scoring (Fervor-weighted) and dispatch"
```

---

### Task 11: Verify city panel's Faith row needs no changes (regression only)

**Files:**
- Test only: `tests/ui/city-panel.test.ts` (grep exact filename)

**Interfaces:** none new — this task is verification, not implementation.

- [ ] **Step 1: Write a regression test proving the existing Faith row renders preach-driven progress correctly with the new per-religion map shape**

Add to the city-panel test file:

```typescript
it('Faith row shows conversion progress correctly after a preach() call (per-religion map shape, #592)', () => {
  let state = /* seed: city with cityFaith.conversionProgress = { [religionId]: 50 } via the NEW map shape */;
  const html = renderCityPanel(state, cityId, /* ...existing required args */);
  expect(html).toContain(/* whatever percentage/points string city-panel.ts:441-456 currently derives from conversionProgress */);
});
```

- [ ] **Step 2: Run it**

Run: `bash scripts/run-with-mise.sh yarn test -- city-panel -t "Faith row"`
Expected: Read `src/ui/city-panel.ts:435-456` first — if it destructures `conversionProgress.points`/`.toReligionId` directly (old shape), this test FAILS and city-panel.ts needs a small fix to read `conversionProgress[cityFaithEntry.religionId]` (or the target religion, whichever the panel is meant to show) from the new map instead. Apply that fix if the test fails; if the panel already computed progress generically enough to not care about shape, this is a pure regression-proving no-op per the gates checklist ("verify, don't rebuild").

- [ ] **Step 3: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "test(religion): confirm Faith row renders per-religion conversion progress correctly"
```

(If Step 2 required no source fix, commit only the test file with message `test(religion): regression-cover Faith row against per-religion progress shape`.)

---

### Task 12: Full verification, inline multi-dimensional review, PR

**Files:** none (process task).

- [ ] **Step 1: Rebase on latest `origin/main`**

Run: `git fetch origin main && git rebase origin/main`

- [ ] **Step 2: Full build + test**

Run: `bash scripts/run-with-mise.sh yarn build` (expect exit 0)
Run: `bash scripts/run-with-mise.sh yarn test` (expect exit 0)

- [ ] **Step 3: Pacing gate sanity check**

Run: `bash scripts/run-with-mise.sh yarn test -- pacing-audit pacing-reference-economy`
Expected: PASS with no snapshot changes — missionary/preach introduce no yields or tech-cost levers, only a one-time state-mutating side effect (conversion), so the reference-economy fixture should be untouched. If it DOES show a diff, stop and investigate before proceeding — that would mean something in this change unexpectedly touched an economy lever.

- [ ] **Step 4: Inline multi-dimensional review** (no subagents) — actually re-read the changed files for each dimension, do not restate intentions:
  - Balancing/gameplay/fun: re-read `PREACH_POINTS`, cooldown constants, and the doubling condition against `.claude/rules/game-balance.md`'s spirit (this MR adds no yields, so the yield-ceiling rules don't apply, but sanity-check the cooldown numbers feel right at a table-top level).
  - Player ages 7-43: re-read all new UI copy (button help text, confirmation panel body text) for plain language.
  - Difficulty modes: confirm no explorer/standard/veteran branching was added anywhere touched.
  - AI: re-read the Task 10 scoring/dispatch code for a determinism regression (same-seed reproducibility) and confirm it doesn't crash on a civ with zero cities or zero religion.
  - UI/UX: click through Preach in a running dev server if browser preview is available; confirm the confirmation panel's copy reads as a success message, not a warning.
  - Architecture/extensibility: confirm `NP_PRODUCTION_DISCOUNTS`-style "table not branch" conventions weren't violated (missionary scoring should not require per-unit-ID branches elsewhere).
  - Data/saves: confirm a legacy save with no `missionaryCooldownUntilTurn`/no per-religion `conversionProgress` map loads without crashing (all new fields are optional; add one load-old-save-shape test if none exists).
  - SFX: confirm silent-for-now is intentional and noted in the PR body (per the issue's stale "reuse unit-action sound" claim — no such generic hook exists per drift-check).
  - Solo + hot-seat regressions: confirm `state.currentPlayer` is used correctly anywhere the Preach button reads "whose turn is it" (it shouldn't need to — missionary ownership already gates the button, but verify no `'player'` literal was hardcoded per `.claude/rules/game-systems.md`).
  - Fix anything found, re-run `yarn build && yarn test`.

- [ ] **Step 5: Draft PR body, grep for the closes-keyword bug**

Draft body including: summary, save/migration note (additive `UnitType` + optional `chargesRemaining`/`missionaryCooldownUntilTurn`/`conversionCooldownUntilTurn`/`conversionCooldownExemptCivId` fields — no migration needed, all optional and absent-safe), SFX note (silent this MR, bespoke chime is MR7/#594), architecture note (per-religion `conversionProgress` map is a data-shape change from MR4 — call this out explicitly as an intentional deviation improving on the original design, per spec-fidelity.md's "note the deviation" guidance), reference `#592`/`#587` — never "closes #524".

Run: `echo "$PR_BODY" | grep -iE 'close[sd]?\s+#[0-9]+|fix(e[sd])?\s+#[0-9]+|resolve[sd]?\s+#[0-9]+'`
Expected: no output. If it matches, rewrite that sentence before proceeding.

- [ ] **Step 6: Open the PR (do not merge)**

Run (timeout 120000ms): `gh pr create --title "MR5 (#592): missionary unit + preach action" --body "$(cat pr-body.md)"`

Report the PR URL back to the user. Stop here — do not merge.
