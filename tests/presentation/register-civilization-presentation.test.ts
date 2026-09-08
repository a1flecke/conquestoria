import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerCivilizationPresentation } from '@/presentation/register-civilization-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

describe('civilization presentation', () => {
  it('delivers lifecycle messages to the affected owner', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerCivilizationPresentation(bus, ctx);
    bus.emit('civ:resettlement-needed', { civId: 'p1' });
    bus.emit('civ:resettled', { civId: 'p1' });
    bus.emit('civ:eliminated', { civId: 'p1', eliminatedBy: null });

    expect(ctx.deliver).toHaveBeenNthCalledWith(
      1,
      'p1',
      'Your civilization is still in play. Found a city with a settler to rebuild.',
      'warning',
    );
    expect(ctx.deliver).toHaveBeenNthCalledWith(2, 'p1', 'Your civilization has a city again.', 'success');
    expect(ctx.deliver).toHaveBeenNthCalledWith(3, 'p1', 'Your civilization has been defeated.', 'warning');
  });

  it('gives a responsible human victor generic rival-defeat text only', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();
    const state = ctx.session.getState();
    state.map = { tiles: {} } as never;
    state.civilizations.p1 = {
      ...state.civilizations.p1,
      id: 'p1',
      isHuman: true,
      knownCivilizations: ['victor'],
      diplomacy: {} as never,
      visibility: { tiles: {} },
    };
    state.civilizations.victor = {
      ...state.civilizations.p1,
      id: 'victor',
      isHuman: true,
      knownCivilizations: ['p1'],
    };

    registerCivilizationPresentation(bus, ctx);
    bus.emit('civ:eliminated', { civId: 'p1', eliminatedBy: 'victor' });

    expect(ctx.deliver).toHaveBeenNthCalledWith(1, 'p1', 'Your civilization has been defeated.', 'warning');
    expect(ctx.deliver).toHaveBeenNthCalledWith(2, 'victor', 'A rival civilization has been defeated.', 'success');
  });

  it('does not disclose an unknown defeated civilization to a human victor', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();
    const state = ctx.session.getState();
    state.map = { tiles: {} } as never;
    state.civilizations.p1 = {
      ...state.civilizations.p1,
      knownCivilizations: [],
      diplomacy: {} as never,
      visibility: { tiles: {} },
    };
    state.civilizations.victor = {
      ...state.civilizations.p1,
      id: 'victor',
      isHuman: true,
      knownCivilizations: [],
      diplomacy: {} as never,
    };

    registerCivilizationPresentation(bus, ctx);
    bus.emit('civ:eliminated', { civId: 'p1', eliminatedBy: 'victor' });

    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    expect(ctx.deliver).toHaveBeenCalledWith('p1', 'Your civilization has been defeated.', 'warning');
  });

  it('disposes every lifecycle subscription', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();
    const dispose = registerCivilizationPresentation(bus, ctx);

    dispose();
    bus.emit('civ:resettlement-needed', { civId: 'p1' });
    bus.emit('civ:resettled', { civId: 'p1' });
    bus.emit('civ:eliminated', { civId: 'p1', eliminatedBy: null });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
