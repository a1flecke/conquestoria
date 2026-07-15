# Zone of Control and Flanking/Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add domain-local zone of control (ZOC), adjacent-tile flanking/support bonuses, clear pre-move and post-move player feedback, and equivalent behavior for AI and hostile world actors.

**Architecture:** Keep movement truth, ZOC eligibility, and combat-adjacency counting in small stateless system helpers. A detailed movement-range API supplies both legal destinations and its ZOC-terminal subset; the existing array-returning API remains a compatibility wrapper. Combat positioning enters resolution through `buildCombatContextForDefender`, so live combat, previews, and AI use the same modifier parts.

**Tech Stack:** TypeScript, Vitest, Canvas 2D renderer, DOM UI, existing event bus and canonical movement/combat systems.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/systems/owner-hostility.ts` | One owner-pair hostility predicate shared by movement, combat targeting, and ZOC. |
| `src/systems/zone-of-control-system.ts` | Domain/eligibility rules, wrapped-neighbor ZOC lookup, terminal move result, and combat-adjacent occupied-tile counts. |
| `src/systems/unit-system.ts` | Detailed movement range API that stops expansion after a ZOC-terminal entry while retaining `getMovementRange` compatibility. |
| `src/systems/unit-movement-system.ts` | Canonical finalization of a move, including zeroing remaining movement after a ZOC entry and returning an optional player-facing stop reason. |
| `src/input/selected-unit-highlights.ts` | Converts detailed range data into normal and ZOC-limited player highlights. |
| `src/renderer/render-loop.ts` | Adds a high-contrast `zoc-limited` Canvas highlight style. |
| `src/ui/selected-unit-info.ts` | Renders the non-color pre-move legend when the selected unit has ZOC-limited destinations. |
| `src/systems/combat-context.ts`, `src/systems/combat-system.ts` | Adds positional modifier inputs/parts and applies the exact +10%-per-tile strength multipliers. |
| `src/ui/combat-preview.ts` | Displays the supplied positional modifier parts. |
| `src/ai/ai-tactics.ts` | Adds deterministic post-move flanking/support value to otherwise comparable move candidates. |
| `src/ai/basic-ai.ts`, `src/systems/pirate-system.ts`, `src/systems/pirate-behavior.ts` | Routes retained direct movement through the same ZOC finalizer or canonical executor. |
| Mirrored tests listed per task | Prove rules, player-visible state, AI/world parity, and balance. |

## Player Truth Table

| Before | Player action | Internal result | Immediate visible result |
|---|---|---|---|
| Selected land/naval combat unit has normal movement and a hostile same-domain combat unit nearby | Select the unit | Detailed range marks legal terminal ZOC destinations | Normal destinations stay blue; terminal ones are amber with the ZOC icon/pattern and `Enemy nearby — entering ends movement` in the selected-unit panel. |
| Player taps an amber destination | Move resolves | Unit enters the tile and `movementPointsLeft` becomes `0` | Unit animates to the destination, selected-unit flow advances, and the notification says `Stopped — enemy nearby`. |
| Player selects recon, civilian, or air unit | Select the unit | ZOC is not considered | No amber ZOC destinations or legend appear. |
| Player opens combat preview with adjacent allies | Tap attack target | Canonical combat context adds tile-count modifiers | Preview shows the exact `Flanked +N%` and/or `Supported +N%` text before Attack. |

## Misleading UI Risks

- A `zoc-limited` tile must be in the legal movement range; a blocked, hostile-occupied, unexplored-too-far, or insufficient-movement tile must never receive the amber type.
- Amber alone is insufficient. The renderer must also apply a distinct outline/pattern/icon, and the selected-unit surface must expose the pre-move explanation text.
- Attack-target tiles retain the existing attack type; ZOC only decorates legal non-attack movement destinations.
- The legend is shown only when the selected unit has at least one ZOC-limited destination, and disappears on deselect/reselect when none remain.

## Interaction Replay Checklist

1. Select a unit with a ZOC-limited destination; confirm amber tile, non-color cue, and legend.
2. Tap the amber tile; confirm movement, exhausted movement, and stop notification.
3. Reselect the exhausted unit; confirm stale movement and legend do not remain.
4. Deselect and select recon/air/civilian and a unit with no nearby hostile; confirm no false ZOC surface.
5. In hot seat, switch current player and select that player’s unit; confirm the same viewer-scoped highlights and no hardcoded `player` owner.

## Task 1: Centralize hostility and pure ZOC/combat-positioning rules

**Files:**
- Create: `src/systems/owner-hostility.ts`
- Create: `src/systems/zone-of-control-system.ts`
- Create: `tests/systems/owner-hostility.test.ts`
- Create: `tests/systems/zone-of-control-system.test.ts`
- Modify: `src/systems/attack-targeting.ts`
- Modify: `src/ai/ai-hostility.ts`

- [ ] **Step 1: Write failing hostility tests.**

```ts
expect(isHostileOwnerTo(state, 'player', 'barbarian')).toBe(true);
expect(isHostileOwnerTo(state, 'player', 'beasts')).toBe(true);
expect(isHostileOwnerTo(state, 'player', 'ai-1')).toBe(false);
state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
expect(isHostileOwnerTo(state, 'player', 'ai-1')).toBe(true);
```

- [ ] **Step 2: Run the new test and confirm the missing-module failure.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/owner-hostility.test.ts`

