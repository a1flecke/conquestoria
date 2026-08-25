import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerStrategicStrikePresentation } from '@/presentation/register-strategic-strike-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

describe('strategic strike presentation (#545 MR4)', () => {
  it('notifies the defending civ that its city was struck, including the gold lost', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { target: { name: 'Rome', owner: 'p2' } } as never },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p2', goldLost: 150 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('Rome'), 'warning');
    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('150'), 'warning');
  });

  it('omits the gold-loss clause when nothing was lost (garrisoned target)', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { target: { name: 'Rome', owner: 'p2' } } as never },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p2', goldLost: 0 });

    const [, message] = (ctx.deliver as any).mock.calls[0];
    expect(message).not.toContain('gold');
  });

  it('handles an unknown city name gracefully', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: {} as never } });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'nope', recipientCivId: 'p2', goldLost: 0 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.any(String), 'warning');
  });
});
