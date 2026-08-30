# Issue 725 Legendary-Wonder Landmarks Design

**Date:** 2026-08-30
**Issue:** #725 — Visual batch: Terracotta Army, Crac des Chevaliers, and NORAD
**Status:** Approved for implementation

## Goal

Replace the approved generic map-landmark fallbacks for Terracotta Army, Crac des Chevaliers,
and NORAD with three distinct, readable bespoke Canvas landmarks.

## Scope and architecture

The existing legendary-wonder landmark pipeline remains the sole delivery path:

1. `legendary-wonder-landmark-catalog.ts` assigns each of the three stable bespoke asset keys.
2. `legendary-wonder-bespoke-assets.ts` registers one Canvas draw function for each key.
3. The generic landmark renderer owns all state routing, fog boundaries, construction ghosts,
   slotting, low-zoom sizing, and reduced-motion handling.

No new SVG/DOM sprite pipeline, combat animation, locomotion animation, asset loader, save shape,
or gameplay rule is introduced. The sprite-design-system prompt informs silhouette, material,
line, and motion choices; its building-SVG implementation recipe is intentionally not used because
these landmarks already have an established Canvas renderer contract.

## Visual direction

Use layered map landmarks: one unmistakable silhouette plus only the few structural details that
remain useful at mobile map scale. Geometry stays flat and readable, with warm material colors,
clean outlines, no gradients, blur, photorealism, text, logos, or faction-specific colors.

### Terracotta Army

Terracotta Army is a low, wide earthen mausoleum wall with staggered ranks of clay soldier heads
and spear tips. Its visual story is organized preparation and memorial craft, not a live attack.
Use dark clay, terracotta, and pale earthen highlights. Completed-state motion is a restrained
glint only; the static image must still read as ranks and a wall.

### Crac des Chevaliers

Crac des Chevaliers is a wide hilltop fortress: layered stone curtain walls, two gate towers, and
a central keep. It must not read as a generic hall or an active battlefield. Use light, mid, and
dark stone with a small warm highlight. Completed-state motion is a restrained flag or torch glint
that leaves the fortified silhouette fully intact in the static pose.

### NORAD

NORAD is a compact command base with a radar dome or dish, an antenna mast, and bounded radar
coverage arcs. It represents early warning and coordination, not an attack. Use dark command-base
surfaces, steel, and cool signal highlights. Completed-state motion is a slow radar sweep; in the
static pose, the dish and arcs remain visible without implying hidden aircraft or real-world logos.

## Animation and accessibility

Landmarks are stationary. They receive no unit-style attack, walk, thrust, recoil, or locomotion
animations. The only permitted motion is the existing completed-state ambient treatment described
above. Every animated draw function must render a meaningful static composition when
`reducedMotion` is true; it must not use `nowMs` in that mode.

## Information and state boundaries

| Surface state | Required result |
| --- | --- |
| Owned, visible, completed | Render the matching bespoke landmark. |
| Owned, visible, building at at least 60% progress | Render the existing generic construction ghost; do not expose completed bespoke art early. |
| Owned but not visible | Render no landmark. |
| Known rival host on a non-unexplored tile | Render the matching completed landmark through existing viewer-safe intel. |
| Unexplored rival location | Render no landmark or identity. |
| Lost race | Render no map landmark; Codex race status remains its existing text/state presentation. |
| Reduced motion | Render the same identity with no time-varying detail. |

## Tests and acceptance evidence

Add focused failing tests before asset registration changes. Tests must prove:

- each target wonder has one supported stable bespoke asset key;
- all three completed glyphs route to their own Canvas draw operation and have distinct geometry;
- generic construction ghosts remain used before completion;
- reduced motion renders each bespoke landmark without time-varying drawing;
- viewer-safe map presentation still hides unexplored rival landmarks and omits lost-race projects;
- Codex content keeps the established, plain-language historical presentation and does not depend
  on map-art internals.

Run the focused landmark catalog, renderer, map-presentation, and Codex tests; run source-rule
validation for changed source files and `scripts/run-wonder-regressions.sh` before delivery.

## Deliberate deviation from the older issue plan

The issue plan named a "lost" presentation state. Current verified landmark types expose only
`under-construction` and `completed`; a lost race is a Codex/race state, not a visible landmark.
This design preserves that information boundary instead of adding a fictional destroyed-landmark
map state.
