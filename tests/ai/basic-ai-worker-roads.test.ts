import { describe, expect, it } from 'vitest';
import type { City, GameState, HexCoord, HexTile } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processImprovementTurns } from '@/systems/improvement-turn-system';

// Regression for a pre-existing bug found while implementing world-pressure MR4 (#530):
// no AIStrategicPlan ever declares a 'worker' required role (only
// frontline/ranged/capture/resource-expedition/naval-combat do, per every
// requiredRoles literal in ai-plan-portfolio.ts/ai-prepared-turn.ts), and 'worker' has
// no COMPATIBLE_ROLES fallback in ai-unit-assignment.ts either -- so workers never enter
// assignedUnitIds and never reach processMajorCivStrategicTurn's tactical dispatch. The
// road-building decision logic already written in ai-tactics.ts's
// rankCivilianAndTransportActions (chooseRoadBuilderUnit + the getAvailableWorkerActions
// fallback) was therefore dead code -- ai-tactics.test.ts's existing unit tests call
// rankUnitTacticalActions directly, which bypasses the plan-assignment gap entirely and
// never caught this. basic-ai.ts's processAITurnInternal now applies the same decision
// logic administratively (mirroring the MR4 catastrophe-restoration loop). This test
// exercises a real AI round end to end -- not a direct rankUnitTacticalActions call --
// to prove a worker actually walks to the target and builds the road.
function makeCity(id: string, owner: string, position: HexCoord): City {
  return {
    id, name: id, owner, position, population: 5, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [position], workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
  };
}

// Capital (q=0) and outpost (q=4) sit on a flat, unclaimed (owner: null) grassland
// corridor -- ownerless tiles never trip canBuildRoad's "outside-territory" check, so
// unlike the MR4 fixture this scenario doesn't need to dodge recalculateTerritory().
// getRoadBuildTarget walks the path outward from the capital and picks the first
// non-city, buildable tile -- (q=1, r=0) here, matching the identical two-city-gap
// case already proven in tests/systems/road-network.test.ts.
function buildRoadBuilderScenario(): { state: GameState; civId: string; targetKey: string } {
  const civId = 'ai-1';
  const base = createNewGame(undefined, 'ai-worker-road-e2e', 'small');

  const capitalPos: HexCoord = { q: 0, r: 0 };
  const outpostPos: HexCoord = { q: 4, r: 0 };
  const workerPos: HexCoord = { q: -3, r: 0 };
  const targetPos: HexCoord = { q: 1, r: 0 };

  const capital = makeCity('ai-capital', civId, capitalPos);
  const outpost = makeCity('ai-outpost', civId, outpostPos);

  const tiles: Record<string, HexTile> = { ...base.map.tiles };
  for (let q = -3; q <= 4; q++) {
    const coord: HexCoord = { q, r: 0 };
    tiles[hexKey(coord)] = {
      coord, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
  }

  const worker = createUnit('worker', civId, workerPos, base.idCounters);

  const state: GameState = {
    ...base,
    cities: { [capital.id]: capital, [outpost.id]: outpost },
    units: { [worker.id]: worker },
    map: { ...base.map, tiles },
    civilizations: {
      ...base.civilizations,
      [civId]: {
        ...base.civilizations[civId],
        cities: [capital.id, outpost.id],
        units: [worker.id],
        techState: { ...base.civilizations[civId].techState, completed: ['road-building'] },
      },
    },
  };
  return { state, civId, targetKey: hexKey(targetPos) };
}

function runRounds(state: GameState, rounds: number): GameState {
  const bus = new EventBus();
  let current = state;
  for (let round = 0; round < rounds; round++) {
    const completed = runCompletedRound(current, bus, {
      improvements: (s, eb) => processImprovementTurns(s, eb),
      majors: (s, eb) => processNonHumanMajorRound(s, eb).state,
      world: (s, eb) => processTurn(s, eb),
    });
    if (!completed.ok) throw new Error(`round ${round + 1} failed`, { cause: completed.error });
    current = completed.state;
    completed.events.commitTo(bus);
  }
  return current;
}

describe('AI worker road-building — end to end (dead-code fix found during #526 MR4/MR5)', () => {
  it('an idle AI worker walks to the road target and builds the road over several real AI turns', () => {
    const { state, targetKey } = buildRoadBuilderScenario();
    expect(state.map.tiles[targetKey]?.hasRoad).toBeFalsy();

    // Distance from the worker's start (q=-3) to the target (q=1) is 4 tiles, and the
    // administrative loop moves one step per AI turn (matching the MR4 restoration
    // loop's own single-step-per-round behavior) -- so completion genuinely spans
    // several turns: ~4 to arrive, 1 to start the build, 2 more for the build tick
    // (ROAD_BUILD_TURNS). 12 rounds leaves generous margin, same as the MR4 fixture.
    const afterFewRounds = runRounds(state, 3);
    expect(afterFewRounds.map.tiles[targetKey]?.hasRoad).toBeFalsy();

    const final = runRounds(afterFewRounds, 9);
    expect(final.map.tiles[targetKey]?.hasRoad).toBe(true);
  });

  it('does nothing without road-building tech (negative)', () => {
    const { state, civId, targetKey } = buildRoadBuilderScenario();
    state.civilizations[civId]!.techState.completed = [];

    const final = runRounds(state, 12);

    expect(final.map.tiles[targetKey]?.hasRoad).toBeFalsy();
  });
});
