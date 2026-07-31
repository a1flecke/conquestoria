# Beast Handler Company Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver #673's resource-free Era 2 Beast Handler Company, converging generic and Roman detection lines without breaking player truth, AI legality, hot-seat privacy, or detection history.

**Architecture:** Unit identity, legal production, typed role, and explicit predecessor edges live in the existing catalogs. The shared detection system consumes the unit's `spyDetectionChance` and is tightened to exclude transported units and deduplicate records/events per detecting civilization. Player panels and AI consume those canonical facts; temporary catalog mappings use existing hound assets until #708 and #714 replace them.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM sprite catalog, EventBus, Vite.

---

## Inline review record and required fixes

| Dimension | Review conclusion | Required implementation guardrail |
|---|---|---|
| Balance and fun | A 72-cost, 24-strength unit is a resource-free detection alternative, not a strict Horseman replacement: it costs 17 more, has no combat bonus, and carries detection value. | Keep its AI role `['detection']`; compare it with Hounds, Archer, and Horseman using directional combat envelopes. |
| Ages 7–43 | New players need one clear sentence; experienced players need exact, inspectable facts. | Plain-language summary first; expandable role facts show 35%, requirements, counters, vulnerability, and terminal state. |
| Play styles | Explorer and builder players gain spy defense; optimizers retain explicit production and upgrade facts; aggressive players cannot make the unit an AI generalist. | No resource gate; no capture/frontline AI role; catalog remains fully reachable. |
| Difficulty | Difficulty must never change the unit's legality or mechanics. | Run the same legal candidate assertion under Explorer, Standard, and Veteran; no difficulty condition in production/detection code. |
| Computer players | AI already reads typed roles and legal city candidates, but unique-support demand prevents spam. | Add the detection-only role and prove absent-without-demand/present-with-demand behavior; do not modify `basic-ai`. |
| UI and UX | Selected-unit details are current-viewer scoped; false successor claims would mislead. | Owner sees requirements; rival does not; terminal text says War Elephant is future content until #674. |
| Architecture and extensibility | Definitions and role metadata are correct seams; a nonexistent successor violates catalog integrity. | Do not create `war_elephant` or an inert edge; #674 owns the future successor. |
| Data and saves | A new catalog type adds no field to persisted units or queues. | Do not increment schema; validate legacy/current save normalization still preserves known units and queues. |
| Audio and sprites | Existing hound assets are valid temporary fallbacks, not final identity. | Explicit aliases cite #708 and #714; catalog coverage tests ensure they are live. |
| Solo and hot seat | Detection records are owner scoped, but current loop can duplicate same-owner events and allows cargo detection. | Deduplicate by `(spy, detecting civilization, turn)` and ignore `transportId`; prove two-human privacy. |
| Implementation safety | The work is data-driven plus one small pure loop repair; it is suitable for a Sonnet-4.5-level implementation model when executed one task at a time. | Each task below has bounded files, an expected failing test, exact mutation, and a stop/checkpoint. |

## Sonnet-4.5 execution boundaries

1. Execute only one numbered task at a time and do not begin the next task until its focused command exits 0.
2. Do not invent a new detection abstraction, save migration, AI branch, or visual asset; the exact existing seams are listed in the File map.
3. If a test failure is unrelated to the files in its task, stop and report the full output instead of changing unrelated code.
4. Preserve the issue split: #674 owns War Elephant, #677 discounts, #708 sprite replacement, and #714 audio replacement.

## File map

- `src/core/types.ts`: add the `beast_handler` union member.
- `src/systems/unit-system.ts`: define stats and honest player description.
- `src/systems/city-system.ts`: add the Horseback Riding production entry, icon, and temporary terminal reason.
- `src/systems/tech-definitions-eras1-4.ts`: add `beast_handler` to Horseback Riding's structured unit unlocks.
- `src/systems/combat-role-definitions.ts`: define the detection/formation-support presentation and detection-only AI role.
- `src/systems/detection-system.ts`: make same-owner detection one event/record per spy per turn and ignore transported detectors.
- `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts`: add explicit, documented temporary War Hound catalog mappings.
- `tests/systems/{city-system,detection-system,espionage-stealth,unit-chain-integrity}.test.ts`: production, detection, privacy, terminal, and balance contracts.
- `tests/ai/{ai-unit-roles,ai-production}.test.ts`, `tests/ui/{unit-role-presentation,selected-unit-info}.test.ts`: AI legality and player-visible facts.
- `tests/{renderer/sprites/sprite-catalog,audio/sfx-catalog}.test.ts`: catalog fallback coverage.

