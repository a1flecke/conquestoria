import { describe, expect, it, vi } from 'vitest';
import type { CombatResult, GameState } from '@/core/types';
import { BREAKAWAY_REVOLT_TURNS } from '@/systems/faction-system';
import {
  formatEconomyTreasuryStrainMessage,
  getNotificationTargetsForEvent,
  routeBarbarianSpawned,
  routeCombatRewardEarned,
  routeCombatResolved,
  routeDroppedProductionItem,
  routeEconomyTreasuryStrain,
  routeLegendaryWonder,
  routeFactionTransition,
  routeFirstContact,
  routePeaceMade,
  routePeaceRequested,
  routeWarDeclared,
  routeStrategicWarning,
  routeCrisisStarted,
  routeCrisisSpread,
  routeCrisisEscalated,
  routeCrisisResolved,
  routeWorldPressureCrisisStarted,
  routeWorldPressureCrisisResolved,
  routeCrisisFoeHuntedByAlly,
  routeCrisisAidSent,
  routeOpportunisticWar,
  routeSabotageReliefDiscovered,
  routeCityFlipped,
  type NotificationSink,
} from '@/ui/notification-routing';

vi.mock('@/systems/discovery-system', () => ({
  hasMetCivilization: (_s: unknown, viewer: string, target: string) => viewer === 'p2' && target === 'p1',
}));

// getWitnessCivIds's real mutual-contact semantics are covered by
// crisis-interaction-system.test.ts; here we only need control over which ids come back,
// independent of the narrow discovery-system mock above (built for a different, older test).
vi.mock('@/systems/crisis-interaction-system', () => ({
  getWitnessCivIds: (_state: unknown, actorId: string, targetId: string) =>
    actorId === 'rome' && targetId === 'carthage' ? ['egypt'] : [],
}));

vi.mock('@/systems/legendary-wonder-definitions', () => ({
  getLegendaryWonderDefinition: (id: string) => ({ id, name: `Wonder(${id})` }),
}));

function makeSink() {
  const calls: Array<{ civId: string; message: string; type: string; target?: unknown; sfxCue?: string }> = [];
  const sink: NotificationSink = (civId, message, type, target, _cityActions, sfxCue) =>
    calls.push({ civId, message, type, target, sfxCue });
  return { sink, calls };
}

function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    turn: 5,
    currentPlayer: 'p3',
    civilizations: {
      p1: { id: 'p1', name: 'Alice', diplomacy: { relationships: {}, atWarWith: [] }, visibility: { tiles: {} } },
      p2: { id: 'p2', name: 'Bob', diplomacy: { relationships: {} }, visibility: { tiles: {} } },
      p3: { id: 'p3', name: 'Carol', diplomacy: { relationships: {} }, visibility: { tiles: {} } },
    } as any,
    units: {},
    cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', position: { q: 0, r: 0 } } } as any,
    ...partial,
  } as GameState;
}

