import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerFactionCrisisPresentation } from '@/presentation/register-faction-crisis-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function city(overrides: { name?: string; population?: number; position?: { q: number; r: number } } = {}) {
  return { name: 'Rome', population: 4, position: { q: 0, r: 0 }, ...overrides };
}

describe('faction and crisis presentation', () => {
  it('warns the owner when a city slips into unrest', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('faction:unrest-started', { cityId: 'city-a', owner: 'p1' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('unrest'), 'warning');
  });

  it('warns the owner when a city revolts', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('faction:revolt-started', { cityId: 'city-a', owner: 'p1' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('revolt'), 'warning');
  });

  it('announces a city stabilizing', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('faction:unrest-resolved', { cityId: 'city-a', owner: 'p1' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('stabilized'), 'success');
  });

  it('warns the old owner when a city breaks away', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('faction:breakaway-started', { cityId: 'city-a', oldOwner: 'p1', breakawayId: 'breakaway-1' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('broken away'), 'warning');
  });

  it('warns the origin owner when a breakaway state establishes', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('faction:breakaway-established', { civId: 'breakaway-1', originOwnerId: 'p1' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('established'), 'warning');
  });

  it('warns the owner of persistent critical status', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('faction:critical-status', { cityId: 'city-a', owner: 'p1', status: 'unrest' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('unrest'), 'warning');
  });

  it('announces a concession grant', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('faction:concession-made', { cityId: 'city-a', owner: 'p1', concessionType: 'charter' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('charter'), 'success');
  });

  it('announces a new crisis to the affected civ', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city() } as never },
    });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('crisis:started', { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', cityIds: ['city-a'] });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.any(String), 'warning', expect.anything(), undefined, undefined);
  });

  it('announces a crisis assaulting a city', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('crisis:escalated', { crisisId: 'crisis-1', stage: 'assaulting', civId: 'p1', foeName: 'The Reaper' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('The Reaper'), 'warning', undefined);
  });

  it('announces a crisis spreading to another city', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        activeCrises: { 'crisis-1': { flavorId: 'plague', targetCivId: 'p1', cityIds: ['city-a'] } } as never,
        cities: { 'city-b': city({ name: 'Utica' }) } as never,
      },
    });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('crisis:spread', { crisisId: 'crisis-1', fromCityId: 'city-a', toCityId: 'city-b' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Utica'), 'warning', expect.anything());
  });

  it('announces a crisis resolving', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('crisis:resolved', { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', outcome: 'contained' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('contained'), 'success', undefined, undefined, undefined);
  });

  it('tells a witnessing civ that an ally hunted a shared foe', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        civilizations: {
          rome: { knownCivilizations: ['carthage', 'egypt'], diplomacy: { atWarWith: [], treaties: [] }, visibility: { tiles: {} }, cities: [], units: [] },
          carthage: { knownCivilizations: ['rome', 'egypt'], diplomacy: { atWarWith: [], treaties: [] }, visibility: { tiles: {} }, cities: [], units: [] },
          egypt: { knownCivilizations: ['rome', 'carthage'], diplomacy: { atWarWith: [], treaties: [] }, visibility: { tiles: {} }, cities: [], units: [] },
        } as never,
      },
    });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('crisis:foe-hunted-by-ally', { crisisId: 'crisis-1', killerCivId: 'rome', targetCivId: 'carthage', foeName: 'The Reaper' });

    expect(ctx.deliver).toHaveBeenCalledWith('egypt', expect.stringContaining('The Reaper'), expect.any(String));
  });

  it('announces aid sent between civs', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { civilizations: { rome: {}, carthage: {} } as never },
    });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('crisis:aid-sent', { crisisId: 'crisis-1', actorCivId: 'rome', targetCivId: 'carthage', goldCost: 50 });

    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.any(String), 'success');
  });

  it('warns a civ of treasury strain', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { civilizations: { p1: {} } as never },
    });

    registerFactionCrisisPresentation(bus, ctx);
    bus.emit('economy:treasury-strain', { civId: 'p1', level: 'high', netGoldPerTurn: -5, unpaidMaintenance: 0 });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.any(String), 'warning');
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        cities: { 'city-a': city() } as never,
        civilizations: { p1: {}, rome: {}, carthage: {} } as never,
      },
    });
    const dispose = registerFactionCrisisPresentation(bus, ctx);

    dispose();
    bus.emit('faction:unrest-started', { cityId: 'city-a', owner: 'p1' });
    bus.emit('faction:revolt-started', { cityId: 'city-a', owner: 'p1' });
    bus.emit('faction:unrest-resolved', { cityId: 'city-a', owner: 'p1' });
    bus.emit('faction:breakaway-started', { cityId: 'city-a', oldOwner: 'p1', breakawayId: 'breakaway-1' });
    bus.emit('faction:breakaway-established', { civId: 'breakaway-1', originOwnerId: 'p1' });
    bus.emit('faction:critical-status', { cityId: 'city-a', owner: 'p1', status: 'unrest' });
    bus.emit('faction:concession-made', { cityId: 'city-a', owner: 'p1', concessionType: 'charter' });
    bus.emit('crisis:started', { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', cityIds: ['city-a'] });
    bus.emit('crisis:escalated', { crisisId: 'crisis-1', stage: 'assaulting', civId: 'p1', foeName: 'The Reaper' });
    bus.emit('crisis:spread', { crisisId: 'crisis-1', fromCityId: 'city-a', toCityId: 'city-a' });
    bus.emit('crisis:resolved', { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', outcome: 'contained' });
    bus.emit('crisis:foe-hunted-by-ally', { crisisId: 'crisis-1', killerCivId: 'rome', targetCivId: 'carthage', foeName: 'The Reaper' });
    bus.emit('crisis:aid-sent', { crisisId: 'crisis-1', actorCivId: 'rome', targetCivId: 'carthage', goldCost: 50 });
    bus.emit('economy:treasury-strain', { civId: 'p1', level: 'high', netGoldPerTurn: -5, unpaidMaintenance: 0 });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