Expected: FAIL because `@/systems/owner-hostility` does not exist.

- [ ] **Step 3: Add the shared owner predicate.**

```ts
// src/systems/owner-hostility.ts
export function isHostileOwnerTo(
  state: Readonly<GameState>, actorId: string, otherOwnerId: string,
): boolean {
  if (actorId === otherOwnerId) return false;
  if (isAlwaysHostilePair(actorId, otherOwnerId)) return true;
  if (actorId.startsWith('mc-')) return isMinorCivHostileToOwner(state, actorId, otherOwnerId);
  if (otherOwnerId.startsWith('mc-')) {
    return state.civilizations[actorId]?.diplomacy.atWarWith.includes(otherOwnerId) ?? false;
  }
  return state.civilizations[actorId]?.diplomacy.atWarWith.includes(otherOwnerId) ?? false;
}
```

Refactor `attack-targeting.ts` and `ai-hostility.ts` to call this helper. Preserve the existing AI-only decision to decline beast contests in `isAIHostileOwner`; do not weaken the universal game-rule hostility predicate used by ZOC.

- [ ] **Step 4: Write failing ZOC and adjacency tests.**

```ts
expect(isZocEligibleCombatUnit(warrior)).toBe(true);
expect(isZocEligibleCombatUnit(scout)).toBe(false);
expect(isZocEligibleCombatUnit(worker)).toBe(false);
expect(isZocEligibleCombatUnit(biplane)).toBe(false);
expect(getCombatAdjacentOccupiedTileCount(state, attacker, defender)).toBe(2);
```

Include land/naval same-domain positives, cross-domain negatives, a wrapped map-edge positive, a stack counted once, and barbarian/beast/pirate/rebel sources.

- [ ] **Step 5: Implement the pure helpers.**

```ts
export interface ZoneOfControlResult {
  limited: boolean;
  sourceUnitIds: readonly string[];
}

export function getZoneOfControlAt(
  state: Readonly<GameState>, mover: Unit, destination: HexCoord,
): ZoneOfControlResult;

export function getCombatAdjacentOccupiedTileCount(
  state: Readonly<GameState>, ownerId: string, defender: Unit, excludedUnitId?: string,
): number;
```

Define “eligible” once: non-transported, strength greater than zero, not recon class, and non-air. `getZoneOfControlAt` traverses with `getWrappedHexNeighbors` when `map.wrapsHorizontally` and `hexNeighbors` otherwise, filters hostile eligible same-domain units, and returns `limited: sourceUnitIds.length > 0`. `getCombatAdjacentOccupiedTileCount` traverses the same neighbors, filters eligible units owned by `ownerId` after excluding `excludedUnitId`, stores each `hexKey(neighbor)` once, and returns the set size. Do not count the defender’s own tile in support.

