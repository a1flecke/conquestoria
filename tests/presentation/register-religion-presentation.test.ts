import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerReligionPresentation } from '@/presentation/register-religion-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function civ(overrides: { knownCivilizations?: string[] } = {}) {
  return {
    knownCivilizations: [],
    diplomacy: { atWarWith: [], treaties: [] },
    visibility: { tiles: {} },
    cities: [],
    units: [],
    ...overrides,
  };
}

function city(overrides: { owner?: string; name?: string } = {}) {
  return { owner: 'p1', name: 'City', ...overrides };
}

describe('religion presentation', () => {
  it('announces a religion founding to civs who have met the founder', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        map: { tiles: {} } as never,
        cities: { 'city-a': city({ owner: 'rome', name: 'Rome' }) } as never,
        civilizations: {
          rome: civ({ knownCivilizations: [] }),
          carthage: civ({ knownCivilizations: ['rome'] }),
          egypt: civ({ knownCivilizations: [] }),
        } as never,
      },
    });

    registerReligionPresentation(bus, ctx);
    bus.emit('religion:founded', { religionId: 'sun-cult', civId: 'rome', cityId: 'city-a', name: 'Sun Cult' });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('Sun Cult'), 'success', undefined, undefined, 'religion-founded');
    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.any(String), 'success', undefined, undefined, 'religion-founded');
    expect(ctx.deliver).not.toHaveBeenCalledWith('egypt', expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });

  it('announces a city converting to a religion, notifying the founder if different', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        cities: { 'city-a': city({ owner: 'carthage', name: 'Utica' }) } as never,
        civilizations: { carthage: civ(), rome: civ({ knownCivilizations: ['carthage'] }) } as never,
        religions: { 'sun-cult': { name: 'Sun Cult', ownerCivId: 'rome' } } as never,
      },
    });

    registerReligionPresentation(bus, ctx);
    bus.emit('religion:city-converted', { cityId: 'city-a', toReligionId: 'sun-cult' });

    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.stringContaining('Sun Cult'), 'info', undefined, undefined, 'city-converted');
    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('Utica'), 'success', undefined, undefined, 'city-converted');
  });

  it('warns the pressuring civ about a loyalty threshold', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city({ name: 'Utica' }) } as never },
    });

    registerReligionPresentation(bus, ctx);
    bus.emit('religion:loyalty-warning', { cityId: 'city-a', pressuringCivId: 'rome', stage: 'final', turnsRemaining: 0 });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('Utica'), 'warning', undefined, undefined, 'loyalty-warning');
  });

  it('announces a city defecting between civs', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        cities: { 'city-a': city({ name: 'Utica' }) } as never,
        civilizations: { carthage: civ() } as never,
      },
    });

    registerReligionPresentation(bus, ctx);
    bus.emit('religion:city-defected', { cityId: 'city-a', fromCivId: 'carthage', toCivId: 'rome' });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.any(String), 'success', undefined, undefined, 'city-defected');
    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.any(String), 'warning', undefined, undefined, 'city-defected');
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city() } as never },
    });
    const dispose = registerReligionPresentation(bus, ctx);

    dispose();
    bus.emit('religion:founded', { religionId: 'sun-cult', civId: 'rome', cityId: 'city-a', name: 'Sun Cult' });
    bus.emit('religion:city-converted', { cityId: 'city-a', toReligionId: 'sun-cult' });
    bus.emit('religion:loyalty-warning', { cityId: 'city-a', pressuringCivId: 'rome', stage: 'final', turnsRemaining: 0 });
    bus.emit('religion:city-defected', { cityId: 'city-a', fromCivId: 'carthage', toCivId: 'rome' });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
