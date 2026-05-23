# S3 — Marketplace Tells the Truth (Tech-Filtered Display)

**Roadmap slice:** S3 (Phase 1 — Visibility & ownership)
**Parent spec:** `docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`
**Depends on:** S1 (tech field on RESOURCE_DEFINITIONS ✅), S2a (improvements ✅), S2b (getCivAvailableResources ✅)
**Files changed:** `src/ui/marketplace-panel.ts`, `tests/ui/marketplace-panel.test.ts`

---

## Problem

The marketplace panel iterates all 16 `RESOURCE_DEFINITIONS` regardless of whether the viewer has researched the enabling tech. A player who has only researched `pottery` sees Iron, Spices, Ivory — the full catalog — each stamped "✗ Not available." This violates issue requirement #2: *"Do not show items we do not have the tech for."*

---

## Solution

Filter the resource rows to tech-known resources only, show a discoverable-count footer for the rest, and update the status label to marketplace-appropriate language.

### Data partitioning

At panel entry, after `getCivAvailableResources` runs:

```ts
const viewerTechs  = new Set(civ.techState.completed);
const knownDefs    = RESOURCE_DEFINITIONS.filter(d => viewerTechs.has(d.tech));
const unknownCount = RESOURCE_DEFINITIONS.length - knownDefs.length;
```

`knownDefs` drives all row rendering and the `setText` injection loop. `unknownCount` drives the footer.

### Resource rows

`resourceRowsHtml` iterates `knownDefs`, indexed 0…knownDefs.length−1. The `data-text` attribute keys (`res-name-N`, `res-price-N`, `res-owned-N`) are indexed off `knownDefs`. The `setText` loop at the bottom of the function likewise iterates `knownDefs`.

**Label change:** `'✗ Not available'` → `'✗ Not in inventory'`

"Not available" implied the resource doesn't exist in the world. "Not in inventory" is accurate marketplace framing: the viewer has the tech to know it exists, they just haven't harvested it yet.

### Discoverable-count footer

Rendered between the resource rows and the Trade Routes section. Condition: `unknownCount > 0`.

```
🔬 N more resources will become visible as you research new technologies
```

Styled muted (low opacity, small font) — informational, not alarming. Omitted entirely when `unknownCount === 0` (viewer has every enabling tech).

### "Your Resources" summary (empty state)

No structural change. The empty-state text changes from the current advice string to simply **"None"** when `luxuryOwned.length === 0 && strategicOwned.length === 0`.

Rationale: the old text ("None yet — research techs and build improvements…") was appropriate for a brand-new player with no techs. Once a player is looking at a tech-filtered marketplace, the generic advice is redundant and slightly condescending. Plain "None" is honest and sufficient.

---

## Done when

- Only resources whose enabling tech the viewer has researched appear as rows.
- Resources the viewer hasn't researched are absent — their count surfaces only in the footer.
- "✓ Owned" appears for resources in the player's inventory; "✗ Not in inventory" appears for tech-known but unharvested resources.
- "Your Resources" empty state reads "None" when no resources are owned.
- Footer "🔬 N more resources…" appears when `unknownCount > 0`; absent when all techs are known.
- `state.currentPlayer` used throughout — no hardcoded civ id.
- `yarn build` and `yarn test` both exit 0.

---

## Tests

All tests live in `tests/ui/marketplace-panel.test.ts`. Existing tests must remain green.

### New tests

| # | Name | What it asserts |
|---|------|-----------------|
| 1 | **No-tech resource is absent** | Viewer has zero techs. All 16 resource names are absent from panel text. |
| 2 | **Tech-known resource is present** | Viewer has `'mining-tech'`. "Gems" is in panel text; "Silk" (requires `'irrigation'`) is not. |
| 3 | **Catalog completeness** | Viewer has all 16 enabling techs. All 16 resource names are present in panel text. |
| 4 | **"Not in inventory" label** | Viewer has `'mining-tech'` but no mine built. Panel contains "✗ Not in inventory", not "✗ Not available". |
| 5 | **"None" empty state** | Viewer has `'mining-tech'` but no owned resources. "Your Resources" section contains "None". |

### Spec-fidelity conjunctions (from roadmap)

The roadmap specifies three "done when" test types:
- **Negative (no-tech absent):** covered by test 1 and test 2 (Silk absent).
- **Positive (tech-available present):** covered by test 2 (Gems present) and test 3.
- **Catalog completeness:** covered by test 3.

---

## Conventions

- `state.currentPlayer` always — never hardcoded.
- `textContent`/`createTextNode()` for dynamic text — no `innerHTML` with game strings.
- No new files, no new exports. Single-file change to `marketplace-panel.ts`.
- Save compatibility: no state shape changes in this slice.
- No AI parity required: display-only change with no gameplay consequence.
