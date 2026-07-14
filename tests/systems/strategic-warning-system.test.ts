import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  createEmptyMajorCivPlanPortfolio,
  createEmptyOpponentAIState,
} from '@/core/opponent-ai-state';
import type { AIStrategicPlan, GameState, HexCoord } from '@/core/types';
import {
  applyStrategicWarningTransitions,
  deriveStrategicWarningTransitions,
} from '@/systems/strategic-warning-system';
import { EventBus } from '@/core/event-bus';
import { createEmptyPirateState } from '@/core/pirate-state';
import { foundCity } from '@/systems/city-system';

function makePlan(
  actorId: string,
  assignedUnitId: string,
  target: AIStrategicPlan['target'],
  phase: AIStrategicPlan['phase'] = 'mobilizing',
): AIStrategicPlan {
  return {
    id: `plan:${actorId}:capture`,
    actorId,
    objective: 'capture',
    target,
    theaterId: 'test-theater',
    phase,
    reasonCodes: ['continue-active-war'],
    commitment: 0.8,
    createdTurn: 2,
    reconsiderAfterTurn: 4,
    expiresAfterTurn: 10,
    lastProgressTurn: 2,
    requiredRoles: { capture: 1 },
    assignedUnitIds: [assignedUnitId],
  };
}

function fixture(): { before: GameState; after: GameState; aiId: string; aiUnitId: string } {
  const before = createNewGame({
    civType: 'rome',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'Warning Test',
    seed: 'strategic-warning',
  });
  before.opponentAI = createEmptyOpponentAIState();
  before.opponentAI.pressureByCiv.player = {
    activeIndependentThreatIds: [],
    recoveryUntilTurn: 0,
    lastResolvedThreatTurn: null,
    lastWarningTurnByKey: {},
    lastStrategicAudioTurn: null,
  };
  const aiId = 'ai-1';
  const aiUnitId = before.civilizations[aiId].units[0]!;
  const playerPosition = before.units[before.civilizations.player.units[0]!]!.position;
  const aiPosition = before.units[aiUnitId].position;
  const playerCity = foundCity('player', playerPosition, before.map, before.idCounters);
  const aiCity = foundCity(aiId, aiPosition, before.map, before.idCounters);
  before.cities = { [playerCity.id]: playerCity, [aiCity.id]: aiCity };
  before.civilizations.player.cities = [playerCity.id];
  before.civilizations[aiId].cities = [aiCity.id];
  before.opponentAI.majorCivs[aiId] = createEmptyMajorCivPlanPortfolio();
  const after = structuredClone(before);
  after.turn = before.turn + 1;
  return { before, after, aiId, aiUnitId };
}

function setVisibility(state: GameState, viewerId: string, coord: HexCoord, value: 'visible' | 'fog'): void {
  state.civilizations[viewerId].visibility.tiles[`${coord.q},${coord.r}`] = value;
}

