# Resource Accessibility MR 3 — Advisor Tips

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three advisor tips that teach players about resources as they play: an intro tip at turn 3, a discovery tip when fog lifts on a resource tile, and a frustration tip when a player stares at a locked build item for 5 seconds. Tips are session-scoped (once per page load) and use the shared `SESSION_SHOWN_TIPS` Set to prevent repeating across the session.

**Architecture:** The "turn 3" intro tip uses the existing `ADVISOR_MESSAGES` polling mechanism (adds a new entry). The "resource discovered" tip fires imperatively from the fog-lift event path in `main.ts` and calls a new exported `fireResourceDiscoveredTip` function. The "locked frustration" tip fires from a `setTimeout` in the city panel's close handler. All three share a module-level `SESSION_SHOWN_TIPS` Set in `advisor-system.ts`. No new state in `GameState` — tips are intentionally not persisted.

**No dependencies.** Can ship alongside MR 1 and MR 2a.

**Tech Stack:** TypeScript, vitest (DOM tests for city-panel timeout).

---

## Files

- Modify: `src/ui/advisor-system.ts` — add `SESSION_SHOWN_TIPS`, resources-intro tip, `fireResourceDiscoveredTip` export
- Modify: `src/main.ts` — call `fireResourceDiscoveredTip` on fog-lift events
- Modify: `src/ui/city-panel.ts` — add setTimeout frustration tip + clearTimeout on close
- Modify: `tests/ui/advisor-system.test.ts` — 1 deduplication test
- Modify: `tests/ui/city-panel.test.ts` — 1 setTimeout guard test

---

### Task 1: Add `SESSION_SHOWN_TIPS` and the turn-3 intro tip

**Files:**
- Modify: `src/ui/advisor-system.ts`

- [ ] **Step 1: Add `SESSION_SHOWN_TIPS` at module level**

At the top of `advisor-system.ts`, after the imports, add:

```typescript
/**
 * Session-scoped tip suppression. Cleared on page load (module re-init).
 * Shared across all players in a hot-seat session — tips are tutorial reminders,
 * not per-player notifications.
 */
export const SESSION_SHOWN_TIPS = new Set<string>();
```

- [ ] **Step 2: Add the turn-3 "resources exist" tip to `ADVISOR_MESSAGES`**

Find a suitable place in `ADVISOR_MESSAGES` after the existing explorer tips (around line 73). Add:

```typescript
  {
    id: 'resources-intro',
    advisor: 'explorer',
    icon: '🗺️',
    message: 'Special resources are scattered across the world — Iron, Silk, Ivory, and more. '
           + 'Each unlocks powerful units and buildings. Explore to find them!',
    trigger: (state) => {
      if (SESSION_SHOWN_TIPS.has('resources-intro')) return false;
      if (state.turn < 3) return false;
      const civ = state.civilizations[state.currentPlayer];
      if (!civ) return false;
      // Only fire if the player has not already acquired a resource
      const { getCivAvailableResources } = await import('@/systems/resource-acquisition-system');
      // Note: trigger must be synchronous. Import at module level instead:
      return getCivAvailableResources(state, state.currentPlayer).size === 0;
    },
  },
```

**Important:** The trigger function must be synchronous. Add the import at the top of the file instead of inside the trigger:

```typescript
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
```

Revised trigger:
```typescript
  {
    id: 'resources-intro',
    advisor: 'explorer',
    icon: '🗺️',
    message: 'Special resources are scattered across the world — Iron, Silk, Ivory, and more. '
           + 'Each unlocks powerful units and buildings. Explore to find them!',
    trigger: (state) => {
      if (SESSION_SHOWN_TIPS.has('resources-intro')) return false;
      if (state.turn < 3) return false;
      const civ = state.civilizations[state.currentPlayer];
      if (!civ) return false;
      return getCivAvailableResources(state, state.currentPlayer).size === 0;
    },
  },
```

Also update the `check()` method: after `this.shownIds.add(msg.id)`, also add the tip ID to `SESSION_SHOWN_TIPS`:

```typescript
      if (msg.trigger(state)) {
        this.shownIds.add(msg.id);
        SESSION_SHOWN_TIPS.add(msg.id);   // ← add this line
        // ... rest of existing check() logic
```

- [ ] **Step 3: Write the deduplication test**

In `tests/ui/advisor-system.test.ts`, add:

```typescript
import { SESSION_SHOWN_TIPS, getAdvisorMessageIds } from '@/ui/advisor-system';

describe('SESSION_SHOWN_TIPS', () => {
  afterEach(() => {
    SESSION_SHOWN_TIPS.clear();
  });

  it('resources-intro is in the ADVISOR_MESSAGES list', () => {
    expect(getAdvisorMessageIds()).toContain('resources-intro');
  });

  it('prevents the resources-intro tip from firing a second time in the same session', () => {
    SESSION_SHOWN_TIPS.add('resources-intro');
    // The tip trigger should check SESSION_SHOWN_TIPS and return false
    // We test indirectly: build a minimal state at turn 3 with no resources
    const state = createMinimalGameState();
    state.turn = 3;

    // The advisor check() should NOT emit the tip because SESSION_SHOWN_TIPS has it
    const emitted: string[] = [];
    const bus = createTestEventBus((event, payload) => {
      if (event === 'advisor:message') emitted.push((payload as any).message);
    });
    const advisor = new AdvisorSystem(bus);
    advisor.check(state);

    expect(emitted.some(m => m.includes('Special resources'))).toBe(false);
  });
});
```

