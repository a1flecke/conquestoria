# Issue 711 Siege and Capital Ship Sprites Design

## Goal

Replace the four temporary unit-sprite aliases owned by #711 with distinct, faction-aware SVG silhouettes that remain readable on Conquestoria's map.

## Scope and evidence

Audited against `origin/main` at `698379d103c7d8ec833fa01e857f47741f4502fe`:

- `trebuchet` renders `CatapultSprite`.
- `rocket_artillery` renders `ArtillerySprite`.
- `battleship` and `missile_cruiser` both render `PreDreadnoughtSprite`.

The issue owns only those four visual replacements and their native-v2 animation hooks. It does not change unit definitions, combat values, production, AI, saves, audio, or fog rules. The generated four-unit reference sheet reviewed during design is a non-shipping aid; it is not a project asset.

## Architecture

Each unit has two deliberately matched render paths:

1. A `UnitSpriteProps` export in `src/renderer/sprites/units.tsx`, registered through `withMotion` in `UNIT_SPRITE_CATALOG`. This is the Canvas production badge and the neutral/minor-civilization fallback.
2. A native-v2 component in `design/conquestoria-sprites/lib/units-v2.jsx`, serialized into `src/renderer/sprites/v2/<unit>.svg.ts`, and registered in `src/renderer/sprites/v2/index.ts`. This is the normal six-faction map DOM overlay path and owns actual idle, travel, and attack behavior.

The two paths share the same silhouette contract and palette limits. Native-v2 is required here because the fallback wrapper deliberately omits `data-kind` from its animation root; an inner marker in a catalog SVG cannot activate the wrapper-scoped v2 motion selectors. `buildUnitEntities` continues to omit fogged and unexplored units before either path reaches the overlay.

Use only the existing `ranged` and `naval` native-v2 body-plan kinds, plus four local `data-kind-variant` values. Add narrowly scoped animation selectors for those variants; do not add a global animation kind, an ID switch in gameplay/renderer code, or hard-coded faction colors.

## Approved silhouettes

### Trebuchet

A tall wooden A-frame, hanging stone counterweight, long throwing beam and sling, and four-wheel carriage. The counterweight and triangular support are visible before texture detail, making it unmistakably different from the Catapult's torsion frame.

### Rocket Artillery

A low armored wheeled chassis, angled rectangular rack of multiple rocket tubes, simple stabilizer struts, and a small ammunition crate. It must not contain a single long cannon barrel or duplicate the Artillery carriage.

### Battleship

A long armored hull, three visually separated heavy turrets, compact bridge and rangefinder mast, restrained waterline, and a faction pennant. Its three-turret fighting-line profile reads as a larger successor to the two-turret Pre-Dreadnought rather than a duplicate hull with altered decoration.

### Missile Cruiser

A slim modern hull, grouped vertical-launch missile cells, angular enclosed bridge, two radar-array panels, and a faction pennant. It must not contain a third gun-battleship turret profile, look like a generic destroyer, or depict a launched missile as persistent map state.

## Motion and attack contract

| Unit | Idle and locomotion | Attack |
| --- | --- | --- |
| Trebuchet | Stable carriage with a restrained wheel-roll on `walk`; never a humanoid gait. | The throwing beam and sling swing through a local firing arc while the counterweight drops; the chassis stays planted. |
| Rocket Artillery | Six-wheel chassis rolls on `walk`; the launcher stays locked to the chassis. | The launcher rack recoils locally and tube mouths flash together; no generic body lunge or persistent rocket. |
| Battleship | Existing naval idle/walk rock moves the hull as a ship. | The three turrets recoil locally with brief muzzle flashes; the ship keeps its naval silhouette rather than using a ground-unit lunge. |
| Missile Cruiser | Existing naval idle/walk rock moves the hull; radar-array panels retain a subdued scan. | VLS lids and a short launch indicator animate locally, then return closed; no missile stays present after the attack frame. |

Every v2 component uses `SpriteFrameV2` with an appropriate `kind`/`variant`, `cq-shadow`, and the named local hooks. Hooks animate only from untransformed child wrappers, so no physical joint, turret, rack, or beam disconnects. The existing reduced-motion stylesheet disables temporal movement while retaining the complete static silhouette and meaningful launch/firing forms.

## Shared visual constraints

- Flat, geometric, right-facing 2.5D SVG at 40–120 pixels; major outlines use the project ink color.
- Grounded historical/industrial realism is rendered through Conquestoria's warm, hand-made material palette. Do not add magic, fantasy runes, real-world flags, or national markings.
- Use material constants and supplied faction palettes only; faction identity appears as a small pennant/identifier rather than dominating a hull, carriage, or launcher.
- No gradients, blur, photorealism, text, logos, raster files, copied donor components, or generic icon silhouettes.
- Each sprite includes semantic structural class hooks so regression tests can prove role-defining forms rather than merely a different SVG string.
- Catalog `withMotion` preserves the existing fallback movement transform. Native-v2 selectors supply the specific map-overlay locomotion and attack behavior. Existing reduced-motion behavior remains unchanged.

## Verification contract

`tests/renderer/sprites/sprite-catalog.test.ts` will prove each new catalog entry differs from its former donor and includes the approved structural markers:

| Unit | Former donor | Required markers |
| --- | --- | --- |
| `trebuchet` | `CatapultSprite` | A-frame, counterweight, beam, sling, carriage |
| `rocket_artillery` | `ArtillerySprite` | chassis, launcher rack, tube bank, stabilizer |
| `battleship` | `PreDreadnoughtSprite` | hull, three turrets, bridge, rangefinder |
| `missile_cruiser` | `PreDreadnoughtSprite` | hull, vertical-launch cells, bridge, radar arrays |

`tests/renderer/sprites/v2/index.test.ts` will prove all four assets resolve through the native-v2 path for each faction, carry their exact `kind`/`variant` and semantic hooks, and retain a complete percentage-sized DOM wrapper. `tests/renderer/sprites/sprite-animations-v2-css.test.ts` will prove each variant suppresses inappropriate generic gait/lunge motion and owns its required locomotion and attack selector. `tests/renderer/sprite-overlay.test.ts` will prove the visible DOM sprite receives `walk` and `attack` state changes. `tests/renderer/unit-renderer-overlay.test.ts` will parameterize the four types through visible, fogged, and unexplored paths, proving they render when visible and never leak through fog.

The implementation must first add focused failing regressions, then replace the aliases. It must serialize the reviewed native-v2 components before registering their generated modules. Run the four affected test files, `scripts/check-src-rule-violations.sh` for changed `src/` paths, and a separate TypeScript build before delivery.

## Out of scope

Audio effects, changes to fog behavior, game-rule changes, raster assets, and any other open alias noted by the general audit remain outside #711.
