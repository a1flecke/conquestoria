# Resource Accessibility MR 4 — Locked-Section UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the city panel's "Locked — missing resources" section, add a 📍 "Find missing resources" button to the **section header** (not per row) and replace the terse single-line hint per item with a multi-path dynamic description explaining all three acquisition routes.

**Architecture:** Both changes are in `src/ui/city-panel.ts`. The 📍 button is added programmatically (DOM-based, not HTML string) after the panel HTML is inserted so we can use `createGameButton()`. The multi-path text is generated per locked item at render time by a new `buildLockedItemReason` helper, replacing the current `resourceAcquisitionHint` one-liner. The button's highlight action uses `renderLoop.setHighlights()` and the existing toast notification system.

**Depends on:** S4b (`docs/superpowers/specs/2026-05-24-marketplace-s4b-strategic-prerequisites-design.md`) must be merged first — it introduces the locked section that this MR modifies. The S4b spec rule "locked items are non-interactive" is explicitly overridden by the resource accessibility spec for the section header button only; per-row items remain non-interactive.

**Tech Stack:** TypeScript, DOM, vitest (DOM tests).

---

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| City panel open, locked section shows Iron and Horses | Tap 📍 Find missing resources | Panel closes. Two hex tiles highlighted (nearest seen Iron + nearest seen Horses). Toast: "Iron is to the East. To claim it: expand + build Mine, OR send Expedition, OR buy from known civ (mid-game)." |
| City panel open, locked section, no resource tiles ever seen | Tap 📍 Find missing resources | Panel closes. Toast: "No Iron spotted yet — keep exploring!" |
| City panel open for 5 seconds (MR 3) | (no action) | Advisor tip fires (MR 3 feature — not duplicated here) |

---

## Misleading UI Risks

- The 📍 button must only highlight tiles the player has **already seen** (visibility `'visible'` or `'fog'`). Never reveal `'unexplored'` tiles.
- If multiple resources are missing, highlight **all** their nearest tiles (not just the first).
- The third acquisition bullet ("buy from known civ") must only appear when `civ.techState.completed.includes('trade-routes')` — not before.

---

## Files

- Modify: `src/ui/city-panel.ts:247–278` — replace `resourceAcquisitionHint`, add 📍 button DOM insertion
- Modify: `tests/ui/city-panel.test.ts` — 📍 button test + multi-path text tests

---

### Task 1: Write failing tests

**Files:**
- Modify: `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Add the failing tests**

```typescript
describe('locked section UI (MR 4)', () => {
  it('renders a 📍 Find missing resources button in the locked section header', () => {
    const state = createStateWithLockedItem({ resourceId: 'iron', hasTradeTech: false });
    createCityPanel(container, state, cityId, { onClose: vi.fn() });

    const findBtn = container.querySelector('[data-find-resources-btn]') as HTMLButtonElement | null;
    expect(findBtn).not.toBeNull();
    expect(findBtn?.textContent).toContain('Find missing resources');
  });

  it('locked item reason text shows Expand + Expedition paths (no trade-routes)', () => {
    const state = createStateWithLockedItem({ resourceId: 'iron', hasTradeTech: false });
    createCityPanel(container, state, cityId, { onClose: vi.fn() });

    const reasonEl = container.querySelector('[data-locked-reason="swordsman"]') as HTMLElement | null;
    expect(reasonEl?.textContent).toContain('Expand your city');
    expect(reasonEl?.textContent).toContain('Expedition');
    expect(reasonEl?.textContent).not.toContain('buy access'); // trade-routes not researched
  });

  it('locked item reason text shows third bullet when trade-routes researched', () => {
    const state = createStateWithLockedItem({ resourceId: 'iron', hasTradeTech: true });
    createCityPanel(container, state, cityId, { onClose: vi.fn() });

    const reasonEl = container.querySelector('[data-locked-reason="swordsman"]') as HTMLElement | null;
    expect(reasonEl?.textContent).toContain('buy access');
  });

  it('📍 button highlights nearest seen resource tile', () => {
    const state = createStateWithLockedItem({ resourceId: 'iron', hasTradeTech: false });
    // Place a visible iron tile
    state.map.tiles[hexKey({ q: 10, r: 10 })] = makeTile({ q: 10, r: 10 }, 'iron');
    state.civilizations['player'].visibility.tiles[hexKey({ q: 10, r: 10 })] = 'visible';

    const highlights: HexCoord[][] = [];
    const mockRenderLoop = { setHighlights: (coords: HexCoord[]) => highlights.push(coords) };

    createCityPanel(container, state, cityId, {
      onClose: vi.fn(),
      renderLoop: mockRenderLoop as any,
    });

    const findBtn = container.querySelector('[data-find-resources-btn]') as HTMLButtonElement;
    findBtn?.click();

    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights[0]).toContainEqual({ q: 10, r: 10 });
  });
});
```

Run to confirm failure:
```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/city-panel.test.ts 2>&1 | grep -E "FAIL|locked section UI"
```

---

### Task 2: Replace `resourceAcquisitionHint` with multi-path `buildLockedItemReason`

**Files:**
- Modify: `src/ui/city-panel.ts:247–253`

- [ ] **Step 1: Replace the `resourceAcquisitionHint` function**

Current (lines 247–253):
```typescript
  function resourceAcquisitionHint(resourceId: ResourceType): string {
    const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId);
    if (!def) return String(resourceId);
    const impMap: Record<string, string> = { mine: 'Mine', pasture: 'Pasture', quarry: 'Quarry', plantation: 'Plantation', camp: 'Camp' };
    const impName = impMap[def.requiredImprovement] ?? def.requiredImprovement;
    return `${def.name} (${impName} on a ${def.name} tile)`;
  }
