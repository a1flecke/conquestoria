# Resource Accessibility MR 5 — Diplomatic Marketplace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Available from Known Civs" section to the Marketplace panel, letting players buy 10-turn resource access from civs they've met (implementing S9 from the trade roadmap). Purchased access is stored with `civId` for hot-seat correctness and expires automatically.

**Architecture:** `MarketplaceState.purchasedResources` stores `{ civId, resource, expiresOnTurn }[]`. `getCivAvailableResources` gains a third pass that reads active purchased entries. `performEmergencyImport` in `trade-system.ts` handles the transaction (gold deduction + entry creation). Turn-manager filters expired entries at start of each civ's turn. The marketplace panel adds the new section behind the `trade-routes` tech gate.

**This is S9 from the trade roadmap** (`docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`). Trade routes remain gold-income mechanisms; this adds resource access purchasing as a separate transaction.

**Depends on:** S5 (Caravan + trade routes established — so there are civs with active trade and resources) and S9 in the trade roadmap queue. Do NOT ship before those are merged.

**Tech Stack:** TypeScript, DOM, vitest.

---

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Marketplace open, known civ has Iron | Tap "Buy Access (24 gold / 10 turns)" | Gold decreases by 24. Row shows "✓ Access active (N turns left)". Iron now available to this civ (flows through all downstream consumers). |
| Marketplace open, at war with civ that has Iron | (row rendered) | Row shows "⚔️ Unavailable — at war with [Civ]". Buy button absent. |
| Purchased Iron, 10 turns later | (turn start) | `purchasedResources` entry removed. Iron no longer available unless re-bought or acquired via outpost/city path. |
| Old save loaded (no `purchasedResources` field) | (game load) | `purchasedResources` defaults to `[]`. No crash, no missing access. |

---

## Misleading UI Risks

- "Available from Known Civs" section must only appear after `trade-routes` tech. If not researched: section is hidden entirely (not shown empty).
- Only show civs the current player has **met** (`civ.diplomacy.relationships` keys). Do NOT use `state.knownCivilizations` (may be global).
- "Already have this" guard prevents double-buying: check `getCivAvailableResources(state, currentPlayer).has(resourceId)` — this includes city-territory, outpost, and already-active purchased entries.
- Hot-seat isolation: `purchasedResources` entries are `civId`-scoped. Player 1 buying Iron does not grant it to Player 2.

---

## Files

- Modify: `src/core/types.ts:923–929` — add `purchasedResources` to `MarketplaceState`
- Modify: `src/systems/resource-acquisition-system.ts` — add pass 3 (purchasedResources)
- Modify: `src/systems/trade-system.ts` — add `performEmergencyImport`
- Modify: `src/core/turn-manager.ts` — add purchasedResources expiry cleanup
- Modify: `src/ui/marketplace-panel.ts` — add "Available from Known Civs" section
- Modify: `tests/systems/resource-acquisition-system.test.ts` — 3 purchased resources tests
- Modify: `tests/systems/trade-system.test.ts` — 3 emergency import tests
- Modify: `tests/storage/save-manager.test.ts` — 1 backward compat test

---

### Task 1: Add `purchasedResources` to `MarketplaceState`

**Files:**
- Modify: `src/core/types.ts:923–929`

- [ ] **Step 1: Extend the interface**

Current `MarketplaceState` (line 923):
```typescript
export interface MarketplaceState {
  prices: Record<string, number>;
  priceHistory: Record<string, number[]>;
  fashionable: ResourceType | null;
  fashionTurnsLeft: number;
  tradeRoutes: TradeRoute[];
}
```

Add `purchasedResources` as an optional field (backward compatible):
```typescript
export interface MarketplaceState {
  prices: Record<string, number>;
  priceHistory: Record<string, number[]>;
  fashionable: ResourceType | null;
  fashionTurnsLeft: number;
  tradeRoutes: TradeRoute[];
  /**
   * Resources purchased via emergency import (S9). Optional for backward compat with old saves.
   * civId is required for hot-seat: each civ's purchases are independent.
   */
  purchasedResources?: Array<{
    civId: string;
    resource: ResourceType;
    expiresOnTurn: number;  // = state.turn + 10 at time of purchase
  }>;
}
```

