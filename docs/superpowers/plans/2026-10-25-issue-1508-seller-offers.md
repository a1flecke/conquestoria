# MR11 — Seller Surplus, Public Offers, and Posted-Price Transactions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested, good-keyed resource market engine: protected-reserve/partner policies, native-only surplus, once-per-round public offers with bands/tariffs/rotation, and atomic loading quote/commit with procurement and treasury guards. No UI or AI caller ships in this slice.

**Architecture:** `resource-market-offers.ts` owns policies, offer snapshots and the load transaction. Persisted contracts live in the existing `core/types/commerce` leaf. The reserve kernel gains the one missing primitive (credit imported stock); economy gains the one shared gold-transfer settlement. Legacy world-price reads are removed from the remaining access-cost caller.

**Tech Stack:** TypeScript, Vitest, existing reserve ledger, commerce permissions, diplomacy queries, trade-good catalog.

---

### Task 0: Register the active plan

**Files:**
- Create: `docs/superpowers/plans/2026-10-25-issue-1508-seller-offers.md`
- Modify: `docs/docs-lifecycle-manifest.json`

- [x] Add the plan as `active`, owned by open issue #1508, with the delete-on-completion reason.
- [x] Run `./scripts/dev.sh docs-lifecycle`.

### Task 1: Catalog price, imported credit, and gold settlement

**Files:**
- Modify: `src/systems/trade-good-definitions.ts`
- Modify: `src/systems/resource-reserve-system.ts`
- Modify: `src/systems/economy-system.ts`
- Modify: `src/systems/resource-acquisition-system.ts`
- Test: `tests/systems/trade-good-definitions.test.ts`
- Test: `tests/systems/resource-reserve-system.test.ts`
- Test: `tests/systems/resource-market-offers.test.ts`

- [x] Add `basePrice: number` to `TradeGoodDefinition`, populate it from each resource's `basePrice`, and validate it as a positive safe integer. Update the existing fixture literals.
- [x] Add `creditImportedStock(ledger, goodId, amount)` to the reserve kernel; it validates a nonnegative safe integer and increases only the imported balance. Capacity is checked by the caller because the caller owns the capacity profile.
- [x] Add `settleGoldTransfers(state, debits, credits)` to `economy-system.ts`: validate every balance before mutating, return `null` for a shortfall, otherwise a new state with every debit and credit applied in one step.
- [x] Change `getResourceAccessCost` to use `definition.basePrice * 3` only; the disabled legacy caller must no longer read `marketplace.prices`.
- [x] Write failing tests for the price, imported credit and shortfall-free transfer, then implement and commit.

### Task 2: Good-keyed policies, native surplus, and eligibility

**Files:**
- Modify: `src/core/types/commerce.ts`
- Modify: `src/systems/commerce-permissions.ts`
- Create: `src/systems/resource-market-offers.ts`
- Test: `tests/systems/resource-market-offers.test.ts`

- [x] Add `CommerceResourcePolicy` (`civId`, `goodId`, `protectedReserve`, `partnerCivIds`, `tariffPerUnit`, `tariffRecipientCivId`) and `CommerceMarketState` to the commerce leaf. Add optional `resourcePolicies` to `CommercePermissionsState` and optional `commerceMarket` to `GameState`.
- [x] Export `getCommerceResourcePolicy`, `setCommerceResourcePolicy`, `getExportableSurplus`, and `getEligibleMarketBuyers`.
- [x] `getExportableSurplus` uses `getExportableQuantity(ledger, goodId, protectedReserve)`, so native 30 + committed 10 + reserve 12 yields 8 and imported stock never raises it.
- [x] Eligibility requires a non-self, living buyer, commercial passage, a partner policy (or the legacy directional grant for a resource-backed good), and good knowledge. Buyer knowledge for a resource-backed good is its reveal tech; a producer-backed good is known through its definition.
- [x] Write the golden-surplus and permission/knowledge invisibility tests first, then implement and commit.

### Task 3: Once-per-round offers, bands, tariffs, and rotation

**Files:**
- Modify: `src/systems/resource-market-offers.ts`
- Test: `tests/systems/resource-market-offers.test.ts`

