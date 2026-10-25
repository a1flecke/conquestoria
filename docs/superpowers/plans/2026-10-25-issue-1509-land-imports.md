# MR12 — Land-Route Imports, Seller Controls, and Conservative AI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the land-route import path: one paid load at a permitted supplier, a persisted in-transit manifest, one delivery at home, live seller/buyer controls, conservative AI procurement, and loss/cancel/reload conservation.

**Architecture:** `resource-shipment-system.ts` owns the endpoint transitions and manifest; `resource-procurement.ts` owns shared target/budget/cargo arithmetic. The MR11 market engine gains an `incoming` settlement mode that reserves a claim instead of crediting usable stock. Route terms and manifests are optional persisted fields on `TradeRoute`; the route runner is the only live caller.

**Tech Stack:** TypeScript, Vitest, existing route runner/reserve ledger/MR11 market engine, jsdom panels, Playwright.

---

### Task 1: Manifest and procurement contracts

**Files:** `src/core/types/commerce.ts`, `src/core/types.ts`, `src/systems/unit-definitions.ts`, `src/systems/trade-role-targeting.ts`

- [x] Add `ResourceProcurementOrder`, `ResourceProcurementTerms`, `ResourceManifestItem`, `ResourceManifest`, and optional `roundBudget`/`spentThisTurn`.
- [x] Add optional `TradeRoute.procurement`/`manifest` and dedicated `UnitDefinition.tradeCapacity`; derive capacity through `getTradeCargoCapacity`, never troop `cargoCapacity`.

### Task 2: One load and one delivery

**Files:** `src/systems/resource-shipment-system.ts`, `src/systems/resource-procurement.ts`, `src/systems/resource-market-offers.ts`, `src/systems/trade-route-runner.ts`, `src/systems/trade-route-lifecycle.ts`, `src/systems/unit-removal-system.ts`

- [x] Add MR11 `commitMarketLoad` `incoming` settlement: reserve a receiving claim, pay seller/tariff, never credit usable imported stock.
- [x] Load every affordable order once at outbound arrival; cap by target, offer, shared cargo space, budget and treasury floor.
- [x] Deliver every claim exactly once at home; cancellation and endpoint loss return with cargo.
- [x] Permission revocation keeps a loaded route returning; carrier death destroys claims; the seller keeps payment.
- [x] Count stored + incoming toward the target, and share one round budget across routes.

### Task 3: Live controls and route presentation

**Files:** `src/ui/marketplace-panel.ts`, `src/ui/establish-route-panel.ts`, `src/ui/trade-route-presentation.ts`, `src/app/controllers/diplomacy-trade-panel-actions-controller.ts`, `src/app/controllers/diplomacy-actions-controller.ts`

- [x] Seller policy rows: protected reserve and explicit partner checkboxes through `setCommerceResourcePolicy`.
- [x] Buyer import fields: good, target, max price, round budget and treasury floor; confirm writes the shared policy and route terms.
- [x] Route row shows cargo, paid amount, target remaining and the loss consequence.

### Task 4: Conservative AI

**Files:** `src/ai/ai-resource-marketplace.ts`, `src/ai/basic-ai.ts`

- [x] Retire the old ten-turn access purchase; write only a conservative procurement policy.
- [x] When an AI foreign route is established, attach a visible-offer, one-standard-recipe target through the same route terms and loader.

### Task 5: Persistence and verification

**Files:** `tests/systems/resource-shipments.test.ts`, `tests/e2e/issue-1509-land-route-import.spec.ts`, storage fixtures

- [x] Add manifest/procurement save round-trip and additive persisted-shape exemptions.
- [x] Add elimination/unit-removal manifest checks.
- [ ] Run full profile, shards, build, browser replay, durable evidence; archive this plan in the completing PR and update #1509/#1497 after merge.

## Player truth table

| Before / action | State change | Immediate visible result | Still reachable |
|---|---|---|---|
| Route assigned to permitted supplier, target 6 | No stock yet | Route row shows target/max price | Cancel/return, policy change |
| End turn at supplier | Seller native −6, buyer pays, incoming claim +6 | Cargo 6 Iron · paid · awaiting return | Return home, cancel |
| End turn at home | Claim → imported 6, manifest cleared | Supplies 6 stored, 0 incoming | Next trip, target still 6 |
| Cancel after loading | No new buys, route returns | Cargo remains aboard | Deliver at home |
| Trader destroyed | Claim destroyed | No imported stock; seller paid | Replace trader, new route |
| Price above max/budget | No purchase | Honest skip, route continues | Next round/target change |

## Misleading UI risks

- Incoming cargo is never labeled stored or free; it is a reserved claim until home.
- Route gold is separate from the purchase payment.
- A cancelled loaded route says it is returning with cargo, not that the cargo was lost.
- A destroyed trader says cargo is lost; no refund is implied.
