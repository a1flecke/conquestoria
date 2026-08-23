import { describe, expect, it } from 'vitest';
import {
  getRogueElephantHostProfile,
  getRogueElephantStrength,
  getRogueHandlerStrength,
  getRogueElephantCommandFact,
  processRogueElephantHostTurn,
  startRogueElephantHostWarning,
} from '@/systems/rogue-elephant-host-system';
import { createNewGame } from '@/core/game-state';
import { TECH_TREE } from '@/systems/tech-definitions';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';

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
    state.cities[city.id] = city;
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
});
