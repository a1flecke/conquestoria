# Air Power Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace open-map combat-aircraft movement with capacity-limited bases, bounded missions, interception, temporary reconnaissance, and deterministic base-loss handling while preserving balloons and air-trade movement.

**Architecture:** Add serializable `airOperation` metadata and optional `airBase` state, owned by `air-operations-system`. Its shared `isBasedAirUnit` predicate excludes based craft from map mechanics; UI and AI only request typed operations. Recon Aircraft unlocks at `jet-aviation`.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, DOM UI, event bus, seeded RNG, IndexedDB/localStorage.

---

## File map and delivery order

| Slice | Files | Outcome |
| --- | --- | --- |
| 1 | `types.ts`, `unit-system.ts`, `city-system.ts`, `tech-definitions-eras10.ts`, `ai-unit-roles.ts`, sprite catalog | Typed data; Recon Aircraft and truthful content. |
| 2 | New `air-operations-system.ts`; city production, occupancy, attack, movement, turn manager | Canonical capacity, production landing, rebase, carrier sync, map exclusion. |
| 3 | Combat/context, fog, attack targeting, turn manager | Strike/intercept/recon using #537. |
| 4 | City capture, lifecycle, save migration, notification routing | Loss transitions and legacy-save repair. |
| 5 | Highlights, panel, main, renderer, audio | Complete player UI/text/SFX path. |
| 6 | AI tactics/basic AI, tests | Difficulty-aware tactical choices with identical legality. |

### Task 1: Add typed content and definitions

**Files:**
- Modify: `src/core/types.ts:340-420,1504-1545`
- Modify: `src/systems/unit-system.ts:318-390,502-525,674-730`
- Modify: `src/systems/city-system.ts:639-730,1030-1040,1115-1140,1528-1545`
- Modify: `src/systems/tech-definitions-eras10.ts`, `src/ai/ai-unit-roles.ts`, `src/renderer/sprites/sprite-catalog.ts`
- Test: `tests/systems/air-operations-system.test.ts`, `tests/systems/city-system.test.ts`, `tests/systems/tech-unlocks-consistency.test.ts`, `tests/systems/unit-chain-integrity.test.ts`, `tests/ai/ai-unit-roles.test.ts`

- [ ] **Step 1: Write failing catalog assertions.**

```ts
expect(UNIT_DEFINITIONS.biplane.airOperation).toMatchObject({
  baseKinds: ['airfield', 'carrier'], operationalRange: 3, ferryRange: 6,
  missions: ['strike', 'intercept', 'rebase'], carrierEligible: true,
});
expect(UNIT_DEFINITIONS.attack_helicopter.airOperation).toMatchObject({
  baseKinds: ['helicopter_base'], operationalRange: 4, ferryRange: 8,
});
expect(UNIT_DEFINITIONS.recon_aircraft.airOperation).toMatchObject({
  baseKinds: ['airfield'], operationalRange: 5, ferryRange: 10,
  missions: ['recon', 'rebase'],
});
expect(TRAINABLE_UNITS.find(u => u.type === 'recon_aircraft')).toMatchObject({
  techRequired: 'jet-aviation', pacing: expect.objectContaining({ role: 'air-recon' }),
});
```

- [ ] **Step 2: Run it.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-operations-system.test.ts`

Expected: FAIL: metadata and `recon_aircraft` are absent.

- [ ] **Step 3: Define the serializable contract and catalog.**

```ts
export type AirBaseKind = 'airfield' | 'helicopter_base' | 'stealth_airbase' | 'carrier';
export type AirMission = 'strike' | 'intercept' | 'rebase' | 'recon';
export type AirBaseRef = { kind: 'city'; cityId: string } | { kind: 'carrier'; unitId: string };
export interface AirOperationDefinition {
  baseKinds: AirBaseKind[]; operationalRange: number; ferryRange: number;
  missions: AirMission[]; carrierEligible: boolean;
}
// UnitDefinition.airOperation?: AirOperationDefinition
// Unit.airBase?: AirBaseRef; Unit.airMission?: 'intercept'
```

Add Recon Aircraft to every trainable-unit registry, icon/sprite, description, tech unlock, and catalog-derived AI role. Define Biplane 3/6, Helicopter 4/8, Jet Fighter and Recon 5/10, Bomber 6/12, Stealth Bomber 7/14. Update facility text: Airfield 3 (4 with Air Force Command), Helicopter Base 2, Stealth Airbase 2, Carrier 2 Biplanes/Jet Fighters. Retain Air Force Command’s +4 air strength. Do not claim #582 carrier progression exists.

- [ ] **Step 4: Run catalog coverage and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-operations-system.test.ts tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-chain-integrity.test.ts tests/ai/ai-unit-roles.test.ts`

