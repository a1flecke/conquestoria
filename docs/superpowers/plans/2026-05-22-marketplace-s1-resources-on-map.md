# S1 — Resources on the Map: Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship tech-gated resource icons on the hex map, a tech-filtered inspection panel, and a dynamic map legend — completing roadmap slice S1.

**Architecture:** Three independent plans share a common dependency (Plan 1 data). Plans 2 and 3 both require Plan 1 to be merged first but are otherwise independent of each other and can be done in any order after that.

**Target model:** sonnet 4.5

---

## Plans

| Plan | File | Depends on | What ships |
|------|------|-----------|-----------|
| **Plan 1 — Data Foundation** | `2026-05-22-marketplace-s1-plan-1-data.md` | nothing | `tech` + `icon` fields on `ResourceDefinition`; resource-reveal text in tech tree |
| **Plan 2 — Map Renderer** | `2026-05-22-marketplace-s1-plan-2-renderer.md` | Plan 1 | Resource icons drawn on hex tiles, tech-gated, fog-safe |
| **Plan 3 — Panels & Legend** | `2026-05-22-marketplace-s1-plan-3-panels.md` | Plan 1 | Inspection panel shows resource name+type; map legend lists unlocked resources |

## Execution order

```
Plan 1 → Plan 2
       → Plan 3
```

Merge Plan 1 first. Plans 2 and 3 can then be worked in parallel or sequentially.

## Spec reference

`docs/superpowers/specs/2026-05-21-marketplace-s1-resources-on-map-design.md`

## Verification (after all three plans merged)

```bash
bash scripts/run-with-mise.sh yarn build   # must exit 0 (only path that runs tsc)
bash scripts/run-with-mise.sh yarn test    # must exit 0
```

Manual smoke: start a new game → confirm no resource icons visible → research `gathering` → confirm 🪨 Stone appears on mountain tiles.
