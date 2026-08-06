import type { GameState, HexCoord } from '@/core/types';
import type { PendingMapIntent, SelectionSnapshot } from '@/app/ports';
import { getMovementBlockerReason, type MovementBlockerReason } from '@/systems/unit-system';
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
export type MapTapIntent =
  /** A pending intent (journey/air-mission/unload/city-capture) consumes this tap. */
  | { readonly kind: 'resolve-pending'; readonly pending: PendingMapIntent; readonly coord: HexCoord }
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

  if (pending.kind === 'journey' || pending.kind === 'air-mission') {
    return { kind: 'resolve-pending', pending, coord };
  }

  const key = hexKey(coord);

  if (pending.kind === 'unload') {
    const inRange = pending.range.some(h => hexKey(h) === key);
    return inRange ? { kind: 'resolve-pending', pending, coord } : { kind: 'mistap', pending };
  }

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
    if (!unit) return { kind: 'deselect' };

    if (canAttack && defenderEntry) {
      return { kind: 'combat-preview', attackerId: selectedUnitId, defenderId: defenderEntry[0], targetCoord: coord };
    }

    const tapIntent = resolveSelectedUnitTapIntent(state, selectedUnitId, coord, selection.movementRange);
    if (tapIntent.kind === 'assault-city') {
      return { kind: 'assault-preview', attackerId: selectedUnitId, cityId: tapIntent.cityId, embarkedAssault: Boolean(tapIntent.embarkedAssault) };
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
