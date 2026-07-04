import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import type { City, GameState, Unit } from '@/core/types';
import { normalizeLoadedState } from '@/storage/save-manager';
import {
  destroyPirateFaction,
  hirePirateFlotilla,
  payPirateTribute,
  recordPirateContractRaid,
} from '@/systems/pirate-actions';
import { processPirateEcology } from '@/systems/pirate-ecology';
import { choosePirateIntent, PIRATE_BEHAVIOR_SEARCH_LIMITS } from '@/systems/pirate-behavior';
import { deliverPirateActivationWarnings } from '@/systems/pirate-notifications';
import { getPirateWatersPresentation, refreshPirateIntel } from '@/systems/pirate-presentation';
import { processPiratesForCompletedRound } from '@/systems/pirate-system';

const PROJECT_ROOT = resolve(__dirname, '../..');

function scenarioState(): GameState {
  const state = createNewGame(undefined, 'pirate-e2e', 'small');
  const tiles: GameState['map']['tiles'] = {};
  for (let q = 0; q < 10; q++) {
    for (let r = 0; r < 10; r++) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: 'ocean', elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  tiles['2,2'] = { ...tiles['2,2'], terrain: 'plains' };
  tiles['2,1'] = { ...tiles['2,1'], terrain: 'coast' };
  state.map = { width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles };
  state.turn = 1;
  state.units = {};
  state.cities = {};
  state.pirates = createEmptyPirateState();
  for (const civ of Object.values(state.civilizations)) {
    civ.units = [];
    civ.cities = [];
    civ.gold = 1_000;
    civ.visibility = { tiles: {}, lastSeen: {} };
  }
  return state;
}

describe('pirate feature completion gate', () => {
  it('contains no runtime readiness flag and disables the retired legacy pirate loop', () => {
    const definitions = readFileSync(resolve(PROJECT_ROOT, 'src/systems/pirate-definitions.ts'), 'utf8');
    const turns = readFileSync(resolve(PROJECT_ROOT, 'src/core/turn-manager.ts'), 'utf8');
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    expect(definitions).not.toContain('PIRATE_IMPLEMENTATION_READY');
    expect(turns).not.toContain('PIRATE_IMPLEMENTATION_READY');
    expect(turns).toContain('includeLegacyPirates: false');
    expect(turns).not.toContain('processPirateFleets(');
    expect(main).not.toContain("bus.on('threat:pirate-");
    expect(main).not.toContain('(gameState as any).pirateFleets');
  });
});

describe('deterministic pirate campaign lifecycle', () => {
  it('preserves validated purposeful fleet intent across save normalization', () => {
    const state = scenarioState();
    const flagship: Unit = {
      id: 'flagship',
      type: 'pirate_frigate',
      owner: 'pirate-1',
      position: { q: 4, r: 4 },
      movementPointsLeft: 4,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    state.units[flagship.id] = flagship;
    const target: Unit = {
      ...flagship,
      id: 'target',
      type: 'transport',
      owner: 'player',
      position: { q: 6, r: 4 },
    };
    state.units[target.id] = target;
    state.civilizations.player.units = [target.id];
    state.pirates!.factions['pirate-1'] = {
      id: 'pirate-1',
      name: 'The Red Wake',
      spawnedRound: 1,
      behavior: 'raiding',
      maritimeStage: 3,
      notoriety: 2,
      shipIds: [flagship.id],
      headquarters: {
        kind: 'deep-sea-flotilla',
        flagshipUnitId: flagship.id,
        relocation: { planned: null, lastRelocatedRound: null },
      },
      tributeByCiv: {},
      demandByCiv: {},
      contract: null,
      intent: {
        kind: 'raid',
        targetCivId: 'player',
        targetUnitId: target.id,
        plannedRound: 1,
        lastProgressRound: 1,
        lastTargetDistance: 2,
        mode: 'engage',
        leaderUnitId: flagship.id,
      },
      transitionGuards: { emittedEventKeys: [] },
    };

    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)) as GameState);

    expect(loaded.pirates!.factions['pirate-1'].intent).toEqual(
      state.pirates!.factions['pirate-1'].intent,
    );
  });

  it('composes activation, spawn, save/load, tribute, contract, exposure bookkeeping, and destruction', () => {
    const state = scenarioState();
    expect(processPirateEcology(state, new EventBus(), 'before-galleys')).toBe(state);

    state.civilizations.player.techState.completed.push('galleys');
    const activated = processPirateEcology(state, new EventBus(), 'activate');
    expect(activated.pirates!.activatedTurn).toBe(1);
    const warned = deliverPirateActivationWarnings(activated);
    const warnedAgain = deliverPirateActivationWarnings(warned);
    expect(warned.notificationLog!.player.filter(entry => /pirate waters/i.test(entry.message))).toHaveLength(1);
    expect(warnedAgain.notificationLog!.player).toEqual(warned.notificationLog!.player);

    warned.turn = warned.pirates!.nextSpawnCheckTurn;
    let spawned = processPirateEcology(warned, new EventBus(), 'spawn');
    const factionId = Object.keys(spawned.pirates!.factions)[0]!;
    expect(factionId).toMatch(/^pirate-/);
    const factionAtSpawn = spawned.pirates!.factions[factionId];
    const headquartersPosition = factionAtSpawn.headquarters.kind === 'coastal-enclave'
      ? factionAtSpawn.headquarters.position
      : spawned.units[factionAtSpawn.headquarters.flagshipUnitId].position;
    spawned.pirates!.intelByCiv.player = {
      [factionId]: {
        factionId: factionAtSpawn.id, level: 'rumor', discoveredRound: spawned.turn,
        lastUpdatedRound: spawned.turn, approximateRegion: { center: { q: 0, r: 0 }, radius: 4 },
      },
    };
    expect(getPirateWatersPresentation(spawned, 'player').factions[0].name).toBe('Unknown pirate faction');
    spawned.civilizations.player.visibility.tiles[`${headquartersPosition.q},${headquartersPosition.r}`] = 'visible';
    spawned = refreshPirateIntel(spawned, 'player');
    expect(spawned.pirates!.intelByCiv.player[factionId].level).toBe('sighted');
    expect(getPirateWatersPresentation(spawned, 'player').factions[0].name).toBe(factionAtSpawn.name);

    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(spawned)) as GameState);
    const continuationTurn = loaded.turn + 1;
    const firstContinuation = processPiratesForCompletedRound({ ...loaded, turn: continuationTurn }, new EventBus());
    const replayLoaded = normalizeLoadedState(JSON.parse(JSON.stringify(loaded)) as GameState);
    const replayContinuation = processPiratesForCompletedRound(
      { ...replayLoaded, turn: continuationTurn },
      new EventBus(),
    );
    expect(replayContinuation.state.pirates).toEqual(firstContinuation.state.pirates);
    expect(firstContinuation.trace).toBeDefined();

    let actionState: GameState = loaded;
    const faction = actionState.pirates!.factions[factionId];
    faction.demandByCiv.player = { demandedRound: actionState.turn, lastReminderRound: null, quotedCost: 15 };
    const tribute = payPirateTribute(actionState, factionId, 'player');
    expect(tribute.success).toBe(true);
    actionState = tribute.state;
    expect(actionState.pirates!.factions[factionId].tributeByCiv.player.protectedUntilRound)
      .toBe(actionState.turn + 15);

    const flagshipId = actionState.pirates!.factions[factionId].shipIds[0]!;
    actionState.turn += 16;
    actionState.pirates!.factions[factionId] = {
      ...actionState.pirates!.factions[factionId],
      behavior: 'raiding', maritimeStage: 5, tributeByCiv: {},
      headquarters: {
        kind: 'deep-sea-flotilla', flagshipUnitId: flagshipId,
        relocation: { planned: null, lastRelocatedRound: null },
      },
    };
    const targetCity: City = {
      id: 'target-port', name: 'Target Port', owner: 'ai-1', position: { q: 2, r: 2 },
      population: 3, food: 0, foodNeeded: 15, buildings: [], productionQueue: [], productionProgress: 0,
      ownedTiles: [{ q: 2, r: 2 }], workedTiles: [], focus: 'balanced', maturity: 'town',
      unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
    };
    actionState.cities[targetCity.id] = targetCity;
    actionState.civilizations['ai-1'].cities = [targetCity.id];
    actionState.civilizations.player.diplomacy.relationships['ai-1'] = 0;
    actionState.civilizations.player.visibility.tiles['2,2'] = 'fog';

    const hired = hirePirateFlotilla(actionState, factionId, 'player', 'ai-1');
    expect(hired.success).toBe(true);
    const raid = recordPirateContractRaid(hired.state, factionId, 'e2e-raid');
    expect(raid.state.pirates!.factions[factionId].contract?.successfulRaidCount).toBe(1);
    expect(recordPirateContractRaid(raid.state, factionId, 'e2e-raid').state).toBe(raid.state);

    const destroyed = destroyPirateFaction(raid.state, {
      factionId, destroyedByOwnerId: 'player', reason: 'combat',
    });
    expect(destroyed.destroyed).toBe(true);
    expect(destroyed.state.pirates!.factions[factionId]).toBeUndefined();
    expect(destroyed.state.pirates!.history.filter(entry => entry.kind === 'destroyed' && entry.factionId === factionId))
      .toHaveLength(1);
    expect(destroyPirateFaction(destroyed.state, {
      factionId, destroyedByOwnerId: 'player', reason: 'combat',
    }).destroyed).toBe(false);
  });
});

