# Resource Accessibility — Implementation Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make special resources legible, reachable, and exciting for players ages 7–adult without removing strategic weight.

**Architecture:** Four-pillar approach — foundation fixes (map gen + settler cost), a new Expedition unit that plants Resource Outposts, a Diplomatic Marketplace for mid-game buying, and a guidance layer (advisor tips + locked-section UI). Each pillar ships as an independent MR. Pillars 1–3 can be sequenced in any order except Pillar 3, which depends on S5 and S9.

**Spec:** `docs/superpowers/specs/2026-05-26-resource-accessibility-design.md`

---

## MR Sequence

| MR | Plan file | Depends on | Ships |
|----|-----------|-----------|-------|
| MR 1 — Map Gen + Settler Cost | [mr1-map-gen-settler.md](2026-05-27-resource-accessibility-mr1-map-gen-settler.md) | nothing | immediately |
| MR 2a — Outpost Foundation | [mr2a-outpost-foundation.md](2026-05-27-resource-accessibility-mr2a-outpost-foundation.md) | nothing | immediately |
| MR 2b — Expedition Unit | [mr2b-expedition-unit.md](2026-05-27-resource-accessibility-mr2b-expedition-unit.md) | MR 2a | after MR 2a |
| MR 3 — Advisor Tips | [mr3-advisor-tips.md](2026-05-27-resource-accessibility-mr3-advisor-tips.md) | nothing | immediately |
| MR 4 — Locked-Section UI | [mr4-locked-ui.md](2026-05-27-resource-accessibility-mr4-locked-ui.md) | S4b implemented | after S4b |
| MR 5 — Diplomatic Marketplace | [mr5-diplomatic-marketplace.md](2026-05-27-resource-accessibility-mr5-diplomatic-marketplace.md) | S5 + S9 implemented | after S5+S9 |
| Phase 2 — Expedition SVG Sprite | (no plan — Claude Design session) | MR 2b | after MR 2b |
| Phase 2 — Outpost SVG Sprite | (no plan — Claude Design session) | MR 2b | after Expedition sprite |

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
