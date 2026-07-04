# Building Obsolescence (#443) — Design

## Context

#429 added `obsoletedByTech` coverage for combat units — a unit stops appearing in the
production queue once a tech that supersedes it completes, and already-trained units are
untouched. The original issue also asked about the building equivalent (e.g. "Stable feels
obsolete once the cavalry line fully retires"), explicitly deferred to keep #429 reviewable
and tracked as its own follow-up, #443.

## Scope

Confirmed with the user before writing this spec:

- **Queue availability + upkeep + a UI signal.** Once a building's obsoleting tech
  completes: (1) it disappears from the "can build" list (mirrors #429's unit behavior
  exactly), (2) if already queued but not yet built, it's silently dequeued, (3) if already
  built, its upkeep drops to zero, (4) the city panel shows a badge marking it obsolete.
- **No demolish mechanic.** There is no building-removal system in this game today and this
  spec does not add one. Obsolete-but-built buildings simply sit in `city.buildings` forever,
  upkeep-free, with a UI badge — exactly like a unit that's still alive after its type
  stopped being trainable.
- **Cosmetic, not mechanical.** Investigated whether any of the candidate buildings'
  described effects (e.g. "Reduces cavalry unit training cost by 15%") are actually
  implemented anywhere in the code. None are — `cavalry-academy`, `armory`, `war-academy`,
  `siege-workshop`, and `safehouse`'s percentage cost-reduction text has zero corresponding
  logic anywhere in the codebase; `stable`'s "Trains mounted units" is pure flavor text with
  no `requiresBuildings` link from any unit. This spec does not implement the missing
  mechanical effects — that's a separate, larger feature, not a #429-style follow-up fix.
  This spec is purely about a building's *description* no longer matching reality once its
  linked unit line is gone.

## Candidate buildings

Found by grepping all 139 `BUILDINGS` entries for descriptions referencing a specific unit
type or unit category, then cross-checking against #429's retirement chains
(`src/systems/city-system.ts`'s `TRAINABLE_UNITS`).

**Get `obsoletedByTech` (their linked unit line has a real, single retirement point):**

| Building | `techRequired` | `obsoletedByTech` | Why |
|---|---|---|---|
| `stable` | `horseback-riding` | `tank-warfare` | "Trains mounted units" — horseman/cavalry/knight all obsolete at `tank-warfare` (#429). |
| `cavalry-academy` | `horseback-riding` | `tank-warfare` | "Reduces cavalry unit training cost" — same line, same retirement point. |
| `siege-workshop` | `siege-warfare` | `black-powder` | "Reduces Catapult and Ballista training cost" — both obsolete at `black-powder`, replaced by Cannon (#429). |

**Explicitly considered, deliberately excluded (documented in a code comment, not a test —
see Architecture):**

| Building | Why it never obsoletes |
|---|---|
| `armory` | "Reduces melee and ranged unit training cost" — melee/ranged is a category, not a line; some melee/ranged unit is trainable at every era (e.g. Rifleman → Machine Gunner, which is terminal). Never fully empty. |
| `war-academy` | Same reasoning as `armory` — melee/ranged, never fully empty. |
| `safehouse` | "Reduces spy unit training cost" — the spy chain terminates at `spy_hacker`, which never obsoletes. The category is never empty. |
| `artillery_corps_hq` | Cannon-linked flavor text, but this building is a national project with its own existing era-based fade lifecycle (`nationalProject.homeEra`, fade multiplier) and its *real* effect is a `civYieldBonus`, not the flavor-text cannon bonus. Out of scope — don't layer a second obsolescence mechanism onto something that already has one. |

**Checked for soft-lock risk:** none of `requiresBuildings`'s 4 existing chains
(`herbalist`→apothecary-tier, `semiconductor_fab`-based era-12 chains) reference `stable`,
`cavalry-academy`, or `siege-workshop` as a prerequisite. Safe to hide them from the queue
without permanently blocking any other building.

## Architecture

### 1. `Building.obsoletedByTech` field

Add to `src/core/types.ts`'s `Building` interface, matching `TrainableUnitEntry`'s existing
field exactly:

```typescript
export interface Building {
  // ...existing fields...
  obsoletedByTech?: string;
}
```

No `upgradesTo`-equivalent. Considered it (units get one per #429/#444's concurrent-PR
convention) — rejected because buildings have no slot-based replace mechanic. A city can
have both `stable` and `tank_depot` built simultaneously; there's no "auto-upgrade this
building" action for a successor field to drive. Adding one would be unconsumed dead data,
violating `end-to-end-wiring.md`'s "never compute without rendering" rule.

### 2. Queue availability — `getAvailableBuildings`

`src/systems/city-system.ts`. Add one condition to the existing filter, using the
`completedTechs` parameter it already receives:

```typescript
if (b.obsoletedByTech && completedTechs.includes(b.obsoletedByTech)) return false;
```

### 3. Dequeue already-queued obsolete buildings — `processCity`

`src/systems/city-system.ts`, inside the "drop queued items that are no longer available"
block (~line 1660). Today this block checks `resourceRequired` for buildings but never
checks tech state at all for buildings (only for units, via `trainableTypes`) — a real gap
that predates this spec. Extend the existing per-item building branch:

```typescript
if (BUILDING_IDS.has(item)) {
  const building = BUILDINGS[item];
  if (building?.obsoletedByTech && completedTechs.includes(building.obsoletedByTech)) {
    droppedProductionItem ??= item;
    return false;
  }
  if (building?.resourceRequired?.length && availableResources !== undefined) {
    if (!building.resourceRequired.every(r => availableResources!.has(r))) return false;
  }
  return true;
}
```

**Note on `droppedProductionItem`:** this field is returned by `CityProcessResult` but
**nothing anywhere currently reads it** — confirmed by grep across `src/`. This means the
*existing* unit-dequeue path already silently drops queued items with zero player
notification, and the *existing* resource-loss building-dequeue path does too. This is a
real, pre-existing bug (silent destructive UI on an already-shipped feature), but it's
strictly bigger than #443's scope (it's about notification wiring across `main.ts`, not
about building obsolescence data). This spec populates `droppedProductionItem` correctly
for the new obsolescence case (consistent with the unit path, no worse than the existing
gap) and files the wiring gap as its own separate follow-up issue — same pattern as
#429 deferring buildings to #443.

### 4. Upkeep exemption — `economy-system.ts`

Add a new `MaintenanceReason` value:

```typescript
export type MaintenanceReason = 'exempt' | 'free-support' | 'free-defender' | 'paid' | 'obsolete';
```

In `calculateCityBuildingMaintenance`'s per-building loop, add a check before the
`coreFreeBuildings` candidate/paid split (no overlap exists between `coreFreeBuildings` —
`city-center`, `herbalist`, `workshop`, `shrine`, `barracks`, `library`, `granary` — and the
3 candidate buildings, confirmed):

```typescript
for (const buildingId of city.buildings) {
  if (!BUILDINGS[buildingId]) continue;
  if (ECONOMY_RULES.coreFreeBuildings.has(buildingId)) {
    exemptBuildings.push({ id: buildingId, label: getBuildingLabel(buildingId), upkeep: 0, reason: 'exempt' });
    continue;
  }
  const building = BUILDINGS[buildingId];
  const owner = state.civilizations[city.owner];
  if (building?.obsoletedByTech && owner?.techState.completed.includes(building.obsoletedByTech)) {
    exemptBuildings.push({ id: buildingId, label: getBuildingLabel(buildingId), upkeep: 0, reason: 'obsolete' });
    continue;
  }
  candidates.push({ id: buildingId, label: getBuildingLabel(buildingId), upkeep: getBuildingUpkeep(buildingId), reason: 'paid' });
}
```

Uses `city.owner` to resolve the civ, not `state.currentPlayer` — this function runs for
every civ's cities (AI included), and hot-seat correctness requires resolving ownership
per-city, never assuming "the current player."

Obsolete buildings are lumped into the same `exemptBuildings` array as core-free buildings
(distinguished only by the `reason` tag) rather than a new array, because
`freeBuildings` (a count metric consumed elsewhere, e.g. `ai-production.ts`) sums
`exemptBuildings.length + supportedBuildings.length` — an obsolete building genuinely is
upkeep-free, so including it in that count is correct, even though the *reason* differs
from a core-free building.

### 5. City panel UI — `src/ui/city-panel.ts`

Two changes to the existing built-buildings render loop (~line 233), which already has a
`fadingBadge` pattern for national projects to mirror:

**Badge**, as its own independent variable (not reusing `fadingBadge`, since the two
conditions are mutually exclusive in practice but shouldn't share a variable that implies
one meaning):

```typescript
let obsoleteBadge = '';
if (b.obsoletedByTech && state.civilizations[city.owner]?.techState.completed.includes(b.obsoletedByTech)) {
  obsoleteBadge = ' <span style="color:#e88;font-size:10px;" title="This building\'s purpose no longer applies — later technology has moved past it. No upkeep cost, but no effect either.">⚠️ (obsolete)</span>';
}
```

Inserted into the template alongside `fadingBadge`:

```typescript
<strong data-text="bldg-name-${idx}"></strong>${fadingBadge}${obsoleteBadge} — <span data-text="bldg-desc-${idx}"></span>
```

**Upkeep row text** — today this branches only on `upkeep > 0` (`'Upkeep: -N gold/turn'` vs
`'Free support'`), which would misleadingly show "Free support" for an obsolete building
(that phrase implies a valuable free slot, not "this is now useless"). Branch on the row's
`reason` instead:

```typescript
const row = cityMaintenance.rows.find(r => r.id === bid);
const upkeep = row?.upkeep ?? 0;
const upkeepText = row?.reason === 'obsolete'
  ? 'Obsolete — no upkeep'
  : upkeep > 0
    ? `Upkeep: -${upkeep} gold/turn`
    : 'Free support';
```

## AI safety check

`src/ai/basic-ai.ts`'s military-building fallback (`['barracks', 'stable'].find(id => ... availableBuildings.includes(id) ...)`)
and `src/ai/ai-personality.ts`'s `weightProductionChoice` (`MILITARY_ITEMS` includes `'stable'`)
both only act on items already present in the `availableBuildings` list `getAvailableBuildings`
produced. Once `stable` is filtered out there, both paths naturally stop considering it —
no AI code changes needed; the existing `availableBuildings.includes(...)` guards are
already correct.

## Regression safety check — `MaintenanceReason`

Confirmed via grep that no exhaustive switch/match anywhere outside `economy-system.ts`
itself consumes `MaintenanceReason` (the only other `.reason ===` sites in the codebase are
unrelated `reason` fields on different types — territory-founding blockers, claim results).
Adding `'obsolete'` to the union is safe and cannot silently break an existing exhaustiveness
check elsewhere.

## Test fixture conventions to reuse (don't invent new ones)

- **`calculateCityBuildingMaintenance` / upkeep tests** — `tests/systems/economy-system.test.ts`
  already has the exact fixture to extend: `makeState()` (builds a real city via `foundCity`,
  id `'capital'`, owner `'player'`) plus the `city(state)` accessor. See the existing
  `describe('economy maintenance', ...)` block (e.g. "keeps core buildings exempt; gives one
  free slot..." at the top of that describe) for the established assertion style
  (`calculateCityBuildingMaintenance(state, 'capital')`, checking `.upkeep`/`.paidBuildings`/
  `.freeBuildings`/`.rows`). Add `state.civilizations.player.techState.completed.push('tank-warfare')`
  (or set the array directly) to simulate the obsoleting tech being done, then assert the row
  for `'cavalry-academy'` has `reason: 'obsolete'` and `upkeep: 0`.
- **City panel UI tests** — `tests/ui/city-panel.test.ts` already imports
  `makeWonderPanelFixture()` and `collectText()` from `./helpers/wonder-panel-fixture` (see the
  `city-panel unrest section — #436` describe block for the exact usage pattern:
  `const { container, city, state } = makeWonderPanelFixture();`). **Note:** the existing
  national-project `fadingBadge` feature has *no* test coverage in this file at all (checked —
  zero hits for "fading" in `tests/ui/city-panel.test.ts`), so there's no existing badge test
  to mirror structurally; write the new obsolete-badge test fresh using the same
  `makeWonderPanelFixture()`/`collectText()` pattern the unrest-section tests already use.
  `makeWonderPanelFixture()`'s default state has `completedTechs: ['philosophy', 'pilgrimages']`
  — override by pushing `'tank-warfare'` onto `state.civilizations[state.currentPlayer].techState.completed`
  after construction, and set `city.buildings = ['cavalry-academy']` before rendering.

## Testing strategy

No completeness test (see below for why). Instead:

1. **Queue availability**: `getAvailableBuildings` offers `stable`/`cavalry-academy` before
   `tank-warfare` completes, and does not after. Same for `siege-workshop`/`black-powder`.
2. **Data-integrity, not completeness**: for each obsoleted building, assert that once its
   `obsoletedByTech` tech is in `completedTechs`, the unit(s) its description names are
   genuinely absent from `getTrainableUnitsForCiv`'s output at that same tech state. This
   proves the `obsoletedByTech` value is semantically correct — not a copy-paste guess —
   without claiming a completeness guarantee the data doesn't structurally support (there's
   no crisp mechanical filter like units' `strength > 0` to detect "this building needs a
   decision"; identifying candidates here was inherently an editorial grep-and-read pass,
   documented in a code comment, not enforced by a test).
3. **Dequeue**: a city with `stable` queued (not yet built, `productionProgress: 0` to avoid
   #429's cost-math false-positive lesson) silently drops it once `tank-warfare` completes,
   and `droppedProductionItem` is populated with `'stable'`.
4. **Upkeep**: a city with `cavalry-academy` already built shows `upkeep === 0` and
   `reason === 'obsolete'` (not `'exempt'` or `'free-support'`) once `tank-warfare` completes.
5. **UI**: the city panel shows the obsolete badge and "Obsolete — no upkeep" text for an
   already-built, now-obsolete building; shows neither for a still-relevant one.
6. **Negative regression**: `armory`, `war-academy`, and `safehouse` remain in
   `getAvailableBuildings`'s output even with every tech in the game completed — proving
   they were not accidentally given `obsoletedByTech`.
7. **Soft-lock guard**: assert no `Building.requiresBuildings` array in the full `BUILDINGS`
   roster references `stable`, `cavalry-academy`, or `siege-workshop` — locks in the
   precondition that made this safe, so a future building addition that violates it fails
   loudly instead of silently creating a dead-end.

## Out of scope (follow-up issues to file)

- **`droppedProductionItem` notification wiring.** Confirmed dead data — no code anywhere
  consumes it, so players get zero feedback when a queued unit *or* building silently drops
  from production today. Pre-existing, affects units already, bigger than this spec. File
  as its own issue, same pattern as #429→#443.
- **Implementing the actual unit-training-cost-reduction mechanic** these buildings describe
  (`cavalry-academy`, `armory`, `war-academy`, `siege-workshop`, `safehouse`'s percentage
  bonuses, and `stable`'s implied unit-training gate). This spec only addresses the
  description no longer matching reality once the linked line is gone — it does not make
  the description true in the first place. Worth its own design discussion given the
  balance implications (`game-balance.md`'s national-project/wonder ceilings don't directly
  apply to a flat per-building percentage discount, but a fresh discussion should confirm
  reasonable bounds before implementing).
