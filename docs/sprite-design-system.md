# Conquestoria Sprite Design System

Single source of truth for all visual assets: units, buildings, terrain tiles, improvement markers, and wonders. Read this before generating any Claude Design prompt or touching any sprite file.

---

## Asset Inventory

### Units — `src/renderer/sprites/units.tsx`
Registered in `UNIT_SPRITE_CATALOG` in `src/renderer/sprites/sprite-catalog.ts`.

| Unit | Status | data-kind |
|------|--------|-----------|
| settler | ✅ sprite | civilian |
| worker | ✅ sprite | civilian |
| scout | ✅ sprite | civilian |
| scout_hound | ✅ sprite | hound |
| war_hound | ✅ sprite | hound |
| shadow_warden | ✅ sprite | spy |
| warrior | ✅ sprite | melee |
| swordsman | ✅ sprite | melee |
| pikeman | ✅ sprite | melee |
| archer | ✅ sprite | ranged |
| musketeer | ✅ sprite | ranged |
| galley | ✅ sprite | naval |
| trireme | ✅ sprite | naval |
| axeman | ✅ sprite | melee |
| spearman | ✅ sprite | melee |
| horseman | ✅ sprite | animal |
| cavalry | ✅ sprite | animal |
| knight | ✅ sprite | animal |
| crossbowman | ✅ sprite | ranged |
| catapult | ✅ sprite | naval |
| ballista | ✅ sprite | naval |
| spy_scout | ✅ sprite | spy |
| spy_informant | ✅ sprite | spy |
| spy_agent | ✅ sprite | spy |
| spy_operative | ✅ sprite | spy |
| spy_hacker | ✅ sprite | spy |
| caravan | ✅ sprite | civilian |
| expedition | ✅ sprite | civilian |

### Buildings — `src/renderer/sprites/buildings.tsx`
Registered in `BUILDING_SPRITE_CATALOG` in `src/renderer/sprites/sprite-catalog.ts`.

| Building | Status | Category |
|----------|--------|----------|
| granary | ✅ sprite | food |
| herbalist | ✅ sprite | food |
| aqueduct | ✅ sprite | food |
| workshop | ✅ sprite | production |
| forge | ✅ sprite | production |
| lumbermill | ✅ sprite | production |
| quarry-building | ✅ sprite | production |
| bronze-workshop | ✅ sprite | production |
| iron-foundry | ✅ sprite | production |
| masonry-works | ✅ sprite | production |
| siege-workshop | ✅ sprite | military |
| library | ✅ sprite | science |
| archive | ✅ sprite | science |
| observatory | ✅ sprite | science |
| marketplace | ✅ sprite | gold |
| harbor | ✅ sprite | gold |
| dock | ✅ sprite | food |
| barracks | ✅ sprite | military |
| walls | ✅ sprite | military |
| stable | ✅ sprite | military |
| armory | ✅ sprite | military |
| ranch | ✅ sprite | food |
| cavalry-academy | ✅ sprite | military |
| war-academy | ✅ sprite | military |
| temple | ✅ sprite | culture |
| monument | ✅ sprite | culture |
| amphitheater | ✅ sprite | culture |
| shrine | ✅ sprite | culture |
| forum | ✅ sprite | culture |
| safehouse | ✅ sprite | espionage |
| intelligence-agency | ✅ sprite | espionage |
| security-bureau | ✅ sprite | espionage |
| caravanserai | ✅ sprite | gold |
| bank | ✅ sprite | gold |
| stock_exchange | ✅ sprite | gold |

### Terrain Tiles — `src/renderer/terrain/terrain-tiles.ts` (not yet created)
13 terrain types × 4 variants each = 52 tiles. Variant chosen by `Math.abs(q*7 + r*13) % 4`.

