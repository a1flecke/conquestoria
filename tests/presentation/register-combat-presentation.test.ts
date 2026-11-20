import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { generateSummary, clearEventsForPlayer } from '@/core/hotseat-events';
import { registerCombatPresentation } from '@/presentation/register-combat-presentation';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { resolveCombat } from '@/systems/combat-system';
import { createEspionageCivState, createSpyFromUnit, setDisguise } from '@/systems/espionage-system';
import { projectUnitForPlayer } from '@/systems/espionage-stealth';
import { createUnit } from '@/systems/unit-lifecycle';
import { buildCombatPresentation, buildCombatSpyIdentifications } from '@/systems/viewer-event-presentation';
import { createNotificationDelivery } from '@/ui/notification-delivery';
import { makePresentationContext } from '../helpers/presentation-context';
import { AI_A, createTwoViewerWorld, HUMAN_A, HUMAN_B, setTileVisibility } from '../helpers/viewer-knowledge-fixtures';
import { expectHotSeatDifferential } from '../helpers/viewer-safety';

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
  it.each(['attacker', 'defender'] as const)('reports the surviving disguised %s only to the opposing hot-seat participant', spyRole => {
    const state = createTwoViewerWorld('post-combat-disguise');
    const spy = createUnit('spy_scout', AI_A, { q: 2, r: 2 }, state.idCounters);
    const opponent = createUnit('warrior', HUMAN_B, { q: 3, r: 2 }, state.idCounters);
    state.map.tiles['2,2']!.terrain = 'plains';
    state.map.tiles['3,2']!.terrain = 'plains';
    state.units = { ...state.units, [spy.id]: spy, [opponent.id]: opponent };
    state.civilizations[AI_A]!.units.push(spy.id);
    state.civilizations[HUMAN_B]!.units.push(opponent.id);
    setTileVisibility(state, HUMAN_A, spy.position, 'visible');
    const record = createSpyFromUnit(createEspionageCivState(), spy.id, AI_A, 'spy_scout', 'post-combat-disguise');
    state.espionage = { [AI_A]: setDisguise(record.state, spy.id, 'barbarian') };
    const before = structuredClone(state);
    const [attacker, defender] = spyRole === 'attacker' ? [spy, opponent] : [opponent, spy];
    const seed = 46;
    expect(projectUnitForPlayer(spy, state, HUMAN_B)).toMatchObject({ type: 'warrior', owner: 'barbarian' });
    const result = resolveCombat(attacker, defender, state.map, seed);
    expect(result.exchange).toBeUndefined();
    const toast = vi.fn();
    const notifications = (world: typeof state, viewerId: string) => ({
      log: world.notificationLog?.[viewerId] ?? [],
      handoff: generateSummary(world, viewerId).events,
    });
    const bus = new EventBus();
    const presentation = buildCombatPresentation(state, result, attacker, defender);
    expect(presentation.visibleToViewerIds).toContain(HUMAN_A);
    const applied = applyCombatOutcomeToState(state, result, seed, bus);
    const after = applied.state;
    expect(after.units[spy.id]).toMatchObject({ owner: AI_A, type: 'spy_scout', health: expect.any(Number) });
    expect(after.units[spy.id]!.health).toBeGreaterThan(0);
    expect(result.defenderDamage).toBeGreaterThan(0);
    const delivery = createNotificationDelivery({ getState: () => after, toast, isSuppressed: () => false });
    const ctx = makePresentationContext({ state: after, deliver: vi.fn(delivery.deliver) });
    registerCombatPresentation(bus, ctx);
    bus.emit('combat:resolved', { result, ...presentation, spyIdentifications: buildCombatSpyIdentifications(before, after, attacker, defender) });
    const identify = (world: typeof state, viewerId: string) => {
      const { log, handoff } = notifications(world, viewerId);
      return {
        log: log.filter(entry => entry.message.includes('Scout Agent')),
        handoff: handoff.filter(entry => entry.message.includes('Scout Agent')),
      };
    };
    expect(identify(after, HUMAN_B).log).toHaveLength(1);
    expect(identify(after, HUMAN_B).log[0]!.message).not.toContain(state.civilizations[AI_A]!.name);
    expect(identify(after, HUMAN_B).handoff).toHaveLength(1);
    expect(toast).not.toHaveBeenCalled();
    expectHotSeatDifferential({ name: 'post-combat identification', project: notifications }, {
      world: before,
      viewers: [HUMAN_A, HUMAN_B],
      knownOnlyTo: HUMAN_B,
      mutation: {
        label: 'the other seat fought a surviving disguised agent',
        apply: world => {
          world.notificationLog = after.notificationLog;
          world.pendingEvents = after.pendingEvents;
        },
      },
    });
    after.pendingEvents = clearEventsForPlayer(after.pendingEvents!, HUMAN_B);
    expect(identify(after, HUMAN_B).handoff).toEqual([]);
    expect(identify(after, HUMAN_B).log).toHaveLength(1);
    expect(projectUnitForPlayer(after.units[spy.id]!, after, HUMAN_B)).toMatchObject({ type: 'warrior', owner: 'barbarian' });
  });

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

  it('notifies a civ it spotted an enemy submarine, targeted at its position', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { units: { 'sub-1': { type: 'submarine', position: { q: 3, r: 4 } } as never } },
    });

    registerCombatPresentation(bus, ctx);
    bus.emit('submarine:sighted', { unitId: 'sub-1', civId: 'p1' });

    expect(ctx.deliver).toHaveBeenCalledWith(
      'p1',
      expect.stringContaining('Submarine'),
      'info',
      { kind: 'map', coord: { q: 3, r: 4 }, label: 'Submarine' },
    );
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
    bus.emit('combat:spy-identified', { recipientCivId: 'p1', unitType: 'spy_scout' });
    bus.emit('unit:obsolete', { civId: 'p1', unitId: 'unit-1', unitType: 'warrior' as never });
    bus.emit('unit:journey-blocked', { unitId: 'unit-1', position: { q: 2, r: 3 } });

    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.applyCombatVisual).not.toHaveBeenCalled();
  });
});
