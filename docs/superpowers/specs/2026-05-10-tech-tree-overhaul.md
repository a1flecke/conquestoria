---
# Tech Tree UI/UX Overhaul
**Issue:** #193 — Tech tree laid out like a grid, shows future eras, lines wrap weird  
**Date:** 2026-05-10

---

## Problems (three bugs, one root cause)

**Bug A — Lines wrap weird**: `mapWrap`'s parent uses `flex-wrap:wrap`, so era columns reflow to a second row on narrower viewports. SVG bezier curves are calculated from DOM bounding rects post-layout, so a dependency line from Era 2 (top row, right) → Era 3 (second row, left) draws backwards or diagonally downward.

**Bug B — Shows future eras in Era 1**: `visibleInFocus` marks a node visible if `revealed = true`, which happens when all prerequisites are in `completedOrPlannedOrAvailable`. Since every Era 1 starter has no prerequisites, they're immediately in `queueableIds`. Their Era 2 successors therefore get `revealed = true` from turn 1, and subsequent eras cascade similarly. Players see Era 4–5 nodes they cannot reach for many turns.

**Bug C — "Still laid out like a grid"**: Nodes are arranged in an era-column × track-row matrix. The visual position of a node carries no information about its prerequisite relationships — two nodes in the same era column may have zero dependency on each other, yet appear adjacent. Players must read the connector lines to understand dependencies rather than reading spatial position.

---

## Design

### Phase 1 — Fix wrapping bug (Bug A)

**Scope**: Fix the inner era-grid only; leave `body`'s flex layout intact (it holds both `mapWrap` and the `inspector` side panel — removing flex-wrap from `body` would break inspector layout on narrow screens). Phase 3 replaces the whole structure anyway.

**Change**: In `createTechPanel`'s `renderTree()`, the inner era-columns grid has `grid-auto-flow:column; grid-auto-columns:minmax(210px, max-content)`. Add `min-width:max-content` to this grid element and ensure `mapWrap` has `overflow-x:auto`. This allows the era columns to overflow horizontally and scroll rather than wrapping to a second row.

This is a pure CSS change; no logic changes. Edge geometry recalculation already fires via `requestAnimationFrame` and produces correct curves once reflow is prevented.

### Phase 2 — Fix era visibility in focus mode (Bug B)

**Change in `buildTechProgressionView`**: Compute:

```ts
const currentPlayerEra = Math.max(
  1,
  ...state.completed.map(id => TECH_TREE.find(t => t.id === id)?.era ?? 1),
  state.currentResearch ? (TECH_TREE.find(t => t.id === state.currentResearch)?.era ?? 1) : 1,
);
```

In the `visibleInFocus` assignment, add an era cap:

```ts
const visibleInFocus = (
  nodeState !== 'locked'
  || isFocusNeighbor
  || (revealed && tech.era <= currentPlayerEra + 1)
);
```

Era cap for focus zoom: `currentPlayerEra + 1`. Players in Era 1 see Era 1 (available + completed) and Era 2 (the preview layer). This gives forward-looking context without exposing unreachable content.

The `isFocusNeighbor` path is intentionally uncapped — a tech that is a direct neighbor of the selected tech is always shown regardless of its era. This allows the selected-path highlight to draw a complete picture of a tech's immediate context even when its successors span era boundaries.

The `'known'` and `'all'` zoom levels remain unchanged — players who want to see the full tree can switch to those.

**Test**: A fresh tech state (no completed techs, no current research) in focus zoom must not include any node with `era > 2`.

### Phase 3 — Dependency-graph layout overhaul (Bug C)

This is the primary UX fix. Replace the era-column × track-row matrix with a proper directed-acyclic-graph layout where **horizontal position = prerequisite depth** and **vertical position = track**.

#### Layout algorithm

Run after `buildTechProgressionView` produces `visibleNodes`:

1. **Topological depth**: Compute depth over the **full TECH_TREE** graph (not just visible nodes), so that visible nodes at any zoom level are placed correctly relative to the full dependency chain. For each tech in topological order: `depth = max(prerequisites' depths, default -1) + 1`. Root techs (no prerequisites) get `depth = 0`. This ensures an Era 2 tech is never placed in the same column as a true Era 1 root tech, even when some prerequisite nodes are filtered from view.
2. **Track assignment**: Collect the set of tracks that have ≥1 visible node. Derive stable track order from `getDerivedTechTracks()` filtered to those present tracks. Assign row indices 0, 1, 2, … only to tracks with visible nodes — do not allocate rows for empty tracks.
3. **Pixel coordinates**:
   - `x = depth * (CARD_WIDTH + CARD_GAP_H)` where `CARD_WIDTH = 200`, `CARD_GAP_H = 28`
   - `y = rowIndex * (CARD_HEIGHT + CARD_GAP_V)` where `CARD_HEIGHT = 92`, `CARD_GAP_V = 16`, and `rowIndex` is the track's assigned row
4. **Collision resolution** (same-depth, same-track): Maintain a `slotCount: Map<string, number>` keyed by `"${depth}-${rowIndex}"`. Before placing each node, look up `slotIndex = slotCount.get(key) ?? 0`, then increment the counter. The final y is `rowIndex * (CARD_HEIGHT + CARD_GAP_V) + slotIndex * (CARD_HEIGHT + CARD_GAP_V)`. This correctly stacks 3+ colliding nodes downward, not just pairs.

