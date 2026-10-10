---
name: png-unit-sprite
description: Use when asked to create, replace or migrate a unit's art to a painted PNG spritesheet (generate a source image with SpriteCook, rig it with scripts/sprite-puppet, register it in the PNG catalog). Covers prompt conventions, credit spending, rigging, registration, in-game verification.
paths:
  - "src/renderer/sprites/png/**"
  - "scripts/sprite-puppet/**"
  - "design/png-sprites/**"
---

# PNG unit sprites (SpriteCook source → puppet rig → game)

The full recipe, spec reference and limits are in `scripts/sprite-puppet/README.md` — read it first. This skill is the
operating procedure.

## Spending rules (credits are the user's money)

- Call `get_credit_balance` and `list_generation_models` (both free) and **state the cost before the first generation**.
  Reference model: `gpt-image-2.5-flare`, detailed mode (`pixel=false`), 1K, medium quality, transparent = **8 credits**.
- One generation per unit unless the user asks to retry. Never run `animate_game_art` (cost is not shown up front) — the
  puppet rig provides animation for free.
- Record every generation in `design/png-sprites/sources/<id>.provenance.json` (asset id, prompt, model, credits).
- SpriteCook needs the user to authorize its MCP server (`/mcp`); you cannot do that for them.

## Prompt template

> `<Unit>` unit for a historical civilization strategy game. `<one-line description of the unit and its gear>`. Clean
> side view facing right, full figure centered, readable silhouette at small size, limbs and weapon clearly separated.
> The faction-coloured cloth (`<tunic/cloak/banner>`) is saturated pure red and NOTHING else in the image is red.

Style parameters (match the Horseman): `style="clean hand-painted 2D game art, bold dark outline, flat cel shading with
soft highlights, earthy saturated palette"`, `theme="historical 4X strategy game unit"`, `bg_mode="transparent"`,
`smart_crop_mode="tightest"`. For a roster-consistent look pass the Horseman asset
(`4c7b5e87-4648-4d09-a758-d2d0f8dee172`) in `style_asset_ids`.

Download the result with `sprite_url` into the scratchpad, **view it on a green background** (a black viewer background
makes transparent halos look like debris), check the alpha, then copy it to `design/png-sprites/sources/<id>.png`.

## Rig

Start on `profile: "static"`; use `mounted` only for a horse-and-rider body plan. Build, look at the preview **at game
scale**, iterate (see README "Rig spec reference"). Do not hand-edit the generated files.

## Register and verify

1. Add the manifest import + one row to `PNG_UNIT_SPRITES` (`src/renderer/sprites/png/png-sprite-catalog.ts`). Keep the
   unit's SVG sprite in `sprite-catalog.ts` (it is the fallback).
2. Add the unit to the `png-sprite-spike` scenario in `src/testing/scenarios.ts` if it is not there.
3. `./scripts/dev.sh test tests/renderer/sprites/png` then the full `verify-impact` evidence.
4. Look at it in the running game (`preview_start`, `?scenario=png-sprite-spike`): selected, walking (move it), attacking,
   a second civ's tint. **`preview_stop` immediately afterwards** (game audio plays through the user's speakers).

Show the user before/after images at 48 / 72 / 128 px before calling a unit done; the user approves art.
