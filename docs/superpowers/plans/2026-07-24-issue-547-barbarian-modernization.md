# Issue 547 Barbarian Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Repository subagent
> approval rules still apply.

**Goal:** Let barbarian forces modernize into bounded combined-arms threats without
omniscience, roster collapse, specialist spam, or mass upgrades.

**Architecture:** Unit definitions declare barbarian windows and roles. Camp-local,
coarse observations are persisted facts. A seeded composer consumes era, budget,
composition caps, and observations; the existing barbarian system only requests and
spawns the result.

**Tech Stack:** TypeScript, Vitest, seeded RNG, existing world-actor turn flow.

---

## Task 32: Type barbarian eligibility

**Files:** Modify `src/core/types.ts`, `src/systems/unit-system.ts`,
`src/systems/barbarian-system.ts`; add `src/systems/barbarian-roster.ts`; test
`tests/systems/barbarian-system.test.ts` and catalog integrity tests.

Add failing full-catalog tests, then define era window, weight, role slot, rarity,
observation requirements, and explicit exclusion. Preserve current roster behavior until
the composer consumes metadata. Reject missing windows and any unique/crisis/deterrence
unit lacking explicit exclusion.

## Task 33: Add seeded combined-arms composition

Implement `composeBarbarianForce(context, rng)` with frontline 40–60%, ranged+siege ≤30%,
mobile ≤40%, specialists ≤25%, AA ≤1, siege ≤1 before escalation, stable tie-breaking,
and an always-viable fallback. Test three seeds per era, caps, reproducibility, resource
absence, and no difficulty-based legality changes.

## Task 34: Add camp-local pressure observations

Add serializable `BarbarianCampPressure` keyed by camp: coarse armor/air facts, observed
turn, and expiry. Record armor only within six hexes or after an attack; record air only
from a visible based aircraft/strike in-region. Test negative cases for unseen distant
forces, expiry, capture/destruction cleanup, schema migration, current-viewer safety, and
no copied live unit objects.

## Task 35: Integrate the approved roster

Enable exact windows for Chariot, Trebuchet, Cavalry, Cuirassier, Armored Car, Anti-Tank
Gun, Mobile AA, and Mechanized Infantry. Test each lower/inside/upper era boundary,
observation-gated specialists, exclusions, future reinforcements after an era change, no
mass upgrade, combat/target AI roles, audio/sprite fallback, and save/load.

## Task 36: Modernization audit

Add deterministic scenario tests spanning Explorer, Standard, Veteran, human and AI
targets, one and several camps, resource-poor maps, armor/air pressure, and long quiet
periods. Verify challenge changes existing force budget/decision quality only; AI-targeted
pressure uses Standard rules. Measure spawn caps and composition distributions, replay
solo and two-human hot seat, then run source rules, build, full tests, and
`tests/systems/world-pressure-notification-volume.test.ts`.

## Player-facing contract

Barbarians advertise recognizable roles through visible units and combat preview, not
omniscient adaptive labels. Notifications group one reinforcement force, not one alert
per unit. Muted audio and reduced motion retain all text/icon information. No new
barbarian-only UI is required.
