# Naval hull water-class design (#751)

## Problem

Issue #751: "make sure ships honor water type rules... certain ships should not be allowed in
oceans." Investigation found the root cause: ocean-crossing was gated exactly once, for the
`transport` unit type only, via string-literal checks duplicated in two files
(`getMovementCostForUnitInContext`/`getMovementBlockerReason` in `src/systems/unit-system.ts`,
and `getImpassableReason`/`validateUnitMove` in `src/systems/unit-movement-system.ts`). Every
other naval unit — 17 more player types plus all 6 pirate hulls — has always been free to enter
`ocean` tiles the instant it exists, including era-1 Galley. The `celestial-navigation` tech's own
`unlocks` text ("Units can cross ocean") has been false for every unit except Transport since the
roster grew past it — a live instance of the bug class `.claude/rules/content-description-honesty.md`
exists to catch, just not one its phrase-denylist happens to cover yet.

## Decision: permanent hull class, not a movement-time tech gate

Ocean access becomes a **permanent property of the hull**, not something a tech unlocks for units
already in service. A coastal-only ship never gains ocean access through research — players
graduate to ocean-going hulls via the existing `upgradesTo` chain instead. This was chosen over
(a) generalizing the existing tech gate to all units, and (b) layering both — permanent hull class
is the simplest model that also matches how the existing unit upgrade chains are already shaped.

## Data model

Add a required-for-naval field to `UnitDefinition` in `src/core/types.ts`:

```ts
waterAccess?: 'coastal' | 'ocean';   // required whenever domain === 'naval'
```

Add the matching field to `PirateHullDefinition` in `src/systems/pirate-definitions.ts`:

```ts
waterAccess: 'coastal' | 'ocean';
```

Typed as a string union (not boolean) so a future third tier (e.g. river-only) doesn't require a
breaking rename. New catalog-coverage tests assert every `domain: 'naval'` entry in
`UNIT_DEFINITIONS` and every entry in `PIRATE_HULL_DEFINITIONS` sets this field explicitly — no
silent default — mirroring the pattern `wonder-definitions.test.ts` already uses for wonder
ceilings.

## Hull classification

| Coastal-only (forever) | Ocean-going |
|---|---|
| Galley, Transport | Trireme, Carrack, Galleon, Steamship, Troop Transport, Frigate, Ironclad, Pre-Dreadnought, Submarine, Carrier, Destroyer, Missile Submarine, Autonomous Frigate, Naval Trader, Steamship Trader, Cargo Freighter, Container Ship |

**This boundary is a deliberate genre-convention choice, not a historically-forced one — said
plainly so a future reader doesn't mistake it for research.** The real ancient-world split was
never "early era = coastal, later era = ocean." It was oar-galley vs. sail-built cargo/troop ship,
and both existed side by side from very early antiquity: Phoenician sail-powered "round ships" were
meaningfully more seaworthy than contemporary war-galleys, and Julius Caesar's 55 BCE invasion of
Britain crossed the open, tidal English Channel using repurposed merchant sailing ships specifically
*because* his war-galleys/triremes were known to be unfit for that crossing. Taken at face value,
that history argues for reclassifying `Transport` ocean-going too, leaving only `Galley` (a pure
oared warship) permanently coastal.

We're diverging from that reading on purpose. Keeping both `Galley` and `Transport` coastal until
`Trireme`/`Carrack` matches the well-established 4X convention (Civilization's Trireme-can't-enter-
ocean trope) that this genre's players already expect, and it's far more legible across a 7–43 age
range than "this era-2 oared ship can't cross, but this other era-2 sailed ship can" — a distinction
real history supports but that needs real UI teaching investment to not read as arbitrary. The
earlier draft of this section cited `UNIT_DESCRIPTIONS['transport']`'s existing "between coasts"
flavor text as if it were confirming evidence; it isn't — it's just pre-existing prose nobody wrote
with this mechanic in mind, and it doesn't settle the historical question either way. The table
above is a fun/legibility call, held deliberately against a genuinely closer historical case for the
opposite answer.

Trireme itself is classified ocean-going (not coastal) because it's unlocked by the same `triremes`
tech as Galleon; keeping it coastal would leave a 3-era window (era 3–6) where cargo ships and
pirates already have ocean access and no player combat ship can follow. The remaining coastal-only
gap (Carrack goes ocean-going at era 2 `navigation`; Trireme catches up one era later at `triremes`)
is a single-era window, not three, and is left as acceptable — a small piece of the ancient-piracy
tension this feature is trying to preserve, not eliminate.

`UNIT_DESCRIPTIONS['carrack']` ("across coasts and oceans") is consistent with the table and needs
no text change. `UNIT_DESCRIPTIONS['galley']` ("Coastal vessel...") is directionally consistent but
vague. `UNIT_DESCRIPTIONS['transport']` ("between coasts") also happens to be consistent with the
chosen table, but per above that's coincidence, not corroboration.

Pirate hulls, keyed to the same `PIRATE_STAGE_DEFINITIONS.triggerTechId` progression that already
exists (this *is* the "pirates upgrade as the world era progresses" mechanism — it just doesn't
gate water yet):

