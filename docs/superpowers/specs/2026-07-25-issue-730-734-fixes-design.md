# Issues 730–734 Bug-Fix Design

## Scope

Fix five player-reported regressions without changing unrelated game rules.

- #730: Toolbar controls must not overlap at constrained desktop widths.
- #731: A unit must retain one visual display size while it transitions between
  movement and stationary render paths.
- #732: The selected-unit zone-of-control warning must be recomputed from the
  post-combat state and visibly refresh without requiring reselection.
- #733: Archer ownership must be readable from the unit's dominant visual color.
- #734: A unit with no movement left may not attack, whether the call originates
  from target highlighting or direct execution.

## Design

The shell will group its top-right controls in a flex layout with explicit gaps,
rather than positioning controls with precomputed offsets. This lets rendered
button width determine spacing at every desktop viewport.

The renderer will retain a single shared unit-layout metric for canvas, static
DOM sprites, and moving DOM sprites. The regression test will construct both
entity paths at one camera size and assert the same wrapper dimensions.

Combat will invoke the existing `selectUnit` refresh path for the surviving
selected unit after state is applied, before the animation callback chooses the
next unit. Thus the current panel, highlights, and zone-of-control guidance all
render from current state.

Archer's tunic and cap will use the resolved faction palette rather than fixed
green fills, preserving neutral material details while giving each civilization
a dominant ownership signal.

Attack targeting will reject attackers with no movement points in the shared
legality helper; the existing target enumerator and UI execution path already
delegate to it. The old ranged-zero-movement allowance is intentionally removed
because #734 defines it as a gameplay bug.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Top controls share a narrow desktop header | Render shell | Every control remains in a separate flex slot; none overlap. |
| Selected unit shows the enemy-nearby warning | Kill the sole nearby enemy | Open unit panel rerenders with the warning removed. |
| Two civilizations each field an archer | Render map | Archer clothing visibly carries each owner's palette color. |
| Unit has zero moves | Select a hostile target or invoke attack | No attack target/action is available. |

## Misleading UI Risks

The zone-of-control warning means at least one currently reachable movement
destination is constrained by a current hostile unit. A panel displaying it
after that hostile is removed is misleading. The regression must prove the
warning is absent after the state update.

## Interaction Replay Checklist

- Render the top action controls at a constrained desktop width.
- Select a unit with a zone-of-control warning, apply a combat result that
  removes the source, and rerender the same selected unit.
- Render an archer for two owners.
- Attempt targeting with zero movement through both target enumeration and the
  shared target legality function.
