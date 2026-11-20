import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerWorldRacePresentation } from '@/presentation/register-world-race-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

describe('world race presentation', () => {
  it('tells the civ whose launch entry a rival win cancelled, and nobody else', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        civilizations: {
          p1: { isHuman: true, name: 'Rome' },
          p2: { isHuman: true, name: 'Egypt' },
        } as never,
        cities: { c2: { id: 'c2', name: 'Thebes', owner: 'p2' } } as never,
      },
    });

    registerWorldRacePresentation(bus, ctx);
    bus.emit('worldrace:entry-mooted', { kind: 'first-satellite', civId: 'p2', cityId: 'c2', goldRefund: 190 });

    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    expect(ctx.deliver).toHaveBeenCalledWith(
      'p2',
      'The First Satellite race is over. Thebes stopped its First Satellite launch and recovered 190 gold.',
      'warning',
    );
  });

  it('disposing removes the entry-mooted subscription', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { civilizations: {} as never, cities: {} as never } });
    const dispose = registerWorldRacePresentation(bus, ctx);
    dispose?.();
    bus.emit('worldrace:entry-mooted', { kind: 'first-satellite', civId: 'p2', cityId: 'c2', goldRefund: 0 });
    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
