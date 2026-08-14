// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import * as registerAllModule from '@/presentation/register-all';
import * as minorCivListenersModule from '@/ui/minor-civ-notification-listeners';
import { bootstrap, createAppComposition, type AppServices, type AppCompositionDeps } from '@/app/bootstrap';
import type { RenderLoop } from '@/renderer/render-loop';
import type { AudioSystem } from '@/audio/audio-system';
import type { Notifier } from '@/app/ports';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import { AdvisorSystem } from '@/ui/advisor-system';
import { createGameSession } from '@/app/game-session';
import { createNewGame } from '@/core/game-state';
import { createSelectionStore } from '@/app/selection-store';
import { createUserSettingsStore } from '@/app/user-settings-store';

vi.mock('@/presentation/register-all', async () => {
  const actual = await vi.importActual<typeof registerAllModule>('@/presentation/register-all');
  return { ...actual, registerAllPresentation: vi.fn() };
});

vi.mock('@/ui/minor-civ-notification-listeners', async () => {
  const actual = await vi.importActual<typeof minorCivListenersModule>('@/ui/minor-civ-notification-listeners');
  return { ...actual, registerMinorCivNotificationListeners: vi.fn() };
});

function makeServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    bus: new EventBus(),
    presentationContext: {} as AppServices['presentationContext'],
    getState: vi.fn(),
    appendToCivLog: vi.fn(),
    gameSession: { init: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
}