#### Render

Remove the existing era-column `<section>` elements and their "Era N" header rows entirely. Replace with two sibling elements inside the tech tree wrapper:

```
techTreeWrapper (display:flex; flex-direction:row; align-items:flex-start)
  ├── trackSidebar (width:48px; flex-shrink:0; position:relative)
  │    └── one icon div per visible track, positioned absolutely at y = rowIndex*(CARD_HEIGHT+CARD_GAP_V)
  └── mapWrap (flex:1; overflow:auto)
       └── contentContainer (position:relative; width:maxX+CARD_WIDTH; height:maxY+CARD_HEIGHT)
            └── cards (position:absolute; left:x; top:y each)
```

The `trackSidebar` height equals `contentContainer` height so icons align with cards. It does not scroll — `mapWrap` scrolls independently. Track icons always stay pinned on the left as the user scrolls right.

#### Era boundary markers

After positioning all cards, compute the min `x` coordinate for each era. Draw faint vertical lines (`position:absolute; width:1px; background:rgba(255,255,255,0.1)`) at each era boundary. Label the line with a small "Era N" pill at the top. These are informational overlays — they do not affect layout.

#### Track headers (left sidebar)

Add a fixed-width left strip (`width: 48px`, `position:sticky; left:0; z-index:2`) inside `mapWrap` that lists track icons down the Y axis, one icon per track row. The strip scrolls vertically with the content but stays pinned horizontally so track context is always visible.

#### Visual hierarchy of node states

| State | Opacity | Border | Additional treatment |
|-------|---------|--------|----------------------|
| `completed` | 1.0 | green `#6b9b4b` | Subtle checkmark overlay |
| `current` | 1.0 | gold `#e8c170` pulsing | Progress bar inside card |
| `queued` | 1.0 | blue `rgba(100,170,255,0.6)` | Queue position badge |
| `available` | 1.0 | white `rgba(255,255,255,0.4)` | Slight glow (box-shadow) |
| `next-layer` | 0.75 | amber `rgba(232,193,112,0.3)` | — |
| `locked` (era ≤ current+1) | 0.45 | none | — |
| `locked` (era > current+1) | *not shown in focus* | — | Hidden in focus zoom |

The "available" frontier (all nodes with `state === 'available'`) is where the player's decision lies. These nodes are at full opacity with a subtle glow, naturally forming a vertical band across the visible tree at the current research frontier.

#### Selected-path highlighting

Clicking a tech card highlights its full prerequisite chain (all ancestor nodes) and its first successor chain (direct children with `state === 'next-layer'` or `available`) in a blue overlay color (`rgba(100,170,255,0.18)` background, `#64aaff` edge color). The SVG bezier edges for the selected path use `stroke-width:3` vs `1.5` for non-selected. Existing behavior is preserved; only the visual clarity improves.

#### Scroll behavior on open

On panel open, `mapWrap.scrollLeft` is set so the currently-researching (or most recently completed) tech is horizontally centered in the viewport. This ensures the player's current position in the tree is immediately visible without manual scrolling.

#### What does NOT change

- `buildTechProgressionView` data model (only `visibleInFocus` changes per Phase 2)
- The queue section, inspector panel, and zoom controls above the tree
- The "Focus / Known tree / All techs" zoom toggle buttons
- Tech card content (name, status label, ETA, unlock text)
- `TechProgressionNode` type shape

---

## Tests

`tests/ui/tech-panel.test.ts` additions:
- **Phase 2**: Fresh tech state in focus zoom has zero nodes with `era > 2`.
- **Phase 2**: After completing an Era 2 tech, focus zoom allows nodes with `era <= 3`.
- **Phase 3**: All visible cards have `position.left` set; no two cards share the same `(x, y)` coordinates.
- **Phase 3**: A tech with two prerequisites lands at `depth = max(prereqDepths) + 1`.
- **Phase 3**: `mapWrap` does not have `flex-wrap:wrap` or equivalent (wrapping regression).
- **Phase 3**: For every prerequisite→successor pair, the prerequisite's computed depth is strictly less than the successor's computed depth (data-level; no pixel assertion needed — jsdom returns zero from getBoundingClientRect).
- **Phase 3**: Tracks with no visible nodes are not assigned rows — the rendered row count equals the number of tracks that have ≥1 visible node.

`tests/systems/tech-progression.test.ts` addition:
- `buildTechProgressionView` in focus zoom with empty tech state returns no node with `era > 2`.

---

## Acceptance criteria

- [ ] Phase 1: No SVG lines draw backwards or diagonally downward when the panel is narrower than full-width
- [ ] Phase 2: A new game in focus zoom shows Era 1 + Era 2 only; Era 3–5 nodes are absent
- [ ] Phase 3: Tech cards are positioned by prerequisite depth; prerequisites are always to the left of their successors
- [ ] Phase 3: Era boundaries appear as labeled vertical dividers
- [ ] Phase 3: Track icons are visible in a left sidebar that stays pinned while scrolling horizontally
- [ ] Phase 3: Available-frontier nodes have a visible glow distinguishing them from completed and locked nodes
- [ ] Phase 3: Panel opens with the current research tech horizontally centered
- [ ] Phase 3: Selected tech highlights its full ancestor + immediate successor chains
- [ ] All existing tech-panel tests pass
- [ ] `yarn test` and `yarn build` clean
