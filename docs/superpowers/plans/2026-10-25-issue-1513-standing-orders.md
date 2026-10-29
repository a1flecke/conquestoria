# MR16 — Standing Orders, Forecasts, and Low-Noise Intervention

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trade self-running through editable multi-resource standing orders, honest forecasts, and intervention copy that distinguishes owned cargo from potential purchases.

**Architecture:** Extend the existing procurement terms and route chooser rather than adding a second order model. Presets derive from the good's standard recipe quantity; order array order is the loading priority; detour limit is a bounded per-route term. Route rows render confirmed manifest cargo separately from the remaining target and mark interrupted routes Delayed.

**Tech Stack:** TypeScript, Vitest, jsdom panels, existing route runner/manifest engine.

---

### Task 1: Standing-order editor

**Files:** `src/ui/establish-route-panel.ts`, `src/core/types/commerce.ts`

- [x] Editable multiple import orders with good, target and max unit price; up/down priority and remove.
- [x] Target presets from the good's standard recipe quantity; luxury presets stay at one renewal.
- [x] Shared round budget, treasury floor and conservative detour limit remain exact editable fields.
- [x] Editing one order never overwrites another order or unrelated production.

### Task 2: Forecast and intervention copy

**Files:** `src/ui/trade-route-presentation.ts`, `src/systems/trade-route-runner.ts`

- [x] Route rows label confirmed owned cargo separately from potential future purchases.
- [x] Blocked/blockaded/cancelled/lost routes show `Delayed — no promised arrival` instead of a fictional countdown.
- [x] Forecast assumptions are visible beside the target.
- [x] Per-route detour limit is bounded by the existing maximum.

### Task 3: Verification and archive

- [x] Focused UI/route tests, full profile, source checks, mirrored tests, web-smoke, builds, durable evidence.
- [ ] Archive this plan and update #1513/#1497 after merge.

## Player truth table

| Before / action | State change | Immediate visible result | Still reachable |
|---|---|---|---|
| Add a second order | Orders list only | Two prioritized rows; first remains | Reorder/remove either |
| Preset 2 recipes | Target only | Target updates from definition | Custom target |
| Reorder orders | Priority only | Next manifest order changes | Every order |
| Remove one order | That order only | Other orders and cargo stay | Add again |
| Route blocked | No arrival date | Delayed, confirmed cargo retained | Controls/reopen |
| Reopen/hot-seat | Reproject viewer | All editable fields refresh | Full catalog |
