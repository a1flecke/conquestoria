import type { GameState, HexCoord } from '@/core/types';
import type { PendingMapIntent, SelectionSnapshot } from '@/app/ports';
import { getMovementBlockerReason, getBlockingMapEntityAt, type MovementBlockerReason } from '@/systems/unit-system';
import { isWorkerBusy } from '@/systems/unit-movement-system';
import { hexKey } from '@/systems/hex-utils';
import { canUnitAttackBeast } from '@/systems/beast-system';
import { resolvePirateHeadquartersSelection } from '@/input/pirate-headquarters-selection';
import { resolveFriendlyUnitStackTap } from '@/input/unit-stack-selection';
import { resolveSelectedUnitTapIntent } from '@/input/selected-unit-tap-intent';
import { resolveWonderAtlasIntent } from '@/input/wonder-atlas-intent';
import { selectDefenderEntryAtKey } from '@/input/hex-defender-selection';

/**
 * `resolveMapTapIntent`'s top-level result (#787 phase 8a).
 *
 * This is deliberately larger than this phase's plan sketch: `handleHexTap`
 * has ~20 distinct outcomes, not 9 — several of its later branches build a DOM
 * preview panel with live click-time button callbacks (combat preview, city
 * assault preview, confirm-war dialogs). Those still get their own intent
 * variant here, carrying only the *data* the executor needs to build that
 * panel (ids and coords) -- never derived UI state (computed strengths,
 * rendered strings), which the executor recomputes itself when it builds the
 * panel, exactly as `handleHexTap` does today.
 */
/**
 * The three `PendingMapIntent` kinds `resolve-pending` can actually carry.
 * `city-capture` short-circuits to `ignore` before any pending intent is
 * inspected, and `none` means there's nothing pending to resolve -- both are
 * structurally impossible here. Narrowing away from the full `PendingMapIntent`
 * lets a `switch (intent.pending.kind)` in the executor (#787 phase 8b) be
 * exhaustive without a dead defensive branch for two cases that can't occur.
 */
export type ResolvablePendingIntent = Extract<PendingMapIntent, { kind: 'journey' | 'air-mission' | 'unload' | 'paradrop' | 'air-assault' | 'last-stand-target' }>;

export type MapTapIntent =
  /** A pending intent (journey/air-mission/unload) consumes this tap. */
  | { readonly kind: 'resolve-pending'; readonly pending: ResolvablePendingIntent; readonly coord: HexCoord }
  /** The mis-tap case for a pending unload: tapped outside the legal unload range. */
  | { readonly kind: 'mistap'; readonly pending: PendingMapIntent }
  /** A city-capture choice is pending; every tap is swallowed until it resolves. */
  | { readonly kind: 'ignore' }
  | { readonly kind: 'open-pirate-faction'; readonly factionId: string }
  | { readonly kind: 'open-pirate-region'; readonly factionId: string; readonly center: HexCoord }
  /** The selected unit is mid-animation; taps are swallowed with a toast. */
  | { readonly kind: 'animation-locked' }
  | { readonly kind: 'open-stack-picker'; readonly coord: HexCoord; readonly unitIds: readonly string[] }
  | { readonly kind: 'select-unit'; readonly unitId: string }
  | { readonly kind: 'blocked-caravan-committed'; readonly unitId: string }
  | { readonly kind: 'blocked-naval-gate'; readonly unitId: string; readonly reason: string }
  | { readonly kind: 'blocked-movement'; readonly unitId: string; readonly reason: MovementBlockerReason }
  /** No unit selected; tapped an enemy unit -- show its info panel. */
  | { readonly kind: 'enemy-unit-info'; readonly unitId: string }
  | { readonly kind: 'combat-preview'; readonly attackerId: string; readonly defenderId: string; readonly targetCoord: HexCoord }
  | { readonly kind: 'assault-preview'; readonly attackerId: string; readonly cityId: string; readonly embarkedAssault: boolean }
  | { readonly kind: 'assault-camp-preview'; readonly attackerId: string; readonly campId: string }
  | { readonly kind: 'confirm-war-city'; readonly attackerId: string; readonly cityId: string; readonly defenderId: string }
  | { readonly kind: 'confirm-war-minor-civ'; readonly attackerId: string; readonly cityId: string; readonly minorCivId: string }
  | { readonly kind: 'assault-minor-civ'; readonly attackerId: string; readonly coord: HexCoord; readonly cityId: string; readonly minorCivId: string }
  | { readonly kind: 'worker-busy'; readonly unitId: string; readonly coord: HexCoord }
  | { readonly kind: 'move'; readonly unitId: string; readonly coord: HexCoord }
  | { readonly kind: 'open-city'; readonly cityId: string }
  | { readonly kind: 'open-wonder-atlas'; readonly wonderId: string; readonly coord: HexCoord }
  /** Tapped an empty, unremarkable hex with no relevant selection -- deselect. */
  | { readonly kind: 'deselect' };

