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

**Change**: In `createTechPanel`, the `body` container currently has `flex-wrap:wrap`. Remove `flex-wrap` from `body`. Set `mapWrap` to `overflow-x:auto` with the inner grid set to `min-width:max-content` so it scrolls horizontally rather than reflowing.

This is a pure layout fix; no logic changes. Edge geometry recalculation already fires via `requestAnimationFrame` and will produce correct curves once reflow is prevented.

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

The `'known'` and `'all'` zoom levels remain unchanged — players who want to see the full tree can switch to those.

**Test**: A fresh tech state (no completed techs, no current research) in focus zoom must not include any node with `era > 2`.

### Phase 3 — Dependency-graph layout overhaul (Bug C)

This is the primary UX fix. Replace the era-column × track-row matrix with a proper directed-acyclic-graph layout where **horizontal position = prerequisite depth** and **vertical position = track**.

#### Layout algorithm

Run after `buildTechProgressionView` produces `visibleNodes`:

1. **Topological depth**: For each visible node, compute `depth = max(prerequisites' depths) + 1`. Root nodes (no prerequisites in the visible set) get `depth = 0`.
2. **Track assignment**: Assign each track a fixed row index. Derive track order from `getDerivedTechTracks()` — the same stable order already used for the track list.
3. **Pixel coordinates**:
   - `x = depth * (CARD_WIDTH + CARD_GAP_H)` where `CARD_WIDTH = 200`, `CARD_GAP_H = 28`
   - `y = trackIndex * (CARD_HEIGHT + CARD_GAP_V)` where `CARD_HEIGHT = 92`, `CARD_GAP_V = 16`
4. **Collision resolution** (same-depth, same-track): If two nodes land at the same `(x, y)`, offset the second by `CARD_HEIGHT + CARD_GAP_V` (push it down within that track row). This handles multi-path tracks where two different prerequisites produce the same depth for a successor.

#### Render

Replace `display:grid` with `position:relative` on the inner container. Render each tech card as `position:absolute; left:{x}px; top:{y}px`. The container's intrinsic size is `width: maxX + CARD_WIDTH; height: maxY + CARD_HEIGHT`.

`mapWrap` scrolls both axes: `overflow:auto`. Horizontal scroll is primary; vertical scroll handles tall track lists.

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
- **Phase 3**: SVG edges connect from the right edge of a prerequisite card to the left edge of its successor card (x-ordering matches dependency direction).

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
