# Sprite Defect Prompts — 2026-05-30 (final audit after S6 handoff)

## Status — all original defects resolved

| Original Defect | Status | How |
|----------------|--------|-----|
| Work-state preview button (S5) | ✅ Resolved | Preview has Idle/Walk/Work; animations verified |
| V2 rollout (18 original units) | ✅ Resolved | All 18 in `design/conquestoria-sprites/lib/units-v2.jsx`; serialized to `src/renderer/sprites/v2/` |
| PikemanV2 forward-thrust keyframe | ✅ Resolved | `cq2-attack-pike-thrust` in game CSS; `variant="pike"` wires it via `data-kind-variant` |
| Wonder sprites (S6) | ✅ Resolved | 4 legendary + 4 natural integrated in PR #307 |

---

## ACTIVE DEFECT 1 — V2 sprites needed for S4b + S5 units (10 units)

**Background**: The V2 sprite system serializes design-project React components into
static HTML strings (`src/renderer/sprites/v2/<name>.svg.ts`). The serialize script
(`scripts/serialize-sprites.mjs`) already handles all 18 original units. The 10 units
added in S4b and S5 are missing from both the design library and the serialize list.

**How the game wires V2 sprites**: The serialize script reads from
`design/conquestoria-sprites/lib/units-v2.jsx`, renders each component to static markup,
and writes `src/renderer/sprites/v2/<name>.svg.ts`. The game then imports these files
wherever inline animated SVG is needed (unit detail panels, ceremony screens, etc.).

**Critical**: Read the existing PikemanV2Sprite in `design/conquestoria-sprites/lib/units-v2.jsx`
before writing any new sprites — it uses `variant="pike"` in `SpriteFrameV2` (which generates
`data-kind-variant="pike"` on the SVG), NOT a `cq-pike` CSS class. Follow that pattern exactly.
All hooks must follow the wrap rule: no `className="cq-*"` element may also have
`transform="..."` on the same element. Exception: `.cq-weapon` uses `view-box` pivot vars.

**Reference files** (fetch these before starting):
```
https://raw.githubusercontent.com/a1flecke/conquestoria/main/design/conquestoria-sprites/lib/units-v2.jsx
https://raw.githubusercontent.com/a1flecke/conquestoria/main/design/conquestoria-sprites/lib/sprite-system.jsx
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css
https://raw.githubusercontent.com/a1flecke/conquestoria/main/scripts/serialize-sprites.mjs
```

**Prompt for Claude Design**:

> Add V2 sprites for the 10 units that were added in S4b and S5 but are missing
> from the V2 design library. Paste directly into
> `design/conquestoria-sprites/lib/units-v2.jsx` after the existing sprites.
> Read the file at the URL above before starting — follow the exact same patterns
> (SpriteFrameV2, HumanoidV2, hook wrap rule, `phase` with no default, etc.)
>
> **S4b — military units (8):**
>
> | Unit | Kind | Pattern | Notes |
> |------|------|---------|-------|
> | AxemanV2Sprite | melee | Like Warrior | axe as .cq-weapon, pivot at shoulder; no shield |
> | SpearmanV2Sprite | melee | Like Pikeman | long spear, variant="spear"; thrust keyframe already exists (use it) |
> | HorsemanV2Sprite | hound | Like ScoutHound | light cavalry; rider sits on horse body; variant="scout" tempo |
> | CavalryV2Sprite | hound | Like WarHound | heavier cavalry; armoured rider; variant="war" tempo |
> | KnightV2Sprite | hound | Like WarHound | heaviest cavalry; lance as .cq-weapon, full plate rider |
> | CrossbowmanV2Sprite | ranged | Like Archer | crossbow replaces bow; .cq-muzzle-flash at bolt tip |
> | CatapultV2Sprite | naval | Like Galley | siege engine; no legs; .cq-weapon throwing arm (pivot at axle) |
> | BallistaV2Sprite | naval | Like Galley | ballista bolt launcher; operator figure; .cq-muzzle-flash at bolt tip |
>
> **S5 — civilian units (2):**
>
> | Unit | Kind | Pattern | Notes |
> |------|------|---------|-------|
> | CaravanV2Sprite | civilian | Like Worker | donkey body (4 legs), merchant humanoid alongside; no .cq-weapon |
> | ExpeditionV2Sprite | civilian | Like Scout | wide-brim hat, pickaxe as .cq-weapon (NOT combat — kind="civilian") |
>
> For mounted units (Horseman, Cavalry, Knight) the body IS the horse; the rider
> sits on top. Wrap each horse leg in the outer-translate / inner `.cq-leg-*` pattern
> for the body-bob. The rider bobs with the horse body (no separate leg hooks).
>
> After writing each sprite, verify in the browser preview that walk loops have no
> flying parts and that the phase-desync strip shows non-zero `--phase` values.
>
> **Deliver**: the complete function bodies to append to `units-v2.jsx`, plus the
> 10 entries to add to `UNIT_SPRITES` in `scripts/serialize-sprites.mjs`:
> ```js
> ['axeman',      'AxemanV2Sprite'],
> ['spearman',    'SpearmanV2Sprite'],
> ['horseman',    'HorsemanV2Sprite'],
> ['cavalry',     'CavalryV2Sprite'],
> ['knight',      'KnightV2Sprite'],
> ['crossbowman', 'CrossbowmanV2Sprite'],
> ['catapult',    'CatapultV2Sprite'],
> ['ballista',    'BallistaV2Sprite'],
> ['caravan',     'CaravanV2Sprite'],
> ['expedition',  'ExpeditionV2Sprite'],
> ```

