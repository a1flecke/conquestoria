# Espionage Overhaul — Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, era-progressive espionage system: physical spy units that move on the map, attempt infiltration, execute missions from inside cities, and interact with detection units, counter-espionage, and a full capture/interrogation system.

**Architecture:** Spy units are physical `Unit` instances in `state.units` sharing their `id` with `Spy` records in `state.espionage`. While on the map the unit moves normally; on successful infiltration the unit is *removed* from `state.units` and the `Spy` record tracks the in-city state. Detection happens through other spy units and scout-hound units (not automatic). Complexity scales by era: era 1 is a single roll; era 5 has the full stack. Each MR ships standalone user value and must pass the full test suite before merge.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, Vite

---

## Deliverable MRs

| # | File | Title | User-Facing Value |
|---|------|-------|-------------------|
| 1 | [mr-01-physical-spy-units.md](mr-01-physical-spy-units.md) | Physical Spy Units + Panel Privacy | Build spy units in cities; see them on the map; locked panel content hidden |
| 2 | [mr-02-detection-system.md](mr-02-detection-system.md) | Detection System | Scout Hound units and Garrison Patrol buildings detect traveling spies |
| 3 | [mr-03-disguise-system.md](mr-03-disguise-system.md) | Disguise System | Traveling spies can disguise as common unit types |
| 4 | [mr-04-infiltration-system.md](mr-04-infiltration-system.md) | Infiltration System | Spy units infiltrate enemy cities with % chance; city tile visible while inside |
| 5 | [mr-05-mission-system.md](mr-05-mission-system.md) | Mission System | Issue and resolve missions from inside enemy cities; cooldowns scale with difficulty |
| 6 | [mr-06-capture-system.md](mr-06-capture-system.md) | Capture — Expel / Execute / Interrogate | Caught spies trigger a meaningful three-way choice; interrogate reveals intel |
| 7 | [mr-07-counter-espionage-embedding.md](mr-07-counter-espionage-embedding.md) | Counter-Espionage Embedding | Embed spies in own cities for active counter-espionage sweeps |
| 8 | [mr-08-era-types-unit-upgrade.md](mr-08-era-types-unit-upgrade.md) | Per-Era Types + Universal Unit Upgrade | Five spy unit tiers; obsolete units upgradeable at half cost |
| 9 | [mr-09-espionage-buildings.md](mr-09-espionage-buildings.md) | Espionage Buildings | Safehouse, Intelligence Agency, Security Bureau |
| 10 | [mr-10-civ-unique-detection-units.md](mr-10-civ-unique-detection-units.md) | Civ-Unique Detection Units | Unique detection units replace Scout Hound for specific civs |

---

## Full File Map

| File | Change |
|------|--------|
| `src/core/types.ts` | `UnitType` union; `SpyStatus`; new `Spy` fields; `DisguiseType`; `InterrogationRecord`; `BuildingCategory`; `UnitDefinition.spyDetectionChance` |
| `src/systems/unit-system.ts` | `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` for all spy and detection unit types |
| `src/systems/city-system.ts` | `TRAINABLE_UNITS` with `obsoletedByTech`; all new buildings; `applyProductionBonus` for safehouse; `getTrainableUnitsForCiv` helper |
| `src/systems/espionage-system.ts` | Major overhaul: `createSpyFromUnit`, `attemptInfiltration`, `expelSpy`, `executeSpy`, `startInterrogation`, `processInterrogation`, `setDisguise`, `embedSpy`, `attemptSweep`; fix `createEspionageCivState` maxSpies; steal-tech deduplication |
| `src/systems/detection-system.ts` | **New.** Spy detection logic: `processDetection`, `getSpyDetectionChance`, `applyPassiveBaselineDetection` |
| `src/systems/espionage-stealth.ts` | **New.** `getVisibleUnitsForPlayer` — filters spy units by viewer perspective |
| `src/systems/unit-upgrade-system.ts` | **New.** `queueUnitUpgrade`, `processUnitUpgrades`, upgrade cost rules |
| `src/core/turn-manager.ts` | Wire spy creation; `processDetection`; `processInterrogation`; `processUnitUpgrades`; city-vision decrement; passive detection during cooldown |
| `src/renderer/render-loop.ts` | Apply `getVisibleUnitsForPlayer`; draw infiltrated-spy indicators on cities |
| `src/renderer/unit-renderer.ts` | Icons for all new unit types |
| `src/ui/espionage-panel.ts` | Privacy fix; mission selection with % shown; capture verdict modal; interrogation progress |
| `src/ui/selected-unit-info.ts` | Infiltrate, Embed, Set Disguise actions; upgrade prompt |
| `src/ui/city-panel.ts` | Hide obsolete units; show upgrade prompt for obsolete units in city |
| `src/main.ts` | Wire all new spy action callbacks |
| `src/ai/basic-ai.ts` | Queue spy units in city production; move spy units toward targets; AI infiltration/mission logic |
| `tests/systems/espionage-system.test.ts` | Updated throughout |
| `tests/systems/espionage-infiltration.test.ts` | **New.** Infiltration, mission, cooldown |
| `tests/systems/espionage-capture.test.ts` | **New.** Expel, execute, interrogate |
| `tests/systems/espionage-stealth.test.ts` | **New.** Detection and disguise |
| `tests/systems/detection-system.test.ts` | **New.** Scout hound, passive baseline |
| `tests/systems/unit-upgrade.test.ts` | **New.** Upgrade system |
| `tests/ui/espionage-panel.test.ts` | Updated throughout |
| `tests/integration/spy-lifecycle.test.ts` | **New.** Full train→move→infiltrate→mission→capture flow |