Expected: PASS.

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras10.ts src/ai/ai-unit-roles.ts src/renderer/sprites tests/systems tests/ai
git commit -m "feat(air): define based aircraft and recon catalog"
```

### Task 2: Implement canonical basing, rebase, and carrier sync

**Files:**
- Create: `src/systems/air-operations-system.ts`
- Modify: `src/systems/unit-system.ts`, `src/systems/city-system.ts`, `src/core/turn-manager.ts`, `src/systems/unit-occupancy.ts`, `src/systems/attack-targeting.ts`, `src/systems/unit-movement-system.ts`
- Test: `tests/systems/air-operations-system.test.ts`, `tests/systems/city-system.test.ts`, `tests/core/turn-manager.test.ts`, `tests/systems/unit-occupancy.test.ts`, `tests/systems/attack-targeting.test.ts`, `tests/systems/unit-movement-system.test.ts`

- [ ] **Step 1: Write failing canonical-helper tests.**

```ts
expect(getAirBaseCapacity(state, { kind: 'city', cityId: 'city-1' })).toBe(3);
expect(getAirBaseCapacity(withCommand, { kind: 'city', cityId: 'city-1' })).toBe(4);
expect(getAirBaseCapacity(state, { kind: 'carrier', unitId: 'carrier-1' })).toBe(2);
expect(isBasedAirUnit({ ...biplane, airBase: { kind: 'city', cityId: 'city-1' } })).toBe(true);
expect(canCompleteAirUnitProduction(state, city.id, 'biplane')).toMatchObject({ ok: true, base: { kind: 'city', cityId: city.id } });
expect(canCompleteAirUnitProduction(fullAirfieldState, city.id, 'biplane')).toMatchObject({ ok: false, reason: 'base-full' });
expect(getUnitIdsAtCoord(buildUnitOccupancy(state.units), city.position)).not.toContain(biplane.id);
expect(canUnitAttackTarget(state, groundUnit, city.position)).toMatchObject({ ok: false, reason: 'no-target' });
```

- [ ] **Step 2: Run it.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-operations-system.test.ts tests/systems/unit-occupancy.test.ts tests/systems/attack-targeting.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add the one shared API.**

```ts
export function isBasedAirUnit(unit: Unit): boolean;
export function getAirBaseRoster(state: GameState, ref: AirBaseRef): Unit[];
export function getAirBaseCapacity(state: GameState, ref: AirBaseRef): number;
export function canCompleteAirUnitProduction(state: GameState, cityId: string, type: UnitType): AirBaseCheck;
export function baseNewAirUnit(state: GameState, cityId: string, unit: Unit): AirOperationResult;
export function getLegalRebaseDestinations(state: GameState, unitId: string): AirBaseRef[];
export function rebaseAircraft(state: GameState, unitId: string, destination: AirBaseRef): AirOperationResult;
export function syncCarrierBasedAircraft(state: GameState, carrierId: string): GameState;
```

Roster is derived from sorted unit IDs, never stored twice. Central validation returns stable reasons: `missing-unit`, `not-based-aircraft`, `wrong-owner`, `already-acted`, `incompatible-base`, `base-missing`, `base-full`, `out-of-ferry-range`. City production calls `canCompleteAirUnitProduction` before queue completion: a combat aircraft may complete only when that city has its compatible facility and free slot, then `baseNewAirUnit` writes the local city base before adding it to state. A queued aircraft whose local base becomes unavailable is dequeued through the existing city-production failure path with a visible city notification; it is never created unbased. Use wrap-aware distance; rebase writes base and mirrored coordinate, spends action/movement, and clears intercept. Call the predicate in occupancy, defender selection, path/movement, cycling, passive fog vision, rendering, and selection. Call carrier sync only after actual carrier movement. Keep balloons and air-trade units as map units.

- [ ] **Step 4: Run positive/negative paths and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-operations-system.test.ts tests/systems/unit-occupancy.test.ts tests/systems/attack-targeting.test.ts tests/systems/unit-movement-system.test.ts`