describe('notification routing', () => {
  it('routes a strategic warning only to its viewer with the already-safe map target', () => {
    const { sink, calls } = makeSink();
    const target = { kind: 'map' as const, coord: { q: 4, r: 2 }, label: 'Ravenna' };

    routeStrategicWarning({
      viewerId: 'p2',
      actorId: 'rome',
      actorName: 'Roman',
      warningKey: 'p2:rome:mobilizing:4,2',
      kind: 'mobilizing',
      evidence: 'visible',
      targetLabel: 'Ravenna',
      target,
      playAudio: true,
    }, sink);

    expect(calls).toEqual([{
      civId: 'p2',
      message: 'A Roman force is gathering against Ravenna. Reinforce the city, disrupt the rally, or seek peace.',
      type: 'warning',
      target,
    }]);
  });

  it('war-declared writes to both attacker and defender logs', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeWarDeclared(state, 'p1', 'p2', sink);
    const byCiv = Object.fromEntries(calls.map(c => [c.civId, c]));
    expect(byCiv.p1?.message).toMatch(/War has been declared on Bob/);
    expect(byCiv.p2?.message).toMatch(/Alice has declared war/);
    expect(byCiv.p2?.type).toBe('warning');
    expect(calls.find(c => c.civId === 'p3')).toBeUndefined();
  });

  it('peace-made writes to both parties', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routePeaceMade(state, 'p1', 'p2', sink);
    expect(calls.map(c => c.civId).sort()).toEqual(['p1', 'p2']);
    expect(calls.every(c => c.type === 'success')).toBe(true);
    expect(calls.find(c => c.civId === 'p3')).toBeUndefined();
  });

  it('peace-requested writes only to the recipient civ', () => {
    const state = makeState();
    const { sink, calls } = makeSink();

    routePeaceRequested(state, 'p1', 'p2', sink);

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p2',
        message: expect.stringMatching(/Alice requests peace/i),
        type: 'info',
      }),
    ]);
  });

  it('routes treasury strain to the affected civilization with the rush-buy consequence', () => {
    const state = makeState({ era: 3 } as Partial<GameState>);
    const { sink, calls } = makeSink();

    routeEconomyTreasuryStrain(
      state,
      { civId: 'p1', level: 'critical', netGoldPerTurn: -12, unpaidMaintenance: 4 },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Rush buy is unavailable/i),
        type: 'warning',
      }),
    ]);
    expect(calls[0]!.message).toMatch(/Unhappiness pressure is rising/i);
  });

  it('keeps low treasury strain actionable and avoids early-era unhappiness messaging', () => {
    const state = makeState({ era: 2 } as Partial<GameState>);
    const { sink, calls } = makeSink();

    routeEconomyTreasuryStrain(
      state,
      { civId: 'p1', level: 'low', netGoldPerTurn: -2, unpaidMaintenance: 2 },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Rush buy is still available/i),
        type: 'warning',
      }),
    ]);
    expect(calls[0]!.message).not.toMatch(/Unhappiness/i);
  });

  it('blocks rush buy at high strain before era-three unhappiness messaging starts', () => {
    const state = makeState({ era: 2 } as Partial<GameState>);
    const { sink, calls } = makeSink();

    routeEconomyTreasuryStrain(
      state,
      { civId: 'p1', level: 'high', netGoldPerTurn: -8, unpaidMaintenance: 5 },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Rush buy is unavailable/i),
        type: 'warning',
      }),
    ]);
    expect(calls[0]!.message).not.toMatch(/Unhappiness/i);
  });

  it('formats treasury strain copy once for logs and immediate toasts', () => {
    const state = makeState({ era: 3 } as Partial<GameState>);
    const event = { civId: 'p1', level: 'high' as const, netGoldPerTurn: -8, unpaidMaintenance: 5 };
    const { sink, calls } = makeSink();

    routeEconomyTreasuryStrain(state, event, sink);

    expect(formatEconomyTreasuryStrainMessage(state, event)).toBe(calls[0]!.message);
    expect(calls[0]!.message).toContain('Treasury strain is high');
    expect(calls[0]!.message).toContain('Rush buy is unavailable until the budget recovers.');
    expect(calls[0]!.message).toContain('Unhappiness pressure is rising.');
  });

  it('first-contact writes encounter messages to both civ logs', () => {
    const state = makeState();
    const { sink, calls } = makeSink();

    routeFirstContact(state, 'p1', 'p2', sink);

    expect(calls).toEqual([
      expect.objectContaining({ civId: 'p1', message: expect.stringMatching(/encountered Bob/i), type: 'info' }),
      expect.objectContaining({ civId: 'p2', message: expect.stringMatching(/encountered Alice/i), type: 'info' }),
    ]);
  });

  it('routes a dropped production item to the owning city civ, not the active player', () => {
    const state = makeState(); // currentPlayer: 'p3'; city c1 is owned by p1, named Thebes
    const { sink, calls } = makeSink();

    routeDroppedProductionItem(state, {
      cityId: 'c1', itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost',
    }, sink);

    expect(calls).toEqual([{
      civId: 'p1',
      message: "Harbor removed from Thebes's build queue — the city is no longer coastal.",
      type: 'warning',
      target: undefined,
    }]);
  });

  it('does not call the sink when the cityId no longer resolves to a city (negative)', () => {
    const state = makeState();
    const { sink, calls } = makeSink();

    routeDroppedProductionItem(state, {
      cityId: 'does-not-exist', itemId: 'harbor', itemKind: 'building', reason: 'coastal-access-lost',
    }, sink);

    expect(calls).toEqual([]);
  });

  it('combat-resolved writes to the defender owner log even when current player is a third civ', () => {
    const state = makeState({
      currentPlayer: 'p3',
      units: {
        a: { id: 'a', type: 'warrior', owner: 'p1' } as any,
        d: { id: 'd', type: 'warrior', owner: 'p2' } as any,
      },
    } as Partial<GameState>);
    const result: CombatResult = {
      attackerId: 'a', defenderId: 'd',
      attackerDamage: 10, defenderDamage: 20,
      attackerSurvived: true, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };
    const { sink, calls } = makeSink();
    routeCombatResolved(state, result, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p2');
    expect(calls[0]!.message).toMatch(/was attacked by Alice/);
  });

  it('combat-resolved labels barbarian attackers explicitly', () => {
    const state = makeState({
      units: {
        a: { id: 'a', type: 'warrior', owner: 'barbarian' } as any,
        d: { id: 'd', type: 'warrior', owner: 'p3' } as any,
      },
    } as Partial<GameState>);
    const result: CombatResult = {
      attackerId: 'a', defenderId: 'd',
      attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };
    const { sink, calls } = makeSink();
    routeCombatResolved(state, result, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p3');
    expect(calls[0]!.message).toMatch(/destroyed by Barbarians/);
  });

  it('routes interception details to both combatants, never the active third hot-seat player', () => {
    const state = makeState({
      currentPlayer: 'p3',
      units: {},
    } as Partial<GameState>);
    const result: CombatResult = {
      attackerId: 'destroyed-attacker', defenderId: 'destroyed-defender',
      attackerDamage: 8, defenderDamage: 22,
      attackerSurvived: true, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
      exchange: {
        kind: 'turret-fire',
        label: 'Bomber gunners fire back weakly: 25% return fire',
      },
    };
    const { sink, calls } = makeSink();

    routeCombatResolved(state, result, sink, {
      attackerOwnerId: 'p1', attackerType: 'jet_fighter',
      defenderOwnerId: 'p2', defenderType: 'bomber',
    });

    expect(calls).toEqual([
      {
        civId: 'p2',
        message: 'Bomber was attacked by Alice (22 damage taken). Bomber gunners fire back weakly: 25% return fire.',
        type: 'warning', target: undefined,
      },
      {
        civId: 'p1',
        message: 'Jet Fighter attack: Bomber gunners fire back weakly: 25% return fire.',
        type: 'info', target: undefined,
      },
    ]);
    expect(calls.some(call => call.civId === 'p3')).toBe(false);
  });

  it('routes combat reward messages to the rewarded civ only', () => {
    const state = makeState();
    const { sink, calls } = makeSink();

    routeCombatRewardEarned(state, {
      recipientCivId: 'p1',
      recipientUnitId: 'unit-a',
      defeatedUnitId: 'unit-d',
      experienceAwarded: 10,
      healthRestored: 8,
      goldAwarded: 4,
      surprise: null,
      message: 'Combat reward: +10 XP, +8 HP, +4 gold',
    }, sink);

    expect(calls).toEqual([
      { civId: 'p1', message: 'Combat reward: +10 XP, +8 HP, +4 gold', type: 'success' },
    ]);
  });

  it('legendary-wonder-completed fans out to every civ, naming builder only for civs that have met them', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeLegendaryWonder(
      state,
      { type: 'wonder:legendary-completed', civId: 'p1', cityId: 'c1', wonderId: 'great-wall', turnCompleted: 40 },
      sink,
    );
    const byCiv = Object.fromEntries(calls.map(c => [c.civId, c]));
    // Builder sees own-city success message.
    expect(byCiv.p1?.type).toBe('success');
    expect(byCiv.p1?.message).toMatch(/Thebes completed/);
    // p2 mocked as having met p1 → sees builder's civ name.
    expect(byCiv.p2?.message).toMatch(/Alice completed/);
    // p3 has not met p1 → sees redacted label.
    expect(byCiv.p3?.message).toMatch(/A rival civilization completed/);
  });

  it('legendary-wonder-race-revealed targets the observer only', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeLegendaryWonder(
      state,
      { type: 'wonder:legendary-race-revealed', observerId: 'p2', civId: 'p1', cityId: 'c1', wonderId: 'great-wall' },
      sink,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p2');
  });

  it('routes breakaway-started as a critical warning to the origin owner', () => {
    const state = makeState({
      turn: 34,
      cities: {
        paris: { id: 'paris', name: 'Paris', owner: 'breakaway-paris', position: { q: 4, r: 2 } },
      } as any,
      civilizations: {
        p1: { id: 'p1', name: 'France', diplomacy: { relationships: {}, atWarWith: [] }, visibility: { tiles: {} } },
        'breakaway-paris': {
          id: 'breakaway-paris',
          name: 'Paris Secession',
          diplomacy: { relationships: {}, atWarWith: [] },
          visibility: { tiles: {} },
          breakaway: { originOwnerId: 'p1', originCityId: 'paris', startedTurn: 34, establishesOnTurn: 84, status: 'secession' },
        },
      } as any,
    });
    const { sink, calls } = makeSink();

    routeFactionTransition(
      state,
      { type: 'faction:breakaway-started', cityId: 'paris', oldOwner: 'p1', breakawayId: 'breakaway-paris' },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Paris.*broken away/i),
        type: 'warning',
      }),
    ]);
  });

  it('routes recurring breakaway critical status to the origin owner', () => {
    const state = makeState({
      turn: 35,
      cities: {
        paris: { id: 'paris', name: 'Paris', owner: 'breakaway-paris', position: { q: 4, r: 2 } },
      } as any,
      civilizations: {
        p1: { id: 'p1', name: 'France', diplomacy: { relationships: {}, atWarWith: [] }, visibility: { tiles: {} } },
        'breakaway-paris': {
          id: 'breakaway-paris',
          name: 'Paris Secession',
          diplomacy: { relationships: {}, atWarWith: [] },
          visibility: { tiles: {} },
          breakaway: { originOwnerId: 'p1', originCityId: 'paris', startedTurn: 34, establishesOnTurn: 84, status: 'secession' },
        },
      } as any,
    });
    const { sink, calls } = makeSink();

    routeFactionTransition(
      state,
      { type: 'faction:critical-status', cityId: 'paris', owner: 'p1', status: 'breakaway', breakawayId: 'breakaway-paris' },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Paris.*still in secession/i),
        type: 'warning',
      }),
    ]);
  });

  it('legendary-wonder-ready targets the builder only', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeLegendaryWonder(
      state,
      { type: 'wonder:legendary-ready', civId: 'p1', cityId: 'c1', wonderId: 'great-wall' },
      sink,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
  });

  it('barbarian-spawned notifies every civ whose visibility covers the tile, once per camp', () => {
    const state = makeState();
    (state.civilizations.p1 as any).visibility = { tiles: { '0,0': 'visible' } };
    (state.civilizations.p2 as any).visibility = { tiles: { '0,0': 'fog' } };
    const dedup = new Map<string, Set<string>>();
    const { sink, calls } = makeSink();
    const isVisible = (vis: any, pos: { q: number; r: number }) =>
      vis?.tiles?.[`${pos.q},${pos.r}`] === 'visible';

    routeBarbarianSpawned(state, { q: 0, r: 0 }, 'camp-1', dedup, sink, isVisible);
    expect(calls.map(c => c.civId)).toEqual(['p1']);
    expect(calls[0]!.target).toEqual({
      kind: 'map',
      coord: { q: 0, r: 0 },
      label: 'Barbarian raiders',
    });

    routeBarbarianSpawned(state, { q: 0, r: 0 }, 'camp-1', dedup, sink, isVisible);
    expect(calls).toHaveLength(1);

    routeBarbarianSpawned(state, { q: 0, r: 0 }, 'camp-2', dedup, sink, isVisible);
    expect(calls.map(c => c.civId)).toEqual(['p1', 'p1']);
  });

  it('routes territory improvement transfer notifications to involved civs and visible observers', () => {
    const state = makeState();
    (state.civilizations.p1 as any).visibility = { tiles: { '5,5': 'visible' } };
    (state.civilizations.p2 as any).visibility = { tiles: { '5,5': 'visible' } };
    (state.civilizations.p3 as any).visibility = { tiles: { '5,5': 'visible' } };

    const targets = getNotificationTargetsForEvent(state, {
      type: 'territory:tile-flipped',
      coord: { q: 5, r: 5 },
      previousOwner: 'p1',
      newOwner: 'p2',
      improvement: 'farm',
      constructionCancelled: false,
    });

    expect(targets.sort()).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('improvement completion routing', () => {
  it('routes improvement completion to the builder, not the current player', () => {
    const calls: Array<{ civId: string; message: string }> = [];
    const sink: NotificationSink = (civId, message) => calls.push({ civId, message });

    // Builder is p1, current player is p2 (last to end their turn)
    sink('p1', 'Mine completed!', 'success');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    expect(calls[0]!.message).toBe('Mine completed!');
    expect(calls.find(c => c.civId === 'p2')).toBeUndefined();
  });
});

describe('bus listener routing contract', () => {
  it('appendToCivLog routes to the correct civ even when a different player is current', () => {
    const calls: Array<{ civId: string; message: string }> = [];
    const sink: NotificationSink = (civId, message) => calls.push({ civId, message });

    // Simulate p1's tech/city events completing while currentPlayer = p2
    sink('p1', 'Research complete: Bronze Working!', 'success');
    sink('p1', 'Springfield grew to 3 population!', 'success');
    sink('p1', 'Springfield: granary completed!', 'success');

    const p1Calls = calls.filter(c => c.civId === 'p1');
    const p2Calls = calls.filter(c => c.civId === 'p2');
    expect(p1Calls).toHaveLength(3);
    expect(p2Calls).toHaveLength(0);
  });

  // --- faction transition routing ---

  it('faction:unrest-started includes turn countdown, garrison option, and appease cost', () => {
    const state = makeState({
      cities: {
        c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 3, position: { q: 0, r: 0 } },
      } as any,
    });
    const { sink, calls } = makeSink();
    routeFactionTransition(state, { type: 'faction:unrest-started', cityId: 'c1', owner: 'p1' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    // 5 = REVOLT_UNREST_TURNS
    expect(calls[0]!.message).toContain('5');
    expect(calls[0]!.message).toContain('garrison');
    // 3 population * 15 gold per pop = 45
    expect(calls[0]!.message).toContain('45');
    expect(calls[0]!.type).toBe('warning');
  });

  it('faction:unrest-started with undefined city calls sink zero times (null guard)', () => {
    const state = makeState({ cities: {} as any });
    const { sink, calls } = makeSink();
    routeFactionTransition(state, { type: 'faction:unrest-started', cityId: 'nonexistent', owner: 'p1' }, sink);
    expect(calls).toHaveLength(0);
  });

  it('faction:revolt-started includes 10-turn breakaway warning and city name', () => {
    const state = makeState({
      cities: {
        c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 3, position: { q: 0, r: 0 } },
      } as any,
    });
    const { sink, calls } = makeSink();
    routeFactionTransition(state, { type: 'faction:revolt-started', cityId: 'c1', owner: 'p1' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message).toContain(`${BREAKAWAY_REVOLT_TURNS} turns`);
    expect(calls[0]!.message).toContain('Thebes');
    expect(calls[0]!.type).toBe('warning');
  });

  it('faction:revolt-started with undefined city calls sink zero times (null guard)', () => {
    const state = makeState({ cities: {} as any });
    const { sink, calls } = makeSink();
    routeFactionTransition(state, { type: 'faction:revolt-started', cityId: 'nonexistent', owner: 'p1' }, sink);
    expect(calls).toHaveLength(0);
  });

  it('faction:critical-status with status=unrest produces a short message and no guidance text (anti-spam regression guard)', () => {
    const state = makeState({
      cities: {
        c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 3, position: { q: 0, r: 0 } },
      } as any,
    });
    const { sink, calls } = makeSink();
    routeFactionTransition(state, { type: 'faction:critical-status', cityId: 'c1', owner: 'p1', status: 'unrest' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message.length).toBeLessThan(100);
    expect(calls[0]!.message).not.toContain('garrison');
  });

  it('faction:unrest-started where state.civilizations[owner] is undefined does not throw (#263 null guard)', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 3, position: { q: 0, r: 0 } } } as any,
    });
    delete (state.civilizations as Record<string, unknown>)['p1'];
    const { sink } = makeSink();
    expect(() =>
      routeFactionTransition(state, { type: 'faction:unrest-started', cityId: 'c1', owner: 'p1' }, sink)
    ).not.toThrow();
  });
});

