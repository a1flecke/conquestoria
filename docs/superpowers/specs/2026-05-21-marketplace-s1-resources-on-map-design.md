# S1 — Resources on the Map (Tech-Gated Reveal) — Design Spec

**Roadmap slice:** S1 of `2026-05-20-marketplace-trade-roadmap.md`
**Origin:** GitHub issue [#234](https://github.com/a1flecke/conquestoria/issues/234)
**Value shipped:** Resources are finally visible on the map — but only once you've researched the enabling tech. The map layer goes from "flat terrain" to "terrain + discoverable resources."

---

## Locked decisions

| Decision | Choice |
|---|---|
| Hidden state (no tech) | **Nothing** — pure terrain, resource absent from map and inspection panel |
| Icon overlap (resource + improvement on same tile) | **B** — resource icon small (~30% size) at top-left corner; improvement icon centered at full size |
| Spy mission `identify_resources` | **Out of scope** — that mission reveals what a foreign civ *owns* (an S2b/acquisition concern), not tile-level icons. No map-render interaction in S1. |
| New state needed | **None** — renderer receives `viewerTechs: ReadonlySet<string>` built in `render-loop.ts`; inspection panel derives it internally from `state` |
| Tech `unlocks` text | All 9 remaining techs get a "Reveal X resource" line added to their `unlocks` array (matching the existing `animal-husbandry` pattern) |

---

## Resource catalog

### Icons

| Resource | Icon | Type | Terrain |
|---|---|---|---|
| Silk | 🧵 | luxury | grassland |
| Wine | 🍇 | luxury | plains |
| Spices | 🌶️ | luxury | jungle |
| Gems | 💎 | luxury | hills |
| Ivory | 🐘 | luxury | forest |
| Incense | 🕯️ | luxury | desert |
| Copper | 🪙 | strategic | hills |
| Iron | ⚙️ | strategic | hills |
| Horses | 🐎 | strategic | plains |
| Stone | 🪨 | strategic | mountain |

### Tech-to-resource mapping

| Tech ID | Era | Resource revealed |
|---|---|---|
| `gathering` | 1 | Stone |
| `stone-weapons` | 1 | Copper |
| `foraging` | 1 | Ivory |
| `pottery` | 1 | Wine |
| `cartography` | 1 | Spices |
| `irrigation` | 2 | Silk |
| `bronze-working` | 2 | Iron |
| `animal-husbandry` | 2 | Horses *(already in `unlocks` text)* |
| `mining-tech` | 3 | Gems |
| `currency` | 3 | Incense |

---

## Data changes

### `src/systems/trade-system.ts`

Add `tech` and `icon` to `ResourceDefinition`. Both fields land in S1; `requiredImprovement` is added by S2a, `effect` by S4a:

```ts
export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string;
  basePrice: number;
  tech: string;   // enabling tech id — added by S1
  icon: string;   // emoji for map rendering and legend — added by S1
}
```

Populate all 10 entries with `tech` and `icon` from the locked catalog:

```ts
{ id: 'silk',    name: 'Silk',    type: 'luxury',   terrain: 'grassland', basePrice: 8,  tech: 'irrigation',      icon: '🧵' },
{ id: 'wine',    name: 'Wine',    type: 'luxury',   terrain: 'plains',    basePrice: 7,  tech: 'pottery',         icon: '🍇' },
{ id: 'spices',  name: 'Spices',  type: 'luxury',   terrain: 'jungle',    basePrice: 10, tech: 'cartography',     icon: '🌶️' },
{ id: 'gems',    name: 'Gems',    type: 'luxury',   terrain: 'hills',     basePrice: 12, tech: 'mining-tech',     icon: '💎' },
{ id: 'ivory',   name: 'Ivory',   type: 'luxury',   terrain: 'forest',    basePrice: 9,  tech: 'foraging',        icon: '🐘' },
{ id: 'incense', name: 'Incense', type: 'luxury',   terrain: 'desert',    basePrice: 6,  tech: 'currency',        icon: '🕯️' },
{ id: 'copper',  name: 'Copper',  type: 'strategic', terrain: 'hills',    basePrice: 5,  tech: 'stone-weapons',   icon: '🪙' },
{ id: 'iron',    name: 'Iron',    type: 'strategic', terrain: 'hills',    basePrice: 8,  tech: 'bronze-working',  icon: '⚙️' },
{ id: 'horses',  name: 'Horses',  type: 'strategic', terrain: 'plains',   basePrice: 7,  tech: 'animal-husbandry',icon: '🐎' },
{ id: 'stone',   name: 'Stone',   type: 'strategic', terrain: 'mountain', basePrice: 4,  tech: 'gathering',       icon: '🪨' },
```

Derive lookup records from `RESOURCE_DEFINITIONS` (single source of truth — no duplication):

```ts
export const RESOURCE_ICONS: Record<string, string> = {};
export const RESOURCE_TECH: Record<string, string> = {};
for (const r of RESOURCE_DEFINITIONS) {
  RESOURCE_ICONS[r.id] = r.icon;
  RESOURCE_TECH[r.id] = r.tech;
}
```

### `src/systems/tech-definitions.ts`

Add a "Reveal X resource" string to the `unlocks` array of each of the 9 techs that don't already have it (mirror the `animal-husbandry` pattern). Example:

```ts
{ id: 'gathering', ..., unlocks: ['Foundational economy knowledge', 'Reveal Stone resource'] },
{ id: 'stone-weapons', ..., unlocks: ['Warriors deal +2 damage', 'Reveal Copper resource'] },
// … etc.
```

---

## Renderer changes

### `src/renderer/hex-renderer.ts`

**Call chain:** `drawHexMap` → `drawTileAtScreen` → `drawHex`. All three are in `hex-renderer.ts`; `viewerTechs` must be threaded through all three.

**`drawHexMap` signature** — one new optional parameter at the end:

```ts
export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  villagePositions?: Set<string>,
  currentPlayer?: string,
  viewerVisibility?: VisibilityMap,
  viewerTechs: ReadonlySet<string> = new Set(),  // ← new
): void
```

Thread `viewerTechs` into the `drawTileAtScreen` call inside the loop.

**`drawTileAtScreen` signature** — matching new parameter:

```ts
function drawTileAtScreen(
  ctx: CanvasRenderingContext2D,
  screen: { x: number; y: number },
  scaledSize: number,
  tile: HexTile,
  isVillage: boolean,
  currentPlayer: string | undefined,
  viewerVisibility: VisibilityMap | undefined,
  zoom: number,
  presentationKind: TilePresentationKind,
  nowMs: number,
  reducedMotion: boolean,
  viewerTechs: ReadonlySet<string> = new Set(),  // ← new
): void
```

Thread `viewerTechs` into the `drawHex` call inside `drawTileAtScreen`.

**`drawHex` signature** — matching new parameter at the end (after `reducedMotion`):

```ts
function drawHex(
  // … existing params …
  reducedMotion: boolean = false,
  viewerTechs: ReadonlySet<string> = new Set(),  // ← new
): void
```

**Resource icon drawing block** — inserted after *both* improvement-related blocks (completed-improvement block AND construction-in-progress block), before the wonder block. There are two improvement blocks in `drawHex`: the first renders the completed improvement icon (~lines 251–264); the second renders the 🔨 in-progress indicator (~lines 267–276). The resource block must go after both so it draws on top of any in-progress construction indicator, not between the two improvement blocks:

```ts
// Draw resource icon (tech-gated).
// No explicit visibility guard needed: drawHex receives presentation.tile, which
// already has resource: null for unexplored / unknown-fog tiles (via unknownTile()).
// Last-seen tiles carry the resource from the snapshot — showing it is correct
// (the player remembers what they saw). Tech gate still applies.
if (tile.resource && viewerTechs.has(RESOURCE_TECH[tile.resource] ?? '')) {
  const icon = RESOURCE_ICONS[tile.resource] ?? '◆';
  // hasVisibleImprovement: only the *completed* improvement icon occupies center.
  // An in-progress improvement (improvementTurnsLeft > 0) shows 🔨 above/below center;
  // in that case hasVisibleImprovement is false and the resource draws centered.
  const hasVisibleImprovement =
    tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (hasVisibleImprovement) {
    // Option B: small icon at top-left corner; improvement stays centered
    ctx.font = `${size * 0.3}px system-ui`;
    ctx.fillText(icon, cx - size * 0.3, cy - size * 0.3);
  } else {
    // No completed improvement icon at center — draw resource centered
    ctx.font = `${size * 0.5}px system-ui`;
    ctx.fillText(icon, cx, cy);
  }
}
```

**Import** — add to the top of `hex-renderer.ts`:
```ts
import { RESOURCE_ICONS, RESOURCE_TECH } from '@/systems/trade-system';
```

**`render-loop.ts` call site** — `drawHexMap` is called from `render-loop.ts` `render()` method (line ~123), not from `main.ts`. Build `viewerTechs` alongside the existing `viewerVisibility` derivation:

```ts
// In RenderLoop.render() — existing lines:
const viewerId = this.state.currentPlayer;
const viewerVisibility = this.state.civilizations[viewerId]?.visibility;

// New line — add immediately after:
const viewerTechs = new Set<string>(
  this.state.civilizations[viewerId]?.techState.completed ?? []
);

// Updated drawHexMap call (was 6 args, now 7):
drawHexMap(this.ctx, this.state.map, this.camera, villagePositions, viewerId, viewerVisibility, viewerTechs);
```

---

## Inspection panel changes

### `src/ui/territory-inspection-panel.ts`

No new parameter needed — `createTerritoryInspectionPanel` already receives `state` and `viewerId`, so it can derive the viewer's tech set internally.

**New import** (add alongside the existing imports):
```ts
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
```

**Derive tech set** — add near the top of the function body (after the `viewer` line):
```ts
const viewerTechs = new Set(viewer?.techState.completed ?? []);
```

**Replace line 95** (the unconditional resource display):
```ts
// Before (leaks un-tech'd resources, no type label):
if (tile.resource) addLine(panel, 'Resource', titleCase(tile.resource));

// After (gated on tech; shows name + type; works for both live and last-seen tiles):
const resDef = tile.resource
  ? RESOURCE_DEFINITIONS.find(r => r.id === tile.resource)
  : null;
if (resDef && viewerTechs.has(resDef.tech)) {
  addLine(panel, 'Resource', `${resDef.name} (${resDef.type})`);
}
```

No call-site change in `main.ts` — the function signature is unchanged.

---

## Legend changes

### `src/ui/icon-legend.ts`

`createIconLegendOverlay(viewerTechs: ReadonlySet<string>): HTMLDivElement` — add the parameter. Append a "Resources" section after the existing static items, listing only resources the viewer has tech for, split into luxury and strategic sub-groups. If the viewer has no resource techs, the Resources section is omitted entirely.

**Also change `display:none` → `display:block`** in the overlay's initial `style.cssText`. The old code pre-built the overlay at startup and hid it; the new toggle pattern only ever calls `createIconLegendOverlay` when it is about to be shown. Starting hidden would make the first toggle a no-op (the check `existing.style.display !== 'none'` would see an empty-display element as "visible" and immediately hide it without showing anything). Starting as `display:block` means the freshly-created overlay is immediately visible when appended by the toggle handler.

The export `toggleIconLegend` becomes dead (main.ts will no longer use it) — remove it.

### `src/main.ts` — legend wiring changes

The overlay is currently pre-built once and handed to `createGameShell` as `iconLegendOverlay: createIconLegendOverlay()` (line 236). This can no longer work because it needs current techs at show-time, not at startup. Two changes:

**1. Remove the pre-built overlay** from the `createGameShell` call:
```ts
// Remove this line:
iconLegendOverlay: createIconLegendOverlay(),
```

**2. Replace the `onToggleIconLegend` callback** (line 221) with one that rebuilds on each show:
```ts
onToggleIconLegend: () => {
  const existing = document.getElementById('icon-legend');
  if (existing && existing.style.display !== 'none') {
    // Already visible — hide it
    existing.style.display = 'none';
    return;
  }
  // Stale or absent — remove old, create fresh with current techs
  existing?.remove();
  const viewerTechs = new Set<string>(
    gameState.civilizations[gameState.currentPlayer]?.techState.completed ?? []
  );
  const overlay = createIconLegendOverlay(viewerTechs);
  uiLayer.appendChild(overlay);
},
```

`uiLayer` is already in scope at the `createGameShell` call site. `toggleIconLegend` is no longer imported.

---

## Files changed

| File | Change |
|---|---|
| `src/systems/trade-system.ts` | Add `tech` + `icon` to `ResourceDefinition`; populate all 10 entries; derive `RESOURCE_ICONS` and `RESOURCE_TECH` |
| `src/systems/tech-definitions.ts` | Add "Reveal X resource" to `unlocks` for 9 techs |
| `src/renderer/hex-renderer.ts` | Add `viewerTechs` param to `drawHexMap`, `drawTileAtScreen`, and `drawHex`; add resource icon drawing block; add import from `trade-system` |
| `src/renderer/render-loop.ts` | Derive `viewerTechs` from `this.state`; pass as 7th arg to `drawHexMap` |
| `src/ui/territory-inspection-panel.ts` | Derive `viewerTechs` internally; gate resource display on tech; enrich with name + type; add import from `trade-system` |
| `src/ui/icon-legend.ts` | Add `viewerTechs` param to `createIconLegendOverlay`; add dynamic resource section; remove `toggleIconLegend` export |
| `src/main.ts` | Remove pre-built `iconLegendOverlay` from `createGameShell` call; replace `onToggleIconLegend` with inline rebuild handler; remove `toggleIconLegend` import |

**No new files required.** No new `GameState` fields. No save migration needed.

---

## Tests

### `tests/systems/trade-system.test.ts`

**Catalog integrity:**
- Every `ResourceDefinition` entry has a non-empty `tech` that exists in the tech tree
- `RESOURCE_ICONS` has an entry for every `ResourceType` value (no missing keys)
- `RESOURCE_TECH` has an entry for every `ResourceType` value

### `tests/renderer/hex-renderer.test.ts`

Use a minimal mock canvas context. All tile states hand-built (no RNG).

| Test | Assertion |
|---|---|
| Resource tile (`presentationKind: 'live'`), viewer has tech | Resource icon text drawn |
| Resource tile, viewer lacks tech | Resource icon text absent (negative — spec-fidelity) |
| Resource + completed improvement, viewer has tech | Resource drawn at corner position (`cx - size * 0.3`); improvement drawn at center |
| Resource + in-progress improvement (`improvementTurnsLeft > 0`), viewer has tech | Resource drawn centered (improvement not shown, no corner split) |
| Unexplored tile (`resource: null` via `unknownTile`) | No resource icon — `tile.resource` is null, so the guard `if (tile.resource && ...)` naturally skips it; no explicit visibility check required |
| Last-seen tile (`presentationKind: 'last-seen'`) with resource, viewer has tech | Resource icon IS drawn — player remembers what they last saw; tech gate still applies |
| Last-seen tile with resource, viewer lacks tech | Resource icon absent (negative) |

### `tests/ui/territory-inspection-panel.test.ts`

| Test | Assertion |
|---|---|
| Panel with viewer-has-tech | Resource row present, shows "Gems (luxury)" format |
| Panel with viewer-lacks-tech | Resource row absent (negative) |

### `tests/ui/icon-legend.test.ts`

| Test | Assertion |
|---|---|
| `viewerTechs` contains `animal-husbandry` | Legend HTML contains "🐎" and "Horses" |
| Empty `viewerTechs` | No resource section in legend |

---

## Done when

- Resources render on tiles **only** for tech-holders; un-tech'd tiles show nothing; unexplored/unknown-fog tiles show nothing (their `tile.resource` is `null` from the presentation system); last-seen tiles show the resource if the viewer has the tech
- Tile inspection shows resource name + type (luxury/strategic) for tech-holders only
- Map legend lists only the resources the current player has tech for
- Tech panel `unlocks` text for all 10 enabling techs mentions the resource they reveal
- `yarn build` and `yarn test` both exit 0
- Manual smoke: start a game, confirm no resources visible; research `gathering`; confirm Stone appears on mountain tiles

## Out of scope (handled by later slices)

- `requiredImprovement` field on `ResourceDefinition` → S2a
- `effect` field → S4a
- `getCivAvailableResources` acquisition helper → S2b
- `identify_resources` spy mission map interaction → S2b (the mission reveals a civ's *owned* resources, not tile icons)
- Marketplace panel tech-filter → S3
- Resource-specific improvements (plantation, pasture, camp, quarry) → S2a
