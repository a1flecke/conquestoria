# Issue 547 Beast World Pressure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Repository subagent
> approval rules still apply.

**Goal:** Add Beast Stampede and Rogue Elephant Host as deterministic, readable crises
with combat and containment solutions, fair AI response, and complete save/hot-seat
behavior.

**Architecture:** A generic non-diplomatic crisis owner and persisted force state sit
beside existing crisis/world-pressure systems. Seeded route and command helpers mutate at
the crisis turn source and emit viewer-scoped facts. Presentation, AI, rewards, audio,
and save normalization consume those facts.

**Tech Stack:** TypeScript, Vitest, seeded pathfinding, Canvas overlays, DOM notifications.

---

## Task 37: Add crisis-force ownership

**Files:** Modify `src/core/types.ts`, `src/systems/combat-context.ts`,
`src/systems/unit-movement-system.ts`, `src/systems/crisis-system.ts`,
`src/core/turn-manager.ts`, `src/storage/save-migrations.ts`; add
`src/systems/crisis-force-system.ts`; test combat, movement, turn-manager crisis, save,
and AI interaction files.

Write failing player and non-player interaction tests, then add an owner-kind recognized
by hostility, path safety, rewards, fog, notifications, cleanup, and serialization. It
must not be diplomatic, barbarian, pirate, rebel, or beast-lair ownership. Normalize
malformed/orphan actors idempotently.

## Task 38: Add roaming-herd movement and previews

**Files:** Add `src/systems/stampede-route-system.ts` and
`src/renderer/stampede-route-overlay.ts`; modify crisis turn flow and
`src/systems/world-pressure-presentation.ts`; test deterministic routing, renderer, and
hot-seat scope.

Implement seeded outward routing with legal terrain, two-hex movement, route-cost
avoidance, Fort/Citadel movement stop, stable ties, and route recalculation only on the
herd turn. Persist the committed route. Preview only the next two earned-visible hexes;
test no hidden route leak, current-player handoff, reduced motion, and cache bounds.

## Task 39: Add Beast Stampede

Add exact era/geography/once-per-target/overlap gates, warning stage, force sizes, formulas,
trampling, two-pillage crisis cap, six-turn expiry, resolution, gold, and Herding Insight.
Record outcomes at mutation sources and implement charge expiry/conversion. Test Explorer
2/Standard 3/Veteran 4, identical actor stats/rewards, no spawn-turn attack, containment
boundaries, duplicate-reward prevention, and save/load at every phase.

## Task 40: Add AI, notifications, and hot-seat presentation

**Files:** Modify `src/ai/ai-crisis-response.ts`,
`src/ui/notification-delivery.ts`, `src/ui/city-panel.ts`,
`src/audio/sfx-director.ts`; add `src/ui/stampede-presentation.ts`; test mirrored files and
world-pressure notification volume.

Build Player Truth Tables for warning, active, contained, defeated, survived, reward
charge, expiry, and hidden-other-player states. AI compares screen placement, fort route
cost, attacks, and city defense using visible facts. Group alerts and sounds, show
containment counters, preserve full unit actions, and prove muted audio/reduced motion
lose no information.

## Task 41: Add Rogue Elephant Host

Add era/once/overlap/warning gates, exact force sizes/formulas, improvement/fort/approach
targets, handler radius-2 +20% command modifier, and shared host targeting. Test no
spawn-turn attack, no bonus beyond radius, no stacking, intended AI target priorities,
all three difficulty sizes, and Standard severity for AI targets.

## Task 42: Add command break, conversion, and resolution

At handler death, immediately remove command, convert elephants to Stampede actors, and
start a persisted three-turn dispersal clock. Implement all resolutions, gold, Recovered
Harnesses charge, expiry conversion, and duplicate exclusions. Test simultaneous deaths,
save/load before/after break, no capture/taming/camp/beast-hoard rewards, history facts,
notifications, and AI strategy reevaluation.

## Task 43: Full crisis audit

Run three seeds for each difficulty and era boundary across solo human, AI target,
two-human hot seat with different personal challenge settings, save/load during warning,
movement, command, conversion, and reward, muted audio, reduced motion, no-military
containment, forts, city approaches, and crisis overlap/cooldown. Assert notification
caps, no current-player leakage, deterministic cleanup, no stale actors, and unchanged
legacy crises. Run source rules, targeted domain tests, build, and full suite.

## Misleading UI risks

Do not reveal future route after a recalculation boundary, call a fortified screen a
guarantee, imply killing is required for containment, display handler bonuses after
death, expose another hot-seat player's warning early, or play hidden-event audio.
