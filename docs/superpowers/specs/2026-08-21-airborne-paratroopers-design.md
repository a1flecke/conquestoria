# Airborne Operations: Paratroopers — Design Spec

**Issue:** #543 ("design(combat): airborne operations — paratroopers + helicopter air assault")
**Status:** Design approved 2026-08-21. Not yet implemented.
**Depends on:** #539 (air power rework — merged, audited below), #540 (transport/amphibious — audited below), coordinates with #547 (in-flight roster work, not yet touched).

## 1. Why this doc exists

#543 was written before #539 landed and explicitly asks for a re-audit against
current `main` before implementation. This document is that audit plus the
approved design. It supersedes the "Design sketch" section of the original
issue body wherever the two disagree — the disagreements are called out
explicitly in §2 rather than silently overwritten.

## 2. Current-state audit (2026-08-20/21, against `173dd4d1`)

### 2.1 What #539 shipped (`src/systems/air-operations-system.ts`)

- **Base types**: `AirBaseRef = {kind:'city', cityId} | {kind:'carrier', unitId}`.
  City bases are keyed off **building presence** on `city.buildings`:
  `airfield` (roster cap 3, 4 with the Air Force Command national project),
  `helicopter_base` (cap 2), `stealth_airbase` (cap 2). There is no separate
  "airbase entity" — the building list on the city IS the base.
- **Association**: an air unit carries `unit.airBase: AirBaseRef` and occupies
  one roster slot, capped per base (`getAirBaseRoster`/`getAirBaseCapacity`).
  This roster mechanism exists to cap stationed-aircraft counts and is why
  air units are invisible to ground occupancy (`unit-occupancy.ts` skips any
  `isBasedAirUnit`). **This is an aircraft-slot mechanism, not a general
  "based at a city" concept** — it does not fit a land unit that merely
  launches an action from a city it's standing in.
- **Range**: every air-capable `UnitDefinition` carries
  `airOperation: { baseKinds, operationalRange, ferryRange, missions, carrierEligible, interceptionStrengthMultiplier? }`.
  `operationalRange` bounds this-turn missions; `ferryRange` bounds rebasing
  to a new base.
- **Interception**: `selectInterceptor` (air-operations-system.ts) picks the
  strongest eligible enemy interceptor (on `intercept` stance, in range, not
  already used this turn — **no visibility filter**, so an undiscovered
  interceptor can and does ambush a striker with no advance warning) and
  resolves a normal `resolveCombat` between interceptor and incoming
  aircraft before the mission's own effect applies. Today this only fires
  from `resolveAirStrike`.
- **Mission legality**: unit must be `airBase`d, not `hasActed`, mission must
  be in `missions[]`, target/tile within `operationalRange`, and for `strike`
  the target must currently be `visible` per the acting civ's `VisibilityMap`
  (`getVisibility`).

### 2.2 What #540 shipped (`src/systems/transport-system.ts`)

- `isTransport(unit)` is **hardcoded** to
  `domain === 'naval' && cargoCapacity !== undefined` — not domain-agnostic.
- Unload legality (`isCoastalLandDestination`) requires the destination be
  adjacent to `coast`/`ocean` terrain — a shoreline rule with no meaning for
  an air-delivered unit landing inland.
- Embarked-assault (`getEmbarkedAssaultTarget`) lets cargo attack directly
  from the transport without unloading first, using `canUnitAttackTarget`
  with the transport's position substituted in.
- **Conclusion for #543**: bolting `cargoCapacity: 1` onto an air unit (the
  original issue sketch's suggestion for helicopters) would either misapply
  coastal-adjacency logic inland or require materially forking this file.
  Confirmed not a clean fit — see §9.

### 2.3 What #547 currently touches

No paratrooper/airborne content exists anywhere in `src/`, `tests/`, or
`docs/` as of this audit (`grep -rn "paratroop|airborne|paradrop"` returns
only unrelated beast/creature copy). `#547`'s recent commits
(`fc232537`/`43c3ba97`) touched sprite de-aliasing for
chariot/infantry/artillery/marine/cyber_unit — no roster or air-system
overlap with this design. No coordination conflict found.

### 2.4 Movement/action architecture