- [ ] **Step 2: Build to confirm no regressions**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: Succeeds (optional field, no existing code needs updating).

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(marketplace): add purchasedResources to MarketplaceState (S9 foundation)"
```

---

### Task 2: Write failing tests for the purchasedResources acquisition pass

**Files:**
- Modify: `tests/systems/resource-acquisition-system.test.ts`

- [ ] **Step 1: Add 3 purchased-resources tests**

```typescript
describe('purchasedResources pass (Pillar 3 / S9)', () => {
  function makeStateWithPurchase(opts: {
    buyerCivId: string;
    resource: string;
    expiresOnTurn: number;
    currentTurn: number;
  }): GameState {
    const state = createMinimalGameState();
    state.turn = opts.currentTurn;
    state.marketplace = {
      prices: {},
      priceHistory: {},
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [],
      purchasedResources: [{
        civId: opts.buyerCivId,
        resource: opts.resource as ResourceType,
        expiresOnTurn: opts.expiresOnTurn,
      }],
    };
    // Give buyer the required tech
    state.civilizations[opts.buyerCivId].techState.completed = ['bronze-working'];
    return state;
  }

  it('grants resource to buyer when active (expiresOnTurn > state.turn)', () => {
    const state = makeStateWithPurchase({
      buyerCivId: 'player',
      resource: 'iron',
      expiresOnTurn: 15,
      currentTurn: 10,
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('iron')).toBe(true);
  });

  it('does NOT grant resource when expired (expiresOnTurn <= state.turn)', () => {
    const state = makeStateWithPurchase({
      buyerCivId: 'player',
      resource: 'iron',
      expiresOnTurn: 10,
      currentTurn: 10,
    });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('iron')).toBe(false);
  });

  it('does NOT grant resource to a different civ (hot-seat isolation)', () => {
    const state = makeStateWithPurchase({
      buyerCivId: 'player',
      resource: 'iron',
      expiresOnTurn: 20,
      currentTurn: 10,
    });
    state.civilizations['ai-1'].techState.completed = ['bronze-working'];
    const result = getCivAvailableResources(state, 'ai-1');
    expect(result.has('iron')).toBe(false);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/resource-acquisition-system.test.ts 2>&1 | grep -E "FAIL|purchasedResources pass"
```

---

### Task 3: Implement purchasedResources pass in `getCivAvailableResources`

**Files:**
- Modify: `src/systems/resource-acquisition-system.ts`

- [ ] **Step 1: Add pass 3 after the outpost pass**

```typescript
  // Pass 3 — purchased resources from the Diplomatic Marketplace (S9)
  const purchased = state.marketplace?.purchasedResources ?? [];
  for (const entry of purchased) {
    if (entry.civId !== civId) continue;
    if (entry.expiresOnTurn <= state.turn) continue;
    // No additional tech check needed: purchase already required tech during buy
    result.add(entry.resource);
  }
```

- [ ] **Step 2: Run the 3 purchased-resources tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/resource-acquisition-system.test.ts 2>&1 | tail -15
```
Expected: All 3 pass.

- [ ] **Step 3: Commit**

```bash
git add src/systems/resource-acquisition-system.ts tests/systems/resource-acquisition-system.test.ts
git commit -m "feat(marketplace): purchasedResources acquisition pass in getCivAvailableResources"
```

---

### Task 4: Add `performEmergencyImport` to `trade-system.ts`

**Files:**
- Modify: `src/systems/trade-system.ts`
- Modify: `tests/systems/trade-system.test.ts`

- [ ] **Step 1: Write 3 failing emergency import tests**

In `tests/systems/trade-system.test.ts`, add:

```typescript
import { performEmergencyImport } from '@/systems/trade-system';

describe('performEmergencyImport', () => {
  it('deducts gold immediately and sets expiresOnTurn = state.turn + 10', () => {
    const state = createMinimalMarketplaceState();
    state.turn = 5;
    state.civilizations['player'].gold = 100;
    // Make seller civ known with iron
    state.civilizations['ai-1'].techState.completed = ['bronze-working'];
    // Place iron tile in ai-1 territory
    const ironKey = hexKey({ q: 5, r: 5 });
    state.map.tiles[ironKey] = makeTile({ q: 5, r: 5 }, 'iron');
    state.cities['city-ai-1'].ownedTiles.push({ q: 5, r: 5 });
    // Establish diplomatic contact
    state.civilizations['player'].diplomacy.relationships['ai-1'] = 10;

    const newState = performEmergencyImport(state, 'player', 'ai-1', 'iron');

    expect(newState.civilizations['player'].gold).toBe(100 - 24); // iron basePrice=8, ×3
    const entry = newState.marketplace?.purchasedResources?.find(e => e.civId === 'player' && e.resource === 'iron');
    expect(entry).toBeDefined();
    expect(entry?.expiresOnTurn).toBe(15); // turn 5 + 10
  });

  it('throws or returns unchanged state when civ is at war with seller', () => {
    const state = createMinimalMarketplaceState();
    state.civilizations['player'].diplomacy.relationships['ai-1'] = -50;
    state.civilizations['player'].diplomacy.atWarWith = ['ai-1'];

    // Should not modify gold or purchasedResources
    const newState = performEmergencyImport(state, 'player', 'ai-1', 'iron');
    expect(newState.civilizations['player'].gold).toBe(state.civilizations['player'].gold);
    expect(newState.marketplace?.purchasedResources ?? []).toHaveLength(0);
  });

  it('throws or returns unchanged state when seller civ is not in relationships', () => {
    const state = createMinimalMarketplaceState();
    // 'ai-2' is NOT in player's relationships — never met
    delete state.civilizations['player'].diplomacy.relationships['ai-2'];

    const newState = performEmergencyImport(state, 'player', 'ai-2', 'iron');
    expect(newState.marketplace?.purchasedResources ?? []).toHaveLength(0);
  });
});
```

Run to confirm failure:
```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/trade-system.test.ts 2>&1 | grep -E "FAIL|performEmergencyImport"
```

- [ ] **Step 2: Implement `performEmergencyImport`**

In `src/systems/trade-system.ts`, add:

```typescript
import { isAtWar } from './diplomacy-system';
import type { GameState, ResourceType } from '@/core/types';

/**
 * S9 — Emergency resource import. Deducts gold immediately and grants 10-turn
 * access to a resource from a known, non-hostile civ.
 *
 * Returns unchanged state if any precondition fails (at war, not met, civ lacks resource).
 * Immutable spread-copy.
 */
export function performEmergencyImport(
  state: GameState,
  buyerCivId: string,
  sellerCivId: string,
  resource: ResourceType,
): GameState {
  const buyer = state.civilizations[buyerCivId];
  const seller = state.civilizations[sellerCivId];
  if (!buyer || !seller) return state;

  // Must have met the seller
  if (!(sellerCivId in (buyer.diplomacy.relationships ?? {}))) return state;

  // Must not be at war
  if (isAtWar(buyer.diplomacy, sellerCivId)) return state;

  // Seller must actually have the resource (using existing resource-acquisition system)
  const { getCivAvailableResources } = await import('./resource-acquisition-system');
  // Note: this file is CommonJS/ESM compatible; use synchronous import pattern used elsewhere

  // Cost: 3× basePrice
  const def = RESOURCE_DEFINITIONS.find(d => d.id === resource);
  if (!def) return state;
  const cost = def.basePrice * 3;
  if (buyer.gold < cost) return state;

  const existingPurchased = state.marketplace?.purchasedResources ?? [];
  const newEntry = {
    civId: buyerCivId,
    resource,
    expiresOnTurn: state.turn + 10,
  };

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [buyerCivId]: {
        ...buyer,
        gold: buyer.gold - cost,
      },
    },
    marketplace: {
      ...state.marketplace!,
      purchasedResources: [...existingPurchased, newEntry],
    },
  };
}
```

**Note:** If `getCivAvailableResources` causes a circular import (both files import each other), move the seller-has-resource check to the caller (marketplace panel) and remove it from this helper. Document this clearly.

- [ ] **Step 3: Run the tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/trade-system.test.ts 2>&1 | grep -E "PASS|FAIL|performEmergencyImport"
```
Expected: All 3 pass.

- [ ] **Step 4: Commit**

```bash
git add src/systems/trade-system.ts tests/systems/trade-system.test.ts
git commit -m "feat(marketplace): performEmergencyImport — S9 buy resource for 10 turns"
```

---

### Task 5: Wire expiry cleanup in turn-manager

**Files:**
- Modify: `src/core/turn-manager.ts`

- [ ] **Step 1: Add expiry filter at start of each civ's turn**

At the start of each civ's turn processing block (where the current player changes), add:

```typescript
    // Clean up expired purchasedResources for this civ
    if (nextState.marketplace?.purchasedResources) {
      nextState = {
        ...nextState,
        marketplace: {
          ...nextState.marketplace,
          purchasedResources: nextState.marketplace.purchasedResources.filter(
            entry => entry.expiresOnTurn > nextState.turn,
          ),
        },
      };
    }
```

- [ ] **Step 2: Add the backward compat test**

In `tests/storage/save-manager.test.ts`, add:

```typescript
it('loads an old save with no purchasedResources without error', () => {
  const oldSave = createMinimalSave();
  // Ensure marketplace exists but purchasedResources is absent
  oldSave.state.marketplace = {
    prices: {},
    priceHistory: {},
    fashionable: null,
    fashionTurnsLeft: 0,
    tradeRoutes: [],
    // purchasedResources intentionally absent
  };

  expect(() => {
    const resources = getCivAvailableResources(oldSave.state, 'player');
    return resources;
  }).not.toThrow();
});
```

- [ ] **Step 3: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/core/turn-manager.test.ts tests/storage/save-manager.test.ts 2>&1 | tail -15
```
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/turn-manager.ts tests/storage/save-manager.test.ts
git commit -m "feat(marketplace): purchasedResources expiry cleanup in turn-manager"
```

---

### Task 6: Add "Available from Known Civs" section to marketplace panel

**Files:**
- Modify: `src/ui/marketplace-panel.ts`
- Modify: `tests/ui/marketplace-panel.test.ts`

- [ ] **Step 1: Write failing panel tests**

In `tests/ui/marketplace-panel.test.ts`, add:

```typescript
describe('Available from Known Civs section (S9)', () => {
  it('section is hidden when player has no trade-routes tech', () => {
    const state = createMarketplaceState({ hasTradeTech: false, knownCivHasResource: true });
    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const section = container.querySelector('[data-section="known-civs"]');
    expect(section).toBeNull();
  });

  it('section is visible when player has trade-routes tech and a known civ has a resource', () => {
    const state = createMarketplaceState({ hasTradeTech: true, knownCivHasResource: true });
    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const section = container.querySelector('[data-section="known-civs"]');
    expect(section).not.toBeNull();
  });

  it('shows "⚔️ Unavailable — at war" row for hostile civs', () => {
    const state = createMarketplaceState({ hasTradeTech: true, knownCivHasResource: true, atWar: true });
    createMarketplacePanel(container, state, { onClose: vi.fn() });

    const warText = container.querySelector('[data-section="known-civs"]')?.textContent;
    expect(warText).toContain('at war');
  });

  it('buy button calls performEmergencyImport and refreshes the panel', () => {
    const state = createMarketplaceState({ hasTradeTech: true, knownCivHasResource: true, atWar: false });
    let capturedState = state;
    createMarketplacePanel(container, state, {
      onClose: vi.fn(),
      onStateChange: (newState) => { capturedState = newState; },
    });

    const buyBtn = container.querySelector('[data-buy-resource-btn]') as HTMLButtonElement | null;
    expect(buyBtn).not.toBeNull();
    buyBtn?.click();

    // Gold should have been deducted
    expect(capturedState.civilizations['player'].gold).toBeLessThan(state.civilizations['player'].gold);
  });
});
```

- [ ] **Step 2: Implement the "Available from Known Civs" section**

In `src/ui/marketplace-panel.ts`, find where the panel content is built (after the "Your Resources" summary). Add the new section. The section is conditional on `trade-routes` tech:

```typescript
  // --- Available from Known Civs section (S9) ---
  const hasTradeTech = viewerTechs.has('trade-routes');

  if (hasTradeTech) {
    const section = document.createElement('div');
    section.dataset.section = 'known-civs';
    section.style.cssText = 'margin-top:16px;';

    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:14px;font-weight:bold;color:#e8c170;margin-bottom:8px;';
    heading.textContent = '🌐 Available from Known Civilizations';
    section.appendChild(heading);

    // Determine met civs via relationships map (NOT global knownCivilizations)
    const metCivIds = Object.keys(
      civ?.diplomacy?.relationships ?? {},
    ).filter(id => state.civilizations[id]);

    if (metCivIds.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px;opacity:0.6;';
      empty.textContent = 'Meet other civilizations to see their resources.';
      section.appendChild(empty);
    } else {
      for (const sellerId of metCivIds) {
        const sellerResources = getCivAvailableResources(state, sellerId);
        const atWar = isAtWar(civ.diplomacy, sellerId);
        const sellerCiv = state.civilizations[sellerId];
        const relScore = civ.diplomacy.relationships[sellerId] ?? 0;
        const relLabel = relScore >= 20 ? 'Friendly' : relScore >= -10 ? 'Neutral' : 'Hostile';

        for (const resourceId of sellerResources) {
          // Skip if player already has this resource
          if (ownedResources.has(resourceId)) continue;

          const def = RESOURCE_DEFINITIONS.find(d => d.id === resourceId);
          if (!def) continue;

          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:6px;';

          // Resource name + icon
          const resourceLabel = document.createElement('span');
          resourceLabel.textContent = `${def.icon} ${def.name}`;
          resourceLabel.style.cssText = 'flex:1;font-size:13px;';
          row.appendChild(resourceLabel);

          // Civ name + colour chip
          const civLabel = document.createElement('span');
          civLabel.style.cssText = `font-size:12px;padding:2px 6px;border-radius:4px;background:${sellerCiv.color};color:#fff;`;
          civLabel.textContent = sellerCiv.name;
          row.appendChild(civLabel);

          // Diplomatic relationship
          const relEl = document.createElement('span');
          relEl.style.cssText = 'font-size:11px;opacity:0.7;';
          relEl.textContent = relLabel;
          row.appendChild(relEl);

          if (atWar) {
            const warEl = document.createElement('span');
            warEl.style.cssText = 'font-size:12px;color:#e05252;';
            warEl.textContent = `⚔️ Unavailable — at war with ${sellerCiv.name}`;
            row.appendChild(warEl);
          } else if (relScore < 0) {
            const hostileEl = document.createElement('span');
            hostileEl.style.cssText = 'font-size:12px;opacity:0.5;';
            hostileEl.textContent = 'Hostile — improve relations first';
            row.appendChild(hostileEl);
          } else {
            const cost = def.basePrice * 3;
            const buyBtn = createGameButton(`Buy Access (${cost} gold / 10 turns)`, 'primary');
            buyBtn.dataset.buyResourceBtn = 'true';
            buyBtn.style.fontSize = '12px';
            buyBtn.style.padding = '4px 12px';
            buyBtn.addEventListener('click', () => {
              const newState = performEmergencyImport(state, state.currentPlayer, sellerId, resourceId as ResourceType);
              if (callbacks.onStateChange) callbacks.onStateChange(newState);
              // Refresh panel
              panel.remove();
              createMarketplacePanel(container, newState, callbacks);
            });
            row.appendChild(buyBtn);
          }

          section.appendChild(row);
        }
      }
    }

    panel.appendChild(section);
  }
```

Also add the necessary imports:
```typescript
import { performEmergencyImport } from '@/systems/trade-system';
import { isAtWar } from '@/systems/diplomacy-system';
```

And extend the `MarketplaceCallbacks` interface:
```typescript
interface MarketplaceCallbacks {
  onClose: () => void;
  onSelectUnit?: (unitId: string) => void;
  onStateChange?: (newState: GameState) => void;
}
```

- [ ] **Step 3: Run the panel tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/marketplace-panel.test.ts 2>&1 | grep -E "PASS|FAIL|Known Civs"
```
Expected: All 4 section tests pass.

- [ ] **Step 4: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 5: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/marketplace-panel.ts tests/ui/marketplace-panel.test.ts
git commit -m "feat(marketplace): Available from Known Civs section — S9 buy resource for 10 turns"
```
