# Homeland Choice (Phase C of #1837) Implementation Plan

> **For agentic workers:** execute inline with superpowers:executing-plans (this project forbids subagents). Steps use
> checkbox syntax.

**Goal:** On turn 1 a human chooses their homeland from up to three reserved starts (their placed start plus two
alternates), in solo and hot seat.

**Architecture:** Alternates are selected **at creation** with the shared selection and floor, and reserved: every
start-relative creation step (resource guarantees, wonders, late resources, villages, beast lairs, barbarian camps,
city-states) receives the full reserved list, so any choice leaves a legal, fair world. The choice is a persisted
per-civ record; confirming it is one pure executor that moves the unmoved settler and warrior and recomputes
visibility. A panel (registry entry) and map highlights present it.

**Spec:** `docs/superpowers/specs/2026-11-25-start-quality-and-homeland-choice-design.md` (Phase C: C1-C3).

## Delivery (two PRs, nothing half-built)

- **PR A (engine, no player-visible surface):** reservation at creation behind `settings.homelandPicker === 'on'`
  (absent = off until PR B), the persisted record, the confirm executor, option descriptions, tests.
- **PR B (panel):** Homeland panel, map highlights and preview, turn-1 banner/tutorial gating, setup toggle, default
  flips to on, hot-seat privacy tests.

## Verified against current code (spec claims checked, 2026-11-26)

- Creation passes one `startPositions: HexCoord[]` to `guaranteeStartResources`, `placeWonders`,
  `placeLateResources` (as `protectedCoords`), `placeVillages`, `placeBeastLairs` and `spawnBarbarianCamp`
  (`game-state.ts` ~366-373 solo, ~583-591 hot seat). Reserved sites ride along as extra entries: **no signature
  changes**. Units are still created at the placed start.
- `placeMinorCivs(state, size)` derives starts from the state's settler units, so it does **not** see alternates: it
  must also read the civs' homeland records (deviation from the spec's "every start-relative step receives the list";
  same effect, one extra read).
- The turn-1 banner is `getCivilizationStatusForViewer` (`civilization-status-presentation.ts`), derived from state.
- A new panel is one `panelRegistry` entry in `src/app/bootstrap.ts` (`domId`, `group`, `open`).
- The map highlights hexes through `RenderLoop.setHighlights(HexHighlight[])`.
- Unit position changes outside movement are a placement question: the confirm executor writes both units' positions
  itself and the shared save invariants (`units-on-enterable-terrain`, `no-illegal-blocking-occupancy`) must hold after.

## Decisions (mine, to check)

- **When a choice is live:** derived, never trusted: `state.turn === 1`, the civ has no city, its settler and warrior
  stand on the recorded `selected` option. Moving the settler, founding a city or the turn ending makes the record
  inert; founding a city clears it. No new round phase (the phase order is pinned).
- **Alternates:** floor-passing major sites, `>= MIN_MAJOR_CIV_START_DISTANCE` from every other civ's start and every
  other reserved site (so every combination of choices is legal), `>= 6` and `<= 16` hexes from the civ's own placed
  start (a real choice, still the same region), `>= 5` from each other, preferring different characters.
- **Character labels** derive from the site assessment only (river valley, coastal plain, forest and hills, open
  plains, rich grassland); no text from the map's hidden parts.
- **Fewer than three** options is fine (down to one: the panel is not shown).
- AI civs never choose.

## Global Constraints

- Same seed + same settings => same options (own stream `createRng(seed + '-homeland-options')`); with
  `homelandPicker` off, the world is byte-identical to before (all fixtures unchanged).
- New persisted field is optional with a documented reader; the persisted-shape ratchet and new-game completeness
  ratchet get written entries (`ADDITIVE_WITHOUT_MIGRATION`), no schema bump.
- Only the owning seat's options are ever read for display (`state.currentPlayer`).
- Commands: `./scripts/dev.sh test <paths>`, `./scripts/dev.sh build`, `./scripts/dev.sh test-all`.

## Review Focus

1. A choice made in hot seat by seat 2 must never move or reveal seat 1's options or start.
2. Confirming an option whose tile gained a camp/unit since creation (turn 1 only, but AI moves first?) must be a typed
   denial, not a stacked unit.
3. Save/reload with the choice pending must show the same options and the same selection.
4. A second confirm, or confirm after founding a city, is a typed denial and changes nothing.
5. Options must not be offered on maps too crowded to hold them; the civ simply gets fewer.

## PR A tasks

### A1: Types and settings
- Create `src/core/types/homeland.ts`: `HomelandOption { coord: HexCoord; character: string; summary: string }`,
  `HomelandChoice { options: HomelandOption[]; selected: number }`.
- `Civilization.homelandChoice?: HomelandChoice` and `GameSettings.homelandPicker?: 'on' | 'off'` in `types.ts`.
- Tests: persisted-shape ratchet and new-game-completeness entries with written reasons.

### A2: Option selection and description (`src/systems/homeland-options.ts`)
- `selectHomelandOptions(input): HomelandOption[][]` — per human civ, alternates under the constraints above, using
  `createStartQualityIndex` + `selectStartSites`; deterministic; returns one-element arrays when none fit.
- `describeHomelandSite(assessment, terrainCounts): { character, summary }`.
- Tests: floors, distances to every other start and reserved site, own-distance window, determinism, fewer-than-three,
  characters differ, hot-seat (two humans) never share or crowd sites.

### A3: Reservation at creation
- `createNewGame` / `createHotSeatGame`: when `homelandPicker === 'on'`, compute options, pass
  `[...startPositions, ...alternates]` to the six start-relative steps, store `homelandChoice` on each human civ with
  `selected: 0` (the placed start is option 0), and make `placeMinorCivs` also keep clear of every civ's options.
- Tests: with the flag off nothing changes (compare against a pinned digest); with it on each option has a guaranteed
  luxury and strategic resource within radius 5, no camp, lair, village or city-state within the usual distances of any
  option, and every combination of choices passes the start outcome matrix floors.

### A4: Confirm executor
- `getActiveHomelandChoice(state, civId)` (derived, see Decisions) and
  `confirmHomeland(state, civId, index): ConfirmHomelandResult` — typed denials (`'not-active'`, `'bad-index'`,
  `'occupied'`, `'not-human'`), moves settler and warrior, recomputes the civ's visibility, sets `selected`, returns a
  new state (never mutates). Founding a city clears the record.
- Tests: moves both units; invariants hold (`assertSaveStateInvariants`); second confirm and post-founding confirm are
  denials; occupied option denied; hot seat: seat 2 confirming changes nothing for seat 1; save/reload keeps the
  record; a settler that walked away makes the choice inert.

### A5: Rules and verification
- Update `game-systems.md` (one Homeland choice section); `verify-impact` evidence; full suite; PR A.

## PR B tasks (written when PR A lands)

Panel registry entry and component (`createGameButton`, `markModal`, keyboard/focus per `input-reliability.md`),
`setHighlights` preview, turn-1 banner and tutorial gating, setup toggle and default on, viewer-safety differential
test for hot seat, keyboard e2e additions.