/**
 * `handleHexTap`'s decision logic as a pure function of a value (#787 phase
 * 8a). No DOM, no mutation, no `bus`, no `renderLoop` -- everything the real
 * `handleHexTap` needs beyond `GameState`+`SelectionSnapshot`+`HexCoord` is an
 * explicit parameter:
 *
 * - `isAnimationLocked`: `renderLoop.hasMovingUnit(selectedUnitId)` is
 *   renderer state, not derivable from `GameState`. The caller computes it
 *   and passes it in -- this keeps the function pure without pretending
 *   animation state lives in game state.
 *
 * Coordinate wrapping (`wrapHexCoord` for horizontally-wrapping maps) is the
 * caller's responsibility, matching `handleHexTap`'s own first step -- `coord`
 * here is assumed already wrapped.
 */
export function resolveMapTapIntent(
  state: GameState,
  selection: SelectionSnapshot,
  coord: HexCoord,
  isAnimationLocked: boolean,
): MapTapIntent {
  const pending = selection.pendingIntent;

  if (pending.kind === 'city-capture') {
    return { kind: 'ignore' };
  }

  if (pending.kind === 'journey' || pending.kind === 'air-mission' || pending.kind === 'paradrop' || pending.kind === 'air-assault') {
    return { kind: 'resolve-pending', pending, coord };
  }

  const key = hexKey(coord);
  const selectedUnitId = selection.selectedUnitId;

  if (!selectedUnitId) {
    const pirateSelection = resolvePirateHeadquartersSelection(state, state.currentPlayer, coord);
    if (pirateSelection?.kind === 'faction') {
      return { kind: 'open-pirate-faction', factionId: pirateSelection.factionId };
    }
    if (pirateSelection?.kind === 'region') {
      return { kind: 'open-pirate-region', factionId: pirateSelection.factionId, center: pirateSelection.center };
    }
  }

  if (isAnimationLocked) {
    return { kind: 'animation-locked' };
  }

  // `unload` is checked here, after the pirate-HQ and animation-lock checks
  // above -- matching handleHexTap's real order exactly (main.ts checks
  // isUnitAnimationLocked before ever reading the pending-unload intent).
  if (pending.kind === 'unload') {
    const inRange = pending.range.some(h => hexKey(h) === key);
    return inRange ? { kind: 'resolve-pending', pending, coord } : { kind: 'mistap', pending };
  }

  // #544 MR4: same precomputed-range convention as `unload` above.
  if (pending.kind === 'last-stand-target') {
    const inRange = pending.range.some(h => hexKey(h) === key);
    return inRange ? { kind: 'resolve-pending', pending, coord } : { kind: 'mistap', pending };
  }

  const canMove = Boolean(selectedUnitId) && selection.movementRange.some(h => hexKey(h) === key);
  const canAttack = Boolean(selectedUnitId) && selection.attackRange.some(h => hexKey(h) === key);

  if (!canMove && !canAttack) {
    const stackTap = resolveFriendlyUnitStackTap(state, coord, selectedUnitId);
    if (stackTap.kind === 'open-stack-picker') {
      return { kind: 'open-stack-picker', coord, unitIds: stackTap.unitIds };
    }
    if (stackTap.kind === 'select-unit') {
      return { kind: 'select-unit', unitId: stackTap.unitId };
    }
  }

  if (selectedUnitId && !canMove && !canAttack) {
    const selectedUnit = state.units[selectedUnitId];
    if (selectedUnit) {
      if (selectedUnit.committedToRouteId) {
        return { kind: 'blocked-caravan-committed', unitId: selectedUnitId };
      }
      const defenderAtHex = selectDefenderEntryAtKey(state, key)?.[1];
      if (defenderAtHex) {
        const navalGate = canUnitAttackBeast(selectedUnit, defenderAtHex);
        if (!navalGate.allowed) {
          return { kind: 'blocked-naval-gate', unitId: selectedUnitId, reason: navalGate.reason ?? 'Cannot attack that target.' };
        }
      }
      const reason = getMovementBlockerReason(selectedUnit, coord, state.map, {
        completedTechs: state.civilizations[selectedUnit.owner]?.techState.completed ?? [],
        blockingEntity: getBlockingMapEntityAt(state, selectedUnit, coord),
      });
      if (reason) {
        return { kind: 'blocked-movement', unitId: selectedUnitId, reason };
      }
    }
  }

  const defenderEntry = selectDefenderEntryAtKey(state, key);
  if (defenderEntry && !selectedUnitId) {
    return { kind: 'enemy-unit-info', unitId: defenderEntry[0] };
  }

  if (selectedUnitId && (canMove || canAttack)) {
    const unit = state.units[selectedUnitId];
    // handleHexTap's real branch is a bare `return;` here -- a true no-op,
    // not the deselect-and-tap-SFX fallback at the bottom of this function.
    // Reuses `ignore` (already used for the city-capture guard above) rather
    // than a new variant, since both are genuinely "do nothing at all".
    if (!unit) return { kind: 'ignore' };

    if (canAttack && defenderEntry) {
      // handleHexTap re-checks the naval attack gate here with an
      // amphibious-assault-aware attacker position (a unit embarked on a
      // transport attacks from the transport's position, not its own) --
      // distinct from the earlier `blocked-naval-gate` check above, which
      // only runs when the tap is NOT a legal move/attack target at all.
      const amphibiousAssault = Boolean(unit.transportId);
      const previewAttacker = amphibiousAssault && unit.transportId
        ? { ...unit, position: { ...state.units[unit.transportId]?.position }, transportId: undefined }
        : unit;
      const navalGate = canUnitAttackBeast(previewAttacker, defenderEntry[1]);
      if (!navalGate.allowed) {
        return { kind: 'blocked-naval-gate', unitId: selectedUnitId, reason: navalGate.reason ?? 'Cannot attack that target.' };
      }
      return { kind: 'combat-preview', attackerId: selectedUnitId, defenderId: defenderEntry[0], targetCoord: coord };
    }

    const tapIntent = resolveSelectedUnitTapIntent(state, selectedUnitId, coord, selection.movementRange);
    if (tapIntent.kind === 'assault-city') {
      return { kind: 'assault-preview', attackerId: selectedUnitId, cityId: tapIntent.cityId, embarkedAssault: Boolean(tapIntent.embarkedAssault) };
    }
    if (tapIntent.kind === 'assault-camp') {
      return { kind: 'assault-camp-preview', attackerId: selectedUnitId, campId: tapIntent.campId };
    }
    if (tapIntent.kind === 'confirm-war-city') {
      return { kind: 'confirm-war-city', attackerId: selectedUnitId, cityId: tapIntent.cityId, defenderId: tapIntent.defenderId };
    }
    if (tapIntent.kind === 'confirm-war-minor-civ') {
      return { kind: 'confirm-war-minor-civ', attackerId: selectedUnitId, cityId: tapIntent.cityId, minorCivId: tapIntent.minorCivId };
    }
    if (tapIntent.kind === 'assault-minor-civ') {
      return { kind: 'assault-minor-civ', attackerId: selectedUnitId, coord, cityId: tapIntent.cityId, minorCivId: tapIntent.minorCivId };
    }

    if (isWorkerBusy(state, selectedUnitId)) {
      return { kind: 'worker-busy', unitId: selectedUnitId, coord };
    }

    return { kind: 'move', unitId: selectedUnitId, coord };
  }

  const cityAtHex = Object.values(state.cities).find(c => c.owner === state.currentPlayer && hexKey(c.position) === key);
  if (cityAtHex) {
    return { kind: 'open-city', cityId: cityAtHex.id };
  }

  const wonderAtlasIntent = resolveWonderAtlasIntent(state, state.currentPlayer, coord);
  if (wonderAtlasIntent.type === 'open-atlas') {
    return { kind: 'open-wonder-atlas', wonderId: wonderAtlasIntent.wonderId, coord: wonderAtlasIntent.coord };
  }

  return { kind: 'deselect' };
}