- [ ] **Step 6: Run focused rule tests.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/owner-hostility.test.ts tests/systems/zone-of-control-system.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the rule foundation.**

```bash
git add src/systems/owner-hostility.ts src/systems/zone-of-control-system.ts src/systems/attack-targeting.ts src/ai/ai-hostility.ts tests/systems/owner-hostility.test.ts tests/systems/zone-of-control-system.test.ts
git commit -m "feat(combat): add shared zone of control rules"
```

## Task 2: Make every gameplay movement path ZOC-aware

**Files:**
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/unit-movement-system.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/systems/pirate-system.ts`
- Modify: `src/systems/pirate-behavior.ts`
- Test: `tests/systems/unit-system.test.ts`
- Test: `tests/systems/unit-movement-system.test.ts`
- Test: `tests/ai/basic-ai-pirates.test.ts`
- Test: `tests/systems/pirate-system.test.ts`
- Test: `tests/systems/pirate-behavior.test.ts`

- [ ] **Step 1: Write failing detailed-range tests.**

```ts
const range = getMovementRangeDetails(state, mover, { completedTechs: [] });
expect(range.reachable.map(hexKey)).toContain('1,0');
expect(range.zocLimited.map(hexKey)).toContain('1,0');
expect(range.reachable.map(hexKey)).not.toContain('2,0'); // cannot continue past entry
expect(getMovementRange(mover, state.map, occupancy.unitIdsByHex, occupancy.ownersByUnitId, hostileOwners).map(hexKey)).toContain('1,0');
```

Cover forced march, wrapping, a unit beginning in ZOC, land/naval parity, and recon/air/civilian negative cases.

- [ ] **Step 2: Add a detailed range API without breaking current callers.**

```ts
export interface MovementRangeDetails {
  reachable: HexCoord[];
  zocLimited: HexCoord[];
}

export function getMovementRangeDetails(
  state: Readonly<GameState>, unitId: string,
): MovementRangeDetails;

export function getMovementRange(
  unit: Unit, map: GameMap, unitPositions: Record<string, string | string[]>,
  unitOwners?: Record<string, string>, hostileOwners?: Set<string>, options: UnitMovementContext = {},
): HexCoord[];
```

`getMovementRangeDetails` builds occupancy from `state.units`, derives hostile owners with `isHostileOwnerTo(state, unit.owner, candidate.owner)`, and follows the current BFS exactly. When it enters a legal ZOC tile, add that coordinate to both arrays but never enqueue it. `getMovementRange` retains its current signature and existing non-state utility behavior; update every gameplay caller that needs ZOC to call the detailed state API. Preserve current hostile-occupant, road, river, terrain, technology, and forced-march logic.

- [ ] **Step 3: Write failing canonical-execution tests.**

```ts
const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });
expect(result).toMatchObject({ ok: true, stopReason: 'zone-of-control' });
expect(state.units.mover.movementPointsLeft).toBe(0);
expect(state.units.mover.position).toEqual({ q: 1, r: 0 });
```

Add a world-actor equivalent and assertions that no destination is blocked solely by ZOC.

- [ ] **Step 4: Implement one move-finalization helper and use it in `executeUnitMove`.**

```ts
export interface FinalizedUnitMove { unit: Unit; stopReason?: 'zone-of-control'; }