Expected: PASS for production landing/rejection, capacity, compatibility, range, wrap, carrier movement, occupancy/target/garrison/cycle/vision/render exclusion.

```bash
git add src/systems/air-operations-system.ts src/systems/unit-system.ts src/systems/city-system.ts src/core/turn-manager.ts src/systems/unit-occupancy.ts src/systems/attack-targeting.ts src/systems/unit-movement-system.ts tests/systems tests/core
git commit -m "feat(air): add canonical basing and rebase operations"
```

### Task 3: Resolve missions, interception, and temporary recon

**Files:**
- Modify: `src/core/types.ts`, `src/systems/air-operations-system.ts`, `src/systems/combat-system.ts`, `src/systems/combat-context.ts`, `src/systems/fog-of-war.ts`, `src/systems/attack-targeting.ts`, `src/core/turn-manager.ts`
- Test: `tests/systems/air-operations-system.test.ts`, `tests/systems/combat-system.test.ts`, `tests/systems/fog-of-war.test.ts`, `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Write failing mission tests.**

```ts
expect(getLegalAirMissionTargets(state, fighter.id, 'strike')).toContainEqual(target.position);
expect(getLegalAirMissionTargets(state, recon.id, 'recon')).toContainEqual(fogCenter);
expect(startIntercept(state, fighter.id)).toMatchObject({ ok: true });
expect(resolveAirStrike(state, bomber.id, target.position).interception).toMatchObject({ interceptorId: 'fighter-a', resolved: true });
expect(selectInterceptor(state, incoming, target.position)?.id).toBe('fighter-a');
expect(refreshVisibility(withReveal).civilizations.owner.visibility.tiles[hexKey(fogCenter)]).toBe('visible');
expect(refreshVisibility(nextTurn).civilizations.owner.visibility.tiles[hexKey(fogCenter)]).not.toBe('visible');
```

- [ ] **Step 2: Run it.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-operations-system.test.ts tests/systems/combat-system.test.ts tests/systems/fog-of-war.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the mission interface.**

```ts
export function startIntercept(state: GameState, unitId: string): AirOperationResult;
export function resolveAirStrike(state: GameState, unitId: string, target: HexCoord): AirMissionResult;
export function resolveReconMission(state: GameState, unitId: string, center: HexCoord): AirMissionResult;
export function selectInterceptor(state: GameState, incoming: Unit, target: HexCoord): Unit | undefined;
```

Intercept stores stance and spends action. Selector accepts defender-owned based Biplanes/Jet Fighters in operational range that have not intercepted; sort projected damage descending, health descending, id ascending; spend only the selected craft. `resolveAirStrike` returns `{ state, interception?: { interceptorId, combatResult }, targetResolution?: { kind: 'unit' | 'city', result }, notifications }`: it first validates and snapshots the intended unit/city target, then resolves one interceptor-versus-incoming exchange with #537, aborts with no target resolution if incoming dies, and otherwise resolves exactly one reduced-health target exchange. Tests cover incoming Biplane/Jet/Bomber/Stealth Bomber against unit and city targets, target survival/death, and prove an interceptor never becomes the strike target or permits a double resolution.

Add `ReconReveal { ownerCivId, center, range, expiresAtTurn }` in optional `GameState.reconReveals`. Recon accepts unexplored/fog/visible centers in range and consumes action. Fog refresh overlays only the owner’s unexpired, wrap-aware reveal after city/non-based vision; it drops next turn and never writes another player’s visibility or permanent last-seen information.

- [ ] **Step 4: Run edge cases and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-operations-system.test.ts tests/systems/combat-system.test.ts tests/systems/fog-of-war.test.ts tests/core/turn-manager.test.ts`

Expected: PASS for every positive/negative range, one interception, stable preview name, abort/survival, bomber/stealth doctrine, same-turn refresh, wrap, expiry, and hot-seat isolation.

