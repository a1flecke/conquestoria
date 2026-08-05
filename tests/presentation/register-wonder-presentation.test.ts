import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerWonderPresentation } from '@/presentation/register-wonder-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

describe('wonder presentation', () => {
  it('logs a first discovery and enqueues the ceremony reveal', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'player',
        wonderDiscoverers: { great_volcano: ['player'] } as never,
        civilizations: { player: { isHuman: true } } as never,
      },
    });

    registerWonderPresentation(bus, ctx);
    bus.emit('wonder:discovered', {
      civId: 'player',
      wonderId: 'great_volcano',
      position: { q: 0, r: 0 },
      isFirstDiscoverer: true,
    });

    expect(ctx.deliver).toHaveBeenCalledWith('player', expect.stringContaining('Discovered'), 'success');
    expect(ctx.ceremonies.enqueueWonderDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({ wonderId: 'great_volcano', civId: 'player' }),
    );
  });

  it('logs a later discovery without re-enqueuing the ceremony for a non-viewer', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { currentPlayer: 'other', wonderDiscoverers: {} as never },
    });

    registerWonderPresentation(bus, ctx);
    bus.emit('wonder:discovered', {
      civId: 'player',
      wonderId: 'great_volcano',
      position: { q: 0, r: 0 },
      isFirstDiscoverer: false,
    });

    expect(ctx.deliver).toHaveBeenCalledWith('player', expect.stringContaining('Found'), 'info');
    expect(ctx.ceremonies.enqueueWonderDiscovery).not.toHaveBeenCalled();
  });

  it('notifies the builder a legendary wonder is ready to start', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': { name: 'Rome' } } as never },
    });

    registerWonderPresentation(bus, ctx);
    bus.emit('wonder:legendary-ready', { civId: 'rome', cityId: 'city-a', wonderId: 'oracle-of-delphi' });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('Rome'), 'info');
  });

  it('notifies the recipient of a legendary availability change', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerWonderPresentation(bus, ctx);
    bus.emit('wonder:legendary-availability', { recipientCivId: 'rome', wonderId: 'oracle-of-delphi', status: 'buildable', cityActions: [] });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('ready to build'), 'info', undefined, []);
  });

  it('notifies the builder of a legendary completion and enqueues the ceremony', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'rome',
        cities: { 'city-a': { name: 'Rome', owner: 'rome' } } as never,
        civilizations: { rome: {} } as never,
      },
    });

    registerWonderPresentation(bus, ctx);
    bus.emit('wonder:legendary-completed', { civId: 'rome', cityId: 'city-a', wonderId: 'oracle-of-delphi', turnCompleted: 42 });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('completed'), 'success');
    expect(ctx.ceremonies.enqueueLegendaryCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ civId: 'rome', wonderId: 'oracle-of-delphi', turnCompleted: 42 }),
    );
  });

  it('notifies the civ a legendary wonder was lost', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': { name: 'Rome' } } as never },
    });

    registerWonderPresentation(bus, ctx);
    bus.emit('wonder:legendary-lost', { civId: 'rome', cityId: 'city-a', wonderId: 'oracle-of-delphi', goldRefund: 20, transferableProduction: 5 });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('abandoned'), 'warning');
  });

  it('notifies the observer of a revealed legendary wonder race', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': { name: 'Rome' } } as never },
    });

    registerWonderPresentation(bus, ctx);
    bus.emit('wonder:legendary-race-revealed', { observerId: 'egypt', civId: 'rome', cityId: 'city-a', wonderId: 'oracle-of-delphi' });

    expect(ctx.deliver).toHaveBeenCalledWith('egypt', expect.stringContaining('Spy report'), 'info');
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { 'city-a': { name: 'Rome' } } as never },
    });
    const dispose = registerWonderPresentation(bus, ctx);

    dispose();
    bus.emit('wonder:discovered', { civId: 'player', wonderId: 'great_volcano', position: { q: 0, r: 0 }, isFirstDiscoverer: true });
    bus.emit('wonder:legendary-ready', { civId: 'rome', cityId: 'city-a', wonderId: 'oracle-of-delphi' });
    bus.emit('wonder:legendary-availability', { recipientCivId: 'rome', wonderId: 'oracle-of-delphi', status: 'buildable', cityActions: [] });
    bus.emit('wonder:legendary-completed', { civId: 'rome', cityId: 'city-a', wonderId: 'oracle-of-delphi', turnCompleted: 42 });
    bus.emit('wonder:legendary-lost', { civId: 'rome', cityId: 'city-a', wonderId: 'oracle-of-delphi', goldRefund: 20, transferableProduction: 5 });
    bus.emit('wonder:legendary-race-revealed', { observerId: 'egypt', civId: 'rome', cityId: 'city-a', wonderId: 'oracle-of-delphi' });

    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.ceremonies.enqueueWonderDiscovery).not.toHaveBeenCalled();
    expect(ctx.ceremonies.enqueueLegendaryCompletion).not.toHaveBeenCalled();
  });
});
