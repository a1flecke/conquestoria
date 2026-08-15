# Radar coverage overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an operational Radar Station canonically gate SAM coverage, AI air-defense value, and a viewer-safe, default-off overlay.

**Architecture:** Extend the existing typed `airDefenseProvider` capability with an explicit completed-building requirement and resolve provider eligibility in `air-defense-system.ts`. Cache the canonical provider index against a deterministic revision of provider cities/units and cache each viewer presentation against the provider-tile visibility revision; never rely on mutable `GameState` identity alone. The renderer receives precomputed current-viewer providers during `setGameState`, while the HUD owns the labelled toggle and its non-modal legend.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, DOM UI, existing `GameState` immutable state snapshots.

---

## File structure

- `src/core/types.ts` — capability metadata and serializable index API, using the repository's existing building-ID string convention.
- `src/systems/city-system.ts` — declares the SAM Site's Radar Station requirement.
- `src/systems/air-defense-system.ts` — owns provider eligibility, cached indexes, coverage, viewer filtering, and AI-safe threats.
- `src/ai/ai-production.ts` — consumes precomputed threats once rather than scanning all units per candidate.
- `src/renderer/render-loop.ts` — caches viewer-safe overlay input at the state boundary.
- `src/renderer/air-defense-overlay.ts` — draws static Canvas geometry only.
- `src/app/controllers/hud-controller.ts` — keeps the labelled, pressed-state control synchronized.
- Mirrored tests cover game, AI, renderer, DOM, and hot-seat behavior.

## Player Truth Table

| Before | Action | Resolver result | Immediate visible result |
| --- | --- | --- | --- |
| No owned provider | Open HUD | `civHasAirDefenseCoverage` is false | No overlay button. |
| Owned operational provider; overlay off | Tap `Air defense` | Current viewer preference becomes true | Pressed label, rings, and `Known providers only` legend appear. |
| Built SAM has no completed Radar Station | Refresh state | SAM is excluded by its typed completed-building prerequisite | No SAM ring or combat contribution. |
| Visible rival provider | Enable overlay | Viewer-safe provider list includes it | Its ring appears without aircraft or combat-intel text. |
| Rival provider becomes fogged | Refresh state | Viewer-safe list removes it | The ring disappears immediately. |
| Human A enabled overlay | Hand off to human B | B's preference and visibility are selected | A's label and intel do not persist. |

## Misleading UI Risks

- A ring means known defensive coverage, not detection, interception certainty, enemy aircraft, or summed defense.
- A SAM Site without its completed Radar Station must not appear in combat facts, AI scoring, or overlay geometry.
- Overlapping providers must retain strongest-in-group semantics; the UI cannot imply values stack.
- A current player without owned coverage must not gain the control merely by seeing a rival provider.
- Text and `aria-pressed`, not cyan or an optional future SFX, indicate whether the overlay is on.

## Interaction Replay Checklist

1. Begin solo play with no provider: no control.
2. Build an Anti-Air Battery or Mobile AA: control appears off.
3. Tap once: pressed text, static rings, and legend appear; tap again: all disappear.
4. Pan and zoom: ring centers/radii remain camera-anchored without re-enumerating providers.
5. Reduced motion: identical static rings and no animation scheduling.
6. Reveal, then fog a rival provider: its ring follows current visibility.
7. Hand off from human A (on) to human B (off): B's preference and knowledge render immediately.
8. Load current-schema and schema-0 saves with built Radar/SAM: both keep `buildings` and derive identical coverage.

### Task 1: Encode Radar-backed provider eligibility

**Files:**
- Modify: `src/core/types.ts:407-411`
- Modify: `src/systems/city-system.ts:769-777`
- Modify: `src/systems/air-defense-system.ts:1-59`
- Test: `tests/systems/air-defense-system.test.ts`

- [ ] **Step 1: Write the failing boundary tests**