One canonical pattern is used everywhere in this codebase: a system module
exports paired `getLegal*`/`can*` + `execute*`/`resolve*` functions, and
**the same functions are called from the player UI controller, the AI
candidate-ranking module, and the AI action executor** — confirmed by
grepping every call site of `rebaseAircraft`/`resolveAirStrike`/etc. across
`src/app/controllers/`, `src/ai/`, and `src/ui/`. Zero divergent
reimplementations exist. This is the "one legality truth" contract §543
asks for, with a working template already in the codebase to copy.

Ordinary movement additionally blocks entry onto **any foreign, unallied
city tile** via `isBlockingCityFor` (`unit-system.ts`):
`city.owner !== unit.owner && !hasAllianceTreaty(...)`. City capture only
happens through the separate assault/siege flow
(`city-siege-system.ts`), never by occupying the tile directly.

### 2.5 Land-unit candidates and era placement

- `infantry`: `strength: 56, movementPoints: 2, visionRange: 2, productionCost: 195`, `domain: 'land'`, `techRequired: 'armored-tactics'` (era 9).
- `mechanized_infantry`: `strength: 61, movementPoints: 3, productionCost: 220`, `techRequired: 'armored-tactics'` + `requiredTechs: ['motorized-transport']` (era 9), provides `combinedArms: { provides: ['line-infantry'] }`.
- `airfield` building (the paradrop launch requirement, see §5) is gated on `aviation` (era 9) — one tech before `armored-tactics`.
- `air-superiority` (era 9, military track) already gates `wwii_fighter`'s obsolescence transition and is thematically "controlling airspace for offensive operations."

Era 9 is therefore the correct placement, confirming (not contradicting) the
original issue's "era 9-10" guess.

### 2.6 Helicopters today

Only `attack_helicopter` exists: `strength: 40`, `domain: 'air'`,
`airOperation: { baseKinds: ['helicopter_base'], operationalRange: 4, ferryRange: 8, missions: ['strike', 'rebase'] }`,
gated on `helicopter-warfare` (**era 11**, not era 9-10). It has no cargo
fields. The original issue's "helicopters gain cargoCapacity 1" sketch was
written before #539 and is stale on both the era and the architecture fit
(§2.2).

### 2.7 Anti-air (two unrelated existing mechanics)

1. **Interception** (§2.1) — active, fighter-vs-target combat. The only
   mechanism in the game that independently "shoots something down."
2. **Ground-based AA** (`src/systems/air-defense-system.ts`) — Mobile AA
   (`defenseModifier: 8, radius: 1`, no domain restriction), AA Battery
   (`defenseModifier: 8, radius: 0`, city-only), SAM Site
   (`defenseModifier: 12, radius: 2`, requires AA Battery + Radar Station).
   All three share `stackingGroup: 'ground-air-defense'`, so only the
   strongest applies at any point (`selectStrongestAirDefenseProviders`) —
   never additive. **Critically, this is a passive combat modifier, not an
   independent attack**: `combat-system.ts` only applies it when
   `attackerDefinition.domain === 'air'` inside an already-happening
   `resolveCombat`, and it is always *the defender's own civ's* coverage
   that helps them. There is no existing mechanism for AA to act on a unit
   that isn't already in combat with something. §9 designs a new, narrow
   extension of this system for paradrop flak — approved by the user as a
   deliberate expansion of scope (see that section for the tradeoff).

## 3. Core design

```
valid Paratrooper unit
      +
standing in a friendly city with an airfield-capable building
      +
visible, legal landing tile within paradrop range
      ↓
   paradrop (flak check → interception check → relocation)
      ↓
unit lands with 0 movement, cannot act again this turn
      ↓
vulnerable until the dropper's next turn
```

Not in scope: free teleportation, blind drops into fog, instant city
capture, guaranteed backline kills, bypassing ZOC/occupancy/city-siege
rules.

## 4. Paratrooper unit

New `UnitType: 'paratrooper'`, era 9, land domain, standalone (not part of
the machine_gunner → infantry → mechanized_infantry → exosuit_infantry
upgrade chain — it exists for its airborne capability, not to compete on
raw stats with that line).

- `strength: 50` — below `infantry`'s 56, honoring "not stronger than
  contemporary frontline infantry merely because it has mobility."
- `movementPoints: 2`, `visionRange: 2`, `productionCost: 210` (between
  infantry's 195 and mechanized_infantry's 220, reflecting the paradrop
  utility without inflating its combat footprint).
