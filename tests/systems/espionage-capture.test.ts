import { describe, it, expect } from 'vitest';
import {
  expelSpy, executeSpy, startInterrogation, processInterrogation,
  getSpyCaptureRelationshipPenalty,
  createEspionageCivState, createSpyFromUnit,
} from '@/systems/espionage-system';

describe('relational penalty by distance', () => {
  it('returns 0 when spy is more than 5 hexes from any city', () => {
    expect(getSpyCaptureRelationshipPenalty(10)).toBe(0);
  });
  it('returns -10 when spy is 2-5 hexes from city', () => {
    expect(getSpyCaptureRelationshipPenalty(3)).toBe(-10);
  });
  it('returns -25 when spy is 1 hex from city', () => {
    expect(getSpyCaptureRelationshipPenalty(1)).toBe(-25);
  });
  it('returns -50 when spy is inside city (distance 0)', () => {
    expect(getSpyCaptureRelationshipPenalty(0)).toBe(-50);
  });
});

describe('expelSpy', () => {
  it('sets spy cooldownTurns to 15 and status to cooldown', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    const result = expelSpy(civEsp, 'unit-1', 15);
    expect(result.spies['unit-1'].status).toBe('cooldown');
    expect(result.spies['unit-1'].cooldownTurns).toBe(15);
    expect(result.spies['unit-1'].stolenTechFrom).toEqual({});
  });

  it('clears infiltrationCityId and targetCivId on expulsion', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    civEsp = {
      ...civEsp,
      spies: { 'unit-1': { ...civEsp.spies['unit-1'], infiltrationCityId: 'city-x', targetCivId: 'enemy' } },
    };
    const result = expelSpy(civEsp, 'unit-1', 15);
    expect(result.spies['unit-1'].infiltrationCityId).toBeNull();
    expect(result.spies['unit-1'].targetCivId).toBeNull();
  });
});

describe('executeSpy', () => {
  it('removes spy record entirely', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    const result = executeSpy(civEsp, 'unit-1');
    expect(result.spies['unit-1']).toBeUndefined();
  });

  it('does not remove other spies', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 2 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed1'));
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-2', 'player', 'spy_scout', 'seed2'));
    const result = executeSpy(civEsp, 'unit-1');
    expect(result.spies['unit-2']).toBeDefined();
  });
});

describe('interrogation', () => {
  it('starts with 4 turns remaining', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    const result = startInterrogation(civEsp, 'unit-1', 'player');
    const record = Object.values(result.activeInterrogations ?? {})[0]!;
    expect(record.turnsRemaining).toBe(4);
    expect(record.spyOwner).toBe('player');
  });

  it('after 4 turns the record is removed', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    let state = startInterrogation(civEsp, 'unit-1', 'player');
    for (let i = 0; i < 4; i++) {
      state = processInterrogation(state, `interro-seed-${i}`, {} as any).state;
    }
    expect(Object.values(state.activeInterrogations ?? {})).toHaveLength(0);
  });

  it('decrements turnsRemaining each call', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    let state = startInterrogation(civEsp, 'unit-1', 'player');
    state = processInterrogation(state, 'seed-1', {} as any).state;
    const record = Object.values(state.activeInterrogations ?? {})[0];
    expect(record?.turnsRemaining).toBe(3);
  });

  it('complete flag is true only on the final turn', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    let state = startInterrogation(civEsp, 'unit-1', 'player');
    let complete = false;
    for (let i = 0; i < 4; i++) {
      const result = processInterrogation(state, `s-${i}`, {} as any);
      state = result.state;
      complete = result.complete;
    }
    expect(complete).toBe(true);
  });
});