```ts
it('excludes a SAM Site without its required operational Radar Station', () => {
  const next = state();
  next.cities.alpha!.buildings = ['anti_air_battery', 'sam_site'];

  expect(resolveAirDefenseCoverage(next, defender, 'defender').providers)
    .not.toContainEqual(expect.objectContaining({ id: 'city:alpha:sam_site' }));
});

it('keeps the SAM provider once its Radar Station is built', () => {
  const next = state();
  next.cities.alpha!.buildings = ['anti_air_battery', 'radar_station', 'sam_site'];

  expect(resolveAirDefenseCoverage(next, defender, 'defender').providers)
    .toContainEqual(expect.objectContaining({ id: 'city:alpha:sam_site', radius: 2 }));
});
```

- [ ] **Step 2: Run the focused regression**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-defense-system.test.ts`

Expected: FAIL on the first test because current city-provider enumeration uses a building definition alone.

- [ ] **Step 3: Add typed requirements and a GameState-keyed provider index**

```ts
export interface AirDefenseProviderCapability extends Omit<
  AirDefenseProviderDefinition, 'id' | 'kind' | 'label'
> {
  /** Building IDs use City.buildings' existing serializable string contract. */
  readonly requiresCompletedBuildingIds?: readonly string[];
}

function hasCompletedBuildingRequirements(
  city: City,
  capability: AirDefenseProviderCapability,
): boolean {
  return capability.requiresCompletedBuildingIds?.every(id => city.buildings.includes(id)) ?? true;
}
```

Set `requiresCompletedBuildingIds: ['radar_station']` on `sam_site`. Because core types cannot
import the `BUILDINGS` catalog without a cycle, retain the repository's established serializable
string-ID contract and add a catalog-validation test proving every referenced requirement exists.

Build one provider index in a `WeakMap<GameState, { revision, index }>` where `revision` is a
deterministic string over provider-relevant city id/owner/position/buildings, unit id/owner/type/
position/transport, and map wrap dimensions. Recompute the small revision before cache use and
replace the entry when it differs; tests must mutate an already-indexed fixture by removing Radar,
moving Mobile AA, and changing a provider tile's visibility, then prove coverage and overlay input
refresh. Cache each viewer-filtered result with a second revision containing only that viewer's
visibility values at indexed provider coordinates. Put base-radius resolution behind one canonical
helper so later NORAD behavior can apply typed radius data without an ID switch.

- [ ] **Step 4: Run the system suite**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-defense-system.test.ts`

Expected: PASS; existing Anti-Air Battery, Mobile AA, Missile Cruiser, hidden-provider, and radius cases remain green.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/systems/city-system.ts src/systems/air-defense-system.ts tests/systems/air-defense-system.test.ts
git commit -m "feat(695): gate SAM coverage on operational radar"
```

### Task 2: Make AI valuation bounded and non-omniscient

**Files:**
- Modify: `src/systems/air-defense-system.ts`
- Modify: `src/ai/ai-production.ts:261-289,486-512`
- Test: `tests/ai/ai-production.test.ts`
- Test: `tests/systems/air-defense-system.test.ts`

- [ ] **Step 1: Write the failing cache-reuse test**

```ts
import * as airDefense from '@/systems/air-defense-system';

it('uses one precomputed visible strike-threat summary for all building candidates', () => {
  const summary = vi.spyOn(airDefense, 'getVisibleAirDefenseThreatenedCityIds');
  generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);

  expect(summary).toHaveBeenCalledTimes(1);
});
```

Retain the existing positive/negative fixture: a visible hostile strike aircraft within operational
range scores SAM; the same aircraft at `fog` scores zero. Add a deterministic balance fixture:
the visible threat gives exactly `min(120, modifier * 10)`, out-of-range/fogged gives zero, and
Explorer, Standard, and Veteran retain the same candidate and score.

- [ ] **Step 2: Run the focused regression**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts`

Expected: FAIL because `airDefenseThreatScore` currently scans `Object.values(state.units)` per candidate.

- [ ] **Step 3: Consume one canonical AI-safe threat summary**

```ts
export function getVisibleAirDefenseThreatenedCityIds(
  state: GameState,
  civId: string,
): ReadonlySet<string>;

function airDefenseThreatScore(
  threatenedCityIds: ReadonlySet<string>, cityId: string, buildingId: string,
): number {
  const capability = BUILDINGS[buildingId]?.airDefenseProvider;
  return capability && threatenedCityIds.has(cityId)
    ? Math.min(120, capability.defenseModifier * 10)
    : 0;
}
```