## Player Truth Table

| Before | Player action | Immediate visible result |
|---|---|---|
| Horseback Riding is incomplete | Open a city production catalog | Beast Handler remains unavailable and shows Horseback Riding as missing. |
| Horseback Riding is complete | Open the catalog | Beast Handler appears for every non-Roman/non-Persian civilization, including without Horses. |
| A Beast Handler is selected by its owner | Expand Role details | Plain-language detection-support summary, exact 35% detection, counter/vulnerability, and the future-content terminal explanation are visible. |
| A rival selects the same unit in hot seat | Expand Role details | Public role facts remain visible; the owner's private prerequisite completion is not shown. |
| Two friendly detectors find one idle spy | End the turn | The detecting owner receives one record/event, never duplicate notifications. |

## Misleading UI Risks

- A generic non-Roman/non-Persian civilization must not lose Scout Hound before Horseback Riding; Beast Handler is an additional later catalog item, not a replacement.
- Roman War Hound and Persian Shadow Warden remain their existing Scout Hound replacements. Beast Handler must be reachable to both afterward without changing their source-unit availability.
- The panel cannot claim an active War Elephant upgrade before #674 supplies that unit. It must say `War Elephant Corps is future content.`
- Role labels must not imply a free frontline/capture generalist: the UI uses `detection` plus `formation support`, while the AI has only a `detection` strategic role.

## Interaction Replay Checklist

- Open a generic city before and after Horseback Riding; verify availability changes while Scout Hound remains available.
- Open Roman and Persian cities with Horseback Riding; verify their unique source hounds/warden and Beast Handler are reachable as the typed catalog allows.
- Select a Beast Handler as its owner, expand Role details, then switch hot-seat viewer and select it again; verify private requirements disappear.
- Process one idle disguised spy with two friendly handlers and an adjacent city; verify only one owner-scoped result. Repeat with a second detecting civilization and verify it receives its own result.
- Load a handler into a transport and process detection/visibility; verify it reveals nothing.

### Task 1: Repair canonical detection ownership and transport visibility

**Files:**
- Modify: `src/systems/detection-system.ts`
- Test: `tests/systems/detection-system.test.ts`
- Test: `tests/systems/espionage-stealth.test.ts`

- [ ] **Step 1: Write failing detection regressions against existing hounds**

Add tests that create two existing `scout_hound` units owned by `ai-egypt` next to one idle spy, place an `ai-egypt` city adjacent, subscribe to `espionage:spy-detected-traveling`, and assert `recentDetections` and emitted events both have length `1`. Add a second nearby owner with espionage state and assert each owner gets one record. Add a loaded Scout Hound (`transportId: 'transport-1'`) and assert it creates no record. In `espionage-stealth.test.ts`, add a loaded-Scout-Hound case that leaves the disguise intact for the viewer.

- [ ] **Step 2: Verify the regressions fail**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/detection-system.test.ts tests/systems/espionage-stealth.test.ts`

Expected: FAIL because the current loop records the same owner more than once and does not filter transported detectors. This is a behavioral failure, not a TypeScript compilation failure.

- [ ] **Step 3: Implement one record/event per detecting owner**

In `processDetection`, create a per-spy `Set<string>` before detector evaluation. Replace each direct `registerDetection` call with a local helper that returns early when the owner is already in the set, otherwise adds that owner and updates `nextState`:

```ts
const detectedByCivIds = new Set<string>();
const registerOnce = (detectingCivId: string, wasDisguised: boolean): void => {
  if (detectedByCivIds.has(detectingCivId)) return;
  detectedByCivIds.add(detectingCivId);
  nextState = registerDetection(nextState, detectingCivId, spyUnit, wasDisguised, bus);
};
```

Skip every detector with `detectUnit.transportId` before reading its definition. Call `registerOnce(detectUnit.owner, false)` after a successful unit roll and `registerOnce(city.owner, spyRecord.disguiseAs != null)` after a successful city roll. Do not alter RNG seeding, odds, range, or cross-civilization behavior.

- [ ] **Step 4: Verify the detection suite passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/detection-system.test.ts tests/systems/espionage-stealth.test.ts`