- `domain: 'land'`, `attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] }` — same as infantry.
- `techRequired: 'air-superiority'`, `requiredTechs: ['armored-tactics']`
  (era 9, military track) — mirrors `mechanized_infantry`'s two-tech
  pattern (base track tech + cross-track prerequisite). Requiring
  `armored-tactics` (infantry's own gate) guarantees a Paratrooper never
  unlocks before ordinary Infantry does.
- No `trainedFromBuilding` restriction — trains from ordinary city
  production like `infantry`. Airfield presence is a **launch-time**
  constraint (§5), not a production-time one; these are deliberately
  independent gates.
- `terminalReason: 'Airborne specialist — the paradrop capability stays relevant without a further upgrade tier.'` — no `upgradesTo`, no `obsoletedByTech`. Its value is the verb, not the stat curve, matching the precedent set by `mobile_aa`/`anti_tank_gun` as terminal specialists.
- **Era-relevance risk, called out explicitly rather than left implicit**: `infantry` climbs to `mechanized_infantry` (61) then `exosuit_infantry` (70) as tech advances, while Paratrooper stays fixed at 50 forever. `mobile_aa`/`anti_tank_gun` stay relevant despite being terminal because their *role* (anti-armor, air-defense) is structurally needed at every era; a Paratrooper's role (the drop) is what stays relevant, not its stand-up-fight stats. Two concrete consequences, both required: (1) `UNIT_DESCRIPTIONS` copy must frame it as a situational specialist to deploy for a drop, not a standing-army pick — content-description-honesty applies here (don't oversell late-game combat viability); (2) AI production scoring (`ai-production.ts`) must weight it against a live paradrop opportunity (a reachable objective, a threatened city to reinforce), not train it as a generic frontline filler once eras have moved past it — see §12's AI section and the balance test in §20.
- New capability field on `UnitDefinition`:
  ```ts
  paradrop?: { range: number; baseKinds: Array<'airfield'> };
  ```
  `paratrooper.paradrop = { range: 4, baseKinds: ['airfield'] }`. This is
  **deliberately separate from `airOperation`** — a Paratrooper is not an
  aircraft, has no `airBase`, does not consume an airfield roster slot, and
  has no `ferryRange`/`missions`/`carrierEligible`. Reusing `airOperation`
  for a land unit would be a type-level lie about what it is.
  `baseKinds` is deliberately array-shaped (not a single literal) even
  though only `'airfield'` is valid today — this is the same extension
  point `airOperation.baseKinds` already provides, so a future launch
  point (e.g. a dedicated forward-operations building) is a data change,
  not an architecture change.
  `range: 4` is a **starting balance number, not a final one** — see §20
  (Balance & Playtesting), which requires representative-situation testing
  before this ships as fixed.
- End-to-end wiring (per `.claude/rules/end-to-end-wiring.md`'s trainable-unit
  checklist, verified against the *current* file at implementation time, not
  assumed from this doc): `TRAINABLE_UNITS`, `UNIT_DEFINITIONS` +
  `UNIT_DESCRIPTIONS`, unit-renderer icon + `PRODUCTION_ICONS`, tech
  `unlocksUnits` on `air-superiority`, AI catalog/role classification
  (`ai-production.ts`, `ai-unit-roles.ts` — `getAIStrategicRoles`'s land-unit
  fallback already grants `['frontline', 'capture']`-shaped roles generically
  by movement/combat metadata, so no unit-ID branch should be needed there),
  combat-role-definitions.ts entry, sprite/SFX fallback, codex/UI coverage.

## 5. Paradrop action — canonical validator/executor

New module `src/systems/airborne-system.ts`, same paired-function shape as
every other verb in this codebase:

- `getParadropLaunchState(state, unitId)` — is this unit currently eligible
  to paradrop from where it's standing (right type, in a friendly city with
  an airfield-capable building, not `hasActed`, movement remaining)?
- `getParadropTargets(state, unitId): HexCoord[]` — every legal destination
  from the current launch point, applying every rule in §6 at once. **UI,
  AI candidate generation, and the executor all call this same function** —
  no parallel implementations, following the pattern audited in §2.4.
- `canParadrop(state, unitId, destination)` — single-target check (used by
  the executor and by anything that only needs a yes/no for one tile).
- `executeParadrop(state, unitId, destination)` — resolves flak (§9),
  resolves interception (§8) against the possibly-weakened unit, then
  relocates and applies the landing lockout (§7). Returns a structured
  result mirroring `AirStrikeResult`'s shape (`{ok, state, flak?, interception?}`)
  so callers can present what happened.
