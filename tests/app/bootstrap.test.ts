// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import * as registerAllModule from '@/presentation/register-all';
import * as minorCivListenersModule from '@/ui/minor-civ-notification-listeners';
import { bootstrap, type AppServices } from '@/app/bootstrap';

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
