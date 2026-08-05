// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import type { LegendaryWonderCompletionCeremonyAction } from '@/ui/legendary-wonder-completion-ceremony';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { createPanelHost } from '@/app/panel-host';
import { createCeremonyCoordinator, type CeremonyCoordinatorDeps } from '@/app/controllers/ceremony-coordinator';

function wonderItem(overrides: Partial<WonderDiscoveryRevealItem> = {}): WonderDiscoveryRevealItem {
  return {
    title: 'Natural Wonder Discovered',
    wonderId: 'great_volcano',
    civId: 'player',
    coord: { q: 2, r: 0 },
    name: 'Great Volcano',
    revealLine: 'A discovery line.',
    effectSummary: 'Yields +1 Science',
    rewardSummary: '+30 Science discovery reward',
    visual: getWonderVisualDefinition('great_volcano'),
    motionAssetId: null,
    ...overrides,
  };
}

function legendaryItem(overrides: Partial<LegendaryWonderCompletionCeremonyItem> = {}): LegendaryWonderCompletionCeremonyItem {
  return {
    title: 'Legendary Wonder Completed',
    civId: 'player',
    cityId: 'city-river',
    wonderId: 'oracle-of-delphi',
    turnCompleted: 42,
    name: 'Oracle of Delphi',
    cityName: 'city-river',
    achievementLine: 'city-river has completed a work that will shape its legacy.',
    rewardSummary: '+60 research immediately',
    rewardActiveLabel: 'Reward active',
    visual: getWonderVisualDefinition('oracle-of-delphi'),
    ...overrides,
  };
}

function baseDeps(overrides: Partial<CeremonyCoordinatorDeps> = {}): CeremonyCoordinatorDeps {
  return {
    host: createPanelHost(document.createElement('div')),
    reducedMotion: () => false,
    requestMapHighlight: vi.fn(),
    playDiscoveryAudio: vi.fn(),
    openAtlas: vi.fn(),
    openCity: vi.fn(),
    openJournal: vi.fn(),
    // Never-resolving by default so tests only observe the synchronous
    // portion of ceremony playback unless they explicitly await resolution.
    presentWonderDiscovery: () => new Promise(() => {}),
    presentLegendaryCompletion: () => new Promise(() => {}),
    ...overrides,
  };
}

