# Resource Accessibility MR5 — Diplomatic Marketplace (Pillar 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Available from Known Civs" section in the Marketplace panel — players who have researched Trade Routes can spend gold to buy 10-turn access to resources owned by civilisations they've met.

**Architecture:** Six layers of change in dependency order: (1) type model (`purchasedResources` field in `MarketplaceState`), (2) third pass in `getCivAvailableResources`, (3) `canBuyResourceAccess` + `performBuyResourceAccess` in `resource-acquisition-system.ts` (NOT `trade-system.ts` — avoids a circular import; `resource-acquisition-system.ts` already imports from `trade-system.ts`), (4) expiry cleanup in `turn-manager.ts`, (5) pure UI section `buildKnownCivResourceSection` in `marketplace-panel.ts`, (6) module-level `openMarketplacePanel` in `main.ts` (mirrors the existing `openDiplomacyPanel` pattern).

**Tech Stack:** TypeScript, DOM, vitest (jsdom for UI tests).

---

## Files

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/core/types.ts:926–932` | Add `PurchasedResourceEntry` interface + `purchasedResources?` to `MarketplaceState` |
| Modify | `src/systems/trade-system.ts:68–74` | Update `createMarketplaceState()` to include `purchasedResources: []` |
| Modify | `src/systems/resource-acquisition-system.ts` | Add third pass + `canBuyResourceAccess` + `performBuyResourceAccess` |
| Modify | `src/core/turn-manager.ts` | Add expiry cleanup before per-civ loop |
| Modify | `src/ui/marketplace-panel.ts` | Add `buildKnownCivResourceSection` + `onBuyResourceAccess` callback |
| Modify | `src/main.ts` | Extract module-level `openMarketplacePanel`, wire `onBuyResourceAccess` |
| Modify | `tests/systems/resource-acquisition-system.test.ts` | Third-pass tests + buy-access tests |
| Modify | `tests/core/turn-manager.test.ts` | Expiry cleanup test |
| Modify | `tests/ui/marketplace-panel.test.ts` | Known-civs UI section tests |

---

## Task 1: Add `purchasedResources` to `MarketplaceState`

**Files:**
- Modify: `src/core/types.ts:926–932`
- Modify: `src/systems/trade-system.ts:68–74`

No failing tests first — this is a data-model change; downstream tasks provide coverage.

- [ ] **Step 1: Add `PurchasedResourceEntry` interface and `purchasedResources?` field in types.ts**

Current block (lines 926–932):
```typescript
export interface MarketplaceState {
  prices: Record<string, number>;
  priceHistory: Record<string, number[]>;
  fashionable: ResourceType | null;
  fashionTurnsLeft: number;
  tradeRoutes: TradeRoute[];
}
```

Replace with:
```typescript
export interface PurchasedResourceEntry {
  civId: string;          // hot-seat: which civ made the purchase
  resource: ResourceType;
  expiresOnTurn: number;  // = state.turn + 10 at time of purchase
}

export interface MarketplaceState {
  prices: Record<string, number>;
  priceHistory: Record<string, number[]>;
  fashionable: ResourceType | null;
  fashionTurnsLeft: number;
  tradeRoutes: TradeRoute[];
  purchasedResources?: PurchasedResourceEntry[];  // optional; defaults to [] for old saves
}
```

- [ ] **Step 2: Update `createMarketplaceState()` in trade-system.ts**

Current return value (lines 68–74):
```typescript
  return {
    prices,
    priceHistory,
    fashionable: null,
    fashionTurnsLeft: 0,
    tradeRoutes: [],
  };
```

Replace with:
```typescript
  return {
    prices,
    priceHistory,
    fashionable: null,
    fashionTurnsLeft: 0,
    tradeRoutes: [],
    purchasedResources: [],
  };
```

- [ ] **Step 3: Build to verify no type errors**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: `built in` with no `error TS` lines.

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/systems/trade-system.ts
git commit -m "feat(types): add PurchasedResourceEntry + purchasedResources field to MarketplaceState"
```

---

## Task 2: Third pass + buy-access functions in `resource-acquisition-system.ts`

**Files:**
- Modify: `tests/systems/resource-acquisition-system.test.ts`
- Modify: `src/systems/resource-acquisition-system.ts`

These go in `resource-acquisition-system.ts`, not `trade-system.ts`. Reason: `resource-acquisition-system.ts` already imports from `trade-system.ts`; putting the new functions there avoids a circular import (trade-system.ts line 323 even has a comment acknowledging this constraint).

- [ ] **Step 1: Write failing tests — third pass (purchased resources)**

In `tests/systems/resource-acquisition-system.test.ts`, add a new `describe` block after the existing ones:

