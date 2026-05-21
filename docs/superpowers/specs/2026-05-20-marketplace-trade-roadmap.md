# Marketplace & Trade Roadmap — Index

**Origin:** GitHub issue [#234](https://github.com/a1flecke/conquestoria/issues/234) — "Create proper marketplace ui and system. Make ui meaningful."

**Goal:** Turn the existing read-only marketplace stub into a real, legible trade system: resources visible on the map; clear tech + improvement requirements to own a tradeable resource; an age-appropriate caravan unit that establishes trade routes; relationship-gated trading; and actual transactions (sell/buy for gold or barter resource-for-resource).

This file is the **index**. It is intentionally the first deliverable so the high-level plan survives context compaction. Each slice below becomes its own brainstorm → plan → PR cycle; per-slice decisions get recorded back here.

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

## Current state (what already exists — do not rebuild)

Findings from the codebase as of this roadmap (commit base `84f9182`):

| Area | Status | Location |
|---|---|---|
| Resource types (6 luxury, 4 strategic) + base prices | ✅ exists | `src/systems/trade-system.ts` `RESOURCE_DEFINITIONS` |
| Resources placed on map tiles (`tile.resource`) | ✅ exists | map generators (`map-generator.ts`, `balanced-map-generator.ts`, `continent-map-generator.ts`) |
| Per-turn price engine (supply vs. demand) + price history + fashion cycle | ✅ exists | `trade-system.ts` (`calculatePrice`, `updatePrices`, `processFashionCycle`); driven in `turn-manager.ts` ~L388 |
| Marketplace panel (prices, sparklines, "you own" counts, fashion banner) | ⚠️ read-only | `src/ui/marketplace-panel.ts`; opened via `togglePanel('marketplace')` in `main.ts` |
| `TradeRoute` type + per-turn gold income + embargo enforcement + wonder-route checks | ✅ type/plumbing exists | `types.ts`, `turn-manager.ts` ~L700, `diplomacy-system.ts` `enforceEmbargoes`, `trade-route-classification.ts` |
| Resources **drawn on the map** | ❌ missing | `hex-renderer.ts` `drawHex` draws improvements/wonders/villages but **never** resources |
| Trade routes **ever created** | ❌ missing | `marketplace.tradeRoutes` is initialized to `[]` and nothing pushes to it — the list is always empty |
| Caravan unit | ❌ missing | not in `UnitType` union (`types.ts` L230) |
| Tech-gated marketplace display | ❌ missing | panel shows all `RESOURCE_DEFINITIONS` regardless of tech |
| "Need improvement on the tile to own a resource" rule | ❌ missing | nothing computes per-civ owned/available resources from improvements |
| Relationship gating on trade | ❌ missing | no neutral+ check; no war/angry termination of trade actions |
| Actual buy / sell / barter | ❌ missing | panel has no transaction actions |
| Tech effect `identify_resources` (reveal strategic resources in territory) | ✅ defined, unused-ish | `types.ts` L559 — relevant to deferred Q5 |

**Key gotcha:** `src/systems/resource-system.ts` is misleadingly named — it computes **city tile yields**, not resources. The resource/trade logic lives in `trade-system.ts`.

## Locked-in decisions

| Decision | Choice | Notes |
|---|---|---|
| Delivery style | **Fine-grained vertical slices** | User preference: very fleshed-out, discrete deliverables that each add value and build on each other, over scattered half-built pieces. |
| Decomposition | **10 slices in 4 phases** (below) | Each slice = one brainstorm → plan → PR. Ship in order. |
| Roadmap-first | **This index doc is deliverable #1** | Committed before any code so the plan survives context loss. |
| No dead-end UX | **Every slice ships self-contained value** | Per `.claude/rules/incremental-mr-completion.md`: never ship a button/unit/queue entry that does nothing. The caravan slice (S4) therefore includes the establish-route action. |

## Decomposition — 10 slices, 4 phases

Ship in order. Each slice gets its own `docs/superpowers/specs/` design and `docs/superpowers/plans/` plan when it is brainstormed.

### Phase 1 — Honest visibility

**S1 — Resources on the map.**
Draw a distinct icon per resource on its tile in `hex-renderer.ts` (luxury vs. strategic readable at a glance); tap-to-inspect surfaces resource name + type. Carries `resource` already present in `TilePresentation`.
*Value:* players can finally see where resources are.
*Honors:* end-to-end-wiring (computed `resource` must render); ui-panels privacy (respect fog/last-seen presentation kind).

**S2 — Acquisition model + per-civ resource inventory.**
A system computes, per civ, which resources are actually **owned/available** = required tech known **AND** the right improvement built on the resource tile — with the exception that a resource on a city-center tile needs **tech only** (req. 4 + 5). Surface read-only ("Your resources") and in tile inspection ("To use: needs Mining + a Mine here"). Requires the resource→tech→improvement mapping (deferred Q2).
*Value:* the rules become legible; foundation for every later slice.
*Honors:* spec-fidelity conjunction (tech AND improvement; add negative tests for tech-without-improvement, improvement-without-tech, and the city-tile exception).

**S3 — Marketplace tells the truth.**
Filter the existing read-only panel to resources the civ has the tech for (req. 2); show real owned/available counts from S2 instead of the current raw tile count.
*Value:* no more phantom items.
*Honors:* ui-panels catalog rules; XSS-safe `textContent` rendering (already followed in the panel).

### Phase 2 — Caravans & routes

**S4 — Caravan unit + establish a trade route.**
Add an age-appropriate caravan `UnitType`, wired end-to-end per `.claude/rules/end-to-end-wiring.md` (definitions + descriptions, renderer icon, trainable + tech gate, AI usage, tech-gated dequeue, production icon). Player sends the caravan to a valid target city to open a route; requires **at least neutral** relations (req. 6 + 8). Routes render on the map + in the panel and pay the already-wired gold/turn income.
*Value:* the always-empty trade-route list becomes real.
*Honors:* unit end-to-end wiring (all 6 points); no-dead-end-UX (unit ships with a working action); no-bare-buttons in any new UI.

**S5 — Route lifecycle.**
War or angry relations terminate routes (req. 6); create/terminate notifications via the persistent log; integrate with existing `enforceEmbargoes`. Bilateral diplomacy rules apply.
*Value:* trade reacts to diplomacy — no stale phantom income.
*Honors:* game-systems immutable turn processing; transition-events-fire-once.

### Phase 3 — Transactions

**S6 — Sell a resource for gold.**
Needs an available resource (S2) + an active route (S4) + neutral+ relations. Uses the live price from the existing engine. Panel refreshes after the action (ui-panels rerender rule).
*Value:* first real transaction; the UI becomes meaningful.

**S7 — Buy a resource for gold.**
Spend gold to acquire a resource you lack. **Gated on deferred Q1** ("what do resources DO?") — buying is only meaningful if owning a resource has an effect.
*Value:* completes the money side of trade.

**S8 — Barter resource-for-resource.**
Swap with another civ instead of paying gold (req. 9). Likely a propose/accept flow analogous to diplomacy treaties.
*Value:* completes the trade vision from the issue.

### Phase 4 — Depth & parity

**S9 — AI trades too.**
AI establishes routes and buys/sells so the economy is not player-only. (Some AI wiring lands per-slice in S4/S6; this slice ensures full parity and strategy.)
*Honors:* shared-state-mutations-actor-complete; AI-combat/at-war checks already exist for route gating.

**S10 — Price-algorithm refinement.**
Real monopoly detection with per-player context (today `updatePrices` hardcodes `isMonopoly=false`), fashion interplay, and demand tied to resource effects (req. 7).

## Sequencing & milestones

Linear order; each phase is a hard gate for the next.

1. **Roadmap (this doc)** — deliverable #1. Committed.
2. **S1 brainstorm → plan → PR.** Begin next.
3. **S2**, then **S3** — completes "honest visibility."
4. **S4**, then **S5** — caravans + routes.
5. **S6 → S7 → S8** — transactions. S7 waits on Q1 being resolved (its own mini-brainstorm or a dedicated "resource effects" slice inserted before S7).
6. **S9, S10** — depth & parity; can be reordered or merged into earlier slices' AI/price work if that proves cleaner during planning.

## Cross-cutting deferred questions

Recorded here (user deferred at roadmap time, 2026-05-20). Each is assigned to the slice that must resolve it.

- **Q1 — What do resources actually DO?** Today they only feed marketplace prices. For *buying* (S7) to matter they need an effect: luxuries→happiness? strategic→unit unlocks? May warrant its own slice inserted before S7. **Resolve before S7.**
- **Q2 — Resource → tech → improvement mapping.** Reuse mine/farm, or add plantation / pasture / camp improvements for silk, wine, horses, ivory, incense, spices? **Resolve in S2.**
- **Q3 — Trade scope.** Domestic routes (between your own cities) too, or only foreign-civ routes? **Resolve in S4.**
- **Q4 — Caravan tiers.** One upgradeable caravan, or a per-age tier (caravan → merchant ship → …)? "Age-appropriate" (req. 8) at minimum means a sensible tech gate. **Resolve in S4.**
- **Q5 — Tech-gated map reveal.** Should resources be hidden until discovered (the existing `identify_resources` tech effect), or always drawn? **Resolve in S1.**

## Rejected items

*(none yet — record here when something is considered and deliberately not pursued, with the reason, so future-us doesn't relitigate.)*

## Living-doc protocol

This roadmap is the single source of truth for what is locked vs. open. Update it when:

- A slice is brainstormed and locked → record the slice's locked decisions and the path to its child spec.
- A locked decision changes → update it and note the date/reason.
- A deferred question is resolved → move it from the deferred list into its slice.
- Scope shifts during a slice's plan/PR → record it under that slice.
- A new item must be deferred → add it to the deferred list.
- An item is rejected → move it to "Rejected items" with the reason.

Updates are committed alongside whatever change triggered them.