export function finalizeUnitMove(state: Readonly<GameState>, unit: Unit, to: HexCoord, cost: number): FinalizedUnitMove {
  const moved = moveUnit(unit, to, cost);
  return getZoneOfControlAt(state, moved, to).limited
    ? { unit: { ...moved, movementPointsLeft: 0 }, stopReason: 'zone-of-control' }
    : { unit: moved };
}
```

Extend the successful `ExecuteUnitMoveResult` with `stopReason?: 'zone-of-control'`; retain all existing event, transport, visibility, and route-cleanup behavior.

- [ ] **Step 5: Remove direct-move bypasses.**

For every direct `moveUnit` call found by `rg -n "moveUnit\\(" src/ai src/systems`, either migrate it to `executeUnitMove` or replace it with `finalizeUnitMove` using the state before the move. In particular, update `moveWarshipToward`, pirate pursuit, pirate one-step movement, and pirate formation relocation. In formation relocation, stop a vessel after its first ZOC-limited step and reject/cancel the atomic formation plan if that would make formation placement inconsistent; never move through ZOC in a later loop iteration.

- [ ] **Step 6: Prove direct-path parity.**

Add one test each for the basic-AI naval pursuit path, pirate-system move, and pirate-behavior movement path. Each places a hostile same-domain unit beside the entered tile and asserts `movementPointsLeft === 0` and no subsequent step. Keep existing pirate formation atomicity assertions.

- [ ] **Step 7: Run movement and world-path tests.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/systems/unit-movement-system.test.ts tests/ai/basic-ai-pirates.test.ts tests/systems/pirate-system.test.ts tests/systems/pirate-behavior.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit canonical movement parity.**

```bash
git add src/systems/unit-system.ts src/systems/unit-movement-system.ts src/ai/basic-ai.ts src/systems/pirate-system.ts src/systems/pirate-behavior.ts tests/systems/unit-system.test.ts tests/systems/unit-movement-system.test.ts tests/ai/basic-ai-pirates.test.ts tests/systems/pirate-system.test.ts tests/systems/pirate-behavior.test.ts
git commit -m "feat(movement): apply zone of control to all movers"
```

## Task 3: Apply flanking/support in canonical combat strength and previews

**Files:**
- Modify: `src/systems/combat-context.ts`
- Modify: `src/systems/combat-system.ts`
- Modify: `src/ui/combat-preview.ts`
- Test: `tests/systems/combat-system.test.ts`
- Test: `tests/systems/unit-modifier-system.test.ts`
- Test: `tests/ui/combat-preview.test.ts`

- [ ] **Step 1: Write failing combat-context and preview tests.**

```ts
expect(context.attackerPositioning?.multiplier).toBeCloseTo(1.2);
expect(context.attackerPositioning?.part.label).toBe('Flanked +20%');
expect(formatCombatPreviewDetails('Rival', 100, strengths)).toContain('Flanked +20%');
expect(formatCombatPreviewDetails('Rival', 100, strengths)).toContain('Supported +10%');
```

Add negative tests for a stacked second unit, civilian/recon/air presence, attacker-own tile, defender-own tile, foreign tile, and ranged six-tile flank. Assert a melee attacker tops out at +50%, ranged flanking at +60%, and defender support at +60%.

- [ ] **Step 2: Extend `CombatContext` with positional multiplier/part inputs.**

```ts
export interface PositioningCombatModifier {
  multiplier: number;
  part?: ModifierPart;
}
// Add attackerPositioning?: PositioningCombatModifier and defenderPositioning?: PositioningCombatModifier.
```

`buildCombatContextForDefender` derives counts through `getCombatAdjacentOccupiedTileCount`, then creates `Flanked +${count * 10}%` and `Supported +${count * 10}%` parts only when the count is nonzero.

- [ ] **Step 3: Apply and expose the canonical modifiers.**

In `calculateCombatStrengths`, multiply base attacker/defender strengths by the new positioning multiplier before existing unit-modifier/city-defense processing, and append the parts to the existing modifier-part arrays. Preserve the pure `calculateCombatStrengths` signature: no state lookup inside combat resolution.

- [ ] **Step 4: Add balance sampling before changing any constants.**

Copy the seeded loop pattern from `tests/systems/unit-modifier-system.test.ts`. Run three Stone Age warrior scenarios: no adjacency bonus, two-tile flank/support, and each maximum case (five-tile melee flank, six-tile ranged flank, six-tile support). Assert the same-tier average remains 2–4 exchanges. If a maximum scenario fails, stop the implementation and record the result for an explicit balance decision—do not add a cap.

- [ ] **Step 5: Run combat tests.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts tests/systems/unit-modifier-system.test.ts tests/ui/combat-preview.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit combat positioning.**

```bash
git add src/systems/combat-context.ts src/systems/combat-system.ts src/ui/combat-preview.ts tests/systems/combat-system.test.ts tests/systems/unit-modifier-system.test.ts tests/ui/combat-preview.test.ts
git commit -m "feat(combat): add flanking and support bonuses"
```

## Task 4: Render clear ZOC movement truth and feedback

**Files:**
- Modify: `src/input/selected-unit-highlights.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/main.ts`
- Test: `tests/input/selected-unit-highlights.test.ts`
- Test: `tests/renderer/render-loop-wrap.test.ts`
- Test: `tests/ui/selected-unit-info.test.ts`
- Test: `tests/input/selected-unit-movement-feedback.test.ts`

- [ ] **Step 1: Write failing selected-highlight tests.**

```ts
expect(result.zocLimitedRange.map(hexKey)).toContain('1,0');
expect(result.highlights).toContainEqual({ coord: { q: 1, r: 0 }, type: 'zoc-limited' });
expect(result.highlights).not.toContainEqual({ coord: { q: 2, r: 0 }, type: 'zoc-limited' });
```

Add a hot-seat fixture with `currentPlayer = 'ai-1'`, a no-ZOC legend negative test, and a wrapped highlight mirror test.

- [ ] **Step 2: Extend highlight presentation.**

Add `zocLimitedRange: HexCoord[]` and `hasZoneOfControlWarning: boolean` to `SelectedUnitHighlightResult`. Create `type: 'zoc-limited'` in `HexHighlight`, render it amber with a high-contrast outline distinct from `water-recovery`, and preserve attack precedence.

- [ ] **Step 3: Render the pre-move explanation.**

Add `hasZoneOfControlWarning?: boolean` to `SelectedUnitInfoPresentation`; when true, render exactly `Enemy nearby — entering ends movement` in the selected-unit panel. In `main.ts`, pass the flag returned by `buildSelectedUnitHighlights`. The line must be removed by the existing `replaceChildren()` rerender when the next selection has no ZOC-limited destination.

- [ ] **Step 4: Wire the post-move stop notification without an error SFX.**

After a successful `executeAnimatedUnitMove`, if `moveResult.stopReason === 'zone-of-control'`, call `showNotification('Stopped — enemy nearby', 'info')`. Do not call `SFX.error()` and do not add new audio assets. Ensure this happens before the next-unit selection callback so it is visible to the player.

- [ ] **Step 5: Run UI/renderer tests.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-highlights.test.ts tests/renderer/render-loop-wrap.test.ts tests/ui/selected-unit-info.test.ts tests/input/selected-unit-movement-feedback.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit player-visible ZOC feedback.**

```bash
git add src/input/selected-unit-highlights.ts src/renderer/render-loop.ts src/ui/selected-unit-info.ts src/main.ts tests/input/selected-unit-highlights.test.ts tests/renderer/render-loop-wrap.test.ts tests/ui/selected-unit-info.test.ts tests/input/selected-unit-movement-feedback.test.ts
git commit -m "feat(ui): show zone of control movement warnings"
```

## Task 5: Make major AI value positional combat advantage

**Files:**
- Modify: `src/ai/ai-tactics.ts`
- Test: `tests/ai/ai-tactics.test.ts`

- [ ] **Step 1: Write a failing deterministic candidate-ranking test.**

```ts
const moves = rankUnitTacticalActions(context(state, plan), mover.id)
  .filter((candidate): candidate is RankedAITacticalAction & { action: { kind: 'move' } } => candidate.action.kind === 'move');