- [x] Export `MARKET_PRICE_BANDS` (`abundant 0.8`, `normal 1`, `tight 1.25`, `capped 1.5`), `refreshMarketOffers`, `getMarketOffersForBuyer`, and `getMarketOfferForBuyer`.
- [x] `refreshMarketOffers` is idempotent for a turn. It builds one offer per supplier/good with eligible buyers, computes the target band from exportable units against the definition's `standardRecipeQuantity`, moves the previous band at most one step (hysteresis), prices from the definition's `basePrice`, itemizes the policy tariff, and preserves the retained service cursor while clearing the turn's served list.
- [x] `getMarketOffersForBuyer` filters to the buyer's own eligible offers and returns a stable supplier/good order. Hidden supply and world prices never enter the offer.
- [x] Write tests for one snapshot per turn, band hysteresis, tariff itemization, stable row order, and hidden unrelated supply, then implement and commit.

### Task 4: Atomic quote/commit with procurement and treasury guards

**Files:**
- Modify: `src/systems/resource-market-offers.ts`
- Test: `tests/systems/resource-market-offers.test.ts`

- [x] Export `quoteMarketLoad` and `commitMarketLoad` plus their typed result payloads. Quote validates offer identity/turn, buyer eligibility, quantity, current exportable surplus, buyer storage headroom, tariff recipient, procurement cap and treasury floor; a price above the cap returns `price-above-cap` without mutation.
- [x] Commit re-quotes against the current state, then atomically: debits seller native stock, credits buyer imported stock, debits buyer gold, credits seller proceeds and tariff recipient, decrements offer availability, records the served buyer and advances the retained cursor.
- [x] Rotation: when availability is smaller than the eligible-buyer count, only the buyer at the retained cursor may load; the cursor advances after each success. The next round starts with the next buyer.
- [x] Write the two 6-unit attempt, payment-conservation, stale-cap, insufficient-headroom and one-unit rotation tests first, then implement and commit.

### Task 5: Elimination, persistence, and safe stopping point

**Files:**
- Modify: `src/systems/civilization-elimination-system.ts`
- Modify: `tests/helpers/eliminated-civ-areas.ts`
- Modify: `tests/storage/save-persisted-shape-ratchet.test.ts`
- Test: `tests/systems/resource-market-offers.test.ts`
- Test: `tests/storage/save-persisted-shape-ratchet.test.ts`

- [x] Elimination drops policies owned by or naming the dead civ, offers from/to it, its procurement policy and its cursor/served entries.
- [x] Add written additive exemptions for the optional `commercePermissions.resourcePolicies` and `commerceMarket` fields; absent means no policy and no snapshot, so no ordered migration is needed. Regenerate the persisted-shape snapshot.
- [x] Add a test proving no UI/AI module imports the commit function in this slice (the engine is the only writer) and that no instant-purchase path was opened.
- [ ] Run the full verification evidence, archive this plan in the completing PR, then update #1508/#1497 after merge.

## Player truth table (engine groundwork; no UI in this slice)

| Before / action | State change | Visible result in MR11 | Still reachable |
|---|---|---|---|
| Supplier policy set for coal with reserve 12 and partner B | Policy only | None (no UI) | Policy can be changed/revoked |
| Round snapshot with 8 exportable | Offer written once | None (no UI) | Same offer for the rest of the round |
| Buyer B quotes 6 | No mutation | Typed quote | B can commit or skip |
| Buyer B commits 6 | Native −6, imported +6, gold transfer | None (no UI) | Offer now shows 2 available |
| Second 6-unit attempt | Refused `insufficient-quantity` | Typed skip | 2-unit attempt remains possible |
| Price above procurement cap | Refused `price-above-cap` | Typed skip | All balances unchanged |
| Buyer lacks knowledge/permission | No offer and no quote | Nothing disclosed | Other eligible buyers keep their offers |

## Misleading UI risks

- No purchasing control or “buy” affordance is wired in MR11; instant resource purchases stay disabled.
- A hidden buyer must not infer another supplier's stock from row count, order or price.
- Tariff is itemized, never folded silently into the seller's unit price.
- A stale quote is revalidated; it never becomes a surprise purchase.

## Interaction replay checklist

- [x] Snapshot the same round twice; the offer is byte-identical.
- [x] Advance a turn; band moves at most one step and the cursor survives.
- [x] Commit 6 then attempt 6; only the first settles.
- [x] Set one scarce unit; alternate two buyers across two rounds.
- [x] Lower the procurement cap; commit leaves every balance untouched.
- [x] Remove buyer knowledge; the offer disappears without changing another buyer's row order.
