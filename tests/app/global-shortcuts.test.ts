// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { installGlobalShortcuts } from '@/app/global-shortcuts';
import type { SelectionStore } from '@/app/ports';
import type { PanelRouter } from '@/app/panel-router';
import type { Notifier } from '@/app/ports';

function createSelectionStub(pendingIntent: SelectionStore['getPendingIntent']): SelectionStore {
  return {
    snapshot: () => ({
      selectedUnitId: null,
      movementRange: [],
      attackRange: [],
      pendingIntent: pendingIntent(),
      waterRecovery: { state: 'none' } as never,
    }),
    getSelectedUnitId: () => null,
    setSelectedUnitId: () => {},
    getWaterRecovery: () => ({ state: 'none' }) as never,
    setWaterRecovery: () => {},
    getMovementRange: () => [],
    getAttackRange: () => [],
    setRanges: () => {},
    getPirateSelection: () => ({ factionId: null, historyId: null }),
    setPirateSelection: () => {},
    getPendingIntent: pendingIntent,
    setPendingIntent: vi.fn(),
    shouldWarnOnMistap: () => false,
    clear: vi.fn(),
  } as unknown as SelectionStore;
}

describe('installGlobalShortcuts', () => {
  it('Escape with an armed journey cancels it and toasts', () => {
    const selection = createSelectionStub(() => ({ kind: 'journey', unitId: 'u1' }));
    const router: PanelRouter = {
      toggle: vi.fn(), open: vi.fn(), close: vi.fn(), closeGroup: vi.fn(), isOpen: vi.fn(() => false),
    };
    const notifier = { toast: vi.fn() } as unknown as Notifier;
    const target = document.createElement('div');

    installGlobalShortcuts({ target, selection, router, notifier });
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(selection.setPendingIntent).toHaveBeenCalledWith({ kind: 'none' });
    expect(notifier.toast).toHaveBeenCalledWith('Journey cancelled.', 'info');
    expect(router.toggle).not.toHaveBeenCalled();
  });

  it('Escape with no pending journey does nothing', () => {
    const selection = createSelectionStub(() => ({ kind: 'none' }));
    const router: PanelRouter = {
      toggle: vi.fn(), open: vi.fn(), close: vi.fn(), closeGroup: vi.fn(), isOpen: vi.fn(() => false),
    };
    const notifier = { toast: vi.fn() } as unknown as Notifier;
    const target = document.createElement('div');

    installGlobalShortcuts({ target, selection, router, notifier });
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(selection.setPendingIntent).not.toHaveBeenCalled();
    expect(notifier.toast).not.toHaveBeenCalled();
  });

  it('backtick toggles pacing-debug', () => {
    const selection = createSelectionStub(() => ({ kind: 'none' }));
    const router: PanelRouter = {
      toggle: vi.fn(), open: vi.fn(), close: vi.fn(), closeGroup: vi.fn(), isOpen: vi.fn(() => false),
    };
    const notifier = { toast: vi.fn() } as unknown as Notifier;
    const target = document.createElement('div');

    installGlobalShortcuts({ target, selection, router, notifier });
    target.dispatchEvent(new KeyboardEvent('keydown', { key: '`' }));

    expect(router.toggle).toHaveBeenCalledWith('pacing-debug');
  });

  it('the returned disposer removes the listener', () => {
    const selection = createSelectionStub(() => ({ kind: 'none' }));
    const router: PanelRouter = {
      toggle: vi.fn(), open: vi.fn(), close: vi.fn(), closeGroup: vi.fn(), isOpen: vi.fn(() => false),
    };
    const notifier = { toast: vi.fn() } as unknown as Notifier;
    const target = document.createElement('div');

    const dispose = installGlobalShortcuts({ target, selection, router, notifier });
    dispose();
    target.dispatchEvent(new KeyboardEvent('keydown', { key: '`' }));

    expect(router.toggle).not.toHaveBeenCalled();
  });
});
