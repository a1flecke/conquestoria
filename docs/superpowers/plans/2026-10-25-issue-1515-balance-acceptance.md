# MR18 — Balance and Player-Experience Acceptance Pass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the full commerce experience against the parent section 8 matrix, pin the measured profile as retained envelopes, and walk the live commerce panel on a narrow screen and by keyboard.

**Architecture:** Add one deterministic acceptance suite over the real load/travel/delivery/settlement/blockade paths and one extension-contract suite that threads fixture definitions through the canonical runner. No production rule changes are made unless a measured scenario fails; the only production touch is an optional catalog parameter on `completeRouteLeg` so a fixture good can traverse the same pipeline without an ID branch.

**Tech Stack:** TypeScript, Vitest, Playwright, existing market/route/reserve/fuel modules.

---

### Task 1: Acceptance matrix and measurements

**Files:** `tests/simulation/commerce-acceptance.test.ts`

- [x] Healthy five-trip route: no manual input, target pause, exact payment, one delivery, replay cannot double-credit.
- [x] Operating quote predicts the round payment; interruption stops income/loading and announces once.
- [x] Fuel runway ≥ 5 rounds at the startup allowance; storage/recipe/source defaults pinned.
- [x] A standard recipe costs a bounded number of route-turns at the abundant band.
- [x] Two routes share one round budget; cargo follows the hull catalog; longer routes trade gold/turn for cargo/turn.

### Task 2: Extension contract

**Files:** `tests/systems/commerce-extension-contract.test.ts`, `src/systems/trade-route-runner.ts`

- [x] Fixture resource-backed good and non-deposit producer good traverse offer → quote → load → travel → delivery.
- [x] A larger hull uses the same cargo rule; cancellation delivers once; destruction removes the claim.
- [x] Save/load continuation is deterministic and cannot double-credit.
- [x] The existing danger adapter suspends the fixture route without a new branch.
- [x] `completeRouteLeg` accepts an optional catalog for extension fixtures.

### Task 3: Narrow-screen and keyboard acceptance

**Files:** `tests/e2e/issue-1509-land-route-import.spec.ts`

- [x] Open the commerce panel with the keyboard at 390×844.
- [x] No horizontal overflow; every visible button keeps a 44px target.
- [x] The route unit-selection control is focusable and Enter closes the panel (semantic outcome).

### Task 4: Verification and archive

- [x] Focused acceptance/extension/runner tests, source check, shard allocation, build, durable evidence.
- [ ] Archive this plan and update #1515/#1497 after merge.

## Measured profile (before = current main, after = this MR)

| Metric | Measured | Envelope |
|---|---|---|
| Land wagon cargo | 6 | catalog tier 4/6/10 |
| Naval trader cargo | 5 | catalog tier 5/8/12/16 |
| 2-round-trip route income | 4 gold/turn | exact quote = payment |
| Standard 10-unit recipe, abundant band | 60 gold ≈ 15 route-turns | 10–25 |
| Fuel runway at 10 coal, 1/round | 10 rounds | ≥ 5 |
| Luxury coverage, 2-round trip | 6 turns | 4–12 (cap 12) |
| Five healthy trips | 10 units, seller +60, zero input | no double credit |

No numerical retune was required: every measured value sits inside the parent's declared envelopes. The pass therefore pins the profile rather than inflating rewards or lowering consumption.

## Player truth table

| Before / action | State change | Immediate visible result | Still reachable |
|---|---|---|---|
| Healthy route repeats | Manifest moves each trip | Cargo row, then stored units | Pause/cancel |
| Target reached | No further purchases | Route keeps earning | Reopen order |
| Route blockaded | No income/load | Blocked row and one notice | Alternatives |
| Narrow screen, keyboard | None | Panel fits, buttons ≥44px | Every route row |
| Added good definition | Same pipeline | Offer, cargo, delivery | Policy controls |
| Carrier destroyed | Claim removed | Loss details, no refund | Replace trader |
