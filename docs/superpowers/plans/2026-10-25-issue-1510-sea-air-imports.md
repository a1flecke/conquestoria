# MR13 — Sea and Existing Air Transport Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the MR12 manifest import path across supported naval traders, preserve port/domain/danger rules, and keep air imports explicitly unavailable while ordinary air commerce remains playable.

**Architecture:** The MR12 shipment engine is domain-neutral; MR13 adds the missing capability metadata, endpoint/blockade guards, and UI disclosure. Every trade tier is covered by a catalog-derived capability matrix, so no hostile system or runner needs a trader-name list.

**Tech Stack:** TypeScript, Vitest, existing route contract/travel/danger adapters, jsdom panel tests.

---

### Task 1: Capability matrix and naval capacity

**Files:** `src/core/types.ts`, `src/systems/unit-definitions.ts`, `src/systems/trade-role-targeting.ts`, `tests/systems/trade-role-targeting.test.ts`

- [x] Keep `tradeCapacity` separate from troop `cargoCapacity`.
- [x] Give every land/naval merchant tier increasing dedicated capacity; leave air at 0 until its complete goods path exists.
- [x] Add catalog-derived tests for every trade role, tier progression, and passenger-transport separation.

### Task 2: Port/domain and blockade guards

**Files:** `src/systems/resource-shipment-system.ts`, `tests/systems/resource-shipments.test.ts`, `tests/systems/trade-route-contract.test.ts`

- [x] Keep the existing land/naval/air route contract; add no-port/wrong-domain and air-commerce coverage.
- [x] Refuse loading at a blockaded endpoint through the shared danger adapter.
- [x] Apply the same manifest load/delivery/loss rules to a naval trader; carrier death destroys claims.

### Task 3: Air disclosure and UI

**Files:** `src/ui/establish-route-panel.ts`, `tests/ui/establish-route-panel.test.ts`

- [x] Hide import fields for a trader with no dedicated goods capacity.
- [x] Explain that air imports are unavailable while ordinary air commerce remains confirmable.

### Task 4: Verification and archive

- [x] Full profile, source checks, mirrored tests, web-smoke, AI playability, build, durable evidence.
- [ ] Archive this plan in the completing PR and update #1510/#1497 after merge.

## Player truth table

| Before / action | State change | Immediate visible result | Still reachable |
|---|---|---|---|
| Naval route to an inland city | No route | Entitled refusal | Every port destination |
| Naval route to a port | Route assignment | Ordinary route terms | Load/deliver/cancel |
| Air route selected | Ordinary commerce only | “Imports unavailable” note | Confirm commerce |
| Blockaded supplier arrival | No load | No cargo/incoming | Next round when blockade lifts |
| Loaded naval trader destroyed | Claim destroyed | No imported stock | Replace trader |
