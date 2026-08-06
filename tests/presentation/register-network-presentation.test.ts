import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerNetworkPresentation } from '@/presentation/register-network-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

describe('network presentation', () => {
  it('notifies both sides of a blocked cyber-drain attempt', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerNetworkPresentation(bus, ctx);
    bus.emit('city:cyber-drained', {
      cityId: 'city-a',
      cityName: 'Utica',
      drainerOwner: 'ai-1',
      drainerUnitId: 'unit-1',
      goldLost: 0,
      blocked: true,
      victimCivId: 'p1',
    });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('blocked'), 'success');
    expect(ctx.deliver).toHaveBeenCalledWith('ai-1', expect.any(String), 'warning');
  });

  it('notifies both sides of a successful cyber-drain', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerNetworkPresentation(bus, ctx);
    bus.emit('city:cyber-drained', {
      cityId: 'city-a',
      cityName: 'Utica',
      drainerOwner: 'ai-1',
      drainerUnitId: 'unit-1',
      goldLost: 5,
      blocked: false,
      victimCivId: 'p1',
    });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('5 gold'), 'warning');
    expect(ctx.deliver).toHaveBeenCalledWith('ai-1', expect.any(String), 'success');
  });

  it('warns the target civ of an impending exploit and emits the hostile-warning audio cue', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        autonomyByCiv: {
          'ai-1': {
            plans: { 'plan-1': { definitionId: 'exploit', target: { kind: 'city', cityId: 'city-a' } } },
            detections: {},
          },
        } as never,
        cities: { 'city-a': { name: 'Utica', position: { q: 0, r: 0 }, owner: 'p1' } } as never,
      },
    });

    registerNetworkPresentation(bus, ctx);
    bus.emit('network:exploit-warning', { planId: 'plan-1', victimCivId: 'p1', cityId: 'city-a' });

    expect(ctx.deliver).toHaveBeenCalledWith(
      'p1',
      expect.stringContaining('Utica'),
      'warning',
      expect.objectContaining({ kind: 'map' }),
    );
  });

  it('notifies both sides when an exploit resolves and emits the hostile-consequence audio cue', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': { name: 'Utica', owner: 'p1' } } as never },
    });

    registerNetworkPresentation(bus, ctx);
    bus.emit('network:exploit-resolved', { planId: 'plan-1', cityId: 'city-a', ownerCivId: 'ai-1', goldTransferred: 5, delayed: false });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('5 gold'), 'warning');
    expect(ctx.deliver).toHaveBeenCalledWith('ai-1', expect.any(String), 'success');
  });

  it('announces a constructive-resolution and a recovery audio cue', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerNetworkPresentation(bus, ctx);
    bus.emit('network:audio-cue', { cue: 'constructive-resolution', viewerIds: ['p1'] });
    bus.emit('network:audio-cue', { cue: 'recovery', viewerIds: ['p1'] });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('milestone'), 'success');
    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('recovery'), 'success');
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': { name: 'Utica', owner: 'p1' } } as never },
    });
    const dispose = registerNetworkPresentation(bus, ctx);

    dispose();
    bus.emit('city:cyber-drained', { cityId: 'city-a', cityName: 'Utica', drainerOwner: 'ai-1', drainerUnitId: 'u1', goldLost: 1, blocked: false, victimCivId: 'p1' });
    bus.emit('network:exploit-warning', { planId: 'plan-1', victimCivId: 'p1', cityId: 'city-a' });
    bus.emit('network:exploit-resolved', { planId: 'plan-1', cityId: 'city-a', ownerCivId: 'ai-1', goldTransferred: 5, delayed: false });
    bus.emit('network:audio-cue', { cue: 'recovery', viewerIds: ['p1'] });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
