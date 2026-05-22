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
| New state needed | **None** — renderer checks `viewerTechs: ReadonlySet<string>` passed in from `main.ts` |
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

Add `tech: string` to `ResourceDefinition` (the shared foundation field consumed by S1; `requiredImprovement` added by S2a, `effect` added by S4a):

```ts
export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string;
  basePrice: number;
  tech: string;   // enabling tech id — added by S1
}
```

Populate all 10 entries with their tech from the locked mapping above.

Derive two lookup records from `RESOURCE_DEFINITIONS` (single source of truth — no duplication):

```ts
export const RESOURCE_ICONS: Record<string, string> = {};
export const RESOURCE_TECH: Record<string, string> = {};
for (const r of RESOURCE_DEFINITIONS) {
  RESOURCE_ICONS[r.id] = /* icon per catalog above */;
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

**`drawHexMap` signature** — one new optional parameter at the end:

```ts
export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  // … existing params …
  viewerTechs: ReadonlySet<string> = new Set(),  // ← new
): void
```

Thread `viewerTechs` into each `drawHex` call.

**`drawHex` signature** — matching new parameter:

```ts
function drawHex(
  // … existing params …
  viewerTechs: ReadonlySet<string> = new Set(),  // ← new
): void
```

**Resource icon drawing block** — inserted after the improvement block (lines ~264), before the wonder block:

```ts
// Draw resource icon (tech-gated + visibility-gated)
// viewerVisibility guard mirrors the ownership-border guard below (~L302).
// drawHex is called for every tile; fog is a separate overlay — we must
// not draw through it, so skip if the tile is outside the viewer's vision.
const tileIsVisible = !viewerVisibility ||
  viewerVisibility[`${tile.coord.q},${tile.coord.r}`] === 'visible';

if (tileIsVisible && tile.resource && viewerTechs.has(RESOURCE_TECH[tile.resource] ?? '')) {
  const icon = RESOURCE_ICONS[tile.resource] ?? '◆';
  const hasVisibleImprovement =
    tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (hasVisibleImprovement) {
    // Option B: small icon at top-left corner
    ctx.font = `${size * 0.3}px system-ui`;
    ctx.fillText(icon, cx - size * 0.3, cy - size * 0.3);
  } else {
    // No improvement competing — centered at full icon size
    ctx.font = `${size * 0.5}px system-ui`;
    ctx.fillText(icon, cx, cy);
  }
}
```

> **Implementation note:** verify the exact `VisibilityMap` key format and `'visible'` value against `src/renderer/render-visibility.ts` before coding — use the same pattern as the ownership-border guard at lines ~302-309 of `hex-renderer.ts`.

**`main.ts` call site** — build viewer techs once per render and pass in:

```ts
const viewerTechs = new Set(
  state.civilizations[state.currentPlayer]?.techState.completed ?? []
);
// pass viewerTechs to drawHexMap(...)
```

---

## Inspection panel changes

### `src/ui/territory-inspection-panel.ts`

`createTerritoryInspectionPanel` receives one new parameter `viewerTechs: ReadonlySet<string>`.

Replace line 95:

```ts
// Before (leaks un-tech'd resources):
if (tile.resource) addLine(panel, 'Resource', titleCase(tile.resource));

// After (gated + shows type):
const resDef = tile.resource
  ? RESOURCE_DEFINITIONS.find(r => r.id === tile.resource)
  : null;
if (resDef && viewerTechs.has(resDef.tech)) {
  addLine(panel, 'Resource', `${resDef.name} (${resDef.type})`);
}
```

`openTerritoryInspectionPanel` in `main.ts` passes the same `viewerTechs` set.

---

## Legend changes

### `src/ui/icon-legend.ts`

`createIconLegendOverlay` accepts `viewerTechs: ReadonlySet<string>`. It builds the existing static items then appends a "Resources" section listing only the resources the viewer has tech for, split into luxury and strategic sub-groups.

If the viewer has no resource techs, the Resources section is omitted.

The legend is rebuilt (not toggled from cache) each time the legend button is tapped, so it always reflects current tech state. The `toggleIconLegend` call in `main.ts` becomes a re-create-and-show pattern instead of a visibility toggle — or, if the panel is open, close it; if closed, rebuild and show.

---

## Files changed

| File | Change |
|---|---|
| `src/systems/trade-system.ts` | Add `tech` to `ResourceDefinition`; populate all 10 entries; derive `RESOURCE_ICONS` and `RESOURCE_TECH` |
| `src/systems/tech-definitions.ts` | Add "Reveal X resource" to `unlocks` for 9 techs |
| `src/renderer/hex-renderer.ts` | Add `viewerTechs` param to `drawHexMap` + `drawHex`; add resource icon drawing block |
| `src/ui/territory-inspection-panel.ts` | Add `viewerTechs` param; gate + enrich resource display |
| `src/ui/icon-legend.ts` | Add `viewerTechs` param; add dynamic resource section |
| `src/main.ts` | Build `viewerTechs` set; pass to all three above |

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
| Resource tile, viewer has tech | Resource icon text drawn |
| Resource tile, viewer lacks tech | Resource icon text absent (negative — spec-fidelity) |
| Resource + completed improvement, viewer has tech | Resource drawn at corner position (`cx - size * 0.3`); improvement drawn at center |
| Resource + in-progress improvement (`improvementTurnsLeft > 0`), viewer has tech | Resource drawn centered (improvement not shown, no corner split) |
| Fog tile (outside visibility) | No resource icon regardless of tech (privacy negative) |

### `tests/ui/territory-inspection-panel.test.ts`

| Test | Assertion |
|---|---|
| Panel with viewer-has-tech | Resource row present, shows "Gems (strategic)" format |
| Panel with viewer-lacks-tech | Resource row absent (negative) |

### `tests/ui/icon-legend.test.ts`

| Test | Assertion |
|---|---|
| `viewerTechs` contains `animal-husbandry` | Legend HTML contains "🐎" and "Horses" |
| Empty `viewerTechs` | No resource section in legend |

---

## Done when

- Resources render on tiles **only** for tech-holders; un-tech'd and fogged tiles show nothing
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