---

## ACTIVE DEFECT 2 — More wonders (S7 batch: 4 legendary + 4 natural)

**Background**: S6 delivered 4 legendary + 4 natural wonders. Additional wonders
are needed for the remaining natural wonder hex tiles (which currently show the
procedural canvas landmark) and the remaining legendary wonder IDs in the game.

**Natural wonder game IDs still using canvas fallback** (no SVG tile):
`crystal_caverns`, `ancient_forest`, `coral_reef`, `grand_canyon`, `aurora_fields`,
`frozen_falls`, `dragon_bones`, `singing_sands`, `sunken_ruins`, `floating_islands`,
`bioluminescent_bay`, `bottomless_lake`, `eternal_storm`

**Reference files** (fetch before starting):
```
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/terrain/wonder-tiles.ts
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/terrain/wonder-tile-loader.ts
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/wonders.tsx
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/systems/wonder-visual-catalog.ts
```

**Prompt for Claude Design**:

> Add a second batch of wonder sprites in `sprites-s7/`. Same conventions as S6:
>
> **Legendary (192×192, BuildingFrame, faction-tinted, existing CSS hooks only):**
>
> | Wonder | Category | Concept |
> |--------|----------|---------|
> | Hanging Gardens | food | multi-level terraced gardens, waterwheels, `.cq-water-stream` feeding canals |
> | Great Wall | military | crenellated wall segment, watchtower, `.cq-smoke` beacon fire, `.cq-crowd-fig` guards |
> | Leviathan Drydock | economy | enormous dry dock, half-built warship hull, `.cq-spark` forge work, `.cq-smoke` |
> | Moonwell Gardens | science | moonlit reflecting pool, stone observatory dome, `.cq-glow` pool surface |
>
> **Natural (128×111 hex, SMIL, faction-neutral — use the EXACT game wonder IDs as keys):**
>
> | Wonder ID | Concept | SMIL |
> |-----------|---------|------|
> | `coral_reef` | turquoise water, fan coral fronds, darting fish silhouettes | fish `<animateTransform type="translate">` |
> | `aurora_fields` | dark tundra, sweeping teal/violet aurora bands | band `<animate attributeName="opacity">` + slow hue suggest |
> | `frozen_falls` | icy cliff face, frozen waterfall curtain, snow dusting | particle drift like snow tiles |
> | `grand_canyon` | layered rust-red strata (3 colour bands), narrow river at base | river glint shimmer |
>
> **Important**: Natural wonder tile keys must match the game's wonder IDs exactly
> (e.g. `coral_reef`, not `Coral Reef`). The wonder-tile-loader.ts alias table maps
> these directly; no alias is needed if the key matches the game wonder ID.
>
> Deliver: `sprites-s7/wonders-legendary.tsx` + `sprites-s7/wonders-natural.tsx`
> + `sprites-s7/REVIEW.md`.
