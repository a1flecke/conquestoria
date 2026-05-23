# S3 — Marketplace Tells the Truth (Tech-Filtered Display)

**Roadmap slice:** S3 (Phase 1 — Visibility & ownership)
**Parent spec:** `docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`
**Depends on:** S1 (tech field on RESOURCE_DEFINITIONS ✅), S2a (improvements ✅), S2b (getCivAvailableResources ✅)
**Files changed:** `src/ui/marketplace-panel.ts`, `tests/ui/marketplace-panel.test.ts`

---

## Problem

The marketplace panel iterates all 16 `RESOURCE_DEFINITIONS` regardless of whether the viewer has researched the enabling tech. A player who has only researched `pottery` sees Iron, Spices, Ivory — the full catalog — each stamped "✗ Not available." This violates issue requirement #2: *"Do not show items we do not have the tech for."*

Additionally: (a) the fashion banner can reference a resource the viewer can't see, because it is not tech-gated; (b) the banner injects the raw resource ID (`'silk'`) rather than the human-readable name (`'Silk'`).

---

## Solution

Filter resource rows to tech-known resources only; show a discoverable-count footer for the rest; update the status label to marketplace-appropriate language; gate the fashion banner on viewer tech; fix its name display; and update the "Your Resources" summary to filter consistently against the same `knownDefs` array.

### Data partitioning

At panel entry, after `getCivAvailableResources` runs:

```ts
const viewerTechs  = new Set(civ.techState.completed);
const knownDefs    = RESOURCE_DEFINITIONS.filter(d => viewerTechs.has(d.tech));
const unknownCount = RESOURCE_DEFINITIONS.length - knownDefs.length;
```

`knownDefs` drives all row rendering, the "Your Resources" summary filters, and the `setText` injection loop. `unknownCount` drives the footer.

### Fashion banner

Before building the banner HTML, look up the fashionable resource's definition and check its tech:

```ts
const fashionableDef  = RESOURCE_DEFINITIONS.find(d => d.id === marketplace.fashionable);
const fashionVisible  = !!fashionableDef && viewerTechs.has(fashionableDef.tech);
const fashionBannerHtml = fashionVisible
  ? `<div ...>✨ <span data-text="fashion-resource"></span> is fashionable! ...</div>`
  : '';
```

If `fashionVisible` is false (fashionable resource unknown to viewer), the banner is omitted entirely — no stub div, no empty space.

The `setText('fashion-resource', ...)` call injects `fashionableDef.name` (e.g. `'Silk'`), not the raw resource ID (`'silk'`). This also fixes a pre-existing display bug where the ID was shown.

### Resource rows

`resourceRowsHtml` iterates `knownDefs`, indexed 0…knownDefs.length−1. The `data-text` attribute keys (`res-name-N`, `res-price-N`, `res-owned-N`) are indexed off `knownDefs`. The `setText` loop at the bottom of the function likewise iterates `knownDefs`.

**Coupling note:** The HTML-build pass and the `setText` injection pass are index-coupled — both must iterate `knownDefs` in the same order. This is intentional; the failing tests catch any desync. A DOM-construction refactor (Option C) will eliminate this coupling when S8 (buy/sell buttons) makes it necessary — see Future extensibility below.

**Label change:** `'✗ Not available'` → `'✗ Not in inventory'`

"Not available" implied the resource doesn't exist in the world. "Not in inventory" is accurate marketplace framing: the viewer has the tech to know it exists, they just haven't harvested it yet.

### "Your Resources" summary

`luxuryOwned` and `strategicOwned` filter against `knownDefs` (not `RESOURCE_DEFINITIONS`). In practice the result is identical — `getCivAvailableResources` already requires tech, so `ownedResources` never contains a tech-unknown resource — but filtering against `knownDefs` makes the intent self-documenting and insulates against future semantic drift in `getCivAvailableResources`.

**Empty state:** When `luxuryOwned.length === 0 && strategicOwned.length === 0`, display **"None"**.

Rationale: the old text ("None yet — research techs and build improvements…") was appropriate for a brand-new player with no techs. Once a player is looking at a tech-filtered marketplace, the advice is redundant. Plain "None" is honest and sufficient.

### Discoverable-count footer

Rendered between the resource rows and the Trade Routes section. Condition: `unknownCount > 0`.

```
🔬 N more resources will become visible as you research new technologies
```

Styled muted (`font-size:12px; opacity:0.5; text-align:center`) — informational, not alarming. Omitted entirely when `unknownCount === 0` (viewer has every enabling tech).

---

## Done when

- Only resources whose enabling tech the viewer has researched appear as rows.
- Resources the viewer hasn't researched are absent — their count surfaces only in the footer.
- "✓ Owned" appears for resources in the player's inventory; "✗ Not in inventory" appears for tech-known but unharvested resources.
- Fashion banner is suppressed when the fashionable resource's tech is unknown to the viewer.
- Fashion banner shows the resource name (e.g. `"Silk"`), not the raw ID (e.g. `"silk"`).
- "Your Resources" empty state reads `"None"` when no resources are owned.
- Footer `"🔬 N more resources…"` appears when `unknownCount > 0`; absent when all techs are known.
- `state.currentPlayer` used throughout — no hardcoded civ id.
- `yarn build` and `yarn test` both exit 0.

---

## Tests

All tests live in `tests/ui/marketplace-panel.test.ts`. Existing tests must remain green.

### New tests

| # | Name | What it asserts |
|---|------|-----------------|
| 1 | **No-tech resource is absent** | Viewer has zero techs. All 16 resource names are absent from panel text. |
| 2 | **Tech-known resource present; unknown resource absent** | Viewer has `'mining-tech'`. "Gems" is in panel text; "Silk" (requires `'irrigation'`) is not. |
| 3 | **Catalog completeness** | Viewer has all 16 enabling techs. All 16 resource names are present in panel text. |
| 4 | **"Not in inventory" label** | Viewer has `'mining-tech'` but no mine built. Panel contains `"✗ Not in inventory"`, not `"✗ Not available"`. |
| 5 | **"None" empty state** | Viewer has `'mining-tech'` but owns no resources. "Your Resources" section contains `"None"`. |
| 6 | **Fashion banner suppressed when tech unknown** | `marketplace.fashionable = 'silk'`; viewer lacks `'irrigation'`. Banner text (`"fashionable"`) is absent from panel. |
| 7 | **Fashion banner shows name, not ID, when tech known** | `marketplace.fashionable = 'silk'`; viewer has `'irrigation'`. Panel contains `"Silk"` (not `"silk"`) in the banner area. |

### Spec-fidelity conjunctions (from roadmap)

- **Negative (no-tech absent):** tests 1 and 2 (Silk absent).
- **Positive (tech-available present):** tests 2 (Gems present) and 3.
- **Catalog completeness:** test 3.
- **Fashion banner tech gate:** tests 6 (negative) and 7 (positive).

---

## Conventions

- `state.currentPlayer` always — never hardcoded.
- `textContent`/`createTextNode()` for dynamic text — no `innerHTML` with game strings.
- No new files, no new exports. Single-file change to `marketplace-panel.ts`.
- Save compatibility: no state shape changes in this slice.
- No AI parity required: display-only change with no gameplay consequence.

---

## Future extensibility

S8 (buy/sell buttons) requires per-row event listeners that cannot be injected via `textContent`. At S8, the HTML-string + `data-text` injection pattern should be replaced with full DOM construction (Option C from the brainstorm). Do not attempt to bolt S8 buttons into the current `data-text` slots — refactor first.
