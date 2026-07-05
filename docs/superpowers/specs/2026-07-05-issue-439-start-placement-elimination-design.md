# Issue 439 Start Placement and Elimination Design

**Date:** 2026-07-05

**Issue:** [#439 — Bugs wife found](https://github.com/a1flecke/conquestoria/issues/439)

**Status:** Approved design

## Summary

Issue 439 contains two related early-game failures from a hot-seat campaign:

1. A large Earth game placed London, Berlin, and Rome close enough for one human civilization to conquer another within the opening turns.
2. After the defeated human lost the final city and remaining units, hot-seat handoff continued giving that eliminated civilization turns.

The fixes must address the underlying contracts rather than special-case the reported civilizations:

- Geographic map shape and start-placement policy become separate choices.
- Balanced placement guarantees minimum separation and viable starts.
- Exact historical placement remains available as an explicit, honestly described mode.
- AI civilization selection becomes aware of the selected humans, map, placement mode, and other AI choices.
- Major-civilization elimination becomes one canonical state transition.
- Hot-seat turn cycling derives active players from authoritative game state after all relevant simulation.

## Root Cause Analysis

### Geographic starts bypass the spacing invariant

`findStartPositions` enforces `MIN_MAJOR_CIV_START_DISTANCE` only for positions chosen by its greedy fallback. Known civilization entries in the Earth, Old World, and New World start tables are accepted first and explicitly bypass the minimum.

The current large Earth table places:

- England at `(41, 15)`
- Germany at `(46, 14)`
- Rome at `(44, 17)`

Their wrapped hex distances are 5, 5, and 3. This matches the reported London/Berlin/Rome cluster. The game nevertheless displays setup guidance that balanced starts prevent adjacent rivals, without explaining that the default Earth path ignores that guarantee.

### One map choice combines two incompatible promises

The current `earth`, `old-world`, and `new-world` scripts define both:

- geographic terrain and resource layout; and
- exact civilization-specific starting coordinates.

Those concerns must be independent. A recognizable Earth map can support balanced starts, while a player who explicitly wants true historical starts can accept their inherent density.

Modern Civilization games expose ordinary Earth and True Start Location Earth as separate experiences. General start allocation first creates sufficiently separated regions and then applies civilization biases. Civilization I's true-start Earth map did not eliminate European crowding; contemporary descriptions explicitly note that crowding enabled immediate settler or chariot conquest. Conquestoria should preserve true starts as an option without treating their compromises as the default balanced experience.

### Large hot-seat maps preserve or increase roster density

Hot-seat setup currently interprets map capacity as a target. After the humans choose civilizations, it automatically appends enough AI civilizations to fill every remaining slot. Two humans on a large map therefore receive six AI opponents.

The AI list is populated in civilization-definition order, without considering:

- selected human civilizations;
- historical start proximity;
- map script;
- placement mode; or
- proximity among selected AI civilizations.

Increasing map size therefore does not necessarily increase breathing room. It can add more opponents and select a geographically clustered roster.

### Elimination state is not part of turn cycling

The shared city-capture path correctly sets `Civilization.isEliminated` when the final city is removed. Hot-seat cycling still reads only the static `HotSeatConfig.players` list. `getHumanPlayers`, `getNextPlayer`, and `isRoundComplete` cannot observe elimination.

The completed-round handoff also computes `nextSlotId` before AI and world simulation. Even a state-aware pre-simulation choice could become stale if the expected next human is eliminated during the hidden simulation.

### Elimination is only a flag, not a complete lifecycle transition

The final-city capture path can leave remaining units and linked records behind. Once turn cycling correctly skips the owner, those units would become inert map blockers. Diplomacy, espionage, treaty, transport-cargo, and opponent-planning state can also retain references to an actor the game considers eliminated.

The rule is already encoded in `Civilization.isEliminated`: losing the final city eliminates a major civilization. The mutation must apply that rule atomically across all owned state.

## Goals

1. Guarantee at least 9 wrapped hexes between every major-civilization start in balanced placement.
2. Keep Earth, Old World, and New World geography available without forcing exact historical starts.
3. Keep exact known historical starts as an explicit placement mode.
4. Select AI civilizations deterministically with awareness of humans, map, placement mode, and the partial AI roster.
5. Let hot-seat users choose AI count independently of human count and map capacity.
6. Prevent balanced generation from silently accepting an invalid close fallback.
7. Make final-city loss a canonical, actor-complete elimination transition.
8. Ensure eliminated humans never receive another handoff.
9. End a hot-seat campaign cleanly when no active human civilizations remain.
10. Preserve existing saves and accurately describe the placement semantics under which they were created.

## Non-Goals

- Rebalancing combat strength, city defenses, or AI aggression.
- Changing the fixed historical anchor tables themselves except to correct independently verified bad coordinates.
- Guaranteeing fair spacing in exact historical mode.
- Adding team starts, allied starts, or online multiplayer.
- Changing the nine-hex balanced-start constant.
- Removing historical civilization identity from geographic maps.

## Domain Model

### Placement mode

Add:

```ts
export type StartPlacementMode = 'balanced' | 'historical';
```

`SoloSetupConfig` and `HotSeatConfig` accept an optional `startPlacementMode`. New setup UI always supplies it. Direct callers default as follows:

- Geographic scripts (`earth`, `old-world`, `new-world`): `balanced`
- Generated scripts (`balanced`, `single-continent`, legacy `procedural`): `balanced`

`GameState` persists the resolved mode. Save normalization assigns:

- missing mode + geographic map: `historical`
- missing mode + generated map: `balanced`

This migration records how legacy geographic games were actually created; it does not move existing units or cities.

### Game-over reason

Add a persisted terminal reason:

```ts
export type GameOverReason = 'domination' | 'all-humans-eliminated';
```

New terminal transitions populate `gameOverReason`. Save normalization infers `domination` when a legacy save has `gameOver === true` and a winner. `all-humans-eliminated` permits `winner === null` when multiple AI civilizations remain.

### Static setup versus authoritative activity

`HotSeatConfig.players` remains the immutable record of configured seats. It is not the source of current turn eligibility.

An active human is a configured human player whose civilization:

- still exists in `state.civilizations`; and
- does not have `isEliminated === true`.

Do not infer elimination from `cities.length === 0`; every civilization begins before founding its first city.

## Start Placement Architecture

### Separate geography from placement

`MapScript` continues to choose terrain and geographic layout. `StartPlacementMode` chooses how major civilizations enter that map.

For geographic maps:

- `balanced` selects anonymous fair sites, then assigns civilizations with historical anchors used as soft preferences.
- `historical` uses exact anchors for known civilizations and balanced fallback sites for unknown or custom civilizations.

For generated maps, placement is always balanced.

### Balanced candidate generation

A candidate start must:

- exist on the map;
- be valid passable founding terrain;
- remain outside excluded polar rows where applicable;
- have workable terrain in its two-hex neighborhood; and
- satisfy any map-specific candidate constraint, such as the generated single continent.

Each candidate receives deterministic quality data:

- immediate workable-tile count;
- local terrain fertility/yield score;
- expansion-room score; and
- stable seeded tie rank.

Distance and quality are separate concerns. Quality may rank two feasible solutions, but it can never override minimum distance.

### Balanced site selection

Select the requested number of anonymous sites before assigning civilizations.

1. Run deterministic multi-start farthest-point selection.
2. At each step, discard candidates within 9 wrapped hexes of any chosen site.
3. Rank remaining candidates lexicographically by:
   - minimum distance to chosen sites;
   - weakest selected-site quality after adding the candidate;
   - total selected-site quality; and
   - seeded stable tie rank.
4. Keep the best complete solution across starts.
5. If greedy multi-start cannot complete, use bounded deterministic backtracking over the remaining conflict graph.
6. If no complete solution exists, return an explicit placement failure.

Balanced placement must never substitute a closer `bestFallback`. Game creation handles failure as a setup error and does not create a partial state.

### Civilization-to-site assignment

After balanced sites are fixed, assign civilizations to them.

- A known civilization on a geographic map has a historical anchor.
- Assignment cost is wrapped distance from that anchor to the candidate site.
- Unknown and custom civilizations use a neutral cost plus deterministic tie rank.
- Enumerate site permutations for the maximum supported roster of eight and choose the minimum total cost.
- Ties resolve deterministically from the game seed and civilization ID.

This preserves recognizable affinity where the spacing contract permits it. Historical affinity is a soft objective; it never changes the selected sites or weakens spacing.

### Historical placement

Known civilizations receive exact table anchors.

Unknown, custom, or out-of-region civilizations receive deterministic balanced fallback sites selected against all already claimed exact anchors and other fallback sites. A fallback must use a valid unoccupied tile, but exact known anchors are allowed to violate the balanced spacing minimum.

Setup must compute the actual minimum pairwise distance for the final historical roster. A result below 9 is a visible warning, not a hidden condition.

## Roster-Aware AI Selection

AI selection is a shared seeded helper used by solo and hot-seat creation.

Inputs:

- playable civilization definitions;
- selected human civilization IDs;
- requested AI count;
- map script and size;
- placement mode;
- map candidate/anchor data where relevant; and
- game seed.

Invariants:

- never duplicate a selected human or AI civilization;
- never exceed requested count or map capacity;
- never depend on catalog iteration order for the final choice;
- produce the same roster for the same inputs and seed.

For geographic maps, construct the roster incrementally:

1. Seed the selected set with all human historical anchors that exist.
2. For each available AI candidate with an anchor, calculate:
   - minimum anchor distance to the selected set;
   - total anchor distance to the selected set; and
   - seeded stable tie rank.
3. Choose the candidate maximizing those values lexicographically.
4. Repeat until the requested count is reached.
5. Consider anchorless custom or out-of-region candidates through their deterministic fallback-site score rather than treating them as colocated or infinitely distant.

For balanced placement, roster selection improves historical diversity while the independent site selector guarantees actual spacing. For historical placement, it directly chooses the least-crowded available exact roster.

If selected humans already have historical anchors closer than 9, roster selection cannot hide or repair that fact. Historical setup surfaces the warning and requires explicit confirmation.

## Setup Experience

### Solo setup

When a geographic map is selected, show placement cards:

- **Balanced** — recommended; guarantees separated viable starts.
- **True Start** — uses exact known homelands; close starts may occur.

Existing opponent-count selection remains explicit. Before enabling Start Campaign in historical mode, compute the roster-aware AI preview and surface a warning when its minimum distance is below 9. Starting a crowded historical game requires an explicit confirmation action.

### Hot-seat setup

Use these stages:

1. Map size
2. Map geography
3. Placement mode when a geographic map is selected
4. Human-player count
5. AI-opponent count, bounded by remaining map capacity
6. Human names
7. Human civilization choices
8. Final review

The final review shows:

- map size and geography;
- placement mode;
- selected human civilizations;
- requested AI count;
- roster-aware AI civilization preview;
- minimum pairwise historical distance in True Start mode;
- which civilizations require fallback placement; and
- a crowding warning when the minimum is below 9.

Balanced mode does not show a false warning because actual placement is guaranteed. True Start requires an explicit “start crowded historical game” confirmation when warned.

The default hot-seat AI count is one, not “fill every remaining slot.” The user can intentionally increase it up to capacity.

### Failure handling

Balanced site-selection failure:

- does not construct or persist a partial `GameState`;
- leaves setup choices intact;
- shows an actionable message to reduce player count or choose another map/size; and
- logs deterministic diagnostic details for development without exposing internal coordinates as the only user feedback.

Historical missing-anchor fallback is not an error. The final review identifies it before game creation.

## Canonical Major-Civilization Elimination

Create a single shared transition used whenever a major civilization loses its final city.

The transition:

1. Verifies the civilization exists, is not already eliminated, and owns no remaining city.
2. Sets `isEliminated: true` and preserves the civilization record for history, score, logs, and save compatibility.
3. Removes all remaining owned units through canonical unit lifecycle operations.
4. Removes transported cargo and linked transport state consistently.
5. Removes or resolves owned spy and espionage records without leaving captives or missions attached to a dead actor.
6. Clears opponent AI portfolios and assignments for the actor.
7. Scrubs the actor from other civilizations' relationships, `atWarWith`, active treaties, embargoes, and defensive leagues as required by existing diplomacy lifecycle rules.
8. Returns explicit transition metadata identifying removed entities and the eliminating actor.

City capture composes this transition after ownership mutation when the previous owner has no cities. Human combat, AI combat, turn processing, occupation, and raze callers therefore share the same consequence.

`civ:eliminated` is emitted from the returned transition metadata. Repeating capture/event processing against an already eliminated civilization is a no-op and does not re-emit.

## State-Aware Hot-Seat Cycling

Replace config-only cycling with state-aware pure helpers:

- `getActiveHumanPlayers(state)`
- `getNextActiveHumanPlayerId(state, currentSlotId): string | null`
- `isActiveHumanRoundComplete(state, currentSlotId): boolean`

Configured order remains authoritative among surviving humans.

### Intermediate handoff

When a human ends a turn and another active human remains later in the current round:

- choose the next active human from current state;
- never show or persist an eliminated recipient;
- preserve existing privacy and autosave behavior.

If eliminating a later human makes the current human the last active seat in configured order, the current turn completes the human round immediately.

### Completed-round handoff

Do not finalize `nextSlotId` before AI/world simulation.

1. Enter a generic privacy overlay and suppress round presentation.
2. Run the completed-round transaction.
3. Apply AI/world mutations, including elimination.
4. Resolve domination and all-human-elimination outcomes.
5. Derive the next active human from the resulting authoritative state.
6. Persist the completed state with that recipient.
7. Populate the handoff UI with the correct surviving player's identity only after the recipient is known.

This prevents a player eliminated during hidden AI simulation from appearing as the next handoff target.

### No active humans

If no active human remains:

- set `gameOver = true`;
- set `gameOverReason = 'all-humans-eliminated'`;
- leave `winner = null` unless normal domination has identified one surviving civilization;
- persist the terminal state; and
- show a Defeat panel instead of a handoff.

Normal domination takes precedence when exactly one major civilization with cities remains.

## End-State Presentation

Generalize the existing terminal panel contract to support:

- victory for the current human winner;
- defeat when another civilization wins domination; and
- defeat when all human civilizations are eliminated before AI domination resolves.

The panel remains blocking, identifies the outcome and turn, and offers New Game. It must not label an AI winner as “Victory!” to a defeated human viewer.

Loading a terminal save immediately restores the correct terminal panel from `gameOver`, `winner`, and `gameOverReason`.

## Testing Strategy

### Map placement

Add regressions that prove:

- the large Earth England/Germany/Rome roster in balanced mode has every pair at least 9 wrapped hexes apart;
- every geographic script, supported size, and supported player count returns the requested number of balanced starts;
- representative seed sweeps preserve pairwise spacing;
- identical seed/configuration produces identical sites and assignments;
- all selected tiles are valid and have workable surroundings;
- resource guarantees apply around final assigned sites;
- historical mode preserves exact known anchors;
- unknown/custom historical starts use valid deterministic fallback sites;
- a synthetic impossible map returns explicit failure rather than a close fallback;
- historical affinity assignment never changes the already valid balanced site set.

### Roster selection

Prove:

- no duplicate or human-selected civilization appears in the AI roster;
- requested AI count is honored;
- selection is deterministic;
- catalog order changes do not change a seeded result;
- for the reported humans/map, roster-aware selection has a strictly better minimum historical distance than the old first-available roster;
- partial roster scoring accounts for distance from humans and among AIs;
- anchorless candidates receive deterministic fallback scoring.

### Setup UI

Prove:

- geographic maps default to Balanced;
- generated maps do not show an irrelevant historical-placement choice;
- AI count is independent from human count and bounded by capacity;
- final hot-seat config contains the exact selected counts and placement mode;
- final review displays roster and fallback information;
- only crowded True Start configurations show the warning;
- crowded True Start cannot begin without explicit confirmation;
- Balanced setup failure remains on setup with an actionable message;
- all player-visible options remain reachable through the live setup flow.

### Elimination

Add shared-system and integration coverage for:

- final-city occupation and raze by a human;
- final-city capture by AI/non-human processing;
- no elimination while another owned city remains;
- remaining unit and cargo cleanup;
- linked spy, diplomacy, treaty, embargo, league, and AI-plan cleanup;
- immutable input state;
- exactly-once elimination event emission;
- idempotent repeated calls.

### Hot-seat lifecycle

Prove:

- zero-city pre-founding humans remain active;
- eliminated humans are skipped in configured order;
- round completion changes correctly when a later seat is eliminated;
- intermediate handoff never targets an eliminated seat;
- completed-round simulation recomputes the recipient after an AI eliminates the provisional next human;
- no-active-human state produces persistent Defeat rather than an invalid handoff;
- domination still records and renders the actual winner;
- loading terminal saves restores the correct outcome.

### Verification

Before PR creation:

1. Run `scripts/check-src-rule-violations.sh` for every changed `src/` file.
2. Run all mirrored tests for changed source files in one targeted Vitest invocation.
3. Run relevant setup, capture, handoff, save migration, and terminal UI integration tests.
4. Run the production build.
5. Run the complete test suite.
6. Exercise both setup modes and terminal outcomes in the browser.
7. Capture setup screenshots for the PR.
8. Inspect `git diff origin/main...HEAD` and the uncommitted diff in full.
9. Perform an inline code review for correctness, state completeness, determinism, privacy, test fidelity, and misleading UI.
10. Fix every finding and rerun affected verification before pushing.

## Acceptance Criteria

- A new Balanced large Earth game containing England, Germany, and Rome cannot place any pair within 9 wrapped hexes.
- New geographic games default to Balanced placement.
- True Start preserves exact known anchors and visibly warns before a crowded game begins.
- AI rosters are deterministic, map-aware, human-aware, and partial-roster-aware.
- Hot-seat map size no longer silently determines AI count.
- Balanced generation never silently relaxes minimum spacing.
- Losing the final city atomically eliminates the civilization and removes all remaining owned active state.
- Eliminated humans never receive another hot-seat turn.
- AI-round elimination cannot leave a stale handoff recipient.
- A campaign with no active humans reaches a persistent Defeat state.
- Legacy geographic saves load without relocation and are labeled historical.
- Build, complete tests, targeted regressions, source-policy checks, browser verification, and final diff review all pass.

## Research References

- [Civilization VI Earth and True Start Location Earth](https://civilization.fandom.com/wiki/Earth_%28map%29_%28Civ6%29)
- [Civilization VI starting biases and region allocation](https://civilization.fandom.com/wiki/Starting_bias_%28Civ6%29)
- [Civilization V `AssignStartingPlots` API](https://modiki.civfanatics.com/index.php/AssignStartingPlots_%28Civ5_Type%29)
- [Civilization I Earth start crowding](https://civilization.fandom.com/wiki/Earth_%28map%29_%28Civ1%29)
- [Historical-start configuration and fallback practices](https://www.keengamer.com/articles/guides/the-ultimate-civ-6-settings-for-historical-starts/)
- [Constructive strategy-game map generation with explicit fairness constraints](https://www.sciencedirect.com/science/article/abs/pii/S1875952124002544)