| Stage | Trigger tech | Hull | Water access |
|---|---|---|---|
| 1 | `galleys` | pirate_galley | coastal |
| 2 | `navigation` | pirate_corsair | coastal |
| 3 | `triremes` | pirate_frigate | ocean |
| 4 | `caravels` | pirate_ironclad | ocean |
| 5 | `amphibious-warfare` | pirate_mothership, pirate_fast_attack_craft | ocean |

`pirate_galley`'s own description ("preys on early **coastal** traffic") and `pirate_frigate`'s
("captured broadside frigate refitted for **long-range** piracy") support this split directly. The
boundary lands at the same `triremes` tier as the player combat line, by coincidence of matching
source material, not by design requirement — pirates and players are independent catalogs and nothing
enforces they stay aligned as new content is added later.

## Movement enforcement

Both duplicated checks collapse to one shared helper in `src/systems/unit-system.ts`:

```ts
export function canHullEnterOcean(unitType: UnitType): boolean {
  return UNIT_DEFINITIONS[unitType]?.waterAccess === 'ocean';
}
```

`getMovementCostForUnitInContext` and `unit-movement-system.ts`'s `getImpassableReason` both call
this instead of inlining the field lookup — inlining it twice is exactly the mistake that produced
#751 in the first place, and a single call site is the whole point of centralizing the field. Both
sites gate entry to `ocean` tiles only; `coast` remains open to all naval domain units, matching
current behavior for `coast`.

Drop the `galleys`/`celestial-navigation` movement-time tech checks entirely — hull class
supersedes them. New blocker code `requires-ocean-hull`, message in the same plain style as the
existing ones ("This ship can't survive the open sea — upgrade it to go further."), not the
mechanism name. Flows through the existing `selected-unit-movement-feedback.ts` path with zero new
UI wiring — confirmed that file already generically surfaces `reason.message` from
`getMovementBlockerReason` for any blocker code.

`findPath`/`getMovementStepCost` already thread `{ unit }` through to the same context-aware cost
function at every path step, not just the destination — confirmed by reading `findPath`'s A* loop
in `unit-system.ts`. Pirate movement (`pirate-system.ts`, `pirate-behavior.ts`) already calls these
same shared functions with `{ unit }` context, so pirates and AI get the fix automatically with no
separate movement logic to touch.

**Known, accepted gap:** `findPathToCity` (used only by `trade-system.ts` and
`unit-movement-system.ts` for establishing trade routes) does not thread unit context and falls
back to a domain-only passability check. This doesn't currently matter — every naval trade-line
unit (Naval Trader onward) is ocean-going in this design, so no coastal-only unit ever calls it —
but if a coastal-only trade unit is ever added, this becomes a real bug with no test currently
guarding it. Not fixed here; flagged so it isn't rediscovered cold.

## Tech tree

`celestial-navigation` (era 2) is repurposed from a movement gate to a production prerequisite,
added to the `prerequisites` array of the three techs that first unlock an ocean-going hull:

- `navigation` (era 2, unlocks Carrack)
- `triremes` (era 3, unlocks Trireme + Galleon)
- `colonial-trade` (era 5, unlocks Naval Trader)

Its `unlocks` text changes from `'Units can cross ocean'` to `'Unlocks construction of ocean-going ship hulls'`
— effect text only, no entity name, matching the `tech-unlocks-consistency.test.ts` convention. Add
the old phrase to `description-honesty.test.ts`'s denylist so it can't silently regress back in.

Because `celestial-navigation` is cheap (cost 30) and era 2, by the time a player reaches era 3-5
maritime techs it will typically already be researched — this is a real prerequisite in the tech
graph, not a binding pacing constraint in practice. That's an accepted, visible tradeoff of
"repurpose" over "retire," not an oversight.

## Content updates

