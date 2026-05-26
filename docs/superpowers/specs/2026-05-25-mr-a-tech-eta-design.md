# MR-A: Tech Panel ETA for Completed Nodes

**Issue:** #248  
**Date:** 2026-05-25  
**PR strategy:** Single focused fix

---

## #248 — Tech Node Shows "ETA pending" After Research Completes

### Root cause

`formatTechNodeEta` in `src/ui/tech-panel.ts` (lines 58–63) handles `'locked'` explicitly but has no `'completed'` case. It falls through to `return 'ETA pending'`, so completed nodes display misleading ETA text.

Additionally, `createTechNode` (line 211) always appends the separator and ETA:

```ts
detail.textContent = `${node.tech.unlocks[0] ?? 'New options'} · ${etaText} · Cost: ${node.tech.cost}`;
```

When `etaText` is empty, this produces a dangling separator: `"New options ·  · Cost: 50"` (double space between dots). The fix requires both the correct return value **and** conditional separator rendering.

### Fix

**File:** `src/ui/tech-panel.ts`

**Step 1 — `formatTechNodeEta`:** add a `'completed'` early return before the `'locked'` check:

```ts
function formatTechNodeEta(node: TechProgressionNode): string {
  if (node.state === 'completed') return '';
  if (node.turnsToResearch !== null) return `${node.turnsToResearch} turns`;
  if (node.state === 'locked') return 'ETA locked';
  return 'ETA pending';
}
```

**Step 2 — `createTechNode` line 211:** use a conditional separator instead of always appending:

```ts
const etaText = formatTechNodeEta(node);
const etaSegment = etaText ? ` · ${etaText}` : '';
detail.textContent = `${node.tech.unlocks[0] ?? 'New options'}${etaSegment} · Cost: ${node.tech.cost}`;
```

These two changes are coupled: both must land together. Step 1 alone causes no user-visible regression if step 2 is present; but step 2 alone (without step 1) still renders stale "ETA pending" text.

### Tests (`tests/ui/tech-panel.test.ts`)

- `formatTechNodeEta` with `node.state === 'completed'` returns `''`.
- `formatTechNodeEta` with `node.turnsToResearch === 3` returns `'3 turns'` (regardless of state).
- `formatTechNodeEta` with `state === 'locked'` and `turnsToResearch === null` returns `'ETA locked'`.
- `formatTechNodeEta` with `state === 'available'` and `turnsToResearch === null` returns `'ETA pending'`.
- `createTechNode` rendered for a completed node: `detail.textContent` matches `/Cost: \d+/` and does **not** contain `'ETA pending'` and does **not** contain `' ·  ·'` (double separator).
- `createTechNode` rendered for an in-progress node with `turnsToResearch = 4`: `detail.textContent` contains `'· 4 turns ·'`.

### Summary of files changed

| File | Change |
|------|--------|
| `src/ui/tech-panel.ts` | `formatTechNodeEta` — add `'completed'` → `''`; `createTechNode` — conditional `etaSegment` |
| `tests/ui/tech-panel.test.ts` | 6 new unit tests |
