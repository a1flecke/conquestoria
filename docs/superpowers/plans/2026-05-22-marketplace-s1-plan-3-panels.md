# S1 Plan 3 — Panels & Legend: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the territory inspection panel's resource row behind the viewer's tech, enrich it with resource name + type, add a dynamic tech-filtered resource section to the map legend, and re-wire `main.ts` so the legend rebuilds on each show with current techs.

**Architecture:** `createTerritoryInspectionPanel` derives `viewerTechs` internally — its public signature is unchanged, so no call-site changes in `main.ts` for the panel. `createIconLegendOverlay` gains a `viewerTechs` parameter; `main.ts` switches from pre-building it once at startup to rebuilding on each toggle. `toggleIconLegend` becomes dead and is removed.

**Depends on:** Plan 1 merged first — imports `RESOURCE_DEFINITIONS` from `@/systems/trade-system`.

**Tech Stack:** TypeScript, DOM, Vitest

---

## Files changed

| File | Change |
|---|---|
| `src/ui/territory-inspection-panel.ts` | Import `RESOURCE_DEFINITIONS`; derive `viewerTechs`; replace unconditional resource line with tech-gated name+type display |
| `src/ui/icon-legend.ts` | Add `viewerTechs` param; change initial `display` to `block` (overlay is now only created when about to be shown); add dynamic resource section; remove `toggleIconLegend` export |
| `src/main.ts` | Remove `toggleIconLegend` import; remove pre-built `iconLegendOverlay` from `createGameShell` call; replace `onToggleIconLegend` callback with inline rebuild handler |
| `tests/ui/territory-inspection-panel.test.ts` | Add two tech-gated resource display tests |
| `tests/ui/icon-legend.test.ts` | New test file — two tests for resource section presence/absence |

---

### Task 1: Tech-gated resource display in inspection panel

**Files:**
- Modify: `tests/ui/territory-inspection-panel.test.ts`
- Modify: `src/ui/territory-inspection-panel.ts`

- [ ] **Step 1: Write failing inspection panel tests**

The existing test uses `resource: 'wheat'` (not a valid `ResourceType`). The new tests use `resource: 'gems'` (luxury, enabling tech `'mining-tech'`). Add two tests inside the existing `describe('createTerritoryInspectionPanel', ...)`, after the existing test cases:

```ts
  it('shows resource name and type when viewer has the enabling tech', () => {
    const state = makeInspectionState();
    // Replace resource with a valid ResourceType
    state.map.tiles['6,5'] = { ...state.map.tiles['6,5'], resource: 'gems' };
    // Grant the enabling tech (gems → mining-tech)
    state.civilizations.player.techState.completed = ['mining-tech'];

    const panel = createTerritoryInspectionPanel(state, { q: 6, r: 5 }, 'player');

    expect(panel.textContent).toContain('Gems (luxury)');
  });

  it('hides resource row when viewer lacks the enabling tech', () => {
    const state = makeInspectionState();
    state.map.tiles['6,5'] = { ...state.map.tiles['6,5'], resource: 'gems' };
    // techState.completed defaults to [] from createNewGame — no tech granted

    const panel = createTerritoryInspectionPanel(state, { q: 6, r: 5 }, 'player');

    expect(panel.textContent).not.toContain('Gems');
    expect(panel.textContent).not.toContain('luxury');
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/territory-inspection-panel.test.ts
```

Expected: "shows resource name and type" fails (current code unconditionally calls `addLine(panel, 'Resource', titleCase(tile.resource))` — no tech check, wrong format). "hides resource row" may pass accidentally if tile has `resource: 'wheat'` (not found in RESOURCE_DEFINITIONS) — but after this plan, both tests must pass for the correct reasons. Run to establish baseline.

- [ ] **Step 3: Update territory-inspection-panel.ts**

**Add import** — at the top of `src/ui/territory-inspection-panel.ts`, add alongside the existing imports:

```ts
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
```

**Derive viewerTechs** — inside `createTerritoryInspectionPanel`, after the `const viewer = state.civilizations[viewerId];` line (which is already there), add:

```ts
  const viewerTechs = new Set(viewer?.techState.completed ?? []);
```

**Replace the unconditional resource line** — find and replace line 95:

```ts
  if (tile.resource) addLine(panel, 'Resource', titleCase(tile.resource));
```

with:

```ts
  const resDef = tile.resource
    ? RESOURCE_DEFINITIONS.find(r => r.id === tile.resource)
    : null;
  if (resDef && viewerTechs.has(resDef.tech)) {
    addLine(panel, 'Resource', `${resDef.name} (${resDef.type})`);
  }
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/territory-inspection-panel.test.ts
```

