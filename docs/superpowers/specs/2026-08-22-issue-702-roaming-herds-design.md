# Issue 702 Roaming Herds Design

## Purpose

Issue #702 provides the deterministic routing foundation for the future Beast Stampede.
It gives a crisis-owned herd a committed, readable two-hex path and lets a player alter
that path with visible, bounded defenses. It does not spawn a Stampede, resolve trampling,
award containment rewards, add notifications, or create a player command; those belong to
issues #703 and #704.

## Architecture

`src/systems/stampede-route-system.ts` will be the single routing boundary. Given a
crisis force, a herd unit, and the current serializable game state, it enumerates legal
adjacent tiles and chooses an outward two-step route with a stable seeded tie-break. Its
only mutator, `commitHerdRouteForTurn`, accepts the herd turn explicitly; #703 will call
that helper before it moves an active herd. The renderer consumes only the committed fact
through a viewer-scoped presentation helper, never by re-running pathfinding.

The existing `CrisisForce` registry remains its ownership and target boundary. This issue
extends it only with optional, serializable `herdRoutes` keyed by herd unit ID. A route
record contains the committed-on turn and up to two coordinates. The route exists after a
herd turn, is preserved by save/load, and is replaced only when that herd takes its next
turn. A legacy or malformed route is ignored and normalized without changing valid units
or another force's records. #702 does not invent a unit-type predicate before #703 adds
Stampede actors: the explicit caller may commit a route only for a live crisis-owned unit
that is already a member of that force.

## Routing contract

1. A herd route consists of at most two adjacent map coordinates. The herd moves at most
   two hexes when #703's crisis turn consumes the route. This issue establishes, commits,
   validates, and persists that route calculation without creating the active-crisis
   scheduler or moving a unit in the ordinary player turn loop.
2. A candidate tile must exist, be one of the land terrains (not `ocean`, `coast`, or
   `mountain`), and not be a city center. It must be unoccupied by a map unit for ordinary
   routing. No route may cross an illegal intermediate tile to reach a legal second tile.
3. “Outward” is measured from the target civilization's nearest city center, using the
   closest center with lexical city-ID tie-breaking. Each step prefers increasing hex
   distance from that center; a legal non-increasing step is used only when no increasing
   legal candidate exists. This creates a legible escape pressure rather than pursuit of
   a player unit or city.
4. Candidates sort by a deterministic tuple: outward class (increasing before fallback),
   then avoidance score, then seeded tie-break. A completed Fort scores 3 avoidance, a
   Citadel scores 4, and every adjacent fortified land military unit scores 2. The total
   avoidance score caps at 6 per candidate. Consequently, a single screen can encourage a
   detour, but neither a ring of screens nor terrain iteration order can make a legal route
   impossible or override available outward movement.
5. A completed Fort or Citadel remains legal but adds avoidance and ends that herd's
   movement immediately on entry. A route therefore never contains a second coordinate
   after a Fort/Citadel coordinate.
6. Equal-cost candidates use a stable seeded tie-break derived from `gameId`, force ID,
   herd unit ID, turn, and candidate coordinate. Iteration order, object insertion order,
   and renderer calls cannot change the selected route.
7. Route calculation reads no hidden rival units, unearned fog state, future crisis state,
   or live user-interface state. It does not create events, notifications, SFX, or combat.

## Presentation and hot seat

When a herd is visible to its target civilization, the map shows the first two committed
route hexes with a non-animated direction marker. The selected-unit panel supplies the
same fact as plain text: “Herd path: next two steps.” It also distinguishes one-step
Fort/Citadel stops from an ordinary two-step route. The markers are informational and
non-interactive, honor reduced-motion preferences, and do not use color, animation, or
sound as their only signal. No new sound effect or audio catalog entry is added: routing
is not itself an audible event.

The viewer-scoped helper returns no route for a non-target civilization, for a target that
cannot currently see the herd, or for a stale/malformed record. The selected-unit panel
also omits the label and coordinates in these cases. At a hot-seat handoff the renderer
and panel receive the new `currentPlayer` and immediately drop the former player's path;
neither recalculates a route. This preserves the previous preview until the herd's next
turn and prevents both dishonest moving markers and private-route leakage.