- **Structured failure reasons, required.** `canParadrop` returns a typed
  union mirroring `TransportFailureReason`/movement's blocker-code pattern —
  not a bare boolean:
  ```ts
  type ParadropFailureReason =
    | 'not-airborne-unit' | 'no-launch-base' | 'already-acted'
    | 'out-of-range' | 'unexplored' | 'impassable-terrain'
    | 'destination-occupied' | 'foreign-city';
  ```
  Each reason maps to a player-facing message the same way
  `BLOCKING_MAP_ENTITY_MESSAGES` does for movement. This is not optional
  polish: `end-to-end-wiring.md` requires movement-style failures to
  return a structured reason so UI, AI, and automation callers can avoid
  animating or treating a rejected drop as successful — a bare `ok:false`
  with no reason would violate that rule the same way an unstructured
  movement failure would.

### Launch requirement

Reuses the building-kind lookup pattern from `air-operations-system.ts`'s
private `getAirBaseKind` (exported/generalized for reuse rather than
duplicated): the city the unit is standing on must have `'airfield'` in
`city.buildings`. No new building. No roster/capacity check — Paratroopers
don't consume airfield aircraft slots, since they aren't based aircraft.

### Range

`paradrop.range` hexes from the launch city's position, wrap-aware (same
`wrappedHexDistance`/`hexDistance` split every other range check in this
codebase uses). Not `min(base range, unit range)` — there is no meaningful
"base range" for a non-aircraft, so unit-specific range is the whole rule.
Shown to the player as a literal number at target-selection time.

## 6. Landing tile legality

A destination must be, all at once (all checked inside `getParadropTargets`):

1. **Visible**: `getVisibility(civ.visibility, coord) === 'visible'`. No
   drops into fog or unexplored/previously-seen-but-stale tiles — matches
   #539's `strike` target rule exactly.
2. **Passable** for a land unit (reuses the same movement-cost lookup
   `transport-system.ts`'s `isLandDestination` and `unit-movement-system.ts`
   already use).
3. **Unoccupied** where stacking rules prohibit occupation — reuses
   `buildUnitOccupancy`/`getUnitIdsAtCoord`, the same primitive transport
   unload and spawn-occupancy code already use. Never stack-drop.
4. **Not a foreign, unallied city tile** — reuses `isBlockingCityFor`
   (exported/generalized like `getAirBaseKind`) unchanged. This is the same
   rule ordinary movement already enforces and closes the instant-capture
   exploit for free: a paratrooper can land adjacent to an enemy city and
   assault it on a later turn, exactly like any other land unit, but cannot
   land directly on the tile.
5. Enemy-adjacency is **not** independently restricted — landing next to
   enemy units is legal. The landing lockout (§7) plus flak/interception
   (§8-9) are the counterplay; a separate adjacency-exclusion radius would
   be redundant and harder to explain than "you land defenseless this turn."

Fog-safe messaging: an invisible destination is rejected with a generic
"outside your revealed territory" reason — never a reason that would leak
whether an enemy unit happens to be standing there.

## 7. Landing lockout

On successful execution: `movementPointsLeft: 0, hasMoved: true, hasActed: true`
— the exact same three flags every other "used this turn" action sets
(rebase, air strike, transport load/unload). No new persisted field, so
**no save migration**. Turn-reset already clears these correctly every turn
(the reset path `#542` fixed). A regression test proves the lockout clears
via real turn-reset processing, not a hand-rolled assertion, per that
incident's lesson.

## 8. Interception

Unchanged from #539's existing mechanism, applied to the incoming
paratrooper as the "defender" role exactly as `resolveAirStrike` applies it
to a striking aircraft: `selectInterceptor` picks the strongest eligible
enemy fighter on `intercept` stance in range of the landing tile,
`resolveCombat` resolves interceptor-vs-paratrooper. No visibility filter on
interceptor selection (matches existing behavior — a hidden fighter can
ambush a drop with no preview warning, same as it already can against a
striker). If the paratrooper doesn't survive, no relocation happens. No new
airborne-defense system — this is a straight reuse. Hostility is
`isHostileOwnerTo` — the same predicate `selectInterceptor` already uses;
§9's flak check uses the identical predicate rather than inventing a second
hostility rule (see §9).