```bash
git add src/core/types.ts src/systems/air-operations-system.ts src/systems/combat-system.ts src/systems/combat-context.ts src/systems/fog-of-war.ts src/systems/attack-targeting.ts src/core/turn-manager.ts tests/systems tests/core
git commit -m "feat(air): resolve missions, interception, and recon visibility"
```

### Task 4: Handle base loss and migrate legacy saves

**Files:**
- Modify: `src/systems/air-operations-system.ts`, `src/systems/city-capture-system.ts`, `src/systems/unit-lifecycle-system.ts`, `src/storage/save-migrations.ts`, `src/core/types.ts`, `src/ui/notification-routing.ts`
- Test: `tests/systems/air-operations-system.test.ts`, `tests/systems/city-capture-system.test.ts`, `tests/storage/save-migrations.test.ts`, `tests/ui/notification-routing.test.ts`

- [ ] **Step 1: Write failing determinism and migration tests.**

```ts
const first = resolveAirBaseLoss(state, cityBase, { kind: 'captured', victorId: 'enemy' });
expect(first).toEqual(resolveAirBaseLoss(state, cityBase, { kind: 'captured', victorId: 'enemy' }));
expect(first.outcomes.map(x => x.aircraftId)).toEqual(['air-1', 'air-2']);
expect(migrateSaveToCurrent(legacyAirSave).units.aircraft.airBase).toEqual({ kind: 'city', cityId: 'nearest-base' });
expect(migrateSaveToCurrent(noBaseLegacySave).units.aircraft).toBeUndefined();
```

- [ ] **Step 2: Run it.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-operations-system.test.ts tests/systems/city-capture-system.test.ts tests/storage/save-migrations.test.ts tests/ui/notification-routing.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add a transition-owned loss resolver.**

```ts
export function resolveAirBaseLoss(
  state: GameState, base: AirBaseRef,
  cause: { kind: 'captured'; victorId: string } | { kind: 'facility-removed' } | { kind: 'carrier-destroyed' },
): AirBaseLossResult;
```

Sort roster IDs. For capture use a seeded one-third result based on game id, turn, city id, and aircraft id; evacuation selects compatible friendly in-ferry base, destruction removes unit, capture transfers owner while retaining captured-city base. An impossible evacuation deterministically rerolls only destruction/capture. Facility removal evacuates or destroys; carrier loss destroys all based craft. Return outcomes/recipients and emit events from this transition—not a later state scan.

Bump `CURRENT_SAVE_SCHEMA_VERSION`. Add optional serializable `pendingAirOperationNotices?: Record<string, AirOperationNotice[]>` to game state; migration appends an owner-only `legacy-aircraft-removed` notice when it removes a craft, and normal recipient routing consumes/persists that record through turn activation. One migration finds legacy combat aircraft lacking `airBase`, lands each at nearest compatible friendly facility without ferry restriction (ties by city ID then carrier ID), mirrors position, or removes it with that durable explanation. It excludes balloons and air-trade units, defaults absent `airBase`, `reconReveals`, and notice records safely, and is idempotent. Tests cover import/export and reload before the owner opens the UI.

