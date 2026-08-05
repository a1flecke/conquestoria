import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { SFX } from '@/audio/sfx';
import { registerEraPresentation } from '@/presentation/register-era-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function civ(overrides: { isHuman?: boolean; name?: string } = {}) {
  return { isHuman: true, name: 'Civ', ...overrides };
}

describe('era presentation', () => {
  it('delivers a world-era announcement to every human civ only', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        civilizations: {
          p1: civ({ name: 'Rome' }),
          ai1: civ({ isHuman: false, name: 'Carthage' }),
        } as never,
      },
    });

    registerEraPresentation(bus, ctx);
    bus.emit('era:advanced', { era: 3 });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.any(String), expect.any(String));
    expect(ctx.deliver).not.toHaveBeenCalledWith('ai1', expect.anything(), expect.anything());
  });

  it('announces a civ entering a new personal era, only for human civs', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        civilizations: {
          p1: civ({ name: 'Rome' }),
          ai1: civ({ isHuman: false, name: 'Carthage' }),
        } as never,
      },
    });

    registerEraPresentation(bus, ctx);
    bus.emit('civilization:era-advanced', { civId: 'ai1', previousEra: 2, era: 3 });
    expect(ctx.deliver).not.toHaveBeenCalled();

    bus.emit('civilization:era-advanced', { civId: 'p1', previousEra: 2, era: 3 });
    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Era 3'), 'success');
  });

  it('plays the era-advanced notification cue only for the active viewer', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        civilizations: { p1: civ({ name: 'Rome' }), p2: civ({ name: 'Egypt' }) } as never,
      },
    });
    const notification = vi.spyOn(SFX, 'notification').mockImplementation(() => {});

    registerEraPresentation(bus, ctx);
    bus.emit('civilization:era-advanced', { civId: 'p2', previousEra: 2, era: 3 });
    expect(notification).not.toHaveBeenCalled();

    bus.emit('civilization:era-advanced', { civId: 'p1', previousEra: 2, era: 3 });
    expect(notification).toHaveBeenCalledTimes(1);

    notification.mockRestore();
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { civilizations: { p1: civ() } as never },
    });
    const dispose = registerEraPresentation(bus, ctx);

    dispose();
    bus.emit('era:advanced', { era: 3 });
    bus.emit('civilization:era-advanced', { civId: 'p1', previousEra: 2, era: 3 });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
