# Commerce and Trade

This is the durable contract for Conquestoria's trade and supply system. It replaces the retired
instant marketplace; source, tests, and this document are the authority for current behavior.

## One supported architecture

- `src/systems/resource-acquisition-system.ts` — which resources a civilization can actually use.
- `src/systems/resource-reserve-system.ts` — native/imported stock, reservations, storage, conservation.
- `src/systems/resource-market-offers.ts` — seller surplus, posted-price snapshots, atomic loading.
- `src/systems/resource-shipment-system.ts` — manifests, home delivery, destruction, receiving space.
- `src/systems/trade-route-contract.ts` — the single assignment legality query and quote.
- `src/systems/trade-route-runner.ts` — bounded per-round travel and leg transitions.
- `src/systems/trade-route-economy.ts` — ordinary income, operating status, settlement.
- `src/systems/commerce-permissions.ts` — commercial passage, directional export grants, policies.
- `src/systems/resource-procurement.ts` — targets, shared budget/floor, cargo priority.
- `src/systems/resource-fuel-system.ts` — recurring demand and funded/fallback output.
- `src/systems/commerce-projection.ts` — viewer-safe offers, statuses, forecasts, reasons.

There is no instant purchase, no global world price, no fashion cycle, and no universal exchange.
`seller offer → quote → load → manifest → home delivery` is the only acquisition path. Old saves are
handled by the ordered migrations, never by a second runtime branch.

## Knowledge, permission, and legality

- **Known** requires the resource's reveal technology; a seller offer additionally requires entitled
  commercial disclosure. Knowing a resource never reveals a supplier, count, or city.
- **Reachable** requires an explored corridor in the trader's domain. A geometric line, a known
  endpoint, or military open borders is insufficient.
- **Permitted** requires commercial passage for both endpoints and every foreign transit territory.
  A bilateral trade agreement grants commerce, not military movement; minors use their own adapter.
- **Available now** also requires the owner's turn, an unspent assignment, no conflicting commitment,
  an origin with a free slot, capacity, and the applicable money/stock.
- Unknown entities never appear as rows, disabled buttons, anonymous counts, or price influence.

## Route lifecycle and income

`positioning → outbound → servicing supplier → inbound → home service → outbound`

- A committed trader moves on the canonical movement budget; positioning earns nothing.
- Ordinary income is paid once per completed round in which the trader made validated progress or
  completed legitimate endpoint service. Blocked, paused, positioning, exhausted, and destroyed
  routes pay nothing; the row shows the reason and current income zero.
- Terms are frozen for one round trip and refreshed at home. A leg's payable service rounds are
  bounded by its committed journey, so detours cannot mint extra rewards.
- Automatic detours use explored, permitted paths within a bounded allowance. No viable path means
  wait with one transition notice and a persistent status row.
- Cancellation stops new purchases immediately and returns the trader physically with owned cargo.
  The origin slot stays occupied until return or destruction. There is no teleport and no automatic
  abandonment.
- Loss flows through canonical unit removal: the manifest claim is destroyed, the slot is released,
  and the buyer receives one actionable warning when a commitment or shortage is threatened.

## Reserves, provenance, and procurement

```text
stored       = nativeStored + importedStored
committed    = materials reserved for active domestic production
free         = stored - committed
incoming     = owned manifests with a live path/home assignment
exportable   = min(nativeFree, max(0, free - protectedReserve))
purchaseNeed = max(0, reserveTarget - (free + incoming))
loadQuantity = min(purchaseNeed, freeCargoSpace, authorizedOffer,
                   affordableAtMaxPrice, storageHeadroom)
```

- All quantities are nonnegative integers; incoming stock is not usable.
- Exports debit native stock only. Domestic use consumes imported portions first.
- Purchased incoming space is protected at load, so domestic extraction cannot destroy paid cargo.
- Starting calibration lives in `trade-good-definitions.ts`: 2 native units per source per round,
  40 storage per quantitative good, a standard hard recipe of 10.
- A route cannot spend the full round allowance independently: cross-route orders share the budget,
  treasury floor, and incoming counts.
- Reaching the target pauses cargo purchases; ordinary commerce continues with no confirmation.

## Offers, prices, and seller control

- Human strategic exports default closed. A seller may protect a national reserve and authorize
  named partners per resource; permission never forces a sale below the reserve or an active
  commitment.
- Prices come from the good definition's base value and a discrete scarcity band
  (abundant 0.8×, normal 1.0×, tight 1.25×, capped 1.5×) with once-per-round updates and hysteresis.
  Reserve protection controls availability independently of price.
- A posted offer reveals only the offered good and price to entitled partners. It never reveals exact
  reserves, recipes, hidden cities, or deposit coordinates.
- Supplier terms stay fixed during the round while quantities decrease. Every load rechecks actual
  availability, permission, affordability, and limits. Scarce whole units are divided across waiting
  routes with a persisted rotating cursor, not an auction.
- The buyer pays at loading; tariffs are itemized and credited to their named recipient. The
  displayed cost is an estimate until loading, when the price locks within the standing maximum.

## Cargo, loss, luxury access, and fuel

- A manifest records owner, seller, stable good ID, quantity or service bundle, route, carrier,
  purchase turn, paid amount, and destination. It becomes usable stock exactly once, on home arrival.