| Terrain | Status | Base Color |
|---------|--------|------------|
| grassland | ✅ 4 tile variants | `#5b8c3e` |
| plains | ✅ 4 tile variants | `#c4a94d` |
| desert | ✅ 4 tile variants | `#e0c872` |
| tundra | ✅ 4 tile variants | `#a0b8a0` |
| snow | ✅ 4 tile variants | `#e8e8f0` |
| forest | ✅ 4 tile variants | `#3d6b3d` |
| hills | ✅ 4 tile variants | `#8b7355` |
| mountain | ✅ 4 tile variants | `#6b6b7b` |
| ocean | ✅ 4 tile variants (animated) | `#2a5f8f` |
| coast | ✅ 4 tile variants (animated) | `#4a8faf` |
| jungle | ✅ 4 tile variants | `#2d5a2d` |
| swamp | ✅ 4 tile variants (animated) | `#4a6b4a` |
| volcanic | ✅ 4 tile variants (animated) | `#5a3a3a` |

### Improvement Markers — `src/renderer/hex-renderer.ts` → `IMPROVEMENT_ICONS`
Canvas-drawn emoji icons. Target: replace with proper SVG marker images.

| Improvement | Status |
|-------------|--------|
| farm | ⚠️ `'🌾'` emoji |
| mine | ⚠️ `'⛏️'` emoji |
| lumber_camp | ⚠️ `'🪵'` emoji |
| watermill | ⚠️ `'💧'` emoji |
| plantation | ⚠️ `'🌿'` emoji |
| pasture | ⚠️ `'🐂'` emoji |
| camp | ⚠️ `'⛺'` emoji |
| quarry | ⚠️ `'⚒️'` emoji |
| resource_outpost | ✅ SVG marker (`src/renderer/improvements/resource-outpost-marker.ts`) |

### Legendary Wonders — `src/systems/legendary-wonder-definitions.ts`
No map sprites yet. Production queue falls back to `'🏗️'`. Codex images exist in `public/images/wonders/codex/*.jpg` (lore art only, not map sprites).

---

## Visual Language

### Style
- **Flat geometric SVG.** No photorealism, no gradients, no blur filters.
- **Medieval/ancient theme**, Eras 1–4 (Stone Age → Renaissance). Era 5 (Industrial+) exists but is rare.
- **2.5D perspective.** Figures face right, slightly toward the viewer. Not top-down, not full side-on.
- **Warmth.** Earthy, hand-made feel. Ink line `#1f1a14` holds everything together.

### Line Weights
- Major outlines: `stroke="#1f1a14"` `strokeWidth="1"`
- Interior detail: `strokeWidth="0.5"–"0.8"`
- Thin highlights: same color, `opacity="0.3–0.5"`

### Material Palette (`MATERIAL_PALETTE` in `sprite-system.tsx`, aliased as `P`)
```
skin:   warm=#d4a373  cool=#b08968  deep=#8a5a3c
cloth:  tunic=#c19a6b  linen=#e6dcc6  wool=#7a6e5b  dye=#5b4a7a
metal:  iron=#5a6068  steel=#8a929b  bronze=#b8895a  gold=#d4a13c  shine=#e8edf2
wood:   light=#c19a6b  mid=#8a6a3a  dark=#5e3f24
stone:  light=#c4b8a4  mid=#9a8e78  dark=#6a5e4a
thatch: straw=#d6b46a  shadow=#8a6a3a
ground: grass=#7ea860  dirt=#a08260  sand=#d8c896  water=#3a6e94
ink:    line=#1f1a14   soft=#3a3228
hud:    food=#7bb850  prod=#c98a3a  gold=#e8c64a  sci=#5fb4d4  cult=#c46db4  mil=#c4413a  esp=#7a5ec4
```

### Faction Color (`FactionPalette`)
```typescript
{ dark: string; mid: string; bright: string; trim: string }
```
Generated by `derivePalette(civColor)` in `sprite-system.tsx`. Every unit/building receives a `palette` prop — never hardcode a faction name or civ color.

