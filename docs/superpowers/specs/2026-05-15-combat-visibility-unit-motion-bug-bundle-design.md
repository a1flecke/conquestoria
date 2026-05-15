# Combat, Visibility, And Unit Motion Bug Bundle Design

## Issue Set

- [#198: Barbarian and Minor Civ Graphics](https://github.com/a1flecke/conquestoria/issues/198)
- [#199: Missing unit animations](https://github.com/a1flecke/conquestoria/issues/199)
- [#200: Melee should be next to each other when attacking](https://github.com/a1flecke/conquestoria/issues/200)
- [#201: Shadow/overlay problem when zoomed out](https://github.com/a1flecke/conquestoria/issues/201)

## Goals

Fix the next bug bundle as one coherent design with two reviewable implementation slices:

1. **Rules and visibility truth:** melee/ranged attack eligibility plus fog and wrap rendering correctness.
2. **Unit visual identity and motion:** barbarian/minor-civ sprite identity plus full per-sprite movement animation.

The bundle must make player-visible behavior consistent across the live UI, renderer, player input, and non-player combat paths. Combat and visibility must feel legible rather than surprising: players must understand why a target can be attacked, why a tile is hidden, and which faction a moving unit belongs to without opening a panel.

## Non-Goals

- Do not create unique barbarian-only or minor-civ-only base unit art in this bundle. Barbarians and minor civs reuse the same base unit sprites as major civilizations.
- Do not replace the entire visibility model with a full historical replay system. This bundle adds a lightweight viewer-scoped last-seen presentation snapshot for fogged tiles, but it must not record turn-by-turn history or expose hidden live state.
- Do not ship generic slide-only movement as the final #199 fix. Movement must include per-sprite moving-state art or motion frames.
- Do not fork gameplay or renderer behavior for web versus Tauri.

## Slice 1: Attack Rules And Visibility Truth

### Attack Eligibility

Introduce an explicit attack-profile model for units. The default profile is melee range 1. Ranged units such as Archers get an explicit ranged profile. Any future ranged unit must opt into range through typed metadata instead of inheriting attack range from movement range.

The attack profile must distinguish attack reach from movement reach. A melee unit can move multiple hexes in one turn, but it can only attack a hostile target on an adjacent hex. A ranged unit can attack hostile units within its explicit attack range without moving into the defender's hex. Ranged attacks consume the attacker's action and movement for the turn unless a unit definition explicitly grants a later exception.

City attacks and city capture remain adjacent actions by default. A ranged unit can attack a city from range only if it has an explicit future `siege` or `bombard` attack profile; ordinary Archer-style ranged attacks do not capture, raze, or damage cities from range in this bundle.

The shared attack-target helper must answer whether a unit can attack a target hex using:

- the unit attack profile
- hex distance, including horizontal wrapping
- current visibility for player-visible attacks
- occupant or city target state
- hostility and diplomacy rules
- target terrain where combat preview or resolution already needs defense information

Player selection highlights, tap intent, combat preview, and player attack execution must use this helper or a thin renderer-facing projection of it. AI, barbarian, minor-civ, and turn-manager attack selection must also use the shared rule unless a later spec creates an explicitly named special attack profile. Melee units must not attack non-adjacent hostile units or cities through player, AI, barbarian, minor-civ, or turn-processing paths.

Attack highlights must be separate from movement highlights. A non-adjacent ranged unit target must be marked as an attack target, not as a movement destination. A non-adjacent melee target must not be highlighted as attackable even if the tile is inside the unit's movement range.

### Visibility And Fog Rendering

`VisibilityMap` remains the source of truth for whether a tile is `visible`, `fog`, or `unexplored`. Renderer code must normalize every rendered coordinate, including horizontal wrap ghost copies, back to the canonical map tile before checking visibility.

Fogged tiles need viewer-scoped last-seen presentation data. The snapshot is not a full history log; it is the latest player-earned presentation for terrain, visible improvements/resources, known city presence, ownership/territory presentation, and any other map content the renderer would otherwise be tempted to read live. It must be updated when the tile is currently visible. It must not update while the tile is fogged or unexplored.

The snapshot must stay serializable with the rest of game state. Existing saves that have only `VisibilityMap` must migrate safely by treating missing last-seen presentation as unknown until the tile is visible again; they must not crash and must not reveal live state as a fallback.

The visual contract is:

- `visible`: show live terrain, cities, and currently visible units.
- `fog`: show the viewer's last-seen presentation under the existing dim overlay, but do not show live units or undiscovered current changes.
- `unexplored`: keep the tile fully hidden.

This contract must be invariant across zoom levels. Low zoom and wide viewports must not skip overlays, thin them until terrain leaks through, or render wrap copies with a different visibility state from the canonical tile. The renderer must not choose a low-detail path that bypasses canonical visibility or last-seen presentation.

## Slice 2: Unit Visual Identity And Full Motion

### Barbarian And Minor-Civ Graphics

Barbarian and minor-civ units reuse the same base unit sprite catalog as major civilizations. Their visual identity comes from:

- owner-specific palette or color
- a small role marker that distinguishes `barbarian`, `minor`, and `major`
- the same fallback icon behavior used by major-civ units if an image is unavailable

The role marker must render for both stationary and moving units. It must remain readable at normal unit-rendering zoom. It can simplify or disappear only at an existing low-detail threshold where sprites already fall back to simpler marks. Use these role semantics: barbarian units get a small hostile chevron marker, minor-civ units get a small city-state diamond marker, and major-civ units omit the marker.

Sprite loading must either preload barbarian and active minor-civ palettes or generate/cache those palette variants on demand. `getUnit()` and `getBuilding()` must continue returning `null` for uncached keys so existing fallback behavior remains safe. Palette generation must not leak undiscovered minor-civ identity details beyond what the player has earned through normal visibility and presentation rules.

### Movement Animation

Movement animation must show both:

- travel from the source hex to the destination hex
- per-sprite locomotion while traveling

Each current unit sprite must support a moving state or motion-frame sequence appropriate to that unit. Infantry must visibly step; animal units must run or lope; ships must sail with wake or hull motion; future wheeled/mechanical units must animate wheels or comparable motion. This is full per-sprite motion, not a generic slide with one shared effect. The moving state can reuse shared sprite subparts, but each unit's exported sprite must intentionally define what its moving frames look like.

The moving unit must use the same resolved visual identity as the stationary unit: base sprite, owner palette, fallback behavior, and barbarian/minor role marker. During movement, the renderer must avoid drawing both the stale idle unit at the destination and the animated moving unit in a way that looks duplicated. Player commands must not be accepted against a stale moving unit state. Movement animation must be fast enough to keep the game responsive: target 200-350ms for a normal one-hex move, scaling modestly for longer paths without exceeding 600ms for ordinary player movement.

## Data Flow

### Attack Flow

1. Unit selection builds player-visible move and attack targets from shared movement and attack helpers.
2. The renderer receives distinct highlight records for movement and legal attack targets.
3. Tapping a legal attack target opens combat preview.
4. Confirming the preview revalidates legality and executes combat through the same boundary.
5. Non-player attack selection uses the same melee/ranged distance rule where it can attack units or cities.

### Visibility Flow

1. Systems update each civilization's canonical `VisibilityMap`.
2. When a tile becomes or remains visible, systems refresh that viewer's last-seen presentation for the tile.
3. Render loop asks renderer helpers for canonical visibility when drawing base tiles, wrap copies, cities, units, and fog overlays.
4. Visible tiles render from live state. Fogged tiles render from viewer-scoped last-seen presentation. Unexplored tiles render only the hidden treatment.
5. Fog overlays are drawn after map content, but their canonical visibility decision must match the underlying tile and every wrap copy.
6. Unit/city rendering must show only data allowed by the viewer's canonical visibility state and last-seen presentation.

### Unit Visual Flow

1. A shared unit-visual resolver accepts unit, owner, game state, current zoom/detail tier, and animation state.
2. The resolver returns sprite key, palette/color, fallback icon, role marker, and motion-state information without changing game state.
3. Stationary drawing and movement animation both consume the resolver.
4. Sprite catalog coverage proves every current unit has idle and moving visual output.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| A Warrior is selected and an enemy is two hexes away inside movement range | Player taps the enemy | No combat preview opens; the enemy tile is not attack-highlighted; movement/selection state remains understandable |
| An Archer is selected and a visible enemy is inside its attack range | Player taps the enemy | Combat preview opens; confirming attacks without moving the Archer into the defender's hex |
| An Archer is selected and a hostile city is two hexes away | Player taps the city | No ranged city attack or capture preview opens unless that unit has an explicit siege/bombard profile |
| A ranged unit has a fogged or unexplored enemy location inside theoretical attack range | Player selects the unit | No attack highlight appears for that hidden target |
| A tile leaves vision | Player zooms out or pans across wrap copies | The tile remains fogged with last-seen presentation and does not reveal live units, live city changes, or uncovered terrain |
| A barbarian or minor-civ unit moves | Movement begins | The moving unit shows its owner color, role marker, and per-sprite motion frames throughout travel |
| A unit is moving | Player taps the moving unit or its destination before animation completion | No second command is accepted against stale visual state; once animation completes, normal selection resumes |
| A wrapped move crosses the horizontal edge | Movement begins | The unit takes the short wrapped route, not a long slide across the whole map |

## Edge Cases

- Wrapped maps must compare attack range and visibility with wrapped distance, not raw `q` deltas.
- Ranged units cannot attack targets hidden by fog or unexplored visibility through the player UI.
- Fogged tiles must not display live enemy units, barbarian units, minor-civ units, or newly changed city/unit state. If a city was last seen on a tile, the renderer shows the last-seen city presentation, but not live ownership, population, garrison, production, or destruction changes until the tile becomes visible again.
- Missing last-seen presentation must render as unknown fog, not as live terrain.
- Last-seen presentation must be viewer-scoped. Hot-seat players must not share each other's stale map knowledge.
- Barbarian and minor-civ role markers must not depend on hardcoded owner IDs beyond the existing `barbarian` owner and `mc-` minor-civ ID convention.
- If sprite loading for a minor civ has not completed, rendering falls back to the same base icon plus owner color and marker rather than throwing or showing a major-civ sprite.
- Movement animation must preserve health bars, stack indicators, and role markers where those are visible for stationary units.
- Movement animation must handle wrapped movement without jumping across the long side of the map when a short wrapped path exists.
- Movement animation must handle stacked units by animating only the unit that moved and preserving a coherent stack count before and after the move.
- If a moving unit enters or leaves visibility during the animation, the final rendered state must obey the viewer's current visibility after movement resolution.

## Test Requirements

Slice 1 tests:

- system tests proving melee units cannot attack non-adjacent hostile units or cities
- system tests proving ranged units can attack at their explicit range
- negative tests proving ordinary ranged units cannot attack or capture cities from range without an explicit siege/bombard profile
- negative tests proving ranged attacks cannot target fogged or unexplored units through the player path
- player input or UI tests proving attack highlights and combat preview respect melee/ranged eligibility
- a replay test proving attack confirmation revalidates legality after selection state changes
- AI or turn-manager parity tests if implementation changes non-player attack selection
- fog renderer tests for low zoom, wide viewport, and horizontal wrap ghost copies
- visibility tests proving canonical wrapped coordinates share one visibility state
- hot-seat visibility tests proving last-seen presentation is viewer-scoped
- migration tests proving saves without last-seen presentation do not crash or reveal live fogged terrain
- stale-city tests proving fogged city presentation does not read live ownership, garrison, population, destruction, or production state

Slice 2 tests:

- sprite catalog or sprite-system tests proving every current unit sprite has idle and moving visual output
- renderer tests proving barbarian units use the shared base unit sprite with barbarian color and marker
- renderer tests proving minor-civ units use the shared base unit sprite with minor-civ color and marker
- animation tests proving moving units use the same visual resolver as stationary units
- animation tests proving movement interpolation does not draw duplicate idle and moving copies
- wrap movement animation tests proving the animation follows the short wrapped route
- animation tests proving command lockout during movement and normal command availability after completion
- stack animation tests proving moving one unit out of a stack updates the visible stack count coherently

Required verification for implementation:

- `scripts/check-src-rule-violations.sh` for changed `src/` files
- mirrored or smallest relevant targeted tests for changed source areas
- `./scripts/run-with-mise.sh yarn build` before push or PR
- `./scripts/run-with-mise.sh yarn test` before push or PR

## Implementation Slices

### Slice 1: Rules And Visibility Truth

Implement attack profiles and shared attack eligibility first, then wire player highlights, tap intent, combat preview, and player attack execution through that rule. Audit non-player attack paths and add parity coverage where they can currently violate melee adjacency. Ranged attacks must be modeled as attacks, not as movement into an occupied hex.

Then fix fog/wrap rendering by canonicalizing visibility lookups for every render copy, adding lightweight viewer-scoped last-seen presentation, and strengthening low-zoom overlay tests.

### Slice 2: Unit Visual Identity And Motion

Create the shared unit-visual resolver. Use it for stationary unit rendering first, adding barbarian and minor-civ palette plus role marker support.

Then extend the sprite catalog with moving-state or motion-frame output for every current unit sprite. Wire movement animation to use those frames while interpolating along the unit path, preserving owner color and role markers throughout the animation. The slice must not ship a moving animation entry point until all current unit sprites have an intentional moving state or frame sequence.

## Acceptance Criteria

- Warriors, Swordsmen, Pikemen, hounds, spies, ships without ranged profiles, and other melee/default units cannot attack non-adjacent targets.
- Archers and any future explicitly ranged units can attack visible hostile units at their stated range.
- Ordinary ranged units cannot attack or capture cities from range without an explicit siege/bombard profile.
- Zooming out never reveals terrain or live state that should be hidden by `fog` or `unexplored`.
- Fogged tiles render viewer-scoped last-seen presentation, not live state.
- Horizontal wrap copies render with the same visibility state as their canonical tile.
- Barbarian and minor-civ units use the same base sprites as major civs, but unique colors and role markers make their owner type clear.
- Unit movement shows per-sprite moving animation while traveling between hexes.
- Moving units keep the same sprite, owner color, marker, and fallback identity as stationary units.
- Moving units cannot receive duplicate commands during animation, and normal commands resume after animation completion.
- Ranged attacks, fog behavior, role markers, and motion frames make combat more readable and lively without adding hidden information or slowing down ordinary turn flow.
- The implementation can ship as two reviewable slices without leaving dead player-visible controls or half-wired visual states.
