---
paths:
  - "src/renderer/sprites/**"
---

# Sprite System Rules

## Extension Recipe (adding a new unit or building sprite)

1. Design the sprite in Claude Design; export the JSX bundle.
2. Copy the new `FooSprite` component from the exported JSX into `units.tsx` or `buildings.tsx`.
3. Change the signature:
   - From: `function FooSprite({ faction = 'imperials', animate = 'idle' })`
   - To:   `export function FooSprite({ palette, svgOnly = false }: UnitSpriteProps): string`
4. Replace every `factionAccent(faction)` with `palette`, every `faction={faction}` on `<Banner>` with `palette={palette}`, and every `f.mid`/`f.dark`/`f.bright` with `palette.mid`/`palette.dark`/`palette.bright`.
5. Replace `<SpriteFrame animate={animate}>` with `<SpriteFrame svgOnly={svgOnly}>`.
6. If the unit uses `spyBase` or another shared helper that takes `faction`, update the helper to take `palette: FactionPalette` and update all its usages.
7. Add one line to `UNIT_SPRITE_CATALOG` or `BUILDING_SPRITE_CATALOG` in `sprite-catalog.ts`.
8. Done. Loader, renderers, and catalog tests pick it up automatically.

## Hard Rules

- **Never use `Object.assign(window, ...)` in sprite files.** All exports are named.
- **Never import React or react-dom in sprite files.** The custom JSX runtime in `jsx-runtime.ts` handles all JSX. No React dependency exists in this project.
- **All civ-specific color must flow through `palette: FactionPalette`.** Never hardcode faction names or hex colors for civ identity.
- **`getUnit()` and `getBuilding()` must return `null` for uncached keys** — never throw. Callers fall back to emoji.
- **`LOD_SPRITE_ZOOM_THRESHOLD` is exported from `sprite-system.tsx`.** Import it there in both `unit-renderer.ts` and `city-renderer.ts`. Do not redefine it locally.
- **`SpriteFrame svgOnly={true}` omits the CSS `<style>` tag.** Browser security blocks CSS animations in SVG loaded as `<img>`, so the tag is wasted bytes in preloader mode.
- **Barbarians and minor civs are not preloaded.** `getUnit('warrior', 'barbarian')` returns `null` by design.
- **Never call `initSprites` per-turn or per-frame.** It is called once in `startGame()`.

## Catalog Test Contract

`tests/renderer/sprites/sprite-catalog.test.ts` asserts that every `UnitType` value and every building ID in `BUILDINGS` has a catalog entry. This test will fail after adding a new type if step 7 above is skipped. Fix by adding the catalog line, not by weakening the test.