```typescript
describe('getCivAvailableResources — pass 3: purchased resources', () => {
  function makeStateWithPurchase(overrides: {
    civId?: string;
    resource?: string;
    expiresOnTurn?: number;
    currentTurn?: number;
    completed?: string[];
    noMarketplace?: boolean;
  }): GameState {
    const {
      civId = 'player',
      resource = 'silk',
      expiresOnTurn = 15,
      currentTurn = 10,
      completed = ['irrigation'],  // silk requires 'irrigation'
      noMarketplace = false,
    } = overrides;

    return {
      turn: currentTurn,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      cities: {},
      civilizations: {
        'player': {
          id: 'player',
          cities: [],
          techState: { completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        } as unknown as never,
      },
      marketplace: noMarketplace ? undefined : {
        prices: {},
        priceHistory: {},
        fashionable: null,
        fashionTurnsLeft: 0,
        tradeRoutes: [],
        purchasedResources: [{ civId, resource: resource as never, expiresOnTurn }],
      },
    } as unknown as GameState;
  }

  it('grants resource when purchasedResources entry matches civId and has not expired', () => {
    const state = makeStateWithPurchase({ civId: 'player', expiresOnTurn: 15, currentTurn: 10 });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(true);
  });

  it('does NOT grant resource when purchasedResources entry belongs to a different civ (hot-seat isolation)', () => {
    const state = makeStateWithPurchase({ civId: 'enemy', expiresOnTurn: 15, currentTurn: 10 });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });

  it('does NOT grant resource when purchasedResources entry has expired (expiresOnTurn <= state.turn)', () => {
    const state = makeStateWithPurchase({ civId: 'player', expiresOnTurn: 10, currentTurn: 10 });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });

  it('does NOT crash and returns empty set when marketplace is absent (old save without purchasedResources)', () => {
    const state = makeStateWithPurchase({ civId: 'player', expiresOnTurn: 15, currentTurn: 10, noMarketplace: true });
    const result = getCivAvailableResources(state, 'player');
    expect(result.has('silk')).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing tests — `canBuyResourceAccess` + `performBuyResourceAccess`**

In `tests/systems/resource-acquisition-system.test.ts`, add a second new `describe` block (after the pass-3 block above):

```typescript
describe('canBuyResourceAccess', () => {
  // iron: tech='bronze-working', basePrice=8, requiredImprovement='mine'
  function makeBuyState(overrides: {
    buyerGold?: number;
    sellerHasResource?: boolean;
    buyerAlreadyOwns?: boolean;
    atWar?: boolean;
    relationshipScore?: number;
    metSeller?: boolean;
  }): GameState {
    const {
      buyerGold = 100,
      sellerHasResource = true,
      buyerAlreadyOwns = false,
      atWar = false,
      relationshipScore = 10,
      metSeller = true,
    } = overrides;

    const ironTileKey = '5,5';
    const tiles: Record<string, unknown> = {
      '0,0': {
        coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
        resource: null, improvement: 'none', improvementTurnsLeft: 0,
        hasRiver: false, wonder: null, owner: 'buyer',
      },
    };
    if (sellerHasResource) {
      tiles[ironTileKey] = {
        coord: { q: 5, r: 5 }, terrain: 'hills', elevation: 'lowland',
        resource: 'iron', improvement: 'mine', improvementTurnsLeft: 0,
        hasRiver: false, wonder: null, owner: 'seller',
      };
    }

    // Build buyer diplomacy inline (avoids incorrect createDiplomacyState call)
    const buyerDiplomacy = {
      relationships: metSeller ? { seller: relationshipScore } : {} as Record<string, number>,
      treaties: [],
      events: [],
      atWarWith: atWar ? ['seller'] : [] as string[],
      treacheryScore: 0,
      vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
    };

    const prices: Record<string, number> = {};
    const priceHistory: Record<string, number[]> = {};
    for (const r of RESOURCE_DEFINITIONS) { prices[r.id] = r.basePrice; priceHistory[r.id] = [r.basePrice]; }

    return {
      turn: 5,
      map: { width: 20, height: 20, tiles, wrapsHorizontally: false, rivers: [] },
      cities: {
        'buyer-city': {
          id: 'buyer-city', owner: 'buyer', position: { q: 0, r: 0 },
          ownedTiles: buyerAlreadyOwns ? [{ q: 5, r: 5 }] : [{ q: 0, r: 0 }],
          workedTiles: [], population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
        'seller-city': {
          id: 'seller-city', owner: 'seller', position: { q: 5, r: 5 },
          ownedTiles: sellerHasResource ? [{ q: 5, r: 5 }] : [],
          workedTiles: [], population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
      },
      civilizations: {
        buyer: {
          id: 'buyer', cities: ['buyer-city'], units: [], gold: buyerGold,
          techState: { completed: ['bronze-working', 'trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: buyerDiplomacy,
        } as unknown as never,
        seller: {
          id: 'seller', cities: ['seller-city'], units: [], gold: 0,
          techState: { completed: ['bronze-working'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: atWar ? ['buyer'] : [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        } as unknown as never,
      },
      marketplace: {
        prices, priceHistory, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], purchasedResources: [],
      },
    } as unknown as GameState;
  }

  it('returns true when all conditions are met', () => {
    expect(canBuyResourceAccess(makeBuyState({}), 'buyer', 'seller', 'iron')).toBe(true);
  });

  it('returns false when at war', () => {
    expect(canBuyResourceAccess(makeBuyState({ atWar: true }), 'buyer', 'seller', 'iron')).toBe(false);
  });

  it('returns false when relationship score is negative', () => {
    expect(canBuyResourceAccess(makeBuyState({ relationshipScore: -5 }), 'buyer', 'seller', 'iron')).toBe(false);
  });

  it('returns false when seller is not in buyer relationships (never met)', () => {
    expect(canBuyResourceAccess(makeBuyState({ metSeller: false }), 'buyer', 'seller', 'iron')).toBe(false);
  });

  it('returns false when seller does not have the resource', () => {
    expect(canBuyResourceAccess(makeBuyState({ sellerHasResource: false }), 'buyer', 'seller', 'iron')).toBe(false);
  });

  it('returns false when buyer already owns the resource', () => {
    expect(canBuyResourceAccess(makeBuyState({ buyerAlreadyOwns: true }), 'buyer', 'seller', 'iron')).toBe(false);
  });
});

describe('performBuyResourceAccess', () => {
  function makeBuyStateForPerform(): GameState {
    const prices: Record<string, number> = {};
    const priceHistory: Record<string, number[]> = {};
    for (const r of RESOURCE_DEFINITIONS) { prices[r.id] = r.basePrice; priceHistory[r.id] = [r.basePrice]; }

    return {
      turn: 5,
      map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
      cities: {},
      civilizations: {
        buyer: {
          id: 'buyer', cities: [], units: [], gold: 100,
          techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        } as unknown as never,
      },
      marketplace: { prices, priceHistory, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], purchasedResources: [] },
    } as unknown as GameState;
  }

  it('deducts 3× basePrice gold from the buyer immediately (iron basePrice=8 → cost=24)', () => {
    const state = makeBuyStateForPerform();
    const newState = performBuyResourceAccess(state, 'buyer', 'seller', 'iron');
    expect(newState.civilizations['buyer'].gold).toBe(76); // 100 - 24
  });

  it('adds purchasedResources entry with correct civId, resource, and expiresOnTurn = turn + 10', () => {
    const state = makeBuyStateForPerform();
    const newState = performBuyResourceAccess(state, 'buyer', 'seller', 'iron');
    const entries = newState.marketplace!.purchasedResources ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ civId: 'buyer', resource: 'iron', expiresOnTurn: 15 }); // 5 + 10
  });

  it('does not mutate the original state (immutable spread-copy)', () => {
    const state = makeBuyStateForPerform();
    performBuyResourceAccess(state, 'buyer', 'seller', 'iron');
    expect(state.civilizations['buyer'].gold).toBe(100);
    expect(state.marketplace!.purchasedResources).toHaveLength(0);
  });

  it('returns state unchanged when marketplace is absent', () => {
    const state = makeBuyStateForPerform();
    (state as unknown as Record<string, unknown>).marketplace = undefined;
    const newState = performBuyResourceAccess(state, 'buyer', 'seller', 'iron');
    expect(newState.civilizations['buyer'].gold).toBe(100); // gold unchanged
  });
});
```

- [ ] **Step 3: Run to confirm failures**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/resource-acquisition-system.test.ts 2>&1 | grep -E "FAIL|pass 3|canBuyResourceAccess|performBuyResourceAccess"
```
Expected: all new tests fail.

- [ ] **Step 4: Implement the third pass in `resource-acquisition-system.ts`**

In `src/systems/resource-acquisition-system.ts`, update the imports at the top:

```typescript
import type { GameState, ResourceType, ResourceYield, PurchasedResourceEntry } from '@/core/types';
import { hexKey } from './hex-utils';
import { RESOURCE_DEFINITIONS } from './trade-system';
import { isAtWar } from './diplomacy-system';
```

Then, in `getCivAvailableResources`, after the existing Pass 2 block (after the closing `}` of the tile loop, before `return result`):

```typescript
  // Pass 3 — purchased resource access (Diplomatic Marketplace / S9)
  // Entries are cleaned up by the turn-manager; this pass just reads what remains.
  for (const entry of (state.marketplace?.purchasedResources ?? [])) {
    if (entry.civId !== civId) continue;
    if (entry.expiresOnTurn <= (state as unknown as { turn: number }).turn) continue;

    const def = resourceDefMap.get(entry.resource);
    if (!def) continue;
    if (!completedTechs.has(def.tech)) continue;

    result.add(entry.resource);
  }
```

Note: `state.turn` is typed on `GameState` — but `getCivAvailableResources` receives `state: GameState`. Since `GameState` has `turn: number` (confirmed in types.ts), we can access `state.turn` directly without a cast. Use `state.turn` directly:

```typescript
  // Pass 3 — purchased resource access (Diplomatic Marketplace / S9)
  for (const entry of (state.marketplace?.purchasedResources ?? [])) {
    if (entry.civId !== civId) continue;
    if (entry.expiresOnTurn <= state.turn) continue;

    const def = resourceDefMap.get(entry.resource);
    if (!def) continue;
    if (!completedTechs.has(def.tech)) continue;

    result.add(entry.resource);
  }
```

- [ ] **Step 5: Implement `canBuyResourceAccess` and `performBuyResourceAccess` in `resource-acquisition-system.ts`**

Append at the bottom of `src/systems/resource-acquisition-system.ts`:

```typescript
/**
 * Returns true when a buyer civ can purchase 10-turn resource access from a seller civ.
 *
 * All conditions must hold:
 *   1. Seller is in buyer's diplomacy.relationships (civs have met).
 *   2. Not at war.
 *   3. Relationship score >= 0.
 *   4. Seller has the resource (getCivAvailableResources).
 *   5. Buyer does NOT already own the resource.
 */
export function canBuyResourceAccess(
  state: GameState,
  buyerCivId: string,
  sellerCivId: string,
  resource: ResourceType,
): boolean {
  const buyer = state.civilizations[buyerCivId];
  if (!buyer) return false;

  // Must have met the seller (key present in relationships map)
  if (!(sellerCivId in buyer.diplomacy.relationships)) return false;

  // Not at war
  if (isAtWar(buyer.diplomacy, sellerCivId)) return false;

  // Relationship score must be >= 0
  const score = buyer.diplomacy.relationships[sellerCivId] ?? -100;
  if (score < 0) return false;

  // Seller must have the resource
  const sellerResources = getCivAvailableResources(state, sellerCivId);
  if (!sellerResources.has(resource)) return false;

  // Buyer must not already own it
  const buyerResources = getCivAvailableResources(state, buyerCivId);
  if (buyerResources.has(resource)) return false;

  return true;
}

/**
 * Deducts 3× basePrice gold from the buyer and adds a 10-turn purchasedResources entry.
 * Precondition: canBuyResourceAccess(state, buyerCivId, sellerCivId, resource) === true.
 * Returns a new GameState (immutable spread-copy). Returns state unchanged if marketplace absent.
 */
export function performBuyResourceAccess(
  state: GameState,
  buyerCivId: string,
  sellerCivId: string,
  resource: ResourceType,
): GameState {
  if (!state.marketplace) return state;

  const def = RESOURCE_DEFINITIONS.find(d => d.id === resource);
  const cost = (def?.basePrice ?? 5) * 3;

  const buyer = state.civilizations[buyerCivId];
  if (!buyer) return state;

  const newEntry: PurchasedResourceEntry = {
    civId: buyerCivId,
    resource,
    expiresOnTurn: state.turn + 10,
  };

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [buyerCivId]: { ...buyer, gold: buyer.gold - cost },
    },
    marketplace: {
      ...state.marketplace,
      purchasedResources: [...(state.marketplace.purchasedResources ?? []), newEntry],
    },
  };
}
```

- [ ] **Step 6: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/resource-acquisition-system.test.ts 2>&1 | grep -E "PASS|FAIL|pass 3|canBuyResourceAccess|performBuyResourceAccess"
```
Expected: all new tests pass.

- [ ] **Step 7: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/systems/resource-acquisition-system.ts tests/systems/resource-acquisition-system.test.ts
git commit -m "feat(resources): getCivAvailableResources pass 3 + canBuyResourceAccess + performBuyResourceAccess"
```

---

## Task 3: Purchased resource expiry cleanup in turn-manager

**Files:**
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `src/core/turn-manager.ts`

- [ ] **Step 1: Write failing test**

In `tests/core/turn-manager.test.ts`, add inside the main `describe` block (near the outpost-upkeep test around line 833):

```typescript
it('cleans up expired purchasedResources entries at the start of each turn (expiresOnTurn <= state.turn)', () => {
  const state = createNewGame(undefined, 'purchased-expiry-test', 'small');
  const bus = new EventBus();

  // state.turn starts at 1 for a new game
  state.marketplace = {
    ...(state.marketplace ?? { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [] }),
    purchasedResources: [
      { civId: 'player', resource: 'silk' as never, expiresOnTurn: state.turn },      // = 1 → expires this turn
      { civId: 'player', resource: 'wine' as never, expiresOnTurn: state.turn + 5 },  // = 6 → still active
    ],
  };

  const result = processTurn(state, bus);

  const remaining = result.marketplace?.purchasedResources ?? [];
  expect(remaining.some(e => e.resource === 'silk')).toBe(false); // expired → removed
  expect(remaining.some(e => e.resource === 'wine')).toBe(true);  // active → kept
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/core/turn-manager.test.ts 2>&1 | grep -E "FAIL|purchased.*expiry|silk.*wine"
```
Expected: new test fails.

- [ ] **Step 3: Add expiry cleanup to `processTurn` in turn-manager.ts**

In `src/core/turn-manager.ts`, right before `for (const [civId, civ] of Object.entries(newState.civilizations))` (around line 78, after `tickOccupiedCities`):

```typescript
  // Clean up expired purchased-resource entries (Diplomatic Marketplace / S9)
  if (newState.marketplace?.purchasedResources?.length) {
    newState.marketplace = {
      ...newState.marketplace,
      purchasedResources: newState.marketplace.purchasedResources.filter(
        e => e.expiresOnTurn > newState.turn,
      ),
    };
  }
```

- [ ] **Step 4: Run test**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/core/turn-manager.test.ts 2>&1 | grep -E "PASS|FAIL|purchased.*expiry|silk.*wine"
```
Expected: passes.

- [ ] **Step 5: Full suite + build**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -5 && bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/turn-manager.ts tests/core/turn-manager.test.ts
git commit -m "feat(turn-manager): expire purchasedResources entries each turn"
```

---

## Task 4: "Available from Known Civs" UI section in marketplace-panel.ts

**Files:**
- Modify: `tests/ui/marketplace-panel.test.ts`
- Modify: `src/ui/marketplace-panel.ts`

The section is rendered by a private helper `buildKnownCivResourceSection`. It is entirely absent (not empty) when `trade-routes` is not researched. All text uses `textContent`/`createTextNode()`; all buttons use `createGameButton()`.

- [ ] **Step 1: Write failing tests**

At the end of `tests/ui/marketplace-panel.test.ts`, after the last `it(...)` in the main describe block, add:

```typescript
  // ── Available from Known Civs section ─────────────────────────────────────
  // Helper that sets up a two-civ state where 'enemy' has iron that 'p1' lacks.
  // iron: tech='bronze-working', basePrice=8, requiredImprovement='mine', cost=24
  function buildStateWithKnownCiv(params: {
    playerTechs?: string[];
    playerGold?: number;
    knownCivHasResource?: boolean;
    atWar?: boolean;
    relationshipScore?: number;
    playerAlreadyOwns?: boolean;
  } = {}): GameState {
    const {
      playerTechs = ['bronze-working', 'trade-routes'],
      playerGold = 100,
      knownCivHasResource = true,
      atWar = false,
      relationshipScore = 10,
      playerAlreadyOwns = false,
    } = params;

    const ironTile = knownCivHasResource ? {
      '5,5': {
        coord: { q: 5, r: 5 }, terrain: 'hills', elevation: 'lowland',
        resource: 'iron', improvement: 'mine', improvementTurnsLeft: 0,
        hasRiver: false, wonder: null, owner: 'enemy',
      },
    } : {};

    return {
      turn: 5,
      currentPlayer: 'p1',
      marketplace: buildMarketState(),
      map: {
        tiles: {
          '0,0': {
            coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
            resource: null, improvement: 'none', improvementTurnsLeft: 0,
            hasRiver: false, wonder: null, owner: 'p1',
          },
          ...ironTile,
        },
        width: 20, height: 20, wrapsHorizontally: false, rivers: [],
      },
      cities: {
        'p1-city': {
          id: 'p1-city', owner: 'p1',
          position: { q: 0, r: 0 },
          ownedTiles: playerAlreadyOwns ? [{ q: 5, r: 5 }] : [{ q: 0, r: 0 }],
          workedTiles: [], population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
        'enemy-city': {
          id: 'enemy-city', owner: 'enemy',
          position: { q: 5, r: 5 },
          ownedTiles: knownCivHasResource ? [{ q: 5, r: 5 }] : [],
          workedTiles: [], population: 1, food: 0, production: 0, gold: 0,
          buildings: [], productionQueue: [], specialistSlots: [],
          garrisonUnitId: null, hp: 100, maxHp: 100,
        },
      },
      civilizations: {
        p1: {
          id: 'p1',
          cities: ['p1-city'], units: [], gold: playerGold,
          techState: { completed: playerTechs, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: {
            relationships: { enemy: relationshipScore },
            treaties: [], events: [],
            atWarWith: atWar ? ['enemy'] : [],
            treacheryScore: 0,
            vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
          },
          civType: 'egypt',
        } as unknown as never,
        enemy: {
          id: 'enemy',
          cities: ['enemy-city'], units: [], gold: 0,
          techState: { completed: ['bronze-working'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
          diplomacy: {
            relationships: {},
            treaties: [], events: [],
            atWarWith: atWar ? ['p1'] : [],
            treacheryScore: 0,
            vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
          },
          civType: 'rome',
        } as unknown as never,
      },
    } as unknown as GameState;
  }

  describe('Available from Known Civs section', () => {
    it('section is absent when player has not researched trade-routes', () => {
      const state = buildStateWithKnownCiv({ playerTechs: ['bronze-working'] });
      createMarketplacePanel(container, state, { onClose: vi.fn() });
      expect(container.querySelector('[data-section="known-civs"]')).toBeNull();
    });

    it('section is present when player has trade-routes and a known civ has a resource the player lacks', () => {
      const state = buildStateWithKnownCiv();
      createMarketplacePanel(container, state, { onClose: vi.fn() });
      expect(container.querySelector('[data-section="known-civs"]')).not.toBeNull();
    });

    it('buy button shows correct price (3× basePrice) and duration when conditions are met', () => {
      const state = buildStateWithKnownCiv();
      createMarketplacePanel(container, state, { onClose: vi.fn() });
      const section = container.querySelector('[data-section="known-civs"]') as HTMLElement;
      // iron basePrice=8, cost=24
      expect(section.textContent).toContain('24');
      expect(section.textContent).toContain('10 turns');
    });

    it('shows at-war text (no buy button) when at war', () => {
      const state = buildStateWithKnownCiv({ atWar: true });
      createMarketplacePanel(container, state, { onClose: vi.fn() });
      const section = container.querySelector('[data-section="known-civs"]') as HTMLElement;
      expect(section.textContent).toContain('at war');
      const buyBtn = section.querySelector('[data-buy-resource-btn]');
      expect(buyBtn).toBeNull();
    });

    it('shows "Already have" text (no buy button) when player already owns the resource', () => {
      const state = buildStateWithKnownCiv({ playerAlreadyOwns: true });
      createMarketplacePanel(container, state, { onClose: vi.fn() });
      const section = container.querySelector('[data-section="known-civs"]') as HTMLElement;
      expect(section.textContent).toContain('Already have');
      expect(section.querySelector('[data-buy-resource-btn]')).toBeNull();
    });

    it('calls onBuyResourceAccess with seller civ id and resource when Buy Access is clicked', () => {
      const state = buildStateWithKnownCiv();
      const onBuy = vi.fn();
      createMarketplacePanel(container, state, { onClose: vi.fn(), onBuyResourceAccess: onBuy });
      const buyBtn = container.querySelector('[data-buy-resource-btn]') as HTMLButtonElement;
      expect(buyBtn).not.toBeNull();
      buyBtn.click();
      expect(onBuy).toHaveBeenCalledWith('enemy', 'iron');
    });

    it('buy button is disabled when relationship score is negative', () => {
      const state = buildStateWithKnownCiv({ relationshipScore: -10 });
      createMarketplacePanel(container, state, { onClose: vi.fn() });
      const buyBtn = container.querySelector('[data-buy-resource-btn]') as HTMLButtonElement;
      expect(buyBtn).not.toBeNull();
      expect(buyBtn.disabled).toBe(true);
    });
  });
```

- [ ] **Step 2: Run to confirm failures**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/marketplace-panel.test.ts 2>&1 | grep -E "FAIL|Known Civs"
```
Expected: all 7 new tests fail.

- [ ] **Step 3: Update imports in marketplace-panel.ts**

Replace the current imports (lines 1–3):
```typescript
import type { GameState, ResourceType } from '@/core/types';
import { RESOURCE_DEFINITIONS, getEffectiveGoldPerTurn, getRouteCapacity } from '@/systems/trade-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
```

With:
```typescript
import type { GameState, ResourceType } from '@/core/types';
import { RESOURCE_DEFINITIONS, getEffectiveGoldPerTurn, getRouteCapacity } from '@/systems/trade-system';
import { getCivAvailableResources, canBuyResourceAccess } from '@/systems/resource-acquisition-system';
import { isAtWar } from '@/systems/diplomacy-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { createGameButton } from './ui-kit';
```

- [ ] **Step 4: Add `onBuyResourceAccess` to `MarketplaceCallbacks`**

Current interface (lines 4–7):
```typescript
interface MarketplaceCallbacks {
  onClose: () => void;
  onSelectUnit?: (unitId: string) => void;
}
```

Replace with:
```typescript
interface MarketplaceCallbacks {
  onClose: () => void;
  onSelectUnit?: (unitId: string) => void;
  onBuyResourceAccess?: (sellerCivId: string, resource: ResourceType) => void;
}
```

- [ ] **Step 5: Add `id="mp-known-civs-anchor"` to the panel HTML template**

In the `panel.innerHTML = \`...\`` template string, find `<div id="mp-routes-section" style="margin-top:16px;"></div>` and add the new anchor immediately after it (still inside the `max-width:500px` wrapper div):

```html
      <div id="mp-routes-section" style="margin-top:16px;"></div>
      <div id="mp-known-civs-anchor"></div>
```

- [ ] **Step 6: Add `buildKnownCivResourceSection` helper function**

After the closing `}` of `buildRouteListSection` (at the end of the file, before the final `}`), add:

```typescript
/**
 * Builds the "Available from Known Civs" section (Diplomatic Marketplace / Pillar 3 / S9).
 * Returns null when trade-routes is not researched, or when no rows to show.
 * All text via textContent; all buttons via createGameButton().
 */
function buildKnownCivResourceSection(
  state: GameState,
  currentPlayer: string,
  onBuyResourceAccess?: (sellerCivId: string, resource: ResourceType) => void,
): HTMLElement | null {
  const civ = state.civilizations[currentPlayer];
  if (!civ) return null;

  // Gate: only show after Trade Routes tech
  if (!civ.techState.completed.includes('trade-routes')) return null;

  const playerOwned = getCivAvailableResources(state, currentPlayer);
  const playerDip = civ.diplomacy;
  const knownCivIds = Object.keys(playerDip.relationships);
  if (knownCivIds.length === 0) return null;

  // Collect rows: resources a known civ has that the player lacks
  type Row = { sellerCivId: string; resource: ResourceType };
  const rows: Row[] = [];
  for (const sellerCivId of knownCivIds) {
    const sellerResources = getCivAvailableResources(state, sellerCivId);
    for (const def of RESOURCE_DEFINITIONS) {
      const resource = def.id as ResourceType;
      if (!sellerResources.has(resource)) continue;
      if (playerOwned.has(resource)) continue;
      rows.push({ sellerCivId, resource });
    }
  }
  if (rows.length === 0) return null;

  const section = document.createElement('div');
  section.dataset.section = 'known-civs';
  section.style.cssText = 'margin-top:16px;';

  const heading = document.createElement('div');
  heading.style.cssText = 'font-size:14px;color:#e8c170;margin-bottom:8px;';
  heading.textContent = 'Available from Known Civilizations';
  section.appendChild(heading);

  for (const { sellerCivId, resource } of rows) {
    const def = RESOURCE_DEFINITIONS.find(d => d.id === resource)!;
    const sellerCivDef = resolveCivDefinition(state, state.civilizations[sellerCivId]?.civType ?? '');
    const sellerName = sellerCivDef?.name ?? sellerCivId;
    const sellerColor = sellerCivDef?.color ?? '#888888';
    const score = playerDip.relationships[sellerCivId] ?? -100;
    const atWar = isAtWar(playerDip, sellerCivId);
    const cost = def.basePrice * 3;

    const row = document.createElement('div');
    row.style.cssText =
      'background:rgba(255,255,255,0.05);border-radius:6px;padding:8px 10px;' +
      'display:flex;align-items:center;gap:8px;margin-bottom:6px;min-height:44px;';

    const resLabel = document.createElement('span');
    resLabel.style.cssText = 'flex:1;font-size:13px;';
    resLabel.textContent = `${def.icon} ${def.name}`;
    row.appendChild(resLabel);

    const civChip = document.createElement('span');
    civChip.style.cssText =
      `background:${sellerColor};color:#000;border-radius:4px;` +
      'font-size:11px;padding:2px 6px;font-weight:bold;';
    civChip.textContent = sellerName;
    row.appendChild(civChip);

    const relBand = document.createElement('span');
    relBand.style.cssText = 'font-size:11px;opacity:0.7;min-width:52px;text-align:center;';
    relBand.textContent = atWar ? 'War' : score >= 30 ? 'Friendly' : score >= 0 ? 'Neutral' : 'Hostile';
    row.appendChild(relBand);

    if (atWar) {
      const warLabel = document.createElement('span');
      warLabel.style.cssText = 'font-size:11px;color:#f87171;';
      warLabel.textContent = `⚔️ at war with ${sellerName}`;
      row.appendChild(warLabel);
    } else if (playerOwned.has(resource)) {
      const ownedLabel = document.createElement('span');
      ownedLabel.style.cssText = 'font-size:11px;color:#6b9b4b;';
      ownedLabel.textContent = '✓ Already have this';
      row.appendChild(ownedLabel);
    } else {
      const canBuy = canBuyResourceAccess(state, currentPlayer, sellerCivId, resource);
      const buyBtn = createGameButton(`Buy (${cost}g / 10 turns)`, 'primary');
      buyBtn.dataset.buyResourceBtn = 'true';
      buyBtn.style.fontSize = '11px';
      buyBtn.style.padding = '4px 10px';
      buyBtn.style.minHeight = '36px';
      if (!canBuy) {
        buyBtn.disabled = true;
        buyBtn.style.opacity = '0.5';
      }
      buyBtn.addEventListener('click', () => {
        if (canBuy && onBuyResourceAccess) onBuyResourceAccess(sellerCivId, resource);
      });
      row.appendChild(buyBtn);
    }

    section.appendChild(row);
  }

  return section;
}
```

- [ ] **Step 7: Wire `buildKnownCivResourceSection` into `createMarketplacePanel`**

After the routes-section wiring block (after `routesSection.appendChild(buildRouteListSection(...))`, before `container.appendChild(panel)`), add:

```typescript
  // Known Civs section (Diplomatic Marketplace — S9, trade-routes tech gated)
  // Uses panel.querySelector to stay scoped to this panel instance
  const knownCivsAnchor = panel.querySelector('#mp-known-civs-anchor');
  if (knownCivsAnchor) {
    const knownCivsSection = buildKnownCivResourceSection(state, state.currentPlayer, callbacks.onBuyResourceAccess);
    if (knownCivsSection) knownCivsAnchor.appendChild(knownCivsSection);
  }
```

- [ ] **Step 8: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/marketplace-panel.test.ts 2>&1 | grep -E "PASS|FAIL|Known Civs"
```
Expected: all 7 new tests pass, no regressions.

- [ ] **Step 9: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/ui/marketplace-panel.ts tests/ui/marketplace-panel.test.ts
git commit -m "feat(ui): Available from Known Civs section in Marketplace (Diplomatic Marketplace / S9)"
```

---

## Task 5: Wire `onBuyResourceAccess` in main.ts + extract `openMarketplacePanel`

**Files:**
- Modify: `src/main.ts`

main.ts already imports from `resource-acquisition-system` at line 157:
```typescript
import { getCivHappinessFromResources, getCivAvailableResources, canEstablishOutpost, performEstablishOutpost } from '@/systems/resource-acquisition-system';
```

No new tests — coverage comes from the system tests. No `RESOURCE_DEFINITIONS` import needed; the notification uses the resource string directly.

- [ ] **Step 1: Extend the existing resource-acquisition-system import in main.ts**

Find line 157:
```typescript
import { getCivHappinessFromResources, getCivAvailableResources, canEstablishOutpost, performEstablishOutpost } from '@/systems/resource-acquisition-system';
```

Replace with:
```typescript
import { getCivHappinessFromResources, getCivAvailableResources, canEstablishOutpost, performEstablishOutpost, canBuyResourceAccess, performBuyResourceAccess } from '@/systems/resource-acquisition-system';
```

- [ ] **Step 2: Add module-level `openMarketplacePanel` function**

Find the existing `openDiplomacyPanel` function (around line 615):
```typescript
function openDiplomacyPanel(): void {
```

Add a new `openMarketplacePanel` function immediately after its closing `}`:

```typescript
function openMarketplacePanel(): void {
  document.getElementById('marketplace-panel')?.remove();
  createMarketplacePanel(uiLayer, gameState, {
    onClose: () => {},
    onSelectUnit: (unitId) => {
      document.getElementById('marketplace-panel')?.remove();
      selectUnit(unitId);
      const unit = gameState.units[unitId];
      if (unit) renderLoop.camera.centerOn(unit.position);
    },
    onBuyResourceAccess: (sellerCivId, resource) => {
      if (!canBuyResourceAccess(gameState, gameState.currentPlayer, sellerCivId, resource)) return;
      gameState = performBuyResourceAccess(gameState, gameState.currentPlayer, sellerCivId, resource);
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(`Purchased ${resource} access for 10 turns.`, 'success');
      openMarketplacePanel(); // re-render panel with updated state
    },
  });
}
```

- [ ] **Step 3: Replace the inline `createMarketplacePanel` call in `togglePanel` with `openMarketplacePanel()`**

Find (around line 1190):
```typescript
  } else if (panel === 'marketplace') {
    createMarketplacePanel(uiLayer, gameState, {
      onClose: () => {},
      onSelectUnit: (unitId) => {
        document.getElementById('marketplace-panel')?.remove();
        selectUnit(unitId);
        const unit = gameState.units[unitId];
        if (unit) renderLoop.camera.centerOn(unit.position);
      },
    });
  }