Expected: PASS; duplicate same-owner records/events are gone, a transported detector is inert, and different owners still retain independent facts.

- [ ] **Step 5: Commit the canonical detection repair**

```bash
git add src/systems/detection-system.ts tests/systems/detection-system.test.ts tests/systems/espionage-stealth.test.ts
git commit -m "fix(espionage): dedupe detector events and exclude cargo"
```

### Task 2: Add the typed Beast Handler catalog entry

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/tech-definitions-eras1-4.ts`
- Modify: `src/systems/combat-role-definitions.ts`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/systems/unit-chain-integrity.test.ts`
- Test: `tests/systems/tech-unlocks-consistency.test.ts`
- Test: `tests/ai/ai-unit-roles.test.ts`

- [ ] **Step 1: Write failing catalog/legality/balance tests**

Add a `Beast Handler production contract` suite that queries the not-yet-existing key as `'beast_handler' as UnitType`, so the test runs and fails on missing runtime catalog data rather than failing TypeScript compilation. Assert exactly:

```ts
expect(handler).toMatchObject({
  type: 'beast_handler', name: 'Beast Handler Company', cost: 72,
  techRequired: 'horseback-riding', resourceRequired: undefined,
});
expect(UNIT_DEFINITIONS.beast_handler).toMatchObject({
  strength: 24, movementPoints: 3, visionRange: 3, spyDetectionChance: 0.35,
});
```

Assert it is absent before Horseback Riding and present for Egypt, Rome, and Persia afterward without resource ownership; assert Scout Hound/War Hound each declare `upgradesTo: 'beast_handler'`, Shadow Warden has no target, and Beast Handler has no target plus its explicit future-content terminal reason. Add deterministic combat fixtures for predecessor versus handler, Archer versus handler, and handler versus Horseman; use directional/envelope assertions rather than a guaranteed combat outcome. Extend the AI role test with `['beast_handler', ['detection']]`.

- [ ] **Step 2: Verify catalog tests fail**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/ai/ai-unit-roles.test.ts`

Expected: FAIL because the runtime catalogs contain no Beast Handler definition, production entry, unlock, or role.

- [ ] **Step 3: Implement the minimum typed catalog**

Add `'beast_handler'` beside the detection unit types in `UnitType`. Add this definition and description:

```ts
beast_handler: {
  type: 'beast_handler', name: 'Beast Handler Company', movementPoints: 3,
  visionRange: 3, strength: 24, canFoundCity: false,
  canBuildImprovements: false, productionCost: 72, spyDetectionChance: 0.35,
},
// Description: "Mobile detection support. Has a 35% chance per turn to reveal disguised or stealthed spies within vision range."
```

Add a generic `TRAINABLE_UNITS` row using `techRequired: 'horseback-riding'`, no resource gate, and no `obsoletedByTech`/`upgradesTo`; add its production icon. Change Scout Hound and War Hound rows to `upgradesTo: 'beast_handler'`, then add Beast Handler's reason to the catalog-derived terminal reasons as `War Elephant Corps is future content.` Add `beast_handler` to Horseback Riding's `unlocksUnits` array. Add a typed role:

```ts
beast_handler: role('detection',
  'Mobile detection support that reveals disguised spies while staying with the formation.',
  ['detection'],
  { secondaryRoles: ['formation-support'], counters: ['formation-support'],
    vulnerableTo: ['ranged'], upgradeFamily: 'detection',
    terminalReason: 'War Elephant Corps is future content.' }),
