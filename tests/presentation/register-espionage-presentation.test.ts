import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerEspionagePresentation } from '@/presentation/register-espionage-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function spy(overrides: { name?: string; unitType?: string } = {}) {
  return { name: 'Agent X', unitType: 'spy', ...overrides };
}

describe('espionage presentation', () => {
  it('notifies the target civ (and witnesses) when a sabotage-relief attempt is discovered', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:sabotage-relief-discovered', { crisisId: 'crisis-1', actorCivId: 'rome', targetCivId: 'carthage' });

    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.any(String), 'warning');
  });

  it('notifies the detecting civ of a spotted traveling spy', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:spy-detected-traveling', {
      detectingCivId: 'rome', spyOwner: 'carthage', spyUnitId: 'unit-1', position: { q: 1, r: 2 }, wasDisguised: false,
    });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('enemy spy'), 'warning');
  });

  it('notifies the spy owner and shows the capture choice to the active human captor', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'rome' } });

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1', cityId: 'city-a' });

    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.stringContaining('caught'), 'warning');
    expect(ctx.showEspionageCaptureChoice).toHaveBeenCalledWith('spy-1', 'carthage');
  });

  it('does not show the capture choice when the captor is not the active viewer', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'egypt' } });

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1', cityId: 'city-a' });

    expect(ctx.showEspionageCaptureChoice).not.toHaveBeenCalled();
  });

  it('notifies the spy owner and shows the capture choice for an in-mission capture', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'rome',
        espionage: { carthage: { spies: { 'spy-1': spy() } } } as never,
      },
    });

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:spy-captured', { capturingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1' });

    expect(ctx.showEspionageCaptureChoice).toHaveBeenCalledWith('spy-1', 'carthage');
    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.stringContaining('Agent X'), 'warning');
  });

  it('notifies the spy owner of an execution', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:spy-executed', { executingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1', spyName: 'Agent X' });

    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.stringContaining('Agent X'), 'warning');
  });

  it('notifies a civ their spy expired with no diplomatic penalty', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:spy-expired', { civId: 'rome', spyId: 'spy-1', spyName: 'Agent X', unitType: 'spy' as never });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('Agent X'), 'info');
  });

  it('notifies a civ their spy was auto-exfiltrated', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': { name: 'Utica' } } as never } });

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:spy-auto-exfiltrated', { civId: 'rome', spyId: 'spy-1', cityId: 'city-a' });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('Utica'), 'info');
  });

  it('notifies both civs when a city flips via propaganda', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: { 'city-a': { name: 'Utica' } } as never } });

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:city-flipped', { civId: 'rome', victimCivId: 'carthage', cityId: 'city-a' });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.any(String), 'success');
    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.any(String), 'warning');
  });

  it('notifies both civs when a courier is intercepted (#442 MR1)', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': { name: 'Utica' }, 'city-b': { name: 'Carthago Nova' } } as never },
    });

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:courier-intercepted', {
      civId: 'rome', targetCivId: 'carthage', routeId: 'route-1', fromCityId: 'city-a', toCityId: 'city-b',
    });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.any(String), 'success');
    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.any(String), 'warning');
  });

  it('notifies both civs of the exact amount when an official is bribed (#442 MR1)', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerEspionagePresentation(bus, ctx);
    bus.emit('espionage:official-bribed', { civId: 'rome', targetCivId: 'carthage', amount: 42 });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('42'), 'success');
    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.stringContaining('42'), 'warning');
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { currentPlayer: 'rome', cities: { 'city-a': { name: 'Utica' } } as never },
    });
    const dispose = registerEspionagePresentation(bus, ctx);

    dispose();
    bus.emit('espionage:sabotage-relief-discovered', { crisisId: 'crisis-1', actorCivId: 'rome', targetCivId: 'carthage' });
    bus.emit('espionage:spy-detected-traveling', { detectingCivId: 'rome', spyOwner: 'carthage', spyUnitId: 'unit-1', position: { q: 1, r: 2 }, wasDisguised: false });
    bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1', cityId: 'city-a' });
    bus.emit('espionage:spy-captured', { capturingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1' });
    bus.emit('espionage:spy-executed', { executingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1', spyName: 'Agent X' });
    bus.emit('espionage:spy-expired', { civId: 'rome', spyId: 'spy-1', spyName: 'Agent X', unitType: 'spy' as never });
    bus.emit('espionage:spy-auto-exfiltrated', { civId: 'rome', spyId: 'spy-1', cityId: 'city-a' });
    bus.emit('espionage:city-flipped', { civId: 'rome', victimCivId: 'carthage', cityId: 'city-a' });
    bus.emit('espionage:courier-intercepted', { civId: 'rome', targetCivId: 'carthage', routeId: 'route-1', fromCityId: 'city-a', toCityId: 'city-a' });
    bus.emit('espionage:official-bribed', { civId: 'rome', targetCivId: 'carthage', amount: 42 });

    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.showEspionageCaptureChoice).not.toHaveBeenCalled();
  });
});
