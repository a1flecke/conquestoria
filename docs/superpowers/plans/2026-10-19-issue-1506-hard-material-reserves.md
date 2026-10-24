<!--
Registered implementation plan for MR09 (#1506), owned by open issue #1506 and classified `active` in
docs/docs-lifecycle-manifest.json. Source: the three implementation-plan comments published on
https://github.com/a1flecke/conquestoria/issues/1506 on 2026-10-20, reproduced verbatim in order below.
Registration does not authorize merging, closing issues, subagents or fast mode.

Delete this file and move its manifest entry to delivered history in the PR that completes MR09.
-->
> **Implementation plan — Part 1 of 3: audited baseline, design, architecture and ownership.** Read all three parts before implementation.
>
> **Navigation:** Part 1 (this comment) · [Part 2: ordered tasks and regressions](https://github.com/a1flecke/conquestoria/issues/1506#issuecomment-6281922739) · [Part 3: UI truth, tests, build and verification](https://github.com/a1flecke/conquestoria/issues/1506#issuecomment-6281924205).

# MR09: Hard material reserves end to end — implementation plan

> **Implementing agent: DeepSeek v4.1 Flash.** Execute inline, one task at a time. Use `superpowers:executing-plans` if available. Do not spawn subagents or enable fast mode. The word “Flash” in the requested model name is not permission to enable an agent's fast mode.
>
> **Goal:** Deliver issue #1506 / Milestone B: a playable domestic strategic-reserve economy in which hard production recipes, active commitments, completion, rush-buy, upgrades, AI, saves, and live UI all agree.
>
> **Architecture:** Reuse MR08's pure reserve kernel and native-source predicates. Put recipe evaluation and production commitments behind focused system owners; have canonical commands apply resource costs together with their existing consequences. UI and AI read the same funding queries. Keep simulation state plain, serializable data and shared between web and Tauri.
>
> **Tech stack:** Existing TypeScript, Vite, Canvas/DOM UI, Vitest/jsdom, Playwright, Yarn through the repository's Mise wrappers. No new dependency is needed.

## 1. Baseline, authority, and scope

This plan was audited on 2026-10-19 against fetched `origin/main` **`ecdf49df698e0f2f1eba8bdd78e3f0b99ffb695a`**. The base checkout was behind and dirty; it was not reset, switched, or edited. All source observations below refer to the fetched revision, not that checkout.

Read #1506 and parent #1497, especially §§3.3–3.4, 4, 6–8. Source/tests/canonical rules establish current behavior; this document specifies the changes. MR08 implementation is in main as `ae09131f` plus `ecdf49df`, through [PR #1562](https://github.com/a1flecke/conquestoria/pull/1562), which GitHub reports merged. Its PR records focused, profile, and durable verification. The legacy commit-status endpoint returned no statuses; that is **not** independent proof that its Actions checks passed. At implementation start inspect `gh pr checks 1562` and the current base, rather than treating issue #1505's open/closed state as the dependency check.

**In scope:** existing hard requirements become quantities; domestic extraction/storage; active-only commitments and waiting; every paid production consumer; quantity-aware fallback units; Supplies and city UI; bounded one-time transition assistance; persistence and round-order proof.

**Keep separate:** MR10 soft-material spending/substitution/yield-scope conversion; MR11 offers/prices; MR12 imports, export controls, seller payment, manifests and standing orders; later sea/air import integration, luxury delivery and recurring fuel. Do not turn soft-only oil/aluminum/rare-earth/battery discounts into new hard requirements. Preserve their current behavior for MR10; do not describe this slice as fixing that legacy soft-discount issue. Coal/oil/uranium role metadata does not activate fuel consumption. Keep instant purchases canonically disabled and preserve their rebuilding explanation.

**Delivery boundary:** local development tasks below form one coherent activation PR. Do not publish/merge a live subset that can reserve without completing, charge without UI, or wait forever because AI cannot choose alternatives. A separately authorized partial PR may contain an explicitly non-live kernel/persistence foundation, with no advertised reserve actions and an exact remaining-work list. Do not mark MR09 complete for such a subset.

## 2. Verified source map: read these before changing them

| Current path / symbol | What exists now; implication for this change |
|---|---|
| `src/systems/resource-reserve-system.ts` | Pure, inactive ledger: `balances`, `reservations`, `incoming`; `reserveStock`, `consumeStock`, `releaseStock`, export/headroom/validation and starter helpers. Nothing is persisted or accrued by the turn loop. Extend, do not replace with a second ledger. |
| `src/systems/resource-source-eligibility.ts` | `listResourceSources(state, civId, { allowCityCenter: true })` is the deduplicated extraction source list. Its default excludes city centers! `getActiveResourceSourceCount` intentionally retains physical-source quest semantics. |
| `src/systems/resource-definitions.ts`, `trade-good-definitions.ts` | Economic roles and resource-backed goods exist. `TradeGoodId` is a string owned by the goods module today. `resourceGoodId` constructs IDs; `findTradeGood` resolves them. Do not parse prefixes. No actual extraction-rate/storage metadata or production recipes exist yet. |
| `src/core/types.ts` | Existing `Building` / `TrainableUnitEntry` have `resourceRequired?: ResourceType[]`; `City` has a string queue and one `productionProgress`; `GameState` has no reserve ledger. New declarations belong in type leaves, not new local declarations in this compatibility barrel. |
| `src/systems/city-production-eligibility.ts` | `getQueueableProductionForCity` is the shared list used by panel and validated enqueue. Currently passes the boolean access Set into availability. Preserve the shared contract while separating plan legality from funding. |
| `src/systems/city-availability.ts` | `getTrainableUnitsForCiv/City`, `getAvailableBuildings`, and `isUnitObsolete` filter with boolean resources. Obsolescence already walks the full explicit `upgradesTo` chain, including resource-free later successors. Preserve that behavior with quantitative funding. |
| `src/systems/planning-system.ts` | `enqueueCityProduction(state, cityId, itemId)` returns typed results. `reorderCityProduction(city, ...)` / `removeCityProductionItem(city, ...)` return only a City, so cannot update a civ ledger. Head-changing edits normally erase progress; tail-only edits retain it. |
| `src/systems/city-turn.ts` | `processCity` filters/dequeues resource-lost items, grows food/population, adds production, completes one item and reports production disposition. `completeCityProductionItem` only changes the city queue/buildings. Resource shortage must stop being a dequeue condition. |
| `src/core/round-phases/per-civ/city-production.ts` | `runCityProduction` applies results and calls canonical `completeUnitProduction`; air placement can reject completion. Coordinate funding and resource spend here through system helpers, without teaching `city-turn` about the whole world. |
| `src/systems/economy-system.ts` | Owns **quote** `getRushBuyQuote`. It no longer owns the buy executor. |
| `src/systems/rush-buy-system.ts` | Owns **executor** `rushBuyActiveProduction`, gold payment, city completion, canonical unit completion and events. Add payment atomicity here. `completesFromOwnProduction` must understand waiting. |
| `src/systems/unit-upgrade-system.ts` | `evaluateUnitUpgrade` and `applyUnitUpgradeToState` own upgrade legality/payment. `canUpgradeUnit` / `getCanonicalUpgradeTarget` are older query paths that must not keep a boolean bypass. |
| `src/systems/unit-production-completion.ts` | Single owner for trained unit creation, rosters, spy records, air basing, training bonuses and reward consumption. Keep it resource-payment-neutral so free grants do not accidentally pay recipes. |
| `src/systems/production-cost-context.ts`, `city-production-cost.ts`, `production-decision.ts` | Canonical owner/city/era pricing, soft advantages, active progress and ordinary/rush ETA. Never use World Age `state.era` as the owner era, or let waiting appear to finish this turn. |
| `src/ai/ai-production.ts` | Generates/scored candidates then serially re-generates against `nextState` and calls canonical enqueue. Only empty queues are currently filled; simply allowing unfunded enqueue can create permanent AI stalls. |
| `src/ui/marketplace-panel.ts` | Existing Trade & Supply panel has Routes / Supplies / Policies; Supplies currently shows boolean inventory and temporary access. `createMarketplacePanel` toggles an existing panel closed, so a refresh must explicitly replace/render rather than call the toggle blindly. |
| `src/ui/city-panel.ts` | Very large existing file. Inline hard-resource strings, locked rows, active ETA, follow-up ETA, upgrade rows, and queue handlers all need the shared model. Add focused helpers instead of another large block. |
| `src/app/controllers/city-panel-actions-controller.ts` | Currently commits only the returned City for reorder/remove. Replace those calls with state-aware commands; preserve returned-state rerender behavior. |
| `src/app/controllers/diplomacy-trade-panel-actions-controller.ts` | Real Trade & Supply launcher and route-control refresh. Owns lifecycle of the live panel; the UI section must actually be invoked here through the panel. |
| `src/core/round-phases/index.ts`, `types.ts` | Only phase-order declaration and `RoundPhaseId` union. Insert commerce resources after `pre-civ-reconciliation`, before `per-civ`. No phase imports another phase. |
| `src/core/game-state.ts`, `src/systems/city-lifecycle.ts` | Both solo/hot-seat creation and normal city initialization must produce load-canonical material state. Settler-only starts still need an empty per-living-civ ledger. |
| `src/storage/save-schema-version.ts`, `migrations/ordered.ts` | Current schema **35**. Use the next available version (36 at this baseline), with a focused new step; `save-migrations.ts` remains composition only. |
| `src/systems/world-race-system.ts`, `legendary-wonder-system.ts` | Race loss removes queue entries; wonder start can prepend a new head and carry progress. These bypass ordinary queue buttons and can strand reservations unless integrated. |
| `src/systems/city-capture-system.ts`, `breakaway-system.ts`, `civilization-elimination-system.ts` | Ownership transfer/raze/revolt/elimination must release old national claims. Audit actual ownership writers before implementation; a helper only in the capture UI is insufficient. |

### Read the policies in the task worktree

`AGENTS.md`, `CLAUDE.md`; `.claude/rules/game-systems.md`, `strategy-game-mechanics.md`, `action-contracts.md`, `caller-discipline.md`, `game-balance.md`, `end-to-end-wiring.md`, `ui-panels.md`, `input-reliability.md`, `session-publication.md`, `invariants.md`, `ai-simulation.md`, `performance-budgets.md`, `spec-fidelity.md`, `incremental-mr-completion.md`; `docs/superpowers/plans/README.md` and `docs/action-contract-inventory.md`. Read `hooks-and-tooling.md` before adding tests or changing tracked script metadata. Read the button-styling skill before adding UI buttons. Renderer rules apply only if actual renderer files need changing; a reserve DOM table does not justify renderer edits.

## 3. Design decisions: implement these semantics consistently

### 3.1 Counts, profile, and recipe data

Use the MR08 ledger and opaque good IDs. All amounts must be finite nonnegative safe integers; recipe rows must have positive quantities and known stored-quantity/material goods. Aggregate repeated recipe good IDs before evaluating or reserving. An unknown item/good is a typed refusal, not a free recipe. A known resource-free item has a valid empty recipe.

Starting calibration: **2 native units/source/completed round, capacity 40/good, standard hard cost 10 units per required good, bounded starter 2/source up to capacity**. Put the profile in pure catalog data (derive the resource-backed good's quantity profile from the resource definition); use named shared defaults rather than copies in UI/AI/migration. A genuine non-deposit fixture provides its own profile. No runtime system import from a catalog.

An item formerly requiring horses **and** iron gets **10 horses + 10 iron**, not 10 of either or 10 divided between them. Do not add per-item exceptions unless measured pacing warrants them; any exception has explicit quantity and reason in data and a test. Source/recipe pacing is a calibration to measure, not a claim of established balance.

Hard conversion inventory at this baseline:

| Recipe | Unit IDs | Building/project IDs |
|---|---|---|
| Copper 10 | `axeman`, `crossbowman` | `bronze-workshop`, `armory` |
| Iron 10 | `swordsman`, `ballista` | `iron-foundry`, `war-academy`, `steel_mill` |
| Horses 10 | `horseman`, `chariot`, `cavalry` | `ranch`, `cavalry-academy` |
| Horses 10 + Iron 10 | `knight`, `cuirassier` | — |
| Stone 10 | `catapult` | `masonry-works`, `siege-workshop` |
| Oil 10 | — | `oil_refinery` |
| Uranium 10 | `missile_submarine` | `nuclear_arsenal`, `nuclear_power_plant`, `manhattan_project`, `warhead`, `interstellar_launch_program` |
| Aluminum 10 | — | `first_satellite_launch` |

Re-enumerate `resourceRequired` in the two catalogs after fetching; this table must not silently drop newly added entries. Replace the hard field with explicit `materialCosts` data once every consumer is converted. A temporary read adapter during local development must have one authority and be removed before delivery; do not retain two independently editable hard-requirement lists. Update `city-production-cost.ts`'s steel-foundry iron classification to consult hard recipe data through the good definition; otherwise removing `resourceRequired` silently removes its discount.

### 3.2 Strengthen the kernel before persisting it

MR08 reservations currently record **amount only**, and consumption chooses provenance at spend time. That is insufficient once reservations are live: a different consumer could spend the imported portion intended for a reserved item. Extend each reservation with a locked native/imported allocation and a production-consumer reference. Balances continue to include committed stock; reservation is not an immediate debit.

For each good:

```text
stored = balance.native + balance.imported
committedNative = sum(reservation.native)
committedImported = sum(reservation.imported)
committed = committedNative + committedImported
freeNative = balance.native - committedNative
freeImported = balance.imported - committedImported
free = freeNative + freeImported
exportable = min(freeNative, max(0, free - protectedReserve))
```

Reserve from **free imported first**, then free native, locking that split. Unreserved spend consumes **free** imported then free native, never another reservation's stock. Reserved spend uses its recorded split; partial consumption updates both amount and split. Release changes commitments, never increases balances. No negative values may be hidden by `Math.max` instead of rejected by validation.

Add atomic recipe operations: build the entire result using local immutable ledgers, and return the original ledger if any row fails. No partial first-good reservation/spend on second-good failure. Incoming claims remain unusable, count against headroom, and reject duplicate IDs before writing. The current `accrueNativeStock` does **not** apply a cap, and `computeStartingNativeStock` does **not** bound the sum: live accrual/seed must explicitly apply headroom/cap. Already-owned overflow survives. Restricted transition assistance may exceed capacity only by the exact required active-item deficit; it is not ordinary accumulation and blocks further accrual while over capacity.

### 3.3 Minimal persisted shape and occurrence identity

Declare new types in `src/core/types/commerce.ts` (or one focused `material-reserves.ts` leaf if that keeps it clearer). Move the existing reserve types and `TradeGoodId` there using **type-only** re-exports for compatibility; do not create a core-type → runtime-catalog dependency. Consumers import new types from their owning leaf.

Add `GameState.materialReservesByCiv` and city material bookkeeping by extending existing interfaces with leaf types, without new barrel declarations. Recommended shape:

```ts
interface MaterialCost { goodId: TradeGoodId; quantity: number }
interface ReserveAllocation { native: number; imported: number }
interface ProductionMaterialRef {
  ownerCivId: string;
  cityId: string;
  occurrence: number;
  itemId: string;
}
interface ActiveMaterialCommitment {
  ref: ProductionMaterialRef;
  recipe: readonly MaterialCost[]; // snapshot of this active item's hard terms
  reservationIds: readonly string[];
}
interface CityProductionMaterials {
  queueRevision: number;       // advances for every successful queue edit
  activeOccurrence: number;    // advances when the active occurrence changes
  commitment: ActiveMaterialCommitment | null;
}
// Extend existing ReserveReservation:
// allocation: ReserveAllocation; consumer?: ProductionMaterialRef;
// migrationGrantImported?: number (only the historical migration can create it).
// Extend existing ReserveLedger:
// lastAccruedTurn?: number (canonical starts/migration initialize -1).
// Existing GameState: materialReservesByCiv?: Record<string, ReserveLedger>
// Existing City: productionMaterials?: CityProductionMaterials
```

`reserveStock` accepts the existing request fields plus consumer metadata and computes `allocation` itself; do not ask callers to choose provenance. Its request type therefore omits the computed allocation from the stored reservation type. Require the consumer for `active-production`/`migration-grant` requests; retain the existing generic protected-reserve use without a production consumer. Validate `0 <= migrationGrantImported <= allocation.imported`, require a matching active ref for any grant, and reject grant creation through normal queue/buy/upgrade entry points. The historical migration is its only writer. `lastAccruedTurn` is optional only for old pure-kernel fixtures; the live initialization/load boundary supplies it without seeding/granting. Partial reserved spending consumes the restricted grant portion of that reservation's imported allocation first, reduces that tag by the same amount, then spends its ordinary imported/native allocation; release extinguishes only the still-tagged grant balance.

Optional fields accommodate old fixtures/type compatibility; production readers treat missing data as empty with **no grant**. Current new-game/load paths initialize them canonically. A missing current-schema field must never trigger migration assistance or native seeding on each read.

Repeated units are legal (`['swordsman', 'swordsman']`) and consumed buildings such as warheads repeat. Reservation identity must include **city + active occurrence**, not just item ID. Allocate deterministic IDs from the reference and good ID (a serialized tuple is adequate); do not use wall-clock time or RNG. Replacing/removing/completing the head advances the occurrence even if the next item's ID is identical. Moving identical occurrences through the head also changes occurrence. Tail-only edits advance queue revision but retain the active token and commitment.

State-aware queue commands compare an expected revision for UI reorder/remove requests. Buy requests carry the expected active occurrence/item. A stale callback returns a typed no-op denial rather than acting on the new head. AI supplies a fresh reference from its current state. A second intentional action from refreshed DOM gets the new reference and works.

Waiting is derived from a legal active hard recipe with no valid full commitment; do not maintain a second mutable waiting flag. A quantity funding query distinguishes this active item's own reservation from another city's commitments. It must never label an already-reserved active item unfundable merely because national `free` is zero.

### 3.4 Queue and turn semantics

1. A legally plannable item may be browsed/queued with insufficient stock. Keep tech, additional-tech conjunctions, owner/civ, coastal, training building, faith, national uniqueness/capital/arsenal, and build-window legality. Material shortage is a **waiting** state, not structural illegality.
2. Only the active occurrence attempts a full recipe commitment. Follow-ups show planned costs and reserve nothing. Enqueue into an empty city immediately attempts funding; tail enqueue does not.
3. Funded production advances even if its mine is later lost, occupied, or pillaged: stock was already committed. An unfunded active item keeps its queue position and stored progress and applies zero production that round. Food, growth, gold, science and unrelated city behavior continue. Do not silently convert withheld production to gold/science or accumulate hidden catch-up output.
4. Preserve existing explicit-edit progress semantics: changing the head normally resets `productionProgress` and uses the existing warning/confirmation; tail edits preserve it. Shortage alone never resets progress. The wonder-start carry-progress exception remains deliberate.
5. Successful completion spends the exact full commitment once, then promotes/attempts the new head. Only one item completes from ordinary city production per round; preserve the existing 3D-printing carry rule. Never transfer a completed item's materials to the next identical item.
6. A nonmaterial invalidation releases the removed occurrence before the next head is funded. Existing invalidity rules remain; funding must be evaluated for the **post-normalization head**, not a stale head captured before queue filtering.
7. At the new `commerce-resources` round phase, accrue for all living majors once, then reconcile active claims in stable civ/city-ID order. AI/manual actions after that phase attempt funding against the latest ledger; completion cannot reserve against an old civ snapshot. Do not reorder the existing city production loop just to obtain reservation ordering.
8. Do not accrue per human turn, per city, or on render/load. Use a persisted `lastAccruedTurn` per civ ledger (initialized to a no-accrual sentinel such as -1 for current starts/migration) to prevent replay of this new phase crediting twice. Set it only in the same successful accrual transaction. Assert its boundary through `processTurn`; do not assume what turn number means from its name.
9. Keep future foreign deliveries after production, for next-round availability, per parent order. No shipments are activated here.

### 3.5 Browseability, fundability, and obsolescence

Keep `getQueueableProductionForCity` as shared plannability authority. Add a quantity-aware evaluator returning `fundableNow`, full recipe, own committed amount, available free quantity and exact missing quantity per good. Recommendation/AI “build now” surfaces consume it rather than treating every plannable row as fundable.

Extend the existing successor walk using explicit `upgradesTo`: a predecessor retires only when its normal obsolete-tech condition holds **and** a successor in its chain is actually fundable under applicable tech/civ/location/building rules. For a city-aware list, do not hide a useful predecessor because a successor cannot train in this city. Do not let one iron count as ten, incoming count as stored, or another city's reservation fund a successor. A later resource-free `rifleman` still retires `archer` after the intervening copper-gated `crossbowman`. Preserve current own active commitments in the query to avoid dequeueing an in-progress predecessor simply because its reservation made free stock zero. Freeze the active occurrence's legal commitment until a real nonmaterial invalidation or explicit head edit; never auto-drop it because newly accrued stock temporarily makes a successor fundable.

Do not replace `getCivAvailableResources` globally with `stored > 0`. Physical-source quests keep `getActiveResourceSourceCount`; worked-tile/access/luxury/legacy-soft consumers keep their own semantics. Only hard funding and its alternatives move to recipes in this slice.

### 3.6 Payment boundaries

**Natural completion:** prepare the material transaction and city completion on a candidate state; run `completeUnitProduction`/actual applicable placement checks before publishing material debit, queue removal or completion events. If completion fails, return the original paid-operation state and no completion event. Preserve ordinary food/yield processing separately; a payment failure must not lose already-held progress or charges. Do not put material debit inside the low-level unit factory.

**Rush-buy:** recheck expected occurrence, owner, current legality, quote, gold, full recipe and completion/placement. Use the active reservation if present; otherwise atomically reserve/spend the same recipe. Pay only one occurrence. No material charges multiplied by remaining production, no double charge because it already held a commitment, no refund invented from cancellation. Candidate state + events are accepted only after all checks succeed. Update `getRushBuyQuote` with a typed material/placement denial and copy; query never mutates stock.

**Upgrade:** evaluate the target's full hard recipe through the same evaluator; spend that recipe once, together with the existing gold/action/type/air-base transaction. Default material quantity is the target recipe, not half the recipe; the existing 0.5 fraction is a **gold** rule. Do not refund the source unit's old equipment. Validate the explicit typed upgrade target. On denial, gold, materials, unit, rosters, reward charges and event history remain unchanged. Preserve health/experience and canonical action/basing semantics.

Expose one legality pair per family, with typed reasons/copy. Human commands enforce actor context at their established command/controller boundary; automated city processing receives explicit owner context and must work for every civ regardless of `state.currentPlayer`. Do not add a human-turn guard to automated funding/accrual.

### 3.7 One-time transition policy

Use one ordered migration, **35 → 36 at this baseline**. Re-read the version on the implementation branch and allocate the next free version after rebase if another slice has advanced it.

1. Build each living major's initial native ledger from `listResourceSources(..., { allowCityCenter: true })`, quantitative goods only, one contribution per source coordinate, `min(capacity, sources * startingPerSource)`. No imported access becomes a source. Native seed occurs only here and explicitly at fresh-game initialization, never in compatibility normalization.
2. Visit existing active occurrences in stable owner/city order. Do not reserve the queue tail. Preserve production progress. Reserve a valid active hard recipe from the bounded seed where possible.
3. For legacy active work entitled under the old rules (including unexpired purchased access or explicit existing `legacyResourceGrace`), fill only its missing hard amounts with a finite migration grant. Also honor demonstrably already-invested active work (`productionProgress > 0`) after a source loss, while preserving its applicable tech-grace/nonmaterial legality. Do not grant invalid foreign/civ-specific/coastal/expired-project work just because a string is in a queue. Historical grace is consumed only for the specific eligible occurrence it was meant to protect.
4. Represent grant stock as **imported**, with explicit `reason: migration-grant` and the owning active reference. Reserve it immediately to that occurrence. It has no seller, route or incoming claim. The reservation records the grant portion separately from ordinary imported allocation, so it cannot become general free stock on release.
5. If that active item completes, its grant is consumed once. If canceled, reordered away, invalidated, captured, razed or eliminated, extinguish its unused grant and release its ordinary stock. That is this plan's explicit release policy. No transfer of assistance to a replacement or another identical queued item. Record the grant/source or expiry sink in conservation assertions.
6. Expiry of old purchased access keeps its recorded boundary; it neither removes a previously valid commitment nor creates fresh quantities. Leave nonmaterial legacy access semantics intact until their later slice. An empty queue, future enqueue, rush-buy of a different head, or upgrade gets no transition grant.
7. Finished units/buildings receive no retroactive bill. Source-poor late-era saves without entitled active work remain playable through useful fundable alternatives and idle conversion, not infinite compensation stock.
8. A second normalization/save/reload must preserve exact remaining balances, reservation IDs/provenance, active reference and expiry. The schema guard prevents regranting; the pure starter helper's repeatability alone does **not** prove that.

New games use current-schema initialization and **zero migration grants**. At a settler-only start, no eligible sources means an empty ledger, not a grant based on nearby unrevealed deposits. New cities initialize neutral queue bookkeeping through `city-lifecycle` and never seed the empire again.

### 3.8 Ownership and unusual queue writers

Release old-owner reservations before capture/raze/transfer/revolt cleanup. A conqueror retains its own national ledger and must fund inherited active work from that ledger; it acquires no duplicate national stock or old owner's migration grant. Same-owner no-op transfers do nothing. On elimination delete operational ledger/claims in the canonical liveness transition, without touching another owner's inventory.

Inventory actual queue-head/owner writers with scoped `rg` before editing: planning commands, ordinary/rush completion, `startLegendaryWonderBuild` and wonder cancellation/completion, `world-race-system` loser cleanup, `transferCapturedCityOwnership`, other capture/raze branches, `breakaway-system` and reconquest. Route them through a shared material head-transition/release owner, preserving each existing progress/refund rule. A round-only orphan cleanup is a backstop, not an excuse for stale same-turn reserve UI.

## 4. SRP, SOLID, dependency direction, and planned modules

Use focused functions/data, not classes for their own sake. No generic inventory framework, command bus, dynamic registry, or unrelated cleanup.

| Module | Sole responsibility / dependency rule |
|---|---|
| Type leaf (`src/core/types/commerce.ts`) | Plain recipe, ledger, provenance, consumer and commitment contracts. Type-only dependencies; no runtime system imports. |
| Existing resource/goods/unit/building catalogs | Content and profile data only. Add a normal hard-cost item by data + coverage, without branches in UI/AI/turn/spend. |
| `resource-reserve-system.ts` | Pure generic per-good arithmetic/validation, no GameState/UI/city/turn ownership. |
| **New** `resource-material-costs.ts` | Catalog recipe resolution, atomic multi-good evaluation/reserve/consume/release. Takes explicit ledger/reference/definitions; never chooses viewer or renders. |
| **New** `city-production-materials.ts` | State adapter for one city's active reference, ledger and head transition; snapshot/retain/release/retry commitment. No DOM, AI scoring or phase imports. |
| **New** `resource-reserve-accrual.ts` | Current eligible native sources → capped per-civ once-per-round accrual and bounded starter calculation. No production completion or UI. |
| **New** `core/round-phases/commerce-resources.ts` | Small phase adapter: run accrual and active reconciliation for living owners; register in central order. No duplicated arithmetic. |
| Existing planning / city production / rush-buy / upgrade owners | Their own action transaction; delegate material subtransactions. No UI-side payment. |
| **New** `resource-reserve-presentation.ts` | Viewer/owner-safe read models for Supplies; definition display metadata plus canonical counts. No mutations and no AI imports. |
| Existing `production-decision.ts` plus focused material presentation helper if needed | City recipe/wait/ETA and payment consequences; use evaluator, do not reimplement reserve math. |
| **New** `ui/commerce-reserves-section.ts`, `ui/city-materials-section.ts` | Render supplied read models with DOM/textContent. City panel remains composition around existing sections. |
| **New** `storage/migrations/steps/material-reserves.ts` | One historical grant/seed transition, with bounded assistance policy; migration registry composes it. |

Names above are proposed **new files**, not claims they already exist. Add their mirrored tests. A file is created only when its task has a real caller.

Apply SOLID concretely: SRP separates arithmetic, state orchestration and rendering; open/closed behavior comes from catalog recipes/profile data; substitutability means human/AI/automation share the same successful/refused material contract; interface segregation keeps pure evaluators on explicit ledgers instead of passing app/session objects; dependency inversion means UI/controller receives read models/results and the systems know nothing about DOM or agent code. Do not build speculative interfaces with no second use.

Avoid cycles: `city-turn` must not import the state adapter/AI/UI; material arithmetic must not import `planning-system`; catalog modules must not import runtime evaluators. `city-production-cost` may consume pure recipe/catalog facts, but must not import an adapter that builds the same production-cost context. Use leaf imports rather than expanding the deprecated `city-system` barrel. If an import restriction is needed, add a declarative rule to `tests/app/architecture/rules.ts`, with its fixture test; do not add a broad regex or accept a runtime cycle in a baseline.
---

> **Part 2 — ordered implementation tasks and exact regressions.**
> **Implementation plan — Part 2 of 3: ordered implementation tasks and exact regressions.** [Part 1: baseline, design and architecture](https://github.com/a1flecke/conquestoria/issues/1506#issuecomment-6281921203) · [Part 3: UI truth, tests, build and verification](https://github.com/a1flecke/conquestoria/issues/1506#issuecomment-6281924205). Read all three parts before implementation.

## 5. Task-by-task execution checklist

For **every task**, first add the exact regression and run its focused file to establish the intended RED failure; then implement, run source checks and the focused files to GREEN, inspect the diff, and commit the coherent change when green. RED must be a failed behavioral assertion, not a missing import or broken fixture. After two materially similar failures stop and report the blocker. Do not broaden scans or rewrite adjacent systems speculatively.

### Task 0 — Bootstrap and record the baseline

- [ ] Fetch and inspect latest main, verify MR08 merged + checks, and read the scoped rules above.
- [ ] Use a **fresh linked worktree** and a new `codex/1506-hard-material-reserves` branch from `origin/main` (or the implementing agent's explicitly approved prefix). Do not modify the dirty base checkout or reuse another agent's worktree. Inspect worktree ownership first.
- [ ] Run setup-hooks immediately, confirm `.githooks`, trust this worktree's `mise.toml` only when needed, install the unchanged lockfile only if its PnP map is missing. Never borrow another checkout's `.pnp.cjs`.
- [ ] Run `./scripts/dev.sh verify-impact`; it reports current changes, so rerun after real edits. For planning an explicit future file set use `./scripts/run-with-mise.sh yarn verify:impact <paths>`.
- [ ] Copy this issue plan to `docs/superpowers/plans/2026-10-19-issue-1506-hard-material-reserves.md` in the implementation branch and register it as active for open #1506 in `docs/docs-lifecycle-manifest.json`. Keep the existing parent plan's MR09 state honest. Delete this child plan and move its manifest entry to delivered history in the PR that completes it, per lifecycle policy.

Direct command examples (each is its own tool call, with the correct working directory; angle-bracket paths must be replaced with the actual selected worktree path):

```text
git status --short --branch
git fetch origin
git log -1 --format='%H %s' origin/main
git worktree list
gh pr checks 1562 --repo a1flecke/conquestoria
./scripts/setup-git-hooks.sh
git config --worktree --get core.hooksPath
mise trust mise.toml
./scripts/dev.sh install
./scripts/dev.sh verify-impact
```

Do not run trust/install if unnecessary. Network/approver errors are reported, not “fixed” by broad permission changes. Do not edit `~/.config/opencode`, credentials, or approval rules.

### Task 1 — Make the reserve kernel safe for live commitments

**Modify:** reserve-system and goods/type ownership. **Tests:** `tests/systems/resource-reserve-system.test.ts`, `trade-good-definitions.test.ts`; leaf ownership/architecture checks after type movement.

- [ ] Lock reservation provenance; fix unreserved spend/export to subtract commitments by provenance. Add owner/consumer/amount consistency validation.
- [ ] Reject duplicate incoming claim IDs, fractional/negative/nonfinite/unsafe amounts and unknown recipe goods. Validate aggregate committed native/imported against the corresponding balance.
- [ ] Add atomic multi-good primitives in the material-cost module, including empty recipe success for known free items and rollback on any refusal.
- [ ] Prove immutable input on both success and refusal, partial-consume accounting, double release/consume refusal and overflow retention. Retain test-defined non-deposit-good support without shipping a producer.

Exact arithmetic cases: native 6/imported 8, reserve 10 → allocation imported 8/native 2, free native 4/imported 0, exportable 4 before protection. Unreserved consume 4 must consume native 4 and leave the commitment intact. Then consume reservation → zero total stock. A second 10-unit reservation with only those original 14 total must fail without changing the first. Native 10 iron/0 horses with an iron-10 + horses-10 recipe must reserve **neither** good.

Add this concrete provenance regression to the existing reserve suite. All production functions it calls exist at the audited baseline. The request variable deliberately carries the proposed `consumer` metadata already; the baseline accepts the structurally compatible request but ignores that metadata. The export/free-spend assertions expose actual current behavior, rather than failing because an import is missing:

```ts
const iron = resourceGoodId('iron');
const seed: ReserveLedger = {
  balances: { [iron]: { native: 6, imported: 8 } },
  reservations: [],
  incoming: [],
};
const request = {
  id: 'city-a:1:iron', goodId: iron, ownerCivId: 'alpha', amount: 10,
  reason: 'active-production' as const,
  consumer: { ownerCivId: 'alpha', cityId: 'city-a', occurrence: 1, itemId: 'swordsman' },
};
const first = reserveStock(seed, request);
expect(first.ok).toBe(true);
if (!first.ok) throw new Error('first reservation must succeed');
expect(getExportableQuantity(first.ledger, iron)).toBe(4);
const freeSpend = consumeStock(first.ledger, iron, 4);
expect(freeSpend.ok).toBe(true);
if (!freeSpend.ok) throw new Error('free native stock must be spendable');
expect(freeSpend.consumed).toEqual({ imported: 0, native: 4 });
expect(getReserveBalance(freeSpend.ledger, iron)).toEqual({ native: 2, imported: 8 });
expect(getCommittedQuantity(freeSpend.ledger, iron)).toBe(10);
const completion = consumeStock(freeSpend.ledger, iron, 10, { reservationId: request.id });
expect(completion.ok).toBe(true);
if (!completion.ok) throw new Error('held recipe must remain payable');
expect(completion.consumed).toEqual({ imported: 8, native: 2 });
expect(getStoredQuantity(completion.ledger, iron)).toBe(0);
expect(getCommittedQuantity(completion.ledger, iron)).toBe(0);
expect(seed.balances[iron]).toEqual({ native: 6, imported: 8 });
expect(seed.reservations).toEqual([]);
```

Import `ReserveLedger` as a type and the named arithmetic functions from the reserve module (or its new type leaf), and `resourceGoodId` from the goods catalog. Wrap the body in a descriptively named `it` test. Keep separate double-commit and second-good rollback tests with the exact values above; this kernel example does not replace Task 4's public two-city test. At baseline `getExportableQuantity` returns 0 instead of 4; current unreserved consumption also incorrectly takes imported 4 instead of native 4.

Run: `./scripts/dev.sh test tests/systems/resource-reserve-system.test.ts tests/systems/trade-good-definitions.test.ts`. Expected: new regression fails for the named arithmetic before the fix; all pass after.

### Task 2 — Add profiles and convert the complete hard catalog

**Modify:** resource/goods catalogs, existing Building/TrainableUnitEntry fields, unit/building catalogs, pure production-cost classification. **Create:** `resource-material-costs.ts` with its mirrored test.

- [x] Add pure typed quantity profile and `materialCosts` metadata, using the inventory in §3.1. Keep cattle/salt/luxuries nonquantitative.
- [x] Implement `getMaterialRecipe(itemId)` as the one validated catalog lookup; return a discriminated known/unknown result. Provide a pure `evaluateMaterialFunding(ledger, recipe, ownCommitment?)` with exact required/committed/available/missing rows and no mutation.
- [x] Use atomic recipe operations from Task 1 for reserve and spend. Validate recipes generically: known good, stored settlement, material use, positive safe integer, correct sum for duplicated rows.
- [x] Preserve all nonmaterial catalog gates, production discounts and explicit upgrade chains. No numeric material-price UI yet until persistence is authoritative.
- [x] Add completeness coverage for every old hard requirement and a non-deposit fixture; negative tests prove a continuing-access good/unknown good cannot be a hard recipe. Assert the knight needs both full rows (only horses fails, only iron fails, both succeed).

Run the new mirrored material tests plus existing `tests/systems/resource-definitions.test.ts`, `production-costs.test.ts`, `production-cost-context.test.ts`, `production-cost-parity.test.ts`, and `city-system.test.ts` for modified catalog coverage. Expected: hard catalog parity preserved, iron-based infrastructure discount still applies, soft-only entries remain optional.

### Task 3 — Persist the economy and migrate once

**Modify:** type leaves/existing interfaces; both creation functions; city-lifecycle; save version and ordered registry. **Create:** accrual/starting-state owner and migration step. **Tests:** source eligibility, new-game, migration/compatibility and a focused new migration test.

- [x] Initialize per-living-civ empty/bounded-source ledgers and neutral per-city revision/occurrence state in solo/hot-seat creators. Reuse the same non-grant initialization helper; do not import the migration graph into game creation.
- [x] Add the numbered migration applying §3.7, with immutable results and exact finite grant provenance. Keep optional-field defaulting separate from the once-only historical transformation.
- [x] Extend `tests/storage/fixtures/save-compat/manifest.ts`: a well-formed source-v35 case containing native active work, purchased-access-only active work, progress-after-source-loss work, duplicate queued units, a free fallback and a completed hard building/unit. `downgradeToVersion` must remove the new fields for pre-activation saves so the matrix really tests the migration.
- [x] Test one source → native 2; many sources → native at most 40; current-schema reload → **zero new seed/grant**. Purchased iron active swordsman with no native source → exactly imported 10, committed 10, no incoming; second sword gets no grant. Native iron seed 2 + qualifying active swordsman → imported grant 8, commitment total 10. No retrospective payment for existing entities.
- [x] Test grant completion versus cancel/reorder invalidation: completion spends 10; cancel leaves original native 2, removes grant 8 and commitment; repeating cancel/reload changes neither. Test mixed ordinary imported stock separately so grant expiry never destroys someone else's paid/imported stock.
- [x] Update shared reserve invariant, `ELIMINATED_CIV_AREAS`, fixture coverage, persisted-shape snapshot, migration digests and generated compatibility documentation intentionally. Use existing documented regeneration switches, review changed keys, then rerun without update flags. No baseline carve-out for reserve fields in deterministic comparison.

Focused commands:

```text
./scripts/dev.sh test tests/systems/resource-source-eligibility.test.ts tests/systems/resource-acquisition-system.test.ts
./scripts/dev.sh test tests/storage/material-reserves-migration.test.ts tests/storage/save-migrations.test.ts tests/storage/save-compat-coverage.test.ts tests/storage/new-game-completeness.test.ts
./scripts/dev.sh test tests/storage/save-migration-registries.test.ts tests/storage/save-migration-equivalence.test.ts tests/storage/save-persisted-shape-ratchet.test.ts
```

Expected: schema and registry agree; every new persisted path is represented by a nonempty fixture; migrate → play → save → reload works; both creators equal their first normalized shape for the new data. Do not claim playability from schema-version equality alone.

### Task 4 — Own active material commitments and state-aware queue edits

**Create:** `city-production-materials.ts`. **Modify:** planning-system, production eligibility/availability, controller calls and any existing tests using changed queue signatures.

- [x] Implement a state adapter that resolves city.owner, ensures a valid active reference, preserves an unchanged commitment, releases an old occurrence, and atomically reserves the new active recipe or returns waiting. Never partially reserve.
- [x] Add state-aware reorder/remove commands and typed invalid-index/stale-revision denials; route real controller callers through them. Keep pure array/consequence helpers for previews if useful, but do not expose an unpaid state-changing route to UI.
- [x] Bind occurrence changes to actual head-occurrence transitions, including identical adjacent units. A tail move must not release/refund/re-reserve the head. Invalid indices are true no-ops, not a way to advance revisions or clear progress.
- [x] Change enqueue and browse eligibility to permit material planning, retaining every existing nonmaterial gate. Funding denial is not an `enqueueRefused` drift if the item is legally plannable; it is successful enqueue with an explicit waiting projection.
- [x] Implement quantity-aware obsolescence; preserve already valid active work, and keep no-stock predecessors/fallbacks usable.

Public-path regression: alpha owns cities A and B, free iron 10, techs make `swordsman` legal. Enqueue swordsman in A → stored 10/committed 10/free 0; enqueue it in B → B waits, total committed stays 10. Add an A follow-up → no new commitment. Remove A head → released stock is immediately available and the edited/new active row is recomputed; retry B through the shared owner → one funded head, never two. Assert input state immutable.

Additional cases: A `[swordsman, swordsman]` completes/removes first → fresh occurrence; a stale buy/remove for the first cannot charge/remove the second. Tail-only reorder preserves progress and material IDs. Moving the head with progress uses existing consequence warning. Unfunded active progress 23 remains 23 across a shortage round.

Run `tests/systems/planning-system.test.ts`, `production-enqueue-contract.test.ts`, `city-system.test.ts`, new mirrored city-material tests, and `tests/app/controllers/panel-actions-controller.test.ts`. There is **no** existing `tests/app/controllers/city-panel-actions-controller.test.ts` at this baseline; extend the actual controller suite or deliberately create/register its mirror, rather than running a nonexistent path.

### Task 5 — Activate accrual and production in the real round pipeline

**Create:** `core/round-phases/commerce-resources.ts`. **Modify:** phase index/ID, city-turn, per-civ city-production and the source/accrual owner. **Tests:** new phase/accrual mirrors, city processing, round-order goldens.

- [x] Register `commerce-resources` after pre-civ reconciliation and before per-civ production. Check liveness through `getCivilizationLiveness`; no minor/non-major ledger or dead-civ accrual.
- [x] Accrue only from revealed, usable, deduplicated native sources using the canonical predicate; cap by `getStorageHeadroom`, including incoming claims. Completed improvement versus unfinished, occupied, outpost and deliberate center exception all need coverage. Source capture/pillage ends future extraction, not existing stock.
- [x] Mark once-per-turn accrual atomically. Re-entering the phase on its output accrues nothing; a later completed round accrues once. Loading a midstate neither replays nor skips the next legitimate accrual.
- [x] Make `processCity` consume a small explicit material-readiness input, not GameState. Preserve growth and nonproduction output while waiting. Remove hard-material loss dequeue logic while retaining actual structural-invalidity behavior.
- [x] Sequence queue normalization and material preparation so funding follows the current valid head. Natural completion succeeds on a candidate state before committed stock/events are finalized. Apply production disposition correctly: waiting output is withheld/discarded under the existing conservation equation, not applied/carried/converted. Keep its separate reason in the production projection; do not alter that equation just to hide withheld output.
- [x] Retry after accrual; if stock reaches the full recipe this round, the city can produce this round. Completing/promoting an item attempts the new active recipe but does not grant another production tick.
- [x] Pin intentional phase/event/state changes in `tests/core/round-phase-order.test.ts` and `tests/core/fixtures/round-phase-golden.json`; update literal order and rich fixture coverage, not just hashes.

Exact round regression: stock 8, one eligible iron mine at +2, active iron-10 item with progress 23. One real completed round accrues to 10, reserves 10, then adds the normal production yield; a control with unfinished/occupied mine stays at 8/progress 23. Another human's turn/viewer does not change the result for the owner. A ledger at stored 35/incoming 5/capacity 40 accrues 0; stored 45 is retained, with 0 additional accrual. Two cities listing one source still yield +2 total.

Run focused new phase/accrual tests, `tests/core/round-phases-structure.test.ts`, `round-phase-order.test.ts`, `turn-manager.test.ts`, `tests/systems/city-system.test.ts`, `unit-production-completion.test.ts`, `production-decision.test.ts`. Add a save/reload continuation assertion around waiting → funded → completed using `assertSimulationEquivalent`.

### Task 6 — Make rush-buy and upgrades one atomic payment

**Modify:** economy quote, rush-buy executor, upgrade evaluator/executor, AI treasury/upgrade and UI query callers as required by signatures. **Tests:** economy, unit-upgrade, completion, cost parity, AI treasury/upgrades and controller tests.

- [x] Add full recipe/quantity/missing-material output and typed denials to the canonical quotes. Have executors re-run those queries against live state before committing.
- [x] Require a fresh expected active occurrence for buy; do not let one stale callback purchase two identical queued items. Carry missing counts through selected-unit/city upgrade presentation instead of translating every material failure into generic tech-unavailable text.
- [x] Spend reservation or free recipe exactly once on a candidate state with gold and actual unit placement/basing. Announce only the accepted transaction. Upgrade uses full target recipe and existing gold fraction.
- [x] Update `completesFromOwnProduction`: a materially waiting head cannot “finish naturally this turn” merely because its stored progress + projected raw output exceeds cost.
- [x] Verify explicit free/scripted rewards still use their free owners and the low-level trainable-unit completion stays material-neutral. Do not charge quest rewards by putting payment in `createUnit`/`completeUnitProduction`.

Matrix: (a) gold enough/materials enough succeeds; (b) gold only fails; (c) materials only fails; (d) placement/basing fails after a valid material quote and consumes nothing; (e) stale target/head/action fails with no writes/events; (f) an already reserved item spends once, not twice; (g) imported-first locked provenance matches the kernel; (h) repeated callback after first success cannot act on the new occurrence. Assert gold delta, both provenance balances, queue/progress, ID counters, roster, air base/spy/reward state, and event counts, not only `success`.

Use `tests/systems/economy-system.test.ts`, `unit-upgrade.test.ts`, `unit-production-completion.test.ts`, `production-cost-parity.test.ts`, `tests/ai/ai-treasury.test.ts`, `ai-upgrades.test.ts`. `unit-upgrade.test.ts` is the existing relevant test despite not being an exact filename mirror. Add a `rush-buy-system.test.ts` only if needed, then shard it correctly.

### Task 7 — Close capture, race, wonder and elimination release paths

**Modify only the verified owners:** capture/raze/transfer, breakaway/reconquest, world-race loser cleanup, wonder head changes, elimination. **Tests:** their existing relevant domain suites and shared save invariants.

- [x] Use the shared head-transition/release owner in every actual path listed in §3.8; recheck current callers with scoped search. Preserve existing progress, world-race gold-refund and wonder carry semantics. Material cancellation releases unconsumed ordinary stock; it does not invent a second gold refund.
- [x] Captured city loses the old owner's commitment, new owner gets none for free, and released migration credit expires rather than becoming loot. Raze and elimination remove orphan claims immediately. Same-owner transfer and repeated cleanup do nothing.
- [x] A race loss must release every affected rival-city active commitment, not only the first. A wonder prepended over a material item releases the previous active claim immediately; restoring/promoting a hard item attempts a new claim.
- [x] Add earned-control invariant tests: corrupt owner/ref/head/provenance fails, the valid version passes. Classify the new GameState field as operational teardown for elimination. Conservation assertions count grant expiry and eliminated inventory explicitly rather than treating disappearing stock as ordinary spending.

Run relevant existing capture/breakaway/world-race/wonder/eliminated-civ tests; run the smallest files that cover the actual edits first. If wonder owners changed, satisfy the current impact contract's wonder checks. Do not claim queue integration complete from button-only tests.

### Task 8 — Build authoritative reserve and production read models

**Create:** `resource-reserve-presentation.ts`. **Modify:** `production-decision.ts`, relevant cost context and production presentation/copy; add a focused material presentation helper only if it has real consumers.

- [x] Supplies rows: revealed material good identity/icon/unit, native/imported stored, total stored/capacity, committed, free, incoming (zero in live MR09), current eligible extraction rate and capped/overflow explanation. Explicitly label migration assistance; do not call old temporary access “stock”.
- [x] City rows: full hard recipe; own commitment; national free amount available to this item; exact missing amount; funded/waiting status; and estimated completion. An active item's owned reservation counts toward its own funding. Tail entries are visibly “planned, not reserved”.
- [x] Gate “fundable now” on the entire recipe and applicable nonmaterial legality. Missing 1 of 10, incomplete second material, incoming-only, other-city-reserved, source-only or legacy-access-only are negative controls.
- [x] Set active/follow-up completion estimates to unknown/waiting where materials make completion unbounded. You may show separate production-only effort clearly labeled “after materials are funded”; do not add `ceil(missing / current extraction)` and promise that as completion when other cities compete. Positive current extraction can be labeled as a rate, never guaranteed allocation.
- [x] Keep pricing through the owning civ's canonical production-cost context. Do not introduce a cycle between funding, cost context and availability. Soft-resource and Circular Manufacturing pricing remains MR10's concern.
- [x] Owner-scoped queries receive explicit civ/city IDs; viewer projection admits only that viewer's own stocks/cities and revealed goods. Hidden rivals' sources/stock/recipes must not affect text, ordering or tooltips. Use the repository differential harness with an earned positive control and hot-seat test.

Tests: exact count rows for stored 14/committed 10/free 4/incoming 0; active reserved item fundable with national free 0; a second city sees missing 10; after release both city forecasts and Supplies update. Test unknown data produces an honest denial, not free production.

### Task 9 — Wire the live Supplies table and city interactions

**Create:** the two focused UI sections. **Modify:** existing marketplace/city panel composition and the real panel controllers/publication wiring.

- [x] Invoke reserve section in the existing `trade-supply-supplies` section. Preserve Routes, access/luxury information and contained-import copy; replace misleading quantitative `Owned`/`Not in inventory` labels with the actual reserve model. Policies still has no future import buttons.
- [x] Invoke city material rows for active and planned entries; do not leave old boolean resource-only labels or “turns remaining” suffixes around a waiting/unknown ETA. Missing quantities and reasons are visible without hover.
- [x] Keep the complete legally plannable catalog reachable, including unfunded units/buildings and useful resource-poor alternatives. Recommendations may be filtered; the only build/action surface may not be filtered down to them.
- [x] Publish complete state through `GameSession.commit/update/batch`; never manual renderer/HUD pushes or an in-place ledger mutation. Refresh open panels from the committed state for same-turn enqueue/reorder/remove/buy and after a round. Inspect existing panel refresh subscriptions; explicitly extend their current owner if they do not rerender these panels. Do not leak subscriptions when a panel closes/reopens.
- [x] Preserve city-panel callback return of the fresh state and tab/reopen behavior. Reacquire DOM controls after rerender; stale handlers carry old revision/occurrence tokens and refuse safely. No duplicate click/touch bindings. Use `createGameButton`, 44px touch targets, semantic buttons and `textContent` for new dynamic rows.
- [x] Run jsdom click-through tests and real controller/session tests. The existing controller test file is `tests/app/controllers/panel-actions-controller.test.ts`; its mocked render assertions alone do not prove live DOM behavior, so retain both layers.
- [x] Add `tests/e2e/issue-1506-material-reserves.spec.ts` using existing `tests/e2e/helpers/save-fixture.ts` / `installAutosave`, campaign helpers and outcome-driven actions. Launch the real Trade & Supply/city panels, reorder/remove, advance a round, save/reload and inspect the actual DOM. No test-only mutation shortcut that bypasses the command being tested.

Focused UI files: new section mirrors; `tests/ui/marketplace-panel.test.ts`, `marketplace-panel-effects.test.ts`, `city-panel-resources.test.ts`, `city-panel-production-decision.test.ts`, `production-truthfulness.test.ts`; `tests/app/controllers/panel-actions-controller.test.ts`. Extend the narrow relevant suite per edited source, not all UI files by default.

### Task 10 — Make AI fund useful work without stalls

**Modify:** `src/ai/ai-production.ts` and only actual related AI production/upgrade/research consumers. **Tests:** production, idle fallback/refusal, upgrades, treasury and a bounded scenario.

- [x] Keep generic catalog enumeration; all legally plannable items retain candidates/diagnostics as appropriate, but selection for useful work must consult the shared quantity evaluator. Distinguish “plannable” from “selectable/fundable now” explicitly so catalog completeness tests do not accidentally require AI to fund everything.
- [x] Use latest `nextState` after each city assignment; do not cache a fundability answer across a successful reservation in another city. The existing serial candidate regeneration is useful and should remain.
- [x] If an AI queue is already waiting and has no current path to funding, choose a useful fundable role substitute through canonical queue commands, or select idle conversion when no useful work exists. With no imports in MR09, source-less items cannot be waiting for hypothetical shipments. Do not endlessly re-enqueue the same item, erase/recreate it every turn, mint stock, or silently count unreserved tails as fulfilled military demand.
- [x] Use a concrete bounded retention rule for an already waiting AI head: if a useful fundable alternative exists, retain invested work only when a pure one-resource-phase projection can fund its **whole** recipe. Project capped native accrual from current eligible sources, then attempt current active claims in the same stable order as the real phase, using the shared immutable accrual/reconciliation functions on a candidate state. Never project incoming access, future mines, future queue tails or hypothetical imports. If this head remains unfunded in that projection, select the useful alternative through canonical commands and trace the deliberate progress loss. If no useful alternative exists, keep the legal plan/idle policy explicitly, without a false promise of completion. This is an AI selection heuristic, not a player ETA guarantee. It adds no timer or new persisted AI state; evaluate afresh against actual state each turn. Human queues are never auto-replaced by this rule.
- [x] Recommendations/required idle-city choices use fundable candidates or clearly offer “plan and wait”; do not present an unfundable item as an immediate solution to an idle production warning.
- [x] No commerce/import AI or supplier policy work. Preserve tech planning roles and normal free/scenario bonuses; difficulty is not a material-legality bypass.

Exact fixtures: two AI cities, total iron 10, both prefer iron units → at most one commits, other produces a useful free alternative. Zero iron/no source over several rounds → useful production completes and the same impossible enqueue does not recur. Iron 8/+2 source with no competing unfunded head → invested waiting work funds next round without lost progress. Two waiting iron-10 heads and only 8/+2 available → stable-order winner may retain/fund; the other selects a useful free substitute, so positive extraction alone cannot justify an endless wait. Missing amount greater than the capped next-phase output plus free stock → choose a useful fundable alternative if present. Assert the candidate projection neither mutates real state nor advances `lastAccruedTurn` there. Late-era no aluminum/uranium → resource-free land/economic alternatives remain useful. With currentPlayer pointing at a wealthy human, an AI with no stock still cannot buy/upgrade with the human ledger.

Run `tests/ai/ai-production.test.ts`, `ai-production-idle-fallback.test.ts`, `ai-production-enqueue-refusal.test.ts`, `ai-upgrades.test.ts`, `ai-treasury.test.ts` as relevant, then current impact-selected AI playability and status evidence. Keep the bounded scenario deterministic and measure completed useful items/waiting rounds; do not weaken existing modern-force or stall assertions.

### Task 11 — Acceptance, calibration, verification and review

- [ ] Execute the truth table/replay and regression matrix below. Measure 2/source versus 10/recipe pacing for early copper/iron, the two-material knight, a late uranium item and a source-poor fallback. Record source output, wait rounds, completed useful items and progress retained; keep any measured tuning together in catalog data.
- [ ] Run every mirrored test for every changed source path (fallback to the smallest relevant domain suite where no mirror exists), source checks, and the current `verify:impact` requirements. Do not present this plan's example file list as an exhaustive substitute for the actual diff.
- [ ] Allocate every newly discovered Vitest test through the measured four-shard procedure. Classify costly multi-city/multi-era simulation tests under local intensive-simulations as well. Browser specs stay out of Vitest shards.
- [ ] Complete web and Tauri frontend builds for storage changes as selected by impact; inspect web `/conquestoria/` and Tauri relative assets. Native packaging is conditional on actual package inputs, not ordinary gameplay changes.
- [ ] Review both branch and uncommitted **full** diffs, including generated records. Re-fetch/rebase before publication using canonical helpers; resolve only necessary conflicts. Rerun invalidated proof for the final exact tree/HEAD.
- [ ] Update issue #1506, parent checklist and registered active plan with actual implementation MR/evidence. Keep later slices unchecked; do not close issues, approve or merge remotely without the user's exact authorization.
---

> **Part 3 — player truth table, interaction replay, test-writing, build/verification and self-review.**
> **Implementation plan — Part 3 of 3: player truth table, interaction replay, test-writing, build/verification commands and self-review.** [Part 1: design and architecture](https://github.com/a1flecke/conquestoria/issues/1506#issuecomment-6281921203) · [Part 2: implementation tasks](https://github.com/a1flecke/conquestoria/issues/1506#issuecomment-6281922739).

## 6. Player Truth Table

| Before | Action/state transition | Internal consequence | Immediate visible result / still reachable |
|---|---|---|---|
| Iron stored 10/free 10; A empty | Queue swordsman in A | A reserves 10, no spend | A shows required/committed 10; Supplies committed 10/free 0; complete catalog and queue controls remain |
| A holds all 10; B empty | Queue swordsman in B | B keeps planned head, no reservation | “Waiting for materials · Iron: missing 10”; existing progress unaffected; free alternatives visible |
| A funded head + follow-up | Add second hard item | Tail only, no claim | “Planned, not reserved”; active claim unchanged; order/needs visible |
| A funded head, different tail | Reorder tail to head with confirmed loss | Release old, expire its restricted grant if any, reserve new if possible | New order, commitment/missing amount and ETA update in same panel; remaining queue preserved |
| Funded head with progress | Remove head with confirmation | Release ordinary stock, apply existing progress loss | New head/material/ETA rows and national free update; tail still reachable |
| Waiting progress 23, iron 8, usable source | Complete a round | +2 accrual, full commitment, normal production | Waiting clears, progress advances; Supplies counts change without reopen |
| Funded head, source later lost | Complete a round | No new source output; existing commitment honored | Source rate 0, work still funded; no false resource-loss dequeue |
| Buy quote valid | Buy expected active occurrence | Gold/materials/placement/queue commit once | One completion, new head/current counts and buy state update |
| Stale buy or failed placement | Confirm old callback/denied placement | No paid mutation or completion event | Typed explanation and refreshed quote; subsequent valid action still works |
| Eligible upgrade with target recipe | Upgrade | Full recipe + gold + action atomically | Unit type/action/material numbers update, health/XP retained |
| Before reload/owner handoff | Save/reload or change viewer | No grant/accrual; reproject owner | Same quantities/token/progress for owner; other viewer's private stock absent |
| Captured/razed/race-lost hard item | Canonical lifecycle transition | Old commitment released, restricted credit expires | Counts/active status update now; no national stock copied to captor |

### Misleading UI Risks

- **Fundable now** requires the whole recipe and applicable nonmaterial conditions. One unit of iron, a second recipe row missing, an incoming claim or another city's commitment must fail the label. A valid own active reservation passes even with free stock zero.
- **Stored/free/committed/incoming** are different quantities; release never increases stored. Legacy temporary access and migration assistance must be named accurately.
- **ETA** cannot be a numeric promise through indefinite material waiting. A follow-up behind a waiting head has no guaranteed start/finish. Separate effort from delivery/funding uncertainty.
- **Native/source rate** must not include old purchased access or migration grants. A remembered source that is now unusable produces no live stock. Unrelated hidden foreign facts must not influence the owner's visible rate; actual loss of an owned source changes extraction without revealing a hidden occupier's identity or other private facts.
- **Alternative usable** means legal and actually fundable in this city; a successor needing iron 10 is not usable with iron 1. A later free successor can still obsolete the predecessor.
- **All items** remains complete even if AI/recommendations prioritize only currently useful entries. New material requirements must not hide the only action surface.
- **Imports unavailable** remains true: no supplier/purchase/cargo/policy action appears before its slice.

### Interaction Replay Checklist

- [ ] Open the actual city launcher and Trade & Supply launcher; inspect owner context and counts.
- [ ] Add first item, add a second, reorder, remove; confirm pre-existing tail survives.
- [ ] Exercise head-change confirmation and tail-only no-loss behavior.
- [ ] Reacquire the new DOM button after each rerender; next valid click succeeds.
- [ ] Invoke a captured stale revision/occurrence callback; zero extra spend/removal/completion.
- [ ] Wait through a shortage, accrue, fund and complete; inspect progress and both panels.
- [ ] Rush one of two identical entries; stale click cannot buy its replacement.
- [ ] Fail upgrade/buy on gold, materials and placement independently; retry after fixing the real condition.
- [ ] Close/reopen and save/reload mid-wait and mid-commitment; exact identity/counts remain.
- [ ] Switch hot-seat viewers; stocks/tech-revealed rows/selected city reproject correctly.
- [ ] Exercise keyboard and touch activation with visible outcome assertions and 44px targets.

### Queue And ETA Checklist

- Active item and follow-ups remain visible. Active may reserve; tail cannot.
- Show required/committed/missing amounts, preserved progress and waiting reason.
- Reorder/remove/buy/invalidations update order, funding and ETA together in the open panel.
- Tail ETAs behind material waiting are unknown/conditional, never a finite total derived only from production costs.
- Structural-invalid item removal follows existing explicit reason policy; material shortage waits.
- Duplicate units/warheads have separate active occurrence identities.

## 7. Test-writing instructions for DeepSeek

Use existing fixture builders such as `makeLegendaryWonderFixture`, `makeWonderPanelFixture`, save-compat baseline, and E2E autosave helpers where their setup fits. Add a small typed fixture builder under `tests/systems/helpers/` only if several new tests truly share it. Start from valid state and alter only the fact under test; do not assemble a large partial GameState with unchecked casts for integration tests.

- Name each test after its observable contract and boundary. Arrange a real owner/city, both required techs, correct source/improvement and explicit ledger. Assert fixture legality before action so a test cannot pass because the item was unavailable for an unrelated reason.
- For conjunctions cover A-only, B-only and A+B, with positive controls. For funds cover 0, 1, 9, 10, 11; for combined recipes cover each missing row. Test free stock, own reservation, other reservation and incoming separately.
- Unit tests assert pure arithmetic and input immutability. Public command tests assert the entire payment/consequence footprint. Real `processTurn` tests prove owner-independent ordering and continuity. DOM tests click through controls and inspect text, disabled state and queue/ETA order. Browser tests prove the launcher/controller/session path really uses that DOM code.
- Do not mock the material evaluator in tests intended to prove UI/AI/executor parity. Mock external ports only where needed; use real session subscription publication in controller tests.
- Snapshot/golden updates explain deliberate behavior changes and are rerun without update mode. Do not regenerate unrelated hashes, raise timeouts, add known-gap exclusions or remove invariants to hide a bug.
- Deterministic continuation uses `assertSimulationEquivalent` / `firstSimulationDivergence` from `tests/helpers/deterministic-state.ts`. Do not exclude reserves, references, grants or accrual markers. Use fixed seeds and stable ID ordering; no new random draws are needed here.
- Viewer-sensitive projection tests use `tests/helpers/viewer-safety.ts`, `domProjection`, an earned change and `expectHotSeatDifferential`. An empty panel is not a privacy proof.
- Assertions on failed payment include unchanged gold, stored/provenance, commitment, queue/progress, unit/action/basing/roster, ID counters, reward state, and zero completion events. Assertion only on an error string is insufficient.

Minimum regression matrix before calling MR09 complete:

| Contract | Proof location |
|---|---|
| No double commit / active only / full multi-good rollback | Kernel + material-cost + public two-city queue tests |
| Provenance locked, imported cannot export, release cannot mint stock | Kernel + migration mixed-provenance tests |
| Native sources revealed/completed/unoccupied/deduplicated/center/outpost | Source + actual accrual phase tests |
| Waiting preserves progress; resumes before production; no catch-up output | City-turn + actual round integration/disposition tests |
| Head/tail/duplicate/repeated/stale queue edits | Planning + live city DOM + controller tests |
| Buy/upgrade spend exactly once or nothing on failure | Executors + placement/basing negative controls |
| Free/scripted grants exempt | Existing completion/reward paths and footprint controls |
| Fundable successor and free late alternative | Availability/production/enqueue + AI tests |
| Bounded native seed/active credit/expiry/reload once | Ordered migration + compatibility matrix + continuation |
| Capture/revolt/raze/race/wonder/elimination release | Canonical lifecycle + invariant earned controls |
| Supplies/city values and ETAs actually render and refresh | Projections + jsdom + controller + browser replay |
| Hot-seat owner separate from viewer | Queue/round/upgrade/AI and differential UI tests |
| Source-poor AI useful production over repeated rounds | Bounded deterministic AI scenario + impact-selected playability |

## 8. Build, test and publication commands

Use one direct shell command per tool call, in the implementation worktree. No `cd ... &&`, shell loops, command substitutions, pipes/redirection for tests, bare node/npm/npx/yarn, or custom wrappers to bypass approval. `dev.sh` logs full output to `.verification/logs/`; inspect with `./scripts/dev.sh log <task> 200`.

For source edits, first run the source checker on the actual changed `src/` paths, then **all** mirrored tests in one focused command per coherent check. Example (not an exhaustive final diff list):

```text
./scripts/check-src-rule-violations.sh src/systems/resource-reserve-system.ts src/systems/resource-material-costs.ts src/systems/city-production-materials.ts
./scripts/dev.sh test tests/systems/resource-reserve-system.test.ts tests/systems/resource-material-costs.test.ts tests/systems/city-production-materials.test.ts
./scripts/dev.sh build
./scripts/dev.sh verify-impact
```

`test` does not typecheck. Build runs TypeScript and Vite. During development `./scripts/dev.sh typecheck` is useful, but does not replace build evidence when required.

New default Vitest file process (package script supplies the explicit four shard names at this baseline):

```text
./scripts/run-with-mise.sh yarn test:profile:default
./scripts/run-with-mise.sh yarn test:ci-shards:allocate
./scripts/dev.sh test tests/scripts/ci-test-shard-selection.test.ts
```

Do not allocate from a failed/incomplete profile. Commit `scripts/ci-test-shards.json` after reviewing the measured result. Follow the targeted fixed-shard rules if actually doing a measured rebalance rather than normal registration. If tracked scripts change, the trusted dispatcher may need review; do not disguise that operation.

Storage/golden regeneration uses the existing documented switches, only after reviewing expected changes, each as a direct command:

```text
UPDATE_PERSISTED_SHAPE=1 ./scripts/run-with-mise.sh yarn vitest run tests/storage/save-persisted-shape-ratchet.test.ts
UPDATE_MIGRATION_GOLDEN=1 ./scripts/run-with-mise.sh yarn vitest run tests/storage/save-migration-equivalence.test.ts
UPDATE_SAVE_COMPAT_DOC=1 ./scripts/run-with-mise.sh yarn vitest run tests/storage/save-migration-registries.test.ts
UPDATE_1239_REFERENCE=1 ./scripts/run-with-mise.sh yarn vitest run tests/core/round-phase-order.test.ts
```

These write known generated artifacts and can require a one-time approval. No “Allow always”, widened wrapper, untracked tsconfig or alternative executable spelling. After regeneration run the ordinary focused tests and inspect exact drift. Compatibility-matrix/continuation runs are real acceptance tests even where more expensive than the first focused checks.

Browser replay:

```text
./scripts/run-with-mise.sh yarn playwright test tests/e2e/issue-1506-material-reserves.spec.ts
./scripts/dev.sh web-smoke
```

The focused spec uses the existing config and `/conquestoria/` dev server. Existing browser setup/network requirements still apply; report an unavailable browser/runtime instead of claiming replay passed.

**Final required evidence comes from `scripts/data/verification-impact.json` through `verify-impact`, not a second prose gate matrix.** At the audited baseline the proposed AI/turn/storage/UI changes can select build, durable full suite, AI playability, performance report, Tauri frontend, wonder checks, shard allocation and docs/maintainability work. Execute what the actual current diff requires, and distinguish optional diagnostics from requirements.

Common evidence commands, run only when selected/applicable:

```text
./scripts/dev.sh build
./scripts/run-with-mise.sh yarn build:tauri
./scripts/dev.sh docs-lifecycle
./scripts/dev.sh maintainability-check
./scripts/run-with-mise.sh yarn perf:report
./scripts/run-with-mise.sh yarn verify:launch ai-playability --wait
./scripts/run-with-mise.sh yarn test:ai-playability:status
./scripts/run-with-mise.sh yarn verify:local:status
./scripts/dev.sh verify-pr
./scripts/dev.sh verify-pr-status
./scripts/dev.sh durable-status
```

Run verification on the final clean intended commit; inspect existing matching status before relaunching durable work. `verify-pr` is the canonical build-plus-durable-suite proof; do not chain build and test. Preserve incomplete command/session IDs and poll the same process until an exit code and normal summary. No duplicate heavy runs or duplicate push. Do not edit files during durable verification, kill processes by name, change timeout policy or share `.verification` across worktrees.

Before publication inspect:

```text
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --stat
git diff
git diff --check
```

If publication is requested, sync main and revalidate any changed final tree, then use the canonical branch push helper. Push includes tests **then** build before upload; keep its session alive through the repository's 1800-second ceiling and confirm remote ref equals local HEAD if output is incomplete. PR body must use `/tmp/pr-bodies/` and the repository `pr-body.sh` workflow. Do not self-approve, merge or close the issue. A PR description names the complete hard-material behavior, exact evidence, migration/grant policy and remaining later slices; any partial slice uses an honest partial title/body and explains why it exposes no dead-end UI.

## 9. Plan self-review and definition of done

Self-review corrections already incorporated:

1. Corrected stale issue ownership: buy executor is `rush-buy-system.ts`, not the economy quote model.
2. Accounted for MR08 kernel limits: no live fields, no cap applied by raw accrual/starter helpers, no locked reservation provenance, no duplicate incoming-ID write check.
3. Made queue changes state-aware and occurrence-aware, including identical adjacent entries and stale callbacks.
4. Kept shortage progress distinct from existing deliberate head-edit progress loss and wonder carry semantics.
5. Added non-button writers: race losses, wonder head replacement, capture/revolt/raze/elimination.
6. Preserved source/access/stock distinctions and deferred soft/fuel/import work to the right slices.
7. Required once-only schema migration evidence, active-only restricted assistance and an explicit expiry-on-release rule; pure helper repeatability is insufficient.
8. Required actual rendered quantities, waiting/ETA truth, real session publication and repeated-interaction tests.
9. Named existing test paths accurately and treated new modules/tests as new work; no nonexistent controller mirror assumed.
10. Kept verification selected by the executable impact contract and required final-tree proof rather than unverified green claims.
11. Replaced an ambiguous positive-output AI wait rule with a one-phase, competition-aware retention check and a starvation regression; it cannot justify indefinite waiting merely because a mine exists.
12. Replaced a redundant kernel example with a behavioral provenance regression that fails on the current code, and specified computed allocation, restricted-grant partial spending and accrual-marker ownership.

MR09 is done only when every #1506 checkbox maps to implemented code, its exact regression and live wiring; native extraction precedes production for every living owner; hard payment is conserved and atomic; source-poor players/AI can continue; saves migrate once and continue deterministically; Supplies and city actions tell the same truth as the executor; and the final required checks have recoverable passing evidence. Record measured calibration results and remaining MR10+ work without claiming this plan itself is implementation or test evidence.
