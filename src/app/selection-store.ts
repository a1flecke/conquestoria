/**
 * The concrete `SelectionStore`.
 *
 * A plain closure over the ten module-scope `let`s this replaces in `main.ts`.
 * No DOM, no renderer, no event bus — selection is data, and keeping it that way
 * is what lets `resolveMapTapIntent` become a pure function in a later phase.
 *
 * See docs/superpowers/plans/2026-08-04-composition-root-decomposition.md.
 */
import type { HexCoord } from '@/core/types';
import type { PendingMapIntent, SelectionStore } from '@/app/ports';
import type { LandUnitWaterRecovery } from '@/systems/unit-water-recovery';
import { NO_LAND_UNIT_WATER_RECOVERY } from '@/systems/unit-water-recovery';

const NO_PENDING_INTENT: PendingMapIntent = { kind: 'none' };

export function createSelectionStore(): SelectionStore {
  let selectedUnitId: string | null = null;
  let waterRecovery: LandUnitWaterRecovery = NO_LAND_UNIT_WATER_RECOVERY;
  let movementRange: readonly HexCoord[] = [];
  let attackRange: readonly HexCoord[] = [];
  let pirateFactionId: string | null = null;
  let pirateHistoryId: string | null = null;
  let pendingIntent: PendingMapIntent = NO_PENDING_INTENT;
  let mistapNotified = false;

  return {
    getSelectedUnitId: () => selectedUnitId,
    setSelectedUnitId: unitId => {
      selectedUnitId = unitId;
    },

    getWaterRecovery: () => waterRecovery,
    setWaterRecovery: recovery => {
      waterRecovery = recovery;
    },

    getMovementRange: () => movementRange,
    getAttackRange: () => attackRange,
    setRanges: (movement, attack) => {
      // Copy: callers pass arrays they still hold (highlight results), and a
      // shared reference would let a later mutation silently change what the
      // player is allowed to tap.
      movementRange = [...movement];
      attackRange = [...attack];
    },

    getPirateSelection: () => ({ factionId: pirateFactionId, historyId: pirateHistoryId }),
    setPirateSelection: (factionId, historyId) => {
      pirateFactionId = factionId;
      pirateHistoryId = historyId;
    },

    getPendingIntent: () => pendingIntent,
    setPendingIntent: intent => {
      pendingIntent = intent;
      mistapNotified = false;
    },

    shouldWarnOnMistap: () => {
      if (mistapNotified) return false;
      mistapNotified = true;
      return true;
    },

    clear: () => {
      selectedUnitId = null;
      waterRecovery = NO_LAND_UNIT_WATER_RECOVERY;
      movementRange = [];
      attackRange = [];
      // A pending city-capture choice outlives deselection on purpose — see the
      // `clear()` contract in `@/app/ports`.
      if (pendingIntent.kind !== 'city-capture') {
        pendingIntent = NO_PENDING_INTENT;
        mistapNotified = false;
      }
    },
  };
}
