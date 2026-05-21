# Marketplace & Trade Roadmap — Index

**Origin:** GitHub issue [#234](https://github.com/a1flecke/conquestoria/issues/234) — "Create proper marketplace ui and system. Make ui meaningful."

**Goal:** Turn the existing read-only marketplace stub into a real, legible trade system: resources visible on the map; clear tech + improvement requirements to own a tradeable resource; an age-appropriate caravan unit that establishes trade routes; relationship-gated trading; and actual transactions (sell/buy for gold or barter resource-for-resource).

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
| Per-turn price engine (supply/demand) + history + fashion cycle | ✅ exists | `trade-system.ts` (`calculatePrice`, `updatePrices`, `processFashionCycle`); driven in `turn-manager.ts` ~L388. Note: `updatePrices` hardcodes `isMonopoly=false` (S10). |
| Marketplace **building** | ✅ exists | `city-system.ts` L59 `marketplace` (gold +3, cost 50, `techRequired: 'currency'`, icon 🏪). |
| Marketplace **panel** (prices, sparklines, "you own", fashion banner) | ⚠️ read-only | `src/ui/marketplace-panel.ts`; opened via `onOpenMarketplace → togglePanel('marketplace')` in `main.ts`. Counts resources by raw `ownedTiles` (`countPlayerResources`), not by acquisition rules. |
| `TradeRoute` type + per-turn income + embargo enforcement + wonder-route checks | ✅ plumbing exists | `types.ts` (`TradeRoute` has `fromCityId`,`toCityId`,`goldPerTurn`,`foreignCivId?`), `turn-manager.ts` income ~L391 / embargo ~L700, `diplomacy-system.ts` `enforceEmbargoes`, `trade-route-classification.ts`. |
| Economy techs | ✅ exists | `tech-definitions.ts`: `currency`(era3, "Unlock Marketplace building"), **`trade-routes`(era4, "Enable trade routes between cities")**, `banking`, `global-logistics`; `wheel`(era2). |
| Resource discovery mechanism | ✅ exists (espionage) | `identify_resources` is a **spy mission** (`espionage-system.ts`, `espionage-panel.ts`), NOT a tech node. Reveals resources in target territory. Relevant to Q5. |
| Resources **drawn on the map** | ❌ MISSING | `hex-renderer.ts` `drawHex` (~L239–277) draws improvements/wonders/villages but **never** resources. `tile-presentation.ts` already carries `resource` through. |
| Trade routes **ever created** | ❌ MISSING / DEAD | `marketplace.tradeRoutes` inits to `[]`; **nothing pushes to it**. The `trade-routes` tech unlock ("Enable trade routes between cities") is a **dead promise** — no creation path exists. Panel says "Build a Market to establish routes" but no code does. |
| Caravan unit | ❌ MISSING | not in `UnitType` union (`types.ts` L230). |
| Tech-gated marketplace display | ❌ MISSING | panel lists all `RESOURCE_DEFINITIONS` regardless of tech. |
| "Improvement on tile required to own a resource" rule | ❌ MISSING, **and blocked** | nothing computes per-civ owned resources from improvements. **Only 4 improvements exist** (`farm`,`mine`,`lumber_camp`,`watermill` — `types.ts` L165). `mine` covers hills/mountain (gems/copper/iron/stone). **No resource-appropriate improvement exists for grassland/plains/jungle/forest/desert luxuries+horses; desert has no improvement at all.** S2 likely must ADD improvements (see Q2). |
| Relationship gating on trade | ❌ MISSING | major-civ relationships are a **numeric score −100…+100** (`Civilization.diplomacy.relationships: Record<civId, number>`) + an `atWarWith` array — there is **no named "neutral"/"angry" enum** for majors (named states are minor-civ only). "Neutral"/"angry" must be defined as score thresholds (Q8). |
| Actual buy / sell / barter | ❌ MISSING | panel has no transaction actions. |
| Gameplay effect of owning a resource | ❌ effectively NONE | `tile.resource` is only read by: marketplace supply, map-gen balancing, legendary-wonder diversity counts, espionage intel. Owning a resource confers **no happiness/unit/yield benefit today** → buying (S7) is meaningless until this is designed (Q1). |

**Gotcha:** `src/systems/resource-system.ts` is misnamed — it computes **city tile yields**, not resources. Trade/resource logic lives in `trade-system.ts`. Put the new acquisition system in a clearly named new file (e.g. `resource-acquisition-system.ts`).

## Locked-in decisions

| Decision | Choice | Notes |
|---|---|---|
| Delivery style | **Fine-grained vertical slices** | User preference: very fleshed-out, discrete deliverables that each add value and build on each other, over scattered half-built pieces. |
| Decomposition | **10 slices + 1 candidate, in 4 phases** | Each slice = one brainstorm → spec → plan → PR. Ship in order. |
| Roadmap-first | **This index is deliverable #1** | Committed before code so the plan survives context loss. |
| No dead-end UX | **Every slice ships self-contained value** | Per `.claude/rules/incremental-mr-completion.md`: never ship a button/unit/queue entry that does nothing. S4 therefore bundles the establish-route action with the caravan. |
| Caravan tech gate | **`trade-routes` tech** (S4 makes its dead unlock real) | Confirms req. 8 "age-appropriate"; era 4. Final tier model is Q4. |

## Conventions every slice MUST follow

These apply to all slices; per-slice sections below only note *additions*.

- **Verify before any push/PR:** `bash scripts/run-with-mise.sh yarn build` (this is the only `tsc` path) **and** `bash scripts/run-with-mise.sh yarn test` must both exit 0. The `require-green-before-push` hook enforces this; catch it locally first.
- **Branch/PR workflow:** never commit to `main`; work on a branch/worktree and open a PR. If a PR ships only a subset of a slice, follow `.claude/rules/incremental-mr-completion.md` (subset title, "Out of scope" list, "why safe to merge partial" paragraph naming every player-visible surface).
- **Hot-seat:** use `state.currentPlayer` everywhere; never hardcode `'player'`. Renderer/UI take `currentPlayer`.
- **Determinism:** seeded RNG only; never `Math.random()`.
- **Immutable turn processing:** turn/system functions return a new `GameState` via spread-copy; never mutate `state.cities[id]=…` etc. (`.claude/rules/game-systems.md`).
- **UI:** mobile-first touch (≥44px targets); buttons via `createGameButton()` (no bare buttons); dynamic text via `textContent`/`createTextNode()` (never `innerHTML` with game strings); a panel that mutates state it renders must refresh; never silently discard a player-visible list.
- **End-to-end wiring:** computed data must render; new units need all 6 wirings (`.claude/rules/end-to-end-wiring.md`); shared consequences must be actor-complete (human **and** AI/turn paths) with parity tests.
- **Save compatibility:** the game has multiple save slots in active family use. New `MarketplaceState` fields, new `ImprovementType`s, new `UnitType`s, and `RESOURCE_DEFINITIONS` shape changes must tolerate old saves (optional fields / defensive defaults / migration). Add a load-old-save regression where state shape changes.
- **AI parity:** any player-affecting trade consequence must also be exercised/usable by AI civs.

## Decomposition — slices

Ship in order. Each slice's spec lives at `docs/superpowers/specs/2026-..-marketplace-sN-<topic>-design.md`, its plan at `docs/superpowers/plans/…`.

### Phase 1 — Honest visibility

**S1 — Resources on the map.**
*Scope:* draw a distinct, legible icon per `ResourceType` on its tile; tap-to-inspect surfaces resource name + type; add a legend entry. Decide Q5 (always-visible vs. discovered-only via the existing `identify_resources` mechanism / exploration).
*Files:* `hex-renderer.ts` `drawHex` (mirror the improvement/wonder icon pattern); a resource→icon map (add `icon` to `RESOURCE_DEFINITIONS` in `trade-system.ts`, or a small new module); `src/ui/icon-legend.ts`; tile/territory inspection (`src/ui/territory-inspection-panel.ts` and/or selected-tile info). `tile-presentation.ts` already carries `resource`.
*Done when:* every resource type renders its icon on visible tiles; inspection shows name+type; legend lists them; if Q5=discovered-only, fog/unexplored tiles do **not** leak resources.
*Tests:* every `ResourceType` has an icon (catalog test); inspection surfaces name+type; negative fog-leak test if discovered-only.
*Extra rules:* ui-panels privacy (mask under fog per presentation kind); `sprites.md` if using sprites vs. emoji.

**S2 — Acquisition model + per-civ inventory.**
*Scope:* a pure helper `getCivAvailableResources(state, civId)` returning the resources a civ can trade, applying **(tech known AND qualifying improvement built on the tile, `improvementTurnsLeft===0)`**, EXCEPT a resource on a **city-center** tile needs **tech only** (req. 4 + 5). Surface read-only ("Your resources") + in tile inspection ("To use: needs Mining + a Mine here — ✓/✗"). **Resolve Q2** (resource→tech→improvement mapping; almost certainly add improvements — desert/incense currently has none).
*Files:* new `src/systems/resource-acquisition-system.ts`; add `tech` + `requiredImprovement` to `RESOURCE_DEFINITIONS` (`trade-system.ts`); if adding improvements: `types.ts` `ImprovementType`, `improvement-system.ts`, `worker-action-system.ts`, `hex-renderer.ts` icons, `resource-system.ts` yields; inventory UI in city/territory panel.
*Done when:* helper returns correct sets for all civs; UI shows owned vs. needs-improvement; iterates **all** cities (not `cities[0]`).
*Tests (spec-fidelity conjunction):* tech-without-improvement → unavailable; improvement-without-tech → unavailable; both → available; city-tile + tech-only → available without improvement; resource not under city + tech-only → unavailable.

**S3 — Marketplace tells the truth.**
*Scope:* filter the panel to resources whose enabling tech the current player has (req. 2); replace `countPlayerResources` with S2's helper for owned/available counts.
*Files:* `src/ui/marketplace-panel.ts`.
*Done when:* only tech-available resources are listed; counts come from S2; uses `state.currentPlayer`.
*Tests:* a no-tech resource is absent (negative); a tech-available resource is present and its count matches S2; all tech-available resources remain reachable (catalog completeness).

### Phase 2 — Caravans & routes

**S4 — Caravan unit + establish a trade route.**
*Scope:* add `'caravan'` `UnitType`, wired end-to-end (all 6 points of the unit rule + `PRODUCTION_ICONS`), trainable gated on `trade-routes` tech (makes that dead unlock real). Player moves a caravan to a valid target city to open a `TradeRoute`; gating = **not at war AND relationship ≥ neutral threshold** (Q8). Route persists in `marketplace.tradeRoutes`, renders on map + panel, pays existing gold/turn income. AI trains and uses caravans. **Resolve Q3** (domestic vs. foreign), **Q4** (single vs. tiered), **Q7** (consumed on establish?), **Q8** (thresholds), **Q6** (route limits).
*Files:* `types.ts` (`UnitType`, maybe events); `unit-system.ts` (`UNIT_DEFINITIONS`+`UNIT_DESCRIPTIONS`); `unit-renderer.ts` (icon); `city-system.ts` (`TRAINABLE_UNITS`+`PRODUCTION_ICONS`+tech gate); `turn-manager.ts` (production side-effects + tech-gated dequeue); `main.ts` (establish-route interaction + death cleanup); `basic-ai.ts` (queue + use); route-creation helper in `trade-system.ts`; establish-route UI.
*Done when:* caravan is trainable/visible/AI-used; establishing a route succeeds at neutral+ and **fails** when at war or below threshold; route renders and pays income.
*Tests:* full unit-wiring coverage; establish success (positive) + at-war/below-threshold (negatives); AI-parity (AI establishes a route); route renders/persists.

**S5 — Route lifecycle.**
*Scope:* declaring war or relationship dropping to "angry" terminates affected routes that same turn (req. 6); create/terminate emit persistent notification-log entries (with turn #); integrate with `enforceEmbargoes`; income stops same turn.
*Files:* `turn-manager.ts` (lifecycle pass), `diplomacy-system.ts` (scrub routes on war / relationship change — actor-complete), notification routing.
*Done when:* war/angry terminates the route and stops income same turn; peace/neutral keeps it.
*Tests:* war terminates + stops income (positive); neutral keeps it (negative); termination fires once (not re-fired every steady-state turn); actor-complete (human-declared AND AI-declared war both terminate).

### Phase 3 — Transactions

**Sx (candidate) — Resource effects.** *Resolves Q1; insert before S7 if Q1 says resources should confer benefits.* Owning/acquiring a resource grants an effect (e.g. luxuries→happiness, strategic→unit unlock/strength). Without this, buying is meaningless. Scope decided in its own brainstorm.

**S6 — Sell a resource for gold.**
*Scope:* with an available resource (S2) + active route (S4) + neutral+ relations, sell at the live price; gold credited; supply/price adjust; panel refreshes.
*Files:* `marketplace-panel.ts`, transaction helper in `trade-system.ts`, `main.ts` wiring.
*Done when:* sell works and is gated on ownership+route+relationship; panel re-renders post-sale.
*Tests:* sell gated (negatives for missing route / non-neutral / not owned); panel rerender; price/supply update.

**S7 — Buy a resource for gold.** *Gated on the resource-effects slice (Q1).* Spend gold to acquire a resource you lack; it must confer a real benefit. Tests: buy gated; effect applied.

**S8 — Barter resource-for-resource.** *Req. 9.* Propose/accept swap with another civ (analogous to diplomacy treaties); both inventories update bilaterally; AI evaluates offers. Tests: bilateral update; AI accept/reject; relationship+route gating.

### Phase 4 — Depth & parity

**S9 — AI trades too.** Full parity: AI establishes routes, sells surplus, buys needs, handles barter. Tests: AI visibly participates; parity regressions. (Some AI wiring lands per-slice; this guarantees strategy + completeness.)

**S10 — Price-algorithm refinement (req. 7).** Real monopoly detection with per-player supply share (`calculatePrice` already accepts `isMonopoly`; `updatePrices` must compute it), demand tied to resource effects, fashion interplay. Tests: monopoly raises price; balance tests with seeded statistical sampling.

## Sequencing & milestones

Linear; each phase gates the next. 1) Roadmap (done). 2) S1 → S2 → S3 (honest visibility). 3) S4 → S5 (caravans/routes). 4) resource-effects (if Q1 requires) → S6 → S7 → S8 (transactions). 5) S9, S10 (depth; may fold into earlier AI/price work if cleaner during planning).