Because `buildCombatContextForDefender`'s existing air-defense-coverage hook
computes coverage for whichever unit is passed as `defender`, the
paratrooper's **own civ's** friendly AA near the landing zone applies here
unchanged too (same as a friendly bomber already benefits from flying near
its own SAM site) — zero new code for that half.

## 9. Flak risk (approved scope expansion beyond #539's interception)

**This is new scope, not a default recommendation from the original issue —
the brief's default guidance was "don't build a second airborne-defense
system." The user explicitly chose this expansion** after being shown the
alternative (reuse-only, friendly-side benefit, zero new mechanic). Recorded
here so a future reader sees the decision was deliberate.

- New query, added to `air-defense-system.ts`:
  `getHostileAirDefenseThreat(state, droppingUnit, landingTile)`. Reuses
  `providersForOwner`/`selectStrongestAirDefenseProviders` unchanged, but
  scans **hostile** civs' Mobile AA / AA Battery / SAM Site coverage of the
  landing tile instead of the defender's own civ's coverage — the query
  direction flips, the provider/stacking-group-dedup machinery does not
  change. "Hostile" here is `isHostileOwnerTo(state, droppingUnit.owner, providerOwnerId)`
  — the exact predicate `selectInterceptor` already uses (§8) — deliberately
  the same rule, not a second hostility definition living in a different
  file with different edge cases (e.g. barbarian handling).
- **Regression requirement**: adding this function must not change
  `resolveAirStrike`'s existing behavior. `providersFor` (the
  own-civ-coverage path used today) is untouched by this addition — add an
  explicit test asserting a friendly bomber's existing AA-coverage bonus
  near its own SAM site is byte-identical before and after this change.
- **Effect: deterministic chip damage, not a kill roll.** If the landing
  tile falls under hostile AA coverage, the paratrooper takes flat HP damage
  equal to the strongest applicable provider's `defenseModifier` (8 for
  Mobile AA/AA Battery, 12 for SAM Site — the existing numbers, reused as a
  direct HP cost rather than a combat-strength modifier). No RNG. At these
  magnitudes flak alone never one-shots a full-health unit — consistent with
  "avoid destroying a full-health unit with an opaque random roll."
- **Sequencing with interception**: flak resolves first (damage applied),
  then interception (§8) resolves against the now-weakened unit if an
  interceptor is also present. A zone with both a SAM site and a standing
  fighter is meaningfully more dangerous than either alone, without a
  compound coin-flip — the danger compounds through HP, not through
  stacked probability.
- **Preview honesty**: target-selection shows flak risk only from AA
  providers the dropping civ has already discovered (reusing
  `getKnownAirDefenseProviders`'s visibility filter, scoped to hostile
  owners) — e.g. "Known SAM coverage here: -12 HP on landing." Undiscovered
  AA still applies at resolution time — this mirrors how a hidden
  interceptor already ambushes a striker with no advance warning (§2.1) —
  so dropping into unscouted territory carries genuine fog-of-war risk,
  consistent with the rest of the air-mission system rather than a special
  case for paradrops.
- If flak damage brings health to ≤0 on its own (only possible if hostile
  coverage is unusually strong for the unit's current health, e.g. already
  wounded), the paratrooper is destroyed before interception or relocation
  ever resolve — same threshold logic combat already uses elsewhere.

## 10. Player preview

At target-selection time (same `pendingIntent`/`renderLoop.setHighlights`
flow the existing `air-mission` intent already uses):

- "Paradrop here — Range: N"
- "Lands with no movement and cannot act again this turn."
- Known flak risk from discovered hostile AA, if any (§9).
- No leak of undiscovered interceptors or undiscovered AA — consistent with
  how `air-mission` targeting already withholds that information today.

**Accessibility (players from ~7 to 43, per the game's stated mobile-first,
all-ages audience):**
- Plain-language copy alongside any jargon term. "Flak" and "SAM Site" are
  not universally known vocabulary — the preview/notification text must
  read like `"Anti-aircraft fire nearby (SAM Site) — expect -12 HP on
  landing"`, not a bare `"Flak: -12"`. This is a content-description-honesty
  concern as much as an accessibility one: the plain-language clause must
  still be mechanically accurate, not simplified into something untrue.