describe('strategic warning transition derivation', () => {
  it('warns about a visible mobilization without leaking its hidden target', () => {
    const { before, after, aiId, aiUnitId } = fixture();
    const unit = after.units[aiUnitId];
    setVisibility(after, 'player', unit.position, 'visible');
    after.opponentAI!.majorCivs[aiId].primaryPlan = makePlan(aiId, aiUnitId, {
      kind: 'city',
      id: 'hidden-city',
      lastKnownPosition: { q: 99, r: 99 },
    });

    const [warning] = deriveStrategicWarningTransitions(before, after, 'player');

    expect(warning).toMatchObject({
      viewerId: 'player',
      actorId: aiId,
      actorName: after.civilizations[aiId].name,
      kind: 'mobilizing',
      evidence: 'visible',
      playAudio: true,
    });
    expect(warning.target).toBeUndefined();
    expect(warning.targetLabel).toBeUndefined();
  });

  it('includes an exact target only when that target is viewer-safe', () => {
    const { before, after, aiId, aiUnitId } = fixture();
    const unit = after.units[aiUnitId];
    setVisibility(after, 'player', unit.position, 'visible');
    const targetCity = Object.values(after.cities).find(city => city.owner === aiId)!;
    setVisibility(after, 'player', targetCity.position, 'visible');
    after.opponentAI!.majorCivs[aiId].primaryPlan = makePlan(aiId, aiUnitId, {
      kind: 'city',
      id: targetCity.id,
      lastKnownPosition: targetCity.position,
    });

    const [warning] = deriveStrategicWarningTransitions(before, after, 'player');

    expect(warning.targetLabel).toBe(targetCity.name);
    expect(warning.target).toEqual({
      kind: 'map',
      coord: targetCity.position,
      label: targetCity.name,
    });
  });

  it('uses trusted remembered unit evidence and marks current position uncertain', () => {
    const { before, after, aiId, aiUnitId } = fixture();
    const unit = after.units[aiUnitId];
    setVisibility(after, 'player', unit.position, 'fog');
    after.civilizations.player.visibility.lastSeen = {
      [`${unit.position.q},${unit.position.r}`]: {
        coord: unit.position,
        terrain: after.map.tiles[`${unit.position.q},${unit.position.r}`].terrain,
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        improvementTurnsLeft: 0,
        owner: null,
        hasRiver: false,
        wonder: null,
        observedTurn: before.turn,
        source: 'observed',
        units: [{ id: aiUnitId, owner: aiId, type: unit.type, healthBand: 'healthy' }],
      },
    };
    after.opponentAI!.majorCivs[aiId].primaryPlan = makePlan(aiId, aiUnitId, {
      kind: 'region',
      id: 'east',
      anchor: { q: 8, r: 4 },
    });

    expect(deriveStrategicWarningTransitions(before, after, 'player')).toEqual([
      expect.objectContaining({ evidence: 'remembered', regionLabel: expect.any(String) }),
    ]);
  });

  it('does not turn a hidden internal plan or another viewer evidence into knowledge', () => {
    const { before, after, aiId, aiUnitId } = fixture();
    const unit = after.units[aiUnitId];
    setVisibility(after, 'player', unit.position, 'fog');
    setVisibility(after, 'ai-1', unit.position, 'visible');
    after.opponentAI!.majorCivs[aiId].primaryPlan = makePlan(aiId, aiUnitId, {
      kind: 'city',
      id: 'hidden',
      lastKnownPosition: { q: 8, r: 8 },
    });

    expect(deriveStrategicWarningTransitions(before, after, 'player')).toEqual([]);
  });

  it('derives pirate behavior only from the viewer persisted intel snapshot', () => {
    const { before, after } = fixture();
    before.pirates = createEmptyPirateState();
    after.pirates = createEmptyPirateState();
    after.pirates.factions['pirate-1'] = {
      id: 'pirate-1',
      name: 'Secret Richer Name',
      spawnedRound: 1,
      behavior: 'blockading',
      maritimeStage: 2,
      notoriety: 1,
      shipIds: [],
      headquarters: {
        kind: 'coastal-enclave',
        position: { q: 4, r: 4 },
        integrity: 100,
        maxIntegrity: 100,
      },
      tributeByCiv: {},
      demandByCiv: {},
      contract: null,
      intent: null,
      transitionGuards: { emittedEventKeys: [] },
    };
    before.pirates.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1',
        level: 'sighted',
        discoveredRound: 1,
        lastUpdatedRound: 1,
        knownBehavior: 'patrolling',
      },
    };
    after.pirates.intelByCiv.player = structuredClone(before.pirates.intelByCiv.player);

    expect(deriveStrategicWarningTransitions(before, after, 'player')).toEqual([]);

    after.pirates.intelByCiv.player['pirate-1'].knownBehavior = 'blockading';
    const [warning] = deriveStrategicWarningTransitions(before, after, 'player');
    expect(warning).toMatchObject({
      actorId: 'pirate-1',
      actorName: 'Pirates',
      kind: 'blockade',
      evidence: 'earned-intel',
    });
    expect(warning.actorName).not.toContain('Secret');
  });

  it('fires a blockade-kind warning when known intel escalates blockading -> besieging (#522)', () => {
    const { before, after } = fixture();
    before.pirates = createEmptyPirateState();
    after.pirates = createEmptyPirateState();
    after.pirates.factions['pirate-1'] = {
      id: 'pirate-1',
      name: 'The Iron Reef',
      spawnedRound: 1,
      behavior: 'besieging',
      maritimeStage: 3,
      notoriety: 9,
      shipIds: [],
      headquarters: {
        kind: 'coastal-enclave',
        position: { q: 4, r: 4 },
        integrity: 100,
        maxIntegrity: 100,
      },
      tributeByCiv: {},
      demandByCiv: {},
      contract: null,
      intent: null,
      transitionGuards: { emittedEventKeys: [] },
    };
    before.pirates.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1',
        level: 'sighted',
        discoveredRound: 1,
        lastUpdatedRound: 1,
        knownBehavior: 'blockading',
      },
    };
    after.pirates.intelByCiv.player = structuredClone(before.pirates.intelByCiv.player);
    after.pirates.intelByCiv.player['pirate-1'].knownBehavior = 'besieging';

    const [warning] = deriveStrategicWarningTransitions(before, after, 'player');

    // Escalating past blockading still warns (reusing the existing 'blockade' kind and
    // its accurate "review known pirate waters" message) rather than going silent --
    // the dedicated 'siege' pirate notification is the precise alert once HP damage
    // actually starts.
    expect(warning).toMatchObject({ actorId: 'pirate-1', kind: 'blockade', evidence: 'earned-intel' });
  });

  it('requires locally scouted raiders before exposing a barbarian resource warning', () => {
    const { before, after } = fixture();
    const resourceCoord = after.cities[after.civilizations.player.cities[0]!].position;
    after.map.tiles[`${resourceCoord.q},${resourceCoord.r}`].resource = 'iron';
    setVisibility(after, 'player', resourceCoord, 'visible');
    const raiderId = 'barbarian-raider';
    after.units[raiderId] = {
      id: raiderId,
      type: 'warrior',
      owner: 'barbarian',
      position: { q: resourceCoord.q + 1, r: resourceCoord.r },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    setVisibility(after, 'player', after.units[raiderId].position, 'fog');
    const barbarianPlan = makePlan(
      'camp-1',
      raiderId,
      { kind: 'resource', resource: 'iron', position: resourceCoord },
      'advancing',
    );
    barbarianPlan.objective = 'raid';
    after.opponentAI!.barbarianCamps['camp-1'] = barbarianPlan;

    expect(deriveStrategicWarningTransitions(before, after, 'player')).toEqual([]);

    setVisibility(after, 'player', after.units[raiderId].position, 'visible');
    expect(deriveStrategicWarningTransitions(before, after, 'player')).toEqual([
      expect.objectContaining({
        actorId: 'barbarian:camp-1',
        kind: 'raid',
        resource: 'iron',
      }),
    ]);
  });

  it('emits available-to-denied and denied-to-restored resource transitions exactly once', () => {
    const { before, after } = fixture();
    const city = Object.values(after.cities).find(candidate => candidate.owner === 'player')!;
    const coord = city.ownedTiles[0]!;
    const key = `${coord.q},${coord.r}`;
    for (const state of [before, after]) {
      state.map.tiles[key] = {
        ...state.map.tiles[key],
        resource: 'iron',
        improvement: 'mine',
        improvementTurnsLeft: 0,
        owner: 'player',
      };
      state.civilizations.player.techState.completed.push('bronze-working');
    }
    after.units.raider = {
      id: 'raider',
      type: 'warrior',
      owner: 'barbarian',
      position: coord,
      movementPointsLeft: 0,
      health: 100,
      experience: 0,
      hasMoved: true,
      hasActed: false,
      isResting: false,
    };

    const denied = deriveStrategicWarningTransitions(before, after, 'player');
    expect(denied).toEqual([
      expect.objectContaining({
        kind: 'resource-denied',
        resource: 'iron',
        target: { kind: 'map', coord, label: expect.any(String) },
      }),
    ]);
    expect(deriveStrategicWarningTransitions(after, after, 'player')).toEqual([]);

    const restored = structuredClone(after);
    delete restored.units.raider;
    restored.turn++;
    expect(deriveStrategicWarningTransitions(after, restored, 'player')).toEqual([
      expect.objectContaining({ kind: 'resource-restored', resource: 'iron' }),
    ]);
    expect(deriveStrategicWarningTransitions(restored, restored, 'player')).toEqual([]);
  });

  it('ignores non-hostile, transported, and second-occupier resource near misses', () => {
    const { before, after } = fixture();
    const city = Object.values(after.cities).find(candidate => candidate.owner === 'player')!;
    const coord = city.ownedTiles[0]!;
    const key = `${coord.q},${coord.r}`;
    for (const state of [before, after]) {
      state.map.tiles[key] = {
        ...state.map.tiles[key],
        resource: 'iron',
        improvement: 'mine',
        improvementTurnsLeft: 0,
        owner: 'player',
      };
      state.civilizations.player.techState.completed.push('bronze-working');
    }
    after.units.cargo = {
      id: 'cargo',
      type: 'warrior',
      owner: 'barbarian',
      transportId: 'transport',
      position: coord,
    } as GameState['units'][string];
    expect(deriveStrategicWarningTransitions(before, after, 'player')).toEqual([]);

    delete after.units.cargo;
    after.units.neutral = {
      id: 'neutral',
      type: 'warrior',
      owner: 'ai-1',
      position: coord,
    } as GameState['units'][string];
    expect(deriveStrategicWarningTransitions(before, after, 'player')).toEqual([]);

    const deniedBefore = structuredClone(before);
    const deniedAfter = structuredClone(after);
    delete deniedAfter.units.neutral;
    for (const state of [deniedBefore, deniedAfter]) {
      state.units.raider = {
        id: 'raider',
        type: 'warrior',
        owner: 'barbarian',
        position: coord,
      } as GameState['units'][string];
    }
    deniedAfter.units.raider.id = 'replacement-raider';
    expect(deriveStrategicWarningTransitions(deniedBefore, deniedAfter, 'player')).toEqual([]);
  });

  it('emits recovery only from an explicit pressure-ledger resolution', () => {
    const { before, after } = fixture();
    before.opponentAI!.pressureByCiv.player.activeIndependentThreatIds = ['barbarian:camp-1'];
    after.opponentAI!.pressureByCiv.player = {
      ...after.opponentAI!.pressureByCiv.player,
      activeIndependentThreatIds: [],
      lastResolvedThreatTurn: after.turn,
      recoveryUntilTurn: after.turn + 2,
    };

    expect(deriveStrategicWarningTransitions(before, after, 'player'))
      .toEqual([expect.objectContaining({ kind: 'recovery' })]);
  });

  it('applies dedup ledger updates immutably and emits at most one audio request per viewer round', () => {
    const { before, after, aiId, aiUnitId } = fixture();
    setVisibility(after, 'player', after.units[aiUnitId].position, 'visible');
    after.opponentAI!.majorCivs[aiId].primaryPlan = makePlan(aiId, aiUnitId, {
      kind: 'region',
      id: 'border',
      anchor: { q: 4, r: 4 },
    });
    const snapshot = structuredClone(after);
    const bus = new EventBus();
    const warnings: unknown[] = [];
    bus.on('ai:strategic-warning', warning => warnings.push(warning));

    const applied = applyStrategicWarningTransitions(before, after, bus);

    expect(warnings).toHaveLength(1);
    expect(warnings.filter((warning: any) => warning.playAudio)).toHaveLength(1);
    expect(Object.keys(applied.opponentAI!.pressureByCiv.player.lastWarningTurnByKey))
      .toHaveLength(1);
    expect(after).toEqual(snapshot);
    expect(deriveStrategicWarningTransitions(before, applied, 'player')).toEqual([]);
  });
});
