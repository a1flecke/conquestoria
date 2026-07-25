# Issue 547 Fortifications and Air Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Repository subagent
> approval rules still apply.

**Goal:** Make territorial, city, coastal, and air defense tactically useful without
creating passive invulnerability or hidden stacking.

**Architecture:** Improvement and building definitions supply typed defense providers.
Canonical combat helpers calculate layers, penetration, mitigation, counterfire, and
coverage once and emit presentation facts. AI placement uses observed threats and
opportunity costs; renderer/UI consume viewer-filtered models.

**Tech Stack:** TypeScript, Vitest, Canvas improvement markers/overlays, DOM panels.

---

## Task 26: Add worker-built Fort/Citadel

**Files:** Modify `src/core/types.ts`, `src/systems/improvement-system.ts`,
`src/systems/improvement-turn-system.ts`, `src/systems/combat-system.ts`,
`src/ai/ai-unit-assignment.ts`; add `src/systems/fortification-system.ts`; test
`tests/systems/improvement-system.test.ts`,
`tests/systems/improvement-turn-system.test.ts`,
`tests/systems/combat-system.test.ts`.

Write failing tests for placement, five-turn build, automatic tech scaling, empty/pillaged
state, ordinary Fortify combination, siege half-penetration, repair/catastrophe, AI/world
actor parity, and save normalization. Implement one persisted `fort` improvement and
derive Citadel state from technology; never rewrite the saved improvement ID.

## Task 27: Add placement, cap, status, and defense UI

**Files:** Modify `src/ui/selected-unit-info.ts`, `src/ui/city-panel.ts`,
`src/renderer/improvements/improvement-treatment.ts`; add
`src/renderer/improvements/fort-marker.ts`; test mirrored UI/renderer files.

Build Player Truth Tables for legal, adjacency-blocked, cap-blocked, frontier-qualified,
replaceable, building, complete, pillaged, Fort, and Citadel. Render exact layer and
penetration rows, cap explanation, repair action, and 44-pixel controls. Replay start,
cancel/replace, finish, pillage, repair, technology scale, and hot-seat handoff.

## Task 28: Add Coastal Battery

**Files:** Modify building definitions in `src/systems/city-system.ts`,
`src/systems/combat-system.ts`, `src/ai/ai-production.ts`,
`src/ui/city-panel.ts`; add `src/systems/coastal-defense-system.ts`; test mirrored files.

Test Naval Armor gate, cost 170, +8 naval-only defense, first naval attack counterfire at
20% capped 12, per-city/per-turn reset, and player/AI/barbarian/pirate parity. Emit
counterfire at mutation source, prevent recursion, and verify no land/air effect.

## Task 29: Add Bunker

Add the cost-175 Reinforced Concrete building requiring Walls. Implement one canonical
city-defense layer resolver: Bunker suppresses Star Fort's +5, supplies +8 and 15%
bombardment mitigation, and does nothing to adjacent melee. Test both-building
nonstacking, build eligibility, generic AI candidacy, exact UI label, city/AI combat
parity, and save round trip.

## Task 30: Add SAM Site

Add the cost-195 building at Radar Systems + Rocketry requiring Anti-Air Battery and Radar
Station, radius 2, +12. Use the shared AA provider contract. Test both techs/buildings,
operational/pillaged state, strongest-group stacking, new-city Anti-Air Battery
availability, AI production restraint, all difficulties, and viewer-safe overlays.

## Task 31: Make Radar drive coverage and overlays

Wire Radar Station operational state into SAM, AI air-defense need, and the current-viewer
overlay. Cache coverage by state revision; never scan the whole map per aircraft or
candidate city. Test toggle default/preferences per viewer, pan/zoom, reduced motion,
unknown providers/aircraft, NORAD-ready extension seam, mobile interaction, and hot-seat
handoff.

## Misleading UI risks and balance gate

- Never sum Star Fort+Bunker or multiple AA providers in text when gameplay supersedes.
- Never label an empty/pillaged fort defended.
- Never imply Fort and Fortify are the same layer.
- Never expose a hidden provider through totals, overlays, sounds, or disabled actions.

Run same-era siege fixtures proving a supported position breaks in four to eight
successful engagements and air fixtures proving one provider reduces expected damage by
20–35%, not 100%. Execute build/full tests after each PR and the six play scenarios after
Task 31.
