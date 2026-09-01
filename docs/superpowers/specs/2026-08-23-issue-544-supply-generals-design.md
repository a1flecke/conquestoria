# #544 Supply-Lite Logistics + Great Generals — Design Spec

## 1. Why this doc exists

The user-approved design contract for #544 lives in the GitHub issue comment
attachment `conquestoria-issue-544-final-design.md` (issue comment
[#544#issuecomment-5385567592](https://github.com/a1flecke/conquestoria/issues/544#issuecomment-5385567592)),
copied into this repo unmodified at
`docs/superpowers/specs/2026-08-23-issue-544-final-design.md` for permanent
reference. That document is the **product contract** — read it first, it is
not repeated in full here.

This doc is the **required re-audit + repo-mapping** called for by that
contract's own §2 ("Mandatory pre-implementation re-audit") and §31 (workflow
step 2). It:

1. Confirms the contract's audit baseline (`b4b42e0a`) is still accurate.
2. Maps every contract concept onto the actual current-`main` abstraction
   that implements it (not the abstraction the contract's authors guessed
   at).
3. Records the small number of places where current code diverges from what
   the contract assumed, and the adaptation chosen for each (per contract
   §38: "adapt implementation to newest canonical abstractions, document
   meaningful deviations").
4. Performs the inline design review the contract's §31 step 3 requires.
5. Lays out the phasing / MR breakdown that becomes the input to individual
   implementation plans (this doc does not itself contain step-by-step TDD
   tasks — see `docs/superpowers/plans/2026-08-23-issue-544-mr1-core-supply.md`
   for MR1).

## 2. Audit baseline confirmation

Re-checked 2026-08-23:

- `origin/main` HEAD is `b4b42e0a62204df217947b47fc829e5d1322f764` — **exactly**
  the contract's audited baseline. No drift, no rebase needed.
- Issue #544 is still open; its body still describes the original
  unrestricted-healing / aura-general sketch that the July addendum and the
  final design doc both explicitly supersede.
- All "known relevant paths" the contract names exist at the expected
  locations (see §3 below for exact current names, some differ from the
  contract's guesses).

## 3. Concept → current-code mapping

| Contract concept | Current-code reality |
|---|---|
| Typed unit-definition capabilities | `UnitDefinition` in `src/core/types.ts:463` — optional fields pattern (`cargoCapacity?`, `cargoSize?`, `fortificationPenetration?`, `domain?`). New supply fields follow this exact pattern. |
| Canonical cargo compatibility | `canLoadUnitOntoTransport` in `src/systems/transport-system.ts:201`, plus `isTransport`/`isLandUnit`/`getUnitCargoSize`/`getTransportCapacity`. Naval shore supply reuses these, does not re-check `domain`/type itself. |
| Canonical combat modifiers/previews | Two distinct mechanisms, and the supply -10% belongs to the second, not the first (corrected during inline review — see §11.2): (1) `getCombatModifier` in `src/systems/unit-modifier-system.ts:118`, tech/national-project-gated bonuses via the `UNIT_MODIFIERS` table — not used by supply, since supply is a transient battlefield state, not a tech unlock. (2) `CombatContext`/`calculateCombatStrengths` in `src/systems/combat-context.ts`/`src/systems/combat-system.ts`, the mechanism already used for terrain, fortification, positioning, and combined-arms multipliers — the supply -10% is one more named multiplier here, mirroring `resolveFortificationDefense`'s exact `{ multiplier, label? }` shape. Never computed ad hoc in UI or AI either way. |
| Canonical diplomacy/access checks | `isAtWar` and `hasAllianceTreaty` in `src/systems/diplomacy-system.ts`. **There is no "open borders" / military-access concept at all** — see §4 finding 2. |
| Canonical lethal-damage resolution | `applyCombatOutcomeToState` in `src/systems/combat-reward-system.ts:286`. Already has a directly-analogous precedent for Last Stand: the `geneTherapyReady` branch (line ~343) that intercepts `!result.attackerSurvived` and forces survival at 1 HP, then sets `attackerActuallyDefeated = false`. Last Stand's Hold-save is architecturally the same branch, mirrored for the defender side and for any other source of lethal damage that flows through this function. |
| Canonical turn-end processing | `processTurn` in `src/core/turn-manager.ts:146`, invoked once per **round** (not per individual civ-turn) from `runCurrentCompletedRound` in `src/app/controllers/turn-flow-controller.ts:414`. It already loops `for (const [civId, civ] of Object.entries(newState.civilizations))` once per round, after every civ's turn (human hot-seat handoffs and AI) has resolved for that round. This is the correct, and only, hook point — see §6. |
| Canonical save migration | `src/storage/save-migrations.ts` (not `src/core/` as the contract guessed) — numbered migrations keyed by `saveSchemaVersion` on `GameState`. |
| Canonical viewer-safe UI/AI data flow | `Civilization.visibility` (`VisibilityMap`) is the existing per-civ fog-of-war/perception boundary; `ai-perception.ts` is the existing pattern for AI reading only its own civ's visibility. Supply overlay and General candidate selection reuse this, not a new visibility channel. |
| Fort/Citadel systems | See §4 finding 1 — real, but not the shape the contract assumed. |
| Definition-driven carrier deck capacity (cited as evidence current code already generalizes similar patterns) | `src/systems/city-system.ts` deck-capacity field, added in #582 — confirms the "typed optional capability, not a type/faction branch" convention is the house style, reinforcing the same approach for supply/General fields. |

## 4. Findings that diverge from the contract's assumptions

### Finding 1 — Fort and Citadel are one tile improvement, not two structures

`src/core/types.ts` has a single `ImprovementType` value `'fort'` — there is
no `'citadel'` improvement. `src/systems/fortification-system.ts` derives a
**civ-wide** `FortificationTier` (`'fort'` vs `'citadel'`, multiplier 1.1 vs
1.2) purely from `completedTechs.includes('fortification-engineering')`
(`getFortificationTier`). Every `fort` tile a civ owns flips tier
simultaneously the moment that civ finishes the tech — it is not a
per-location build choice, and there is no separate Citadel structure you
place at a different spot with a different radius locked in at build time.

**This is the same pattern the codebase uses for roads vs. "railroads"**:
there is one `hasRoad` tile flag (`src/core/types.ts:289`); road-entry
movement cost drops from 1 to 0.5 once the owner has `military-logistics` OR
`railway-expansion` (never both stacking — see
`.claude/rules/game-balance.md`'s "Roads discount, they don't stack"). There
is no distinct rail tile either.

**Adaptation (applies to contract §6, §7, §8, §9):**
- "Fort radius" and "Citadel radius" become two constants keyed by
  `getFortificationTier(owner.techState.completed).id`, applied uniformly to
  every `fort` tile that civ owns. A civ's forts do not individually choose
  a tier.
- "Captured Fort/Citadel stabilization" (contract §7) is **one** stabilization
  timer for the `fort` improvement, independent of tier — the contract's
  text only ever contrasts it against City stabilization ("shorter than
  cities"), never requires two different fort-tier durations, so nothing is
  lost. Once stabilized, the tile's radius/healing immediately reflects
  whatever tier the *capturing* civ currently has — captured tier is not
  inherited from the previous owner.
- "Road/rail bounded extension" (contract §9) is one extension amount keyed
  by which of `military-logistics` / `railway-expansion` (or a future
  logistics-specific tech) the owner has completed, applied to any tile with
  `hasRoad: true` — not a second tile flag.

This is a documented deviation per contract §38, not a question for the
user: it preserves the exact player-facing behavior (three visibly distinct
strength tiers: Fort < Citadel < City) while reusing the existing
single-improvement-plus-tech-tier convention instead of inventing a second
placeable structure the rest of the codebase has no precedent for.

### Finding 2 — An Open Borders treaty exists in the data model but gates nothing

`getBlockingMapEntityAt` (`src/systems/unit-system.ts:1234`) only blocks
movement onto occupied enemy **cities** and barbarian **camps** — plain
foreign-owned tiles are not blocked by ownership or diplomatic state at all.
**Corrected during MR1 implementation (Task 3):** `TreatyType` does include
`'open_borders'` (`src/core/types.ts:887`) — it is proposable, trackable in
`DiplomacyState.treaties`, and both `basic-ai.ts` and `ai-diplomacy.ts`
reason about whether to accept/propose it. But nothing in
`unit-movement-system.ts` or `getBlockingMapEntityAt`/`isBlockingCityFor`
ever reads it — only `hasAllianceTreaty` gates whether a foreign city blocks
entry (`isBlockingCityFor`, `src/systems/unit-system.ts:1219-1221`). So an
Open Borders treaty today has whatever relationship/diplomacy-flavor effect
it was built for, but zero effect on what territory a unit can actually walk
into. A unit can walk through any other civ's territory regardless of treaty
state, as long as no occupied city/camp sits on the tile.

The contract's own §5 anticipates exactly this: *"if current gameplay
permits entry without access, treat logistics as hostile and create a
follow-up issue describing the diplomacy/movement mismatch"* (deferred issue
H, contract §33.H).

**Adaptation:** territory classification for supply purposes becomes:

```
friendly-owned tile           -> Friendly territory (§182 rules)
allied-owned tile (via        -> Allied territory (§188 rules)
  hasAllianceTreaty)
unclaimed tile (owner: null)  -> Stable but Unsupported (§195 rules)
any other civ's owned tile    -> Hostile (overextension clock applies)
barbarian-owned / no owner    -> unclaimed rule above (barbarians never own tiles)
```

i.e. every non-allied, non-friendly, non-unclaimed tile is hostile for
supply purposes — at war or not, and Open Borders or not — because no
legal-access state actually gates movement today. Deferred issue H (§9
below) is required, not optional, and must say precisely this: *"logistics
currently treats all non-allied foreign
territory as hostile because no open-borders/military-access system exists;
revisit if/when one is added."*

### Finding 3 — no other divergences found

Cargo typed properties, combat-modifier centralization, the lethal-damage
resolution site, AI module layout (`ai-tactics.ts`, `ai-production.ts`,
`ai-unit-assignment.ts`, `ai-perception.ts` all exist and match the
contract's expectations), the deterministic scenario/debug infrastructure
(`src/testing/scenario-builder.ts`, `scenario-types.ts`, `scenarios.ts` —
shipped in #846/PR #852), and hot-seat/save conventions are all present and
match what the contract assumes. No other adaptation is required before
implementation begins.

## 5. New typed definition capabilities (contract §4, §10, §14, §28)

All additive, all optional (legacy-save-safe), following the existing
`UnitDefinition` optional-field convention:

```ts
// src/core/types.ts — UnitDefinition additions
participatesInLandSupply?: boolean;   // default false when absent
landSupplyCost?: number;              // only meaningful if a compatible naval definition exists
```

```ts
// src/core/types.ts — UnitDefinition additions, naval-only
landSupplyCapacity?: number;          // total land-supply "slots" this ship projects
projectsLandSupplyRange?: number;     // hex range within which it can shore-supply
```

Per contract §10: these must **not** derive from `cargoCapacity`/`cargoSize`
even where initial values happen to match. Enforce this with a content-
honesty-style test asserting no code path computes one from the other (see
§8 test matrix).

Per contract §4: v1 data sets `participatesInLandSupply: true` on every
`UNIT_DEFINITIONS` entry whose `UNIT_CLASS_BY_TYPE` includes a land-military
class (reuse the existing class table in
`src/systems/unit-modifier-definitions.ts` — do not hand-write a second unit
list). Naval, air, barbarian/beast/stampede/crisis-actor types default to
`false`/absent. The Great General unit type sets it `true` explicitly (it is
not classified as land-military).

General definitions (contract §14) are a new `GENERAL_DEFINITIONS` table,
same shape convention as `UNIT_DEFINITIONS`/`LEGENDARY_WONDER_DEFINITIONS`:
one object per named General, keyed by id, with `commandRange`,
`commandCapacity`, `maxCommandCharges`, cooldown, `abilityIds: HeroicAbilityId[]`,
civ/era eligibility, portrait id. V1 entries share identical numeric values
by data coincidence, never by code assumption — nothing in the resolver may
read "3" or "10 turns" directly; it always reads
`definition.maxCommandCharges` / `definition.cooldownTurns`.

## 6. Supply resolution — where and how

Confirmed against `processTurn` (§3 table): resolution runs **once per
round**, inside the existing `for (const [civId, civ] of ...)` loop in
`processTurn`, immediately after that civ's units/cities have their other
end-of-round processing applied and before the loop moves to the next civ.
This satisfies contract §11 ("resolve at the end of the owner's turn") because
by the time `processTurn` runs, every civ (human via hot-seat handoff, AI via
the round scheduler) has already finished acting for the round — there is no
mid-round supply flicker to worry about because nothing reads supply state
until the next round's UI render.

A new pure function, called once per civ per round:

```ts
// src/systems/supply-system.ts
export function resolveLandSupplyForCiv(
  state: GameState,
  civId: string,
): LandSupplyResolution
```

returning a plain per-unit-id map of resolved `SupplyStatus` plus the
updated (immutable, per `.claude/rules/game-systems.md`) civ-scoped state
patch (degradation counters, captured-source stabilization counters). This
is the "canonical supply data/resolver" contract §31 step 5 requires, and it
is the entire deliverable of MR1 (§10 below) — no UI, no Generals, in that
first slice.

Internally it composes smaller pure helpers (all exported, all independently
testable, all consumed identically by UI/AI per contract §28):

- `getLandSupplySourceCoverage` — territory classification (Finding 2) +
  Fort/Citadel/City radius lookup (Finding 1) + captured-source stabilization
  state, returns the coverage for one coordinate.
- `getNavalShoreSupplyAssignments` — the geography-first greedy allocator
  (contract §10: closest-first, no pooling, no knapsack, recomputed from
  scratch every round).
- `getPrimarySupplySource` — deterministic single-source explanation for UI
  (nearest valid source, stable tie-break by sorted hex key).
- `advanceOverextensionStage` — pure state-machine step for the grace/degraded/
  severe cadence (contract §3.3 table), never mutates in place.

## 7. Great Generals — abilities and the lethal-resolution hook

Rally and Seize the Moment are pure state mutations (HP/stage restore, bonus
action budget) with no interaction with the death pipeline — straightforward
additive helpers alongside the supply resolver.

Last Stand's "Hold!" save is the one piece that must integrate with combat
death, and Finding in §3 already identifies the exact site:
`applyCombatOutcomeToState` in `combat-reward-system.ts`. The existing
`geneTherapyReady` branch is the precedent to mirror:

```ts
// existing precedent, attacker side, ~line 343
} else if (attackerBefore.geneTherapyReady === true) {
  units[result.attackerId] = { ...attackerBefore, health: 1, ..., geneTherapyReady: false };
  attackerActuallyDefeated = false;
}
```

Last Stand needs the same branch shape on **both** attacker and defender
sides, gated by a new `hasLastStandHold?: boolean` transient unit flag (set
when the ability is issued, consumed on first trigger), and — per contract
§27 — it must be reachable from every lethal path that flows through this
function, not just melee combat, so no second `hasLastStandHold` check gets
hand-rolled elsewhere (bombardment/environmental hazards must already funnel
through `applyCombatOutcomeToState` or an equivalent single choke point;
confirming that is a required MR3/MR4 audit step, not assumed here).

Self-sacrifice costs (explicit unit-destroying abilities, if any exist
elsewhere in the codebase) must **not** check this flag — contract §20 is
explicit that Last Stand never blocks a voluntary self-destruct. This needs
a one-time audit of any existing self-destruct ability during
implementation to confirm none of them route through
`applyCombatOutcomeToState` in a way that would accidentally consume the
Hold save.

## 8. UI, AI, saves, content honesty

These sections of the contract (§12, §24-25, §26, §34) are already fully
specified at the product level and require no repo-mapping beyond what §3-7
above establish:

- UI: overlay reuses the existing fog-of-war-style per-civ visibility
  rendering pattern (`src/renderer/fog-renderer.ts` is the closest existing
  precedent for "never reveal enemy-only data, viewer-scoped render").
  **Safeguard for MR2 (found during inline review):** `getLandSupplySourceCoverage`
  and `getPrimarySupplySource` (MR1) read ground-truth `state.map.tiles`
  directly — they are not fogged. This is safe today because MR1 only ever
  calls them with `civId` = the resolving civ itself inside `processTurn`.
  MR2's overlay renderer MUST only ever call them with the *current viewer's
  own* civId; a call with an opponent's civId (e.g. an AI-debug view, or a
  copy-paste mistake) would leak Fort locations the viewer's own
  `VisibilityMap` would otherwise hide. MR2's plan must include a test
  asserting the overlay never queries supply coverage for a non-viewing civ.
- AI: General ability evaluators live alongside `ai-tactics.ts` /
  `ai-unit-assignment.ts`, consuming the same `resolveLandSupplyForCiv`
  output the UI reads — no separate AI-only supply computation per contract
  §28's "no hidden-info AI."
- Saves: **no migration entry needed.** Every new field in this arc
  (`Unit.landSupply`, `HexTile.fortStabilizationSinceTurn`, the
  `UnitDefinition` capability flags) is optional with "absence means never
  resolved / not applicable" as its valid default — this matches the
  existing `hasRoad?: boolean` precedent at `src/core/types.ts:289`
  ("optional: legacy saves default falsy, no migration needed"), not the
  pattern used for non-optional `Record` fields like `crisisForces` (which
  *do* need a migration to backfill `{}`). Confirmed against
  `src/storage/save-migrations.ts`'s real migration list before writing this
  down — do not add a migration entry for these fields; doing so would be
  unnecessary churn, not extra safety.
- Content honesty: extend `tests/systems/description-honesty.test.ts` and
  `tests/systems/tech-unlocks-consistency.test.ts` conventions — any new
  `Tech.unlocks`/`Building.description`/`UNIT_DESCRIPTIONS` text this work
  touches follows `.claude/rules/content-description-honesty.md`.

## 9. Required deferred GitHub issues (contract §33)

Per contract, these must be filed as real issues before #544 is considered
done — not left as code comments. Filed at the point noted:

| Issue | Filed when | One-line scope |
|---|---|---|
| A. Naval logistics/endurance | before #544 closes | Ports, replenishment, fleet endurance |
| B. Air logistics/basing | before #544 closes | Aircraft base logistics, readiness |
| C. Treaty-gated logistics/military access — filed as [#870](https://github.com/a1flecke/conquestoria/issues/870) | **at MR1**, informed by Finding 2 | Explicit access rights distinct from alliance |
| D. Unique General mechanics — ✅ shipped [#885](https://github.com/a1flecke/conquestoria/issues/885) | before #544 closes | Divergent abilities/traits per definition |
| E. Rich General biographies — ✅ shipped [#886](https://github.com/a1flecke/conquestoria/issues/886) | before #544 closes | Historical/educational content expansion |
| F. Campaign chronicle / Hall of Fame — 🟡 MR1 backend shipped [#887](https://github.com/a1flecke/conquestoria/issues/887); MR2 Hall of Fame UI outstanding | before #544 closes | Career timeline, battles influenced |
| G. Candidate-pool exhaustion / fallback | before #544 closes | Richer culturally-coherent fallback generation |
| H. Diplomacy/movement mismatch — filed as [#871](https://github.com/a1flecke/conquestoria/issues/871) | **at MR1**, this is Finding 2 verbatim | The `open_borders` treaty exists but gates no movement/access logic anywhere; logistics treats all non-allied foreign territory as hostile |
| I. Richer audio/visual presentation | before #544 closes | Portrait polish, ability effects, ceremonies |

Issues C and H are filed early (MR1) because they are direct, immediate
consequences of a re-audit finding, not speculative future work — filing
them documents the known limitation the moment it's discovered rather than
waiting until the whole arc closes.

## 10. Phasing / MR breakdown

Mirrors contract §31's step ordering. Each MR is independently mergeable and
independently testable, matching this repo's established big-feature arc
pattern (index issue + numbered sub-issues, see #591/#546/#787 in project
history).

- **MR1 — Core supply data/resolver, plus the minimum real integration.**
  Three-state model, territory classification, Fort/Citadel/City coverage,
  captured-source stabilization, naval shore-supply allocation, resolution
  hook in `processTurn`; combat -10%/-1 move flowing through `CombatContext`/
  `calculateCombatStrengths` in `combat-context.ts`/`combat-system.ts`
  (mirroring the existing `resolveFortificationDefense` pattern — **not**
  `getCombatModifier`'s tech/national-project-gated `UNIT_MODIFIERS` table,
  which is the wrong fit for a transient battlefield state; this was
  corrected during the inline review below). MR1 also wires the actual
  `healUnit` call site (`turn-manager.ts:624`) to stop granting passive/Rest
  healing while unsupported — the original, oldest mechanic #544 asked for —
  and adds one truthful status line to the existing unit-info panel (not the
  full MR2 overlay) so neither this healing change nor the new combat
  penalty ships silently, per contract's own "silent changes read as bugs"
  principle and `.claude/rules/incremental-mr-completion.md`. Full TDD plan:
  `docs/superpowers/plans/2026-08-23-issue-544-mr1-core-supply.md`. Files C
  and H (§9) go out with this MR. MR1 is not meant to be exciting on its own —
  it is plumbing with one honest status line; the "loveable" payoff (named
  Generals, portraits, fanfare) is MR3-MR4. Backend logic is split across six
  single-responsibility modules (`supply-participation.ts`,
  `supply-territory.ts`, `supply-sources.ts`, `supply-naval.ts`,
  `supply-progression.ts`, `supply-combat.ts`) plus a thin
  `supply-system.ts` composition root, rather than one large file — the
  first draft of this plan put all eleven functions in one file, which was
  an SRP violation caught and fixed during the inline review.
  **Scope note, decided at implementation time:** contract §30 scenarios
  11-14 (bounded road/rail supply-radius extension) are named in this MR1
  description above but were **not implemented** — Task 4's Fort/Citadel/
  City coverage landed without a road/rail bonus. This is an explicit,
  documented deferral to **MR1.1** (not a silent gap): road/rail extension
  needs its own tech-gated-tier design decision (mirroring the Fort/Citadel
  pattern — a bonus keyed by whichever of `military-logistics`/
  `railway-expansion` the owner has, applied to `hasRoad` tiles, not a new
  tile type) and is small enough to be its own quick follow-up MR rather
  than growing MR1 further. Do not consider #544 complete until MR1.1 lands
  or this deferral is revisited.
- **MR1.1 — Road/rail bounded supply extension** ✅ merged (#893)
  (see `docs/superpowers/plans/2026-08-25-issue-544-mr1.1-road-rail-supply.md`):
  `getRoadSupplyExtension` mirrors `getFortificationTier`'s "one flag,
  owner-tech-derived tier" convention exactly -- `military-logistics` → +1,
  `railway-expansion` → +2 (never stacking, same two techs the movement-cost
  discount already uses), applied when a coord is on/adjacent to an owned
  `hasRoad` tile. Deliberately not a network trace (contract: "do not trace
  unlimited networks") -- checks only the coord and its immediate wrap-aware
  neighbors via `mapNeighbors`. Hooked into the two canonical resolution
  functions (`getLandSupplySourceCoverage`, `getPrimarySupplySource`) every
  real caller already uses, so the supply overlay and unit-panel status line
  reflect it with zero additional UI code -- verified with a dedicated
  end-to-end regression, not just assumed architecturally. This was #544's
  last remaining open item; the issue's own "Definition of done" (contract
  §36) is now fully satisfied.
- **MR2 — Supply UI**: the *full* toggleable overlay, live projected-vs-
  resolved preview, end-turn warnings, and first-time tutorial (the unit-panel
  status line itself ships with MR1, not here).
- **MR3 — Great General data/lifecycle**: `GENERAL_DEFINITIONS`, XP/threshold
  progression, candidate generation, spawn, escort/transport/death rules,
  history ledger, save fields.
- **MR4 — Passive command + heroic abilities** ✅ merged (#879)
  (see `docs/superpowers/plans/2026-08-24-issue-544-mr4-passive-command-heroic-abilities.md`):
  stabilization aura, Rally, Seize the Moment, Last Stand (including the
  `applyCombatOutcomeToState` integration from §7), Final Command/retirement.
- **MR5 — AI** ✅ merged (#880)
  (see `docs/superpowers/plans/2026-08-24-issue-544-mr5-ai.md`): AI civs
  now automatically acquire Generals (deterministic best-stat pick, no RNG);
  supply-aware AI unit-safety scoring (`rankWithdrawals` now also triggers
  on severe `landSupply`, not just low health); General ability evaluators
  (Rally/Seize/Last Stand) feeding a shared spend layer in the new
  `src/ai/ai-general-command.ts`, dispatched twice per AI civ per round from
  `ai-round-scheduler.ts` (pre-tactical for Rally/Last Stand, post-tactical
  for Seize); difficulty-scaled judgment only, via two new eagerness/safety
  knobs on `OpponentChallengeProfile` — never a mechanical exception.
- **MR6 — Hot-seat + save validation** ✅ merged (#881)
  (see `docs/superpowers/plans/2026-08-24-issue-544-mr6-hot-seat-saves.md`):
  items 85-87 (viewer-safe overlay, viewer-safe candidate selection,
  pending-intent cleanup on handoff) were already correct on `main` and got
  regression tests plus one behavior-preserving extraction
  (`getPendingGeneralChoiceForViewer`) for testability; item 88 (same-turn
  save/load exactness) was genuinely investigated and confirmed correct;
  item 89 (legacy save compatibility) extends the MR4 legacy-save test with
  an MR5-era AI-acquisition case. Also fixed the long-standing
  `turn-manager-crisis.test.ts` full-suite flake (MR4/MR5/here), and flagged
  (not fixed) a separate `gameId`/`Date.now()` RNG-seed-vs-save-identity
  determinism issue found while diagnosing it.
- **MR7 — Balance/scenario pass + remaining deferred issues** ✅ merged (#890)
  (see `docs/superpowers/plans/2026-08-25-issue-544-mr7-balance-scenarios.md`):
  audited the contract's 89-item scenario matrix against real code/tests
  rather than re-verifying what MR1-MR6 already covered; found and closed
  two real gaps -- `landSupplyCost` was declared and correctly consumed by
  the naval shore-supply resolver but never initialized on any unit
  definition despite contract §10 requiring it (fixed for the 8 units with
  `cargoSize`), and Last Stand's lethal-save mechanic
  (`checkLastStandHold`/`consumeLastStandHoldFormationWide`) had zero test
  coverage despite being fully implemented (added, items 74-76; item 77
  documented as currently vacuous -- no self-sacrifice mechanic exists yet).
  Pacing-audit re-run clean, no snapshot drift. Filed the 7 remaining
  deferred issues (#883-#889, A/B/D/E/F/G/I).

Each MR after MR1 gets its own dedicated design-spec-addendum-or-plan pair
written just before that MR starts, following this same
`docs/superpowers/specs/` + `docs/superpowers/plans/` convention — matching
how other multi-week arcs in this repo (e.g. the composition-root
decomposition, #787) are staged rather than fully pre-planned in one sitting.

## 11. Inline design review (contract §31 step 3)

### 11.1 First pass (whole-arc, at design time)

- **Fun**: overextension is telegraphed (unit-panel countdown, overlay,
  warnings) well before it bites — matches contract's stated goal of
  "inconvenient, not punishing" progression.
- **Age accessibility**: named Generals with portraits/fanfare are
  explicitly called the kid-friendliest surface in the contract's own July
  addendum; nothing in this mapping changes that.
- **Balance**: -10%/-1 move are modest, symmetric (human and AI identical),
  and flow through the existing modifier/pacing test infrastructure — no new
  balance surface invented outside what's already gated by
  `.claude/rules/game-balance.md`.
- **AI parity**: every helper in §6-§7 is designed to be the single source
  both UI and AI read — Finding 2's adaptation applies identically to AI
  movement/targeting decisions, so AI does not get to treat foreign
  territory differently than the player does.
- **Hot-seat privacy**: overlay and candidate selection reuse the existing
  per-civ `VisibilityMap` boundary (§3 table) — no new cross-civ data path
  is introduced.
- **Save compatibility**: every new field is optional; no migration deletes
  or renames existing fields.
- **Extensibility**: `GENERAL_DEFINITIONS` and the ability-evaluator split
  (§8) directly satisfy contract §14's "must support future Generals ...
  without redesigning the subsystem."
- **Content honesty**: §8 wires this into the existing test suites rather
  than inventing a parallel check.
- **SFX/assets**: deferred to issue I per contract §33; General
  spawn/retirement/Final-Command fanfare noted as backlog, not blocking.
- **Regression risk**: the single largest regression surface is Finding 1's
  Fort/Citadel reinterpretation touching `fortification-system.ts`'s
  existing combat-defense-multiplier consumers — MR1's test plan must
  include a regression asserting `resolveFortificationDefense`'s existing
  behavior is unchanged by the new supply-radius consumer of the same tier
  lookup.

### 11.2 Second pass — full inline review of the MR1 plan itself

Requested explicitly, across a wider dimension list, once MR1's plan
existed in enough detail to review concretely rather than in the abstract.
Two defects found here were real, not stylistic, and are fixed in the MR1
plan (`docs/superpowers/plans/2026-08-23-issue-544-mr1-core-supply.md`), not
just noted:

- **Correctness / new-mechanic fidelity (found & fixed):** the plan's first
  draft built `getRestAvailability` but never called it from the real
  `healUnit` call site (`turn-manager.ts:624`) — meaning issue #544's
  original, oldest ask ("no passive healing while unsupported") would have
  shipped completely unfixed while an unrelated new combat penalty went
  live instead. Fixed: MR1 Task 11 now gates the real heal loop with
  `getRestAvailability(unit.landSupply).canRest`, and the same predicate is
  reused (not duplicated) by MR2's future Rest-button disabled state.
- **UX / content honesty (found & fixed):** the -10%/-1-move penalty going
  live with zero visible feedback directly contradicts the contract's own
  July addendum ("silent healing changes read as bugs") and
  `.claude/rules/incremental-mr-completion.md`'s dead-end-UX prohibition.
  Fixed: MR1 Task 13 adds one truthful status line to the existing
  `selected-unit-info.ts` panel — not the full MR2 overlay, just enough that
  the mechanic is never silently live. This also fixed a related, smaller
  spec error: §8 originally said combat integration flows through
  `getCombatModifier`'s tech-gated `UNIT_MODIFIERS` table; that table is the
  wrong fit for a transient battlefield condition (it only understands
  tech/national-project/unit-type gates). The correct site, confirmed
  against real code, is `CombatContext`/`calculateCombatStrengths` — the
  same pattern `resolveFortificationDefense` already uses.
- **Architecture / SRP / SOLID (found & fixed):** the first draft's single
  `supply-system.ts` mixed ~10 unrelated responsibilities (participation,
  cost, territory, coverage, stabilization, primary-source, state-machine,
  recovery, naval-allocation, resolver-composition, combat-penalty,
  rest-availability) in one file, violating this project's CLAUDE.md
  ("Keep files focused and small — one clear responsibility per file") and
  general SRP. Fixed: split into six single-responsibility modules plus a
  thin composition root (§10's MR1 bullet lists them). Dependency direction
  is enforced one-way (`combat-*.ts`/`turn-manager.ts`/`selected-unit-info.ts`
  → `supply-*.ts`, never the reverse), so MR2 (UI) and MR5 (AI) stay pure
  consumers with no circular-import risk — this is the concrete SOLID
  Dependency-Inversion/Interface-Segregation payoff of the split, not just
  file-count tidiness.
- **TypeScript quality (found & fixed):** the first draft's
  `unitParticipatesInLandSupply` had a redundant `as UnitType` cast on an
  already-narrowed `Pick<Unit, 'type' | 'owner'>['type']` value — removed.
- **Testing accuracy (found & fixed):** the first draft's naval-allocation
  test referenced a non-existent `landSupplyCostOverrideForTest` property
  (would have failed TypeScript's excess-property check) and left it as
  dead, unused code in the test body — replaced with a real
  closest-first/skip-and-continue assertion using only real `Unit` fields.
  Separately, the combat-integration test referenced fabricated fixture
  helpers (`makeTestUnit`, `testMap`) that don't exist in
  `combat-system.test.ts` — replaced with the file's real, verified pattern
  (`createUnit`/`generateMap`/`mkC()`, the same one the existing
  "Fortification combat context" describe block already uses).
- **Difficulty modes (found & fixed a factual error, confirmed the design
  intent):** MR1's difficulty-invariance test originally referenced
  `state.settings.difficulty`, a field that **does not exist** in this
  codebase — difficulty is `GameState.opponentChallenge` /
  `Civilization.challenge`, typed as `OpponentChallenge = 'explorer' |
  'standard' | 'veteran'` (`src/core/types.ts:1529`). Fixed to use the real
  field. Separately confirmed by inspection: no function in Tasks 1-11 reads
  any difficulty representation at all, and Task 12 now locks that in with
  an explicit regression rather than leaving it as an implicit property.
- **AI / solo play:** confirmed no issue. `resolveLandSupplyForCiv` runs
  identically for every civ (human hot-seat and AI) inside the same
  per-round loop, after both AI major-civ moves (`processNonHumanMajorRound`)
  and all human hot-seat handoffs for the round have already resolved
  (`runCurrentCompletedRound` in `turn-flow-controller.ts:414`) — there is
  no ordering asymmetry between solo-vs-AI and hot-seat play. AI doesn't
  "know about" supply until MR5, but that's a knowledge gap, not a rules
  gap — the AI is bound by the identical mechanical penalty a human is, from
  MR1 onward, which is the fairness property contract §3.3/§25 requires.
- **Extensibility seam, documented not implemented (YAGNI honored):** MR4's
  Great General passive stabilization (contract §16) "pauses degradation"
  without granting Full Supply — a third input `advanceOverextensionStage`
  doesn't accept yet. Rather than add an unused `stabilizedByGeneral`
  parameter now (which nothing in MR1-MR3 would call), the MR1 plan documents
  the seam at the function definition so the eventual signature change in
  MR4 reads as planned, not as scope creep or a breaking surprise.
- **Data:** `landSupplyCost`/`landSupplyCapacity`/`projectsLandSupplyRange`
  confirmed independent of `cargoSize`/`cargoCapacity` at the type level (no
  derivation call site exists) and by an explicit test asserting the
  Transport's `landSupplyCapacity` numeric value matches its
  `cargoCapacity` only because both were *authored* that way, not because
  one reads the other.
- **Updating saved games:** confirmed no migration is needed (§8 above) —
  this was cross-checked against real precedent (`hasRoad`) rather than
  asserted from first principles, and against the `crisisForces`
  counter-example to make sure the distinction (optional-with-valid-absence
  vs. non-optional-needs-backfill) is the right one to apply here.
- **Loveability:** by design, MR1 alone has none of the arc's "loveable"
  surface (named Generals, portraits, fanfare) — that's intentional and
  documented in §10's MR1 bullet so nobody mistakes a quiet backend MR for a
  missed excitement opportunity. The one UI line MR1 does add is written in
  the exact vocabulary (`Full Supply — Memphis`, `Overextended — Stage 2 of
  3`) the eventual MR2/MR3 surfaces will reuse, so the "voice" of the
  feature is established honestly from its first player-visible moment
  rather than introduced piecemeal with inconsistent wording later.

### 11.3 Third pass — inline code review of the shipped MR1 implementation

Requested explicitly, after MR1's 12 implementation commits landed, across
the same wide dimension list applied to the earlier passes but now against
the real committed diff rather than the plan. Four real, confirmed defects
were found and fixed (not just noted), plus one naming clarity fix:

- **Performance (found & fixed):** `getLandSupplySourceCoverage` did a full
  `Object.values(state.map.tiles)` scan on every call, and
  `resolveLandSupplyForCiv` called it once *per participating unit* —
  turning one civ's per-round resolution into O(units × map size) instead
  of O(map size), directly contradicting contract §35's "avoid unbounded
  AI tile scans." Fixed: `getCivSupplySourceCandidates` precomputes a
  civ's stabilized cities and mature Fort coordinates once per round;
  `resolveLandSupplyForCiv` computes it once and threads it through both
  `getLandSupplySourceCoverage` and (for consistency, though it was never
  on the hot path) `getPrimarySupplySource`.
- **Correctness — dead-parameter bug (found & fixed):**
  `resolveSupplyRecoveryForUnit` tracked `suppliedTurnsSinceRecovery` but
  never actually gated the `'full'` state transition on it — it
  unconditionally cleared to `'full'` the instant `isSupplied` was true
  (outside a base tile), which only *looked* correct because
  `FIELD_RECOVERY_OWNER_TURNS` happens to currently equal 1. A future
  balance change to that constant would have been silently ignored. Fixed
  to gate on the real `>=` comparison; current behavior is unchanged at
  today's constant value, but the mechanism now actually depends on it.
- **Hot-seat/privacy (found & fixed):** the unit-panel status line
  (`getLandSupplyStatusText`) computed and rendered supply info — including
  a *named* primary source via `getPrimarySupplySource` — for **any**
  selected unit, friendly or enemy, with no ownership gate. This is
  inconsistent with the same file's own established convention a few lines
  below (`rolePresentation` is explicitly gated by
  `unit.owner === state.currentPlayer`) and could reveal an enemy's
  undiscovered Fort via the primary-source name. Fixed: the same ownership
  gate now applies, matching contract §26's "supply overlay never leaks
  enemy coverage" — this per-unit line is architecturally a
  miniature overlay for one unit.
- **Correctness — reinvented instead of reused (found & fixed):**
  `unitParticipatesInLandSupply`'s fallback derivation excluded only the
  `'civilian'` `UnitClass`, missing this codebase's own existing
  `isMilitaryUnitType` helper (`unit-modifier-definitions.ts`), which
  explicitly excludes both `'civilian'` *and* `'spy'`. All seven land-domain
  spy unit types (spy_scout through spy_hacker) were incorrectly treated as
  land-supply participants — accumulating overextension penalties and
  losing healing eligibility like line infantry, contradicting the
  codebase's own military/civilian/spy taxonomy. Fixed to reuse
  `isMilitaryUnitType` directly.
- **Naming clarity + a related edge case (found & fixed):** the resolver's
  `justEnteredBaseTile` variable was misleadingly named (it means "is
  currently on a base tile," true every turn while resident, not just the
  turn of arrival) and — more substantively — didn't check that the base
  tile was actually *stabilized*, so a unit standing on a freshly-captured,
  unstabilized city/fort could get the instant same-tile clear if a
  *different*, already-stabilized source also happened to cover that
  position. Renamed to `isOnStabilizedBaseTile` and now checks against the
  same precomputed, stabilization-filtered candidate lists the coverage
  check uses.

All four functional fixes are covered by new or corrected tests; the full
suite (8546+ tests) and production build were re-verified green after every
fix. See the "Third-pass code review" notes in
`docs/superpowers/plans/2026-08-23-issue-544-mr1-core-supply.md`'s
Self-Review Notes section for the exact commits.

## 12. Definition of done for this spec doc

This doc is complete when a reader with zero prior context on #544 can:
answer "why doesn't this look like the original design doc says" for both
findings in §4, name the exact function/file for every canonical helper
listed in §3 and §6, and know which MR to open next. It is not a substitute
for the full product contract — that document's ~90-scenario test matrix
(its §30) is the authoritative acceptance list for the whole arc and is not
duplicated here.