describe('bootstrap', () => {
  it('registers presentation exactly once, then minor-civ listeners, then initializes the game session, in order', async () => {
    const services = makeServices();
    const order: string[] = [];
    vi.mocked(registerAllModule.registerAllPresentation).mockImplementation(() => {
      order.push('registerAllPresentation');
      return () => {};
    });
    vi.mocked(minorCivListenersModule.registerMinorCivNotificationListeners).mockImplementation(() => { order.push('registerMinorCivNotificationListeners'); });
    vi.mocked(services.gameSession.init).mockImplementation(async () => { order.push('gameSession.init'); });

    await bootstrap(services);

    expect(registerAllModule.registerAllPresentation).toHaveBeenCalledTimes(1);
    expect(registerAllModule.registerAllPresentation).toHaveBeenCalledWith(services.bus, services.presentationContext);
    expect(minorCivListenersModule.registerMinorCivNotificationListeners).toHaveBeenCalledTimes(1);
    expect(minorCivListenersModule.registerMinorCivNotificationListeners).toHaveBeenCalledWith(
      services.bus,
      services.getState,
      { appendToCivLog: services.appendToCivLog },
    );
    expect(order).toEqual(['registerAllPresentation', 'registerMinorCivNotificationListeners', 'gameSession.init']);
  });

  it('does not resolve until game session init resolves', async () => {
    const services = makeServices();
    let resolved = false;
    let releaseInit!: () => void;
    vi.mocked(services.gameSession.init).mockReturnValue(new Promise<void>(resolve => { releaseInit = resolve; }));

    const bootstrapPromise = bootstrap(services).then(() => { resolved = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    releaseInit();
    await bootstrapPromise;
    expect(resolved).toBe(true);
  });
});

// #787 phase 10b-g: createAppComposition is the composition root's
// construction-order-heavy half -- every controller main.ts used to build at
// module scope now lives here. The highest-risk regression class for a move
// like this is a wrong lazy-wrapper-vs-direct-reference call (a runtime
// `undefined` crash on first real interaction, not a type error, since most
// of these deps are same-shaped functions TypeScript can't distinguish by
// timing) -- these tests cover the one part of that risk a smoke test can
// exercise without a full playable game: that construction itself succeeds,
// returns every controller the rest of the app depends on, and that the
// `notifier` plumbing (the one piece of code this phase actually changed,
// not just relocated -- `getNotifier()`/`setNotifier` replace the bare
// `notifier` closure the pre-move code used inside one module scope) really
// does resolve through the live binding at call time rather than capturing
// `undefined` at construction time.
function makeCompositionDeps(overrides: Partial<AppCompositionDeps> = {}): AppCompositionDeps {
  document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui-layer"></div>';
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiLayer = document.getElementById('ui-layer') as HTMLDivElement;
  const bus = new EventBus();
  const renderLoop = {
    setGameState: vi.fn(),
    requestWonderDiscoveryHighlight: vi.fn(),
    applyDeliveryVisual: vi.fn(),
    applyCombatVisual: vi.fn(),
    animations: { add: vi.fn() },
    isAirDefenseOverlayEnabled: vi.fn().mockReturnValue(false),
    toggleAirDefenseOverlay: vi.fn().mockReturnValue(false),
    resizeCanvas: vi.fn(),
  } as unknown as RenderLoop;
  const audio = {
    playNaturalWonderDiscovery: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioSystem;
  let notifier: Notifier | undefined;

  return {
    canvas,
    uiLayer,
    renderLoop,
    audio,
    bus,
    roundPresentationGate: new RoundPresentationGate(),
    advisorSystem: new AdvisorSystem(bus),
    session: createGameSession(createNewGame(undefined, 'bootstrap-composition-test', 'small')),
    selection: createSelectionStore(),
    userSettingsStore: createUserSettingsStore({ load: async () => undefined }),
    getNotifier: () => notifier as Notifier,
    setNotifier: n => { notifier = n; },
    ...overrides,
  };
}

function makeFakeNotifier(): Notifier {
  return {
    toast: vi.fn(),
    deliver: vi.fn(),
    choice: vi.fn(),
    withHappenedTurn: (_turn, fn) => fn(),
  };
}

describe('createAppComposition', () => {
  it('constructs every controller without throwing', () => {
    expect(() => createAppComposition(makeCompositionDeps())).not.toThrow();
  });

  it('returns every controller the rest of the app depends on', () => {
    const composition = createAppComposition(makeCompositionDeps());

    expect(composition.selectionController).toBeDefined();
    expect(composition.playerActions).toBeDefined();
    expect(composition.turnFlow).toBeDefined();
    expect(composition.hud).toBeDefined();
    expect(composition.gameSession).toBeDefined();
    expect(composition.presentationContext).toBeDefined();
  });

  it('resolves notifier through getNotifier at call time, not at construction time', () => {
    const deps = makeCompositionDeps();
    const composition = createAppComposition(deps);

    // Not assigned yet -- mirrors real startup, where GameSessionController.init()
    // publishes the real Notifier well after every controller above is built.
    expect(composition.presentationContext.notifier).toBeUndefined();

    const fakeNotifier = makeFakeNotifier();
    deps.setNotifier(fakeNotifier);

    expect(composition.presentationContext.notifier).toBe(fakeNotifier);
  });

  it('showNotification (moved from main.ts in phase 11) reaches the real notifier once set', () => {
    // Regression guard for the #787 phase 11 relocation of `showNotification`
    // into this file -- it used to be a main.ts-local function reading a
    // bare `notifier` closure; now it reads `getNotifier()` like every other
    // notifier-dependent callback here. `presentationContext.showNotification`
    // is one of its ~8 real consumers.
    const deps = makeCompositionDeps();
    const composition = createAppComposition(deps);
    const fakeNotifier = makeFakeNotifier();
    deps.setNotifier(fakeNotifier);

    composition.presentationContext.showNotification('hello', 'success');

    expect(fakeNotifier.toast).toHaveBeenCalledWith('hello', 'success', undefined);
  });

  it('updating the session HUD subscription does not throw before or after hud construction', () => {
    // Regression guard for the #787 phase 10b-g relocation of
    // `session.subscribe(() => hud.update())` from main.ts's old (pre-`hud`)
    // subscribe site to right after `hud` is constructed in this file --
    // asserts a state commit actually reaches the returned `hud` instance.
    const deps = makeCompositionDeps();
    const composition = createAppComposition(deps);
    const updateSpy = vi.spyOn(composition.hud, 'update');

    expect(() => deps.session.commit(deps.session.getState())).not.toThrow();
    expect(updateSpy).toHaveBeenCalled();
  });
});
