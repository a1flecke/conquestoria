// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { WonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import type { LegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import type { LegendaryWonderCompletionCeremonyAction } from '@/ui/legendary-wonder-completion-ceremony';
import type { WonderDiscoveryCeremonyAction } from '@/ui/wonder-discovery-ceremony';
import type { EventChainConclusionMomentItem } from '@/systems/event-chain-presentation';
import type { VictoryPanelOptions } from '@/ui/victory-panel';
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

function eventChainItem(overrides: Partial<EventChainConclusionMomentItem> = {}): EventChainConclusionMomentItem {
  return {
    civId: 'player',
    chainId: 'chain-1',
    kind: 'financial-panic',
    title: 'Financial Panic',
    optionLabel: 'Emergency Bailout',
    optionDescription: 'Pay a gold sum now to guarantee the treasury crisis passes quietly.',
    ...overrides,
  };
}

function victoryOptions(overrides: Partial<VictoryPanelOptions> = {}): VictoryPanelOptions {
  return {
    winnerName: 'Rome',
    victoryType: 'Domination Victory',
    outcome: 'victory',
    turn: 120,
    onNewGame: () => {},
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
    presentEventChainConclusion: () => new Promise(() => {}),
    presentVictory: () => new Promise(() => {}),
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

  it('clearForHandoff does not let an already-played reveal replay on a later re-encounter', async () => {
    // wonder:discovered re-fires whenever fog-of-war re-reveals an
    // already-discovered wonder tile, not just on first discovery. A
    // hot-seat handoff must not reset that dedupe for ceremonies the player
    // already saw -- only for backlog it never got to show them.
    const playDiscoveryAudio = vi.fn();
    const coordinator = createCeremonyCoordinator(baseDeps({
      playDiscoveryAudio,
      presentWonderDiscovery: () => Promise.resolve('continue'),
    }));

    coordinator.enqueueWonderDiscovery(wonderItem());
    await Promise.resolve();
    await Promise.resolve();
    expect(playDiscoveryAudio).toHaveBeenCalledTimes(1);

    coordinator.clearForHandoff();
    coordinator.enqueueWonderDiscovery(wonderItem());

    expect(playDiscoveryAudio).toHaveBeenCalledTimes(1);
  });

  describe('event-chain conclusion (#993)', () => {
    it('plays a resolved chain conclusion once nothing blocks the UI', () => {
      const presentEventChainConclusion = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ presentEventChainConclusion }));

      coordinator.enqueueEventChainConclusion(eventChainItem());

      expect(presentEventChainConclusion).toHaveBeenCalledTimes(1);
      expect(presentEventChainConclusion).toHaveBeenCalledWith(expect.objectContaining({ chainId: 'chain-1' }));
    });

    it('is never deferred by a move, like a legendary completion', () => {
      const presentEventChainConclusion = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ presentEventChainConclusion }));

      coordinator.beginDeferredAction();
      coordinator.enqueueEventChainConclusion(eventChainItem());

      expect(presentEventChainConclusion).toHaveBeenCalledTimes(1);
    });

    it('ignores a null item (a different civ/outcome that built no moment)', () => {
      const presentEventChainConclusion = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ presentEventChainConclusion }));

      coordinator.enqueueEventChainConclusion(null);

      expect(presentEventChainConclusion).not.toHaveBeenCalled();
    });

    it('dedupes repeat enqueue of the same civ/chain', () => {
      const presentEventChainConclusion = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ presentEventChainConclusion }));

      coordinator.enqueueEventChainConclusion(eventChainItem());
      coordinator.enqueueEventChainConclusion(eventChainItem());

      expect(presentEventChainConclusion).toHaveBeenCalledTimes(1);
    });

    it('clearForHandoff drops a queued chain conclusion, same as the wonder ceremonies', () => {
      const host = createPanelHost(document.createElement('div'));
      const presentEventChainConclusion = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ host, presentEventChainConclusion }));

      host.setBlockingOverlay('city-panel');
      coordinator.enqueueEventChainConclusion(eventChainItem());
      coordinator.clearForHandoff();

      host.setBlockingOverlay(null);

      expect(presentEventChainConclusion).not.toHaveBeenCalled();
    });
  });

  describe('victory (#993)', () => {
    it('plays immediately when nothing is presenting', () => {
      const presentVictory = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ presentVictory }));

      coordinator.enqueueVictory(victoryOptions({ winnerName: 'Rome' }));

      expect(presentVictory).toHaveBeenCalledWith(expect.objectContaining({ winnerName: 'Rome' }));
    });

    it('waits for a currently-presenting ceremony to finish before showing, instead of stacking on top of it', async () => {
      // Reproduces a confirmed pre-#993 race: a legendary wonder can complete
      // on the exact round the game ends (its ceremony begins presenting
      // synchronously during round processing, before handleVictoryIfNeeded
      // ever runs), and the old direct showVictoryPanel() call had no
      // awareness of that in-flight ceremony's own overlay.
      let resolveLegendary: (() => void) | undefined;
      const presentLegendaryCompletion = vi.fn(() => new Promise<LegendaryWonderCompletionCeremonyAction>(resolve => {
        resolveLegendary = () => resolve('continue');
      }));
      const presentVictory = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ presentLegendaryCompletion, presentVictory }));

      coordinator.enqueueLegendaryCompletion(legendaryItem());
      expect(presentLegendaryCompletion).toHaveBeenCalledTimes(1);

      coordinator.enqueueVictory(victoryOptions());
      expect(presentVictory).not.toHaveBeenCalled();

      resolveLegendary!();
      await Promise.resolve();
      await Promise.resolve();

      expect(presentVictory).toHaveBeenCalledTimes(1);
    });

    it('drops any wonder/legendary/event-chain backlog not yet presenting once the game ends', () => {
      const presentWonderDiscovery = vi.fn(() => new Promise<WonderDiscoveryCeremonyAction>(() => {}));
      const presentEventChainConclusion = vi.fn(() => new Promise<void>(() => {}));
      const presentVictory = vi.fn(() => new Promise<void>(() => {}));
      const host = createPanelHost(document.createElement('div'));
      const coordinator = createCeremonyCoordinator(baseDeps({
        host, presentWonderDiscovery, presentEventChainConclusion, presentVictory,
      }));

      // Block the UI so the wonder/chain moments queue but never start.
      host.setBlockingOverlay('city-panel');
      coordinator.enqueueWonderDiscovery(wonderItem());
      coordinator.enqueueEventChainConclusion(eventChainItem());
      expect(presentWonderDiscovery).not.toHaveBeenCalled();
      expect(presentEventChainConclusion).not.toHaveBeenCalled();

      coordinator.enqueueVictory(victoryOptions());
      host.setBlockingOverlay(null);

      // Victory itself still shows; the dropped backlog never plays.
      expect(presentVictory).toHaveBeenCalledTimes(1);
      expect(presentWonderDiscovery).not.toHaveBeenCalled();
      expect(presentEventChainConclusion).not.toHaveBeenCalled();
    });

    it('blocks every further enqueue* call once victory has been shown, until clearForNewGame', () => {
      const presentWonderDiscovery = vi.fn(() => new Promise<WonderDiscoveryCeremonyAction>(() => {}));
      const presentVictory = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ presentWonderDiscovery, presentVictory }));

      coordinator.enqueueVictory(victoryOptions());
      expect(presentVictory).toHaveBeenCalledTimes(1);

      coordinator.enqueueWonderDiscovery(wonderItem());
      expect(presentWonderDiscovery).not.toHaveBeenCalled();

      coordinator.clearForNewGame();
      coordinator.enqueueWonderDiscovery(wonderItem());
      expect(presentWonderDiscovery).toHaveBeenCalledTimes(1);
    });

    it('a repeat enqueueVictory call while already presenting is a safe no-op', () => {
      // handleVictoryIfNeeded() is called from several turn-flow-controller
      // call sites and can legitimately run more than once against an
      // already-gameOver state. The dedupe key makes a second call inert
      // rather than pushing a second overlay on top of the first.
      const presentVictory = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ presentVictory }));

      coordinator.enqueueVictory(victoryOptions({ winnerName: 'Rome' }));
      coordinator.enqueueVictory(victoryOptions({ winnerName: 'Rome' }));

      expect(presentVictory).toHaveBeenCalledTimes(1);
    });

    it('clearForNewGame drops a still-queued victory so it never resurfaces in the next game', () => {
      const host = createPanelHost(document.createElement('div'));
      const presentVictory = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ host, presentVictory }));

      host.setBlockingOverlay('turn-handoff');
      coordinator.enqueueVictory(victoryOptions());
      expect(presentVictory).not.toHaveBeenCalled();

      coordinator.clearForNewGame();
      host.setBlockingOverlay(null);

      expect(presentVictory).not.toHaveBeenCalled();
    });

    it('clearForNewGame resets the terminal guard, so loading a different already-game-over save can show its own victory', () => {
      // campaign-entry-controller.ts's enterCampaign() calls startGame()
      // (which clears) immediately before handleVictoryIfNeeded() whenever
      // the state it's entering is already gameOver -- without resetting
      // `terminal`, a second game-over save loaded in the same browser tab
      // would silently never show its own victory panel.
      const presentVictory = vi.fn(() => new Promise<void>(() => {}));
      const coordinator = createCeremonyCoordinator(baseDeps({ presentVictory }));

      coordinator.enqueueVictory(victoryOptions({ winnerName: 'Rome' }));
      expect(presentVictory).toHaveBeenCalledTimes(1);

      coordinator.clearForNewGame();
      coordinator.enqueueVictory(victoryOptions({ winnerName: 'Carthage' }));

      expect(presentVictory).toHaveBeenCalledTimes(2);
      expect(presentVictory).toHaveBeenLastCalledWith(expect.objectContaining({ winnerName: 'Carthage' }));
    });
  });
});