## Difficulty, AI, and balance

Explorer, Standard, and Veteran share terrain legality, route scoring, Fort/Citadel
behavior, preview visibility, and stable tie-breaking. Difficulty does not alter route
costs, hidden information, or movement distance. Crisis records continue to snapshot a
human target's personal challenge and use Standard for an AI target, but #702's routing is
identical for all snapshots.

The initial tuning uses a fixed two-hex movement budget and capped screen avoidance only;
it introduces no combat, damage, reward, or production advantage. This keeps the mechanic
understandable to younger/casual players while leaving exact route facts available to
optimizers and future AI response code. There is deliberately no #702-only computer turn
or special AI branch: no active Stampede exists yet. Future #704 AI consumes the same
committed route and visible screen facts rather than predicting hidden routes.

## Player truth table

| Player state | Player action | Immediate visible result |
| --- | --- | --- |
| Target player can see a routed herd | Select the herd or view the map | The panel says “Herd path: next two steps” and the map marks the committed one or two legal next tiles. |
| A Fort/Citadel is the selected first step | Select the herd or view the map | The panel says that the herd stops at the Fort/Citadel; there is exactly one marker. |
| Target player cannot see the herd | Open the map or select another entity | No route marker, label, or coordinate is exposed. |
| Hot-seat handoff changes current player | Confirm the handoff | The prior player's markers and label disappear before the next player acts; the committed route is unchanged. |

## Misleading UI risks

- “Next two steps” must mean the committed route for the stored turn, not a fresh route
  calculated from later unit/fort changes. The UI must never relabel a one-step
  Fort/Citadel stop as two steps.
- Markers must not imply a guaranteed outcome: later #703 trampling/occupancy rules can
  interrupt movement. This slice calls them an intended path, never a promise or command.
- A player who cannot currently see the herd must not receive route information merely
  because the crisis targets their civilization or because it was visible earlier.
- Fort/Citadel avoidance is a nudge, not a blockade or a required action. The panel must
  state the exact future route without claiming defensive placement is always sufficient.

## Save compatibility and errors

The implementation starts from schema 15 and advances it to schema 16 for the persisted
`CrisisForce` shape. It normalizes schema-0, schema-15, schema-16, malformed, and mid-route saves
idempotently. Coordinates must be integers naming existing map tiles; routes may only name
registered crisis-owned herd units in their own force; and a route may contain no more
than two adjacent legal coordinates. Invalid route records are removed, not repaired by
moving units or inventing a target.

## Test matrix

- Red-first routing tests for two legal outward steps, illegal water/mountain/city and
  occupied intermediate tiles, no legal route, and a legal fallback when all candidates
  fail outward progress.
- Determinism tests proving fixed seeds select the same equal-cost route across repeated
  calls and changed object insertion order.
- Fort/Citadel tests proving the exact 3/4/2 scores and cap of 6, that a selected
  Fort/Citadel ends movement after one step, and that multiple contributors cannot exceed
  the per-hex cap.
- Save tests for legacy, immediately previous, current, malformed, and mid-route records;
  a second normalization pass must produce the same state and preserve unrelated units.
- Presentation tests for a visible target, unseen herd, a different hot-seat viewer, and
  handoff. Canvas markers and selected-unit-panel text must appear immediately when
  allowed and contain neither coordinates nor markers when not allowed.
- Replay tests cover selecting a routed herd, deselecting it, reopening it, changing to a
  non-target hot-seat viewer, and returning to the target; each render uses the same
  committed fact and never triggers route recalculation.
- Human and non-human parity tests prove the same canonical routing/commit helper serves
  a human-targeted and AI-targeted force, with identical legality across all severities.

## Non-goals

- Stampede availability, warning, spawning, actor statistics, movement scheduling,
  trampling, pillaging, containment, rewards, expiry, AI response, notifications, and SFX.
- Rogue Elephant Host routing, handler command links, conversion, and resolution.
- New unit sprites or final route art/audio; this mechanics slice uses existing generic
  overlay/presentation conventions and leaves dedicated assets to #713 and #719.