```

Replace with:
```typescript
  /** Builds the multi-path reason text for a locked item's missing resources. */
  function buildLockedItemReason(missingResources: ResourceType[]): string {
    if (missingResources.length === 0) return 'Requirements met — checking other conditions.';

    const hasTradeTech = completedTechs.has('trade-routes');
    const parts: string[] = [];

    for (const resourceId of missingResources) {
      const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId);
      if (!def) { parts.push(String(resourceId)); continue; }

      const impMap: Record<string, string> = {
        mine: 'Mine', pasture: 'Pasture', quarry: 'Quarry',
        plantation: 'Plantation', camp: 'Camp',
      };
      const impName = impMap[def.requiredImprovement] ?? def.requiredImprovement;

      let text = `To get ${def.name}: `
               + `• Expand your city to a ${def.name} tile and build a ${impName}  `
               + `• Send an Expedition to plant an Outpost on a distant ${def.name} tile`;

      if (hasTradeTech) {
        text += `  • Buy access from a known civilization (Trade Routes)`;
      }
      parts.push(text);
    }

    return parts.join('\n');
  }
```

- [ ] **Step 2: Update the two call sites that used `resourceAcquisitionHint`**

Line 566:
```typescript
    if (reasonEl) reasonEl.textContent = `Requires ${item.missingResources.map(r => resourceAcquisitionHint(r)).join(' and ')}`;
```
Change to:
```typescript
    if (reasonEl) reasonEl.textContent = buildLockedItemReason(item.missingResources);
```

Line 655 (the "show more" expansion path):
```typescript
      if (reasonEl) reasonEl.textContent = `Requires ${item.missingResources.map(r => resourceAcquisitionHint(r)).join(' and ')}`;
```
Change to:
```typescript
      if (reasonEl) reasonEl.textContent = buildLockedItemReason(item.missingResources);
```

---

### Task 3: Add the 📍 "Find missing resources" button to the section header

**Files:**
- Modify: `src/ui/city-panel.ts`

The button must be added programmatically (not via innerHTML string) so that `createGameButton()` can be used and the click handler can be attached. Do this after the panel HTML is rendered.

- [ ] **Step 1: Add `renderLoop` to `createCityPanel` callbacks**

If the callback interface doesn't already include `renderLoop`, add it:

```typescript
interface CityPanelCallbacks {
  onClose: () => void;
  renderLoop?: { setHighlights: (coords: HexCoord[]) => void };
  // ... existing callbacks
}
```

- [ ] **Step 2: Insert the 📍 button after panel HTML is rendered**

After `container.appendChild(panel)` (or wherever the panel HTML is first in the DOM), add:

```typescript
  // Add 📍 Find missing resources button to the locked section header
  const lockedSection = panel.querySelector('[data-section="locked-items"]');
  if (lockedSection && lockedItems.length > 0) {
    const headerDiv = lockedSection.querySelector('div:first-child') as HTMLDivElement | null;
    if (headerDiv) {
      headerDiv.style.display = 'flex';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.justifyContent = 'space-between';

      const findBtn = createGameButton('📍 Find missing resources', 'ghost');
      findBtn.dataset.findResourcesBtn = 'true';
      findBtn.style.fontSize = '12px';
      findBtn.style.padding = '4px 10px';
      findBtn.style.minHeight = '36px';

      findBtn.addEventListener('click', () => {
        // 1. Close the city panel
        callbacks.onClose();

        // 2. For each missing resource, find the nearest seen tile
        const highlights: HexCoord[] = [];
        const vis = state.civilizations[state.currentPlayer]?.visibility?.tiles ?? {};

        for (const item of lockedItems) {
          for (const resourceId of item.missingResources) {
            let nearestTile: { coord: HexCoord; dist: number } | null = null;

            for (const tile of Object.values(state.map.tiles)) {
              if (tile.resource !== resourceId) continue;
              const tileVis = vis[hexKey(tile.coord)];
              if (tileVis === 'unexplored' || !tileVis) continue;

              const dist = hexDistance(tile.coord, city.position);
              if (!nearestTile || dist < nearestTile.dist) {
                nearestTile = { coord: tile.coord, dist };
              }
            }

            if (nearestTile) {
              highlights.push(nearestTile.coord);
              // 3. Toast
              const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId);
              const impMap: Record<string, string> = {
                mine: 'Mine', pasture: 'Pasture', quarry: 'Quarry',
                plantation: 'Plantation', camp: 'Camp',
              };
              const impName = def?.requiredImprovement
                ? (impMap[def.requiredImprovement] ?? def.requiredImprovement)
                : 'improvement';
              const hasTradeTech = completedTechs.has('trade-routes');
              const msg = `${def?.name ?? resourceId} is nearby. `
                        + `To claim it: expand your city + build a ${impName}, `
                        + `OR send an Expedition`
                        + (hasTradeTech ? `, OR buy access from a known civ.` : `.`);
              showNotification(msg, 'info');
            } else {
              const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId);
              showNotification(`No ${def?.name ?? resourceId} spotted yet — keep exploring!`, 'info');
            }
          }
        }

        if (highlights.length > 0 && callbacks.renderLoop) {
          callbacks.renderLoop.setHighlights(highlights);
        }
      });

      headerDiv.appendChild(findBtn);
    }
  }
```

Also add the import if missing:
```typescript
import { hexDistance } from '@/systems/hex-utils';
import { createGameButton } from './ui-kit';
```

- [ ] **Step 3: Run the tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/city-panel.test.ts 2>&1 | grep -E "PASS|FAIL|locked section UI"
```
Expected: All 4 locked section UI tests pass.

- [ ] **Step 4: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```

- [ ] **Step 5: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(ui): locked-section 📍 button + multi-path acquisition reason text"
```
