# Issue 547 Naval, Siege, and Armor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Repository subagent
> approval rules still apply.

**Goal:** Fill the siege, surface-fleet, and heavy-armor succession gaps with bounded
special effects and clear counters.

**Architecture:** Technologies and units remain catalog data; splash, combined arms,
capital-ship roles, and family discounts are canonical helpers with emitted modifier
facts. AI consumes the same predicates and never uses unit-ID formation branches.

**Tech Stack:** TypeScript, Vitest, seeded combat fixtures, Canvas/DOM presentation.

---

Use the common unit/catalog/AI/UI/audio/sprite files and tests named in the mounted plan,
plus `src/systems/combat-system.ts`, `src/systems/combat-context.ts`,
`tests/systems/combat-system.test.ts`, and `tests/ui/combat-preview.test.ts`.

## Task 18: Add Dreadnought Construction

Add `dreadnought-construction` to `src/systems/tech-definitions-eras9.ts` at cost 275 with
Naval Armor + Bessemer Steel, `countsForEraAdvancement: false`, and Battleship unlock.
Test both prerequisites, era progress exclusion, research AI, unlock presentation, and
marquee pacing.

## Task 19: Add Battleship

Add cost 240, strength 66, movement 4, vision/range 3 capital ship with +20% coastal/city
bombardment, submarine vulnerability, and
`Pre-Dreadnought → Battleship → Missile Cruiser`. Test surface/city positive cases,
noncoastal and submarine negative cases, AI fire support/escort, and no pirate roster
contamination.

## Task 20: Add Trebuchet

Add cost 125, strength 27, movement 1, bombard 2 at Siege Warfare + Fortresses, with +25%
city damage and −20% unit damage. Wire
`Catapult → Trebuchet → Cannon` while Ballista still converges on Cannon. Test both
prerequisites, city/unit exchange, fort penetration, AI siege need, and chain integrity.

## Task 21: Type the classical Siege Workshop family

Replace item-ID discount logic with a `classical-siege` family covering Catapult,
Ballista, and Trebuchet, 20% local discount, obsolete at Black Powder. Test all members,
Cannon/later exclusions, queue ETA, AI cost evaluation, and the exact obsolescence turn.

## Task 22: Add bounded Rocket Artillery splash

Add Rocket Artillery at Rocketry with exact stats and
`Artillery → Rocket Artillery`. Implement `resolveBoundedSplash` at combat mutation time:
25% final primary damage, at most two adjacent visible hostile military targets, stable
ID order, no recursion. Test allies/civilians/cities/cargo/hidden/out-of-range exclusions,
AI target valuation, history/preview facts, one notification group, and save determinism.

## Task 23: Add Main Battle Tank combined arms

Add MBT at Armored Tactics + Precision Engineering with exact stats and
`Tank → Main Battle Tank`. Implement one shared adjacent-line-infantry predicate granting
+10% attack/defense once. Test Mechanized/Exosuit positive cases, multiple infantry
nonstacking, unauthorized identity redaction, AI formation, and Anti-Tank/Attack
Helicopter answers.

## Task 24: Type the Tank Depot family

Make the Depot discount Armored Car, Tank, Mechanized Infantry, and MBT by 10% and grant
eligible stationed vehicles +5 healing. Use role/family metadata; explicitly exclude
Anti-Tank Gun and Mobile AA. Test empire/local scope, one heal per turn, pillaged/absent
building, queue ETA, AI production, and save round trip.

## Task 25: Add Missile Cruiser

Add the cost-285, strength-70, movement-5, range-3 capital ship at Carrier Warfare + Radar
Systems + Rocketry with radius-1 +10 fleet AA. Test all three prerequisites, capital fire
support, strongest-source stacking, fleet escort AI, Battleship upgrade, submarine
vulnerability, and no hidden-aircraft overlay leak.

## Balance and replay gate

Run seeded siege-vs-city/fort, submarine-vs-capital, generic-vs-specialist, combined-arms,
and island scenarios. Render applied/superseded modifier facts, keep the full production
catalog reachable, and replay upgrade/queue/combat/hot-seat transitions. Commit measured
exchanges in each PR and stop outside the approved tuning envelope.