- [ ] **Step 4: Run loss/balance/save tests and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-operations-system.test.ts tests/systems/city-capture-system.test.ts tests/storage/save-migrations.test.ts tests/ui/notification-routing.test.ts`

Expected: PASS for all outcomes, no-base reroll, sorted IDs, stable seeds, multi-seed one-third tolerance, human/AI/difficulty parity, facility/carrier loss, and both migration paths.

```bash
git add src/systems/air-operations-system.ts src/systems/city-capture-system.ts src/systems/unit-lifecycle-system.ts src/storage/save-migrations.ts src/core/types.ts src/ui/notification-routing.ts tests/systems tests/storage tests/ui
git commit -m "feat(air): handle base loss and migrate legacy aircraft"
```

### Task 5: Complete the player-facing UI and audio

**Files:**
- Modify: `src/input/selected-unit-highlights.ts`, `src/ui/selected-unit-info.ts`, `src/main.ts`, `src/renderer/render-loop.ts`, `src/renderer/unit-renderer.ts`, `src/audio/sfx-catalog.ts`, `src/audio/sfx-director.ts`, `src/audio/sfx.ts`
- Test: `tests/input/selected-unit-highlights.test.ts`, `tests/ui/selected-unit-info.test.ts`, `tests/ui/notification-routing.test.ts`, `tests/audio/sfx-director.test.ts`

#### Player Truth Table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Based fighter | Intercept | “Intercepting” and protected-area highlight |
| Bomber | Strike highlighted target | panel, combat result, map, and spent action refresh |
| Recon Aircraft | Recon fog/unexplored center | owner-only overlay and spent action refresh |
| Based craft | Open Rebase list, choose destination | base/range/slots/roster refresh |
| Full base | Attempt landing | visible capacity reason; roster unchanged |

#### Misleading UI Risks

- Strike target = visible hostile legal target in operational range; friendly/fogged/out-of-range hexes stay out.
- Rebase destination = friendly compatible base with free slot within ferry range; a wrong-facility city must not highlight.
- Rebase list entries name the city/carrier, base kind, used/total slots, and ferry distance; unavailable entries are not selectable and say why.
- Intercept cover does not promise repeat interception; once used, label it spent.
- Recon highlights do not promise permanent discovery or other hot-seat players’ intel.

#### Interaction Replay Checklist

- Reselect after intercept, strike, recon, rebase, rejection, carrier move, and base loss.
- Repeat-click a spent operation: stable disabled state/reason.
- Reopen panel: base, health, stance, legal highlights rebuilt from current state.
- Reopen city/base after rebase/carrier move: derived roster/slots update and no duplicate sprite.
- Use keyboard Enter/Space and touch to open the base list, choose, cancel, and reopen it; selection must stay tied to `AirBaseRef`, not a shared hex.
- This feature has no queue, ETA, reorder, or remove flow.

- [ ] **Step 1: Write failing rendered-behavior tests.**

```ts
click(panel.querySelector('[data-action="air-intercept"]')!);
expect(panel.textContent).toContain('Intercepting');
expect(renderedHighlights.some(h => h.type === 'air-intercept')).toBe(true);
click(panel.querySelector('[data-action="air-rebase"]')!);
expect(panel.textContent).toContain('Choose a base');
click(panel.querySelector('[data-base-kind="carrier"][data-base-id="carrier-1"]')!);
expect(panel.textContent).toContain('Base: New Avalon Airfield');
expect(panel.textContent).toContain('Slots: 2/3');
expect(getRenderedUnitIdsAt(city.position)).not.toContain(basedBomber.id);
```

- [ ] **Step 2: Run it.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-highlights.test.ts tests/ui/selected-unit-info.test.ts tests/ui/notification-routing.test.ts tests/audio/sfx-director.test.ts`

Expected: FAIL.

- [ ] **Step 3: Wire real entry points.**

Add `air-strike`, `air-recon`, and `air-intercept` highlights derived only from operation legal-target helpers. Rebase opens an accessible DOM list keyed by `AirBaseRef`: each reachable base shows name, kind, slot count, and ferry distance; Enter/Space/touch selects it, Escape/Cancel closes it without mutation, and disabled entries show their validation reason. The panel shows base, capacity, ranges, health, stance, callback controls, and derived roster. `main.ts` invokes shared helpers, emits returned typed events, routes recipients, updates render state, and calls `selectUnit(selectedUnitId)`; retain strike preview/cancel. Renderer/selection uses `isBasedAirUnit`, not `domain === 'air'`.

Add rebase/scramble/recon/base-loss SFX. Every emitted result appends a serializable recipient-scoped `AirOperationNotice`; the turn-activation notification owner flushes only that recipient's pending records, then marks them delivered so reload cannot replay them. SFX director plays immediately only for the active matching recipient; other hot-seat recipients get private text/audio at that flush. Existing mute/volume path applies and text is always present. Test save/reload between an opponent's base-loss event and their next turn.