- `palette.mid` → primary cloth/armor fill
- `palette.dark` → belt, shadow, outlines
- `palette.bright` → gem, glow, highlight dot
- `palette.trim` → heraldic accent, flag circle

---

## Sprite Contracts

### Unit Sprite
```typescript
export function FooSprite({ palette, svgOnly = false }: UnitSpriteProps): string
```
- **ViewBox**: `0 0 128 128`
- **Wrapper**: `<SpriteFrame svgOnly={svgOnly}>` — never a raw `<svg>`
- **Required**: `<Shadow />`, `<HexBase />`
- **Humanoid figures**: `<Humanoid cx={64} cy={70} ... />`
- **Faction pennant**: `<Banner x={…} y={…} palette={palette} scale={0.7} />`
- **data-kind on outermost group**: `civilian | melee | ranged | naval | hound | spy`
- **Animation**: CSS class names only — `cq-sprite-figure`, `cq-arm-l/r`, `cq-leg-l/r`, `cq-weapon`, `cq-cape`, `cq-plume`, `cq-sail`, `cq-shadow`, `cq-step-dust`

### Building Sprite
```typescript
export function FooSprite({ palette, svgOnly = false }: BuildingSpriteProps): string
```
- **ViewBox**: `0 0 192 192`
- **Wrapper**: `<BuildingFrame label="Name" sub="Category" category="gold|food|…" svgOnly={svgOnly}>`
- **Required**: `<BuildingPlinth w={…} />`, `<Banner … palette={palette} />`
- **Effect classes**: `.cq-fire`, `.cq-smoke[--b][--c]`, `.cq-spark[--b][--c]`, `.cq-glow`, `.cq-peek`, `.cq-dust`
- Wave/rocking: inline `<animate>` elements (see `DockSprite`)

### Terrain Tile
```typescript
// Plain SVG string — no JSX, no palette, no imports
const tile: string = `<svg viewBox="0 0 128 111" xmlns="…">…</svg>`
```
- **ViewBox**: `0 0 128 111` (pointy-top hex bounding box: width=128, height=128×0.866)
- **Hex clipPath** (copy into every tile):
  ```svg
  <defs><clipPath id="hex">
    <polygon points="64,0 128,27.75 128,83.25 64,111 0,83.25 0,27.75"/>
  </clipPath></defs>
  ```
- All visible content in `<g clip-path="url(#hex)">`
- **4 variants per terrain type** — same base color, different scattered element positions
- **Ocean/coast only**: add SVG `<animate>` for wave motion
- **Variation index**: `Math.abs(q * 7 + r * 13) % 4`
- **Loader**: `src/renderer/terrain/terrain-tile-loader.ts` (mirrors sprite-loader pattern)
- **Fallback**: flat `TERRAIN_COLORS` fill if tile image not yet loaded

### Improvement Marker
```typescript
export const FOO_IMPROVEMENT_SVG: string = `<svg viewBox="0 0 48 48" xmlns="…">…</svg>`
```
- **ViewBox**: `0 0 48 48` — must read clearly at 24–32 px
- **No palette prop, no animation, no JSX**
- Use `stroke-linecap="round"` and `stroke-linejoin="round"` throughout
- Stored in `src/renderer/improvements/`

---

## Animation System

All animation is CSS-driven via `src/assets/sprite-animations-v2.css`. Sprites set class names only.

### States (set via `data-state` on the wrapper)
| State | Trigger |
|-------|---------|
| `idle` | Unit standing still — breathing, shadow pulse |
| `walk` | Unit moving — leg/arm swing, step dust, squash+stretch |
| `attack` | Unit attacking — weapon swing, body anticipation+hold, hit spark |
| `hurt` | Unit taking damage — flash + recoil (one-shot) |
| `death` | Unit dying — fall + fade (one-shot, forwards-fill) |

