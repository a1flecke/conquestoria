# Issues 823–827 Bug-Squash Design

## Goal

Repair the reported Bestiary, naval rendering, pirate landmark, attack-legality, and reactive-AI defects while covering the shared patterns that produced them.

## Decisions

### Bestiary art containment (#823)

Each discovered beast keeps a 72px art slot. The slot clips overflow and its child SVG fills that slot, so a sprite cannot alter card layout. Unknown-beast text treatment is unchanged.

### Late-era naval rendering (#824)

Carrack, Galleon, Steamship, and Troop Transport must emit one valid v2 wrapper containing SVG-only figure markup. The existing wrappers nest v1 HTML inside SVG and are invalid. The design source is canonical; generated v2 assets are regenerated rather than hand-edited.

### Pirate flotilla landmark (#825)

Deep-sea flotillas use a flagship-plus-two-escorts composition. Sail stages use the existing pirate frigate language: curved dark hulls, lighter decks, red lower-hull stripe, cream/red sails, broadside cannon ports, skull pennant, and pale wakes. Iron stages evolve that same composition to a turreted flagship with armed escorts. Damage, blockade, relocation, and tier effects remain separate runtime overlays.

Flotilla stage one is not a supported landmark state. Presentation must select a safe supported sprite for malformed or legacy stage-one flotilla data instead of inventing an invalid sprite ID.

### Domain-aware combat legality (#826)

Unit attack profiles gain explicit unit-domain targets. Land melee attacks target land units only. Land ranged/bombard attacks retain land and naval targeting. Naval and air capabilities retain their intended targets. A single shared domain check is used by both profile-only and full-state legality APIs so previews, AI, and execution agree.

### Reactive AI movement (#827)

The shared combat-targeting layer identifies hostile ranged units that can currently attack a unit. Major-civilization melee units rank reachable pursuit moves toward those threats ahead of ordinary strategic-plan movement but below mandatory withdrawal. Beast and barbarian target selection prioritizes those threats within existing leash and camp-defense constraints. Pirate targeting is deliberately limited to legal naval opponents; it must not chase shore-based attackers it cannot target.

## Validation

- DOM tests verify Bestiary art isolation.
- Sprite serialization tests reject nested HTML in v2 SVG output and cover all four late-era naval units.
- Pirate landmark tests cover all flotilla stages, weapon silhouettes, visual-state hooks, and safe stage-one handling.
- Attack-targeting tests prove land melee cannot attack naval units while ranged and naval positive cases remain legal.
- Deterministic AI tests prove major civs, beasts, barbarians, and pirates use only legal reactive targets and retain their movement constraints.