```

Do not add the unavailable `war_elephant` type or an inert successor edge.

- [ ] **Step 4: Verify catalog and balance tests pass**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/ai/ai-unit-roles.test.ts`

Expected: PASS; all typed catalogs agree, all civs have identical Horseback Riding legality, and Beast Handler remains a detection specialist rather than a generalist AI demand.

- [ ] **Step 5: Commit the typed mechanics catalog**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras1-4.ts src/systems/combat-role-definitions.ts tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/ai/ai-unit-roles.test.ts
git commit -m "feat(combat): add Beast Handler Company"
```

### Task 3: Wire AI, player truth, temporary assets, and difficulty parity

**Files:**
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/audio/sfx-catalog.ts`
- Test: `tests/ai/ai-production.test.ts`
- Test: `tests/ui/unit-role-presentation.test.ts`
- Test: `tests/ui/selected-unit-info.test.ts`
- Test: `tests/renderer/sprites/sprite-catalog.test.ts`
- Test: `tests/audio/sfx-catalog.test.ts`

- [ ] **Step 1: Write failing end-to-end regressions**

In AI production tests, give an AI Horseback Riding and a missing `detection` demand, then assert the Beast Handler candidate is present under Explorer, Standard, and Veteran state settings; assert it is absent with no detection demand. In role-presentation tests, assert its summary, `Role: detection · formation support`, Horseback Riding requirement, and future-content terminal fact. In selected-unit tests, render the handler for its owner and a different current player, asserting only the owner sees prerequisite completion. Add sprite/SFX assertions that the `beast_handler` catalog entries resolve and use the same temporary rendered/SFX object as War Hound.

- [ ] **Step 2: Verify end-to-end tests fail**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ui/unit-role-presentation.test.ts tests/ui/selected-unit-info.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts`

Expected: FAIL because Beast Handler lacks renderer and mixer mappings; UI and AI assertions expose any missing typed consumer wiring.

- [ ] **Step 3: Add documented temporary catalog mappings**

Map `beast_handler` to `withMotion('beast_handler', WarHoundSprite)` and an `animal` motion class in `sprite-catalog.ts`, with a comment that #708 replaces the temporary silhouette. Reuse the exact War Hound SFX object in `UNIT_SFX.beast_handler` and set its locomotion class to `animal`, with a comment that #714 replaces the temporary cues. Do not add a `basic-ai` exception: the role catalog and `getTrainableUnitsForCity` already feed legal candidate generation.

- [ ] **Step 4: Verify all end-to-end tests pass**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ui/unit-role-presentation.test.ts tests/ui/selected-unit-info.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts`

Expected: PASS; all difficulties share legality, AI selects the handler only for a real detection need, owners see complete current facts, hot-seat rivals do not see private prerequisites, and temporary assets have valid catalog fallbacks.

- [ ] **Step 5: Commit consumer wiring**

```bash
git add src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts tests/ai/ai-production.test.ts tests/ui/unit-role-presentation.test.ts tests/ui/selected-unit-info.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts
git commit -m "feat(combat): wire Beast Handler consumers"
```

### Task 4: Run scoped and release verification

**Files:**
- Modify: none

- [ ] **Step 1: Run source-rule validation**

Run: `scripts/check-src-rule-violations.sh src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras1-4.ts src/systems/combat-role-definitions.ts src/systems/detection-system.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts`

Expected: exit 0 with no rule violations.

- [ ] **Step 2: Run all mirrored focused tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/detection-system.test.ts tests/systems/espionage-stealth.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/ai/ai-unit-roles.test.ts tests/ai/ai-production.test.ts tests/ui/unit-role-presentation.test.ts tests/ui/selected-unit-info.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts`

Expected: PASS.

- [ ] **Step 3: Inspect all deltas and run release checks**

Run: `git diff --check && git diff --stat origin/main...HEAD && git diff --stat && bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`

Expected: clean whitespace check, reviewed committed/uncommitted stats, successful TypeScript/Vite build, and successful complete test suite.