expect(moves[0]?.action).toEqual({ kind: 'move', unitId: mover.id, destination: flankDestination });
expect(moves[0]!.score).toBeGreaterThan(moves[1]!.score);
```

Build two equally target-progressing moves where only one places the mover on a tile that provides an adjacent friendly combat position around the planned enemy. Keep visibility, health, movement, and cohesion equal.

- [ ] **Step 2: Add a pure positioning-score helper in `ai-tactics.ts`.**

```ts
function scorePostMovePositioning(context: AITacticalContext, unit: Unit, destination: HexCoord): number {
  const projected = { ...context.state, units: { ...context.state.units, [unit.id]: { ...unit, position: destination } } };
  const projectedUnit = projected.units[unit.id]!;
  return getAttackTargets(projected, projectedUnit, { viewerId: context.actorId, requireVisibility: true })
    .filter(target => target.result.targetType === 'unit')
    .reduce((score, target) => {
      const defender = projected.units[target.result.targetUnitId]!;
      const combat = buildCombatContextForDefender(projected, projectedUnit, defender);
      return score + ((combat.attackerPositioning?.multiplier ?? 1) - 1) * 100;
    }, 0);
}
```

Use the canonical context output, not duplicate adjacency math. Add this score after target progress and before deterministic tie-breaks; keep existing difficulty profiles responsible only for seeded near-best selection.

- [ ] **Step 3: Add a regression for the negative boundary.**

Assert that a candidate adjacent only to a civilian/recon/air unit receives no positional score and that a ZOC-limited move does not gain value from imaginary follow-on movement.

- [ ] **Step 4: Run tactical tests.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/ai/ai-tactics.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit AI parity.**

```bash
git add src/ai/ai-tactics.ts tests/ai/ai-tactics.test.ts
git commit -m "feat(ai): value combat flanking positions"
```

## Task 6: Full verification and implementation review

**Files:**
- Review: all files changed by Tasks 1–5

- [ ] **Step 1: Run the source rule checker.**

Run: `scripts/check-src-rule-violations.sh src/systems/owner-hostility.ts src/systems/zone-of-control-system.ts src/systems/unit-system.ts src/systems/unit-movement-system.ts src/systems/combat-context.ts src/systems/combat-system.ts src/ui/combat-preview.ts src/input/selected-unit-highlights.ts src/renderer/render-loop.ts src/ui/selected-unit-info.ts src/main.ts src/ai/ai-tactics.ts src/ai/basic-ai.ts src/systems/pirate-system.ts src/systems/pirate-behavior.ts`

Expected: no violations.

- [ ] **Step 2: Run the complete required test suite.**

Run: `./scripts/run-with-mise.sh yarn test`

Expected: PASS.

- [ ] **Step 3: Build TypeScript and production assets.**

Run: `./scripts/run-with-mise.sh yarn build`

Expected: PASS.

- [ ] **Step 4: Inspect both branch and local deltas.**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git diff
```

Confirm there is no saved-state schema change or migration, no new SFX/audio call, no hardcoded hot-seat owner, every direct gameplay mover uses ZOC finalization, and the UI truth table is satisfied.

## Plan Self-Review

- **Spec coverage:** Task 1 covers hostility, owner-agnostic world actors, domains, recon/civilian/air exclusions, wrapping, and stack semantics. Task 2 covers all movement execution paths and no schema change. Task 3 covers flanking/support, preview, stacking, and maximum-envelopment balance. Task 4 covers the amber non-color UI, notification, solo/hot-seat behavior, and no SFX. Task 5 covers major-AI positional parity. Task 6 enforces regression, build, and delta review.
- **Placeholder scan:** No implementation step relies on unspecified “appropriate” behavior; each carries a concrete predicate, test, command, or acceptance condition.
- **Type consistency:** `MovementRangeDetails`, `FinalizedUnitMove`, `PositioningCombatModifier`, `zocLimitedRange`, and `stopReason: 'zone-of-control'` are introduced before later tasks consume them.
