# Resource Accessibility — Implementation Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make special resources legible, reachable, and exciting for players ages 7–adult without removing strategic weight.

**Architecture:** Four-pillar approach — foundation fixes (map gen + settler cost), a new Expedition unit that plants Resource Outposts, a Diplomatic Marketplace for mid-game buying, and a guidance layer (advisor tips + locked-section UI). Each pillar ships as an independent MR. Pillars 1–3 can be sequenced in any order except Pillar 3, which depends on S5 and S9.

**Spec:** `docs/superpowers/specs/2026-05-26-resource-accessibility-design.md`

---

## MR Sequence

| MR | Plan file | Status | Depends on |
|----|-----------|--------|-----------|
| MR 1 — Map Gen + Settler Cost | [mr1-map-gen-settler.md](2026-05-27-resource-accessibility-mr1-map-gen-settler.md) | ✅ **LANDED** main @ `75d70f4` (2026-05-27) | — |
| MR 2a — Outpost Foundation | [mr2a-outpost-foundation.md](2026-05-27-resource-accessibility-mr2a-outpost-foundation.md) | 🔲 pending | nothing |
| MR 2b — Expedition Unit | [mr2b-expedition-unit.md](2026-05-27-resource-accessibility-mr2b-expedition-unit.md) | 🔲 pending | MR 2a |
| MR 3 — Advisor Tips | [mr3-advisor-tips.md](2026-05-27-resource-accessibility-mr3-advisor-tips.md) | 🔲 pending | nothing |
| MR 4 — Locked-Section UI | [mr4-locked-ui.md](2026-05-27-resource-accessibility-mr4-locked-ui.md) | ⏸ blocked | S4b |
| MR 5 — Diplomatic Marketplace | [mr5-diplomatic-marketplace.md](2026-05-27-resource-accessibility-mr5-diplomatic-marketplace.md) | ⏸ blocked | S5 + S9 |
| Phase 2 — Expedition SVG Sprite | (no plan — Claude Design session) | ⏸ blocked | MR 2b |
| Phase 2 — Outpost SVG Sprite | (no plan — Claude Design session) | ⏸ blocked | Expedition sprite |

---

## Upstream changes relevant to pending MRs

The following commits landed on main after these plans were written. They affect MR 2b.

| Commit | Change | Impact on plans |
|--------|--------|----------------|
| `1e7f59a` | Mountain movement cost changed from `Infinity` → `4`; forced-march rule added (any unit with ≥1 MP can always enter an adjacent passable tile, spending all remaining points); `'impassable-mountain'` removed from `MovementBlockerReason` union | **MR 2b updated:** Expedition's `terrainCostOverrides` now reduces mountain cost from 4→1 (full speed) rather than making mountains passable. The `'impassable-mountain'` type literal no longer needs to be removed (already gone). Test updated to assert Expedition pays 1 and Warrior pays 4, not that Warrior is blocked. |
| `2f2fdb3` | Quarry now valid on `['mountain', 'hills']`; mine excludes mountain | **MR 2a note:** Stone on mountain tiles is now acquirable via city expansion + quarry, which is the normal worker path. The outpost path (MR 2b) gives a shortcut for distant mountain Stone before territory expansion reaches it. |
| `639197c`–`b431c85` | Mountain tiles claimable as city territory + workable by citizens + base yield +1 production | **MR 2a note:** Outpost on mountain is consistent with the new mountain-workability model. No design conflict. |

---

## Why split this way?

**MR 1** — Pure data changes: one constant, one cost table, one new utility function. Zero player-visible surface changes that could interact with unfinished work. Shippable alone.

**MR 2a before MR 2b** — MR 2a adds the `'resource_outpost'` type and extends `getCivAvailableResources`. MR 2b adds the Expedition unit that *produces* outpost tiles. Splitting keeps the type system green between PRs and lets reviewers verify data-model correctness before the unit wiring lands.

**MR 3** — Advisor tips are pure read-only additions to `src/ui/advisor-system.ts`. No dependency on the expedition unit or marketplace. Can ship any time.

**MR 4** — The 📍 locked-section button requires the S4b locked-section to exist (it was introduced in `docs/superpowers/specs/2026-05-24-marketplace-s4b-strategic-prerequisites-design.md`). Blocked until S4b is merged.

**MR 5** — The Diplomatic Marketplace implements S9 from the trade roadmap (`docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`). Requires Caravan routes (S5) to be in place so there are live civs with resources the player can buy.

---

## Files modified across all MRs

```
src/core/types.ts                          ← MR 2a, MR 2b, MR 5
src/core/game-state.ts                     ← MR 1
src/core/turn-manager.ts                   ← MR 2a (upkeep), MR 5 (expiry cleanup)
src/systems/map-generator.ts               ← MR 1
src/systems/city-system.ts                 ← MR 1 (settler cost), MR 2b (trainable unit)
src/systems/unit-system.ts                 ← MR 2b (unit definition + description)
src/systems/resource-acquisition-system.ts ← MR 2a (outpost pass), MR 2b (performEstablishOutpost), MR 5 (purchased pass)
src/systems/trade-system.ts               ← MR 5 (performEmergencyImport)
src/renderer/hex-renderer.ts              ← MR 2a (IMPROVEMENT_ICONS)
src/renderer/unit-visual-resolver.ts      ← MR 2b (FALLBACK_ICONS)
src/renderer/sprites/sprite-catalog.ts    ← MR 2b (catalog entries)
src/ui/selected-unit-info.ts              ← MR 2b (onEstablishOutpost callback)
src/ai/basic-ai.ts                        ← MR 2b (AI training + use)
src/ui/advisor-system.ts                  ← MR 3
src/ui/city-panel.ts                      ← MR 4 (locked section)
src/ui/marketplace-panel.ts               ← MR 5 (known-civs section)
```

---

## Recommended delivery order

1. MR 1 + MR 2a + MR 3 in parallel (all independent)
2. MR 2b after MR 2a merges
3. MR 4 after S4b merges
4. MR 5 after S5 + S9 merge
5. Phase 2 sprites after MR 2b: schedule a Claude Design session for the Expedition sprite, then the Outpost sprite