- Risk indicators (safe target / flak risk / interceptor risk / both) must
  be distinguishable by icon or label text, not color alone — a color-only
  highlight overlay fails colorblind players and isn't legible to a young
  reader who hasn't learned "red means danger" conventions from other UI in
  this game yet. Reuses the existing highlight-type pattern
  (`'air-strike'`, `'air-recon'`) which already carries a `type` a renderer
  can key an icon off of, not just a fill color.

## 11. UI

Contextual button in `src/ui/selected-unit-info.ts` beside the existing
air-mission buttons (`onStartIntercept`, `onStartAirMission`, etc.),
`createGameButton('Paradrop', 'primary')`, wired through
`selection-controller.ts` using the same `pendingIntent`/highlight/cancel
flow as `{kind: 'air-mission', ...}`, terminating in
`map-interaction-controller.ts` dispatching to `executeParadrop` on tap. No
new panel — a contextual action is sufficient, per
`.claude/rules/ui-panels.md`'s "no permanent screen-heavy panel" guidance.
Disabled state shows why (no airfield city under the unit, out of moves,
already acted).

## 12. AI

New `rankParadrop(context, unit): RankedAITacticalAction[]` in
`ai-tactics.ts`, alongside the existing `rankAirStrike`/`rankAirSupport`/etc.
New `AITacticalAction` variant: `{kind: 'paradrop', unitId, destination}`,
executed through the exact same `canParadrop`/`executeParadrop` the player
and UI use — no parallel AI-only legality path. Candidate destinations come
only from `getParadropTargets`, so the AI is structurally incapable of
targeting a tile it can't see, matching the fog rule already proven for
`rankAirStrike` (`getVisibility` filter at candidate-generation time, not a
post-hoc check).

