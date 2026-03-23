# Milestone 2c "Living Economy" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dynamic trade system with resource marketplace, procedural era music, advisor system (Chancellor & War Chief), and multiple save slots.

**Architecture:** Trade system manages resource prices, supply/demand, and trade routes as pure functions. Music generator uses Web Audio API for procedural ambient tracks per era. Tutorial system is generalized into an advisor framework with condition-based messages. Save manager expands from single auto-save to named slots with metadata.

**Tech Stack:** TypeScript, Vitest, Web Audio API, IndexedDB

**Prerequisites:** M2b complete (178 tests, 21 files, 6 civs, diplomacy, AI overhaul)

**Setup:** Run `eval "$(mise activate bash)"` before any yarn/node commands.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/systems/trade-system.ts` | Resource definitions, pricing, trade routes, monopoly detection |
| `src/audio/music-generator.ts` | Procedural music generation via Web Audio API |
| `src/ui/advisor-system.ts` | Advisor framework with Chancellor & War Chief (replaces tutorial.ts) |
| `src/ui/marketplace-panel.ts` | Marketplace UI with prices, sparklines, routes |
| `src/ui/save-panel.ts` | Save/load screen with slot management |
| `tests/systems/trade-system.test.ts` | Trade system tests |
| `tests/ui/advisor-system.test.ts` | Advisor system tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/core/types.ts` | Add MarketplaceState, TradeRoute, ResourceType, AdvisorType, SaveSlotMeta; expand GameState |
| `src/core/game-state.ts` | Initialize marketplace state |
| `src/core/turn-manager.ts` | Process trade income, price recalculation, advisor checks |
| `src/systems/map-generator.ts` | Place resources on terrain |
| `src/storage/db.ts` | Add dbGetAllKeys for listing saves |
| `src/storage/save-manager.ts` | Multi-slot API (listSaves, saveGame, loadGame, deleteGame) |
| `src/audio/audio-manager.ts` | Era-based procedural music playback |
| `src/main.ts` | Save panel on start, marketplace button, advisor integration |

---

## Task 1: Types for Trade, Advisors, Saves

**Files:** Modify `src/core/types.ts`

- [ ] **Step 1: Add trade/marketplace types**

After the DiplomacyState block, add:

```typescript
// --- Trade & Resources ---

export type LuxuryResource = 'silk' | 'wine' | 'spices' | 'gems' | 'ivory' | 'incense';
export type StrategicResource = 'copper' | 'iron' | 'horses' | 'stone';
export type ResourceType = LuxuryResource | StrategicResource;

export interface TradeRoute {
  fromCityId: string;
  toCityId: string;
  goldPerTurn: number;
  foreignCivId?: string;    // if route is to foreign city
}

export interface MarketplaceState {
  prices: Record<ResourceType, number>;
  priceHistory: Record<ResourceType, number[]>;  // last 20 turns
  fashionable: ResourceType | null;
  fashionTurnsLeft: number;
  tradeRoutes: TradeRoute[];
}

// --- Advisors ---

export type AdvisorType = 'builder' | 'explorer' | 'chancellor' | 'warchief';

// --- Save Slots ---

export interface SaveSlotMeta {
  id: string;
  name: string;
  civType: string;
  turn: number;
  lastPlayed: string;    // ISO date string
}
```

Add `marketplace` to GameState (optional for backward compat):

```typescript
export interface GameState {
  // ... existing fields ...
  marketplace?: MarketplaceState;
}
```

Add `advisorSettings` to GameSettings:

```typescript
export interface GameSettings {
  // ... existing fields ...
  advisorsEnabled: Record<AdvisorType, boolean>;
}
```

Add new events:

```typescript
  'advisor:message': { advisor: AdvisorType; message: string; icon: string };
  'trade:route-created': { route: TradeRoute };
  'trade:price-changed': { resource: ResourceType; oldPrice: number; newPrice: number };
```

