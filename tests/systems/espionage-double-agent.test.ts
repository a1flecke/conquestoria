import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameEvents, GameState, Spy, SpyMissionType } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import {
  createEspionageCivState,
  DEBRIEF_TURNS,
  finishDebrief,
  getMissionStartDenial,
  processEspionageTurn,
  startDebrief,
} from '@/systems/espionage-system';
import { startMissionState } from '../helpers/espionage-mission';

// A turned spy used to be inert: `feedsFalseIntel` was never read, and the owner's only tool was a free, instant
// "verify agent" button that appeared on the turned spy alone (so it gave the secret away). A double agent's reports
// now lie, any stationed spy can be debriefed, and a debrief that exposes the agent strikes the false reports.

function spy(id: string, overrides: Partial<Spy> = {}): Spy {
  return {
    id, owner: 'player', name: `Agent ${id}`, unitType: 'spy_scout',
    targetCivId: null, targetCityId: null, position: null,
    status: 'idle', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false,
    feedsFalseIntel: false,
    ...overrides,
  };
}

function fixture(spyOverrides: Partial<Spy> = {}) {
  let state = createNewGame(undefined, 'double-agent-reports', 'small');
  const targetCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
  const startPos = state.units[state.civilizations[targetCivId].units[0]].position;
  const city = foundCity(targetCivId, startPos, state.map, state.idCounters);
  state = {
    ...state,
    cities: { ...state.cities, [city.id]: { ...city, ownedTiles: [startPos] } },
    civilizations: {
      ...state.civilizations,
      [targetCivId]: { ...state.civilizations[targetCivId], cities: [city.id], gold: 250 },
    },
    espionage: {
      player: {
        ...createEspionageCivState(),
        spies: { 'spy-1': spy('spy-1', { status: 'stationed', targetCivId, targetCityId: city.id, position: city.position, ...spyOverrides }) },
      },
      [targetCivId]: createEspionageCivState(),
    },
  };
  return { state, targetCivId, cityId: city.id };
}

/** Run one mission to a success (the first turn whose draw succeeds), returning the resulting state. */
function succeed(base: GameState, missionType: SpyMissionType): GameState {
  for (let turn = 1; turn <= 200; turn++) {
    const started = startMissionState(base.espionage!.player, 'spy-1', missionType);
    started.spies['spy-1'].currentMission!.turnsRemaining = 1;
    const state: GameState = { ...base, turn, espionage: { ...base.espionage!, player: started } };
    const bus = new EventBus();
    let acquired = false;
    bus.on('espionage:intel-report-acquired', () => { acquired = true; });
    const result = processEspionageTurn(state, bus);
    if (acquired) return result;
  }
  throw new Error(`${missionType} never succeeded`);
}

describe('a double agent sends home false reports', () => {
  it('a loyal spy reports the true treasury and tech count, and records no false report', () => {
    const { state, targetCivId } = fixture();
    const result = succeed(state, 'gather_intel');
    const report = result.espionage!.player.intelReports![targetCivId];
    expect(report.treasury).toBe(250);
    expect(report.completedTechCount).toBe(result.civilizations[targetCivId].techState.completed.length);
    expect(result.espionage!.player.spies['spy-1'].falseReports).toBeUndefined();
  });

  it('a turned spy skews the treasury and remembers the report it falsified', () => {
    const { state, targetCivId } = fixture({ turnedBy: 'someone', feedsFalseIntel: true, turnedOnTurn: 0 });
    const result = succeed(state, 'gather_intel');
    const report = result.espionage!.player.intelReports![targetCivId];
    expect([125, 500]).toContain(report.treasury);
    expect(result.espionage!.player.spies['spy-1'].falseReports).toEqual([
      { kind: 'intel', key: targetCivId, turn: report.turn },
    ]);
  });

  it('a turned spy halves or doubles the troops it reports', () => {
    const honest = succeed(fixture().state, 'monitor_troops');
    const { state, cityId } = fixture({ turnedBy: 'someone', feedsFalseIntel: true, turnedOnTurn: 0 });
    const lying = succeed(state, 'monitor_troops');
    const truth = honest.espionage!.player.troopObservations![cityId].units.length;
    const told = lying.espionage!.player.troopObservations![cityId].units.length;
    expect(told).not.toBe(truth);
    expect(told === truth * 2 || told < truth).toBe(true);
  });
});