Call `getVisibleAirDefenseThreatenedCityIds(state, civId)` once at the start of
`generateWithResidual` and pass that set to every building candidate. The summary enumerates the
AI's owned cities and only strike aircraft visible to that AI, uses the existing wrapped-distance
helper, and is cached with the provider index. It may not inspect fogged aircraft, enemy queues,
future technologies, or private rival data.

- [ ] **Step 4: Run AI and system tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/systems/air-defense-system.test.ts`

Expected: PASS for Explorer, Standard, and Veteran with identical legality, formulas, and visibility.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-production.ts src/systems/air-defense-system.ts tests/ai/ai-production.test.ts tests/systems/air-defense-system.test.ts
git commit -m "perf(695): cache AI air-defense threat summaries"
```

### Task 3: Cache viewer-safe overlay input at the state boundary

**Files:**
- Modify: `src/renderer/render-loop.ts:44-50,272-284,447-452,555-559`
- Modify: `src/renderer/air-defense-overlay.ts`
- Test: `tests/renderer/air-defense-overlay.test.ts`
- Create: `tests/renderer/render-loop-air-defense-overlay.test.ts`

- [ ] **Step 1: Write failing renderer tests**

```ts
it('resolves viewer-safe providers once per setGameState, not per render frame', () => {
  const loop = new RenderLoop(canvas());
  const render = () => (loop as unknown as { render(): void }).render();
  loop.setGameState(stateWithCoverage());
  render();
  render();

  expect(getKnownAirDefenseProviders).toHaveBeenCalledTimes(1);
});
```

Also assert an enabled overlay draws no geometry or legend with no known providers, changes arc
centers/radii after pan/zoom, and schedules no animation under reduced motion.

- [ ] **Step 2: Run the focused regression**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/air-defense-overlay.test.ts tests/renderer/render-loop-air-defense-overlay.test.ts`

Expected: FAIL on cache count because the current render loop resolves providers per frame.

- [ ] **Step 3: Cache presentation, not hidden rules**

```ts
private airDefenseOverlayProviders: readonly AirDefenseCoverageProvider[] = [];

setGameState(state: GameState): void {
  this.state = state;
  this.airDefenseOverlayProviders = getKnownAirDefenseProviders(state, state.currentPlayer);
  // retain existing presentation caches
}
```

Pass only `airDefenseOverlayProviders` into `drawAirDefenseOverlay` when the current viewer's
toggle is on. Keep the overlay static. Do not add an SFX path for a visibility-only control.

- [ ] **Step 4: Run renderer tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/air-defense-overlay.test.ts tests/renderer/render-loop-air-defense-overlay.test.ts`

Expected: PASS for fog filtering, empty geometry, pan/zoom, relevant-state invalidation, and reduced motion.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/render-loop.ts src/renderer/air-defense-overlay.ts tests/renderer/air-defense-overlay.test.ts tests/renderer/render-loop-air-defense-overlay.test.ts
git commit -m "perf(695): cache viewer air-defense overlay input"
```

### Task 4: Synchronize the HUD toggle for solo and hot-seat play

**Files:**
- Modify: `src/app/controllers/hud-controller.ts:56-75`
- Test: `tests/app/controllers/hud-controller.test.ts`
- Test: `tests/renderer/render-loop-air-defense-overlay.test.ts`

- [ ] **Step 1: Write the rendered-DOM and handoff tests**

```ts
it('updates pressed text immediately after a coverage toggle', () => {
  hud.placeAirDefenseButton(); hud.update();
  const button = document.getElementById('btn-air-defense-overlay') as HTMLButtonElement;
  button.click();

  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(button.textContent).toContain('on');
  expect(document.getElementById('air-defense-overlay-legend')?.textContent)
    .toContain('Known providers only');
});

it('uses the incoming hot-seat viewer preference after setGameState', () => {
  loop.setGameState(stateForViewer('human-a'));
  loop.toggleAirDefenseOverlay();
  loop.setGameState(stateForViewer('human-b'));

  expect(loop.isAirDefenseOverlayEnabled('human-b')).toBe(false);
});
```

- [ ] **Step 2: Run the focused regression**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/app/controllers/hud-controller.test.ts tests/renderer/render-loop-air-defense-overlay.test.ts`