describe('pirate performance budgets', () => {
  it('defers habitat scans, bounds five-faction targeting, and projects Pirate Waters without a tile scan', () => {
    const state = scenarioState();
    state.settings.mapSize = 'large';
    state.civilizations.player.techState.completed = ['galleys'];
    state.pirates = {
      ...createEmptyPirateState(), activatedTurn: 1, nextSpawnCheckTurn: 100,
    };
    state.pirates.intelByCiv.player = {};
    let tileScans = 0;
    state.map.tiles = new Proxy(state.map.tiles, {
      ownKeys(target) {
        tileScans += 1;
        return Reflect.ownKeys(target);
      },
    });
    const notDueState = { ...state, turn: 99 };
    expect(processPirateEcology(notDueState, new EventBus(), 'not-due')).toBe(notDueState);
    expect(tileScans).toBe(0);

    let candidateTypeReads = 0;
    for (let index = 0; index < 40; index++) {
      const candidate = {
        id: `candidate-${index}`,
        owner: 'player',
        position: { q: index % 10, r: Math.floor(index / 10) },
        movementPointsLeft: 2, health: 100, experience: 0,
        hasMoved: false, hasActed: false, isResting: false,
      } as Unit;
      Object.defineProperty(candidate, 'type', {
        enumerable: true,
        get: () => {
          candidateTypeReads += 1;
          return 'galley';
        },
      });
      state.units[candidate.id] = candidate;
    }
    for (let index = 1; index <= 5; index++) {
      const factionId = `pirate-${index}` as PirateFactionState['id'];
      const shipId = `performance-ship-${index}`;
      state.units[shipId] = {
        id: shipId, type: 'pirate_frigate', owner: factionId,
        position: { q: index, r: index }, movementPointsLeft: 4, health: 100,
        experience: 0, hasMoved: false, hasActed: false, isResting: false,
      };
      const faction: PirateFactionState = {
        id: factionId, name: `Performance Fleet ${index}`, spawnedRound: 1,
        behavior: 'raiding', maritimeStage: 3, notoriety: 2, shipIds: [shipId],
        headquarters: { kind: 'deep-sea-flotilla', flagshipUnitId: shipId, relocation: { planned: null, lastRelocatedRound: null } },
        tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
        transitionGuards: { emittedEventKeys: [] },
      };
      state.pirates.factions[factionId] = faction;
      state.pirates.intelByCiv.player[factionId] = {
        factionId, level: 'rumor', discoveredRound: 1, lastUpdatedRound: 1,
        approximateRegion: { center: { q: index, r: index }, radius: 4 },
      };
    }

    for (const factionId of Object.keys(state.pirates.factions)) choosePirateIntent(state, factionId);
    expect(candidateTypeReads).toBeLessThanOrEqual(
      Object.keys(state.pirates.factions).length * PIRATE_BEHAVIOR_SEARCH_LIMITS.units * 3,
    );
    const scansBeforeProjection = tileScans;
    expect(getPirateWatersPresentation(state, 'player').factions).toHaveLength(5);
    expect(tileScans).toBe(scansBeforeProjection);
  });
});