- [ ] **Step 4: Run regressions and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-highlights.test.ts tests/ui/selected-unit-info.test.ts tests/ui/notification-routing.test.ts tests/audio/sfx-director.test.ts`

Expected: PASS for DOM refresh, all legal actions, negative boundaries, mute, recipient isolation, replay, and sprite suppression.

```bash
git add src/input/selected-unit-highlights.ts src/ui/selected-unit-info.ts src/main.ts src/renderer src/audio src/ui/notification-routing.ts tests/input tests/ui tests/audio
git commit -m "feat(air): expose missions and base rosters to players"
```

### Task 6: Give the AI parity and verify

**Files:**
- Modify: `src/ai/ai-tactics.ts`, `src/ai/basic-ai.ts`, `src/core/turn-manager.ts`, `src/systems/unit-system.ts`, `src/systems/city-system.ts`
- Test: `tests/ai/ai-tactics.test.ts`, `tests/ai/ai-production.test.ts`, `tests/systems/air-operations-system.test.ts`

- [ ] **Step 1: Write failing parity tests.**

```ts
expect(runAiTurn(withAiReconAircraft).operations).toContainEqual(expect.objectContaining({ mission: 'recon' }));
expect(runAiTurn(threatenedAirfield).operations).toContainEqual(expect.objectContaining({ mission: 'intercept' }));
expect(humanRebase.result).toEqual(aiRebase.result);
expect(sampleCaptureOutcomes(seeds, 'easy')).toEqual(sampleCaptureOutcomes(seeds, 'hard'));
```

- [ ] **Step 2: Run it.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-tactics.test.ts tests/ai/ai-production.test.ts tests/systems/air-operations-system.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement catalog-derived AI requests.**

Use metadata, not a hardcoded unit list: production only selects air units a city can land immediately; rebase based craft; intercept when hostile coverage threatens a friendly city/base; strike highest-value legal visible hostile; recon nearest unseen/fogged strategic area. Invoke exactly the player helpers. Difficulty changes tactical weights/thresholds only—not legality, capacity, visibility, selector ordering, or capture odds. Add deterministic era fixtures that compare operational reach, production opportunity cost, and interceptor survival bands; retain low-complexity default recommendations and explain rejected actions plainly for younger/newer players, while leaving manual targeting and base choice available for advanced play. Remove stale “carrier basing future” text; do not add #582 naval strike/patrol/deck progress or #543 helicopter cargo/assault.

- [ ] **Step 4: Run source, targeted, full, and build checks.**

Run: `scripts/check-src-rule-violations.sh src/core/types.ts src/core/turn-manager.ts src/systems/air-operations-system.ts src/systems/unit-system.ts src/systems/unit-occupancy.ts src/systems/attack-targeting.ts src/systems/combat-system.ts src/systems/combat-context.ts src/systems/fog-of-war.ts src/systems/city-capture-system.ts src/systems/unit-lifecycle-system.ts src/systems/unit-movement-system.ts src/systems/city-system.ts src/ai/ai-tactics.ts src/ai/basic-ai.ts src/input/selected-unit-highlights.ts src/ui/selected-unit-info.ts src/renderer/unit-renderer.ts src/main.ts src/storage/save-migrations.ts`

Expected: exit 0.

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-tactics.test.ts tests/ai/ai-production.test.ts tests/systems/air-operations-system.test.ts tests/systems/fog-of-war.test.ts tests/systems/city-capture-system.test.ts tests/storage/save-migrations.test.ts tests/input/selected-unit-highlights.test.ts tests/ui/selected-unit-info.test.ts tests/ui/notification-routing.test.ts tests/audio/sfx-director.test.ts`

Expected: PASS for solo/hot-seat and human/AI/challenge parity.

Run: `bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build`

Expected: both exit 0.

- [ ] **Step 5: Inspect and publish with verification evidence.**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check
git diff origin/main...HEAD
git push -u origin codex/issue-539-air-power-plan
```

Expected: no whitespace errors/unrelated paths. The draft PR links #539, cites targeted/full/build results, explains the migration, uses screenshots or the approved Markdown-diagram fallback, and explicitly defers #582.

## Self-review

| Requirement | Tasks |
| --- | --- |
| Facilities, capacity, Air Force Command, ranges, Recon Aircraft | 1–2 |
| Interception/#537, strike/recon, wrap/expiry/hot seat | 3 |
| Capture/facility/carrier loss and legacy saves | 4 |
| UI/UX, audio, rendering, accessibility, solo/hot seat | 5 |
| AI, difficulty, age/play-style balance, regression, full build | 6 |
| #582/#543 exclusions | 1 and 6 |

All types are defined before use, every state mutation has a shared owner, and every player action includes a visible DOM/renderer assertion. No behavior is left ambiguous: #582 carrier expansion and #543 helicopter cargo/assault are explicitly out of scope.
