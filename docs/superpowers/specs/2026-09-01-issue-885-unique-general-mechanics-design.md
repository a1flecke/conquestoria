# #885 — Unique Great General mechanics (design)

Deferred from #544 §33.D. Give **authored** Great Generals meaningful, bounded,
definition-driven mechanical identities through a small vocabulary of reusable
typed **specialties**. Target: *"this General is especially good at X"* — never
*"this General is universally stronger."* Generated officers (#888) stay standard
generalists. No new UI screen, no new mechanic classes, no audio/art.

Current foundation: #888 (generated fallback + `resolveGeneralDefinition`),
#886 (separate id-keyed profile module), #932 (gameId in candidate seed).

## Phase 1 — Current mechanical contract (audited against `f9f96527`)

| Mechanic | V1 default | Source | Class |
|---|---|---|---|
| Command range | 2 | `V1_COMMAND_RANGE`; on every `GeneralDefinition`; via `getEffectiveCommandStats(unit, def)` | A — definition-driven; supply degradation shrinks it |
| Command capacity | 3 | `V1_COMMAND_CAPACITY`; same path | A |
| Lifetime Command Charges | 3 | `V1_MAX_COMMAND_CHARGES`; `def.maxCommandCharges` | A. Persisted state is `generalCommandChargesUsed` (a *count*) ⇒ `remaining = max − used` recomputes if `max` changes ⇒ **no migration** |
| Shared cooldown | 10 turns, one timer for all 3 abilities | `V1_COOLDOWN_TURNS`; `spendHeroicCommandCharge` sets `cooldownUntilTurn = turn + def.cooldownTurns` | A |
| Rally effect | +30 HP, +1 supply stage (severe→degraded→grace) | `RALLY_HEAL_AMOUNT = 30` + `rallyStageAfter()` | **C — hardcoded in `great-general-abilities.ts`** |
| Rally range/scope | `commandRange` / top `commandCapacity` by (missing HP + stage severity), auto-target | `getRallyEligibleTargets` | A (range/scope) + C (heal amount) |
| Seize the Moment | clears `hasActed`+`hasMoved` on ≤ `commandCapacity` player-picked in-range units (one extra attack, no movement refresh) | `issueSeizeTheMoment` | A — no magnitude constant |
| Seize restrictions | in-range, `hasActed` required, capacity-capped, zero-target charge guard | `getSeizeTheMomentEligibleUnits` | A |
| Last Stand effect | +15% defense, radius 1, ≤ `commandCapacity` units, + one shared formation-wide "Hold!" survival save | `LAST_STAND_DEFENSE_MULTIPLIER = 1.15`, `LAST_STAND_AREA_RADIUS = 1` | **C — hardcoded** |
| Last Stand duration | 2 owner-turns | `LAST_STAND_DURATION_TURNS = 2` | **C — hardcoded** |
| Passive stabilization | pauses **supply** degradation for ≤ `commandCapacity` degrading units in `commandRange`, every turn, free | `getPassiveStabilizationTargets` | A — range/capacity driven, no magnitude. NOTE: this is a *supply* mechanic, unrelated to #919's city-unrest relief ceilings. |
| Final Command | 3rd charge resolves normally; General retires end of that turn (`chargesUsed >= maxCommandCharges`) | `retireGeneralsAtTurnEnd` | A — reads `def.maxCommandCharges` |
| AI candidate pick | `commandRange + commandCapacity + maxCommandCharges` sum, id tiebreak | `chooseBestGeneralCandidate` (AI-only; `turn-manager.ts` `!civ.isHuman`) | B — naive; mis-ranks specialists |
| AI ability use | 3 typed evaluators → best adjusted score, difficulty-eagerness weighted, danger penalty, min-value floor | `ai-general-command.ts` | fine; reads resolved stats via previews |
| Ability-set gating | **none** — UI renders all 3 buttons unconditionally; AI evaluates all 3; `issue*` don't check `abilityIds` | `selected-unit-info.ts:437-459`, `chooseGeneralCommandAction` | `abilityIds` exists, nothing gates on it |

Persisted `Unit` General fields: `generalDefinitionId?`, `generalNoCommandThisTurn?`,
`generalCommandChargesUsed?` (count), `generalCommandCooldownUntilTurn?`,
`rallyProtectedThisRound?`, `lastStandHold?` (`{formationId, defenseBonusMultiplier, expiresTurn}`).

## Phase 2 — Extensibility verdict

#544's claim mostly holds. Per-definition **range / capacity / charges / cooldown**
already flow end-to-end via `getEffectiveCommandStats` / `def.maxCommandCharges` /
`def.cooldownTurns` — every consumer reads them. **No redesign, no migration.**

Smallest generic extensions needed:

1. **Ability magnitudes are module constants** (`RALLY_HEAL_AMOUNT`, `LAST_STAND_*`)
   — not reachable per-definition. Fix: a `resolveGeneralMechanics(def)` resolver.
2. **`chooseBestGeneralCandidate` is a raw stat-sum** — needs a bounded typed valuation.
3. **`abilityIds` is not a gate anywhere** ⇒ ability-subsetting would need ~7 new
   `abilityIds.includes()` checks. **v1 does NOT do ability subsetting** (Phase 9:
   prefer numeric/scope; a missing ability is a much larger player-facing change).
4. `great-general-definitions.test.ts` hard-asserts uniformity — relax to bounds +
   "generated officers === STANDARD".

No second "unique General system." No General-ID switches exist today
(`resolveGeneralDefinition` is fully generic) and none will be added.

## Architecture

New module `src/systems/great-general-specialties.ts` — mirrors #886's
separate-module pattern so `GeneralDefinition` / `GeneratedGeneralIdentity` are
**untouched** (generated officers structurally cannot carry a specialty; zero
`normalizeGeneratedGenerals` changes; zero save-shape question).

```ts
export type GeneralSpecialtyId =
  | 'generalist' | 'defensive' | 'initiative' | 'logistician' | 'mobile' | 'endurance';

export interface ResolvedGeneralMechanics {
  commandRange: number;
  commandCapacity: number;
  maxCommandCharges: number;
  cooldownTurns: number;
  rally: { healAmount: number };
  lastStand: { defenseMultiplier: number; durationTurns: number };
  seize: { extraTargets: number };
}

export const BASELINE_GENERAL_MECHANICS: ResolvedGeneralMechanics; // the V1 numbers

// typed catalog of deltas — one entry per specialty
export const GENERAL_SPECIALTIES: Record<GeneralSpecialtyId, GeneralSpecialtyDef>;

// authored-roster mapping — covers exactly GENERAL_DEFINITIONS ids, no 'generated:' keys
export const GENERAL_SPECIALTY_ASSIGNMENTS: Record<string, GeneralSpecialtyId>;

// the ONE thing every ability consumer reads. Memoized by def.id.
// Missing / unknown / 'generated:' id -> BASELINE. Clamps to hard floors
// (range/capacity/charges/cooldown >= 1, heal >= 0) independent of the softer
// documented bounds below.
export function resolveGeneralMechanics(def: GeneralDefinition): ResolvedGeneralMechanics;

// specialty display name + one plain-language line, for the two existing surfaces
export function getGeneralSpecialtyPresentation(def: GeneralDefinition):
  { id: GeneralSpecialtyId; displayName: string; line: string } | undefined; // undefined for generalist / generated
```

`great-general-specialties.ts` imports only the `GeneralDefinition` type + the
baseline constants. `abilities.ts` / `system.ts` / `ai-general-command.ts` /
`selected-unit-info.ts` / `general-candidate-panel.ts` import **it** — never the
reverse. No cycle.

### Consumers converted to read `resolveGeneralMechanics(def)`

- `great-general-abilities.ts`: `getHeroicCommandEligibility` (maxCharges),
  `spendHeroicCommandCharge` (cooldownTurns), `getRallyEligibleTargets` (healAmount),
  `getLastStandPreview` + `issueLastStand` (defenseMultiplier, durationTurns),
  `getSeizeTheMomentEligibleUnits` + `issueSeizeTheMoment` (capacity + `seize.extraTargets`).
  Remove `RALLY_HEAL_AMOUNT` / `LAST_STAND_DEFENSE_MULTIPLIER` / `LAST_STAND_DURATION_TURNS`
  constants. `LAST_STAND_AREA_RADIUS` stays a constant (no specialty touches radius).
- `great-general-system.ts`: `getEffectiveCommandStats(unit, def)` **keeps its
  signature** and internally calls `resolveGeneralMechanics(def)` for the base
  range/capacity before applying supply degradation — so its ~5 call sites are
  unchanged; `getPassiveStabilizationTargets` (unchanged, via it);
  `retireGeneralsAtTurnEnd` (reads resolved `maxCommandCharges`);
  `chooseBestGeneralCandidate` rewritten to `(state, civId, candidates)`.
- `ai-general-command.ts`: `evaluateLastStandOpportunity`'s `getEffectiveCommandStats`
  call; new candidate valuation.
- `advisor-system.ts`: line ~172 command-range read -> resolved; soften the hardcoded
  "holds 3 lifetime Command Charges" advisor copy to "a few lifetime Command Charges
  (usually 3)".
- `selected-unit-info.ts`: the command-stats line already prints `def.commandRange`
  etc. -> print resolved; add the specialty line.
- `general-candidate-panel.ts`: add the specialty line under the descriptor.

## Specialty vocabulary (v1) — one boost, one bounded cost each

| id | display name | boost | cost |
|---|---|---|---|
| `defensive` | Defensive Commander | Last Stand `defenseMultiplier 1.25`, `durationTurns 3` | `commandRange 1` (−1) |
| `initiative` | Bold Commander | `seize.extraTargets 1`, `cooldownTurns 7` (−3) | Last Stand `defenseMultiplier 1.10` (−5%) |
| `logistician` | Supply Master | Rally `healAmount 50` (+20) | `cooldownTurns 13` (+3) |
| `mobile` | Swift Commander | `commandRange 3` (+1) | `commandCapacity 2` (−1) |
| `endurance` | Tireless Commander | `maxCommandCharges 4` (+1) | Rally `healAmount 20` (−10) |
| `generalist` | Field Commander | — baseline — | — baseline — |

5 distinct boost dimensions, 5 distinct cost dimensions, no two specialists share
a weakness.

### Enforced bounds (new `game-balance.md` section + catalog test)

| Dimension | Baseline | Min | Max |
|---|---|---|---|
| commandRange | 2 | 1 | 3 |
| commandCapacity | 3 | 2 | 4 |
| maxCommandCharges | 3 | 2 | 4 |
| cooldownTurns | 10 | **7** | 13 |
| rally.healAmount | 30 | 20 | 50 |
| lastStand.defenseMultiplier | 1.15 | 1.10 | 1.30 |
| lastStand.durationTurns | 2 | 2 | 3 |
| seize.extraTargets | 0 | 0 | 1 |

- Last Stand **radius** is not a specialty dimension in v1 (radius 2 = 19 hexes, too
  swingy). Passive-stabilization has no magnitude dimension.
- Cooldown documented floor **7** for v1; resolver also hard-clamps ≥ 1.
- **No strict upgrade**: a catalog test asserts every non-`generalist` specialty
  has ≥ 1 dimension better *and* ≥ 1 worse than baseline, and that no specialty
  Pareto-dominates another or `generalist`.

## Roster distribution (34 authored)

Framing from #886 is *design inspiration only* — the mapping is explicit typed data
in `GENERAL_SPECIALTY_ASSIGNMENTS`; gameplay code never reads profile strings.

| Specialty | Count | Generals |
|---|---:|---|
| `generalist` | 6 | `gen_hannibal`, `gen_universal_marshal`, `gen_universal_warlord`, `gen_universal_field_marshal`, `gen_universal_commodore`, `gen_thessaly` |
| `defensive` | 6 | `gen_wellington`, `gen_boromir`, `gen_nebuchadnezzar`, `gen_tokugawa`, `gen_cuauhtemoc`, `gen_haldir` |
| `initiative` | 6 | `gen_caesar`, `gen_suvorov`, `gen_frederick`, `gen_napoleon`, `gen_lancelot`, `gen_merry` |
| `logistician` | 5 | `gen_yuefei`, `gen_chandragupta`, `gen_ramesses`, `gen_cyrus`, `gen_gwydion` |
| `mobile` | 6 | `gen_genghis`, `gen_eomer`, `gen_ragnar`, `gen_ugluk`, `gen_alexander`, `gen_oreius` |
| `endurance` | 5 | `gen_shaka`, `gen_mehmed`, `gen_elcid`, `gen_okoye`, `gen_hornedking` |

Total 6+6+6+5+6+5 = 34. Universal fallbacks pinned `generalist` **by policy**
(Phase 32) — the clear mechanical fallback tier. `gen_thessaly` (Atlantis,
game-original, sparse lore) also `generalist`.

## AI

### Candidate pick — `chooseBestGeneralCandidate(state, civId, candidates)`

Replaces the raw stat sum. Difficulty-invariant (no `opponentChallenge`), non-omniscient
(owned units + `getVisibility`-gated hostiles only, like `ai-general-command.ts`),
deterministic (id tiebreak).

```
score(candidate) =
    baseTerm   = w_charges·charges + w_range·range + w_capacity·capacity   // small, ~equalized
  + situational = specialtyNeed(state, civId, resolvedSpecialtyId)          // capped at ~0.3·baseTerm
```

`specialtyNeed`:
- `defensive`   ← count of own field units currently below ~60% HP
- `initiative`  ← count of own units that acted and are adjacent to a visible hostile
- `logistician` ← count of own units in `degraded` / `severe` supply
- `mobile`      ← spread of own military units (max distance-from-capital bucket)
- `endurance`   ← turns the civ has been continuously at war (small, capped)
- `generalist`  ← flat small constant (never a trap pick for the AI)

Every specialty has a nonzero floor; the situational cap keeps a hot war from
landsliding the choice so Swift/Tireless stay live AI picks.

### Ability use — `ai-general-command.ts`

The 3 evaluators already score off `getRallyPreview` / `getLastStandPreview` /
`getSeizeTheMomentEligibleUnits`, which now reflect resolved magnitudes — a
Defensive general's stronger Last Stand automatically scores higher; Bold's +1
Seize target raises its Seize score. **No General-ID branches, no new evaluators.**
Fixtures: Defensive → Last Stand in a defensive fixture; Bold → Seize in an
offensive fixture.

## UI (no new surface)

One truthful line, **generated from the resolved-vs-baseline diff** (exact copy by
construction), `textContent` only, emoji decorative only, no layout change, no modal.

- **selected-unit panel**: placed name → descriptor → **specialty line** → #886 bio
  `<details>` → command-stats line. Form: `Specialty: Defensive Commander — Last
  Stand +25% defense for 3 turns (stronger than a standard commander's +15% / 2
  turns); command range 1.` Command-stats line shows the **resolved** values.
- **candidate chooser** (`general-candidate-panel.ts`): the short self-contained
  line under the existing descriptor: `Especially good at holding ground —
  stronger, longer Last Stand; shorter command range.`
- `generalist` and generated officers: **no specialty line** (nothing misleading).

## Save / load

- **No save-shape change, no migration, no `SAVE_VERSION` bump.** `specialtyId` is
  static id-keyed content. Persisted `generalCommandChargesUsed` is a *count* ⇒ an
  Endurance general (`maxCommandCharges 4`) with `used = 2` correctly shows 2
  remaining.
- Loading a pre-#885 save: an already-spawned authored General gets its specialty
  **immediately** — content-patch semantics (repo save philosophy; the assignment's
  recommended default). Documented loudly in the PR (a mid-game Wellington's command
  range goes 2 → 1; the specialty line explains it).
- An in-flight `lastStandHold` keeps the `defenseBonusMultiplier` it was cast with
  (`resolveLastStandDefenseBonus` reads the persisted hold, not the definition) —
  no retro-change mid-effect.
- Generated officers: `GENERAL_SPECIALTY_ASSIGNMENTS` has no `generated:` keys ⇒
  `resolveGeneralMechanics` returns baseline ⇒ they stay standard. Regression:
  generated identity round-trips and resolves to `BASELINE_GENERAL_MECHANICS`.

## Hot-seat

No new state. Specialty derives from `generalDefinitionId` (already on the unit).
`getPendingGeneralChoiceForViewer` unchanged. Selected-unit panel already renders
per-`currentPlayer`; the specialty line reads only the selected unit's own
definition — no rival tactical state. Notifications unchanged. Tests: P2 sees P2's
specialty/charges; P1's pending choice not shown to P2.

## Difficulty parity

`resolveGeneralMechanics` and the candidate valuation never read
`opponentChallenge`. Existing AI ability-*eagerness* scaling
(`heroicCommandEagernessWeight`, contract item 83 — judgment quality) is left
exactly as-is. Parity tests: resolved mechanics identical across
Explorer/Standard/Veteran; candidate sets identical across difficulties.

## #886 / #887 / #889

- **#886**: rich profile content stays fully separate — `getGeneralProfile(id)`
  untouched, no `profile.specialty*` fields, gameplay code never reads profile
  strings. `descriptor` (flavor) is not edited by #885.
- **#887**: no Hall-of-Fame schema. Existing `general:retired` / `generalHistory`
  events are preserved (retirement still reads resolved `maxCommandCharges`).
- **#889**: no mechanic depends on SFX/visuals; every specialty is fully legible
  muted / reduced-motion. No new audio event.

## Performance

`resolveGeneralMechanics` = `Record` lookup + shallow merge, memoized by `def.id`.
Candidate choice is rare; ability evaluation reads the memoized result. No
roster scan per combat evaluation, no profile recompute, no whole-map AI scan per
candidate (the situational terms are bounded owned-unit counts).

## Deterministic balance matrix — `great-general-specialty-balance.test.ts`

6 scenarios × 6 specialties. The goal is niche wins, not equal scores:

| Scenario | Expected winner(s) | generalist |
|---|---|---|
| 1. damaged formation needing Rally | `logistician` | viable |
| 2. offensive breakthrough opportunity | `initiative` | viable |
| 3. defensive lethal-pressure | `defensive` | viable |
| 4. low-combat builder / stability empire | `mobile` (widest passive stabilization) | viable |
| 5. sustained long multi-front war | `endurance` | viable |
| 6. sparse army / few valuable activations | `generalist` / `endurance` | viable |

Asserts: each specialist wins its intended scenario; **no specialty wins all 6**;
`generalist` is never last in more than 2 scenarios (no trap).

## Test matrix (Phase 33 — 51 items) + regressions (Phase 34)

Covered by: `great-general-specialties.test.ts` (catalog/bounds/assignments/
no-strict-upgrade/generated-baseline/universal-fallback-policy),
`great-general-abilities.test.ts` (baseline unchanged + per-specialty exact
modifiers + anti-abuse invariants re-run: no full Seize reset, one-time Hold
consume, formation-wide semantics, no multi-General stacking),
`great-general-system.test.ts` (retire at resolved maxCharges; passive
stabilization at resolved range/capacity), `ai-general-command.test.ts` +
`great-general-mr5-invariants.test.ts` (candidate valuation differentiates
specialties; AI picks the niche specialist in the matching fixture; difficulty
parity), `turn-manager.test.ts` (`chooseBestGeneralCandidate` new signature),
`selected-unit-info.test.ts` + `general-candidate-panel.test.ts` (truthful
specialty line, no line for generalist/generated, rendered-DOM), save round-trip
tests, hot-seat tests, `great-general-specialty-balance.test.ts`.

Regression pass: #888 fallback, #932 candidate-seed determinism, #886 profiles,
General lifecycle / retirement / Final Command, passive stabilization, advisor
Last Stand hints, combat reward/death, save migrations, selected-unit rendering,
AI General command.

## Delivery

Single PR for #885. MR1/MR2 split only if implementation shows the resolver
threading is independently shippable and the authored assignments + AI valuation
genuinely need to follow — decided during implementation, not assumed.

## Non-goals

#887 Hall of Fame, #889 art/audio, new portraits, new General screen, procedural
specialties for generated officers, new roster entries, ability subsetting,
research/tech-cost, #919/#926/#927/#928 unrest levers, #910 vassalage, #870/#871
borders, #916 animation. Not a leader-personality system.
