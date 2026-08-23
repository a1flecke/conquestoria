import { describe, expect, it } from 'vitest';
import {
  breakRogueElephantHostCommand,
  getRogueElephantHostProfile,
  getRogueElephantStrength,
  getRogueHandlerStrength,
  getRogueElephantCommandFact,
  getRogueElephantHostTarget,
  processRogueElephantHostTurn,
  startRogueElephantHostWarning,
} from '@/systems/rogue-elephant-host-system';
import { createNewGame } from '@/core/game-state';
import { TECH_TREE } from '@/systems/tech-definitions';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';

describe('Rogue Elephant Host definitions', () => {
  it.each([
    [4, 22, 40],
    [6, 28, 48],
    [9, 37, 60],
  ])('uses the exact era-%i Handler and elephant strengths', (era, handler, elephant) => {
    expect(getRogueHandlerStrength(era)).toBe(handler);
    expect(getRogueElephantStrength(era)).toBe(elephant);
  });

  it.each([
    ['explorer', 1],
    ['standard', 2],
    ['veteran', 3],
  ] as const)('assigns %i elephants to the %s human-target profile', (severity, elephantCount) => {
    expect(getRogueElephantHostProfile(severity, true).elephantCount).toBe(elephantCount);
  });

  it('keeps AI-targeted Host pressure at Standard severity', () => {
    expect(getRogueElephantHostProfile('explorer', false).elephantCount).toBe(2);
    expect(getRogueElephantHostProfile('veteran', false).elephantCount).toBe(2);
  });

  it('creates a one-turn warning with one Handler and the selected severity’s elephants', () => {
    const state = createNewGame('rome', 'rogue-host-warning', 'small');
    const targetCivId = state.currentPlayer;
    state.civilizations[targetCivId]!.techState.completed = TECH_TREE.filter(tech => tech.era <= 4).map(tech => tech.id);
    const settler = Object.values(state.units).find(unit => unit.owner === targetCivId && unit.type === 'settler')!;
    const city = foundCity(targetCivId, settler.position, state.map, state.idCounters);
    state.cities = { [city.id]: city };
    for (const position of mapNeighbors(state.map, city.position)) {
      const key = hexKey(position);
      if (state.map.tiles[key]) state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'plains' };
    }
    state.units = Object.fromEntries(Object.entries(state.units).filter(([, unit]) =>
      !mapNeighbors(state.map, city.position).some(position => hexKey(position) === hexKey(unit.position)),
    ));

    const warning = startRogueElephantHostWarning(state, targetCivId, 'standard');
    const forceId = warning.rogueElephantHosts?.[targetCivId]?.forceId;

    expect(warning.rogueElephantHosts?.[targetCivId]).toMatchObject({ phase: 'warning', targetCivId });
    expect(forceId).toBeDefined();
    expect(warning.crisisForces?.[forceId!]?.unitIds).toHaveLength(3);
    expect(Object.values(warning.units).filter(unit => unit.owner === 'crisis-force').every(unit => unit.hasActed === false)).toBe(true);
  });

  it('applies one command fact only while the active Handler is within two hexes', () => {
    const state = createNewGame('rome', 'rogue-host-command', 'small');
    const targetCivId = state.currentPlayer;
    state.civilizations[targetCivId]!.techState.completed = TECH_TREE.filter(tech => tech.era <= 4).map(tech => tech.id);
    const settler = Object.values(state.units).find(unit => unit.owner === targetCivId && unit.type === 'settler')!;
    const city = foundCity(targetCivId, settler.position, state.map, state.idCounters);
    state.cities[city.id] = city;
    for (const position of mapNeighbors(state.map, city.position)) {
      const key = hexKey(position);
      if (state.map.tiles[key]) state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'plains' };
    }
    state.units = Object.fromEntries(Object.entries(state.units).filter(([, unit]) =>
      !mapNeighbors(state.map, city.position).some(position => hexKey(position) === hexKey(unit.position)),
    ));
    const warning = startRogueElephantHostWarning(state, targetCivId, 'standard');
    const active = processRogueElephantHostTurn({ ...warning, turn: warning.turn + 1 }, targetCivId);
    const elephant = Object.values(active.units).find(unit => unit.type === 'rogue_elephant')!;
    expect(getRogueElephantCommandFact(active, elephant.id)).toMatchObject({ percent: 20 });
  });

  it('chooses the least-defended legal approach when no improved tile or Fort is available', () => {
    const state = createNewGame('rome', 'rogue-host-weak-approach', 'small');
    const targetCivId = state.currentPlayer;
    const settler = Object.values(state.units).find(unit => unit.owner === targetCivId && unit.type === 'settler')!;
    const city = foundCity(targetCivId, settler.position, state.map, state.idCounters);
    state.cities = { [city.id]: city };
    const approaches = mapNeighbors(state.map, city.position)
      .filter(position => state.map.tiles[hexKey(position)])
      .sort((left, right) => hexKey(left).localeCompare(hexKey(right)));
    for (const position of approaches) state.map.tiles[hexKey(position)] = { ...state.map.tiles[hexKey(position)]!, terrain: 'plains' };
    const guarded = approaches[0]!;
    const weak = approaches[1]!;
    const guard = createUnit('warrior', targetCivId, guarded, state.idCounters);
    state.units[guard.id] = guard;

    expect(getRogueElephantHostTarget(state, targetCivId)).toEqual({
      kind: 'city-approach', cityId: city.id, tileKey: hexKey(weak),
    });
  });

  it('converts surviving elephants to a three-turn dispersal force when its Handler dies', () => {
    const state = createNewGame('rome', 'rogue-host-break', 'small');
    const targetCivId = state.currentPlayer;
    state.civilizations[targetCivId]!.techState.completed = TECH_TREE.filter(tech => tech.era <= 4).map(tech => tech.id);
    const settler = Object.values(state.units).find(unit => unit.owner === targetCivId && unit.type === 'settler')!;
    const city = foundCity(targetCivId, settler.position, state.map, state.idCounters);
    state.cities = { [city.id]: city };
    for (const position of mapNeighbors(state.map, city.position)) {
      const key = hexKey(position);
      if (state.map.tiles[key]) state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'plains' };
    }
    state.units = Object.fromEntries(Object.entries(state.units).filter(([, unit]) =>
      !mapNeighbors(state.map, city.position).some(position => hexKey(position) === hexKey(unit.position)),
    ));
    const warning = startRogueElephantHostWarning(state, targetCivId, 'standard');
    const active = processRogueElephantHostTurn({ ...warning, turn: warning.turn + 1 }, targetCivId);
    const handler = Object.values(active.units).find(unit => unit.type === 'rogue_handler')!;

    const converted = breakRogueElephantHostCommand(active, handler.id);

    expect(Object.values(converted.units).filter(unit => unit.type === 'rogue_elephant')).toHaveLength(0);
    expect(converted.stampedes?.[targetCivId]).toBeUndefined();
    expect(converted.rogueElephantHosts?.[targetCivId]).toMatchObject({ phase: 'dispersing', dispersalTurnsRemaining: 3 });

    const first = processRogueElephantHostTurn(converted, targetCivId);
    const second = processRogueElephantHostTurn(first, targetCivId);
    const resolved = processRogueElephantHostTurn(second, targetCivId);
    expect(resolved.rogueElephantHosts?.[targetCivId]).toMatchObject({ phase: 'resolved', outcome: 'dispersed', rewardGranted: true, recoveredHarnesses: { expiresTurn: resolved.turn + 10 } });
    expect(resolved.civilizations[targetCivId]!.gold).toBe(state.civilizations[targetCivId]!.gold + 48);
    expect(Object.values(resolved.units).some(unit => unit.type === 'beast_stampede_herd')).toBe(false);
  });
});