### Body-plan kinds (set via `data-kind`)
| Kind | Used by | Notes |
|------|---------|-------|
| `civilian` | settler, worker, caravan, scout | gentle walk bob |
| `melee` | warrior, swordsman, axeman, etc. | weapon slash |
| `ranged` | archer, crossbowman | bow-draw animation |
| `naval` | galley, trireme, catapult, ballista | ship rock + sail billow |
| `hound` | scout_hound, war_hound | quadruped diagonal-pair legs |
| `spy` | spy_* family | cape sway, cloak |

### Building effect classes
| Class | Effect | Example buildings |
|-------|--------|-------------------|
| `.cq-fire` | Orange flame flicker | Forge, Armory torches |
| `.cq-smoke[--b][--c]` | Grey plumes rising | Iron Foundry chimney |
| `.cq-spark[--b][--c]` | Hammering sparks | Bronze Workshop, Siege Workshop |
| `.cq-glow` | Interior light pulse | Bank vault, War Academy arch |
| `.cq-peek` | Animal head bob | Ranch horse, Stable, Caravanserai |
| `.cq-dust` | Dust puff | Masonry Works |

### Terrain tile animations
Terrain tiles use inline SVG `<animate>` / `<animateTransform>` — **not** CSS classes. Only these terrain types animate:

| Terrain | What animates | Technique |
|---------|---------------|-----------|
| ocean | wave arcs drift vertically | `<animate attributeName="d">` or `<animateTransform type="translate">` ±2px Y, 2.5–4s |
| coast | wave arcs drift | same as ocean |
| volcanic | lava crack glow pulse + bubble pop | `<animate attributeName="opacity">` on glow layer; `<animate r>` + opacity on bubble circles |
| snow | wind-blown snow particles drift right | `<animateTransform type="translate">` on small circles, 30–45px horizontal travel, 3–5s, staggered |
| tundra | sparse slow snowflakes drift | same as snow, half particle count, 1.3× longer duration |
| swamp | marsh gas bubbles rise from water pools | `<animate attributeName="r">` 1→3 + opacity 0→0.8→0 on circles, 2.5s, staggered |
| grassland, plains, desert, forest, hills, mountain, jungle | **none** | static |

### Phase desync
Every sprite instance should set `style="--phase: X"` where X ∈ [0, 1) — a value derived from the unit's ID hash. This prevents all units of the same type from breathing/walking in lockstep. The renderer handles this automatically.

---

## Key File Locations

| What | Where |
|------|-------|
| Unit sprites (JSX) | `src/renderer/sprites/units.tsx` |
| Building sprites (JSX) | `src/renderer/sprites/buildings.tsx` |
| Sprite helpers + palette | `src/renderer/sprites/sprite-system.tsx` |
| Sprite catalog + registration | `src/renderer/sprites/sprite-catalog.ts` |
| Sprite loader/cache | `src/renderer/sprites/sprite-loader.ts` |
| Animation CSS | `src/assets/sprite-animations-v2.css` |
| Terrain tiles (planned) | `src/renderer/terrain/terrain-tiles.ts` |
| Terrain loader (planned) | `src/renderer/terrain/terrain-tile-loader.ts` |
| Improvement markers (planned) | `src/renderer/improvements/` |
| Hex renderer (terrain colors) | `src/renderer/hex-renderer.ts` |
| Terrain type enum | `src/core/types.ts` |
| Unit type enum | `src/core/types.ts` |
| Buildings definition | `src/systems/city-system.ts` |
| Legendary wonder definitions | `src/systems/legendary-wonder-definitions.ts` |

---

## GitHub Reference URLs (main branch)
For Claude Design prompts, reference these raw file URLs:

```
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-system.tsx
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/units.tsx
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/buildings.tsx
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-catalog.ts
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/hex-renderer.ts
https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/core/types.ts
```

> If the repo is private, these URLs return 403. Attach the files as uploads to the Claude Design conversation instead.

---

## Claude Design Prompt Template

The complete prompt template lives at `docs/claude-design-sprites-prompt.md`.

To generate a new prompt for additional sprites, use the `.claude/skills/generate-sprite-prompt.md` skill.