describe('debriefing a stationed spy', () => {
  it('takes the spy off missions until it ends', () => {
    const { state } = fixture();
    const started = startDebrief(state.espionage!.player, 'spy-1', 10);
    expect(started.ok).toBe(true);
    expect(started.state.spies['spy-1'].debriefUntilTurn).toBe(10 + DEBRIEF_TURNS);
    expect(getMissionStartDenial(started.state, 'spy-1', 'gather_intel')).toBe('spy-debriefing');
  });

  it('is refused, with a reason, for a spy that is not stationed abroad', () => {
    const { state } = fixture({ status: 'embedded' });
    const refused = startDebrief(state.espionage!.player, 'spy-1', 10);
    expect(refused).toMatchObject({ ok: false, reason: 'not-stationed' });
  });

  it('never exposes a loyal spy, whatever the draw', () => {
    const { state } = fixture({ debriefUntilTurn: 5 });
    for (const roll of [0, 0.5, 0.99]) {
      const outcome = finishDebrief(state.espionage!.player, 'spy-1', 5, roll);
      expect(outcome.exposed).toBeUndefined();
      expect(outcome.state.spies['spy-1'].debriefUntilTurn).toBeUndefined();
      expect(outcome.state.spies['spy-1'].lastDebriefTurn).toBe(5);
    }
  });

  it('can miss a double agent: a draw above the chance leaves it turned', () => {
    const { state } = fixture({ turnedBy: 'rival', feedsFalseIntel: true, debriefUntilTurn: 5 });
    const outcome = finishDebrief(state.espionage!.player, 'spy-1', 5, 0.99);
    expect(outcome.exposed).toBeUndefined();
    expect(outcome.state.spies['spy-1'].turnedBy).toBe('rival');
  });

  it('exposing a double agent strikes the reports it falsified, but not one written since by someone else', () => {
    const { state, targetCivId, cityId } = fixture({ turnedBy: 'rival', feedsFalseIntel: true, turnedOnTurn: 2, debriefUntilTurn: 8 });
    const falseReports = [{ kind: 'intel' as const, key: 'civ-x', turn: 4 }, { kind: 'troops' as const, key: cityId, turn: 5 }];
    const civEsp = {
      ...state.espionage!.player,
      spies: { 'spy-1': { ...state.espionage!.player.spies['spy-1'], falseReports } },
      intelReports: { 'civ-x': { turn: 4, completedTechCount: 9, currentResearch: null, researchProgress: 0, treasury: 999, treaties: [] } },
      // Replaced on turn 7 by an honest report: must survive.
      troopObservations: { [cityId]: { turn: 7, targetCivId, units: [] } },
    };
    const outcome = finishDebrief(civEsp, 'spy-1', 8, 0);
    expect(outcome.exposed).toEqual({ captorCivId: 'rival', falseReportCount: 2, turnsTurned: 6 });
    expect(outcome.state.intelReports).toEqual({});
    expect(outcome.state.troopObservations?.[cityId]?.turn).toBe(7);
    const after = outcome.state.spies['spy-1'];
    expect(after.turnedBy).toBeUndefined();
    expect(after.feedsFalseIntel).toBe(false);
    expect(after.falseReports).toBeUndefined();
  });

  it('the espionage turn finishes a due debrief and tells the owner (and the captor) exactly once', () => {
    const { state } = fixture({ turnedBy: 'rival', feedsFalseIntel: true, turnedOnTurn: 1 });
    const exposedTurns: number[] = [];
    let cleanTurns = 0;
    // Run the same due debrief on many turns: each turn's draw decides, and the result is one of the two notices.
    for (let turn = 2; turn <= 40; turn++) {
      const due: GameState = {
        ...state,
        turn,
        espionage: { ...state.espionage!, player: startDebrief(state.espionage!.player, 'spy-1', turn - DEBRIEF_TURNS).state },
      };
      const bus = new EventBus();
      const exposed: GameEvents['espionage:double-agent-exposed'][] = [];
      let clean = 0;
      bus.on('espionage:double-agent-exposed', e => exposed.push(e));
      bus.on('espionage:debrief-clean', () => { clean += 1; });
      const result = processEspionageTurn(due, bus);
      expect(exposed.length + clean).toBe(1);
      expect(result.espionage!.player.spies['spy-1'].debriefUntilTurn).toBeUndefined();
      if (exposed.length) {
        expect(exposed[0]).toMatchObject({ ownerCivId: 'player', captorCivId: 'rival', spyId: 'spy-1' });
        exposedTurns.push(turn);
      } else cleanTurns += 1;
    }
    // About three in four debriefs catch the agent.
    expect(exposedTurns.length).toBeGreaterThan(cleanTurns);
    expect(cleanTurns).toBeGreaterThan(0);
  });

  it('recalling a spy abandons its debrief', async () => {
    const { recallSpy } = await import('@/systems/espionage-system');
    const { state } = fixture({ debriefUntilTurn: 9 });
    expect(recallSpy(state.espionage!.player, 'spy-1').spies['spy-1'].debriefUntilTurn).toBeUndefined();
  });
});

describe('capture and turning', () => {
  it('a spy caught on a mission is not turned on the spot; the captor turns it once, the next turn', () => {
    const { state, targetCivId } = fixture();
    const captor = state.civilizations[targetCivId];
    const base: GameState = {
      ...state,
      civilizations: {
        ...state.civilizations,
        [targetCivId]: { ...captor, techState: { ...captor.techState, completed: [...captor.techState.completed, 'counter-intelligence'] } },
      },
    };
    for (let turn = 1; turn <= 300; turn++) {
      const started = startMissionState(base.espionage!.player, 'spy-1', 'gather_intel');
      started.spies['spy-1'].currentMission!.turnsRemaining = 1;
      const bus = new EventBus();
      let captured = false;
      let turnedNotices = 0;
      bus.on('espionage:spy-captured', () => { captured = true; });
      bus.on('espionage:spy-detected', () => { turnedNotices += 1; });
      const after = processEspionageTurn({ ...base, turn, espionage: { ...base.espionage!, player: started } }, bus);
      if (!captured) continue;

      const caught = after.espionage!.player.spies['spy-1'];
      expect(caught.status).toBe('captured');
      expect(caught.capturedOnTurn).toBe(turn);
      expect(caught.turnedBy).toBeUndefined();
      expect(turnedNotices).toBe(0);

      const nextBus = new EventBus();
      let nextNotices = 0;
      nextBus.on('espionage:spy-detected', () => { nextNotices += 1; });
      const next = processEspionageTurn({ ...after, turn: turn + 1 }, nextBus);
      expect(next.espionage!.player.spies['spy-1']).toMatchObject({ status: 'stationed', turnedBy: targetCivId, turnedOnTurn: turn + 1 });
      expect(nextNotices).toBe(1);
      return;
    }
    throw new Error('the spy was never captured');
  });
});
