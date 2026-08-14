import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerRaiderPresentation } from '@/presentation/register-raider-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function city(overrides: { owner?: string; name?: string } = {}) {
  return { owner: 'p1', name: 'Rome', ...overrides };
}

function humanCiv() {
  return { isHuman: true };
}

describe('raider presentation', () => {
  it('notifies a civ the first time it sees a raider from a given camp, and not again for the same camp', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        units: { 'unit-1': { position: { q: 0, r: 0 } } } as never,
        civilizations: { p1: { visibility: { tiles: { '0,0': 'visible' } } } } as never,
      },
    });

    registerRaiderPresentation(bus, ctx);
    bus.emit('barbarian:spawned', { campId: 'camp-1', unitId: 'unit-1' });
    bus.emit('barbarian:spawned', { campId: 'camp-1', unitId: 'unit-1' });

    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('spotted'), 'warning', expect.anything());
  });

  it('warns a civ of ordinary barbarian resurgence', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerRaiderPresentation(bus, ctx);
    bus.emit('threat:barbarian-resurgence', { civId: 'p1', landmassId: 'l1', campId: 'camp-1', position: { q: 0, r: 0 }, isBanditLord: false });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('resurgent'), 'warning');
  });

  it('names the bandit lord when one has united the raiders', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerRaiderPresentation(bus, ctx);
    bus.emit('threat:barbarian-resurgence', {
      civId: 'p1', landmassId: 'l1', campId: 'camp-1', position: { q: 0, r: 0 }, isBanditLord: true, banditLordName: 'Attila',
    });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Attila'), 'warning');
  });

  it('warns a human city owner of a barbarian attack', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city() } as never, civilizations: { p1: humanCiv() } as never },
    });

    registerRaiderPresentation(bus, ctx);
    bus.emit('barbarian:city-attacked', { attackerUnitId: 'unit-1', cityId: 'city-a', hpLost: 10 });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Rome'), 'warning');
  });

  it('does not notify a non-human city owner of a barbarian attack', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city() } as never, civilizations: { p1: { isHuman: false } } as never },
    });

    registerRaiderPresentation(bus, ctx);
    bus.emit('barbarian:city-attacked', { attackerUnitId: 'unit-1', cityId: 'city-a', hpLost: 10 });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });

  it('warns a human civ their city was destroyed by barbarians', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city() } as never, civilizations: { p1: humanCiv() } as never },
    });

    registerRaiderPresentation(bus, ctx);
    bus.emit('barbarian:city-destroyed', { attackerUnitId: 'unit-1', cityId: 'city-a', ownerId: 'p1' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('destroyed'), 'warning');
  });

  it('warns a human civ their city was razed by pirates', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city() } as never, civilizations: { p1: humanCiv() } as never },
    });

    registerRaiderPresentation(bus, ctx);
    bus.emit('pirate:city-destroyed', { cityId: 'city-a', ownerId: 'p1', factionId: 'faction-1' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('razed'), 'warning');
  });

  it('announces successful counter-fire against a barbarian raider', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city() } as never, civilizations: { p1: humanCiv() } as never },
    });

    registerRaiderPresentation(bus, ctx);
    bus.emit('city:counter-fire', { cityId: 'city-a', attackerUnitId: 'unit-1', source: 'barbarian', damage: 5, attackerDied: true });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('raider'), 'success');
  });

  it('announces inconclusive counter-fire against a pirate ship', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city() } as never, civilizations: { p1: humanCiv() } as never },
    });

    registerRaiderPresentation(bus, ctx);
    bus.emit('city:counter-fire', { cityId: 'city-a', attackerUnitId: 'unit-1', source: 'pirate', damage: 5, attackerDied: false });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('ship'), 'info');
  });

  it('delivers Coastal Battery feedback to its explicit hot-seat owner, not the currently rendered city owner', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        cities: { 'city-a': city({ owner: 'p2', name: 'Other Rome' }) } as never,
        civilizations: { p1: humanCiv(), p2: humanCiv() } as never,
      },
    });

    registerRaiderPresentation(bus, ctx);
    bus.emit('city:coastal-battery-fired', {
      cityId: 'city-a', attackerUnitId: 'unit-1', recipientCivId: 'p1', source: 'pirate', damage: 5, attackerDied: false,
    });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Coastal Battery'), 'info');
    expect(ctx.deliver).not.toHaveBeenCalledWith('p2', expect.anything(), expect.anything());
  });

  it('announces a barbarian sacking, distinct from destruction', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': city() } as never, civilizations: { p1: humanCiv() } as never },
    });

    registerRaiderPresentation(bus, ctx);
    bus.emit('city:sacked', { cityId: 'city-a', source: 'barbarian', goldLost: 30 });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('1 HP'), 'warning');
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        units: { 'unit-1': { position: { q: 0, r: 0 } } } as never,
        cities: { 'city-a': city() } as never,
        civilizations: { p1: { ...humanCiv(), visibility: { tiles: { '0,0': 'visible' } } } } as never,
      },
    });
    const dispose = registerRaiderPresentation(bus, ctx);

    dispose();
    bus.emit('barbarian:spawned', { campId: 'camp-1', unitId: 'unit-1' });
    bus.emit('threat:barbarian-resurgence', { civId: 'p1', landmassId: 'l1', campId: 'camp-1', position: { q: 0, r: 0 }, isBanditLord: false });
    bus.emit('barbarian:city-attacked', { attackerUnitId: 'unit-1', cityId: 'city-a', hpLost: 10 });
    bus.emit('barbarian:city-destroyed', { attackerUnitId: 'unit-1', cityId: 'city-a', ownerId: 'p1' });
    bus.emit('pirate:city-destroyed', { cityId: 'city-a', ownerId: 'p1', factionId: 'faction-1' });
    bus.emit('city:counter-fire', { cityId: 'city-a', attackerUnitId: 'unit-1', source: 'barbarian', damage: 5, attackerDied: true });
    bus.emit('city:sacked', { cityId: 'city-a', source: 'barbarian', goldLost: 30 });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