Expected: all tests pass — including the two new ones and all existing tests (the existing test uses `resource: 'wheat'` which won't be found in RESOURCE_DEFINITIONS, so `resDef` is null and no resource line is rendered, which the existing test doesn't assert either way).

- [ ] **Step 5: Commit**

```bash
git add src/ui/territory-inspection-panel.ts tests/ui/territory-inspection-panel.test.ts
git commit -m "$(cat <<'EOF'
feat(S1): gate inspection panel resource row on tech; show name+type

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Dynamic resource section in icon legend

**Files:**
- Create: `tests/ui/icon-legend.test.ts`
- Modify: `src/ui/icon-legend.ts`

- [ ] **Step 6: Create failing icon-legend tests**

Create `tests/ui/icon-legend.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIconLegendOverlay } from '@/ui/icon-legend';

class MockElement {
  children: MockElement[] = [];
  style: Record<string, string> = { cssText: '' };
  id = '';
  private ownText = '';

  get textContent(): string {
    return `${this.ownText}${this.children.map(child => child.textContent).join('')}`;
  }

  set textContent(value: string) {
    this.ownText = value;
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }
}

class MockDocument {
  createElement(): MockElement {
    return new MockElement();
  }
}

describe('createIconLegendOverlay', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: new MockDocument() as unknown as Document,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
    });
  });

  it('includes resource icon and name when viewer has the enabling tech', () => {
    // animal-husbandry reveals Horses (🐎, strategic)
    const overlay = createIconLegendOverlay(new Set(['animal-husbandry']));
    expect((overlay as unknown as MockElement).textContent).toContain('🐎');
    expect((overlay as unknown as MockElement).textContent).toContain('Horses');
  });

  it('omits the Resources section entirely when viewer has no resource techs', () => {
    const overlay = createIconLegendOverlay(new Set());
    expect((overlay as unknown as MockElement).textContent).not.toContain('Resources');
    expect((overlay as unknown as MockElement).textContent).not.toContain('🐎');
    expect((overlay as unknown as MockElement).textContent).not.toContain('Horses');
  });
});
```

- [ ] **Step 7: Run the tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/icon-legend.test.ts
```

Expected: both tests fail — `createIconLegendOverlay` currently takes no parameters and has no resource section.

- [ ] **Step 8: Update icon-legend.ts**

Replace the entire `src/ui/icon-legend.ts` with the new implementation:

```ts
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';

const LEGEND_ITEMS = [
  { icon: '🏛️', label: 'City' },
  { icon: '⚠️', label: 'Unrest' },
  { icon: '🔥', label: 'Revolt' },
  { icon: '✦', label: 'Natural Wonder' },
  { icon: '🏕️', label: 'Tribal Village' },
  { icon: '🌾', label: 'Farm' },
  { icon: '⛏️', label: 'Mine' },
];

export function createIconLegendOverlay(viewerTechs: ReadonlySet<string> = new Set()): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'icon-legend';
  // display:block — this function is now only called when about to show the overlay
  overlay.style.cssText = 'position:absolute;top:84px;right:12px;z-index:24;width:180px;padding:12px;border-radius:12px;background:rgba(8,12,20,0.92);border:1px solid rgba(255,255,255,0.14);box-shadow:0 10px 30px rgba(0,0,0,0.35);display:block;';

  const title = document.createElement('div');
  title.textContent = 'Map Legend';
  title.style.cssText = 'font-size:12px;font-weight:700;color:#f4f1e8;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px;';
  overlay.appendChild(title);

  for (const item of LEGEND_ITEMS) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;color:#d7dce6;font-size:12px;padding:3px 0;';

    const icon = document.createElement('span');
    icon.textContent = item.icon;
    icon.style.cssText = 'display:inline-flex;width:20px;justify-content:center;';
    row.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = item.label;
    row.appendChild(label);

    overlay.appendChild(row);
  }

  // Dynamic resource section — only shown when viewer has at least one resource tech
  const unlockedResources = RESOURCE_DEFINITIONS.filter(r => viewerTechs.has(r.tech));
  if (unlockedResources.length > 0) {
    const resourceHeader = document.createElement('div');
    resourceHeader.style.cssText = 'font-size:12px;font-weight:700;color:#f4f1e8;letter-spacing:0.04em;text-transform:uppercase;margin-top:10px;margin-bottom:4px;';
    resourceHeader.textContent = 'Resources';
    overlay.appendChild(resourceHeader);

    const luxuries = unlockedResources.filter(r => r.type === 'luxury');
    const strategics = unlockedResources.filter(r => r.type === 'strategic');

    const groups: Array<[string, typeof unlockedResources]> = [
      ['Luxury', luxuries],
      ['Strategic', strategics],
    ];

    for (const [groupLabel, group] of groups) {
      if (group.length === 0) continue;

      const subHeader = document.createElement('div');
      subHeader.style.cssText = 'font-size:10px;color:rgba(244,241,232,0.5);text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;margin-bottom:2px;';
      subHeader.textContent = groupLabel;
      overlay.appendChild(subHeader);

      for (const r of group) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;color:#d7dce6;font-size:12px;padding:3px 0;';

        const iconSpan = document.createElement('span');
        iconSpan.textContent = r.icon;
        iconSpan.style.cssText = 'display:inline-flex;width:20px;justify-content:center;';
        row.appendChild(iconSpan);

        const labelSpan = document.createElement('span');
        labelSpan.textContent = r.name;
        row.appendChild(labelSpan);

        overlay.appendChild(row);
      }
    }
  }

  return overlay;
}
```

