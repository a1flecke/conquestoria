# Issue 711 Projectile Feedback Design

## Goal

Make the Trebuchet and Rocket Artillery attack states visibly fire while keeping
every frame inside the native 128 by 128 sprite bounds and preserving a clean
idle silhouette.

## Contract Change

Earlier Issue 711 review text prohibited a persistent projectile. The user has
explicitly changed that contract: each projectile is now allowed only inside
the `attack` timeline. It is absent at idle, walk, hurt, death, and reduced
motion, and disappears before the animation loops.

## Trebuchet

Move the beam/sling composition inward so the sling and its full attack arc
cannot reach the right sprite edge. The idle sling remains visibly empty. In
the attack state, a single dark stone appears in the sling during wind-up,
arcs upward and right after release, and fades before it can cross the 128px
viewBox. The carriage, A-frame, and wheels remain fixed during the shot.

## Rocket Artillery

Keep the six-wheel chassis, stabilizers, and tube rack fixed except for the
existing local rack recoil. Add two small, staggered rockets that emerge from
the foremost tube bank only during attack. Each rocket has a bounded up-right
flight and a brief exhaust flash, then fades before reaching the sprite edge.
No rocket or exhaust is visible in idle, walk, hurt, death, or reduced-motion
states.

## Animation and Accessibility

Both effects use named production CSS animation hooks and `data-state="attack"`
selectors. Their default opacity is zero. The reduced-motion stylesheet leaves
the complete static silhouette intact and hides the attack-only projectile
layers rather than freezing a stone or rocket mid-flight.

## Verification and Remote Review

Regression tests must prove that each native source contains its named
projectile hooks, CSS keeps them hidden outside attack, attack selectors assign
real animations, and the Trebuchet sling source geometry is not placed against
the right viewBox edge. Regenerate the four remote-review GIF reels and update
the remote Markdown review to describe the new attack feedback before opening
the draft pull request.