- Buying, departure, cancellation return, save/reload, and route cleanup cannot credit it twice.
- Destruction removes the manifest; there is no seller refund and no loot resale of strategic cargo.
- Luxury access begins on delivery and runs to a visible expiry with a bounded grace/cap. A new
  purchase extends coverage; interruption lets it run down and end once.
- Fuel-backed buildings declare their fuel-dependent output. Allocation runs before city yields in a
  stable priority order; a shortage reduces only the declared output and never deletes a building,
  disbands a unit, or silently disables unrelated city functions.
- Imports never grant a foreign worked-tile yield. Access benefits name their scope explicitly.

## UI truth rules

- `Stored` excludes incoming; `Free` excludes commitments; a purchase order is neither owned cargo nor
  a promised delivery. Label confirmed cargo separately from potential purchases.
- `Operating +N` and `currently earning 0` coexist honestly during interruption; displayed rates use
  the same modifiers as settlement.
- Route rows show the destination, trip timing, known danger, capacity, cargo, next delivery ETA, and
  the reason a route is not operating. Healthy trips need no repeated confirmation.
- All entitled destinations remain reachable even when recommendations are reordered or bounded.
- Narrow screens scroll the panel internally; every visible button keeps a 44px touch target and a
  semantic keyboard outcome.

## Extension recipes

Every extension adds definition data and, only when the behavior is genuinely new, one typed adapter.
No commerce pipeline may grow an ID-specific branch.

### Add a natural resource

1. Add the entry to `RESOURCE_DEFINITIONS` in `src/systems/resource-definitions.ts`: reveal tech,
   native source/improvement rule, economic roles, effect scope, base price, icon.
2. It automatically inherits a resource-backed good (`buildResourceBackedGoods`), quantity/access
   semantics, offers, policies, shipments, forecasts, AI demand, and cleanup.
3. Add the reveal/tech and map placement as usual; no commerce file changes.
4. Compatibility: a new resource is additive; an old save simply has no stock or source for it.
5. Tests: `tests/systems/trade-good-definitions.test.ts`,
   `tests/systems/resource-market-offers.test.ts`, and the catalog-driven coverage in
   `tests/systems/commerce-extension-contract.test.ts`.

### Add a non-deposit good

1. Add a `TradeGoodDefinition` to `src/systems/trade-good-definitions.ts` with a producer
   `nativeSource`, a settlement kind, at least one use, base price, cargo space, and a quantity
   profile for stored goods.
2. Register its producer/source owner; do not invent a map deposit or expand `ResourceType`.
3. It inherits the same offer, budget, cargo, provenance, reservation, and presentation pipeline.
4. Compatibility: additive; an old save has no stock and no policy for it.
5. Tests: `tests/systems/trade-good-definitions.test.ts` and the producer-good fixture in
   `tests/systems/commerce-extension-contract.test.ts`.

### Add a trading unit

1. Add the unit to `src/systems/unit-definitions.ts` with `domain`, movement, and a typed
   `tradeCapacity`; reuse the existing production/upgrade/presentation metadata.
2. Generic predicates derive trade eligibility, AI roles, candidate generation, hostile recognition,
   capacity, ETA, and removal behavior. Do not add a separate trade-unit roster.
3. A new transport domain additionally needs real movement, endpoint, renderer, and enemy support.
4. Compatibility: additive; an old save has no such unit and no route for it.
5. Tests: `tests/systems/trade-role-targeting.test.ts` and the larger-hull fixture in
   `tests/systems/commerce-extension-contract.test.ts`.

### Add a danger

1. Keep the simulation owner in its existing world system (combat, piracy, blockade, obstruction).
2. Add a typed adapter in `src/systems/trade-danger-adapters.ts`: applicability, spatial scope,
   consequence (`movement-blocked`, `service-suspended`, or canonical cargo/carrier loss), recovery,
   and entitled explanation.
3. The runner reacts to consequences, never to actor names. Carrier loss still flows through
   canonical unit removal.
4. Compatibility: no persisted shape change; danger facts are derived from world state each round.
5. Tests: `tests/systems/trade-danger-adapters.test.ts` and the blockade fixture in
   `tests/systems/commerce-extension-contract.test.ts`.

## Compatibility and verification

- `CURRENT_SAVE_SCHEMA_VERSION` lives in `src/storage/save-schema-version.ts`; every bump needs an
  ordered migration in `src/storage/migrations/ordered.ts` and a save-compat case.
- Schema 36 seeds material reserves for legacy-entitled active work. Schema 37 consumes the retired
  purchased-access list: live luxury entries become delivered coverage at their recorded expiry, a
  strategic entry is dropped without fabricating stock, and the list is cleared.
- Retired shapes (`prices`, `priceHistory`, `fashionable`, `fashionTurnsLeft`, `purchasedResources`)
  remain only as optional legacy fields in `core/types.ts` and inside frozen migration steps.
- Required evidence is whatever `./scripts/dev.sh verify-impact` reports. Focused commerce checks:

```text
./scripts/dev.sh test tests/systems/trade-route-runner.test.ts tests/systems/resource-shipments.test.ts
./scripts/dev.sh test tests/simulation/commerce-acceptance.test.ts tests/systems/commerce-extension-contract.test.ts
./scripts/dev.sh test tests/storage/save-compat-matrix.test.ts tests/storage/save-persisted-shape-ratchet.test.ts
```