Note: `toggleIconLegend` is removed — `main.ts` handles visibility directly.

- [ ] **Step 9: Run the tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/icon-legend.test.ts
```

Expected: both tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/ui/icon-legend.ts tests/ui/icon-legend.test.ts
git commit -m "$(cat <<'EOF'
feat(S1): add dynamic tech-filtered resource section to map legend

createIconLegendOverlay now accepts viewerTechs; appends luxury and
strategic sub-sections for unlocked resources; removes toggleIconLegend
(main.ts handles show/hide directly).

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Re-wire main.ts

**Files:**
- Modify: `src/main.ts`

There are no dedicated automated tests for the `main.ts` wiring changes — the build (`yarn build`) is the type-checker, and the manual smoke test confirms end-to-end behavior. The three edits below are straightforward removals and substitutions.

- [ ] **Step 11: Remove toggleIconLegend from the import**

Find line 81 (the icon-legend import):

```ts
import { createIconLegendOverlay, toggleIconLegend } from '@/ui/icon-legend';
```

Replace with:

```ts
import { createIconLegendOverlay } from '@/ui/icon-legend';
```

- [ ] **Step 12: Replace the onToggleIconLegend callback**

Find line 221 (inside the `createGameShell` call options):

```ts
    onToggleIconLegend: () => toggleIconLegend(),
```

Replace with the inline rebuild handler:

```ts
    onToggleIconLegend: () => {
      const existing = document.getElementById('icon-legend');
      if (existing && existing.style.display !== 'none') {
        // Already visible — hide it
        existing.style.display = 'none';
        return;
      }
      // Stale or absent — remove old, rebuild fresh with current techs
      existing?.remove();
      const viewerTechs = new Set<string>(
        gameState.civilizations[gameState.currentPlayer]?.techState.completed ?? []
      );
      const overlay = createIconLegendOverlay(viewerTechs);
      uiLayer.appendChild(overlay);
    },
```

- [ ] **Step 13: Remove the pre-built iconLegendOverlay from createGameShell**

Find line 236 (the last property of the `createGameShell` options object):

```ts
    iconLegendOverlay: createIconLegendOverlay(),
```

Remove this line entirely. The `iconLegendOverlay` prop in `game-shell.ts` is optional (`?`), so removing it from the call site causes no TypeScript error.

- [ ] **Step 14: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: exits 0. All tests pass.

- [ ] **Step 15: Run the full build to check for type errors**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: exits 0. TypeScript finds no errors — the removed `toggleIconLegend` import is no longer referenced, and the new inline handler type-checks correctly against the `onToggleIconLegend: () => void` callback type in game-shell.

- [ ] **Step 16: Commit**

```bash
git add src/main.ts
git commit -m "$(cat <<'EOF'
feat(S1): rebuild icon legend on each toggle with current viewer techs

Remove pre-built overlay from createGameShell; replace toggleIconLegend
with an inline handler that creates a fresh overlay per show, ensuring
the resource list always reflects the player's current tech state.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Manual smoke test (after all three plans merged)

1. `bash scripts/run-with-mise.sh yarn dev`
2. Start a new game.
3. Open the map legend — confirm no "Resources" section.
4. Tap a mountain tile — confirm no Resource row in the inspection panel.
5. Research `gathering` (enables Stone 🪨).
6. Open the map legend — confirm a "Resources" section appears with "Strategic" sub-heading and "🪨 Stone".
7. Tap a mountain tile — confirm the Resource row reads "Stone (strategic)".
8. Research `animal-husbandry` (enables Horses 🐎).
9. Open the map legend — confirm "🐎 Horses" appears under "Strategic".
10. Tap a plains tile that has Horses — confirm "Horses (strategic)" in the inspection panel.
11. Save and reload — confirm resource display is consistent after reload.
