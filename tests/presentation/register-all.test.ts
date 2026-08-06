import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerAllPresentation } from '@/presentation/register-all';
import { makePresentationContext } from '../helpers/presentation-context';

describe('registerAllPresentation', () => {
  it('installs every registrar exactly once and disposes them all together', () => {
    // unit:obsolete's route is a single sink() call, unlike e.g.
    // diplomacy:war-declared (which legitimately notifies both sides) --
    // picked deliberately so a double-registration bug shows up as 2 calls,
    // not as an already-expected 2.
    const bus = new EventBus();
    const ctx = makePresentationContext();

    const dispose = registerAllPresentation(bus, ctx);
    bus.emit('unit:obsolete', { civId: 'p1', unitId: 'unit-1', unitType: 'warrior' as never });
    expect(ctx.deliver).toHaveBeenCalledTimes(1);

    dispose();
    bus.emit('unit:obsolete', { civId: 'p1', unitId: 'unit-1', unitType: 'warrior' as never });
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  it('wires the last-added registrar too, not just the first (guards an off-by-one composition bug)', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerAllPresentation(bus, ctx);
    bus.emit('village:visited', { civId: 'p1', position: { q: 0, r: 0 }, outcome: 'gold', message: 'Found gold!' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', 'Found gold!', 'success');
  });

  it('wires a registrar from the middle of the list too', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerAllPresentation(bus, ctx);
    bus.emit('espionage:spy-executed', { executingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1', spyName: 'Agent X' });

    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.stringContaining('Agent X'), 'warning');
  });

  it('disposing stops every registrar, not just some', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();
    const dispose = registerAllPresentation(bus, ctx);

    dispose();
    bus.emit('village:visited', { civId: 'p1', position: { q: 0, r: 0 }, outcome: 'gold', message: 'Found gold!' });
    bus.emit('espionage:spy-executed', { executingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1', spyName: 'Agent X' });
    bus.emit('trade:route-delivered', { unitId: 'unit-1', routeId: 'route-1', toCityId: 'city-1' });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
