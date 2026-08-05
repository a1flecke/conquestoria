import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerCombatPresentation } from '@/presentation/register-combat-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function combatResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    attackerId: 'attacker-1',
    defenderId: 'defender-1',
    attackerDamage: 10,
    defenderDamage: 20,
    attackerSurvived: true,
    defenderSurvived: false,
    attackerStrength: 5,
    defenderStrength: 3,
    attackerPosition: { q: 0, r: 0 },
    defenderPosition: { q: 1, r: 0 },
    ...overrides,
  };
}

describe('combat presentation', () => {
  it('applies the combat visual only for a viewer who can see it and presentation is not suppressed', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'p1' } });

    registerCombatPresentation(bus, ctx);
    bus.emit('combat:resolved', {
      result: combatResult() as never,
      visibleToViewerIds: ['p1'],
      attackerType: 'warrior' as never,
      defenderType: 'warrior' as never,
      attackerOwnerId: 'p1',
      defenderOwnerId: 'p2',
    });

    expect(ctx.applyCombatVisual).toHaveBeenCalledTimes(1);
    expect(ctx.deliver).toHaveBeenCalled();
  });

  it('does not apply the combat visual for a viewer who cannot see it', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'p1' } });

    registerCombatPresentation(bus, ctx);
    bus.emit('combat:resolved', {
      result: combatResult() as never,
      visibleToViewerIds: ['p2'],
      attackerType: 'warrior' as never,
      defenderType: 'warrior' as never,
      attackerOwnerId: 'p1',
      defenderOwnerId: 'p2',
    });

    expect(ctx.applyCombatVisual).not.toHaveBeenCalled();
  });

  it('does not apply the combat visual while presentation is suppressed', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { currentPlayer: 'p1' } });
    Object.assign(ctx, { isPresentationSuppressed: () => true });

    registerCombatPresentation(bus, ctx);
    bus.emit('combat:resolved', {
      result: combatResult() as never,
      visibleToViewerIds: ['p1'],
      attackerType: 'warrior' as never,
      defenderType: 'warrior' as never,
      attackerOwnerId: 'p1',
      defenderOwnerId: 'p2',
    });

    expect(ctx.applyCombatVisual).not.toHaveBeenCalled();
  });

  it('announces a combat reward to its recipient', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerCombatPresentation(bus, ctx);
    bus.emit('combat:reward-earned', { reward: { recipientCivId: 'p1', message: 'You gained veterancy!' } as never });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', 'You gained veterancy!', 'success');
  });

  it('notifies a civ their unit is now obsolete', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerCombatPresentation(bus, ctx);
    bus.emit('unit:obsolete', { civId: 'p1', unitId: 'unit-1', unitType: 'warrior' as never });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('obsolete'), 'info');
  });

  it("notifies a unit's actual owner when its journey is blocked", () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { units: { 'unit-1': { owner: 'p1', type: 'warrior' } } as never },
    });

    registerCombatPresentation(bus, ctx);
    bus.emit('unit:journey-blocked', { unitId: 'unit-1', position: { q: 2, r: 3 } });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('blocked'), 'warning');
  });

  it('does nothing for a journey-blocked event on a unit that no longer exists', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { units: {} as never } });

    registerCombatPresentation(bus, ctx);
    bus.emit('unit:journey-blocked', { unitId: 'gone', position: { q: 2, r: 3 } });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { currentPlayer: 'p1', units: { 'unit-1': { owner: 'p1', type: 'warrior' } } as never },
    });
    const dispose = registerCombatPresentation(bus, ctx);

    dispose();
    bus.emit('combat:resolved', {
      result: combatResult() as never,
      visibleToViewerIds: ['p1'],
      attackerType: 'warrior' as never,
      defenderType: 'warrior' as never,
      attackerOwnerId: 'p1',
      defenderOwnerId: 'p2',
    });
    bus.emit('combat:reward-earned', { reward: { recipientCivId: 'p1', message: 'reward' } as never });
    bus.emit('unit:obsolete', { civId: 'p1', unitId: 'unit-1', unitType: 'warrior' as never });
    bus.emit('unit:journey-blocked', { unitId: 'unit-1', position: { q: 2, r: 3 } });

    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.applyCombatVisual).not.toHaveBeenCalled();
  });
});