describe('crisis notification routing', () => {
  it('routes crisis:started only to the target civ with the era display name and advisor line', () => {
    const state = makeState({
      era: 2,
      cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 5, position: { q: 0, r: 0 } } } as any,
    });
    const { sink, calls } = makeSink();
    routeCrisisStarted(state, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', cityIds: ['c1'] }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    expect(calls[0]!.message).toContain('The Sweating Sickness');
    expect(calls[0]!.message).toContain('Thebes');
    expect(calls[0]!.message).toContain('Quarantine the city');
  });

  it('uses the affected civilization personal era rather than World Age for crisis naming', () => {
    const state = makeState({ era: 4 });
    state.civilizations.p1.techState = { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} } as any;
    const { sink, calls } = makeSink();

    routeCrisisStarted(state, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', cityIds: ['c1'] }, sink);

    expect(calls[0]?.message).toContain('The Sweating Sickness');
    expect(calls[0]?.message).not.toContain('The Great Pestilence');
  });

  it('routes crisis:started for a catastrophe flavor too (routing is flavor-generic, no outbreak-only assumption)', () => {
    const state = makeState({
      era: 2,
      cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 5, position: { q: 0, r: 0 } } } as any,
    });
    const { sink, calls } = makeSink();
    routeCrisisStarted(state, { crisisId: 'crisis-1', flavorId: 'earthquake', civId: 'p1', cityIds: ['c1'] }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message).toContain('The Ground Trembles');
    expect(calls[0]!.message).toContain('Send workers to restore the land');
  });

  it('routes crisis:spread only to the target civ', () => {
    const state = makeState({
      cities: {
        c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 5, position: { q: 0, r: 0 } },
        c2: { id: 'c2', name: 'Memphis', owner: 'p1', population: 3, position: { q: 5, r: 0 } },
      } as any,
      activeCrises: {
        'crisis-1': {
          id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'p1',
          cityIds: ['c1', 'c2'], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1,
        },
      },
    } as any);
    const { sink, calls } = makeSink();
    routeCrisisSpread(state, { crisisId: 'crisis-1', fromCityId: 'c1', toCityId: 'c2' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    expect(calls[0]!.message).toContain('Memphis');
  });

  it('routes crisis:resolved with an outcome-appropriate message naming the resolved crisis', () => {
    const state = makeState({ era: 2 });
    const { sink, calls } = makeSink();
    routeCrisisResolved(state, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', outcome: 'contained' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    expect(calls[0]!.type).toBe('success');
    expect(calls[0]!.message).toContain('The Sweating Sickness');
  });

  it('#594 MR7: tags crisis:started with the famine-onset sfx cue only for a famine-archetype flavor', () => {
    const state = makeState({
      era: 2,
      cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 5, position: { q: 0, r: 0 } } } as any,
    });
    const { sink, calls } = makeSink();
    // 'crop-blight' is a famine-archetype flavor (crisis-flavor-definitions.ts); 'plague' is outbreak.
    routeCrisisStarted(state, { crisisId: 'crisis-1', flavorId: 'crop-blight', civId: 'p1', cityIds: ['c1'] }, sink);
    routeCrisisStarted(state, { crisisId: 'crisis-2', flavorId: 'plague', civId: 'p1', cityIds: ['c1'] }, sink);
    expect(calls[0]!.sfxCue).toBe('famine-onset');
    expect(calls[1]!.sfxCue).toBeUndefined();
  });

  it('#594 MR7: tags crisis:resolved with the famine-resolved sfx cue only for famine + a positive outcome', () => {
    const state = makeState({ era: 2 });
    const { sink, calls } = makeSink();
    routeCrisisResolved(state, { crisisId: 'crisis-1', flavorId: 'crop-blight', civId: 'p1', outcome: 'contained' }, sink);
    routeCrisisResolved(state, { crisisId: 'crisis-2', flavorId: 'crop-blight', civId: 'p1', outcome: 'expired' }, sink);
    routeCrisisResolved(state, { crisisId: 'crisis-3', flavorId: 'plague', civId: 'p1', outcome: 'contained' }, sink);
    expect(calls[0]!.sfxCue).toBe('famine-resolved');
    expect(calls[1]!.sfxCue).toBeUndefined();
    expect(calls[2]!.sfxCue).toBeUndefined();
  });

  it('falls back to a generic message for an unknown flavorId instead of throwing', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeCrisisResolved(state, { crisisId: 'crisis-1', flavorId: 'removed-flavor', civId: 'p1', outcome: 'abandoned' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message).toContain('A crisis');
    expect(calls[0]!.type).toBe('info');
  });

  it('does not route crisis:started for a hunt flavor — the onset announcement waits for the foe to have a name', () => {
    const state = makeState({
      era: 2,
      cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 5, position: { q: 0, r: 0 } } } as any,
    });
    const { sink, calls } = makeSink();
    routeCrisisStarted(state, { crisisId: 'crisis-1', flavorId: 'beast-awakening', civId: 'p1', cityIds: ['c1'] }, sink);
    expect(calls).toHaveLength(0);
  });

  it('routes crisis:escalated (stage menacing) as the hunt onset announcement, using the real foe name', () => {
    const state = makeState({
      era: 2,
      cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 5, position: { q: 0, r: 0 } } } as any,
      activeCrises: {
        'crisis-1': {
          id: 'crisis-1', flavorId: 'beast-awakening', archetype: 'hunt', targetCivId: 'p1',
          cityIds: ['c1'], tileKeys: [], startedTurn: 1, stage: 'menacing', turnsInStage: 0,
          huntEntityId: 'unit-1', foeName: 'Giant Boar',
        },
      },
    } as any);
    const { sink, calls } = makeSink();
    routeCrisisEscalated(state, { crisisId: 'crisis-1', stage: 'menacing', civId: 'p1', foeName: 'Giant Boar' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    expect(calls[0]!.message).toContain('Giant Boar');
    expect(calls[0]!.message).toContain('Thebes');
  });

  it('routes crisis:escalated (stage assaulting) as the veteran escalation warning', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 5, position: { q: 0, r: 0 } } } as any,
      activeCrises: {
        'crisis-1': {
          id: 'crisis-1', flavorId: 'beast-awakening', archetype: 'hunt', targetCivId: 'p1',
          cityIds: ['c1'], tileKeys: [], startedTurn: 1, stage: 'assaulting', turnsInStage: 5,
          huntEntityId: 'unit-1', foeName: 'Giant Boar',
        },
      },
    } as any);
    const { sink, calls } = makeSink();
    routeCrisisEscalated(state, { crisisId: 'crisis-1', stage: 'assaulting', civId: 'p1', foeName: 'Giant Boar' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message).toContain('Giant Boar');
    expect(calls[0]!.message).toContain('assaults');
  });

  it('routes crisis:resolved (hunted) with two-sided messaging: feast to the killer, notice to the target civ', () => {
    const state = makeState({
      civilizations: {
        p1: { id: 'p1', name: 'Rome' },
        p2: { id: 'p2', name: 'Egypt' },
      } as any,
    });
    const { sink, calls } = makeSink();
    routeCrisisResolved(
      state,
      { crisisId: 'crisis-1', flavorId: 'beast-awakening', civId: 'p1', outcome: 'hunted', foeName: 'Giant Boar', killerCivId: 'p2' },
      sink,
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]!.civId).toBe('p2');
    expect(calls[0]!.message).toContain('feast');
    expect(calls[1]!.civId).toBe('p1');
    expect(calls[1]!.message).toContain('Giant Boar');
    expect(calls[1]!.message).toContain('Egypt');
  });

  it('routes crisis:resolved (hunted) with a single message when the target civ claimed its own hunt', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeCrisisResolved(
      state,
      { crisisId: 'crisis-1', flavorId: 'beast-awakening', civId: 'p1', outcome: 'hunted', foeName: 'Giant Boar', killerCivId: 'p1' },
      sink,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    expect(calls[0]!.message).toContain('feast');
  });
});

