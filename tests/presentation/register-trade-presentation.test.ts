import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerTradePresentation } from '@/presentation/register-trade-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function city(overrides: { owner?: string; name?: string } = {}) {
  return { owner: 'p1', name: 'City', position: { q: 0, r: 0 }, ...overrides };
}

const emptyMap = { width: 10, wrapsHorizontally: false, tiles: {} };

describe('trade presentation', () => {
  it('applies the delivery visual for a delivered caravan', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerTradePresentation(bus, ctx);
    bus.emit('trade:route-delivered', { unitId: 'caravan-1', routeId: 'route-1', toCityId: 'city-1' });

    expect(ctx.requestDeliveryVisual).toHaveBeenCalledWith('caravan-1');
  });

  it('announces a new trade route to the owning civ', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        map: emptyMap as never,
        cities: { 'city-a': city({ owner: 'p1' }), 'city-b': city({ owner: 'p2', name: 'Carthage' }) } as never,
      },
    });

    registerTradePresentation(bus, ctx);
    bus.emit('trade:route-created', {
      route: { fromCityId: 'city-a', toCityId: 'city-b', goldPerTrip: 10, turnsPerTrip: 2 } as never,
    });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Carthage'), 'success');
  });

  it('announces a route ending to the owning civ', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        cities: { 'city-a': city({ owner: 'p1' }), 'city-b': city({ owner: 'p2', name: 'Carthage' }) } as never,
      },
    });

    registerTradePresentation(bus, ctx);
    bus.emit('trade:route-ended', { routeId: 'route-1', fromCityId: 'city-a', toCityId: 'city-b', reason: 'unit-died' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('destroyed'), 'warning');
  });

  it('also tells the other end of the route when it belongs to a different human civ', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        cities: { 'city-a': city({ owner: 'p1', name: 'Rome' }), 'city-b': city({ owner: 'p2', name: 'Carthage' }) } as never,
        civilizations: { p1: { isHuman: true }, p2: { isHuman: true } } as never,
      },
    });

    registerTradePresentation(bus, ctx);
    bus.emit('trade:route-ended', { routeId: 'route-1', fromCityId: 'city-a', toCityId: 'city-b', reason: 'embargo' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.any(String), 'warning');
    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('Rome'), 'warning');
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city({ owner: 'p1' }) } as never },
    });
    const dispose = registerTradePresentation(bus, ctx);

    dispose();
    bus.emit('trade:route-delivered', { unitId: 'caravan-1', routeId: 'route-1', toCityId: 'city-1' });
    bus.emit('trade:route-created', { route: { fromCityId: 'city-a', toCityId: 'city-a', goldPerTurn: 1 } as never });
    bus.emit('trade:route-ended', { routeId: 'route-1', fromCityId: 'city-a', toCityId: 'city-a', reason: 'unit-died' });

    expect(ctx.requestDeliveryVisual).not.toHaveBeenCalled();
    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