Run to confirm failure:
```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/advisor-system.test.ts 2>&1 | grep -E "FAIL|SESSION_SHOWN_TIPS"
```

- [ ] **Step 4: Run the tests after implementation**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/advisor-system.test.ts 2>&1 | tail -10
```
Expected: Both SESSION_SHOWN_TIPS tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/advisor-system.ts tests/ui/advisor-system.test.ts
git commit -m "feat(tips): SESSION_SHOWN_TIPS + resources-intro advisor tip at turn 3"
```

---

### Task 2: Add `fireResourceDiscoveredTip` — fires on fog lift

**Files:**
- Modify: `src/ui/advisor-system.ts` — add exported function
- Modify: `src/main.ts` — call on fog-lift

- [ ] **Step 1: Add `fireResourceDiscoveredTip` to `advisor-system.ts`**

Add after `getAdvisorMessageIds`:

```typescript
/**
 * Fires an advisor tip when a tile with a resource transitions from
 * 'unexplored' to visible for the first time. Safe to call multiple times —
 * SESSION_SHOWN_TIPS prevents duplicate messages per resource type per session.
 *
 * @param resourceId  The resource ID on the newly-visible tile (e.g. 'iron').
 * @param tileCoord   The discovered tile's hex coordinates.
 * @param state       Current game state (for tech check + capital reference).
 * @param bus         EventBus to emit on.
 */
export function fireResourceDiscoveredTip(
  resourceId: string,
  tileCoord: HexCoord,
  state: GameState,
  bus: EventBus,
): void {
  const tipId = `resource-discovered-${resourceId}`;
  if (SESSION_SHOWN_TIPS.has(tipId)) return;

  const civ = state.civilizations[state.currentPlayer];
  if (!civ) return;

  const settings = state.settings;
  if (!settings.advisorsEnabled?.['explorer']) return;

  SESSION_SHOWN_TIPS.add(tipId);

  const resourceDef = RESOURCE_DEFINITIONS.find(d => d.id === resourceId);
  const icon = resourceDef?.icon ?? '❓';
  const resourceName = resourceDef?.name ?? resourceId;
  const hasTech = resourceDef && civ.techState.completed.includes(resourceDef.tech);

  // Compute direction from capital (first city)
  let directionClause = '';
  const capitalId = civ.cities[0];
  const capital = capitalId ? state.cities[capitalId] : null;
  if (capital) {
    const dq = tileCoord.q - capital.position.q;
    const dr = tileCoord.r - capital.position.r;
    directionClause = ` to the ${axialToCompass(dq, dr)}`;
  }

  let message: string;
  if (hasTech) {
    const impMap: Record<string, string> = {
      mine: 'Mine', pasture: 'Pasture', camp: 'Camp',
      plantation: 'Plantation', quarry: 'Quarry',
    };
    const impName = resourceDef?.requiredImprovement
      ? (impMap[resourceDef.requiredImprovement] ?? resourceDef.requiredImprovement)
      : 'improvement';
    message = `We've spotted ${icon} ${resourceName}${directionClause}! `
            + `Build a ${impName} there to claim it — or send an Expedition to plant a flag!`;
  } else {
    const techDef = resourceDef?.tech ?? '???';
    message = `Scouts report an unknown deposit nearby. Our scholars say we'd need `
            + `${techDef} to make use of it.`;
  }

  bus.emit('advisor:message', {
    advisor: 'explorer',
    message,
    icon: '🗺️',
  });
}

/** Map axial hex delta to one of 8 compass directions. */
function axialToCompass(dq: number, dr: number): string {
  // Convert axial to cube coords for direction
  const ds = -dq - dr;
  const adq = Math.abs(dq);
  const adr = Math.abs(dr);
  const ads = Math.abs(ds);
  // Dominant axis
  if (adq >= adr && adq >= ads) return dq > 0 ? 'East' : 'West';
  if (adr >= adq && adr >= ads) return dr > 0 ? 'South' : 'North';
  // Diagonal
  if (dq > 0 && dr < 0) return 'Northeast';
  if (dq > 0 && dr > 0) return 'Southeast';
  if (dq < 0 && dr < 0) return 'Northwest';
  return 'Southwest';
}
```

Also add the import at the top:
```typescript
import type { HexCoord } from '@/core/types';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
```

- [ ] **Step 2: Wire `fireResourceDiscoveredTip` in `main.ts`**

Search `src/main.ts` for the fog-lift / visibility update code path. The transition from `'unexplored'` to `'visible'` or `'fog'` happens when a unit moves (in the visibility update loop). Find the loop that updates tile visibility and add a call there:

```typescript
import { fireResourceDiscoveredTip } from '@/ui/advisor-system';