Expected: FAIL before the new immediate state transition and handoff assertions are wired.

- [ ] **Step 3: Implement immediate viewer-scoped refresh**

Retain the existing `createGameButton` and toolbar placement. In the HUD/controller-owned overlay
root, create one `#air-defense-overlay-legend` with text `Air defense coverage — Known providers
only`; keep it hidden until the current viewer has enabled coverage, then set `hidden` and
`aria-hidden` immediately on every update/click/handoff. On each `update()`, derive button hidden,
`aria-pressed`, exact label, and legend state from `state.currentPlayer`; no prior viewer's label,
enabled state, or legend may survive handoff. Preserve the button's 44px and icon-plus-text contract.

- [ ] **Step 4: Run DOM and renderer tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/app/controllers/hud-controller.test.ts tests/renderer/render-loop-air-defense-overlay.test.ts`

Expected: PASS for default-off, repeat toggle, immediate text and legend, placement, and two-human handoff.

- [ ] **Step 5: Commit**

```bash
git add src/app/controllers/hud-controller.ts tests/app/controllers/hud-controller.test.ts tests/renderer/render-loop-air-defense-overlay.test.ts
git commit -m "fix(695): refresh air-defense toggle by viewer"
```

### Task 5: Verify end-to-end scope and update the PR

**Files:**
- Modify: `docs/superpowers/specs/2026-08-15-issue-695-radar-coverage-overlay-design-review.md`
- Modify: `docs/superpowers/plans/2026-08-15-issue-695-radar-coverage-overlay.md`

- [ ] **Step 1: Run source-rule validation**

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/city-system.ts src/systems/air-defense-system.ts src/ai/ai-production.ts src/renderer/render-loop.ts src/renderer/air-defense-overlay.ts src/app/controllers/hud-controller.ts
```

Expected: no violations.

- [ ] **Step 2: Run focused end-to-end regressions**

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/air-defense-system.test.ts tests/ai/ai-production.test.ts tests/renderer/air-defense-overlay.test.ts tests/renderer/render-loop-air-defense-overlay.test.ts tests/app/controllers/hud-controller.test.ts
```

Expected: PASS for human/non-human canonical coverage, fog, all difficulties, cache behavior, DOM text,
solo toggle, and hot-seat handoff.

- [ ] **Step 3: Preserve save and audio scope**

Record that this change adds no persisted shape: buildings remain the existing `City.buildings`
string list, while viewer preference and caches stay renderer-local, so no save schema migration is
allowed. Add current-schema and schema-0 save-load fixtures proving the identical built Radar/SAM
list derives identical coverage. Record that it adds no mechanically relevant action, so no SFX
event is needed.

- [ ] **Step 4: Run PR-grade verification separately**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```

Expected: build passes and durable evidence reports a pass for exact `HEAD` and clean tree.

- [ ] **Step 5: Inspect final scope and commit**

```bash
git diff --check
git diff --stat origin/main...HEAD
git diff --stat
git add docs/superpowers/specs/2026-08-15-issue-695-radar-coverage-overlay-design-review.md docs/superpowers/plans/2026-08-15-issue-695-radar-coverage-overlay.md
git commit -m "docs(695): record radar overlay verification"
```

Expected: no unrelated files and no uncommitted changes.

## Plan self-review

- **Spec coverage:** Task 1 implements typed Radar/SAM legality plus a future radius seam; Task 2 removes the per-candidate AI scan without omniscience; Tasks 3–4 implement the approved default-off, viewer-safe desktop/mobile behavior; Task 5 covers save non-change, SFX non-change, rules, tests, build, and durable suite.
- **UI guardrails:** the Truth Table, risks, replay checklist, and DOM assertions cover immediate toggle updates, fog transitions, repeat interaction, pan/zoom, reduced motion, and hot-seat handoff.
- **Type consistency:** `requiresCompletedBuildingIds` and `getVisibleAirDefenseThreatenedCityIds` are introduced before later tasks consume them. Building IDs retain the existing core serializable-string convention and gain catalog validation. No task uses an ID-specific resolver branch.
- **Scope:** no new save shape, sound event, platform import, difficulty formula, or drawer is planned.
