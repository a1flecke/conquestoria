// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { SFX } from '@/audio/sfx';
import { registerCityPresentation } from '@/presentation/register-city-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function city(overrides: { owner?: string; name?: string } = {}) {
  return { owner: 'p1', name: 'Rome', ...overrides };
}

describe('city presentation', () => {
  it('announces completed research, with a bonus fishing tip, gated to the active viewer for the SFX cue', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'p1' } });
    const research = vi.spyOn(SFX, 'research').mockImplementation(() => {});

    registerCityPresentation(bus, ctx);
    bus.emit('tech:completed', { civId: 'p1', techId: 'fishing' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Research complete'), 'success');
    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Dock'), 'info');
    expect(research).toHaveBeenCalledTimes(1);

    research.mockRestore();
  });

  it('uses the technology display name, not the raw id, in the completion notice', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'p1' } });
    vi.spyOn(SFX, 'research').mockImplementation(() => {});

    registerCityPresentation(bus, ctx);
    bus.emit('tech:completed', { civId: 'p1', techId: 'bronze-working' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Bronze Working'), 'success');
    expect(ctx.deliver).not.toHaveBeenCalledWith('p1', expect.stringContaining('bronze-working'), 'success');
    vi.restoreAllMocks();
  });

  it('names the carried-over science and its successor when queue overflow occurred (MR4, #917)', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'p1' } });
    vi.spyOn(SFX, 'research').mockImplementation(() => {});

    registerCityPresentation(bus, ctx);
    bus.emit('tech:completed', { civId: 'p1', techId: 'fire', carriedProgress: 8, carriedIntoTechId: 'writing' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('+8 science carried into Writing'), 'success');
    vi.restoreAllMocks();
  });

  it('adds no carry clause when the completion carried nothing', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'p1' } });
    vi.spyOn(SFX, 'research').mockImplementation(() => {});

    registerCityPresentation(bus, ctx);
    bus.emit('tech:completed', { civId: 'p1', techId: 'fire', carriedProgress: 0, carriedIntoTechId: null });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.not.stringContaining('carried'), 'success');
    vi.restoreAllMocks();
  });

  it('does not play the research cue for a non-active civ', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'p2' } });
    const research = vi.spyOn(SFX, 'research').mockImplementation(() => {});

    registerCityPresentation(bus, ctx);
    bus.emit('tech:completed', { civId: 'p1', techId: 'bronze-working' });

    expect(research).not.toHaveBeenCalled();
    research.mockRestore();
  });

  it('announces city growth', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });

    registerCityPresentation(bus, ctx);
    bus.emit('city:grew', { cityId: 'city-a', newPopulation: 5 });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('5'), 'success');
  });

  it('announces a maturity upgrade', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });

    registerCityPresentation(bus, ctx);
    bus.emit('city:maturity-upgraded', { cityId: 'city-a', previous: 'town', current: 'city' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('City'), 'success');
  });

  it('announces a completed building and plays the national-project SFX only for national projects', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });
    const npBuilt = vi.spyOn(SFX, 'nationalProjectBuilt').mockImplementation(() => {});

    registerCityPresentation(bus, ctx);
    bus.emit('city:building-complete', { cityId: 'city-a', buildingId: 'granary' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('completed'), 'success');
    expect(npBuilt).not.toHaveBeenCalled();
    npBuilt.mockRestore();
  });

  it('announces an expired national project and plays its SFX', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });
    const npExpired = vi.spyOn(SFX, 'nationalProjectExpired').mockImplementation(() => {});

    registerCityPresentation(bus, ctx);
    bus.emit('city:national-project-expired', { civId: 'p1', cityId: 'city-a', buildingId: 'grand_bazaar' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('expired'), 'warning');
    expect(npExpired).toHaveBeenCalledTimes(1);
    npExpired.mockRestore();
  });

  it('announces a dropped production item', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });

    registerCityPresentation(bus, ctx);
    bus.emit('city:production-item-dropped', { cityId: 'city-a', itemId: 'granary', itemKind: 'building', reason: 'obsoleted' });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.any(String), 'warning');
  });

  it('announces a territory tile flipping ownership', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { civilizations: { p1: {}, p2: {} } as never },
    });

    registerCityPresentation(bus, ctx);
    bus.emit('territory:tile-flipped', {
      coord: { q: 0, r: 0 },
      previousOwner: 'p2',
      newOwner: 'p1',
      improvement: 'farm',
      constructionCancelled: false,
    });

    expect(ctx.deliver).toHaveBeenCalled();
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': city() } as never } });
    const dispose = registerCityPresentation(bus, ctx);

    dispose();
    bus.emit('tech:completed', { civId: 'p1', techId: 'fishing' });
    bus.emit('city:grew', { cityId: 'city-a', newPopulation: 5 });
    bus.emit('city:maturity-upgraded', { cityId: 'city-a', previous: 'town', current: 'city' });
    bus.emit('city:building-complete', { cityId: 'city-a', buildingId: 'granary' });
    bus.emit('city:national-project-expired', { civId: 'p1', cityId: 'city-a', buildingId: 'grand_bazaar' });
    bus.emit('city:production-item-dropped', { cityId: 'city-a', itemId: 'granary', itemKind: 'building', reason: 'obsoleted' });
    bus.emit('territory:tile-flipped', { coord: { q: 0, r: 0 }, previousOwner: 'p2', newOwner: 'p1', improvement: 'farm', constructionCancelled: false });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