```

Replace with:
```typescript
  } else if (panel === 'marketplace') {
    openMarketplacePanel();
  }
```

- [ ] **Step 4: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: no errors.

- [ ] **Step 5: Full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): wire onBuyResourceAccess — extract openMarketplacePanel (mirrors openDiplomacyPanel pattern)"
```

---

## Self-Review Checklist

| Spec requirement | Task | Status |
|---|---|---|
| `PurchasedResourceEntry` type + `purchasedResources?` in `MarketplaceState` | 1 | ✓ |
| `createMarketplaceState()` initialises `purchasedResources: []` | 1 | ✓ |
| Third pass grants purchased resource when not expired + matching civId | 2 pass-3 | ✓ |
| Third pass: different civId → not granted (hot-seat isolation) | 2 pass-3 | ✓ |
| Third pass: expired → not granted | 2 pass-3 | ✓ |
| Old save (no `purchasedResources`) → no crash | 2 pass-3 | ✓ |
| `canBuyResourceAccess` blocked: at war | 2 buy-fn | ✓ |
| `canBuyResourceAccess` blocked: score < 0 | 2 buy-fn | ✓ |
| `canBuyResourceAccess` blocked: not met | 2 buy-fn | ✓ |
| `canBuyResourceAccess` blocked: seller lacks resource | 2 buy-fn | ✓ |
| `canBuyResourceAccess` blocked: buyer already owns | 2 buy-fn | ✓ |
| `performBuyResourceAccess`: deducts 3× basePrice | 2 buy-fn | ✓ |
| `performBuyResourceAccess`: `expiresOnTurn = turn + 10` | 2 buy-fn | ✓ |
| `performBuyResourceAccess`: immutable (no state mutation) | 2 buy-fn | ✓ |
| `performBuyResourceAccess`: safe when marketplace absent | 2 buy-fn | ✓ |
| Expiry cleanup in turn-manager | 3 | ✓ |
| Section absent when trade-routes not researched | 4 UI | ✓ |
| Section present when conditions met | 4 UI | ✓ |
| Buy button shows 3× basePrice cost and 10-turn duration | 4 UI | ✓ |
| At war → war text, no buy button | 4 UI | ✓ |
| Already owned → "Already have" text, no buy button | 4 UI | ✓ |
| Button click → `onBuyResourceAccess(sellerCivId, resource)` | 4 UI | ✓ |
| Button disabled when score < 0 | 4 UI | ✓ |
| `[data-buy-resource-btn]` for testability | 4 UI impl | ✓ |
| All text via `textContent`/`createTextNode()` | 4 UI impl | ✓ |
| All buttons via `createGameButton()` | 4 UI impl | ✓ |
| Uses `state.currentPlayer` — never hardcoded | 4 UI impl | ✓ |
| "Has met" check via `diplomacy.relationships` keys | 4 UI impl | ✓ |
| main.ts: `onBuyResourceAccess` → `performBuyResourceAccess` + re-render | 5 | ✓ |
| No circular dependency (`canBuyResourceAccess` in resource-acquisition-system, not trade-system) | arch | ✓ |