## Cross-cutting deferred questions

Deferred by the user at roadmap time (2026-05-20). Each is owned by the slice that must resolve it.

- **Q1 — What do resources actually DO?** Verified: today owning a resource confers **no** mechanical benefit. Luxuries→happiness? strategic→unit unlocks? May warrant its own slice. **Resolve before S7** (gates buying's meaning).
- **Q2 — Resource → tech → improvement mapping.** Only 4 improvements exist; `mine` covers hills/mountain; **grassland/plains/jungle/forest/desert resources have no fitting improvement (desert none at all)**. Decide: add plantation/pasture/camp (and a desert option), or one generic "trading post", or map to existing improvements. **Resolve in S2.**
- **Q3 — Trade scope.** Domestic routes (between your own cities) too, or only foreign-civ routes (`TradeRoute.foreignCivId`)? **Resolve in S4.**
- **Q4 — Caravan tiers.** One upgradeable caravan, or per-age tier (caravan → merchant ship → …)? Gate confirmed as `trade-routes` tech minimum. **Resolve in S4.**
- **Q5 — Map reveal model.** Always draw resources, or hide until discovered (the `identify_resources` spy mission already reveals them; exploration could too)? **Resolve in S1.**
- **Q6 — Route limits.** Max routes per city / per caravan / empire-wide? **Resolve in S4.**
- **Q7 — Caravan consumption.** Does establishing a route consume the caravan (Civ-style), or does it persist / return / run the route repeatedly? **Resolve in S4.**
- **Q8 — Relationship thresholds.** Relationships are numeric −100…+100. What score is "neutral" (minimum to trade) and "angry" (terminate)? Note `atWarWith` is separate from score. **Resolve in S4/S5.**

## Rejected items

*(none yet — record here when something is considered and deliberately not pursued, with the reason, so future-us doesn't relitigate.)*

## Living-doc protocol

Single source of truth for locked vs. open. Update when: a slice is locked (record decisions + child-spec path); a locked decision changes (note date/reason); a deferred question resolves (move it into its slice); scope shifts in a slice (record under it); a new item is deferred (add to the list); an item is rejected (move to Rejected with reason). Commit updates alongside the change that triggered them.

## Runbook — picking up the next slice (for a future session)

1. Read this roadmap top to bottom.
2. Find the next unstarted slice in **Sequencing**.
3. **Re-verify** the Current-state rows for the files that slice touches — code may have moved since `84f9182`.
4. Invoke `superpowers:brainstorming` for that slice; resolve its assigned deferred question(s) with the user.
5. Write the slice spec (`docs/superpowers/specs/`), then the plan (`docs/superpowers/plans/`), then implement with TDD.
6. Verify (`yarn build` + `yarn test` both green), open a PR per the Conventions.
7. Record the slice's locked decisions + child-spec path back in this roadmap.
