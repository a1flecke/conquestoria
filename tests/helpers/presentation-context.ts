import { vi } from 'vitest';
import type { GameState } from '@/core/types';
import type { SelectionStore } from '@/app/ports';
import type { PresentationContext } from '@/presentation/register-all';
import { NO_LAND_UNIT_WATER_RECOVERY } from '@/systems/unit-water-recovery';
import type { NotificationSink } from '@/ui/notification-routing';

function makeSelectionStoreDouble(): SelectionStore {
  return {
    snapshot: () => ({
      selectedUnitId: null,
      waterRecovery: NO_LAND_UNIT_WATER_RECOVERY,
      movementRange: [],
      attackRange: [],
      pendingIntent: { kind: 'none' },
    }),
    getSelectedUnitId: () => null,
    setSelectedUnitId: vi.fn(),
    getWaterRecovery: () => NO_LAND_UNIT_WATER_RECOVERY,
    setWaterRecovery: vi.fn(),
    getMovementRange: () => [],
    getAttackRange: () => [],
    setRanges: vi.fn(),
    getPirateSelection: () => ({ factionId: null, historyId: null }),
    setPirateSelection: vi.fn(),
    getPendingIntent: () => ({ kind: 'none' }),
    setPendingIntent: vi.fn(),
    shouldWarnOnMistap: () => false,
    clear: vi.fn(),
  };
}

/**
 * A fake `PresentationContext` for the twelve-plus registrar test suites
 * (#787 phase 7). `deliver` is exposed both standalone and inside `notifier`
 * so a test can assert on it without reaching through `ctx.notifier.deliver`.
 */
export function makePresentationContext(overrides: {
  state?: Partial<GameState>;
  deliver?: ReturnType<typeof vi.fn<NotificationSink>>;
} = {}): PresentationContext & { deliver: ReturnType<typeof vi.fn<NotificationSink>> } {
  const deliver = overrides.deliver ?? vi.fn<NotificationSink>();
  const state = {
    turn: 1,
    currentPlayer: 'player',
    civilizations: {},
    cities: {},
    units: {},
    ...overrides.state,
  } as GameState;

  return {
    deliver,
    session: {
      getState: () => state,
      commit: vi.fn(),
      update: vi.fn(),
      setStateWithoutRefresh: vi.fn(),
      subscribe: () => () => {},
    },
    notifier: {
      toast: vi.fn(),
      deliver,
      choice: vi.fn(),
      withHappenedTurn: (_turn, fn) => fn(),
    },
    router: {
      toggle: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      closeGroup: vi.fn(),
      isOpen: () => false,
    },
    ceremonies: {
      enqueueWonderDiscovery: vi.fn(),
      enqueueLegendaryCompletion: vi.fn(),
      beginDeferredAction: vi.fn(),
      endAction: vi.fn(),
      clearForHandoff: vi.fn(),
    },
    selection: makeSelectionStoreDouble(),
    requestDeliveryVisual: vi.fn(),
    applyCombatVisual: vi.fn(),
  };
}