describe('world-pressure crisis notifications (#526 MR5 Task 5.2)', () => {
  function worldPressureState(overrides: Partial<GameState> = {}): GameState {
    return makeState({
      era: 2,
      settings: { aiPressureVisibility: true } as GameState['settings'],
      civilizations: {
        p1: { id: 'p1', name: 'Rome', isHuman: false, knownCivilizations: [] },
        p2: { id: 'p2', name: 'Egypt', isHuman: true, knownCivilizations: ['p1'] },
        p3: { id: 'p3', name: 'Nubia', isHuman: true, knownCivilizations: [] }, // has not met p1
      } as any,
      cities: {
        c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 5, position: { q: 0, r: 0 } },
      } as any,
      ...overrides,
    });
  }

  it('crisis:started fans out to viewers who know the AI target civ', () => {
    const state = worldPressureState();
    const { sink, calls } = makeSink();
    routeWorldPressureCrisisStarted(state, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', cityIds: ['c1'] }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p2');
    expect(calls[0]!.message).toContain('The Sweating Sickness');
    expect(calls[0]!.message).toContain('Thebes');
  });

  it('crisis:started does not notify a viewer who has not met the AI target civ', () => {
    const state = worldPressureState();
    const { sink, calls } = makeSink();
    routeWorldPressureCrisisStarted(state, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', cityIds: ['c1'] }, sink);
    expect(calls.some(c => c.civId === 'p3')).toBe(false);
  });

  it('crisis:started does not fan out for a human-targeted crisis (existing per-owner routing covers it)', () => {
    const state = worldPressureState();
    state.civilizations.p1.isHuman = true;
    state.civilizations.p2.knownCivilizations = ['p1'];
    const { sink, calls } = makeSink();
    routeWorldPressureCrisisStarted(state, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', cityIds: ['c1'] }, sink);
    expect(calls).toHaveLength(0);
  });

  it('crisis:started produces nothing when aiPressureVisibility is off', () => {
    const state = worldPressureState({ settings: { aiPressureVisibility: false } as GameState['settings'] });
    const { sink, calls } = makeSink();
    routeWorldPressureCrisisStarted(state, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', cityIds: ['c1'] }, sink);
    expect(calls).toHaveLength(0);
  });

  it('crisis:resolved fans out to viewers who know the AI target civ, naming the civ and outcome', () => {
    const state = worldPressureState();
    const { sink, calls } = makeSink();
    routeWorldPressureCrisisResolved(state, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', outcome: 'contained' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p2');
    expect(calls[0]!.message).toContain('Rome');
    expect(calls[0]!.message).toContain('contained');
    expect(calls[0]!.type).toBe('success');
  });

  it('crisis:resolved does not notify an unmet viewer, and produces nothing off-flag', () => {
    const state = worldPressureState();
    const { sink, calls } = makeSink();
    routeWorldPressureCrisisResolved(state, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', outcome: 'contained' }, sink);
    expect(calls.some(c => c.civId === 'p3')).toBe(false);

    const offState = worldPressureState({ settings: { aiPressureVisibility: false } as GameState['settings'] });
    const off = makeSink();
    routeWorldPressureCrisisResolved(offState, { crisisId: 'crisis-1', flavorId: 'plague', civId: 'p1', outcome: 'contained' }, off.sink);
    expect(off.calls).toHaveLength(0);
  });

  it('anti-spam: crisis:spread never reaches a third-party viewer, only the target civ itself (its own per-owner log)', () => {
    const state = worldPressureState({
      cities: {
        c1: { id: 'c1', name: 'Thebes', owner: 'p1', population: 5, position: { q: 0, r: 0 } },
        c2: { id: 'c2', name: 'Memphis', owner: 'p1', population: 3, position: { q: 5, r: 0 } },
      } as any,
      activeCrises: {
        'crisis-1': {
          id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'p1',
          cityIds: ['c1', 'c2'], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1,
        },
      },
    } as any);
    const { sink, calls } = makeSink();
    // routeCrisisSpread is the only router wired to crisis:spread in main.ts — there is no
    // world-pressure equivalent, so a spread tick can never reach viewer p2, even though p2
    // knows p1 and would receive a started/resolved notification for the same crisis.
    routeCrisisSpread(state, { crisisId: 'crisis-1', fromCityId: 'c1', toCityId: 'c2' }, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    expect(calls.some(c => c.civId === 'p2')).toBe(false);
  });
});

describe('crisis:foe-hunted-by-ally routing (#526 MR6 Task 6.2)', () => {
  function huntState(): GameState {
    return makeState({
      civilizations: {
        rome: { id: 'rome', name: 'Rome', knownCivilizations: [] },
        carthage: { id: 'carthage', name: 'Carthage', knownCivilizations: [] },
        egypt: { id: 'egypt', name: 'Egypt', knownCivilizations: ['rome'] }, // knows only the killer
        nubia: { id: 'nubia', name: 'Nubia', knownCivilizations: [] }, // knows neither
      } as any,
    });
  }

  it('notifies a third-party viewer who knows either civ, but never the killer or target directly (routeCrisisResolved already covers them, same tick -- double-notify regression guard)', () => {
    const { sink, calls } = makeSink();
    routeCrisisFoeHuntedByAlly(
      huntState(),
      { crisisId: 'crisis-1', killerCivId: 'rome', targetCivId: 'carthage', foeName: 'Giant Boar' },
      sink,
    );
    const civIds = calls.map(c => c.civId);
    expect(civIds).toEqual(['egypt']);
    expect(civIds).not.toContain('rome');
    expect(civIds).not.toContain('carthage');
    expect(civIds).not.toContain('nubia');
    expect(calls[0]!.message).toBe('Rome slew Giant Boar menacing Carthage!');
  });

  it('falls back to a generic foe phrase when foeName is absent instead of throwing', () => {
    const { sink, calls } = makeSink();
    routeCrisisFoeHuntedByAlly(
      huntState(),
      { crisisId: 'crisis-1', killerCivId: 'rome', targetCivId: 'carthage' },
      sink,
    );
    expect(calls[0]!.message).toContain('their foe');
  });
});

describe('crisis:aid-sent routing (#526 MR6 Task 6.3)', () => {
  function aidState(): GameState {
    return makeState({
      civilizations: {
        rome: { id: 'rome', name: 'Rome', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: ['carthage', 'egypt'] },
        carthage: { id: 'carthage', name: 'Carthage', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: ['rome', 'egypt'] },
        egypt: { id: 'egypt', name: 'Egypt', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: ['rome', 'carthage'] }, // met both
        nubia: { id: 'nubia', name: 'Nubia', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: [] }, // met neither
      } as any,
    });
  }

  it('notifies the aided target civ and every witness who has met both civs', () => {
    const { sink, calls } = makeSink();
    routeCrisisAidSent(aidState(), { crisisId: 'crisis-1', actorCivId: 'rome', targetCivId: 'carthage', goldCost: 45 }, sink);
    const civIds = calls.map(c => c.civId);
    expect(civIds).toContain('carthage');
    expect(civIds).toContain('egypt');
    expect(civIds).not.toContain('nubia');
    expect(calls[0]!.message).toBe('Rome sent aid to Carthage!');
  });

  it('does not notify the actor directly (the panel already gives immediate feedback)', () => {
    const { sink, calls } = makeSink();
    routeCrisisAidSent(aidState(), { crisisId: 'crisis-1', actorCivId: 'rome', targetCivId: 'carthage', goldCost: 45 }, sink);
    expect(calls.some(c => c.civId === 'rome')).toBe(false);
  });
});

describe('diplomacy:opportunistic-war routing (#526 MR7 Task 7.1)', () => {
  function warState(): GameState {
    return makeState({
      civilizations: {
        rome: { id: 'rome', name: 'Rome', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: ['carthage', 'egypt'] },
        carthage: { id: 'carthage', name: 'Carthage', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: ['rome', 'egypt'] },
        egypt: { id: 'egypt', name: 'Egypt', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: ['rome', 'carthage'] }, // met both
        nubia: { id: 'nubia', name: 'Nubia', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: [] }, // met neither
      } as any,
    });
  }

  it('notifies only witnesses who have met both the declarer and the target', () => {
    const { sink, calls } = makeSink();
    routeOpportunisticWar(warState(), { actorId: 'rome', targetCivId: 'carthage', crisisId: 'crisis-1' }, sink);
    const civIds = calls.map(c => c.civId);
    expect(civIds).toEqual(['egypt']);
    expect(calls[0]!.message).toBe('Rome declared war on Carthage while they were struggling with a crisis!');
  });

  it('does not notify the target directly (routeWarDeclared already covers the war itself)', () => {
    const { sink, calls } = makeSink();
    routeOpportunisticWar(warState(), { actorId: 'rome', targetCivId: 'carthage', crisisId: 'crisis-1' }, sink);
    expect(calls.some(c => c.civId === 'carthage')).toBe(false);
  });
});

describe('espionage:sabotage-relief-discovered routing (#526 MR7 Task 7.2)', () => {
  function sabotageState(): GameState {
    return makeState({
      civilizations: {
        rome: { id: 'rome', name: 'Rome', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: ['carthage', 'egypt'] },
        carthage: { id: 'carthage', name: 'Carthage', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: ['rome', 'egypt'] },
        egypt: { id: 'egypt', name: 'Egypt', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: ['rome', 'carthage'] }, // met both
        nubia: { id: 'nubia', name: 'Nubia', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} }, knownCivilizations: [] }, // met neither
      } as any,
    });
  }

  it('notifies the sabotaged target directly and every witness, with the spec\'s exact family-tone string', () => {
    const { sink, calls } = makeSink();
    routeSabotageReliefDiscovered(sabotageState(), { crisisId: 'crisis-1', actorCivId: 'rome', targetCivId: 'carthage' }, sink);
    const civIds = calls.map(c => c.civId);
    expect(civIds).toContain('carthage');
    expect(civIds).toContain('egypt');
    expect(civIds).not.toContain('nubia');
    expect(calls.every(c => c.message === "Rome's spies were caught sabotaging Carthage's relief!")).toBe(true);
  });
});

describe('espionage:city-flipped routing (#524 MR2a review fix)', () => {
  function flipState(): GameState {
    return makeState({
      civilizations: {
        rome: { id: 'rome', name: 'Rome', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} } },
        carthage: { id: 'carthage', name: 'Carthage', cities: [], units: [], diplomacy: { relationships: {} }, visibility: { tiles: {} } },
      } as any,
      cities: { 'city-1': { id: 'city-1', name: 'Utica', owner: 'rome', position: { q: 0, r: 0 } } } as any,
    });
  }

  it('notifies both the flipping civ and the victim civ, with distinct messages', () => {
    const { sink, calls } = makeSink();
    routeCityFlipped(flipState(), { civId: 'rome', victimCivId: 'carthage', cityId: 'city-1' }, sink);
    expect(calls).toHaveLength(2);
    const romeCall = calls.find(c => c.civId === 'rome')!;
    const carthageCall = calls.find(c => c.civId === 'carthage')!;
    expect(romeCall.message).toContain('Utica');
    expect(romeCall.message).toContain('Carthage');
    expect(romeCall.type).toBe('success');
    expect(carthageCall.message).toContain('Utica');
    expect(carthageCall.message).toContain('Rome');
    expect(carthageCall.type).toBe('warning');
  });

  it('falls back to generic names when a civ record is missing', () => {
    const { sink, calls } = makeSink();
    routeCityFlipped(flipState(), { civId: 'rome', victimCivId: 'unknown-civ', cityId: 'city-1' }, sink);
    expect(calls.every(c => typeof c.message === 'string' && c.message.length > 0)).toBe(true);
  });
});
