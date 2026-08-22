# Helicopter Air Assault — Design Spec (#543 Phase 2)

**Issue:** #543 ("design(combat): airborne operations — paratroopers + helicopter air assault")
**Status:** Design approved 2026-08-21 (architecture + range confirmed by user). Not yet implemented.
**Depends on:** Phase 1 (Paratroopers, merged — `docs/superpowers/specs/2026-08-21-airborne-paratroopers-design.md`), #539 (air power rework, merged), #540 (transport/amphibious, merged).

## 1. Why this doc exists

Phase 1's §18 explicitly deferred helicopter air assault and named the reason: the July issue's "helicopters gain `cargoCapacity: 1`" sketch does not fit current architecture. This doc re-audits current `main` (post Phase 1) and designs Phase 2 from what's actually there, not from the stale July sketch.

## 2. Current-state audit (2026-08-21, against Phase 1's merge commit)

- **Helicopters today:** only `attack_helicopter` exists (era 11, `helicopter-warfare` tech, `trainedFromBuilding: 'helicopter_base'`). `strength: 40`, `domain: 'air'`, ranged attack range 2. `airOperation: { baseKinds: ['helicopter_base'], operationalRange: 4, ferryRange: 8, missions: ['strike', 'rebase'] }`. No cargo field exists on it or anywhere else. Combat role (`combat-role-definitions.ts`): `role('anti-armor', 'Mobile air attacker that punishes armored land formations.', ...)` — a pure gunship identity, confirmed.
- **Transport system (`transport-system.ts`) is still naval-specific**, confirmed unchanged from Phase 1's audit: `isTransport()` is hardcoded `domain === 'naval' && cargoCapacity !== undefined`; unload legality (`isCoastalLandDestination`) requires shoreline adjacency, meaningless for an inland air drop; embarked-assault lets cargo attack from the carrier tile. Bolting `cargoCapacity` onto Attack Helicopter would either misapply coastal logic inland or fork this file. **Confirmed still not a clean fit.**
- **Air-basing (`air-operations-system.ts`) already provides the missing piece.** `attack_helicopter` occupies a roster slot at its `helicopter_base` (`getAirBaseRoster`/`getAirBaseCapacity`, cap 2). `resolveAirStrike` proves the pattern this feature needs: a based aircraft resolves a mission (interception first, then the mission's own effect) **without ever leaving its base position** — the striker's `position` is untouched throughout; only `movementPointsLeft: 0, hasMoved: true, hasActed: true` are applied at the end. This is exactly the "helicopter provides transport capability without physically making the trip on the map" shape the brief asks about — it's already the established idiom, not a new one.
- **Paradrop (`airborne-system.ts`, Phase 1) is the direct template.** `getParadropLaunchState → getParadropTargets → canParadrop → executeParadrop`, called identically by UI, AI ranking, and AI execution. Landing tile legality = visible + passable + unoccupied + not-a-foreign-unallied-city (reusing `isBlockingCityFor`, generalized in Phase 1 Task 1). Landing lockout = `hasActed/hasMoved/movementPointsLeft`, no new persisted field. Flak (`getHostileAirDefenseThreat`, new in Phase 1) resolves before interception (`selectInterceptor`, reused unchanged from #539) against the unit **at its destination**, not its launch point — Phase 1's post-implementation review caught and fixed a bug where combat context was built from the stale pre-drop position; this bug class is worth guarding against again here.
- **No existing "infantry-only" typed predicate.** `UnitClass: 'gunpowder'` (`unit-modifier-definitions.ts`) is too broad — it also covers `cannon`, `artillery`, `rocket_artillery`, `mobile_aa`, `anti_tank_gun`. Passenger eligibility needs an explicit new field, not a reused class.
- **No overlap with #547.** Grepped `paratroop|airborne|paradrop|air.?assault|helicopter.?transport` across `src/`/`tests/`/`docs/` — nothing beyond Phase 1's own paradrop work and one unrelated flavor-text line (`armored_car`'s `domainTransitionReason` narrative string, not a mechanic). #547's recent commits touched sprite de-aliasing only.

## 3. Architecture decision

**Explicit Air Assault action, mirroring Paradrop's shape — not persistent cargo, not a new unit.** Confirmed with the user directly against the three live options:

- **Persistent cargo (rejected, again):** transport-system's naval assumptions still don't fit; would require forking `isCoastalLandDestination` and inventing new rules for "can a loaded gunship attack," "what happens to cargo on interception," etc. — real problems Phase 1 already flagged and current code hasn't changed.
- **Dedicated Transport Helicopter unit (rejected for this phase):** cleaner unit-identity story, but adds a full new unit's tech/era/production/AI-catalog/sprite/balance surface for a capability the existing unit can host without diluting its combat identity, per the mutual-exclusivity rule below.
- **Explicit action reusing Attack Helicopter (chosen):** confirmed by the user. Air Assault consumes the helicopter's turn (same `hasActed` lockout `resolveAirStrike` already applies to a striking helicopter) — it cannot also attack that turn. This keeps Attack Helicopter's combat stats and role untouched; the mutual exclusivity is what prevents it from becoming "strictly better than a dedicated land unit + transport combination."

```
eligible infantry-class passenger
      +
standing in a friendly city with an available, un-acted Attack Helicopter
based at its Helicopter Base
      +
visible, legal landing tile within the helicopter's operational range
      ↓
   air assault (flak check → interception check → relocation)
      ↓
passenger lands with 0 movement, cannot act again this turn
helicopter consumes its turn (cannot also attack/rebase/intercept)
      ↓
passenger vulnerable until the acting civ's next turn
```

Not in scope (matching Phase 1's non-goals): free teleportation, blind drops into fog, instant city capture, guaranteed backline kills, bypassing ZOC/occupancy/city-siege rules, an infinite-shuttle helicopter, a second independent air-defense system.

## 4. Distinction from Paradrop

| | Paradrop | Air Assault |
|---|---|---|
| Passenger | Paratrooper only (has its own `paradrop` capability) | Any `airAssaultPassengerEligible` land unit (§5) |
| Launch requirement | Standing in a friendly Airfield city | Standing in a friendly Helicopter Base city **with an available, un-acted Attack Helicopter in its roster** |
| Range source | Passenger's own `paradrop.range` (4) | The helicopter's existing `airOperation.operationalRange` (4) — **confirmed with the user: reuse as-is, no new number.** The distinction between the two verbs is base kind, era (9 vs 11), and passenger breadth, not range. |
| Era | 9 (`air-superiority`) | 11 (`helicopter-warfare`, already gates Attack Helicopter) |
| Vehicle consumed | N/A — Paratrooper is the unit itself | Yes — the launching Attack Helicopter is locked out for the turn |
| What relocates | Paratrooper | Passenger only; the helicopter stays at its base (matches `resolveAirStrike`'s striker-stays-put pattern) |

This gives two verbs with genuinely different tactical footprints (who can use them, what it costs) without inventing an arbitrary range gap.

**Balance guardrail — range coupling is a deliberate tradeoff, flagged so it isn't silently forgotten.** Because Air Assault's range reads `attack_helicopter.airOperation.operationalRange` live rather than storing its own number, a future combat-balance change to that field (tuning the helicopter's strike/rebase range) will retune Air Assault's range too, with no separate review step. Add a code comment at the `operationalRange: 4` definition site noting this dependency, and add a balance-test line item (§13) asserting Air Assault does not strictly dominate Paradrop at era 11 baseline — if a future `operationalRange` change makes it dominate, that test should fail loudly rather than the drift going unnoticed. Not a "movement bonus" for the purposes of `.claude/rules/game-balance.md`'s stacking table — it's a one-time positional relocation, not a per-turn movement-point buff, so that table is out of scope here.

## 5. New capability fields

On `UnitDefinition`, immediately after `paradrop?: ParadropCapability`:

```ts
export interface AirAssaultCapability {
  /** Building kinds this unit's air-base roster can launch an assault from. */
  baseKinds: Array<'helicopter_base'>;
}
```

`attack_helicopter.airAssault = { baseKinds: ['helicopter_base'] }`. Deliberately does **not** carry its own `range` field — range is read from the same unit's existing `airOperation.operationalRange` at call time, so the two numbers can never drift out of sync by editing one and forgetting the other.

Passenger eligibility is a separate boolean, not derived from `UnitClass` (§2's finding):

```ts
  airAssaultPassengerEligible?: true;
```

Set on the historical infantry lineage: `musketeer`, `grenadier`, `rifleman`, `machine_gunner`, `infantry`, `mechanized_infantry`, `exosuit_infantry`, `marine`, `paratrooper`. Excluded explicitly (and why): `mobile_aa`/`anti_tank_gun`/`cannon`/`artillery`/`rocket_artillery` (support weapons and siege, not line infantry — same instinct that keeps them out of `paradrop`), all `mounted`/`armor` units (tanks/cavalry — the brief's explicit exclusion), `settler`/`worker` (no stated need, keeps scope tight), all naval/air/recon/spy/civilian units. Paratrooper is included — it's still line infantry when not actively paradropping, and there's no correctness reason to special-case it out; using it for Air Assault on a turn it isn't paradropping is just an ordinary redeployment.

## 6. Airborne-system refactor: shared landing-legality + shared combat resolution

To avoid duplicating Phase 1's fog/occupancy/terrain/city-blocking filter and its flak→interception→notify sequencing (both are non-trivial and both need to behave identically for Air Assault), `airborne-system.ts` is extended, not duplicated:

- Extract the body of `getParadropTargets`'s filter callback into a shared `isLegalAirborneLandingTile(state, unit, coord, occupancy)` used by both `getParadropTargets` and the new `getAirAssaultTargets`.
- Extract `executeParadrop`'s flak+interception+notify sequence (destination-relocation-first, flak damage, interception against the relocated unit, notification to both civs) into a shared `resolveAirborneLanding(state, unit, destination, verbLabel)` helper returning the same `{flak?, interception?}` shape, called by both `executeParadrop` and the new `executeAirAssault`. `verbLabel` (`'paradropped'` vs 'was flown in by helicopter') only affects notification text, not mechanics — this is exactly the "small shared helper," not a "huge DSL," the brief warns against overbuilding.

New exports:

```ts
export type AirAssaultFailureReason =
  | 'not-eligible-passenger' | 'no-launch-helicopter' | 'already-acted'
  | 'out-of-range' | 'unexplored' | 'impassable-terrain'
  | 'destination-occupied' | 'foreign-city';

export function getAirAssaultLaunchState(state: GameState, unitId: string): { ok: true; helicopterId: string } | { ok: false; reason: AirAssaultFailureReason };
export function getAirAssaultTargets(state: GameState, unitId: string): HexCoord[];
export function canAirAssault(state: GameState, unitId: string, destination: HexCoord): { ok: true } | { ok: false; reason: AirAssaultFailureReason };
export function executeAirAssault(state: GameState, unitId: string, destination: HexCoord): AirAssaultResult;

export type AirAssaultResult =
  | { ok: true; state: GameState; helicopterId: string; flak?: { damage: number; providerId: string; providerLabel: string }; interception?: { interceptorId: string; result: CombatResult } }
  | { ok: false; state: GameState; reason: AirAssaultFailureReason };
```

`getAirAssaultLaunchState` returns the `helicopterId` it would use (deterministic pick: lowest unit id among the launch city's roster with `!hasActed`), so the executor and preview UI agree on which helicopter without a player-facing picker — kept out of scope per "remains lightweight," and revisit only if playtesting shows players want to reserve a specific helicopter.

### Launch requirement

Unit must be `airAssaultPassengerEligible`, not `hasActed`, with movement remaining, standing on a friendly city tile that has `'helicopter_base'` in `city.buildings`, **and** that city's `getAirBaseRoster({kind:'city', cityId})` must contain at least one unit with `!hasActed` **and `UNIT_DEFINITIONS[u.type].airAssault` defined** (checking `airAssault`, not the unit's own type name — this is the generalization point that lets a future `airAssault`-capable unit participate with zero code change, per §5). This filter matters concretely today: `helicopter_base` is also a valid base for `combat_drone` (`combat_drone.airOperation.baseKinds` includes `'helicopter_base'`), and Combat Drone has no `airAssault` capability — it must never be silently picked as the launch vehicle even though it shares the same roster. If the base has helicopters but all eligible ones have already acted, reason is `'no-launch-helicopter'` — distinct from `'no-launch-base'` so the UI can say "your helicopters here have already acted" rather than "you need a Helicopter Base."

A helicopter currently on `intercept` stance is automatically excluded from the picker for free: `startIntercept` already sets `hasActed: true` the moment the stance is chosen (`air-operations-system.ts`), so the `!hasActed` filter above naturally protects standing air-defense duty from being silently pulled for an assault. This is an existing-code invariant this feature relies on, not new logic — worth a regression test (§13) proving it explicitly rather than trusting it by inspection.

### Landing legality

Identical rule set to Paradrop (§6 of the Phase 1 spec, reused via the shared helper in §6 above): visible, passable land, unoccupied, not a foreign-unallied city tile. Enemy-adjacency is not independently restricted, for the same reason Phase 1 gives — the landing lockout plus flak/interception are the counterplay.

### Execution

1. Confirm `canAirAssault`.
2. Resolve the shared `resolveAirborneLanding` (relocate passenger to destination first, then flak, then interception — see §2's note on the position-before-combat ordering bug Phase 1 caught).
3. Apply the passenger's landing lockout (`movementPointsLeft: 0, hasMoved: true, hasActed: true`) if it survived.
4. Apply the **helicopter's** own lockout (`movementPointsLeft: 0, hasMoved: true, hasActed: true`) unconditionally (it flew the mission regardless of the passenger's fate) — this is the mechanism that makes Air Assault mutually exclusive with the helicopter attacking, rebasing, or intercepting that same turn, protecting its combat identity per §3.
5. `notifyAirborneOutcome` (generalized from Phase 1's `notifyParadropOutcome`) fires for the dropping civ always, and for a hostile civ that can currently see the landing tile — same viewer-scoped rule.

## 7. Flak and interception

Unchanged reuse of Phase 1's mechanism via the shared helper in §6: `getHostileAirDefenseThreat` for deterministic flak chip damage, `selectInterceptor`/`resolveCombat` for interception, both applied to the **passenger** at the landing tile — the helicopter itself is never a target of either, matching how the abstraction already treats the "flight in" as instantaneous (the same abstraction level Paradrop already uses; neither verb models a transport vehicle taking fire mid-flight, only at the landing zone). No new anti-air mechanic.

**Considered and rejected: modeling risk to the helicopter itself** (e.g. a chance the helicopter is damaged/shot down mid-mission, independent of the passenger's fate). Rejected for two reasons: (1) it would break the "no fuel/ammo bookkeeping, lightweight" goal by adding a second risk roll players have to reason about per mission, on top of the passenger's own flak/interception; (2) it has no precedent in the existing air-mission abstraction — a striking aircraft in `resolveAirStrike` faces interception at its *target*, never at its own base, so a "helicopter takes damage for merely flying a mission" rule would be a new risk class invented for this feature alone rather than a reuse. If playtesting shows Air Assault feels risk-free for the helicopter side specifically, revisit as a follow-up rather than building it in now without evidence.

**AI defense against enemy Air Assault — explicitly deferred, not silently absent**, mirroring Phase 1's identical §12 guard for Paradrop. Proactively countering a *hostile* Air Assault (e.g. an AI civ stationing extra AA specifically because it detected an enemy Attack Helicopter roster nearby) is out of scope for this phase. The existing interceptor-stance AI and ground-AA production already provide the same incidental counterplay they provide against Paradrop today — no evidence yet that this specific verb needs a dedicated "remembered airborne threat" response beyond what already exists. Revisit only if real games show it's needed, same standard Phase 1 set.

## 8. Player preview and UI

Contextual "Air Assault" button in `src/ui/selected-unit-info.ts`, beside the existing Paradrop button, wired through `selection-controller.ts`/`map-interaction-controller.ts` using the same `pendingIntent`/highlight/cancel flow (`{kind: 'air-assault', unitId}` added to `PendingMapIntent` in `ports.ts`, and to the `ResolvablePendingIntent` union in `map-tap-intent.ts`, mirroring `'paradrop'`'s two-line addition exactly).

**Visibility is type-gated, exactly like the existing Paradrop button** (`selected-unit-info.ts` only renders the Paradrop button at all when `def.paradrop` is set — never a disabled button on a non-Paratrooper unit). The Air Assault button follows the identical pattern: rendered only when `def.airAssaultPassengerEligible` is set on the selected unit's definition, and only then does it go on to show enabled/disabled-with-reason based on `getAirAssaultLaunchState`. This is a clarification of existing convention, not a new UI pattern — it's what keeps the panel uncluttered for tanks, workers, and ships, which never see the button at all.

**Both buttons can be visible at once.** A Paratrooper standing in a city that has both an Airfield and a Helicopter Base (with an available helicopter) sees Paradrop *and* Air Assault simultaneously — both are legitimately legal, and the player picks based on the tradeoff (Paradrop's own fixed capability vs. spending a helicopter's turn). No special-case code is needed to prevent double-use in the same turn: using either sets the unit's `hasActed`, which the other button's `getXLaunchState` check already reads, so the second option naturally becomes disabled the instant the first resolves. The two buttons must use visually distinct icons/colors (not just label text) so a young player scanning the panel doesn't conflate them — reusing Paradrop's existing button-color convention (`'#7c3aed'`) is fine for Paradrop; Air Assault should get its own distinct color, not the same one.

Preview text: "Air Assault here — Range: N (via [Attack Helicopter's roster city])." / "Lands with no movement and cannot act again this turn." / "This will use one of your Attack Helicopters at [city] — it won't be able to attack this turn." / known flak risk, same plain-language-gloss rule as Paradrop (`"Anti-aircraft fire nearby (SAM Site) — expect -N HP on landing"`, not a bare `"Flak: -N"`). Disabled-reason text distinguishes `'no-launch-base'` ("station an Attack Helicopter at a Helicopter Base here") from `'no-launch-helicopter'` ("your helicopters here have already acted this turn"). After a successful mission, the helicopter's own panel (when selected) shows the ordinary "already acted" disabled state every other used-up unit already shows — no bespoke copy needed there.

## 9. AI

New `rankAirAssault(context, unit)` in `ai-tactics.ts`, alongside `rankParadrop`, spread into the same `rankUnitTacticalActions` aggregator — new `AITacticalAction` variant `{kind: 'air-assault', unitId, destination}`, executed through the same `canAirAssault`/`executeAirAssault` the player uses. Candidate destinations come only from `getAirAssaultTargets`, so the AI cannot target unseen tiles, matching Paradrop's proof. Same scoring shape as `rankParadrop` (reinforcement, flank, objective value, discounted by known flak/interceptor risk), and the same explicit difficulty-leak guard: no tier may see hidden risk data, only reweight legal/visible candidates.

**Additional scoring factor Paradrop doesn't need: opportunity cost of the specific helicopter being spent.** Paradrop has no equivalent because a Paratrooper's only job is the drop. Attack Helicopter is a real combat piece the AI would otherwise keep available for anti-armor duty or defense, so `rankAirAssault` must discount the mission's score by that helicopter's local combat value this turn — concretely, reduce the score when the launch city's roster helicopter is the *only* one at that base and there is a known enemy armor/siege threat within its `operationalRange` that it could otherwise engage or that threatens the base city itself. Without this, the AI would happily spend a helicopter's turn on a marginal reinforcement while leaving its own city undefended against armor the same helicopter could have intercepted or struck. This is scored, not a hard legality block (per the "difficulty may only change weights, never legality" guard) — a desperate-enough reinforcement should still be able to outweigh the discount.

AI production: no change needed to `ai-production.ts`'s Attack Helicopter scoring. Because Air Assault only consumes an already-produced helicopter's turn rather than changing its stats or production cost, the unit's production case for AI remains "anti-armor gunship" — Air Assault is a situational secondary use of a unit already worth producing, not a reason to reweight how many get built. (Considered and rejected: adding drop-opportunity-aware production weighting, the way Phase 1 did for Paratrooper — that was needed there because Paratrooper's *only* value is the drop and its combat stats stay flat forever; Attack Helicopter's combat value doesn't decay the same way, so no equivalent risk exists here.)

## 10. Difficulty, hot-seat, save

Identical contracts to Phase 1, reusing the same mechanisms:
- Difficulty changes only AI scoring weights, never legality/visibility/flak/interception/lockout.
- Hot-seat: pendingIntent-scoped highlights, per-civId-visibility-scoped flak preview (explicit two-civ discovery-isolation test, same as Phase 1's sharpest case), viewer-scoped notifications.
- Save: no new persisted field. Passenger lockout reuses `hasActed`/`hasMoved`/`movementPointsLeft` (already round-tripped); helicopter lockout reuses the same fields the game already persists for every air unit. **No schema migration.** The new capability fields (`airAssault`, `airAssaultPassengerEligible`) live on `UNIT_DEFINITIONS` — static code data keyed by `UnitType`, not on any `Unit` instance — so they apply retroactively to units in saves created before this feature shipped with zero migration and zero version check; a pre-existing save's `attack_helicopter` or `infantry` units simply gain the capability the moment this code loads, the same way any other `UNIT_DEFINITIONS` balance tweak already applies to old saves today.

## 11. SFX

Missing from this doc's first draft — added explicitly per Phase 1's §16 precedent, same reuse-first approach:

- Successful landing reuses the existing unit-relocation SFX (same one Paradrop and transport unload already use) — no new asset required to ship.
- Interception reuses the existing air-combat SFX path (shared with Paradrop's interception branch and `resolveAirStrike`'s) — not a new sound.
- Flak damage reuses the existing unit-damage SFX, not a bespoke one.
- The launching helicopter's own action-consumption (going from available to `hasActed`) does not need its own SFX — no other "unit used its action" transition in this codebase plays a dedicated sound either (e.g. `resolveAirStrike`'s striker doesn't get an extra cue beyond the strike's own combat SFX).
- A dedicated rotor/insertion sting is later polish, not a Phase-2 blocker, following the same era 6-12 incremental-SFX convention Phase 1 used — the fallback path (generic move SFX when the dedicated one doesn't exist) must be the actual code path exercised at launch, not a TODO.

## 12. Content honesty

- `UNIT_DESCRIPTIONS.attack_helicopter` gets an added sentence describing the new capability honestly: it can fly one Air Assault mission per turn to redeploy eligible infantry from its Helicopter Base, but cannot also attack that turn. Must not claim it "carries" or "transports" troops as persistent cargo — the mechanic is an action, not embarkation, and the description must say so accurately (no "Load infantry aboard" language).
- `combat-role-definitions.ts`'s `attack_helicopter` entry gets an added `publicFacts` line noting the mutual-exclusivity rule, so the in-game role panel doesn't silently omit a mechanic that changes how the unit is used.
- New `UNIT_DESCRIPTIONS` additions for the newly-`airAssaultPassengerEligible` units are **not** required — their own descriptions describe their combat role; being air-assault-eligible is a capability of the *helicopter's* action, not a property those units need to advertise about themselves (same as how being a valid `getEmbarkedAssaultTarget` cargo unit isn't called out in every eligible land unit's own text today).

## 13. Test matrix (delta from Phase 1's — see that spec's §20 for the shared shape)

- **Eligibility**: non-`airAssaultPassengerEligible` unit rejected (`not-eligible-passenger`); city with `helicopter_base` but no roster helicopter rejected (`no-launch-base`); city with a roster helicopter that has all already acted rejected (`no-launch-helicopter`, distinct reason from Paradrop's single `no-launch-base`); already-acted passenger rejected.
- **Vehicle picker correctness**: a Combat Drone sharing the same `helicopter_base` roster is never selected as the launch vehicle (it has no `airAssault` capability) — explicit regression for §6's roster-filter fix; a helicopter on `intercept` stance is never auto-picked, because `startIntercept` already sets `hasActed: true` — explicit regression proving this existing-code invariant rather than trusting it by inspection.
- **Vehicle lockout**: launching Attack Helicopter gets `hasActed: true` after a successful Air Assault; a second Air Assault attempt from the same city in the same turn either fails (single-helicopter roster) or uses the other roster helicopter (two-helicopter roster) — both cases covered; helicopter cannot also `resolveAirStrike`/`rebaseAircraft`/`startIntercept` after flying an assault this turn.
- **Range/fog/terrain/occupancy/foreign-city**: identical shape to Phase 1's Paradrop matrix, run against `getAirAssaultTargets`/`canAirAssault`.
- **Position-before-combat regression**: explicit test that interception against the passenger uses the destination tile's combat context, not the launch city's (same bug class Phase 1's post-implementation review caught and fixed for Paradrop — verify the shared helper doesn't reintroduce it here).
- **Flak/interception**: same deterministic-damage, stacking-dedup, sequencing, and hidden-threat-still-applies coverage as Phase 1, run against `executeAirAssault`.
- **Dual-eligibility interaction (Paratrooper)**: a Paratrooper in a city with both an Airfield and a Helicopter Base can Paradrop *or* Air Assault; using either sets `hasActed` and the other option's `getXLaunchState` correctly reports `already-acted` afterward — proves the "no special-case code needed" claim in §8 rather than assuming it.
- **AI**: `rankAirAssault` legal-only candidates, fog-safe, difficulty-leak guard (`identical legal-target set across difficulty tiers`), does not distort Attack Helicopter production scoring (assert `ai-production.ts` candidate weight for `attack_helicopter` unaffected by `airAssault` capability presence — a direct regression for §9's "considered and rejected" claim), and the opportunity-cost discount: a fixture with a single roster helicopter and a known nearby armor threat scores materially lower than the identical fixture with no threat present.
- **Hot-seat**: two-civ discovery-isolation case for Air Assault's flak preview, mirroring Phase 1's explicit test; pendingIntent/highlight cleanup on seat handoff for the new `'air-assault'` intent kind.
- **Solo play** (single human vs. AI, distinct from the hot-seat human-vs-human cases above): AI-triggered Air Assault fires the same `notifyAirborneOutcome` viewer-scoped notification path a human trigger does (parity regression per `end-to-end-wiring.md`'s "shared state mutations must be actor-complete" rule); human-triggered Air Assault against an AI civ correctly withholds undiscovered-AA preview data from the human the same way it would from another human.
- **Save**: post-assault state (passenger position + lockout, helicopter lockout) round-trips; both clear correctly via real `processTurn`, not hand-set flags; a save created before this feature existed loads correctly with the new capability fields already active (definitional-data claim from §10, verified against an actual pre-feature fixture rather than assumed).
- **Regression**: Paradrop, `resolveAirStrike`, `rebaseAircraft`, #539 interception, #540 transport/amphibious all unchanged. Explicit assertion that `executeParadrop`'s existing behavior is unchanged after the `resolveAirborneLanding` extraction (byte-identical outcomes for the same fixture, before/after refactor).
- **Balance**: statistical/representative-situation coverage per Phase 1's §17 pattern — reinforcing a threatened city, crossing a river/mountain chokepoint, dropping near enemy armor, assault under SAM/flak coverage, an island map, AI offense/defense, hot-seat. Confirm Air Assault is a meaningful alternative to Paradrop (different unit pool, different era-11 availability window) **without strictly dominating it** — explicit test comparing the two verbs' effective value at era-11 baseline (accounting for Air Assault's helicopter-opportunity-cost and Helicopter-Base-roster prerequisite against Paradrop's free-standing dedicated-unit cost) so the range-coupling risk flagged in §4 has a concrete tripwire, not just a code comment. Also confirm Attack Helicopter's production case doesn't skew purely toward "assault enabler" at the expense of its anti-armor role.

## 14. Phasing

Single phase (this is already Phase 2 of the #543 arc). Suggested task breakdown for the implementation plan: (1) extract shared landing-legality + landing-combat-resolution helpers from Phase 1's code with a byte-identical-behavior regression test, (2) new capability fields + `attack_helicopter`/passenger-lineage wiring, (3) `getAirAssaultLaunchState`/`getAirAssaultTargets`/`canAirAssault`, (4) `executeAirAssault` using the shared helpers + vehicle lockout, (5) AI (`rankAirAssault` + execution wiring), (6) UI (button, preview, pendingIntent plumbing), (7) hot-seat/save/balance test passes + content honesty updates, (8) full-suite run and post-implementation review (per Phase 1's precedent of finding real bugs only after the full diff existed).