- `UNIT_DESCRIPTIONS['galley']`: tighten to explicitly state it cannot enter open ocean (currently
  vague — "Coastal vessel for exploration..." implies but doesn't say so directly).
- `UNIT_DESCRIPTIONS['transport']`: text ("between coasts") happens to already match the chosen
  classification; no change needed. Not treated as historical corroboration — see Hull
  classification above.
- `UNIT_DESCRIPTIONS['carrack']`: already accurate ("across coasts and oceans"); no change needed.
- `UNIT_DESCRIPTIONS['trireme']`: add a short note that it can now cross open ocean — this is a
  genuine new capability worth surfacing, not just an absence of restriction.
- `celestial-navigation` tech `unlocks` text: rewritten per above.
- No other naval description in the sweep (Galleon, Steamship, Frigate, Ironclad, trade line)
  contradicts the ocean-going classification — verified directly against `UNIT_DESCRIPTIONS`, not
  assumed.

## UI / UX

- Coastal-only badge/icon on unit cards in the city production queue and in
  `selected-unit-info.ts` — the restriction must be visible before a player tries and fails, not
  only after.
- Movement-range highlight overlay (wherever reachable hexes are painted) must already exclude
  ocean tiles for coastal hulls, since it should share the same cost functions as
  `getMovementCostForUnitInContext` — needs an explicit test confirming this, not an assumption
  that centralizing the field automatically fixes rendering.
- Blocked-move message in plain language for all ages (7–43): no "hull class" or "water access"
  jargon in player-facing text; reserve that vocabulary for the tech tree / codex.

## AI

Movement is centrally fixed for both player and AI/pirates (see above). Separately, AI
escort/production logic (`ai-unit-roles.ts`, `ai-tactics.ts`, `ai-production.ts`) currently has no
concept of hull class and could pair a coastal escort with an ocean-going convoy, producing an
escort that silently can't follow past the coastline — not a crash, but visibly poor AI play.
Needs its own behavioral test (see Testing).

## Save migration

Existing saves (schema ≤ 8) may have naval units sitting on `ocean` tiles that are now invalid for
their hull — most plausibly a Galley or Transport, since those are the only hulls still coastal-only
today.

New migration `migrateCoastalHullsOffOcean`, registered as `SAVE_MIGRATIONS[9]`,
`CURRENT_SAVE_SCHEMA_VERSION` bumped to 9. Modeled directly on the existing precedent in
`migrateLegacyBasedAircraft` (`src/storage/save-migrations.ts`), which already solves the same
shape of problem (units stranded in a now-invalid state) via distance-sorted relocation with a
deletion fallback:

1. For every unit (any owner, civ or pirate faction) whose hull is coastal-only and whose current
   tile is `ocean`: BFS outward over naval-passable tiles to the nearest `coast` tile and relocate
   there. Deterministic tie-break (tile key, then unit id) for reproducibility.
2. **No reachable coast at all** (pathological/landlocked-ocean map): remove the unit and scrub it
   from its owner's roster, mirroring the aircraft migration's own fallback — a permanently stranded,
   unselectable unit is worse than a clean removal.
3. Cargo aboard a relocated Transport moves with it for free (cargo has no independent map position
   per `game-systems.md`'s "Transported cargo is not an occupying map unit") — verify with a test,
   not just an assumption from the existing rule text.
4. Log a per-owner notification through the persistent notification log (not a toast — per
   `strategy-game-mechanics.md`'s persistent-notification rule, the player must be able to find this
   after the fact): "Your Trireme couldn't survive the open ocean and put in near shore" (owner-appropriate
   unit name).
5. **Hot-seat privacy:** the migration runs once over the whole save touching every civ's units, but
   the notification must surface only on that unit's own owner's screen — per `ui-panels.md`'s
   privacy rule, civ A must never see "civ B's ship washed ashore" text. Needs an explicit test.

## Out of scope (flagged, not silently dropped)

- The pre-existing oddity where `carrack.obsoletedByTech === 'triremes'` (a tech that reads as an
  earlier era than "Carrack") is existing content unrelated to this bug; not touched here.
- Map-generator continent connectivity: no existing invariant was found guaranteeing a coastal path
  between landmasses (`grep` for reachability/connectivity in `map-generator.ts` returned nothing).
  If the generator can produce a landmass reachable only by open-ocean crossing, an explorer-style
  player could be soft-locked out of it until Carrack/Trireme-era. Recommend verifying this
  separately before or shortly after this change ships; not blocking this design.
- `findPathToCity`'s unit-context gap (see Movement enforcement) — accepted, not fixed, because no
  current unit triggers it.

## Testing

- Movement unit tests: coastal hull blocked from `ocean` / allowed on `coast`; ocean hull allowed
  both — for both player and pirate hulls.
- Catalog-coverage tests: every naval `UnitDefinition` and every `PirateHullDefinition` sets
  `waterAccess` explicitly.
- Tech-tree test: `celestial-navigation` is a prerequisite of `navigation`, `triremes`, and
  `colonial-trade`.
- `description-honesty.test.ts` denylist addition for the retired "Units can cross ocean" phrase.
- AI/pirate parity test covering both the human path and a non-human path, per
  `end-to-end-wiring.md`.
- AI escort-assignment test: AI does not pair a coastal escort with an ocean-going convoy.
- Save-migration tests: ocean-stranded coastal unit relocates to nearest coast; loaded cargo
  follows; no-reachable-coast fallback triggers cleanly; hot-seat notification scoping (civ A never
  sees civ B's relocation text).
- Regression sweep: search existing naval movement fixtures for any that currently assert a
  Trireme/Galley/Transport can enter ocean under the old (buggy) behavior — these need to be found
  and corrected as part of implementation, not discovered after merge.
- Targeted rerun of `pacing-audit.test.ts`, `pacing-reference-economy.test.ts`, and
  `world-pressure-fairness.test.ts` — this isn't a yield change so none should be directly affected,
  but AI naval-expansion timing on archipelago-style maps is close enough to what
  `world-pressure-fairness.test.ts` guards that it warrants a check rather than an assumption.

## Regressions / solo / hot-seat

Solo play: no concerns beyond the above — behavior changes only for units that were relying on the
bug. Hot-seat: fully covered by the migration-notification scoping requirement; no other hot-seat
surface identified, since movement validation is already shared across actors and fog-of-war already
governs cross-civ unit visibility independent of this change.
