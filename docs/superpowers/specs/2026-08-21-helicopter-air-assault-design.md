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
| Passenger | Paratrooper only (has its own `paradrop` capability) | Any `airAssaultPassengerEligible` land unit (§6) |
| Launch requirement | Standing in a friendly Airfield city | Standing in a friendly Helicopter Base city **with an available, un-acted Attack Helicopter in its roster** |
| Range source | Passenger's own `paradrop.range` (4) | The helicopter's existing `airOperation.operationalRange` (4) — **confirmed with the user: reuse as-is, no new number.** The distinction between the two verbs is base kind, era (9 vs 11), and passenger breadth, not range. |
| Era | 9 (`air-superiority`) | 11 (`helicopter-warfare`, already gates Attack Helicopter) |
| Vehicle consumed | N/A — Paratrooper is the unit itself | Yes — the launching Attack Helicopter is locked out for the turn |
| What relocates | Paratrooper | Passenger only; the helicopter stays at its base (matches `resolveAirStrike`'s striker-stays-put pattern) |

This gives two verbs with genuinely different tactical footprints (who can use them, what it costs) without inventing an arbitrary range gap.

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

Unit must be `airAssaultPassengerEligible`, not `hasActed`, with movement remaining, standing on a friendly city tile that has `'helicopter_base'` in `city.buildings`, **and** that city's `getAirBaseRoster({kind:'city', cityId})` must contain at least one `attack_helicopter` (or any future `airAssault`-capable unit) with `!hasActed`. If the base has helicopters but all have already flown/attacked this turn, reason is `'no-launch-helicopter'` — distinct from `'no-launch-base'` so the UI can say "your helicopters here have already acted" rather than "you need a Helicopter Base."

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

## 8. Player preview and UI

Contextual "Air Assault" button in `src/ui/selected-unit-info.ts`, beside the existing Paradrop button, wired through `selection-controller.ts`/`map-interaction-controller.ts` using the same `pendingIntent`/highlight/cancel flow (`{kind: 'air-assault', unitId}` added to `PendingMapIntent` in `ports.ts`, and to the `ResolvablePendingIntent` union in `map-tap-intent.ts`, mirroring `'paradrop'`'s two-line addition exactly).

Preview text: "Air Assault here — Range: N (via [Attack Helicopter's roster city])." / "Lands with no movement and cannot act again this turn." / "This will use one of your Attack Helicopters at [city] — it won't be able to attack this turn." / known flak risk, same plain-language-gloss rule as Paradrop (`"Anti-aircraft fire nearby (SAM Site) — expect -N HP on landing"`, not a bare `"Flak: -N"`). Disabled-reason text distinguishes `'no-launch-base'` ("station an Attack Helicopter at a Helicopter Base here") from `'no-launch-helicopter'` ("your helicopters here have already acted this turn").

## 9. AI

New `rankAirAssault(context, unit)` in `ai-tactics.ts`, alongside `rankParadrop`, spread into the same `rankUnitTacticalActions` aggregator — new `AITacticalAction` variant `{kind: 'air-assault', unitId, destination}`, executed through the same `canAirAssault`/`executeAirAssault` the player uses. Candidate destinations come only from `getAirAssaultTargets`, so the AI cannot target unseen tiles, matching Paradrop's proof. Same scoring shape as `rankParadrop` (reinforcement, flank, objective value, discounted by known flak/interceptor risk), and the same explicit difficulty-leak guard: no tier may see hidden risk data, only reweight legal/visible candidates.

AI production: no change needed to `ai-production.ts`'s Attack Helicopter scoring. Because Air Assault only consumes an already-produced helicopter's turn rather than changing its stats or production cost, the unit's production case for AI remains "anti-armor gunship" — Air Assault is a situational secondary use of a unit already worth producing, not a reason to reweight how many get built. (Considered and rejected: adding drop-opportunity-aware production weighting, the way Phase 1 did for Paratrooper — that was needed there because Paratrooper's *only* value is the drop and its combat stats stay flat forever; Attack Helicopter's combat value doesn't decay the same way, so no equivalent risk exists here.)

## 10. Difficulty, hot-seat, save

Identical contracts to Phase 1, reusing the same mechanisms:
- Difficulty changes only AI scoring weights, never legality/visibility/flak/interception/lockout.
- Hot-seat: pendingIntent-scoped highlights, per-civId-visibility-scoped flak preview (explicit two-civ discovery-isolation test, same as Phase 1's sharpest case), viewer-scoped notifications.
- Save: no new persisted field. Passenger lockout reuses `hasActed`/`hasMoved`/`movementPointsLeft` (already round-tripped); helicopter lockout reuses the same fields the game already persists for every air unit. **No schema migration.**

## 11. Content honesty

- `UNIT_DESCRIPTIONS.attack_helicopter` gets an added sentence describing the new capability honestly: it can fly one Air Assault mission per turn to redeploy eligible infantry from its Helicopter Base, but cannot also attack that turn. Must not claim it "carries" or "transports" troops as persistent cargo — the mechanic is an action, not embarkation, and the description must say so accurately (no "Load infantry aboard" language).
- `combat-role-definitions.ts`'s `attack_helicopter` entry gets an added `publicFacts` line noting the mutual-exclusivity rule, so the in-game role panel doesn't silently omit a mechanic that changes how the unit is used.
- New `UNIT_DESCRIPTIONS` additions for the newly-`airAssaultPassengerEligible` units are **not** required — their own descriptions describe their combat role; being air-assault-eligible is a capability of the *helicopter's* action, not a property those units need to advertise about themselves (same as how being a valid `getEmbarkedAssaultTarget` cargo unit isn't called out in every eligible land unit's own text today).

## 12. Test matrix (delta from Phase 1's — see that spec's §20 for the shared shape)

- **Eligibility**: non-`airAssaultPassengerEligible` unit rejected (`not-eligible-passenger`); city with `helicopter_base` but no roster helicopter rejected (`no-launch-base`); city with a roster helicopter that has all already acted rejected (`no-launch-helicopter`, distinct reason from Paradrop's single `no-launch-base`); already-acted passenger rejected.
- **Vehicle lockout**: launching Attack Helicopter gets `hasActed: true` after a successful Air Assault; a second Air Assault attempt from the same city in the same turn either fails (single-helicopter roster) or uses the other roster helicopter (two-helicopter roster) — both cases covered; helicopter cannot also `resolveAirStrike`/`rebaseAircraft`/`startIntercept` after flying an assault this turn.
- **Range/fog/terrain/occupancy/foreign-city**: identical shape to Phase 1's Paradrop matrix, run against `getAirAssaultTargets`/`canAirAssault`.
- **Position-before-combat regression**: explicit test that interception against the passenger uses the destination tile's combat context, not the launch city's (same bug class Phase 1's post-implementation review caught and fixed for Paradrop — verify the shared helper doesn't reintroduce it here).
- **Flak/interception**: same deterministic-damage, stacking-dedup, sequencing, and hidden-threat-still-applies coverage as Phase 1, run against `executeAirAssault`.
- **AI**: `rankAirAssault` legal-only candidates, fog-safe, difficulty-leak guard (`identical legal-target set across difficulty tiers`), does not distort Attack Helicopter production scoring (assert `ai-production.ts` candidate weight for `attack_helicopter` unaffected by `airAssault` capability presence — a direct regression for §9's "considered and rejected" claim).
- **Hot-seat**: two-civ discovery-isolation case for Air Assault's flak preview, mirroring Phase 1's explicit test.
- **Save**: post-assault state (passenger position + lockout, helicopter lockout) round-trips; both clear correctly via real `processTurn`, not hand-set flags.
- **Regression**: Paradrop, `resolveAirStrike`, `rebaseAircraft`, #539 interception, #540 transport/amphibious all unchanged. Explicit assertion that `executeParadrop`'s existing behavior is unchanged after the `resolveAirborneLanding` extraction (byte-identical outcomes for the same fixture, before/after refactor).
- **Balance**: statistical/representative-situation coverage per Phase 1's §17 pattern — reinforcing a threatened city, crossing a river/mountain chokepoint, dropping near enemy armor, assault under SAM/flak coverage, an island map, AI offense/defense, hot-seat. Confirm Air Assault is a meaningful alternative to Paradrop (different unit pool, different era-11 availability window) without invalidating it, and that Attack Helicopter's production case doesn't skew purely toward "assault enabler" at the expense of its anti-armor role.

## 13. Phasing

Single phase (this is already Phase 2 of the #543 arc). Suggested task breakdown for the implementation plan: (1) extract shared landing-legality + landing-combat-resolution helpers from Phase 1's code with a byte-identical-behavior regression test, (2) new capability fields + `attack_helicopter`/passenger-lineage wiring, (3) `getAirAssaultLaunchState`/`getAirAssaultTargets`/`canAirAssault`, (4) `executeAirAssault` using the shared helpers + vehicle lockout, (5) AI (`rankAirAssault` + execution wiring), (6) UI (button, preview, pendingIntent plumbing), (7) hot-seat/save/balance test passes + content honesty updates, (8) full-suite run and post-implementation review (per Phase 1's precedent of finding real bugs only after the full diff existed).
