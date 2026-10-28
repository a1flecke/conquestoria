# MR14 — Luxury Delivery and Explicit Resource Benefits

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make luxury access delivery-backed and bounded, add a distinct-luxury happiness baseline separate from worked-tile effects, and define cattle/salt as no-benefit commodity access.

**Architecture:** `luxury-service-system.ts` owns delivered coverage and supplier service capacity. The MR12 shipment engine carries luxury service bundles in the same manifest, paying at loading and granting coverage only at home. Resource definitions carry an explicit access benefit separate from `effect` (the worked-tile yield).

**Tech Stack:** TypeScript, Vitest, existing route/shipment/market engines, jsdom panels.

---

### Task 1: Explicit access benefit and happiness baseline

**Files:** `src/systems/resource-definitions.ts`, `src/systems/resource-acquisition-system.ts`, `src/ui/city-panel.ts`, `src/ui/marketplace-panel.ts`

- [x] Add `ResourceAccessBenefit`; every luxury explicitly grants one happiness, cattle/salt explicitly grant none.
- [x] Count distinct access benefits, not tile effects; keep native worked-tile effects local.
- [x] Include delivered coverage in `getCivAvailableResources`; show access and coverage separately in panels.

### Task 2: Delivered luxury service

**Files:** `src/core/types/commerce.ts`, `src/core/types.ts`, `src/systems/luxury-service-system.ts`, `src/systems/resource-market-offers.ts`, `src/systems/resource-shipment-system.ts`, `src/systems/resource-procurement.ts`

- [x] Persist `LuxuryCoverage` per civ; grant only on home delivery with a normal-round-trip duration plus grace and a hard cap.
- [x] Offer luxury service slots bounded by completed native sources minus domestic use and the policy's explicit service allotment.
- [x] Refuse a second buyer when the last service slot is taken; renew the already-served buyer.
- [x] Carry a luxury service bundle through the same manifest/load/payment/loss path; no stock credit.

### Task 3: Seller/buyer controls and presentation

**Files:** `src/ui/marketplace-panel.ts`, `src/ui/establish-route-panel.ts`

- [x] Seller luxury rows expose foreign service slots and partner grants.
- [x] Buyer route chooser includes luxury goods; service target is one renewal.
- [x] Marketplace shows delivered coverage expiry and the next active import route.

### Task 4: Persistence and verification

**Files:** `tests/storage/*`, `tests/helpers/eliminated-civ-areas.ts`, tests

- [x] Save round-trip for coverage and service manifest items; additive shape exemptions.
- [x] Elimination drops coverage and supplier references.
- [ ] Full profile, source checks, mirrored tests, web-smoke, build, durable evidence; archive this plan and update #1511/#1497 after merge.

## Player truth table

| Before / action | State change | Immediate visible result | Still reachable |
|---|---|---|---|
| Order luxury service | No coverage yet | Route target/next shipment | Cancel/return |
| Supplier loading | Seller paid; bundle aboard | Cargo/service bundle in transit | Return home |
| Home delivery | Coverage until expiry | +1 happiness once; expiry shown | Renew, other luxuries |
| Interruption | No new purchases | Delivered coverage continues | Route resume/replace |
| Revocation | No renewal load | Coverage runs down | Other suppliers |
| Second buyer, one slot | No purchase | Typed service-capacity skip | Next free slot |
| Cattle/salt | No happiness/purchase | No trade-access benefit | Native tile effect only |