describe('ceremony coordinator', () => {
  it('plays a ceremony queued while the UI was blocked, once the overlay clears', () => {
    const host = createPanelHost(document.createElement('div'));
    const playDiscoveryAudio = vi.fn();
    const coordinator = createCeremonyCoordinator(baseDeps({ host, playDiscoveryAudio }));

    host.setBlockingOverlay('city-panel');
    coordinator.enqueueWonderDiscovery(wonderItem());
    expect(playDiscoveryAudio).not.toHaveBeenCalled();

    host.setBlockingOverlay(null);

    expect(playDiscoveryAudio).toHaveBeenCalledTimes(1);
  });

  it('defers a reveal queued during an animated move until the move settles', () => {
    const playDiscoveryAudio = vi.fn();
    const coordinator = createCeremonyCoordinator(baseDeps({ playDiscoveryAudio }));

    coordinator.beginDeferredAction();
    coordinator.enqueueWonderDiscovery(wonderItem());
    expect(playDiscoveryAudio).not.toHaveBeenCalled();

    coordinator.endAction();

    expect(playDiscoveryAudio).toHaveBeenCalledTimes(1);
  });

  it('does not play a reveal queued mid-move before the move settles, even if nothing blocks the UI', () => {
    const playDiscoveryAudio = vi.fn();
    const coordinator = createCeremonyCoordinator(baseDeps({ playDiscoveryAudio }));

    coordinator.beginDeferredAction();
    coordinator.enqueueWonderDiscovery(wonderItem());

    expect(playDiscoveryAudio).not.toHaveBeenCalled();
  });

  it('passes reduced-motion through to the queue when the media query matches', async () => {
    const requestMapHighlight = vi.fn();
    const coordinator = createCeremonyCoordinator(baseDeps({
      reducedMotion: () => true,
      requestMapHighlight,
      presentWonderDiscovery: () => Promise.resolve('continue'),
    }));

    coordinator.enqueueWonderDiscovery(wonderItem());
    await Promise.resolve();
    await Promise.resolve();

    expect(requestMapHighlight).toHaveBeenCalledWith(expect.objectContaining({ wonderId: 'great_volcano' }), true);
  });

  it('a legendary completion plays immediately — it is never deferred by a move', () => {
    const presentLegendaryCompletion = vi.fn(
      (): Promise<LegendaryWonderCompletionCeremonyAction> => new Promise(() => {}),
    );
    const coordinator = createCeremonyCoordinator(baseDeps({ presentLegendaryCompletion }));

    coordinator.beginDeferredAction();
    coordinator.enqueueLegendaryCompletion(legendaryItem());

    expect(presentLegendaryCompletion).toHaveBeenCalledTimes(1);
  });

  it('routes an open-atlas ceremony resolution to the openAtlas callback', async () => {
    const openAtlas = vi.fn();
    const coordinator = createCeremonyCoordinator(baseDeps({
      openAtlas,
      presentWonderDiscovery: () => Promise.resolve('open-atlas'),
    }));

    coordinator.enqueueWonderDiscovery(wonderItem({ wonderId: 'crystal_caverns' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(openAtlas).toHaveBeenCalledWith('crystal_caverns');
  });

  it('routes an open-city ceremony resolution to the openCity callback', async () => {
    const openCity = vi.fn();
    const coordinator = createCeremonyCoordinator(baseDeps({
      openCity,
      presentLegendaryCompletion: () => Promise.resolve('open-city'),
    }));

    coordinator.enqueueLegendaryCompletion(legendaryItem({ cityId: 'city-river' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(openCity).toHaveBeenCalledWith('city-river');
  });

  it('clearForHandoff drops a reveal queued but not yet shown, so it never plays after the host later unblocks', () => {
    // Reproduces a hot-seat leak: a discovery deferred by an in-flight move
    // animation (or blocked by any overlay) must not survive a handoff and
    // play on the next player's screen. See beginHotSeatHandoff in main.ts.
    const host = createPanelHost(document.createElement('div'));
    const playDiscoveryAudio = vi.fn();
    const coordinator = createCeremonyCoordinator(baseDeps({ host, playDiscoveryAudio }));

    host.setBlockingOverlay('city-panel');
    coordinator.enqueueWonderDiscovery(wonderItem());
    coordinator.clearForHandoff();

    host.setBlockingOverlay(null);

    expect(playDiscoveryAudio).not.toHaveBeenCalled();
  });

  it('clearForHandoff cancels an in-progress move-settle defer', () => {
    const playDiscoveryAudio = vi.fn();
    const coordinator = createCeremonyCoordinator(baseDeps({ playDiscoveryAudio }));

    coordinator.beginDeferredAction();
    coordinator.enqueueWonderDiscovery(wonderItem());
    coordinator.clearForHandoff();

    // A later, unrelated discovery must play normally -- clearForHandoff
    // must not leave the coordinator permanently stuck mid-defer.
    coordinator.enqueueWonderDiscovery(wonderItem({ wonderId: 'crystal_caverns' }));

    expect(playDiscoveryAudio).toHaveBeenCalledTimes(1);
    expect(playDiscoveryAudio).toHaveBeenCalledWith('crystal_caverns');
  });

  it('clearForHandoff drops a queued legendary completion too', () => {
    const presentLegendaryCompletion = vi.fn(
      (): Promise<LegendaryWonderCompletionCeremonyAction> => new Promise(() => {}),
    );
    const host = createPanelHost(document.createElement('div'));
    const coordinator = createCeremonyCoordinator(baseDeps({ host, presentLegendaryCompletion }));

    host.setBlockingOverlay('city-panel');
    coordinator.enqueueLegendaryCompletion(legendaryItem());
    coordinator.clearForHandoff();

    host.setBlockingOverlay(null);

    expect(presentLegendaryCompletion).not.toHaveBeenCalled();
  });
});
