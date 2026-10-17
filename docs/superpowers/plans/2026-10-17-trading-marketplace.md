<!--
Approved and registered implementation plan for the trade and supply overhaul.

Owner: open parent issue #1497 (https://github.com/a1flecke/conquestoria/issues/1497).
Lifecycle: classified `active` in docs/docs-lifecycle-manifest.json, owned by issue #1497.
Assembly: the approved parent document is reproduced verbatim below, followed by the verbatim
published scope of each ordered child issue (#1498-#1516) in merge order. Registration captured
these issue bodies as published; the issues themselves remain the living record of any later
clarification.
Not authorization: registration does not authorize merging, closing issues, subagents, fast mode,
or unrelated gameplay expansion. Each slice still requires its own verification and merge approval.
-->

# Trading and Marketplace Implementation Plan

> Approved by the requester on 2026-10-17, including extensibility for resources, goods, trade units, and dangers. This parent and its ordered child issues track implementation; no gameplay changes have been made.
>
> For agentic workers: execute approved slices inline using `superpowers:executing-plans`. Subagents and fast mode require separate, explicit user authorization. Do not interpret approval of this plan as authorization to merge MRs.

**Goal:** Replace instantaneous, poorly grounded trading with understandable, automated commerce carried by vulnerable physical traders, including strategic reserves and deliberate diplomatic dependence.

**Architecture:** Keep movement, production, diplomacy, resource accounting, and trade settlement in their canonical systems. Add small commerce-specific modules for contracts, inventories, offers, and shipments. Human UI, AI, and turn automation share mutation rules; player presentations and AI perception remain knowledge-scoped.

**Tech stack:** Existing TypeScript simulation, serializable plain-object state, seeded simulation RNG where needed, Canvas map, DOM panels, Vitest, existing browser interaction tests, and shared web/Tauri distribution.

## 1. Status, evidence, and scope

This is the approved design and implementation roadmap, not a claim that the feature has been fixed or playtested. The source-and-test audit was checked against `007ee0050a993d4ab58f063ddd6b7eea65d55d8a` on `origin/main`. Recheck current source before implementation; preserve unrelated workspace changes.

Before each implementation slice, fetch current main, inspect the actual named files again, and create a fresh linked worktree and `codex/` branch from latest `origin/main`. File ownership may move before later slices begin. Proposed new paths below are design decisions, not claims that files already exist.

The user approved the following direction through individual design choices:

1. Physical traders and ships; barbarians, pirates, and enemies can disrupt them.
2. Clear route returns, little routine management, and no ordinary haggling.
3. Diplomacy determines willingness and permission; transport determines receipt.
4. Strategic materials accumulate in reserves.
5. Imports are optional cargo on ordinary routes, sharing finite carrying capacity.
6. Materials fund construction/equipment; selected fuel uses recur; luxuries use continuing access.
7. Seller policies protect domestic reserves and commitments; strategic exports require partner permission.
8. Posted supplier prices; buyer limits; seller paid at loading; buyer bears subsequent cargo loss.
9. Persistent traders, automatic repeat, physical return on cancellation, real loss on destruction.
10. Known cities, explored corridors, transport capability, commercial rights, capacity, and actor-turn checks govern new routes. Military open borders remain a separate permission.
11. The architecture must support new resources, trade units, dangers, and goods through explicit, tested extension points rather than repeated special-case edits.

The accounting rules, UI structure, and MR boundaries below are part of the approved plan. Initial numerical profiles are calibration candidates, not measured balance results. No illustrative conversational number is a hidden default.

### What currently goes wrong

| Finding | Evidence / consequence | Planned owner |
|---|---|---|
| Resource buying grants ten turns of access immediately; seller is not paid | `resource-acquisition-system.ts`; neither a physical shipment nor a real exchange exists | MR01, MR11–13 |
| Purchased entries lack seller/source identity | War, embargo, source loss, and transport cannot meaningfully govern replenishment | MR11–14 |
| Seller availability includes imported access | Re-offering imports has no provenance constraint | MR08, MR11 |
| Route picker enumerates undiscovered cities; executor does not recheck the full offer | Knowledge leakage and stale/direct-call bypasses | MR03 |
| Route preview and execution calculate different rewards | Preview omits inputs used by execution | MR04 |
| Duration uses geometric distance while runners follow actual paths | ETA and route value are poorly related to the journey | MR03–04 |
| Blocked routes remain in the income roster | Physical disruption can be economically cosmetic | MR04–06 |
| Successful completion eventually removes traders | Routine replacement creates unnecessary upkeep | MR05 |
| World pricing counts owned deposits without the acquisition rules and uses every city's population as demand for every good | Quotes encode hidden geography and do not measure usable export surplus | MR01, MR11 |
| Resource access can add non-happiness bonuses to every city | A fixed-price import can scale with empire size; imported access is confused with worked-tile yield | MR10, MR14 |
| Hostile targeting is incomplete across trade roles | Barbarian logic explicitly names the basic caravan; pirate transport targeting does not automatically cover merchant hulls | MR06, MR13 |
| Late materials already have soft discounts and substitution rules | A blanket boolean-to-hard-requirement conversion would remove existing strategic alternatives | MR09–10 |

The current marketplace already filters its resource catalog by reveal technology. The reported unresearched-resource leak was not reproduced on audited main. The confirmed gaps are supplier discovery, route discovery, global information encoded in prices, and inconsistent legal checks. Add regressions for both technology knowledge and commercial discovery rather than assuming only one explains the report.

### Lessons retained from other games

- Civilization V/VI: legible route rewards, automated travel, scarce route capacity, and a map presence worth protecting. Avoid repeated trader replacement and unexplained interruption rules. [Civ V: Brave New World manual](https://cdn.akamai.steamstatic.com/steam/apps/235580/manuals/CIV_V_BNW_PC_ONLINE_MANUAL_ENG.pdf), [Civ VI manual](https://cdn.steamstatic.com/steam/apps/289070/manuals/CIV_VI_25TH_ONLINE_MANUAL_ENG.pdf?t=1636653176).
- Civilization IV: diplomatic exchange can coexist with network requirements. Permission and delivery solve different problems. [Official manual](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3900/manuals/manual.pdf?t=1724341287).
- Humankind: commercial interdependence, treaty access, and transport costs matter; avoid unreadable route proliferation and automatic unlimited resource copying. This is a lesson from the developer's 2023 redesign, not a claim about every current patch. [Developer trade preview](https://community.amplitude-studios.com/amplitude-studios/humankind/blogs/910-trade-and-poaching-preview).
- Stellaris and Endless Legend: stockpiles, posted prices, and standing purchase limits make specialization manageable. Avoid importing a universally accessible abstract market into a game where geographic pressure is a core goal. [Stellaris market design diary](https://store.steampowered.com/news/posts/?appids=281990&enddate=1537443760), [Endless Legend manual](https://cdn.steamstatic.com/steam/apps/289130/manuals/User%27sManual.pdf?t=1611254251).

The reasons for this game's diplomacy/commerce split are design judgments: seller agency, strategic withholding, credible logistics, and less repetitive negotiation. They are not asserted as the documented original motives of earlier Civilization designers.

## 2. Target player experience

A player discovers an iron-producing civilization and one of its cities. An explored, permitted corridor connects that city to a home city. The player obtains commercial access and the seller authorizes iron exports.

In the route chooser, the player sees the ordinary benefits, destination recipient, trip timing, known danger, and available cargo. They choose an iron reserve target, a maximum unit price, and an empire spending allowance. A trader departs and repeats automatically.

At the supplier, the loading transaction purchases only authorized surplus within every limit. Payment reaches the seller immediately. The manifest becomes the buyer's property, but the iron is still in transit. It becomes usable only upon reaching the home endpoint.

If pirates destroy the trader, that manifest is lost and replenishment stops. Existing iron supports already-funded plans. The player receives one useful warning when a loss threatens a commitment or approaching shortage, then chooses whether to secure the route, replace the trader, or use another supplier. Healthy routes require no repeated confirmation.

### Boundaries that keep this achievable

- National reserves are pooled. Domestic distribution within an empire remains an abstraction; this project does not introduce regional warehouses, army baggage trains, or a second freight simulation.
- A discovered foreign city serves as a gateway to its civilization's authorized native surplus. Offers are labeled as that supplier civilization's goods; the panel does not pretend the deposit is inside that city's territory.
- Land and naval traders are the first delivery paths. Existing air-trade tiers must retain a coherent, tested path and join imports only when their transport rules are implemented.
- Cargo is a goods manifest, initially carrying resource-backed materials and luxury service bundles, not an occupying unit and not the existing troop-transport passenger list. Future manufactured goods must not require pretending they are map deposits.
- There is no universal world exchange, instant delivery, imported-resource resale, manually priced auction, futures market, or compulsory per-caravan escort command.
- No new culture currency is introduced. The first yield catalog uses actual gold, city food, city production, and research recipients. A future culture-specific route must name an existing cultural mechanic and its recipient before advertising a culture reward.

## 3. Gameplay and accounting contract

### 3.1 Knowledge and access

`Discovered`, `reachable`, `permitted`, and `available now` have distinct meanings. A known but blocked city may appear with an entitled explanation. An unknown city must not appear as a row, disabled button, anonymous count, map focus target, or price influence.

A new assignment requires a real trade-role unit owned by the acting civilization, on its turn, with an unspent assignment action and no conflicting commitment. The player chooses an origin with an available slot. The trader must reach that origin physically before its first commercial departure; the game must not silently choose a distant city and start income there.

Manual assignments and policy changes are owner-turn actions. Standing-order loads, movement, delivery, and settlement run at their specified world-round boundaries for every eligible owner, irrespective of `currentPlayer`. Distinguish these execution contexts explicitly: reusing a human-turn check inside automated settlement must not silently disable every other civilization's trade.

The planned route follows an explored corridor in the unit's supported domain, including wrapped-map distance, terrain costs, infrastructure, and relevant domain technology. Fogged but remembered terrain can be used. Planning reads known obstacles; hidden units are not route-planning radar. Assignment validates the entitled itinerary and current actor/contract facts, rather than probing the entire future path for hidden blockers or ownership changes. Execution validates each next step against reality and reports newly encountered obstruction when encountered. Authorizing an assignment is not a guarantee of eventual safe delivery.

Commercial rights cover endpoints and every foreign transit territory. A bilateral trade agreement grants commercial passage between those parties, not military movement. Third-party transit requires that party's commercial permission. Domestic travel needs no foreign agreement. Minor-civilization trade uses its existing contact/relationship permission model through an explicit adapter, not a major-civ treaty that minors cannot sign.

Changing relations alone does not silently cancel a signed agreement at an undocumented score threshold. War, embargo, elimination, explicit revocation, or endpoint loss govern it through typed transitions. Strategic export grants are directional and resource-specific. Treaty acceptance belongs to the recipient, including hot seat.

### 3.2 Route operation, income, and commitment

Proposed route lifecycle:

`positioning → outbound → servicing supplier → inbound → home service → outbound`

Interruptions use explicit `blocked`, `paused`, or `returning` states. Terminal records distinguish completed cancellation, destruction, and lost endpoints. Arrival and loading are bounded endpoint transitions; rerenders and repeat clicks never process them twice.

Travel uses the unit/domain's canonical movement budget and terrain/infrastructure costs, reset once per round. Assignment, positioning, and automatic travel cannot each grant a separate movement allowance. A committed unit cannot also receive manual movement for that round. ETA sums the same entitled movement costs and budget; it is not geometric distance divided by an unrelated constant.

Normal route rewards are paid once per completed world round in which the trader makes validated journey progress or completes legitimate endpoint service. No positioning income, blocked income, paused income, or payment to a trader destroyed before settlement. Resource cargo is entirely separate: movement never makes undelivered iron available.

Quote ordinary yields as per-turn operating returns. Show current actual income as zero when blocked, alongside the reason. Show imports as quantity and next delivery ETA, with optional average throughput explicitly labeled as an estimate. Ordinary income does not imply that cargo has arrived.

Freeze the normal reward terms for one round trip. Refresh at home for the next departure; show the new terms there. A leg has a bounded number of payable service rounds derived from its committed journey, so repeatedly detouring or extending a path cannot mint extra rewards. A valid faster trip earns its stated rate during fewer rounds and starts the next cycle sooner.

Preserve existing technology, infrastructure, and wonder benefits through explicit metadata. Bonuses currently expressed as extra trips must be deliberately translated into persistent-route throughput or carrying capacity, with descriptions and regressions updated together; do not silently delete them or stack them twice.

Cancellation stops new purchasing immediately and changes the trader to physical return. Purchased cargo remains aboard. The old origin slot remains occupied until return or destruction, preventing cancel/reassign duplication. Trader reassignment occurs when it is available at an eligible home city. A known alternative home can receive a stranded trader if its old origin is lost; no route or cargo is teleported.

Automatic detours use explored, permitted paths and a bounded extra-delay allowance. They never discover a corridor for free or obtain a new right. No viable permitted path means wait, with one transition notification and a persistent status row. Revocation does not grant invulnerability or military passage; already-bought cargo remains owned, but safe passage is not guaranteed. A stranded trader can be deliberately abandoned through the canonical removal path, destroying its cargo and releasing its slot; show that consequence before the action. There is no automatic abandonment timer or free recovery teleport.

### 3.3 Strategic reserves and provenance

Separate economic roles from the current broad `strategic`/`luxury` tags. Copper, iron, horses, stone, aluminum, rare earths, and battery minerals can have equipment/construction roles. Coal, oil, and uranium can have fuel and/or construction roles. Cattle and salt do not become arbitrary ammunition stockpiles merely because the current type union calls them strategic; keep their commodity/access roles until a genuine quantitative use is defined.

All counted native production requires revealed technology and the acquisition system's actual usable source rules: correct completed improvement or the deliberate city-center exception, valid outpost ownership, and no hostile occupation. A tile contributes once, even if multiple cities list it. Imported quantities never count as native sources or satisfy quests requiring physically owned sources.

Maintain native and imported portions of stored stock. Exports may debit only native stock; domestic use consumes imported portions first, then native portions, with reservation provenance recorded at commitment. Domestic consumption of an imported unit does not convert another imported unit into exportable stock. Deposits are renewable per-turn sources in this version; geological depletion is outside scope.

One-time migration assistance is recorded as non-exportable imported stock with an explicit migration grant reason, never a fictitious supplier or shipment. Any grant reserved to an already-active production item remains restricted to that item until spent or released under its declared migration rule. Conservation tests count such grants as deliberate finite sources; loading a save never grants them again.

Definitions:

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

All quantities are nonnegative integers. Incoming stock is not usable. Counts are centralized; UI does not reproduce this arithmetic. Protect purchased incoming storage space at load time so domestic extraction cannot fill it and destroy paid-for cargo on arrival. Reducing a target does not discard cargo. Capacity reductions retain already-owned overflow and stop new accumulation until there is room.

Different consumers must use the correct query: material funding asks for a recipe quantity; a physically-owned-source quest asks for native source count; luxury happiness asks for delivered access; worked-tile yields ask about that domestic worked tile. Do not replace every call to the old availability Set with `stock > 0`, which would preserve the one-unit eligibility and infinite-discount bugs.

A starting balance profile to evaluate, not an assertion of final balance: 2 units per native source per round; base storage 40 per quantitative resource; a standard material recipe of 10 units; land cargo 10 and naval cargo 20. Unit tiers scale capacity from catalog metadata. These values live together in data and must be adjusted against actual game pacing before their activation slices merge. Do not copy the conversation's illustrative reserve of 30 as a hidden default.

### 3.4 Construction, queues, upgrades, and soft materials

Only each city's active production item creates a hard material commitment. Later queue entries display planned requirements but do not reserve the entire empire's supply. On activation, atomically reserve its full recipe or show `Waiting for materials`; do not spend production that round without the required commitment.

Consume committed materials exactly once on successful completion. Cancellation releases unconsumed material. Reordering releases the old active commitment and attempts the new one, updating the visible ETA immediately. Previously earned production follows existing queue semantics; no cancellation manufactures material or gold refunds. A city changing owner releases its old owner's national reservation rather than giving the conqueror a duplicate national stockpile.

Rush-buy and upgrades pay the same recipe through the canonical owners, atomically with gold and placement checks. Failed placement or stale legality consumes neither gold nor materials. Free rewards and scripted spawns retain their explicit free-grant semantics; they do not accidentally charge resources through unit completion.

Hard requirements retain their intended necessity, now as quantities. Soft resource advantages remain optional alternatives. A material-backed discount requires a real material commitment/consumption, not one leftover unit unlocking infinite discounts. Snapshot the selected material-backed terms for that active item. Circular Manufacturing remains an explicit substitution for eligible soft costs and does not manufacture tradable stock, fulfill hard-resource requirements, or supply operational fuel.

Resource-poor civilizations retain catalog-defined military and economic alternatives. Availability and obsolescence must test whether a successor can actually be funded; possession of one unit of iron cannot hide a usable predecessor when the successor needs ten.

### 3.5 Offers, prices, and seller control

Human strategic exports default closed. A seller may protect a national reserve and authorize particular partners per resource. Luxury commerce can use the general trade agreement, but it is still constrained by native supply/service capacity. Permission never forces a sale below the protected reserve or against active commitments.

The initial seller quote uses the resource's calibrated base value, native free stock, protected reserve, production rate, and actual scheduled domestic use. Demand means real domestic consumption/commitments and accepted commercial demand, not every population point demanding every resource.

Use discrete scarcity bands with bounded prices and once-per-round updates. A proposed initial band set is abundant 0.8×, normal 1.0×, tight 1.25×, capped at 1.5× base before explicit tariff. Reserve protection controls availability independently; a high price cannot buy protected goods. Band hysteresis prevents one-unit threshold oscillation. These are proposed tuning values tested with concrete fixtures and measured game budgets.

Quote only eligible, public commercial offers to the buyer. Posting an offer intentionally reveals the offered good and price to entitled partners; it does not reveal exact reserves, recipes, hidden cities, or deposit coordinates. Quotes are independent of unrelated hidden civilizations and unrelated hidden world supply. An advertised supply band is an explicit commercial disclosure, not a side channel into omniscient stock data.

Supplier snapshot terms remain fixed during the round while quantities decrease. Every load rechecks actual availability, permissions, affordability, and limits. Later arrivals cannot buy the same units. Collect same-round supplier arrivals before allocation and use a bounded rotating service order per supplier/resource, with stable route IDs to break ties. Divide scarce whole units among eligible waiting manifests before filling a second allotment for one route. Persist the last-served cursor so the same lowest-ID buyer cannot win every shortage round. This is a deterministic service queue, not an auction or a player-managed reservation market.

The buyer pays the seller at loading. Tariffs are separately itemized and credited to their named recipient. Ordinary route gold is a distinct service yield and never double-counts the purchase. Loading debits goods, credits payment, creates the manifest, and reserves receiving capacity in one transaction. No partial mutation may survive a denial. Before departure, the displayed purchase cost is the current estimate: the price is locked only at loading, within the standing maximum, with an honest skip when it no longer qualifies.

### 3.6 Cargo, loss, and luxury access

Each shipment records owner, seller, stable good ID, quantity or service bundle, route, carrier, purchase turn, paid amount, and destination. Resource identity is resolved from the good definition rather than duplicated as a second mutable identity on the manifest. Goods enter storage exactly once on home arrival. Buying, leaving port, returning under cancellation, save/reload, and final route cleanup cannot credit them a second time. Use dedicated trade-cargo capability metadata for goods carrying; do not accidentally turn merchant hulls into troop transports by adding troop `cargoCapacity`.

Destruction removes the manifest through canonical unit removal. The buyer loses cargo; there is no automatic seller refund. Initially destroyed strategic cargo is destroyed, avoiding imported-loot resale and new salvage UI. Existing pirate plunder can grant its normal bounded gold reward, with no duplicate treasury debit for already-paid goods. Material capture is a separate future feature.

Luxury access begins on actual delivery. A replenishment bundle grants service coverage based on the route's committed normal replenishment interval plus a small displayed grace period; coverage has a bounded cap. It does not shorten retroactively because a supplier revokes permission. New purchases stop, and delivered coverage runs down. The manifest pays for continued service; it is not an unlimited permanent resource copy.

Give each distinct luxury a useful, explicit access effect. Proposed initial baseline: +1 civilization-wide luxury happiness, nonstacking for repeat copies of the same luxury, while retaining appropriate native worked-tile effects separately. This expands the useful access role to currently gold/production-only luxury entries and is a deliberate balance change requiring coverage, not an incidental refactor.

An import does not grant the worked-tile yield of a foreign mine or plantation to every city. Cattle and salt keep explicitly scoped commodity effects; their catalog entries must state whether trade access has a benefit and its recipient. Do not offer purchases with no implemented benefit.

### 3.7 Operational fuel

Begin with selected industrial buildings, so fuel creates ongoing dependence without introducing unit-by-unit ration orders. Proposed consumers: coal-backed factory output, oil-backed refinery output, and uranium-backed nuclear plant output. Fuel-backed and non-fuel output portions are explicit definition fields, not a blanket empire multiplier.

Allocate available fuel before city yields in stable priority order. Default behavior is automatic; a national conservation policy may prioritize essential activity without requiring individual building toggles. No partial unexplained output: the UI shows funded output and fallback output. Shortage reduces the declared fuel-dependent output; it does not delete buildings, disband units, or silently disable unrelated city functions.

Do not simultaneously add recurring military fuel consumption in this project. Oil can still be an equipment input for applicable production. Military operational fuel requires a separately approved mobility/readiness design to avoid immobilizing fleets or duplicating the game's existing supply systems.

Update contradictory descriptions, including the current nuclear plant's claim of output without fuel costs. Preserve the choice's usefulness through measured output and fuel pacing rather than leaving old text in place.

### 3.8 Automation and notifications

Provide a reserve target, maximum unit price, total spending per completed round, and protected treasury floor. Cross-route orders share those limits and incoming counts. A route cannot spend the full allowance independently of another route. At target or out of allowance, it skips cargo purchases and continues ordinary commerce.

For loading multiple goods, prioritize threatened active commitments and fuel runway, then player-set resource priority, then stable resource ID. Reordering priority changes the next load, not cargo already bought. Initially users select suppliers/routes; automation can rebalance eligible cargo on those chosen routes. It does not silently sign treaties, authorize a rival, build a replacement trader, or switch to a new dangerous supplier. National presets and batch selection of revealed goods reduce repetitive policy setup; resource-specific overrides remain available. Batch partner grants cover only the currently revealed goods explicitly selected; future newly revealed strategic goods require a later deliberate grant.

Warn on meaningful transitions: newly blocked route, destroyed cargo, trade permission loss, and predicted shortage crossing the intervention threshold. Show persistent status, deduplicate ongoing problems, and aggregate related losses. Healthy delivery can appear in the commerce log without demanding a toast every trip.

## 4. Architecture and file ownership

Existing owners to extend, rather than bypass:

| Existing path | Responsibility |
|---|---|
| `src/systems/trade-caravan-system.ts` | Assignment query/executor and route creation |
| `src/systems/trade-route-economy.ts` | Shared ordinary reward terms and route capacity |
| `src/systems/trade-route-lifecycle.ts` | Permission/endpoint interruption and cleanup |
| `src/systems/unit-movement-system.ts` | Public runner entry; delegate commerce travel to its focused owner |
| `src/systems/unit-removal-system.ts` | Death/capture cleanup, including attached manifests |
| `src/systems/quest-aware-trade-system.ts` | Quest progress only after successful canonical creation |
| `src/systems/resource-acquisition-system.ts` | Actual native source eligibility and access adaptation |
| `src/systems/resource-definitions.ts` | Resource economic roles, effect scopes, rates, base values |
| `src/systems/city-unit-catalog.ts`, `city-building-catalog.ts` | Typed material recipes and fuel metadata |
| `src/systems/city-production-eligibility.ts`, `city-availability.ts` | Queue offers and resource-poor alternatives |
| `src/systems/city-turn.ts`, `planning-system.ts` | Active-item commitments, queue mutations, completion |
| `src/systems/production-cost-context.ts`, `city-production-cost.ts`, `resource-advantages.ts` | Coherent hard/soft costs and substitutions |
| `src/systems/economy-system.ts`, `unit-upgrade-system.ts` | Atomic rush-buy and upgrades |
| `src/core/round-phases/index.ts`, `types.ts` | Only authoritative round-order declaration and explicit cross-phase facts |
| `src/core/round-phases/diplomacy-trade.ts`, `trade-income.ts`, `wonders-market.ts` | Journey integration, settlement, retirement of false world pricing |
| `src/core/round-phases/per-civ/city-production.ts` | Apply funded yields and completed production once |
| `src/systems/diplomacy-actions.ts`, `diplomacy-requests.ts`, `diplomacy-treaties.ts` | Commercial proposal/consent and revocation |
| `src/systems/barbarian-system.ts`, `pirate-behavior.ts`, `pirate-system.ts` | Existing hostile targeting and pressure |
| `src/ai/basic-ai.ts`, `ai-resource-marketplace.ts`, `ai-production.ts`, `ai-unit-roles.ts` | Knowledge-bounded commerce, demand, seller policy, and roles |
| `src/ui/marketplace-panel.ts`, `establish-route-panel.ts`, `trade-route-presentation.ts` | Live commerce overview, chooser, and shared city route rows |
| `src/app/controllers/diplomacy-actions-controller.ts`, `diplomacy-trade-panel-actions-controller.ts` | Commit shared results, display denials, refresh live panels |
| `src/storage/save-schema-version.ts`, `save-migrations.ts`, `migrations/ordered.ts` | Versioned persistence integration |

Proposed focused modules:

- `src/core/types/commerce.ts`: stable good IDs, route lifecycle, manifests, ledgers, policies, public offer terms, trade capabilities, and danger fact/result types.
- `src/systems/trade-good-definitions.ts`: compose resource-backed good definitions from the resource catalog and explicitly registered non-deposit goods; validate completeness without duplicating resource names, reveal technologies, or effects.
- `src/systems/trade-danger-adapters.ts`: adapt existing authoritative combat/blockade/obstruction facts to trade effects and entitled warnings; no second combat or movement legality implementation.
- `src/systems/trade-route-contract.ts`: typed assignment denials and coherent quote generation.
- `src/systems/trade-route-runner.ts`: bounded per-round route transitions and physical return.
- `src/systems/commerce-permissions.ts`: commercial passage and directional export permission queries/writers.
- `src/systems/resource-reserve-system.ts`: native/imported stock, reservations, atomic spends, storage.
- `src/systems/resource-material-costs.ts`: recipe/soft-material quote and commitment logic.
- `src/systems/resource-market-offers.ts`: seller surplus, posted price snapshots, public commercial disclosures.
- `src/systems/resource-shipment-system.ts`: atomic load, delivery, destruction, and receiving-space release.
- `src/systems/resource-procurement.ts`: shared target/budget/cargo-priority calculations.
- `src/systems/resource-fuel-system.ts`: recurring demand and funded/fallback activity results.
- `src/systems/commerce-projection.ts`: viewer-safe offers, statuses, forecasts, and reasons.
- `src/ui/commerce-reserves-section.ts`, `commerce-policies-section.ts`: focused DOM sections used by the live marketplace panel.
- `src/core/round-phases/commerce-resources.ts`: native accrual and fuel allocation before city production, when activated.

Do not create every module up front. Introduce each when its slice has a real use. Keep catalogs free of runtime imports and avoid adding new implementation to deprecated compatibility barrels.

The round order remains centralized. When the new resource phase is activated, explicitly place it after pre-civ reconciliation and before per-civ production. Domestic extraction and fuel allocation occur once for every living civ; later foreign deliveries become available for the next production round. Trading movement remains in diplomacy-trade; combat/piracy can destroy a moving trader before trade-income settles. Update the round-order golden tests as an intentional gameplay change. No phase imports another phase.

### 4.1 Extension contracts: data for content, adapters for new behavior

Extensibility is a delivery requirement, not a cleanup task after the feature works. A new entry using an existing behavior should require definition data, its normal world/production integration, assets or fallback presentation, and regression coverage. It must not require adding the same ID to route execution, pricing, UI, AI, danger targeting, and save-cleanup switch statements.

Genuinely new behavior needs one typed adapter at the appropriate domain boundary plus its contract tests. Do not disguise new semantics with an ID-specific branch. Conversely, do not build a dynamic plugin loader, arbitrary script callbacks, generic command bus, or speculative crafting/weather simulation to prepare for hypothetical content. Use the existing static module composition and serializable data model.

| Extension | Definition / owner | Automatically inherited commerce behavior | When a new adapter is justified |
|---|---|---|---|
| Natural resource | Resource definition: reveal technology, native source/improvement rule, economic roles, effects, output, pricing, storage | Resource-backed good, quantity/access semantics, permitted offers, shipment, policy UI, forecasts, AI demand, cleanup | A genuinely new extraction/source mechanic |
| Manufactured or other non-deposit good | Good definition: producer/source owner, discovery/unlock, unit, economic uses, handling, settlement, pricing | Same market, budget, cargo, provenance, reservation, and presentation pipeline as resource-backed goods | A new production process or delivery settlement meaning |
| Trading unit | Existing unit catalog plus typed trade capability | Route chooser, eligible goods, capacity, ETA, automation, AI role candidates, danger matching, loss cleanup | A genuinely new transport domain or service behavior |
| Danger | Existing world-system owner plus a registered trade-danger adapter | Interruption state, affected service/payment, recovery hooks, entitled warning, notification deduplication | A new world effect not expressible by current movement/service/cargo consequences |

### 4.2 Resources and goods are related, distinct concepts

A resource is something the world/acquisition system recognizes. A good is something commerce can offer, carry, deliver, or consume. Generate resource-backed goods from the canonical resource definitions. A future good such as tools or medicine can instead reference its production owner, without an artificial map tile, mining improvement, or expansion of `ResourceType` just to carry it.

Use stable opaque `TradeGoodId` identifiers in manifests, offers, stock/reservation records, policies, and recipes. Do not infer semantics from an ID prefix or name. Resolve the definition through one validated lookup. Keep existing resource-based APIs as purpose-specific adapters for source quests, technology discovery, and worked-tile effects; do not force all game systems to become a generic goods engine.

A good's typed definition specifies:

- Identity, display/unit text, icon or existing fallback, and viewer knowledge/unlock rules.
- Native source/producer reference and whether legitimate native stock can be exported.
- Supported economic uses, including material recipes, operational fuel, or delivered access with explicit recipient/effect scope.
- Storage policy, base quote/band parameters, and how reserve/procurement defaults derive from actual uses.
- Integer cargo-space cost per quantity or service bundle and any required handling capabilities.
- One implemented settlement kind: stored quantity or continuing-access coverage initially. Adding another kind requires its own typed settlement implementation and invariants; an unknown kind must never silently fall through as stored material.

Keep definitions pure data. Runtime source, settlement, and knowledge adapters are registered separately under typed keys; missing handlers and invalid cross-references fail catalog validation. The source owner remains responsible for actual production and costs. Adding a good must not create free native goods through a commerce callback.

The initial resource-only carrying examples assume one cargo-space unit per material unit. The actual capacity rule is `sum(quantity × cargoSpacePerUnit) <= tradeCapacity`, so future bulky, compact, or restricted goods do not require rewriting manifests. Service bundles also have explicit cargo cost. Provenance and capacity remain meaningful when a route carries mixed goods.

### 4.3 Trading units declare capabilities once

Extend the canonical unit definition with a typed commerce capability: supported transport/service modes, trade cargo capacity, handling capabilities, endpoint infrastructure/range requirements where applicable, and relevant exposure tags. Reuse the unit's existing domain, movement, technology, production, upgrade, and presentation metadata rather than duplicating them in a second trade-unit catalog.

Generic predicates derive trade eligibility, AI trade roles, candidate generation, and hostile recognition from that capability. An ordinary new wagon or ship inherits the runner, budgets, manifests, quote calculation, and death cleanup. No `unit.type === 'caravan'` family whitelist, separate UI roster, or hardcoded list of upgraded merchant hulls is allowed for these generic behaviors.

Goods express required handling and units express supported handling. Compatibility is a shared capability query; special transport restrictions do not live in individual purchase buttons. Safe ordinary cargo works by default when its requirements are met; adding a normal good must not require editing every existing unit. A new transport domain still needs real movement, endpoint, renderer, and enemy-interaction support before its unit becomes available.

### 4.4 Dangers remain owned by their world systems

Combat, piracy, blockades, terrain obstruction, and any later danger retain their canonical simulation owners. Trade consumes their facts/results through a small typed adapter, rather than independently deciding damage, hostility, occupancy, or random loss.

Each adapter defines applicability by transport capabilities/exposure, spatial scope, the supported consequence (movement blocked/delayed, endpoint service/loading suspended, or a canonical cargo/carrier loss result), recovery/resume conditions, and public explanation/knowledge rules. Composition has a documented stable order; overlapping reports of the same blockade or attack cannot double-charge a loss or emit repeated notifications.

The runner reacts to consequences rather than branching on `pirates`, `barbarians`, or future actor names. Carrier loss still flows through canonical unit removal. A future storm may use the delay consequence if a real weather system supplies it, but this plan introduces no storm simulation or invisible chance-of-loss roll.

Preview danger is derived from entitled facts before forecasts and rankings are computed. Each new adapter must pass the existing viewer-safety differential and hot-seat tests; masking a hidden danger's name after it has already changed ETA, quote, ranking, or warning count is insufficient. Adapters must not trigger an unbounded map scan per route.

### 4.5 Extension completeness and compatibility tests

Every catalog entry receives definition-driven contract coverage. Tests enumerate the actual catalogs rather than duplicate the shipped roster in test code:

- Every tradable good has a real source/producer, implemented settlement kind, discoverability rule, use/benefit, price/storage policy, and reachable entitled UI representation. Invalid or unused goods are not offered for purchase.
- Every trainable trade unit has a coherent mode/endpoint/capacity definition, presentation fallback, generic AI production/role coverage, upgrade handling, compatible-goods query, and canonical movement/removal behavior.
- Every registered danger has applicability, one authoritative consequence owner, recovery behavior where applicable, entitled presentation, exactly-once interruption/loss handling, and relevant player/AI interaction coverage.
- A contract fixture introduces an additional definition using existing semantics and proves offer → quote → permitted load → travel → delivery/use plus cancellation/loss and save continuation. Test an additional resource-backed good, a non-deposit stock-backed good, a trader variant, and a danger adapter. Their IDs must not require new branches in the commerce pipeline. These are test fixtures, not new shipped manufacturing/weather features.
- Catalog validation rejects duplicate IDs, missing adapters, unknown recipe inputs, invalid cargo units, unsupported capability requirements, and delivery effects with no real recipient.

Persist IDs and plain data only; never registry indexes, class instances, functions, or display names. An additive catalog entry defaults safely in an existing save without resetting unrelated policy or inventory. Renaming/removing a persisted ID or changing its quantity/settlement meaning requires an explicit migration. Unsupported saved IDs follow the existing compatibility/error policy; never silently delete paid cargo or reinterpret it as another good. Explicit export grants remain closed for newly discovered strategic goods unless the player later authorizes them.

The durable commerce documentation will contain a short recipe for each extension type, naming the single definition owner, any necessary domain adapter, validation commands, and the integration test to extend. This is an acceptance criterion for MR19.



## 5. Ordered implementation issues

Merge in this order; an issue being closed is not proof its implementation is on main. Verify the linked MR history before starting a successor. Each child contains its exact scope, acceptance cases, and safe stopping point. Dependencies form the same sequential chain shown here.

- [ ] **MR01** — [#1498: Contain the broken instant resource marketplace](https://github.com/a1flecke/conquestoria/issues/1498)
- [ ] **MR02** — [#1499: Commercial permission and recipient-owned consent](https://github.com/a1flecke/conquestoria/issues/1499)
- [ ] **MR03** — [#1500: One route legality contract and knowledge-safe destination list](https://github.com/a1flecke/conquestoria/issues/1500)
- [ ] **MR04** — [#1501: Exact shared quotes and income that stops with service](https://github.com/a1flecke/conquestoria/issues/1501)
- [ ] **MR05** — [#1502: Persistent traders, return, and bounded recovery](https://github.com/a1flecke/conquestoria/issues/1502)
- [ ] **MR06** — [#1503: Real barbarian, pirate, and enemy pressure across trade roles](https://github.com/a1flecke/conquestoria/issues/1503)
- [ ] **MR07** — [#1504: Useful route choices and a coherent commerce overview](https://github.com/a1flecke/conquestoria/issues/1504)
- [ ] **MR08** — [#1505: Reserve kernel, native source accounting, and compatibility groundwork](https://github.com/a1flecke/conquestoria/issues/1505)
- [ ] **MR09** — [#1506: Activate reserves for hard material costs end to end](https://github.com/a1flecke/conquestoria/issues/1506)
- [ ] **MR10** — [#1507: Soft material spending, substitutions, and yield scope](https://github.com/a1flecke/conquestoria/issues/1507)
- [ ] **MR11** — [#1508: Seller surplus, public offers, and posted-price transactions](https://github.com/a1flecke/conquestoria/issues/1508)
- [ ] **MR12** — [#1509: Complete land-route imports, seller controls, and conservative AI](https://github.com/a1flecke/conquestoria/issues/1509)
- [ ] **MR13** — [#1510: Sea and existing air transport integration](https://github.com/a1flecke/conquestoria/issues/1510)
- [ ] **MR14** — [#1511: Luxury delivery and explicit resource benefits](https://github.com/a1flecke/conquestoria/issues/1511)
- [ ] **MR15** — [#1512: Selected industrial fuel demand and graceful shortages](https://github.com/a1flecke/conquestoria/issues/1512)
- [ ] **MR16** — [#1513: Complete standing orders, forecasts, and low-noise intervention UI](https://github.com/a1flecke/conquestoria/issues/1513)
- [ ] **MR17** — [#1514: Strategic AI use, resilience, and transparent competition](https://github.com/a1flecke/conquestoria/issues/1514)
- [ ] **MR18** — [#1515: Balance and player-experience acceptance pass](https://github.com/a1flecke/conquestoria/issues/1515)
- [ ] **MR19** — [#1516: Remove the retired market and close the implementation plan](https://github.com/a1flecke/conquestoria/issues/1516)

## 6. Player truth table and UI guardrails

| Before / action | State change | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Open chooser for available trader | None | Known destinations, exact route terms, own origin/slot, permitted path and known dangers | All entitled destinations beyond recommendations |
| Confirm eligible assignment | One commitment/slot/action, positioning or outbound state | Route appears; unit/status/HUD refresh; positioning earns zero | View route, pause, cancel/return |
| Confirm a stale assignment | No mutation | Entitled denial and refreshed quote/list | Other legal assignments |
| Offer commercial agreement | Pending recipient-owned request | `Awaiting response`; no access yet | Withdraw proposal; recipient accept/refuse |
| Authorize partner's iron exports | Directional grant | Partner/resource status changes immediately | Revoke and protected-reserve controls |
| Change reserve target or spending cap | Standing policy only | Target/forecast/next eligible purchase update | All other orders and already-owned manifests |
| Reorder cargo priorities | Next-load priority changes | Priority order and forecast update | Every order, including low-ranked goods |
| Supplier loads cargo | Goods/payment/storage claim transferred atomically | Buyer shows in transit; seller shows sale; usable reserve unchanged | Manifest, cost, destination, loss consequence |
| Trader delivers at home | Manifest credited once, claim released | Stored/incoming/committed/free counts and relevant production state refresh | Continue route or change assignment |
| Route becomes blocked | No further service payment/load | `Blocked`, current income zero, ETA delayed; one useful warning | Known alternatives and cancel/return |
| Trader destroyed | Cargo removed, slot released, replenishment stops | Loss details and remaining reserve runway | Replacement choices without automatic purchase |
| Cancel after loading | Stop new buys; return with cargo | `Returning with …`; slot still occupied | View goods and return destination |
| Active production loses funding opportunity | Wait or use prior valid commitment | Missing quantity, preserved progress, honest ETA | Resource-free alternatives and queue controls |
| Switch hot-seat viewer or reopen | Reproject for viewer | No prior viewer's offers, stock, requests, or map targets remain | That viewer's complete entitled catalog |

### Misleading UI risks and negative boundaries

- `Known resource` requires reveal technology; `available offer` additionally needs entitled commercial disclosure. Knowing iron alone reveals no supplier count.
- `Reachable` requires an explored domain-compatible corridor; a geometric line, one known endpoint, or military open borders alone is insufficient.
- `Available now` also requires unit action, owner turn, capacity, permission, and applicable money/stock. A partially met conjunction must not receive that label.
- `Stored` excludes incoming cargo. `Free` excludes active commitments. A purchase order is neither an owned shipment nor a promised delivery. Label the Gold luxury distinctly from treasury gold so purchase/benefit copy cannot confuse the two.
- `Lower known danger` describes entitled evidence, never guaranteed safety. Hidden hostile mutations cannot change it.
- `Operating +4` and `currently earning 0` must coexist honestly during interruption. Displayed rates include the same modifiers as settlement.
- `Supplier protecting reserves` is shown only when deliberately disclosed by the supplier. Otherwise show the entitled public absence of an offer without exposing secret commitments.
- `All known destinations` is complete even if recommended rows are bounded. Unknown entities do not get anonymous placeholders.
- Native tile bonuses, national access benefits, and destination-specific route yields have different scope labels and tests.

### Interaction replay checklist

- [ ] Open via the real launcher; choose origin; inspect path; confirm; inspect live state and DOM.
- [ ] Add first resource order, add a second, reorder, edit a cap, remove one; confirm unrelated orders survive.
- [ ] Repeat the same action through stale DOM and an overlapping callback; prove one mutation, then prove a later valid action still works.
- [ ] Change active production, queue another, reorder, remove, and reopen; verify commitments, order, visible ETA, and resource-free alternatives.
- [ ] Advance to loading and delivery; inspect stock, gold, cargo, and status without closing/reopening the panel as a workaround.
- [ ] Pause/resume, block/unblock, cancel/return, lose trader, replace explicitly, save/load mid-trip.
- [ ] Switch hot-seat viewer before answering a proposal; answer through the recipient and verify both panels.
- [ ] Exercise touch-sized and keyboard activation with semantic outcome assertions, not only successful event dispatch.

### Queue and ETA checklist

The production queue keeps its active item and follow-ups visible. Only the active item holds materials; later entries show estimated needs. Reorder/remove updates the commitment and ETA in the same rendered panel. Invalid or unfunded work waits with a reason and preserves progress according to the declared policy, rather than silently disappearing.

The shipment list is a manifest/arrival list, not a promise queue. Loading priority is shown separately. ETA names its destination and assumption; blocked/unknown future travel produces a delay/uncertainty label. Reordering future purchases cannot reorder goods already traveling. A new enemy, permission loss, or destroyed endpoint invalidates the forecast and refreshes its visible explanation.

## 7. Implementation and verification procedure for every slice

### Before work

- [ ] Read the owning issue and approved plan; verify prerequisites against merged MR history, not unchecked plan boxes.
- [ ] Inspect only the named paths and their real callers. Fetch current main, create a fresh linked worktree/branch, set up hooks, and verify `.githooks`. Install unchanged dependencies only when needed.
- [ ] Read matching canonical rules: game systems, action contracts, UI/privacy, input, renderer, AI, persistence, incremental delivery, and spec fidelity as applicable.
- [ ] Record the slice's player-visible surfaces, persistence change, compatibility rule, and smallest exact regression.

### Per behavior, use small test-first steps

- [ ] Add the failing regression for the named fixture and assert the exact visible/state result.
- [ ] Run the narrow mirrored test and confirm the intended failure, not a broken fixture.
- [ ] Implement the smallest canonical rule change; wire every actual player/AI/automation caller affected by that behavior.
- [ ] Rerun the focused tests. After two materially similar failures, stop and report the blocker rather than expanding speculative edits.
- [ ] Inspect the focused diff, then commit that coherent behavior in the task worktree. Do not stage unrelated files.

Examples of focused commands using existing test files:

```text
./scripts/dev.sh test tests/systems/resource-acquisition-system.test.ts tests/ui/marketplace-panel.test.ts
./scripts/dev.sh test tests/systems/trade-system.test.ts tests/systems/trade-modules.test.ts tests/ui/city-panel-trade-routes.test.ts
./scripts/dev.sh test tests/systems/production-enqueue-contract.test.ts tests/systems/production-cost-parity.test.ts tests/systems/unit-production-completion.test.ts
./scripts/dev.sh test tests/storage/save-migrations.test.ts tests/storage/save-compat-coverage.test.ts tests/storage/save-persisted-shape-ratchet.test.ts
```

New modules receive their mirrored test paths, introduced in their own slice. UI behavior added to existing panels extends their existing tests plus a real controller/browser replay. Use the repository viewer-safety differential harness and earned controls; an empty projection must not pass privacy tests vacuously.

### Persistence and invariants

- [ ] Each changed persisted shape gets the correct ordered migration and schema-version bump, or the narrowly justified additive proof the rules permit. Never use corruption repair to replace a required migration.
- [ ] Update the save-compat fixture manifest, persisted-shape coverage, new-game/load-canonical contract, deterministic continuation, and eliminated-civ area classification as needed.
- [ ] Classify manifests/reservations/permissions for civ elimination and endpoint capture. Elimination stops live obligations; it never recreates stock or clears another civ's goods accidentally.
- [ ] Run resource conservation and nonnegative stock assertions across load, arrival, cancellation, destruction, and completion.
- [ ] Avoid new unbounded world scans in quote rendering and per-trader pathfinding. Cache only under actual state/knowledge revisions; fogged hidden changes cannot invalidate a player's offer in a revealing way.

### Before publishing an MR

The executable `verify:impact` contract selects required evidence; this plan does not introduce a second required-gate matrix. Run `./scripts/dev.sh verify-impact` for the actual changed paths/status and satisfy what it reports. Start with source-rule checks and all existing mirrored tests for changed source paths. Reuse valid durable evidence for the same clean HEAD rather than repeating heavy runs.

At the inspected baseline, the contract includes build and durable full-suite evidence, plus path-dependent checks such as AI playability, storage/performance, Tauri frontend, wonder regressions, new-test shard allocation, and documentation lifecycle. Use its current output at implementation time. Browser/interaction and scenario checks specified here prove feature acceptance; do not claim the feature complete from unit tests alone.

Adding/renaming a default Vitest file requires the existing measured CI-shard process and shard-selection test. Costly simulations also need the intensive-simulation local classification. Browser coverage stays in `tests/e2e/`. Do not widen timeouts, weaken privacy/conservation assertions, or invent a permissive wrapper to make validation pass.

Run long verification through the existing host-safe helper and status mechanism. Preserve the session/proof until normal completion; never start duplicate verification or a second push because a stream was truncated. Do not stop processes by name.

Inspect committed and uncommitted full diffs against current main. An MR description states what changed, exact validation, out-of-scope work, and why this partial state is playable. A source/UI slice cannot expose an action whose executor is deferred. Inactive foundation code must have tests and no player-facing promise.

Do not merge or close remote issues automatically. After a later explicit merge authorization, follow the current repository merge policy. Shared gameplay/UI/save rules remain distribution-neutral; storage changes follow impact-selected dual-release evidence. Web assets retain `/conquestoria/`, and the Tauri frontend retains relative asset paths.

## 8. Acceptance scenarios and balance measurements

| Scenario | Required observation |
|---|---|
| Unmet iron-rich rival | No supplier row, quote change, count, named warning, or map target |
| Known rival, unknown city | Contact alone yields no hidden destination |
| Known city, unexplored gap | No commercial path invented through the gap |
| Known path, no commercial right | Explained refusal; military open borders is insufficient |
| Cheap distant source versus dear nearby source | Quote exposes cost, throughput, delay, and known exposure; neither wins solely from arbitrary distance gold |
| Two buyers and one scarce supplier | Finite shared surplus, payment conservation, no duplicate allocation; measure repeated buyer starvation |
| Seller protecting war production | Domestic commitments and protected reserve prevent export; buyer cannot pay through refusal |
| Native mine occupied or pillaged | New extraction ceases; stored reserves and bought cargo remain; future offers respond under declared policy |
| Land raid and naval blockade | Actual trader/service/cargo consequences; no invisible random-loss substitute |
| Target reached | Cargo purchasing pauses; normal route continues; no repeated order required |
| Treasury threatened | Shared allowance/floor stops buying before essential upkeep is starved |
| Production shortage | Preserved progress, exact missing quantity, honest ETA, reachable alternatives |
| Fuel interruption | Visible finite response window and specified fallback output, no deleted army/building |
| Lost supplier or origin city | Ownership and return behavior remain coherent; no free cargo or teleport |
| Multiple healthy round trips | Zero confirmation per trip and no routine trader rebuilding |
| Luxury renewal interrupted | Delivered benefit persists to visible expiry and then ends once |
| Save/load at every shipment transition | Same balances, route next step, consent, pricing period, and deterministic continuation |
| Hot-seat asymmetric knowledge | Only entitled viewer learns the changed information |
| New resource or manufactured-good definition | Existing offer, pricing, permission, cargo, budget, UI, AI, delivery, and cleanup pipeline works without resource-ID branches |
| New compatible trade-unit definition | Shared route and cargo rules, AI roles, hostile applicability, and removal work without adding its ID to multiple rosters |
| New danger adapter | Existing interruption/recovery/presentation flow applies once, respects knowledge, and adds no duplicate combat or movement rules |

Measure source output versus recipe/consumer demand; reserve runway; cargo throughput and round-trip length; total import spending versus treasury income; route operating reward; supplier revenue; losses and replacement costs; unfunded-production waiting; AI useful production; notifications and manual decisions per healthy trip. Use those measurements to tune the initial profile, not fabricated certainty about fun.

Suggested playtest targets to evaluate: a healthy route needs no input for at least five round trips; a first interruption produces one actionable notice; normal reserve policies provide several turns to respond; a lost early trader is recoverable through existing gameplay rather than a special compensation grant; imports unlock valuable plans without replacing exploration, domestic development, or conquest. Exact numerical thresholds become retained regression envelopes only after baseline measurement.

## 9. Dependency order, pause points, and issue publication

Default order:

```text
01 containment
 → 02 permissions → 03 legal known routes → 04 truthful income
 → 05 persistent return → 06 hostile pressure                    [A: caravans]
 → 07 route variety/UI → 08 reserve kernel → 09 hard costs       [B: domestic reserves]
 → 10 soft costs → 11 offers/prices → 12 land shipments          [C: land imports]
 → 13 transport domains → 14 luxuries → 15 industrial fuel       [D: trade dependence]
 → 16 automation/UI → 17 strategic AI → 18 balance               [E: complete experience]
 → 19 retirement and durable documentation
```

Any merged slice is a safe pause, with the explicit limitations described above. Milestones A–E are especially useful stopping points. Do not turn on half of a cargo transaction because a work session or token budget is ending. Split an oversized slice into tested inactive groundwork and a complete activation slice, with an updated child issue and explicit dependencies.

### Publication and documentation lifecycle

- [x] Design and extensibility requirements approved by the requester on 2026-10-17.
- [x] Publish all 19 child issues and their dependency links in the ordered index above. Publication readback verification is recorded by the publishing agent; implementation remains unstarted.
- [x] Before gameplay implementation, register this approved plan in a small documentation MR at `docs/superpowers/plans/2026-10-17-trading-marketplace.md`, classified `active` in `docs/docs-lifecycle-manifest.json` and owned by this open parent. Assemble the full approved document from this parent and the numbered child scopes; there is no dependency on a temporary local file.
- [ ] Keep the parent, child issues, and any active in-repository plan accurate as implementation MRs merge. Do not mark a slice complete solely because a token budget ended.
- [ ] In the final implementation MR, promote stable rules and extension recipes into `docs/commerce.md`, delete the active plan, and update the lifecycle manifest. Issue and Git history preserve the record.

Approval authorizes publication of this plan and the ordered issues. It does not authorize automatic merging, closing issues, subagents, fast mode, or unrelated gameplay expansion. Gameplay implementation has not started.


---

# Appendix — published child scopes (MR01–MR19)

Each section below reproduces the published scope, acceptance cases, dependencies, and safe
stopping point of one ordered child issue. Merge in the order listed; a closed issue is not proof
that its implementation is on main, so verify the linked MR history before starting a successor.

---

## MR01 — #1498 [Trade & Supply MR01] Contain the broken instant resource marketplace

Published scope: https://github.com/a1flecke/conquestoria/issues/1498

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 1 of 19.** **Prerequisite:** the approved parent plan and its preparatory documentation registration MR. Register the active plan and lifecycle-manifest ownership before gameplay implementation.

This issue publishes the approved MR01 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR01 — Contain the broken instant resource marketplace

**Depends on:** approved plan. **Size:** small. **Player result:** resource purchases are temporarily unavailable with an honest explanation; existing caravans remain usable.

**Modify:** `resource-acquisition-system.ts`, `ai-resource-marketplace.ts`, `marketplace-panel.ts`, `diplomacy-trade-panel-actions-controller.ts`. Extend existing `tests/systems/resource-acquisition-system.test.ts`, `tests/ai/ai-resource-marketplace.test.ts`, and `tests/ui/marketplace-panel.test.ts`.

- [ ] Add a canonical typed `resource-market-rebuilding` denial before any instant-buy write; reject direct and stale callbacks as well as buttons.
- [ ] Replace the buy section and misleading global price/fashion advertising with `Resource imports are being rebuilt. Trade routes remain available.`
- [ ] Stop AI instant purchases through the same rule. Keep already-purchased access valid until its recorded expiry; do not fabricate a seller, resource quantity, refund, or new duration.
- [ ] Keep domestic resource acquisition, current production eligibility, and ordinary routes unchanged in this containment slice. Preserve old data for ordered migration.
- [ ] Verify expired legacy access disappears at the normal boundary, including after reload and in hot seat.

**Exact regression:** buyer has gold, technology, and a known peaceful seller; direct purchase returns the rebuilding denial and neither treasury nor access changes. Rendered UI contains the explanation and no purchase button or hidden-price tooltip. This is an interim resource-market shutdown, not a claim that caravan legality is already repaired.

**Safe stopping point:** the base game and old caravans operate; instant imports stay unavailable indefinitely if work pauses.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR02 — #1499 [Trade & Supply MR02] Commercial permission and recipient-owned consent

Published scope: https://github.com/a1flecke/conquestoria/issues/1499

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 2 of 19.** **Merge prerequisite:** [MR01 — #1498](https://github.com/a1flecke/conquestoria/issues/1498) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR02 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR02 — Commercial permission and recipient-owned consent

**Depends on:** MR01. **Size:** medium. **Player result:** a commercial agreement is a real, simple diplomatic choice, separate from army access.

**Modify:** diplomacy action/request/treaty owners and panel/controller; `trade-route-lifecycle.ts`; persisted commerce types, new-game initialization, and ordered migration. **Create:** `commerce-permissions.ts` and its mirrored test when needed.

- [ ] Implement proposal, recipient acceptance/refusal, and revocation with canonical typed denials. One signed agreement grants commercial passage between its parties; it grants no military movement.
- [ ] Add directional strategic-resource grants in the data model, but hide their controls until cargo purchases are live in MR12.
- [ ] Add the explicit minor-civ adapter. Do not lock minor-civ trade quests behind an unavailable major-civ treaty action.
- [ ] New foreign assignments require commercial permission. Existing legacy assignments may finish their current round trip under a recorded route-only transition allowance; that allowance permits neither a new route nor resource buying and expires at the boundary. Missing permissions then require return/pause.
- [ ] War, embargo, elimination, and revocation update permissions through canonical lifecycle owners. A stale acceptance must not revive an invalid proposal.

**Tests:** commercial agreement without military open borders permits commerce only; military open borders alone is insufficient; unanswered human proposal grants nothing; AI cannot force human acceptance; both hot-seat recipients see only their requests; third-party passage and minor-civ permission cases; reload does not refresh a legacy allowance.

**Safe stopping point:** ordinary commerce has a consent model; imports remain disabled.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR03 — #1500 [Trade & Supply MR03] One route legality contract and knowledge-safe destination list

Published scope: https://github.com/a1flecke/conquestoria/issues/1500

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 3 of 19.** **Merge prerequisite:** [MR02 — #1499](https://github.com/a1flecke/conquestoria/issues/1499) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR03 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR03 — One route legality contract and knowledge-safe destination list

**Depends on:** MR02. **Size:** medium.

**Modify:** `trade-caravan-system.ts`, `quest-aware-trade-system.ts`, `establish-route-panel.ts`, live diplomacy controller, `basic-ai.ts`, and `docs/action-contract-inventory.md`. **Create:** `trade-route-contract.ts` and `commerce-projection.ts` as used.

- [ ] Replace free-string/throwing creation failures with a closed denial union and copy. The executor rechecks the same query before any write.
- [ ] Validate trade role, ownership, owner turn, unspent action, unit availability, chosen origin, slot, destination discovery, explored corridor, domain capability, and commercial rights across the route.
- [ ] Route the trader physically to the chosen origin; show positioning ETA and pay no commerce income during positioning.
- [ ] Derive the chooser and AI candidates from their entitled knowledge. Add a known-destinations view with entitled denial reasons; never list unknown destinations.
- [ ] Derive eligible trader types and their endpoint requirements from canonical unit capabilities. Add no new hand-maintained unit roster in the chooser or AI.
- [ ] Return quest transitions only after successful creation. Repeated Confirm creates one route, consumes one slot/action, and progresses a quest once.

**Tests:** each gate fails independently; technology without a corridor and corridor without permission both fail. Unknown-city name/ID/count/order/tooltip never appears. A hidden enemy away from the next movement step changes neither preview nor public denial. A stale callback after war or slot use fails without mutation. Cover land, naval, existing air trade roles, map wrapping, and human/AI parity.

**Safe stopping point:** route creation is bounded and information-safe, even before reward/lifecycle improvements.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR04 — #1501 [Trade & Supply MR04] Exact shared quotes and income that stops with service

Published scope: https://github.com/a1flecke/conquestoria/issues/1501

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 4 of 19.** **Merge prerequisite:** [MR03 — #1500](https://github.com/a1flecke/conquestoria/issues/1500) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR04 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR04 — Exact shared quotes and income that stops with service

**Depends on:** MR03. **Size:** medium.

**Modify:** `trade-route-economy.ts`, `trade-route-contract.ts`, runner integration in `unit-movement-system.ts`, `trade-income.ts`, route chooser and shared route rows. Add persistent settlement fields with their migration.

- [ ] Produce one quote containing path-based timing, normal operating reward, recipient, modifiers, and bounded service-round budget. Remove caller-supplied resource-diversity guesses.
- [ ] Use entitled endpoint facts and explicit agreements for modifiers; hidden world resource diversity and enemy research do not secretly improve visible quotes.
- [ ] Record actual progress/endpoint service in the runner; settle once after hostile phases only for a live, eligible operating trader. Paused/blocked/positioning routes pay zero.
- [ ] Freeze terms for the current round trip; refresh at home. Use stable settlement identity so save/reload or repeat entry cannot pay twice.
- [ ] Show promised operating rate and current actual status consistently in marketplace, city, unit, and HUD totals.

**Golden fixture:** a +4 operating route advances and survives: +4 once. Same state replay: +0 additional. Next round blocked: +0. Trader killed by pirates before settlement: +0. Long detour cannot exceed the leg's payable-round budget. Preview and first realized eligible payment use identical modifiers.

**Safe stopping point:** gold caravans have truthful rewards and meaningful economic interruption.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR05 — #1502 [Trade & Supply MR05] Persistent traders, return, and bounded recovery

Published scope: https://github.com/a1flecke/conquestoria/issues/1502

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 5 of 19.** **Merge prerequisite:** [MR04 — #1501](https://github.com/a1flecke/conquestoria/issues/1501) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR05 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR05 — Persistent traders, return, and bounded recovery

**Depends on:** MR04. **Size:** medium.

**Create:** `trade-route-runner.ts`; keep the existing public runner entry delegating to it. **Modify:** route lifecycle, unit removal, route unit controls, shared route presentation, trade-tier metadata/descriptions, and ordered migration.

- [ ] Replace trips-exhausted destruction with repeat at home. Preserve the trader after successful commerce.
- [ ] Implement pause, resume, cancel-and-return, explicit reassignment at home, and an alternative known home after endpoint loss. Every action uses a query/executor pair.
- [ ] Persist the committed path/leg and detour allowance. Use existing movement validation and the one real movement budget for each step; do not retain spread-copy position writes that bypass occupancy/hostility rules.
- [ ] Translate old finite-trip bonuses to explicit persistent-route benefits, updating all related tech/building/wonder descriptions and test expectations together.
- [ ] Keep a slot occupied until safe completion of return or destruction. Provide deliberate abandonment for a permanently stranded trader through canonical removal, with its consequence shown. Already-bought cargo integration hooks must not require future UI controls to work.

**Tests:** multiple complete trips retain the same unit; cancellation returns without teleporting or earning new outbound income; repeated pause/resume/cancel is idempotent; origin capture, destination razing, no permitted return path, and slot loss have stable visible states; known bounded detour works, unknown or over-budget detour does not. Roads, terrain costs, and unit speed match ETA; manual plus automated movement cannot spend the budget twice. Reopen/save/reload preserves the same next step.

**Safe stopping point:** ordinary routes run indefinitely without routine retraining, and can be changed honestly.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR06 — #1503 [Trade & Supply MR06] Real barbarian, pirate, and enemy pressure across trade roles

Published scope: https://github.com/a1flecke/conquestoria/issues/1503

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 6 of 19.** **Merge prerequisite:** [MR05 — #1502](https://github.com/a1flecke/conquestoria/issues/1502) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR06 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR06 — Real barbarian, pirate, and enemy pressure across trade roles

**Depends on:** MR05. **Size:** medium.

**Modify:** `barbarian-system.ts`, `pirate-behavior.ts`, `pirate-system.ts`, shared owner-kind/attack queries only if needed, `unit-removal-system.ts`, route lifecycle/projection, notification routing. Derive targeting from existing trade-role metadata rather than a second unit roster.

- [ ] Make relevant land raiders recognize all land trade tiers and naval pirates recognize merchant hulls, preserving existing protection/tribute and bounded targeting rules.
- [ ] Introduce the focused danger adapters over existing combat/blockade facts. Use typed common consequences and exposure applicability; prove a new compatible trader inherits targeting without adding its ID to a hostile system.
- [ ] Route attacks use canonical combat and removal. A caravan cannot share an enemy-occupied tile or pass a real blocker because its owner is not a major-civ war-list entry.
- [ ] Connect existing blockade facts to affected route service. Derive known-danger presentation only from entitled sightings/intel; do not add hidden random shipment losses.
- [ ] Ensure destruction, capture, and endpoint loss release the correct route/slot exactly once and stop income.
- [ ] Deliver one recipient-scoped interruption/loss notification plus persistent map/route status. Do not repeatedly toast a stationary blockade.

**Tests:** barbarian attacks caravan and upgraded wagon; pirate attacks naval trader and upgraded hull; major enemy targets eligible trade unit; existing pirate protection is honored; clearing the actual threat restores movement; a hidden fleet does not alter the preview; both player and non-player combat cleanup stop payment. Existing troop transport cargo remains intact under its separate rules.

**Safe stopping point / Milestone A:** a complete, useful, vulnerable gold-caravan game. Resource imports remain honestly unavailable.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR07 — #1504 [Trade & Supply MR07] Useful route choices and a coherent commerce overview

Published scope: https://github.com/a1flecke/conquestoria/issues/1504

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 7 of 19.** **Merge prerequisite:** [MR06 — #1503](https://github.com/a1flecke/conquestoria/issues/1503) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR07 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR07 — Useful route choices and a coherent commerce overview

**Depends on:** MR06. **Size:** medium.

**Modify:** route reward definitions/economy, actual yield recipients, marketplace/chooser/shared route rows and live controllers. Keep the existing Marketplace launcher but label the panel `Trade & Supply`.

- [ ] Offer a small definition-driven set: foreign commerce for gold; domestic provisioning for destination food or production; research exchange only under its explicit agreement/tech conditions. Price the modes as alternatives with real recipient labels.
- [ ] Do not grant free food/production to every city or invent a new culture pool. Add recipient-specific settlement to the actual city/research path, respecting blockades and once-per-round settlement.
- [ ] Present Routes, Supplies, and Policies sections. At this stage Supplies explains unavailable imports; it exposes no unfinished purchase controls.
- [ ] Provide short recommendations for profitable, useful-development, and lower-known-danger routes, while keeping all entitled destinations reachable through `All known destinations`.
- [ ] Show map route, operating yields, positioning/travel ETA, known danger, and cancel/return consequence before confirmation.

**Tests:** click through the live launcher and chooser, create a route, inspect city/HUD/route row changes; every legal destination remains reachable beyond recommendations; recipient food/production/research changes once and only at the named recipient; negative case proves domestic food mode does not also receive foreign-commerce gold. Keyboard, touch-sized controls, and hot-seat reopen all work.

**Safe stopping point:** route choice has strategic variety and the finished overview can host supply later.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR08 — #1505 [Trade & Supply MR08] Reserve kernel, native source accounting, and compatibility groundwork

Published scope: https://github.com/a1flecke/conquestoria/issues/1505

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 8 of 19.** **Merge prerequisite:** [MR07 — #1504](https://github.com/a1flecke/conquestoria/issues/1504) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR08 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR08 — Reserve kernel, native source accounting, and compatibility groundwork

**Depends on:** MR07. **Size:** small-to-medium. **Visibility:** quantitative economy remains inactive.

**Create:** `resource-reserve-system.ts` and focused tests. **Modify:** economic-role metadata in `resource-definitions.ts`; source eligibility adapter; commerce types as needed. Avoid creating live persistent fields until their activation migration is ready in MR09.

- [ ] Define integer native/imported balances, active reservations, incoming storage claims, and conservation assertions.
- [ ] Establish the goods-definition composition and stable good IDs now: derive natural-resource goods from the existing catalog, keep ledgers/recipes generic over goods, and support test-defined non-deposit goods without shipping a manufacturing feature.
- [ ] Share acquisition source predicates while preserving the distinct existing meaning of `getActiveResourceSourceCount` for physically-owned-source quests.
- [ ] Implement pure accrual/spend/reserve/release calculations, source deduplication, capacity behavior, and deterministic consumption provenance.
- [ ] Add catalog classification for every resource and validation that every quantitative role has a real source and intended use. Keep cattle/salt non-quantitative for this project.
- [ ] Validate source/settlement/knowledge adapter references and extension completeness. Add contract fixtures proving new ordinary goods use the existing arithmetic and conservation rules.
- [ ] Prepare a pinned migration fixture and starting-stock calculation for MR09; do not expose a resource panel whose numbers are not yet authoritative.

**Tests:** completed versus unfinished mine, tech-only versus source-only, occupied source, outpost, city-center exception, duplicate ownership lists, cap/overflow, no negative balance, release twice, imported stock cannot export, and new-game/load-canonical data. Pure conservation case: produce 10, load 4, deliver 4, consume 3, destroy 2 in a second shipment; totals match each recorded sink/source.

**Safe stopping point:** tested groundwork merges without changing current player economics.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR09 — #1506 [Trade & Supply MR09] Activate reserves for hard material costs end to end

Published scope: https://github.com/a1flecke/conquestoria/issues/1506

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 9 of 19.** **Merge prerequisite:** [MR08 — #1505](https://github.com/a1flecke/conquestoria/issues/1505) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR09 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR09 — Activate reserves for hard material costs end to end

**Depends on:** MR08. **Size:** medium-to-large; keep the generic catalog conversion focused.

**Modify:** material catalog/type metadata, `city-production-eligibility.ts`, `city-availability.ts`, `planning-system.ts`, `city-turn.ts`, per-civ production, `economy-system.ts`, `unit-upgrade-system.ts`, production presentation/UI, AI production, new-game state, and ordered migration. **Create:** `resource-material-costs.ts`, `commerce-resources.ts` when first used.

- [ ] Convert existing hard-resource requirements to explicit recipes, with one catalog-based evaluator. Start from the calibrated standard recipe and record every intentional exception in data.
- [ ] Activate native extraction and storage before production. Implement active-item reservations, waiting state, completion spend, reorder/release, rush-buy, and upgrade atomicity through their canonical owners.
- [ ] Separate browseable/plannable production from `fundable now`; show missing quantity and waiting reason. Keep resource-poor predecessor/alternative units usable.
- [ ] Add the live Supplies reserve table and city material cost/commitment/ETA rows. AI evaluates the same recipes and chooses a useful alternative rather than endlessly re-enqueueing an unfundable item.
- [ ] Migrate existing games once: seed a bounded native starter reserve from eligible sources; reserve current active hard recipes where valid; honor already-paid active-item commitments through an explicit migration credit if necessary. Credits cannot be exported and do not recur on reload. Finished units/buildings are not charged retroactively.
- [ ] Existing purchased-access-only active work receives its bounded transition credit; unexpired access remains legacy-only until normal expiry. It does not become an infinite source or exportable stock.

**Tests:** two cities cannot commit the same 10 iron; only active entries reserve; production shortage preserves progress; remove/reorder updates material/ETA text immediately; one-item rush-buy and upgrade consume exactly once; failed placement consumes nothing; imported versus native provenance is correct; existing/source-poor late-era saves remain playable; hot-seat owner context never uses the viewer's stock. Pin round-order and save continuity changes.

**Safe stopping point / Milestone B:** a functional domestic strategic-reserve economy, with imports still disabled. If this slice exceeds a work budget, split off a non-live reservation/persistence kernel first; activation still ships with every canonical production consumer and live UI in one coherent slice.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR10 — #1507 [Trade & Supply MR10] Soft material spending, substitutions, and yield scope

Published scope: https://github.com/a1flecke/conquestoria/issues/1507

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 10 of 19.** **Merge prerequisite:** [MR09 — #1506](https://github.com/a1flecke/conquestoria/issues/1506) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR10 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR10 — Soft material spending, substitutions, and yield scope

**Depends on:** MR09. **Size:** medium.

**Modify:** `resource-advantages.ts`, `city-production-cost.ts`, `production-cost-context.ts`, material commitments, national-project substitution integration, resource yield adapter, resource/city presentation, AI costing.

- [ ] Add finite optional material recipes to current soft-discount entries. One stored unit cannot discount arbitrarily many items. Freeze selected material-backed terms for active work; queued entries remain estimates until activation.
- [ ] Preserve the aggregate discount floor/cap and catalog substitution eligibility. Circular Manufacturing supplies a soft alternative but never stock, hard-material access, or fuel.
- [ ] Remove strategic access-to-every-city yield duplication. Preserve native worked-tile effects and explicitly scoped access effects; show where each benefit applies.
- [ ] Keep full production cost parity among city panel, queue, normal completion, rush-buy, upgrade preview, and AI.

**Tests:** two factories cannot spend the same soft coal allotment; without coal normal-cost production remains possible; substitution does not permit a hard uranium weapon or create exports; active discount survives unrelated offer changes without repeated charge; imported iron grants no foreign-mine tile output; existing resource effect descriptions match actual recipients.

**Safe stopping point:** hard and optional material uses are economically coherent without foreign procurement.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR11 — #1508 [Trade & Supply MR11] Seller surplus, public offers, and posted-price transactions

Published scope: https://github.com/a1flecke/conquestoria/issues/1508

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 11 of 19.** **Merge prerequisite:** [MR10 — #1507](https://github.com/a1flecke/conquestoria/issues/1507) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR11 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR11 — Seller surplus, public offers, and posted-price transactions

**Depends on:** MR10. **Size:** medium. **Visibility:** no purchasing controls until MR12.

**Create:** `resource-market-offers.ts`. **Modify:** commerce permissions/types, reserve kernel, economy settlement helpers, old world-price caller only to remove remaining influence. Introduce ordered persistence only for state actually needed by the transaction owner.

- [ ] Implement protected-reserve and partner-resource policies with native-only surplus and active domestic commitments.
- [ ] Derive one once-per-round offer snapshot per supplier/resource/eligible partner terms; implement discrete price bands, hysteresis, tariffs, public disclosures, and rotating allocation among same-round arrivals.
- [ ] Define atomic loading quote/commit inputs and result payloads. No UI or AI may directly debit stock or transfer trade payment.
- [ ] Key offers and policies by good ID, taking defaults from validated definitions. Price and surplus rules must not special-case the shipped resource names or assume every good comes from a hex deposit.
- [ ] Add shared national procurement allowance and treasury-floor checks for use by MR12. A price above the cap produces a typed skip, never a surprise purchase.
- [ ] Keep offers invisible to a buyer lacking knowledge or permission; do not let hidden unrelated supply affect quotes, row order, or availability.

**Golden fixture:** supplier native 30, committed 10, protected reserve 12 yields 8 exportable; imported stock does not increase this. Two 6-unit load attempts cannot both succeed for 6. With one scarce unit available each round, the retained cursor alternates eligible waiting buyers rather than starving the higher-ID buyer. Buyer/seller/tariff balances conserve the purchase payment. A stale quote above the cap leaves all balances unchanged.

**Safe stopping point:** tested market engine with no exposed incomplete transaction path.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR12 — #1509 [Trade & Supply MR12] Complete land-route imports, seller controls, and conservative AI

Published scope: https://github.com/a1flecke/conquestoria/issues/1509

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 12 of 19.** **Merge prerequisite:** [MR11 — #1508](https://github.com/a1flecke/conquestoria/issues/1508) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR12 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR12 — Complete land-route imports, seller controls, and conservative AI

**Depends on:** MR11 and the completed caravan milestone. **Size:** medium-to-large vertical slice.

**Create:** `resource-shipment-system.ts`, initial `resource-procurement.ts`, live policy/reserve DOM sections. **Modify:** runner endpoint transitions, unit removal, marketplace and route chooser, diplomacy export controls, controllers, AI marketplace adapter, migrations.

- [ ] Add one atomic load at supplier arrival, a persisted resource manifest, and one delivery at home. Goods are not usable while outbound/inbound.
- [ ] Store stable good IDs in the manifest and dispatch through the implemented settlement kind. Enforce mixed cargo-space/handling limits through the same capability query in preview, AI, and loading.
- [ ] Expose seller reserve/partner controls and buyer target, maximum price, round budget, and treasury floor. Default human strategic exports remain closed; AI uses a conservative explicit policy through the same writer.
- [ ] Permit several material types per manifest under shared capacity and priority. Account for all incoming manifests before another route buys.
- [ ] Show current storage, commitment, incoming quantity, next delivery ETA, full loading cost, normal route income, and cargo loss consequence. Enable the new import feature only when this entire path is wired.
- [ ] Replace the old AI ten-turn access purchase with conservative route-based procurement: known supplier, signed permission, affordable target, actual trader. No free stock, automatic human consent, or direct instant buys.
- [ ] Death, cancellation, permission revocation, source loss, no money, max-price failure, and reload all preserve ownership/conservation. Source loss stops future native supply, not goods already bought.

**Tests:** a buyer with no iron gets none on order or purchase, then receives exactly the manifest on actual return; seller paid once at load; raid loses cargo and storage claim; cancel after purchase delivers owned cargo without buying again; two routes respect one target/budget; stale UI is rejected cleanly; player and AI run the same transaction. Browser replay covers route creation → loading → returning → visible reserve increase.

**Safe stopping point / Milestone C:** complete land-based strategic imports, with working seller consent and AI participation.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR13 — #1510 [Trade & Supply MR13] Sea and existing air transport integration

Published scope: https://github.com/a1flecke/conquestoria/issues/1510

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 13 of 19.** **Merge prerequisite:** [MR12 — #1509](https://github.com/a1flecke/conquestoria/issues/1509) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR13 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR13 — Sea and existing air transport integration

**Depends on:** MR12. **Size:** medium.

**Modify:** trade-role/carrying-capacity metadata, domain route planning/runner, port/air endpoint validation, pirate and combat integration, cargo UI and domain-specific tests. Read movement, air, renderer, and transport rules for actual touched paths.

- [ ] Add naval cargo capacity and valid embarkation/service endpoints without creating troop passenger units or using troop `cargoUnitIds` for resources.
- [ ] All naval trader tiers receive the same physical payment/load/delivery/loss rules. Existing pirate protections, blockade, and hostile targeting still apply with manifests aboard.
- [ ] Register new trader tiers through unit capability metadata alone when they use existing domains/handling. Extend the catalog-driven capability test, including a variant whose ID no hostile system or runner names.
- [ ] Integrate existing air trade tiers with their explicit infrastructure, range, capacity, known corridor, and enemy-interaction rules; no instant delivery shortcut. If an existing air rule lacks the necessary execution path, keep only air imports unavailable with a clear explanation until its complete path is included in this MR; ordinary air commerce remains playable.
- [ ] Higher tiers improve measured carrying capacity/throughput without erasing all strategic risk or multiplying every reward source.

**Tests:** no-port and wrong-domain routes fail; ocean-tech conjunction; sea detour and wrap; loaded trader destroyed by pirate; blockaded supplier cannot load; existing passenger transport reciprocity unaffected; air delivery waits for actual travel and loss cleans its manifest. Every trade-role catalog entry is covered by the capability matrix.

**Safe stopping point:** strategic procurement works across supported transport domains; no accepted import mode is left as an enabled placeholder.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR14 — #1511 [Trade & Supply MR14] Luxury delivery and explicit resource benefits

Published scope: https://github.com/a1flecke/conquestoria/issues/1511

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 14 of 19.** **Merge prerequisite:** [MR13 — #1510](https://github.com/a1flecke/conquestoria/issues/1510) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR14 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR14 — Luxury delivery and explicit resource benefits

**Depends on:** MR13. **Size:** medium.

**Modify:** resource definitions/access/effects, shipment service bundles, seller luxury service capacity, happiness/economy owners, marketplace/reserve/city resource presentation, migrations.

- [ ] Activate delivery-backed luxury coverage with bounded duration based on normal route replenishment plus grace. Display expiry and next shipment; never grant access at order time.
- [ ] Bound concurrent luxury export service by completed native source capacity. A native luxury can serve domestic use and its configured export allotments; it cannot promise unlimited foreign service.
- [ ] Add the deliberate distinct-luxury happiness baseline and separate all native tile effects. Cargo consumes route capacity and supplier service, and renewals transfer real payments.
- [ ] Duplicate suppliers extend protection only within the displayed coverage cap; they do not stack the same luxury benefit or create a profitable resale path.
- [ ] Complete cattle/salt commodity access definitions without adding meaningless reserve targets or purchase actions.

**Tests:** first delivery activates access; interruption retains delivered coverage until displayed expiry; revocation stops renewals; two copies of spices do not double happiness; new distinct luxury does; supplier service capacity cannot be double-booked; imported gold/spices/sheep do not multiply worked-tile yields across cities; legacy purchased luxuries expire without turning into permanent service.

**Safe stopping point:** strategic and luxury commerce both have an implemented purpose and truthful benefits.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR15 — #1512 [Trade & Supply MR15] Selected industrial fuel demand and graceful shortages

Published scope: https://github.com/a1flecke/conquestoria/issues/1512

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 15 of 19.** **Merge prerequisite:** [MR14 — #1511](https://github.com/a1flecke/conquestoria/issues/1511) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR15 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR15 — Selected industrial fuel demand and graceful shortages

**Depends on:** MR14. **Size:** medium.

**Create:** `resource-fuel-system.ts`. **Modify:** selected building definitions, pre-production resource phase, city yield calculation and panel, reserve forecasts, national conservation policy, AI production/procurement, migrations.

- [ ] Define fuel-backed output and fallback output for factory, oil refinery, and nuclear plant. Calibrate consumption against source production, route throughput, and city output before activation.
- [ ] Allocate each round before yields with stable documented priority. Spend fuel once, show funded/fallback output, and preserve conservation across hot-seat order and reload.
- [ ] Existing structures receive a bounded, non-exportable startup operating allowance on migration so the patch cannot immediately crash a late-era economy. It expires/consumes and is never refreshed by loading.
- [ ] Show runway based on real scheduled demand and distinguish `no current fuel demand`, `projected shortage`, and `delivery uncertain`. Add no military fuel rules here.
- [ ] AI forecasts fuel cost before expanding dependent industry and uses unfueled alternatives/conservation rather than endless construction into shortage.

**Tests:** insufficient coal reduces only declared fuel-backed factory output; zero uranium does not destroy a plant; three cities cannot spend the same last fuel unit; imports arriving after production fund the next round; conservation reprioritizes visibly; delivered reserve lasts the predicted finite rounds absent new events; migration allowance cannot be sold or duplicated.

**Safe stopping point / Milestone D:** blockade and supply dependence influence an industrial economy without instant collapse or individual ration orders.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR16 — #1513 [Trade & Supply MR16] Complete standing orders, forecasts, and low-noise intervention UI

Published scope: https://github.com/a1flecke/conquestoria/issues/1513

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 16 of 19.** **Merge prerequisite:** [MR15 — #1512](https://github.com/a1flecke/conquestoria/issues/1512) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR16 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR16 — Complete standing orders, forecasts, and low-noise intervention UI

**Depends on:** MR15. **Size:** medium.

**Modify:** `resource-procurement.ts`, commerce projection, policy/reserve sections, route chooser/list, live controllers, recipient-scoped notification routing, map preview owner as needed.

- [ ] Finish target presets, exact editable limits, shared round allowance, treasury floor, multi-resource priority reorder, and conservative detour allowance. Editing never overwrites unrelated production/order lists.
- [ ] Show forecast assumptions and separate confirmed owned cargo from potential future purchases. A blocked route has no promised arrival date; show `Delayed` rather than decrementing a fictional countdown.
- [ ] Prioritize actual shortage threats while keeping all actionable resources, suppliers, and routes accessible. Do not surface hidden goods through recommendations, empty categories, or counter badges.
- [ ] Deduplicate warnings on state transitions; aggregate related losses; retain commerce history without routine delivery popups.
- [ ] Verify map route/selection updates through GameSession commits or renderer-owned setters so idle rendering wakes correctly.

**Tests:** targets pause and resume purchases automatically; priority reorder changes next manifest/forecast immediately; removing an order preserves other orders and owned cargo; repeat clicks/stale DOM never duplicate spending; reopen and hot-seat handoff refresh all fields; keyboard and narrow-screen controls expose the full catalog; hidden-world differential tests cover labels, quotes, warnings, ARIA, counts, ordering, and map focus.

**Safe stopping point:** normal trade is self-running, and attention is requested only for useful decisions.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR17 — #1514 [Trade & Supply MR17] Strategic AI use, resilience, and transparent competition

Published scope: https://github.com/a1flecke/conquestoria/issues/1514

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 17 of 19.** **Merge prerequisite:** [MR16 — #1513](https://github.com/a1flecke/conquestoria/issues/1513) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR17 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR17 — Strategic AI use, resilience, and transparent competition

**Depends on:** MR16. **Size:** medium. **Note:** this improves AI strategy; legality and basic participation already ship in the activation slices.

**Modify:** AI production/research/treasury/trade decision owners actually reached from `basic-ai.ts`, knowledge/perception adapters, role demand, commerce tests and focused simulation fixtures.

- [ ] Derive reserve targets from fundable production plans and fuel runway; use bounded incremental trader demand, not one new trader every turn.
- [ ] Evaluate total procurement cost, delivery delay, known danger, and diplomatic dependence. Rank only known offers/corridors; do not read human projections or hidden world supply.
- [ ] Set native-surplus export policies, withhold strategic exports from threats through actual diplomatic policy, and reserve for domestic plans. Difficulty may tune judgment, never waive stock, price, transport, or consent rules.
- [ ] Recover from disruption by selecting a known alternative, conserving, or switching production. Do not repeatedly rebuild traders into the same observed lethal corridor without a changed condition.
- [ ] Ensure trade-only spending cannot starve essential upkeep or lock every city behind missing materials. Preserve catalog-derived unit/building candidate coverage.
- [ ] Derive procurement value from good uses/recipes and trader roles from capabilities. A new resource or ordinary produced good must not require a resource-ID branch in AI marketplace code.

**Tests:** no-route AI buys nothing; threatened supplier can refuse; buyer finds an actual reachable permitted alternative; shared budget limits multiple traders; one material-poor civ continues useful production; loss does not create an unbounded replacement demand; two identical seeds/commands and a save/reload boundary produce equivalent simulation state.

**Safe stopping point:** AI creates credible trade partners and vulnerable dependencies under the same rules as humans.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR18 — #1515 [Trade & Supply MR18] Balance and player-experience acceptance pass

Published scope: https://github.com/a1flecke/conquestoria/issues/1515

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 18 of 19.** **Merge prerequisite:** [MR17 — #1514](https://github.com/a1flecke/conquestoria/issues/1514) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR18 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR18 — Balance and player-experience acceptance pass

**Depends on:** MR17. **Size:** bounded tuning slices, each independently verified.

**Modify:** calibrated resource/route/fuel definition data, exact defects revealed by acceptance scenarios, existing focused gameplay/UI tests. Add only the smallest new deterministic scenarios needed, with proper CI and intensive-simulation classification.

- [ ] Run the scenario matrix in section 8 using retained deterministic outcomes; record before/after metrics in the MR and promote final invariants into durable documentation/tests.
- [ ] Tune storage runway, cargo size, recipe cost, supplier price, normal route yield, luxury coverage, and fuel output together. Do not compensate for an accounting bug by inflating rewards or lowering consumption.
- [ ] Check land/sea/air trade tiers, early/middle/late eras, small/large empires, resource-rich/poor starts, and AI/human competition. Trade is useful without becoming mandatory for every opening.
- [ ] Verify useful detours, recoverable attacks, and alternative military production. Confirm longer routes have a real tradeoff rather than a universal best-distance rule.
- [ ] Walk the actual narrow-screen and keyboard UI; measure routine decisions and warnings over repeated healthy trips.
- [ ] Run the complete extension-contract fixtures for an added resource, non-deposit good, trader variant, and danger. Inspect the required change footprint: definitions/adapters and their tests, without edits scattered through runner, market, UI, AI, and cleanup branches.

**Acceptance:** no-negative-stock/conservation and knowledge invariants hold; an operating quote predicts actual ordinary payment; an interrupted route loses income and replenishment; existing reserves create a visible response window; a healthy repeating route requires zero confirmation per trip; players can find all valid choices; no new economic or AI stall is hidden by weakening a detector.

**Safe stopping point / Milestone E:** the full design is balanced enough to replace the old feature as the supported commerce experience.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.


---

## MR19 — #1516 [Trade & Supply MR19] Remove the retired market and close the implementation plan

Published scope: https://github.com/a1flecke/conquestoria/issues/1516

Parent: [Trade and supply overhaul — #1497](https://github.com/a1flecke/conquestoria/issues/1497)

**Implementation order: 19 of 19.** **Merge prerequisite:** [MR18 — #1515](https://github.com/a1flecke/conquestoria/issues/1515) must be merged to `main` and verified before this slice starts. Closing its issue alone does not satisfy this dependency.

This issue publishes the approved MR19 scope. The parent contains the shared gameplay, accounting, architecture, extensibility, UI, and acceptance contracts. It is the authority for behavior not repeated here.

### MR19 — Remove the retired market and close the implementation plan

**Depends on:** MR18 and verified completion of every activation slice. **Size:** small-to-medium.

**Modify:** old marketplace functions/state adapters, world-price/fashion phase integration, expired purchased-access compatibility, tests, action-contract inventory, durable commerce documentation, plan lifecycle manifest.

- [ ] Remove instant-buy exports and obsolete UI/controller/AI imports after proving all live callers use shipments.
- [ ] Remove global world-resource price/fashion state and old finite-trip semantics from current runtime, retaining frozen ordered migration steps needed to load old saves.
- [ ] Remove containment messages and temporary compatibility branches only when their remaining obligations have a deterministic migration. Do not remove legacy history needed to interpret an old save.
- [ ] Promote stable gameplay/accounting/UI rules into a current `docs/commerce.md` plus tests and canonical policy references as appropriate.
- [ ] Include verified extension recipes for a resource, good, trading unit, and danger, with their definition owner, supported behaviors, required domain integration, compatibility rule, and catalog/interaction tests.
- [ ] Delete the active implementation plan and classify it delivered in the same final MR, following the repository lifecycle rule. Preserve the parent issue's history and links.

**Tests:** oldest supported fixture, pre-containment purchases, mid-route legacy trader, new reserve save, loaded cargo, pending consent, and fuel shortage all load and continue correctly. Fresh game and loaded fresh game are equivalent. Scoped call-site search finds no live instant-purchase or hidden world-price consumer.

**Safe stopping point:** one supported commerce architecture, with historical saves still supported.

## Shared implementation requirements

- Follow the [gameplay and accounting contract](https://github.com/a1flecke/conquestoria/issues/1497#3-gameplay-and-accounting-contract), [architecture and extension contracts](https://github.com/a1flecke/conquestoria/issues/1497#4-architecture-and-file-ownership), and [UI guardrails](https://github.com/a1flecke/conquestoria/issues/1497#6-player-truth-table-and-ui-guardrails). New resource, good, trader, and danger content must use the approved catalogs/capabilities/adapters without scattered ID-specific branches.
- Keep the game buildable and playable at the safe stopping point above. Ship each activated behavior through canonical mutations, live UI, AI, turn phases, and persistence as applicable. Inactive groundwork must not advertise unavailable actions. Keep instant resource purchases disabled until the full replacement is activated in MR12.
- Execute the [per-slice implementation and verification procedure](https://github.com/a1flecke/conquestoria/issues/1497#7-implementation-and-verification-procedure-for-every-slice): start from latest `origin/main` in a fresh worktree; run `./scripts/dev.sh verify-impact`; prove the exact scope regressions, run canonical source checks and every mirrored test for changed source, then complete the evidence required by the repository impact contract. Persisted-shape changes require the ordered migration/schema/compatibility coverage described in the parent.
- Keep this issue, the parent checklist, and the registered active plan consistent with merged work. Attach implementation MR links and validation evidence; a partial slice must state what remains. Later numbered scopes remain separate work. Do not weaken accounting, knowledge, AI-stall, or UI reachability checks to make a slice pass.
