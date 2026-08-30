# Issue 711 Siege and Capital Ship Sprites Design

## Goal

Replace the four temporary unit-sprite aliases owned by #711 with distinct, faction-aware SVG silhouettes that remain readable on Conquestoria's map.

## Scope and evidence

Audited against `origin/main` at `698379d103c7d8ec833fa01e857f47741f4502fe`:

- `trebuchet` renders `CatapultSprite`.
- `rocket_artillery` renders `ArtillerySprite`.
- `battleship` and `missile_cruiser` both render `PreDreadnoughtSprite`.

The issue owns only those four visual replacements. It does not change unit definitions, combat values, production, AI, saves, audio, or native-v2 animation art. The generated four-unit reference sheet reviewed during design is a non-shipping aid; it is not a project asset.

## Architecture

Add four `UnitSpriteProps` exports to `src/renderer/sprites/units.tsx`, each using the existing 128 by 128 `SpriteFrame`, material palette, `Shadow`, and faction `Banner`. Register each export through the existing `withMotion` wrapper in `UNIT_SPRITE_CATALOG`.

That catalog registration is the live integration point. The Canvas production badge already rasterizes catalog SVG while loading, and `getUnitSpriteV2` uses the catalog as its live fallback in the map DOM overlay. No renderer or visibility code changes are needed. `buildUnitEntities` continues to omit fogged and unexplored units before an entity reaches the overlay.

The sprites use only the existing `ranged` and `naval` body-plan kinds. They must not add a CSS animation kind, a unit-specific renderer branch, an ID switch, or hard-coded faction colors.

## Approved silhouettes

### Trebuchet

A tall wooden A-frame, hanging stone counterweight, long throwing beam and sling, and four-wheel carriage. The counterweight and triangular support are visible before texture detail, making it unmistakably different from the Catapult's torsion frame.

### Rocket Artillery

A low armored wheeled chassis, angled rectangular rack of multiple rocket tubes, simple stabilizer struts, and a small ammunition crate. It must not contain a single long cannon barrel or duplicate the Artillery carriage.

### Battleship

A long armored hull, three visually separated heavy turrets, compact bridge and rangefinder mast, restrained waterline, and a faction pennant. Its three-turret fighting-line profile reads as a larger successor to the two-turret Pre-Dreadnought rather than a duplicate hull with altered decoration.

### Missile Cruiser

A slim modern hull, grouped vertical-launch missile cells, angular enclosed bridge, two radar-array panels, and a faction pennant. It must not contain a third gun-battleship turret profile, look like a generic destroyer, or depict a launched missile as persistent map state.

## Shared visual constraints

- Flat, geometric, right-facing 2.5D SVG at 40–120 pixels; major outlines use `P.ink.line`.
- Use material constants from `MATERIAL_PALETTE`; faction identity appears only through the supplied `palette` and `Banner`.
- No gradients, blur, photorealism, text, logos, raster files, or copied donor components.
- Each sprite includes semantic structural class hooks so regression tests can prove role-defining forms rather than merely a different SVG string.
- Existing `withMotion` supplies transforms and `data-motion`; no new animation CSS is part of this issue. Existing reduced-motion behavior remains unchanged.

## Verification contract

`tests/renderer/sprites/sprite-catalog.test.ts` will prove each new catalog entry differs from its former donor and includes the approved structural markers:

| Unit | Former donor | Required markers |
| --- | --- | --- |
| `trebuchet` | `CatapultSprite` | A-frame, counterweight, beam, sling, carriage |
| `rocket_artillery` | `ArtillerySprite` | chassis, launcher rack, tube bank, stabilizer |
| `battleship` | `PreDreadnoughtSprite` | hull, three turrets, bridge, rangefinder |
| `missile_cruiser` | `PreDreadnoughtSprite` | hull, vertical-launch cells, bridge, radar arrays |

`tests/renderer/sprites/v2/index.test.ts` will add the four units to representative live-fallback coverage, proving their DOM-overlay output is non-null, has its wrapper and animation hook point, and keeps percentage sizing. `tests/renderer/unit-renderer-overlay.test.ts` will parameterize the four types through visible, fogged, and unexplored paths, proving they render when visible and never leak through fog.

The implementation must first add focused failing regressions, then replace the aliases. Run the three affected test files, `scripts/check-src-rule-violations.sh` for changed `src/` paths, and a separate TypeScript build before delivery.

## Out of scope

Native-v2 hand rigging, new motion CSS, audio effects, changes to fog behavior, game-rule changes, raster assets, and any other open alias noted by the general audit remain outside #711.