---

## Era Progression Overview

| Era | Spy Unit | Detection Unit | New Mechanics |
|-----|----------|----------------|---------------|
| 1 | `spy_scout` (Scout Agent) | — | Move, single-roll infiltrate+scout, embed |
| 2 | `spy_informant` (Informant) | `scout_hound` | Disguise (barbarian), two-phase missions, cooldowns, expel |
| 3 | `spy_agent` (Field Agent) | — | More disguise options, sabotage/steal missions, interrogate |
| 4 | `spy_operative` (Operative) | — | Execute, full disguise menu, assassination/forgery missions |
| 5 | `spy_hacker` (Cyber Operative) | — | Passive detection risk during cooldown, digital warfare |

---

## Self-Review Against Issue #100

| Requirement | MR | Status |
|-------------|-----|--------|
| Actual espionage units | 1 | ✓ Physical units trained from cities |
| Panel hides future content | 1 | ✓ Empty stages filtered; locked content hidden |
| No unavailable actions shown | 1, 5 | ✓ Mission % gated by tech + unit type |
| Must build espionage units | 1 | ✓ No more abstract recruit button |
| New units per era | 8 | ✓ 5 unit tiers with obsolescence |
| Units infiltrate cities | 4 | ✓ % chance, removed from map on success |
| Stealth (invisible, disguised) | 3 | ✓ Disguise as common units; own spy/hound detection |
| Espionage buildings | 9 | ✓ Safehouse, Intelligence Agency, Security Bureau |
| Voluntary exfiltration | 4 | ✓ Exfiltrate action; city-capture auto-exfil |
| Captor sees true spy identity | 6 | ✓ D1: verdict modal always shows true owner+type |
| Enemy spy tile = combat | 1 | ✓ D2: spies are attackable units with low strength |
| Cooldown spies can move | 4 | ✓ D3: cooldown on-map; infiltrate button gated |
| One spy per city | 4 | ✓ D4: occupancy check before infiltration |
| Embedded spy visible on map | 7 | ✓ D5: 🛡 indicator on own city; unembed action |
| map_area intel = fog reveal | 6 | ✓ D6: one-time 'explored' tile reveal applied |
| AI verdict by situation | 6 | ✓ D7: AI chooses based on relationship + war state |

## Placeholder Scan

- MR 7 (embedding), MR 8 (upgrades), MR 9 (buildings), MR 10 (unique units): function signatures and approach are fully specified; TDD steps follow the pattern established in MRs 1-6.
- `era1ScoutResult` is fully wired in MR 4 `onInfiltrate` handler — calls `resolveMissionResult('scout_area', ...)` and applies cooldown.
- `processInterrogation` is wired in `turn-manager.ts` with full intel application (fog reveal for `map_area`, research progress for `tech_hint`).
- `setCounterIntelligence` is defined in MR 7 as a module-private helper in `espionage-system.ts`, used by `embedSpy` (MR 7) and `applyBuildingCI` (MR 9).

## Type Consistency Check

- `isSpyUnitType` defined in `espionage-system.ts` (Task 3), used in `turn-manager.ts` (Task 3), `detection-system.ts` (Task 5), and `espionage-stealth.ts` (Task 6) — consistent.
- `createSpyFromUnit(civEsp, unitId, owner, unitType, seed)` defined Task 3, used in tests and `turn-manager.ts` — 5-argument signature consistent throughout.
- `attemptInfiltration(civEsp, spyId, unitType, cityId, position, cityCI, seed)` defined Task 7, used in `main.ts` `onInfiltrate` and `basic-ai.ts` AI block — consistent.
- `expelSpy / executeSpy / startInterrogation / processInterrogation` all defined Task 9, used in `main.ts` capture handler and `turn-manager.ts` — consistent.
- `getTrainableUnitsForCiv(completedTechs, civType?)` introduced Task 2, extended Task 14 — consistent.
- `cleanupDeadSpyUnit(espionage, owner, unitId)` defined Task 4, used in combat death branches — consistent.
- `spy.unitType: UnitType` added to `Spy` interface (Task 1), set in `createSpyFromUnit` (Task 3), consumed by expel/unembed/exfiltrate handlers to recreate the physical unit — consistent.
- Spy ID rekey pattern (expel, unembed, exfiltrate): old spy key removed, new key = `newUnit.id`. All usages follow the same spread pattern — consistent.
- `hasNearbyDetector` replaces `hasNearbyOwnSpy` (Task 6); checks both `spyDetectionChance` and `isSpyUnitType` — consistent.
- Hex distances throughout use `hexDistance` from `hex-utils.ts` (axial formula), not Chebyshev — consistent.