- [ ] **Step 2: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(m2c): add trade, advisor, and save slot types"
```

---

## Task 2: Trade System

**Files:**
- Create: `src/systems/trade-system.ts`
- Create: `tests/systems/trade-system.test.ts`

- [ ] **Step 1: Write failing tests**

Test: resource definitions, base prices, price calculation with supply/demand, monopoly detection, fashion cycles, trade route gold calculation.

- [ ] **Step 2: Implement trade-system.ts**

Exports: `RESOURCE_DEFINITIONS`, `BASE_PRICES`, `calculatePrice`, `detectMonopoly`, `calculateTradeRouteGold`, `updatePrices`, `createMarketplaceState`, `processFashionCycle`.

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

---

## Task 3: Resource Placement on Map

**Files:**
- Modify: `src/systems/map-generator.ts`

- [ ] **Step 1: Add resource placement after terrain generation**

Place resources on appropriate terrain tiles: silk on grassland, wine on plains, spices on jungle, gems on hills, ivory on forest, incense on desert, copper/iron on hills, horses on plains, stone near mountains. ~15% of eligible tiles get a resource.

- [ ] **Step 2: Run existing map-generator tests + add resource test**
- [ ] **Step 3: Commit**

---

## Task 4: Trade Processing in Turn Manager

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/core/game-state.ts`

- [ ] **Step 1: Initialize marketplace in createNewGame**
- [ ] **Step 2: Process trade routes and update prices each turn in processTurn**
- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

---

## Task 5: Marketplace Panel UI

**Files:**
- Create: `src/ui/marketplace-panel.ts`

- [ ] **Step 1: Create marketplace panel showing resource prices, player inventory, active routes**
- [ ] **Step 2: Commit**

---

## Task 6: Procedural Music Generator

**Files:**
- Create: `src/audio/music-generator.ts`
- Modify: `src/audio/audio-manager.ts`

- [ ] **Step 1: Create music-generator.ts with Web Audio API procedural tracks**

4 era palettes (tribal, stone, bronze, iron). Each generates oscillator-based ambient music with era-appropriate tones. Returns an AudioNode that can be connected to output.

- [ ] **Step 2: Update audio-manager.ts to support procedural music playback**

Add `playProceduralMusic(era: number)` and cross-fade on era change.

- [ ] **Step 3: Commit**

---

## Task 7: Advisor System

**Files:**
- Create: `src/ui/advisor-system.ts` (replaces tutorial.ts, keeps backward compat)
- Create: `tests/ui/advisor-system.test.ts`

- [ ] **Step 1: Write failing tests**

Test: advisor message triggers for chancellor (hostile civ warning, alliance opportunity), warchief (enemy near border, undefended city), plus existing builder/explorer tutorial messages.

- [ ] **Step 2: Implement advisor-system.ts**

Generalize TutorialSystem into AdvisorSystem. Keep all existing tutorial messages as builder/explorer advisors. Add chancellor and warchief advisors with new condition-based rules.

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

---

## Task 8: Multi-Slot Save System

**Files:**
- Modify: `src/storage/db.ts`
- Modify: `src/storage/save-manager.ts`

- [ ] **Step 1: Add dbGetAllKeys to db.ts**
- [ ] **Step 2: Expand save-manager with listSaves, saveGame, loadGame, deleteGame, renameSave**
- [ ] **Step 3: Commit**

---

## Task 9: Save/Load Panel UI

**Files:**
- Create: `src/ui/save-panel.ts`

- [ ] **Step 1: Create save panel with slot cards, New Game button, Continue button**
- [ ] **Step 2: Commit**

---

## Task 10: Main.ts Integration

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add marketplace button to bottom bar**
- [ ] **Step 2: Show save panel on start instead of direct auto-load**
- [ ] **Step 3: Integrate advisor system (check each turn)**
- [ ] **Step 4: Trigger procedural music on era change**
- [ ] **Step 5: Run build, verify pass**
- [ ] **Step 6: Commit**

---

## Task 11: Integration Test & Push

- [ ] **Step 1: Run full test suite**
- [ ] **Step 2: Run production build**
- [ ] **Step 3: Push to remote**
