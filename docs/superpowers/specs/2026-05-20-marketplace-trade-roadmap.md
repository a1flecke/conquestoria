# Marketplace & Trade Roadmap — Index

**Origin:** GitHub issue [#234](https://github.com/a1flecke/conquestoria/issues/234) — "Create proper marketplace ui and system. Make ui meaningful."

**Goal:** Turn the existing read-only marketplace stub into a real, legible trade system: resources visible on the map; clear tech + improvement requirements to own a tradeable resource; resources that actually do something; an age-appropriate progression of trade units that establish and run trade routes; relationship-gated trading; and actual transactions (sell/buy for gold or barter resource-for-resource).

This file is the **index** and is intentionally deliverable #1 so the high-level plan survives context compaction. Each slice becomes its own brainstorm → spec → plan → PR cycle; per-slice decisions get recorded back here (see Living-doc protocol).

## Issue requirements (verbatim, from #234 + comments)

1. Make the marketplace UI meaningful (it is currently read-only — shows prices but does nothing).
2. Do not show items we do not have the tech for.
3. Show resources on the map.
4. Must have tech **and** map improvements to acquire resources (e.g. must have Mining **and** have built a Mine on top of Iron to have Iron to trade).
5. Exception: if the resource is on the same square as a city, **just tech** is required.
6. Trading requires a trade route **and** at least a neutral relationship. War and angry relations terminate trade.
7. Need algorithms for prices.
8. Need a caravan unit, age-appropriate, for establishing trade routes and for doing the actual trade.
9. Trade can be for straight money **or** in exchange for another resource.

## Current state (verified against commit base `84f9182` — do not rebuild)

| Area | Status | Location / detail |
|---|---|---|
| Resource types (6 luxury, 4 strategic) + base prices | ✅ exists | `trade-system.ts` `RESOURCE_DEFINITIONS`. Luxury: silk(grassland), wine(plains), spices(jungle), gems(hills), ivory(forest), incense(desert). Strategic: copper(hills), iron(hills), horses(plains), stone(mountain). |
| Resources placed on map tiles (`tile.resource`) | ✅ exists | `map-generator.ts`, `balanced-map-generator.ts`, `continent-map-generator.ts`; geo maps via `geo-map-loader.ts`. |
| Per-turn price engine (supply/demand) + history + fashion cycle | ✅ exists | `trade-system.ts` (`calculatePrice`, `updatePrices`, `processFashionCycle`); driven in `turn-manager.ts` ~L388. Note: `updatePrices` hardcodes `isMonopoly=false` (S12). |
| Marketplace **building** | ✅ exists | `city-system.ts` L59 `marketplace` (gold +3, cost 50, `techRequired: 'currency'`, icon 🏪). |
| Marketplace **panel** (prices, sparklines, "you own", fashion banner) | ⚠️ read-only | `src/ui/marketplace-panel.ts`; opened via `onOpenMarketplace → togglePanel('marketplace')` in `main.ts`. Counts resources by raw `ownedTiles` (`countPlayerResources`), not by acquisition rules. |
| `TradeRoute` type + per-turn income + embargo enforcement + wonder-route checks | ✅ plumbing exists | `types.ts` (`TradeRoute` has `fromCityId`,`toCityId`,`goldPerTurn`,`foreignCivId?`), `turn-manager.ts` income ~L391 / embargo ~L700, `diplomacy-system.ts` `enforceEmbargoes`, `trade-route-classification.ts`. |
| Economy techs | ✅ exists | `tech-definitions.ts`: `currency`(era3, "Unlock Marketplace building"), **`trade-routes`(era4, "Enable trade routes between cities")**, `banking`, `global-logistics`; `wheel`(era2). |
| Resource discovery mechanism | ✅ exists (espionage) | `identify_resources` is a **spy mission** (`espionage-system.ts`, `espionage-panel.ts`), NOT a tech node. Reveals resources in target territory. Relevant to D-Q5. |
| Relationship bands in use | ✅ exists | Major-civ relationships are a **numeric score −100…+100** (`Civilization.diplomacy.relationships`) + `atWarWith`. Existing thresholds: trade-treaty `>0` (AI `>10`), alliance `>50`, "not too hostile" `>-20` (`ai-diplomacy.ts`, `diplomacy-system.ts`). |
| Resources **drawn on the map** | ❌ MISSING | `hex-renderer.ts` `drawHex` (~L239–277) draws improvements/wonders/villages but **never** resources. `tile-presentation.ts` already carries `resource` through. |
| Trade routes **ever created** | ❌ MISSING / DEAD | `marketplace.tradeRoutes` inits to `[]`; **nothing pushes to it**. The `trade-routes` tech unlock is a **dead promise** — no creation path. |
| Caravan / trade unit | ❌ MISSING | not in `UnitType` union (`types.ts` L230). |
| Tech-gated marketplace display | ❌ MISSING | panel lists all `RESOURCE_DEFINITIONS` regardless of tech. |
| "Improvement on tile required to own a resource" rule | ❌ MISSING, **and blocked** | **Only 4 improvements exist** (`farm`,`mine`,`lumber_camp`,`watermill` — `types.ts` L165). `mine` covers hills/mountain (gems/copper/iron/stone). **No resource-appropriate improvement for grassland/plains/jungle/forest/desert luxuries+horses; desert has none.** S2 adds the missing improvements (D-Q2). |
| Relationship gating on trade | ❌ MISSING | must be implemented as score thresholds (D-Q8). |
| Actual buy / sell / barter | ❌ MISSING | panel has no transaction actions. |
| Gameplay effect of owning a resource | ❌ NONE today | `tile.resource` only read by marketplace supply, map-gen balancing, wonder diversity counts, espionage intel. Owning a resource confers no benefit → S4 adds effects (D-Q1). |

**Gotcha:** `src/systems/resource-system.ts` is misnamed — it computes **city tile yields**, not resources. Trade/resource logic lives in `trade-system.ts`. Put the new acquisition system in a clearly named new file (e.g. `resource-acquisition-system.ts`).

## Shared foundation (used by S1–S4)

A small data addition consumed by several early slices: give each entry in `RESOURCE_DEFINITIONS` a **`tech`** (enabling tech id), a **`requiredImprovement`** (the improvement that harvests it), and an **`effect`** descriptor (D-Q1). S1 needs `tech` (reveal), S2a needs `requiredImprovement` (improvement wiring), S2b needs it for the acquisition helper, S3 needs `tech` (display filter), S4a needs `effect` (yields/happiness), S4b needs a `prerequisiteFor` field (unit/building gates). Land `tech` with S1 and extend the shape as later slices need it.

## Locked-in decisions

| Decision | Choice | Source |
|---|---|---|
| Delivery style | **Fine-grained vertical slices**, each shipping self-contained value | user |
| Decomposition | **15 slices in 5 phases** (below) | this roadmap |
| Roadmap-first | **This index is deliverable #1** | user |
| No dead-end UX | every slice ships working value (no inert buttons/units) | `.claude/rules/incremental-mr-completion.md` |
| Resource effects | **mixed per-resource**: some happiness, some gold, some production; strategic resources are **prerequisites for certain buildings/units** (iron → swordsman) | D-Q1 |
| Improvements | **add resource-specific improvements** (plantation, pasture, camp, quarry, …) | D-Q2 |
| Route scope | **domestic + foreign**; relationship gating applies to **foreign only** | D-Q3 |
| Trade units | **per-age progression** incl. a **naval trader** for overseas | D-Q4 |
| Map reveal | **tech-gated**: a resource appears only with its enabling tech (spy mission may still reveal earlier) | D-Q5 |
| Route capacity | **per-city**, scaling with **tech and buildings** | D-Q6 |
| Caravan fate | **committed to the route**, travels back and forth; losing/disbanding it ends the route (caravans are raidable) | D-Q7 |
| Trade thresholds | foreign trade **establishes at relationship ≥ 0**; **terminates when < −25 or at war** | D-Q8 |

## Conventions every slice MUST follow

Per-slice sections below only note *additions*.

- **Verify before any push/PR:** `bash scripts/run-with-mise.sh yarn build` (the only `tsc` path) **and** `bash scripts/run-with-mise.sh yarn test` must both exit 0. The `require-green-before-push` hook enforces this; catch it locally first.
- **Branch/PR workflow:** never commit to `main`; branch/worktree + PR. Partial slices follow `.claude/rules/incremental-mr-completion.md` (subset title, "Out of scope" list, "why safe to merge partial" paragraph).
- **Hot-seat:** use `state.currentPlayer`; never hardcode `'player'`.
- **Determinism:** seeded RNG only; never `Math.random()`.
- **Immutable turn processing:** systems return a new `GameState` via spread-copy (`.claude/rules/game-systems.md`).
- **UI:** mobile-first touch (≥44px); `createGameButton()` (no bare buttons); `textContent`/`createTextNode()` only (no `innerHTML` with game strings); panels that mutate state they render must refresh; never silently discard a player-visible list.
- **End-to-end wiring:** computed data must render; new units need all 6 wirings (`.claude/rules/end-to-end-wiring.md`); shared consequences actor-complete (human **and** AI/turn) with parity tests.
- **Save compatibility:** multiple save slots are in active family use. New `MarketplaceState`/`TradeRoute` fields, new `ImprovementType`s, new `UnitType`s, and `RESOURCE_DEFINITIONS` shape changes must tolerate old saves (optional fields / defaults / migration). Add a load-old-save regression when state shape changes.
- **AI parity:** any player-affecting trade consequence must also be exercised/usable by AI civs.

## Decomposition — 15 slices

Ship in order. Each slice's spec lives at `docs/superpowers/specs/2026-..-marketplace-sN-<topic>-design.md`, its plan under `docs/superpowers/plans/`.

### Phase 1 — Visibility & ownership

**S1 — Resources on the map (tech-gated reveal).**
*Scope:* add `tech` to `RESOURCE_DEFINITIONS`; draw a distinct icon per `ResourceType` on tiles **only when the viewer has the enabling tech** (D-Q5); tap-to-inspect shows resource name + type; legend entry. The `identify_resources` spy mission may still reveal un-tech'd resources (intel edge).
*Files:* `hex-renderer.ts` `drawHex` (mirror improvement/wonder icon pattern); resource→icon + `tech` data in `trade-system.ts`; `src/ui/icon-legend.ts`; tile/territory inspection (`territory-inspection-panel.ts`/selected-tile info). `tile-presentation.ts` already carries `resource`.
*Done when:* resources render only for tech-holders; inspection shows name+type; legend lists them; fog/unexplored and un-tech'd tiles do **not** leak resources.
*Tests:* every resource has icon+tech (catalog test); reveal appears only with tech (negative without tech); fog-leak negative; spy-reveal still works.
*Extra rules:* ui-panels privacy; `sprites.md` if using sprites.

**S2a — Resource-specific improvements (end-to-end).**
*Scope:* add D-Q2 improvements (plantation, pasture, camp, quarry, …) wired end-to-end. Each new `ImprovementType` needs: terrain-validity rules, a worker-action entry in `worker-action-system.ts`, a `hex-renderer.ts` icon, yield contributions in `resource-system.ts`, and save-migration (old saves lack the new enum members — default to no improvement). Also add `requiredImprovement` to each `RESOURCE_DEFINITION` entry.
*Files:* `types.ts` `ImprovementType` union; `worker-action-system.ts`; `hex-renderer.ts`; `resource-system.ts` (yields); `trade-system.ts` (resource data `requiredImprovement`); save-load migration.
*Done when:* every tradeable resource has a buildable harvesting improvement; improvements only build on valid terrain; icons render correctly; old saves load without error.
*Tests:* every resource has a `requiredImprovement` entry (catalog test); each improvement only buildable on its terrain (positive + negatives); icons render (visual catalog); old-save load regression.

**S2b — Acquisition model + inventory UI.**
*Scope:* (depends on S2a) a pure helper `getCivAvailableResources(state, civId)` applying **(tech known AND the required improvement built, `improvementTurnsLeft===0`)**, EXCEPT a resource on a **city-center** tile needs **tech only** (req. 4 + 5). Surface read-only ("Your resources") panel + tile inspection ("To use: needs Mining + a Mine here — ✓/✗"). Covers **all** cities, not `cities[0]`.
*Files:* new `src/systems/resource-acquisition-system.ts`; inventory UI (new panel section or sidebar); tile/territory inspection panel update.
*Done when:* helper returns correct sets; UI shows owned vs. needs-improvement; city-tile exception works.
*Tests (spec-fidelity conjunction):* tech-without-improvement → unavailable; improvement-without-tech → unavailable; both → available; city-tile + tech-only → available; resource off-city + tech-only → unavailable; multi-city coverage (not cities[0] only).

**S3 — Marketplace tells the truth.**
*Scope:* filter the panel to resources whose enabling tech the current player has (req. 2); replace `countPlayerResources` with S2b's `getCivAvailableResources` helper.
*Files:* `src/ui/marketplace-panel.ts`.
*Done when:* only tech-available resources listed; counts from S2b helper; uses `state.currentPlayer`.
*Tests:* no-tech resource absent (negative); tech-available present with matching count; all tech-available remain reachable (catalog completeness).

### Phase 2 — Resources matter

**S4a — Per-resource yield & happiness effects (D-Q1, part 1).**
*Scope:* (depends on S2b) owning a resource (per `getCivAvailableResources`) confers a **per-resource passive effect** — some luxuries grant happiness, some resources add gold or production. Add an `effect` descriptor to each `RESOURCE_DEFINITION` entry; apply effects in city yield + happiness processing each turn.
*Files:* `trade-system.ts` (effect data); `resource-acquisition-system.ts` (effect applicator); city yield / happiness processing (`resource-system.ts`, `city-system.ts`); city panel shows the active bonus ("Silk → +1 happiness").
*Done when:* having a resource changes happiness or yield; the bonus is visible in the city panel; losing the resource (improvement destroyed / tech lost) removes the bonus.
*Tests:* each resource type grants the correct effect (positive); no resource → no effect (negative); effect removed when resource lost; effect applies across all cities (not cities[0]); seeded RNG only.

**S4b — Strategic resource prerequisites for units & buildings (D-Q1, part 2).**
*Scope:* (depends on S4a — resource tracking in place) strategic resources **gate** certain units and buildings: e.g. iron required to train swordsman, horses required to train cavalry. Enforce in `city-system.ts` TRAINABLE_UNITS/BUILDINGS gating alongside existing `techRequired`. City panel shows a locked state + reason ("requires Iron — build a Mine on an Iron tile").
*Files:* `trade-system.ts` (prerequisite data field on resource definitions); `city-system.ts` (gating logic + TRAINABLE_UNITS/BUILDINGS); city panel locked-state UI; save-compat (no new state — reads from `getCivAvailableResources`).
*Done when:* a unit/building that requires a resource is **blocked without it** and trainable with it; the requirement reason is shown in the city panel.
*Tests (spec-fidelity conjunctions):* no resource + tech → blocked; resource + no tech → blocked; both → trainable (positive); city panel displays lock reason; AI respects gating (does not attempt to train blocked unit).

### Phase 3 — Caravans & routes

**S5 — First trade unit + establish a route.**
*Scope:* (depends on S4b — resource tracking stable) add the first-tier trade `UnitType` wired end-to-end (6 points + `PRODUCTION_ICONS`), gated on `trade-routes` tech (makes the dead unlock real). Move it to a target city to establish a `TradeRoute`. **Domestic** (own cities, no relationship gate) **and foreign** (D-Q3) — foreign requires **not at war AND relationship ≥ 0** (D-Q8). Per-city route **capacity** scaling with tech + buildings (D-Q6); the unit is **committed to the route** (D-Q7 — stationed for this slice; physical travel lands in S6a). Route persists, renders on map + panel, pays existing gold/turn income. AI trains + uses it.
*Files:* `types.ts`; `unit-system.ts`; `unit-renderer.ts`; `city-system.ts` (TRAINABLE_UNITS+PRODUCTION_ICONS+tech gate, capacity helper); `turn-manager.ts` (dequeue/side-effects); `main.ts` (establish interaction + death cleanup); `basic-ai.ts`; route-creation + capacity helpers in `trade-system.ts`; establish-route UI.
*Done when:* unit trainable/visible/AI-used; domestic route works ungated; foreign route succeeds at ≥0 + not-at-war and **fails** otherwise; capacity cap enforced; route renders + pays income.
*Tests:* unit-wiring coverage; domestic success; foreign success (positive) + at-war/below-0 (negatives); capacity-cap negative; AI-parity; route renders/persists.

**S6a — Route lifecycle (termination conditions + notifications).**
*Scope:* (depends on S5) a route terminates when: its caravan unit is destroyed or disbanded; foreign relations drop **< −25** (D-Q8); war is declared (D-Q8); or an embargo is enforced. Integrate with `enforceEmbargoes`. Income stops the **same turn**. Create and terminate events emit persistent notification-log entries (turn #). Domestic routes are unaffected by relation thresholds. Actor-complete: human AND AI war declarations both terminate affected routes.
*Files:* `turn-manager.ts` (lifecycle pass — scrub routes each turn); `diplomacy-system.ts` (hook into `declareWar` + relation-drop path, actor-complete); `diplomacy-system.ts`/`enforceEmbargoes` integration; unit-death cleanup (route scrub when caravan dies); notification routing.
*Done when:* war terminates foreign routes that turn; relations <−25 terminates that turn; unit-loss terminates; domestic routes unaffected; notifications fire once per event.
*Tests:* war → route terminated + income stops (positive); ≥0 + no war → keeps route (negative); relations drop to −26 → terminated; unit-loss → terminated; domestic route unaffected by any relation change; termination notification fires exactly once; actor-complete (AI-declared war also terminates human's route).

**S6b — Physical caravan route-running + raidable (D-Q7).**
*Scope:* (depends on S6a — termination hooks already in place) the committed trade unit **visibly travels back and forth** between its two cities each turn along a shortest path; it is **raidable** (enemy units may attack it in transit using the existing combat system); losing the unit in combat ends the route via S6a's unit-loss hook (no new termination logic needed here).
*Files:* `unit-movement-system.ts` (route-runner: back-and-forth path calculation, per-turn step); `hex-renderer.ts` (unit position updates, route path visualisation); `turn-manager.ts` (advance route-runner on each turn).
*Done when:* caravan unit visibly moves along the route each turn; reaches the destination city and turns back; enemy unit can attack and kill it; route + income end on death (via S6a hook).
*Tests:* caravan advances one step per turn toward destination; reverses on arrival; combat kill removes unit and ends route (regression on S6a unit-loss path); route path does not cross impassable terrain.

**S7 — Trade-unit tiers + naval trader (D-Q4).**
*Scope:* (depends on S6b — caravan movement in place) per-age progression of trade units (caravan → merchant → …) with upgrades, plus a **naval trader** enabling overseas/coastal routes. Tech-gated per era; upgrade path via existing unit-upgrade system.
*Files:* `unit-system.ts`, `unit-upgrade-system.ts`, `unit-renderer.ts`, `city-system.ts`, `basic-ai.ts`, `trade-route-classification.ts` (overseas routes already partly modeled).
*Done when:* later eras unlock stronger/faster traders; overseas routes possible via the naval trader; upgrade path works.
*Tests:* tier tech-gating; overseas route requires naval trader; upgrade path; AI uses tiers.
*Note:* If S7 grows during brainstorming, split into **S7a** (land tiers + upgrades) and **S7b** (naval trader + overseas route classification). Decide at S7's brainstorm.

### Phase 4 — Transactions

**S8 — Sell a resource for gold.**
*Scope:* with an available resource (S2b) + active route (S5) + (foreign) neutral+ relations, sell at the live price; gold credited; supply/price adjust; panel refreshes.
*Files:* `marketplace-panel.ts`, transaction helper in `trade-system.ts`, `main.ts`.
*Done when:* sell works and is gated on ownership+route+relationship; panel re-renders.
*Tests:* sell gated (negatives for missing route / non-neutral / not owned); rerender; price/supply update.

**S9 — Buy a resource for gold.** *Now meaningful via S4a effects.* Spend gold to acquire a resource you lack; its effect applies (happiness/yield, or unlocks a gated unit/building per S4b). Tests: buy gated; effect applied; S4a effect activates; S4b gate lifts if strategic resource acquired.

**S10 — Barter resource-for-resource (req. 9).** Propose/accept swap with another civ (analogous to diplomacy treaties); both inventories update bilaterally; AI evaluates offers. Tests: bilateral update; AI accept/reject; relationship+route gating.

### Phase 5 — Depth & parity

**S11 — AI trades too.** Full parity: AI builds traders, establishes routes, sells surplus, buys needs, handles barter. Tests: AI visibly participates; parity regressions.

**S12 — Price-algorithm refinement (req. 7).** Real monopoly detection with per-player supply share (`calculatePrice` already accepts `isMonopoly`; `updatePrices` must compute it), demand tied to resource effects, fashion interplay. Tests: monopoly raises price; balance tests with seeded statistical sampling.

## Sequencing & milestones

Linear; each phase gates the next.
1. Roadmap (done).
2. **S1 → S2a → S2b → S3** — visibility & honest marketplace.
3. **S4a → S4b** — resources gain effects + unit/building prerequisites (value even before trade).
4. **S5 → S6a → S6b → S7** — trade units, routes, lifecycle, tiers/naval.
5. **S8 → S9 → S10** — transactions.
6. **S11, S12** — parity & price depth (may fold into earlier AI/price work if cleaner during planning).

## Resolved design decisions (Q&A, 2026-05-20)

- **D-Q1 — Resource effects.** Mixed per-resource: some happiness, some gold, some production. Strategic resources are **prerequisites for certain buildings/units** (e.g. iron → swordsman). → S4 (+ city-system gating).
- **D-Q2 — Improvements.** Add resource-specific improvements (plantation, pasture, camp, quarry, …) wired end-to-end. → S2.
- **D-Q3 — Route scope.** Both domestic and foreign; relationship gating **foreign only**. → S5/S6.
- **D-Q4 — Trade units.** Per-age progression incl. a naval trader for overseas. → S5 (first tier), S7 (tiers + naval).
- **D-Q5 — Map reveal.** Tech-gated; the `identify_resources` spy mission may still reveal earlier. → S1.
- **D-Q6 — Route capacity.** Per-city, scaling with tech and buildings. → S5.
- **D-Q7 — Caravan fate.** Committed to the route, travels back and forth; losing/disbanding it ends the route (raidable). → S5 (commit), S6 (travel + loss).
- **D-Q8 — Thresholds.** Foreign trade establishes at relationship ≥ 0; terminates when < −25 or at war. → S5/S6.

### Open at slice level (resolve in each slice's brainstorm)
Exact happiness/yield magnitudes per resource; the resource→improvement and resource→effect tables; which units/buildings require which strategic resource; naval-trader tech gate and overseas-route rules; route-capacity formula constants; barter UI (propose/accept vs. instant).

## Rejected items

*(none yet — record here when something is considered and deliberately not pursued, with the reason.)*

## Living-doc protocol

Single source of truth for locked vs. open. Update when: a slice is locked (record decisions + child-spec path); a locked decision changes (note date/reason); a slice-level open question resolves; scope shifts in a slice; a new item is deferred; an item is rejected. Commit updates alongside the change that triggered them.

## Runbook — picking up the next slice (for a future session)

1. Read this roadmap top to bottom.
2. Find the next unstarted slice in **Sequencing**.
3. **Re-verify** the Current-state rows for the files that slice touches — code may have moved since `84f9182`.
4. Invoke `superpowers:brainstorming` for that slice; resolve its slice-level open questions with the user.
5. Write the slice spec (`docs/superpowers/specs/`), then the plan (`docs/superpowers/plans/`), then implement with TDD.
6. Verify (`yarn build` + `yarn test` both green), open a PR per the Conventions.
7. Record the slice's locked decisions + child-spec path back in this roadmap.
