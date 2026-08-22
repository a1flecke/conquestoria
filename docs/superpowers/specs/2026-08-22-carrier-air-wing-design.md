# Carrier Air Wing Expansion — Design Spec

**Issue:** #582 ("design(combat): carrier air wing expansion — naval strike, patrol, and larger deck progression")
**Status:** Design approved 2026-08-22 (patrol-detection model and deck-progression approach confirmed by user). Not yet implemented.
**Depends on:** #539 (air power rework, merged), #540 (amphibious warfare, merged), #542 (submarine stealth/ASW, merged), #543 (airborne operations, merged).

## 1. Why this doc exists

#582 was written against #539's design sketch, before #539, #540, #542, and #543 actually shipped. This doc re-audits current `main` and designs the feature from what's actually there — the issue's own questions are still the right ones to answer, but several are now answerable with near-zero new code because #542 and #543 already built the exact machinery this issue needs.

## 2. Current-state audit (2026-08-22)

- **Carrier** (`unit-system.ts`): `strength: 45`, era 10 (`techRequired: 'carrier-warfare'`, coastal-required), `productionCost: 220`. **No `upgradesTo`/`obsoletedByTech`** — a terminal unit today. Its `combat-role-definitions.ts` entry says it "projects fighters **and bombers** across seas" — already false (Bomber's `carrierEligible: false`); this gets fixed as part of this work since it's directly in scope.
- **Deck capacity**: `getAirBaseCapacity` (`air-operations-system.ts`) hardcodes `base.kind === 'carrier' ? 2 : 0` for **any** carrier, unconditionally. No progression mechanism exists, not even a stub.
- **Carrier-capable aircraft**: Biplane, WWII Fighter, Jet Fighter (all `missions: ['strike','intercept','rebase']`), and Combat Drone (era 13, `missions: ['strike','rebase']`) have `airOperation.carrierEligible: true`. Bomber, Recon Aircraft, Attack Helicopter: `false`.
- **Fighter/interceptor AI**: `rankAirStrikes`/`rankAirSupport` in `ai-tactics.ts` are fully definition-driven — they branch on `UNIT_DEFINITIONS[unit.type].airOperation.missions`, never on unit type. A new aircraft with `missions.includes('strike')` gets AI strike-ranking automatically, no new AI code required for baseline offense.
- **Anti-ship combat modifiers**: `unit-modifier-definitions.ts` already has a typed counter table (`{attackerTypes/attackerClass, defenderClass/defenderTypes, multiplier, label, requiresDefenderDomain?}`) with existing anti-naval entries (`destroyer→submarine +25%`, `submarine→civilian +50%` "Commerce raider", etc.). **No aircraft has any anti-ship modifier today.** This is the exact extension point for Naval Strike — no hardcoded `if (target.type === ...)` needed anywhere.
- **Submarine concealment/detection (#542, `concealment.ts`)**: `hasActiveDetectorInRange` currently treats **any** unit with `domain === 'naval' || domain === 'air'` as an implicit range-1 detector (`UNIT_DEFINITIONS[type].detection?.concealedNavalRange ?? 1`), regardless of whether the unit has acted, is based, or is doing anything at all. Destroyer (range 2) and Autonomous Frigate (range 3) get an explicit `detection` field extending this; every other naval/air unit gets the implicit default of 1.
  - **User-flagged correction, adopted as a required part of this design**: the implicit air-domain branch is wrong. A biplane parked on a carrier deck has no more ability to spot a submerged submarine than the ship itself — #542's own design doc justifies air detection as "visual lookout," which only makes sense for an aircraft actually airborne and looking, not one sitting on deck. Since every aircraft's `position` in this codebase equals its base position at all times except during the instant a mission resolves (basing never leaves an aircraft "in flight" as a persisted state), **"based" and "exists" are the same set for every real aircraft** — so the fix is: remove `'air'` from `hasActiveDetectorInRange`'s implicit-default branch entirely. Naval units keep the implicit range-1 default (a ship's basic lookout is plausible regardless of where it's docked, since a ship's position is always "in the water"). Air units detect submarines **only** through the new active Patrol mission (§5) — never by merely existing or being based. This is a deliberate, narrow, justified change to existing #542 behavior, not an accidental regression; `tests/systems/concealment.test.ts`'s existing "reveals an enemy submarine adjacent to a viewer air unit" test (using a Biplane) is updated to assert the corrected behavior, mirroring its own neighboring "does NOT reveal... land unit" test.
- **ASW providers**: Destroyer and Autonomous Frigate only, via the explicit `detection` field plus the `destroyer→submarine +25%` combat modifier. This is the role the whole design must not erode.
- **Maritime reconnaissance / recon mission**: `recon_aircraft` (era 10, land-only, `strength: 0`) has a real `'recon'` mission end to end: `getLegalAirMissionTargets` (any tile within `operationalRange`, no terrain filter), `resolveReconMission` (consumes the aircraft's action, appends a `{ownerCivId, center, range: 3, expiresAtTurn: state.turn}` entry to `state.reconReveals`), and `applyReconReveals` (`fog-of-war.ts`, marks tiles `'visible'` in the viewer's fog for that turn only). This **never** touches submarine concealment — fog visibility and submarine detection are independent checks by design. This is the exact template for a new `'patrol'` mission, just wired to submarine detection instead of fog.
- **AI carrier/aircraft behavior**: no code exists yet for "prefer a deck composition based on known threats," or for carrier positioning awareness beyond ordinary naval movement AI. Genuinely new.
- **#547 state**: no overlap found — grepped `naval|carrier|frigate|destroyer` across recent #547 commits (#701 crisis-force, #702 roaming-herd); both are land/beast-focused, zero touched files in common with this design's scope.

**Which parts of #582 are still genuinely missing?** All three (naval strike, patrol/ASW, deck progression) — confirmed nothing has landed since the issue was filed.

**Which assumptions from the old issue are stale?** None of its actual questions are stale; #539/#540/#542/#543 shipped close enough to the sketch's assumptions that the issue's own question list is still the right one to answer. The one thing that changed the *design space* rather than invalidating a question is #542's `hasActiveDetectorInRange`/`ReconReveal` machinery existing at all — the issue was filed before #542 merged, so it couldn't have known this would make patrol nearly free to build on.

## 3. Architecture decisions (confirmed with the user)

1. **Patrol detection model: active mission only.** No aircraft — new or existing — passively detects submarines merely by existing or being based. Confirmed directly by the user's correction in §2. Destroyers remain the only *persistent, always-on* ASW asset.
2. **Deck progression: a later Supercarrier unit**, not a tech-based capacity bump on the same Carrier. Fixes Carrier's current "terminal, no upgrade" status and gives late-game players a concrete reason to reinvest in naval aviation, matching the Destroyer→Autonomous Frigate precedent already in the roster.

## 4. Naval Strike Aircraft

New `UnitType: 'naval_strike_aircraft'`, carrier-capable, era 10 (`techRequired: 'carrier-warfare'`, same tech as Carrier and Destroyer themselves — deliberately paired so the moment a civ can build a Carrier, it can also build the aircraft that gives that carrier an anti-ship identity).

- `strength: 38` — below Jet Fighter's eventual 50 and below Bomber's 48, since its value is the *anti-ship modifier* (§4.1), not raw stat superiority; a fighter should still win a straight-up dogfight.
- `domain: 'air'`, `attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] }` — same shape as the fighters (no restriction on legal targets; the modifier, not target-list narrowing, is what keeps it from being universally strong — see §4.1).
- `productionCost: 235` — between Biplane (200) and WWII Fighter (240), reflecting era-10 arrival alongside the fighters it's meant to complement, not replace.
- `airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 4, ferryRange: 8, missions: ['strike', 'rebase'], carrierEligible: true }` — **no `'intercept'`**: fighters stay the fleet's sole air-defense answer, matching the issue's explicit design goal ("fighters remain the primary fleet air-defense counter"). `operationalRange: 4` matches WWII Fighter's, keeping the two aircraft interchangeable in terms of *reach* so the deck-composition choice (§6) is genuinely about role, not range.
- Terminal — no `upgradesTo`, matching Jet Fighter's own precedent (era 10's air roster has no further eras of fighter/strike progression until Combat Drone at era 13, which is carrier-eligible and already covers "later era, better plane" without a dedicated strike successor). `terminalReason: 'Era 10 naval-strike specialist; later carrier-based offense comes from Combat Drone at era 13.'`
- No historical unit name (no "torpedo bomber" / "dive bomber") — the unit needs to remain thematically coherent as the deck's strike role from era 10 through the Supercarrier era (§7), and a WWII-specific historical name would read as anachronistic that far into the tech tree. "Naval Strike Aircraft" describes the *role*, matching how "Combat Drone" and "Recon Aircraft" are already named generically rather than historically in this roster.

### 4.1 Anti-ship modifier

New entry in `unit-modifier-definitions.ts`'s counter table:

```ts
{ attackerTypes: ['naval_strike_aircraft'], defenderClass: 'naval', multiplier: 1.5, label: 'Naval strike' },
```

`defenderClass: 'naval'` (not `defenderTypes`) deliberately covers **every** current and future naval unit type generically — carriers, destroyers, battleships, submarines-on-the-surface, transports — matching the issue's "effective against naval combat ships, carriers, transports" requirement without a per-type list. No bonus applies against land units or cities (the modifier table only fires when the defender matches `defenderClass`/`defenderTypes`; against a city or land unit, Naval Strike Aircraft resolves at its plain `strength: 38`, which is deliberately unremarkable there). `1.5` matches the existing "Commerce raider" modifier's magnitude (submarine→civilian) as a reference point for "a dedicated anti-X specialist's bonus," scaled down slightly from that outlier case since Naval Strike Aircraft's targets aren't undefended civilians.

### 4.2 Interception

No new mechanism. Naval Strike Aircraft participates in #539's existing interception exactly like any other `'strike'`-mission aircraft: `resolveAirStrike`'s `selectInterceptor` call already applies uniformly to every striking aircraft regardless of type. The issue's "unescorted strike aircraft is vulnerable to fighters" tension is therefore already true the moment this unit exists — no escort-mission bookkeeping needed, matching the issue's explicit instruction not to invent one. A carrier that sends its Naval Strike Aircraft to attack without keeping a Fighter aboard (or nearby) is exactly as exposed to enemy interception as a lone Biplane would be today.

## 5. Maritime Patrol Aircraft and the `'patrol'` mission

New `UnitType: 'maritime_patrol_aircraft'`, carrier-capable, era 10. Two-tech gate (mirroring the `mechanized_infantry`/`paratrooper` two-tech convention already used in this roster): `techRequired: 'radar-systems'` (era 10, science track — the tech that already gates `radar_station`, the existing city-side detection booster, so "detection tech" and "patrol aircraft" share a coherent tech identity), `requiredTechs: ['carrier-warfare']` (era 10, maritime track — it's fundamentally a carrier-deck unit). This spreads era 10's new-content load across two different techs rather than stacking a fourth new unit onto `carrier-warfare` alone, and — critically — keeps Patrol available in the **same era** as Carrier and Naval Strike Aircraft, so the fighter/strike/patrol three-way composition choice (§6) exists from the very first turn a civ can field a carrier, not one era later.

- `strength: 0` — non-combatant, matching Recon Aircraft's precedent exactly (its value is the mission, not a stat line).
- `domain: 'air'`, no `attackProfile` (cannot attack — same as Recon Aircraft).
- `productionCost: 210`.
- `airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 5, ferryRange: 10, missions: ['patrol', 'rebase'], carrierEligible: true }` — longer range than the fighters/strike aircraft (5 vs 4), reflecting a reconnaissance aircraft's real-world range advantage over a combat aircraft, and giving the Patrol mission (§5.2) a genuinely wider useful radius than the carrier's other roles.
- Also `baseKinds: ['airfield', ...]` (land-based), directly answering the issue's question 2 ("carrier-capable scout, land-based patrol aircraft, or both") with "both, same unit" — a coastal airfield city can field maritime patrol coverage without needing a carrier at all, exactly like Recon Aircraft already does for land recon.
- Terminal, no `upgradesTo` — matches Recon Aircraft's own precedent (no non-combat reconnaissance successor exists anywhere in the roster).

### 5.1 New `AirMission` variant: `'patrol'`

```ts
export type AirMission = 'strike' | 'intercept' | 'rebase' | 'recon' | 'patrol';
```

### 5.2 Legality and execution — mirrors `resolveReconMission` exactly, wired to submarine detection instead of fog

`getLegalAirMissionTargets`'s signature widens from `Extract<AirMission, 'recon' | 'strike'>` to `Extract<AirMission, 'recon' | 'strike' | 'patrol'>`; `'patrol'` falls into the same no-terrain-filter, plain-range-scan branch `'recon'` already uses (`hexesInRange`/`getWrappedHexesInRange` from the unit's current position, out to `operationalRange`) — no water-only restriction, matching the exact reasoning `'recon'` already uses (submarines can only ever be on water tiles anyway per their own `waterAccess`, so a terrain filter would be redundant complexity for zero practical benefit).

New `resolvePatrolMission(state, unitId, center): AirOperationResult`, structurally identical to `resolveReconMission`: validates via `getLegalAirMissionTargets(..., 'patrol')`, consumes the aircraft's action (`movementPointsLeft: 0, hasMoved: true, hasActed: true`), and appends a new temporary record:

```ts
export interface PatrolReveal {
  ownerCivId: string;
  center: HexCoord;
  range: number;
  expiresAtTurn: number;
}
```

to a new `state.patrolReveals?: PatrolReveal[]` array — **not** reused into `reconReveals`, because the two are consumed by different systems for different purposes (fog-of-war.ts vs. concealment.ts) and conflating them under one type/flag would make a future change to either mission's semantics need to reason about the other. Same lifecycle convention as `ReconReveal`: `expiresAtTurn: state.turn` (visible for the remainder of the turn it was flown, filtered out — not proactively pruned — on the next write to the same civ's entries, exactly matching `resolveReconMission`'s existing pattern).

`range` for the patrol reveal: **6** — deliberately larger than Destroyer's persistent range-2/Autonomous Frigate's range-3, since this is a one-turn, action-consuming, opt-in commitment (the aircraft can do nothing else that turn and the coverage vanishes immediately after), not a standing threat the way a Destroyer's presence is. This asymmetry (bigger but temporary vs. smaller but permanent) is the intended tension between the two ASW tools — see §5.4.

### 5.3 Detection integration — the only change to `concealment.ts`

`hasActiveDetectorInRange` gains one additional OR-branch, checked alongside its existing unit/city branches:

```ts
const patrolledByOwner = (state.patrolReveals ?? []).some(reveal =>
  reveal.ownerCivId === viewerCivId
  && reveal.expiresAtTurn === state.turn
  && distanceFor(state, reveal.center, unit.position) <= reveal.range);
if (patrolledByOwner) return true;
```

Plus the §2 correction: the existing implicit-default branch's domain check narrows from `domain !== 'naval' && domain !== 'air'` to `domain !== 'naval'` — air units no longer count as detectors merely by existing. This is the **only** other change to #542's own logic; `isSubmarineConcealedFrom`/`getSubmarineRevealState`/`isUnitConcealedFrom`'s call structure is untouched.

### 5.4 ASW role boundary — patrol finds, destroyer finds *and kills*

Maritime Patrol Aircraft **only detects** — it has no attack profile and gets no combat modifier of any kind against submarines. This directly answers the issue's "Anti-submarine attack" question with option A (detect only): giving it an ASW attack bonus on top of being the single best-range detector in the game would make it strictly better than Destroyer at Destroyer's own job, which is exactly the erosion #582's own "Do Not Invalidate Destroyers" section forbids. Destroyer keeps its unique value on every axis the issue names: persistent (no action cost, covers every turn including the enemy's), mobile while covering (a Destroyer's range-2 aura moves with it, unlike a patrol reveal which is a fixed-center snapshot the instant it's flown), and lethal (`destroyer→submarine +25%` combat modifier, which Patrol Aircraft never gets).

## 6. Carrier deck composition

Deck capacity stays **2** for the base Carrier — confirmed against current `main` (§2), not the issue's illustrative "3-slot" example, which the issue itself calls conceptual-only. Two roles, three choices: `{fighter, fighter}` (pure defense), `{fighter, naval_strike}` (balanced), `{naval_strike, naval_strike}` (pure offense, undefended) — or swap either slot for Patrol Aircraft to trade combat capacity for one-shot detection reach. A 2-slot deck already creates real tension (you can never run all three roles at once); the Supercarrier (§7) is where the full three-way tension the issue describes becomes possible.

Capacity itself is **not** persisted — `getAirBaseCapacity` already computes it live from `state.units[base.unitId]?.type` each call; §7 generalizes this to a per-unit-type lookup rather than a single hardcoded ternary, with no schema change.

## 7. Supercarrier

New `UnitType: 'supercarrier'`, era 13 (paired with `autonomous-weapons-systems`/`ocean-robotics`-era content — the same era Combat Drone and Autonomous Frigate arrive, so the late-game naval-aviation tier reads as one coherent generational jump rather than an isolated addition). `techRequired: 'ocean-robotics'` (era 13, maritime track — the same tech that already produces Autonomous Frigate, keeping the era-13 naval upgrade story on one tech the way `carrier-warfare` already carries Carrier+Destroyer+Naval Strike+Patrol at era 10).

- `domain: 'naval'`, `waterAccess: 'ocean'`, coastal-required (matches Carrier).
- `strength: 58` (above Carrier's 45, below Autonomous Frigate's 60 — a big, valuable, but not indestructible target).
- `productionCost: 340` (a genuine late-game investment, well above Carrier's 220).
- `movementPoints: 4` (unchanged from Carrier — no speed advantage; the differentiator is entirely air-operations capacity, matching the issue's explicit "not merely Carrier + bigger numbers" instruction).
- **Deck capacity 3** — the one stat change that actually matters: it's the tier where the fighter/strike/patrol three-way composition puzzle the issue's own example describes becomes literally possible on one hull, which is a real, motivated reason for the unit to exist beyond bigger numbers.
- Carrier's own entry gains `upgradesTo: 'supercarrier'`; its `terminalReason` is removed (it's no longer terminal). Supercarrier's own `combat-role-definitions.ts` entry gets `terminalReason: 'Current top-tier naval air projection with no later roster replacement.'`, replacing Carrier's old one.
- `obsoletedByTech` on Carrier: **not set.** Unlike Destroyer→Autonomous Frigate (which does obsolete), an existing Carrier fleet should not be forcibly dequeued/blocked from further production just because Supercarrier exists — a player may deliberately want cheaper, faster-to-build Carriers alongside a smaller number of Supercarriers. `upgradesTo` alone (an available, optional upgrade action) is the correct mechanism here, matching how several other "upgrade path exists but old unit stays buildable" cases in this roster already work (verify against the live `TRAINABLE_UNITS` table at implementation time for the closest precedent).

### 7.1 Deck-capacity generalization (no new persisted state)

`UnitDefinition` gains one new optional field:

```ts
/** Air-base roster slots this naval unit's own deck provides when hosting an AirBaseRef{kind:'carrier'}. Only meaningful on carrier-capable naval hulls. */
carrierDeckCapacity?: number;
```

`carrier.carrierDeckCapacity = 2`, `supercarrier.carrierDeckCapacity = 3`. `getAirBaseCapacity`'s carrier branch changes from the hardcoded ternary to:

```ts
if (base.kind === 'carrier') return UNIT_DEFINITIONS[state.units[base.unitId]?.type ?? '']?.carrierDeckCapacity ?? 0;
```

Same return value for every existing save's Carrier units (`2`, unchanged) — this is a pure refactor for the existing case, proven via a byte-identical regression test before Supercarrier is layered on top, mirroring the same "extract and prove identical, then extend" discipline #543's `isLegalAirborneLandingTile` extraction used.

## 8. UI

### 8.1 Carrier / Supercarrier panel — air wing display

Extends the existing selected-unit panel (the same surface that already shows Destroyer's cargo/role info) with an air-wing summary when the selected unit is a carrier-capable naval hull:

```
Air Wing 2 / 2
• Jet Fighter — Ready
• Naval Strike Aircraft — Used
```

or, on an empty slot: `• Empty slot`. Reuses `getAirBaseRoster`/`getAirBaseCapacity` (already exported, already used by the rebase-destination UI) — no new query needed, just a new render block. Icon + text per aircraft entry (unit icon already exists in `PRODUCTION_ICONS`/unit-renderer's icon set); "Ready"/"Used" derived from `!hasActed`, matching the plain-language convention already established for Paradrop/Air Assault's own lockout messaging. No color-only signaling.

### 8.2 Patrol mission button

Contextual button in `selected-unit-info.ts`, next to the existing Air Strike/Recon buttons, `createGameButton('Patrol', ...)`, wired through `selection-controller.ts`'s existing `onStartAirMission`-style flow — widen that callback's `mission` parameter type from `'strike' | 'recon'` to `'strike' | 'recon' | 'patrol'` (the existing dispatch already branches on `mission`, so this is an additive case, not a new callback). Preview text follows the plain-language-gloss convention #543 established: `"Patrol here — reveals ships and hidden submarines in a wide area for the rest of this turn. Uses this aircraft's turn."` — spells out "hidden submarines," not "ASW," per the issue's explicit accessibility guidance (players 7-43; jargon needs a plain-language companion, not a replacement).

### 8.3 Disabled-state honesty

A carrier-capable aircraft that cannot rebase to a specific carrier (full deck, out of ferry range, wrong `baseKinds`) already gets a structured reason via #539's existing `AirOperationResult`/rebase-destination machinery — this design adds no new failure-reason plumbing, only new entries flowing through the same existing UI.

## 9. AI

### 9.1 Naval Strike and Fighter — no new AI code

Both get `rankAirStrikes`/`rankAirSupport`'s existing generic ranking for free, exactly as #582's own audit finding in §2 establishes. No unit-ID branch, no new function.

### 9.2 Patrol — new `rankPatrol`, mirrors `rankAirSupport`'s `'recon'` branch

```ts
function rankPatrol(context: AITacticalContext, unit: Unit): RankedAITacticalAction[] {
  const operation = UNIT_DEFINITIONS[unit.type].airOperation;
  if (!operation?.missions.includes('patrol') || !unit.airBase || unit.hasActed) return [];
  // Viewer-scoped only: a remembered hostile-submarine sighting this turn (the
  // AI's already-established "remembered threat" pattern, matching submarine
  // AI-avoidance elsewhere in this codebase) or -- absent one -- the carrier
  // group's own current position, so an idle patrol aircraft still contributes
  // area awareness near the fleet it's protecting rather than never firing.
  ...
}
```

Scored in the same 300-460 band as `rankAirSupport`'s other support actions, discounted by distance from the target center the same way `rankParadrop`/`rankAirAssault` already discount by objective distance — no new scoring architecture, reuses the established band and distance-discount shape from #543's own AI additions.

**No hidden information**: candidate patrol centers are derived only from the AI civ's own visibility and any already-viewer-scoped remembered-threat data (matching the identical guard #543's `rankAirAssault`/`rankParadrop` already enforce and are tested for) — never from raw `GameState` submarine positions the civ hasn't actually detected.

### 9.3 Carrier composition and positioning — bounded, not a naval-AI rewrite

Per the issue's explicit "do not turn this into a whole naval strategic-AI rewrite" instruction, this design adds one narrow signal to existing AI production/basing decisions rather than a new subsystem: when choosing which aircraft to base at a carrier with open deck slots, the AI's production-candidate scoring gets a modest bonus/penalty nudging toward composition diversity relative to what's already aboard that specific carrier (discourage stacking three of the same role on one 2-3 slot deck) and toward Patrol specifically when a remembered hostile-submarine sighting exists near that carrier's group. This reuses the existing AI production-candidate pipeline (`ai-production.ts`) the same way #543 threaded its own new signal through the existing pipeline rather than building a parallel one. Carrier movement/positioning safety (not parking next to enemy capital ships, not leaving fighter cover behind) is **out of scope for this pass** if current AI naval movement already has no such awareness at all — confirmed absent per §2's audit — and is called out explicitly as a deferred follow-up (§13) rather than silently expanded into this issue, per the issue's own scope guard.

## 10. Difficulty

Identical contract to every other #543/#539 mechanic: legality, detection range, operational range, attack modifiers, and interception are identical across Explorer/Standard/Veteran. Only AI scoring weights (which role to prioritize, how aggressively to patrol) vary by tier — same explicit difficulty-leak guard #543 established (a test asserting identical legal target/candidate sets across tiers under identical fog).

## 11. Hot-seat / privacy

- `state.patrolReveals` entries are `ownerCivId`-scoped exactly like `state.reconReveals`; `hasActiveDetectorInRange`'s new branch filters on `reveal.ownerCivId === viewerCivId` before ever considering it, so Civ B never inherits Civ A's patrol coverage.
- Explicit two-civ test (mirroring #543's sharpest hot-seat case): Civ A flies a Patrol mission that would reveal a submarine also within Civ B's fog-of-war but outside anything Civ B has actively patrolled — Civ B must not see it.
- Deck/air-wing panel content is inherently viewer-safe (a player can only ever select their own units in this game's existing selection model) — no new privacy surface there.
- Notifications: "Patrol discovers a submarine" fires only to the patrolling civ via the existing viewer-scoped `notification-delivery` convention, never `showNotification` for a consequence a hostile civ caused.

## 12. Save / load

No new persisted field on `Unit` or `City`. New top-level `GameState.patrolReveals?: PatrolReveal[]` field — same shape and same "absent means empty" default as the already-shipped `reconReveals`, so a save from before this feature loads correctly with zero migration (an old save simply has `patrolReveals: undefined`, treated identically to `[]` everywhere it's read, exactly matching how `reconReveals` itself required no migration when it shipped). Deck capacity is definition-derived (§7.1) — nothing new to persist there either. `carrier.upgradesTo`/Supercarrier's own definition are static catalog data, not save state.

## 13. Explicitly deferred (not silently absent)

- **AI carrier positioning safety** (§9.3) — no current AI naval-movement awareness exists to extend; a dedicated pass is a reasonable follow-up once this phase's composition/mission AI has proven out in practice, matching #543's own precedent for deferring proactive AI defense.
- **Escort-mission bookkeeping** — the issue itself asks this be skipped unless current air-mission architecture already supports it cleanly; it does not, and the simpler "interception already applies to unescorted strikes" model (§4.2) is confirmed sufficient without it.
- **Any further deck-capacity tier beyond Supercarrier** — no evidence yet that a third tier is needed; §7.1's generalized `carrierDeckCapacity` field means adding one later is a data change, not an architecture change.

## 14. Test matrix (see also #582's own exhaustive list — this is the subset with Phase-1-specific nuance)

- **Carrier eligibility**: Naval Strike/Patrol aircraft can base on a carrier; Bomber remains ineligible (regression); full 2-slot deck rejects a third aircraft; rebase legality uses the unchanged #539 shared rules.
- **Naval strike**: `naval_strike_aircraft → naval`-class target gets the 1.5x modifier; a land-unit/city target gets no bonus (explicit negative test, not just absence of a positive one); interception applies identically to any other striking aircraft; AI selects a naval target when one and a land target are both in range (parity with the modifier actually mattering to score, if scoring is threaded through — see §9.1's note that no new scoring exists, so this may just confirm `rankAirStrikes`' existing target-cost sort still produces a legal, sane choice).
- **Detection correction (#542 regression, explicit)**: an idle, based air unit (fighter, strike aircraft, or patrol aircraft) does **not** detect an adjacent submarine merely by existing — flips the existing Biplane-adjacency test's expectation with a documented justification comment. Naval unit adjacency detection (Destroyer, Galley, etc.) is unchanged (explicit regression).
- **Patrol mission**: legal target set matches `hexesInRange`/wrap-aware range from the aircraft's position (parity with `'recon'`'s own tested shape); `resolvePatrolMission` consumes the aircraft's action; a submarine within the patrol's radius is detected for the rest of that turn only, via `patrolReveals`, not `reconReveals`; a submarine outside the radius, or checked the following turn, remains concealed; `reconReveals`'s own fog behavior is unchanged (explicit regression proving the two arrays don't cross-contaminate).
- **Destroyer role preserved**: submarine vs. carrier-with-patrol-that-flew-last-turn is concealed again this turn (proves patrol's snapshot nature); submarine vs. Destroyer is detected every turn regardless of any action (proves persistence); Destroyer's `+25%` anti-submarine combat modifier is unchanged.
- **Deck capacity**: `getAirBaseCapacity` returns byte-identical `2` for Carrier before/after the §7.1 refactor (regression, proven before Supercarrier is added); Supercarrier returns `3`; a 3rd aircraft based at a Supercarrier with 2 already aboard succeeds where it would fail at a base Carrier.
- **AI**: `rankPatrol` never targets a tile the civ can't see; opportunity-cost/composition nudging is viewer-scoped only (no hidden-information leak, mirroring #543's explicit test pattern); identical legal candidate sets across difficulty tiers.
- **Hot-seat**: the explicit two-civ patrol-reveal isolation case (§11).
- **Save**: a pre-feature save (no `patrolReveals` field at all) loads and behaves correctly; a save taken mid-turn with an active patrol reveal round-trips and expires correctly on the next real turn via `processTurn`.
- **Regression**: #539 carrier basing/interception, #540 amphibious warfare, #543 airborne actions all unchanged; ordinary Bomber remains land-only; Recon Aircraft's own `'recon'`/fog behavior unchanged.

## 15. Phasing

Given the strong architectural reuse found in §2 (naval strike's modifier and patrol's mission machinery are both near-zero-new-code extensions of already-shipped systems), a single coherent phase covering Naval Strike + Patrol + the deck-capacity generalization + Supercarrier is the right size — each piece is small on its own, and splitting them would mean an intermediate PR where "carrier air wing" is only partially true (e.g., strike aircraft shipped but patrol not, leaving Destroyer's future role commentary premature). Suggested task breakdown for the implementation plan:

1. `hasActiveDetectorInRange` correction (§2) + regression test — smallest, most foundational change, done first and independently verified.
2. Naval Strike Aircraft: unit definition, anti-ship modifier, full end-to-end wiring (tech unlock, production, icon, description, combat role, AI — free via §9.1).
3. `'patrol'` air mission: `AirMission` widen, `getLegalAirMissionTargets`/`resolvePatrolMission`, `PatrolReveal`/`state.patrolReveals`, concealment integration (§5.3).
4. Maritime Patrol Aircraft: unit definition, full end-to-end wiring, `rankPatrol` AI.
5. Deck-capacity generalization (§7.1) with the byte-identical-behavior regression, done before Supercarrier exists to prove the refactor alone is safe.
6. Supercarrier: unit definition, Carrier's `upgradesTo` wiring, full end-to-end wiring.
7. UI: air-wing panel display, Patrol button/preview.
8. AI composition nudging (§9.3).
9. Hot-seat/save/balance test passes + content-honesty pass (including fixing Carrier's stale "fighters and bombers" description, §2) + full-suite run and post-implementation review.