Useful scenarios to score positively: reinforcing a threatened friendly
city, flanking a defended line, occupying defensible/objective terrain,
cutting off a retreat. Score should discount for known flak/interceptor
risk at the destination (using the same discovered-only visibility the
player preview uses — the AI must not use hidden information to route
around undiscovered defenses) and for isolation (dropping far from any
support). Production scoring (`ai-production.ts`) must weight the
Paratrooper against a live drop opportunity rather than training it as
generic frontline filler once its era has passed (§4's era-relevance note).

**Explicit guard, because "make Veteran AI smarter" is an easy place to
accidentally leak information**: no difficulty tier may grant `rankParadrop`
or its flak/interceptor risk assessment any visibility beyond what
`getParadropTargets`/`getKnownAirDefenseProviders` already expose for that
civ. Difficulty may only change *weights* on already-legal, already-visible
candidates — never the candidate set or the risk data itself. Add a test
that asserts Veteran and Explorer AI produce the same *legal target set*
for an identical fog state, differing only in which legal target scores
highest.

**Explicitly deferred, not silently absent**: proactive AI defense against
*enemy* paradrops (e.g. stationing interceptors or building AA specifically
because a hostile paratrooper was sighted, mirroring the existing
remembered-submarine-sighting pattern in `ai-tactics.ts`/`ai-production.ts`)
is out of scope for Phase 1. Existing air-defense/interceptor AI behavior
already provides some incidental counterplay; a dedicated "remembered
airborne threat" response is a reasonable Phase 2/3 follow-up once real
games show whether it's needed.

## 13. Difficulty

Underlying mechanics (range, legal targets, flak, interception, lockout,
combat modifiers) are identical across Explorer/Standard/Veteran. Only
`rankParadrop`'s scoring weights vary by difficulty profile, matching how
#539's air-mission scoring already varies — Explorer favors conservative,
low-risk drops; Veteran evaluates flanks/objectives more aggressively. See
§12's explicit guard against difficulty-based information leaks.

## 14. Hot-seat / fog / privacy

- Target-highlight overlays are pendingIntent-scoped to the acting player
  and cleared on deselect/handoff, same as every other `pendingIntent` kind.
- Flak/interception preview data is computed fresh per `getParadropTargets`
  call against the current `civId`'s visibility — never cached across a
  seat handoff.
- Notifications: a successful/intercepted/flak-damaged drop notifies the
  dropping civ always; the landing civ (if different and hostile) is
  notified only if the landing tile is visible to them, following the
  existing `notification-delivery` viewer-scoped `deliver(civId, ...)`
  convention — never `showNotification`.
- **Sharpest concrete case, required as its own test**: Civ A has scouted
  and discovered a hostile SAM Site covering a tile; Civ B (a different
  hostile civ, same match, has not discovered that SAM Site) previews the
  same tile for its own paratrooper and must see *no* flak-risk data for
  it. This isn't a generalization of the viewer-scoping claim above — it's
  the literal hot-seat handoff scenario, and #543's fog rules only hold if
  this specific case is asserted directly rather than inferred from a
  same-civ test.

## 15. Save / load

No new persisted field. Landing lockout reuses `hasActed`/`hasMoved`/
`movementPointsLeft`, already part of `Unit` and already round-tripped.
**No schema migration.** A save taken mid-turn after a paradrop, then
loaded, must show the unit in its landed position with the lockout intact
for the remainder of that turn, and cleared correctly on the next real
turn-reset — tested against the actual turn-reset pipeline, not a hand-set
flag (§7, per the `#542` lesson).

## 16. SFX

Missing from the original issue's own addendum otherwise, so made explicit
here: the addendum's stated plan is "reuse unit-move + a parachute flavor
sting later (#427 pattern)" — i.e. ship on the existing move/relocation SFX
first, add a dedicated parachute-deploy sting as a follow-up rather than
blocking on new audio. Concretely:

- Successful landing reuses the existing unit-relocation SFX (same as a
  transport unload) — no new asset required to ship.
- Interception reuses the existing air-combat SFX path (`resolveAirStrike`'s
  interception branch already has one) — the paratrooper-as-defender case
  is not a new sound, it's the same combat resolution.
- Flak damage reuses the existing unit-damage SFX, not a bespoke one.
- A dedicated parachute-deploy sting is a later polish pass, not a Phase 1
  blocker — but the fallback path (playing the generic move SFX when the
  dedicated one doesn't exist yet) must be the actual code path exercised
  at launch, not a TODO, per the project's existing era 6-12 SFX-in-progress
  convention (era-appropriate stings arrive incrementally; missing ones
  fall back gracefully rather than playing nothing or throwing).

## 17. Balance & Playtesting

The numbers in this spec (`strength: 50`, `productionCost: 210`,
`paradrop.range: 4`, flak damage `8`/`12`) are starting values, not
pre-validated final ones — no statistical or representative-situation
testing has been run yet, and `strategy-game-mechanics.md` requires balance
tests with statistical sampling for core mechanics, not single hand-picked
examples. Before this ships, exercise the representative situations #543
itself lists (unmodified from the issue, since they're still the right
list): reinforcing a threatened city, dropping behind a frontline, dropping
near an enemy ranged/artillery unit, dropping near a defended enemy city,
dropping into known interceptor/flak coverage, an island/chokepoint map, a
hot-seat game, AI playing offense, AI playing defense. For each, confirm:

- Range 4 is large enough to matter tactically but doesn't make frontlines
  irrelevant on a typical-sized map (test against the actual map generator's
  typical city spacing, not an assumption).
- The landing lockout is real counterplay — a defender given one turn's
  warning should be able to meaningfully respond in the majority of sampled
  scenarios, not just occasionally.
- Paratroopers can't cheaply leapfrog faster than a defender can react by
  chaining drop → walk-to-city → drop again — this is already turn-gated by
  the launch requirement (§5), but confirm it holds up under actual AI
  offensive play, not just by inspection.
- Flak+interception together meaningfully change drop-survival odds
  relative to either alone, without making a covered zone effectively
  undroppable (per §9, the intent is "costly," not "impossible").
- At era 9 baseline (its own era, full HP, no flak/interception), Paratrooper
  is neither strictly dominant over Infantry (same cost tier, better
  utility) nor so weak it's never worth its production cost even for the
  drop capability alone.

If any of these come back wrong, the fix is a number change in this spec
(documented with the observed data) before implementation, or a follow-up
balance PR after — not a silent tuning decision buried in code.

## 18. Helicopter air assault — deferred

Not implemented in this pass. §2.2 and §2.6 give the concrete evidence:
`isTransport`/`isCoastalLandDestination` are naval/coastal-specific, and
`attack_helicopter` is era 11 (two eras after Paratroopers), an anti-armor
gunship whose identity a bolted-on `cargoCapacity` would blur. A real
helicopter-assault design needs its own pass covering: dedicated Transport
Helicopter vs. repurposed Attack Helicopter, land-anywhere unload legality
(not shoreline-based), whether the helicopter must end its move on the
destination tile, and how it interacts with interception/flak as an actual
airborne vehicle (as opposed to a Paratrooper, which is a land unit for
every purpose except the drop itself). Tracked as a Phase 2 follow-up under
#543 once this Phase 1 ships and its interception/flak/AI patterns have
proven out in practice.

## 19. Transport plane — deferred

Not added. City/airfield-based drops (§5) cover the mechanic without a new
unit, new escort logic, cargo lifecycle, AI basing logic, or sprite/SFX
work. Documented here as a future range-extender if a later audit shows
airfield-only launch points are insufficiently flexible — no evidence for
that exists today.

## 20. Test matrix (see also #543's own exhaustive list — this is the subset with any Phase-1-specific nuance)

- **Eligibility**: non-Paratrooper cannot paradrop; wrong-tech civ cannot
  train or use one; unit not standing in an airfield city is rejected; unit
  that has already acted is rejected. Each rejection asserts the specific
  `ParadropFailureReason` (§5), not just `ok:false`.
- **Range**: in-range legal, out-of-range rejected, map-wrap distance
  correct.
- **Fog**: visible destination allowed; unseen destination rejected without
  leaking occupant info in the rejection message.
- **Terrain/occupancy**: passable land allowed; impassable/water rejected;
  occupied tile rejected; foreign unallied city tile rejected (capture-exploit
  regression, explicit).
- **Lockout**: 0 movement after landing; cannot attack/paradrop again same
  turn; clears via real next-turn processing (not a hand-set-flag test).
- **Interception**: known interceptor may engage; hidden interceptor still
  engages with no preview leak; deterministic under seeded test.
- **Flak**: known hostile AA previewed accurately; hidden hostile AA still
  applies at resolution with no preview leak; stacking-group dedup (SAM +
  Mobile AA in range applies only the SAM's 12, not both); flak+interception
  sequencing (damage first, then combat); friendly AA still helps the
  paratrooper in the interception step unchanged from #539; **existing
  `resolveAirStrike` own-civ AA-coverage behavior is unchanged by adding
  `getHostileAirDefenseThreat`** (regression, explicit — see §9).
- **AI**: considers legal paradrops only; never targets hidden tiles; avoids
  drops into known-lethal flak+interceptor combinations at Standard/Veteran;
  difficulty changes preference, not legality; **Veteran and Explorer AI
  produce the identical legal-target set under identical fog, differing
  only in which target scores highest** (§12's difficulty-leak guard,
  explicit); production scoring doesn't train Paratroopers as generic
  filler once no live drop opportunity exists.
- **Hot-seat**: overlays/preview data isolated per seat; handoff clears
  pending intent; notifications viewer-scoped; **Civ A's discovered-SAM
  flak preview is invisible to Civ B previewing the same tile** (§14,
  explicit two-civ case, not inferred from a same-civ test).
- **Save**: post-drop state round-trips; lockout persists correctly through
  a save/load inside the same turn; clears correctly the turn after.
- **SFX**: landing/interception/flak play through existing move/combat/damage
  SFX paths; missing dedicated parachute sting falls back to the generic
  move SFX rather than silence or a thrown error (§16).
- **Balance**: statistical/representative-situation coverage per §17 — not
  a single hand-picked example.
- **Regression**: ordinary movement, air rebase, #539 interception, #540
  transport/amphibious, ZOC/attack legality all unchanged.

## 21. Phasing

- **Phase 1** (this spec): Paratrooper unit end-to-end wiring, canonical
  `airborne-system.ts` validator/executor with structured failure reasons,
  launch/range/fog/occupancy/city-tile legality, landing lockout,
  interception reuse, flak (new, §9), accessible player UI (plain-language
  copy, icon/text risk indicators), SFX reuse with fallback (§16), AI
  candidate + execution with the difficulty-leak guard (§12), hot-seat/
  save regression coverage including the two-civ discovery-isolation case
  (§14), balance/statistical validation (§17), content-description honesty
  pass on any new tech/unit copy.
- **Phase 2** (separate follow-up issue under #543, not started): helicopter
  air assault, scoped per §18 once a fresh audit of the Phase 1 patterns
  (especially flak/interception sequencing) is available to build on.

Nothing player-reachable ships until execution, UI, AI legality, fog, the
landing lockout, and content descriptions are all coherent together — no
partial-MR button that dead-ends.