// Inside the visibility update loop, where tile visibility is promoted
// from 'unexplored' to 'visible':
if (prevVisibility === 'unexplored' && newVisibility !== 'unexplored') {
  const tile = gameState.map.tiles[tileKey];
  if (tile?.resource) {
    fireResourceDiscoveredTip(tile.resource, tile.coord, gameState, bus);
  }
}
```

The exact location depends on how visibility is computed in `main.ts` — search for `'unexplored'` string assignments and the visibility promotion logic.

- [ ] **Step 3: Build and run tests**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
bash scripts/run-with-mise.sh yarn test -- tests/ui/advisor-system.test.ts 2>&1 | tail -10
```
Expected: Build and tests both pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/advisor-system.ts src/main.ts
git commit -m "feat(tips): fireResourceDiscoveredTip on fog lift with tech-aware message and compass direction"
```

---

### Task 3: Add locked-item frustration tip to city panel

This tip fires when the city panel has been open for 5+ seconds with a locked section visible and no build item tapped.

**Files:**
- Modify: `src/ui/city-panel.ts`

- [ ] **Step 1: Understand the locked section structure**

In `city-panel.ts`, the locked section is rendered at line 474 as `${lockedSectionHtml}` inside the panel HTML. The `lockedItems` array (built at line 234) contains items with `missingResources`.

- [ ] **Step 2: Add the frustration tip setTimeout**

At the bottom of the `createCityPanel` function (after all event listeners are attached), add:

```typescript
  import { SESSION_SHOWN_TIPS } from '@/ui/advisor-system';
  // ... (add this import at the top of the file)

  // Frustration tip: fires if locked section is visible and player hasn't tapped anything
  let frustrationTimerHandle: ReturnType<typeof setTimeout> | null = null;

  if (lockedItems.length > 0) {
    // Start the 5-second timer
    frustrationTimerHandle = setTimeout(() => {
      for (const item of lockedItems) {
        const tipId = `locked-frustration-${item.missingResources[0] ?? item.id}`;
        if (SESSION_SHOWN_TIPS.has(tipId)) continue;
        SESSION_SHOWN_TIPS.add(tipId);

        const resourceId = item.missingResources[0];
        const def = resourceId ? RESOURCE_DEFINITIONS.find(d => d.id === resourceId) : null;
        const resourceName = def?.name ?? resourceId ?? 'this resource';

        // Fire via EventBus if accessible, or show as notification
        showNotification(
          `To unlock ${item.name}, we need ${resourceName}. Tap 📍 to find the nearest deposit.`,
          'info',
        );
        break; // one tip at a time
      }
    }, 5000);
  }

  // Cancel the timer when the panel closes
  const originalCloseHandler = callbacks.onClose;
  if (typeof originalCloseHandler === 'function') {
    // Wrap the close callback to clear the timer
    panel.addEventListener('remove-panel', () => {
      if (frustrationTimerHandle !== null) {
        clearTimeout(frustrationTimerHandle);
        frustrationTimerHandle = null;
      }
    });
  }
```

**Critical implementation note:** The panel's close button must trigger `clearTimeout`. Find the close button's click handler in `city-panel.ts` and add:

```typescript
  closeBtn.addEventListener('click', () => {
    if (frustrationTimerHandle !== null) {
      clearTimeout(frustrationTimerHandle);
      frustrationTimerHandle = null;
    }
    callbacks.onClose();
  });
```

- [ ] **Step 3: Write a test for clearTimeout on close**

In `tests/ui/city-panel.test.ts`, add:

```typescript
describe('locked frustration tip', () => {
  it('does not fire if panel closes before 5 seconds', async () => {
    vi.useFakeTimers();
    const state = createMinimalGameStateWithLockedItem(); // state where at least one item is locked

    const notifications: string[] = [];
    // Intercept showNotification or the EventBus
    vi.spyOn(global, 'setTimeout');

    const closeCallback = vi.fn();
    const panel = createCityPanel(container, state, state.civilizations['player'].cities[0], {
      onClose: closeCallback,
    });

    // Simulate closing the panel before 5 seconds
    const closeBtn = container.querySelector('[data-close-btn]') as HTMLButtonElement;
    closeBtn?.click();

    // Advance timers past 5 seconds
    vi.advanceTimersByTime(6000);

    // Notification should NOT have fired
    expect(notifications.some(n => n.includes('locked'))).toBe(false);

    vi.useRealTimers();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/city-panel.test.ts tests/ui/advisor-system.test.ts 2>&1 | tail -15
```
Expected: All pass.

- [ ] **Step 5: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```

- [ ] **Step 6: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/advisor-system.ts src/main.ts src/ui/city-panel.ts \
        tests/ui/advisor-system.test.ts tests/ui/city-panel.test.ts
git commit -m "feat(tips): resource advisor tips — intro, fog-lift discovery, locked frustration"
```
