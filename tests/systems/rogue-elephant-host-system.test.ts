import { describe, expect, it } from 'vitest';
import {
  breakRogueElephantHostCommand,
  getRogueElephantHostProfile,
  getRogueElephantStrength,
  getRogueHandlerStrength,
  getRogueElephantHostLifecycleTransition,
  getRogueElephantHostTarget,
  processRogueElephantHostTurn,
  startRogueElephantHostWarning,
} from '@/systems/rogue-elephant-host-system';
import { getRogueElephantCommandFact } from '@/systems/world-actor-queries';
import { createNewGame } from '@/core/game-state';
import { TECH_TREE } from '@/systems/tech-definitions';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { executeAIUnitAttack } from '@/ai/ai-unit-attack-execution';
import { EventBus } from '@/core/event-bus';
import type { CombatResult } from '@/core/types';

describe('Rogue Elephant Host definitions', () => {
  it('emits one target-scoped warning transition when a Host is first scheduled', () => {
    expect(getRogueElephantHostLifecycleTransition(undefined, {
      targetCivId: 'player', phase: 'warning', createdTurn: 8,
    })).toEqual({ kind: 'warning', targetCivId: 'player' });
  });

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

  it('never raises the Host on a barbarian camp beside the target city', () => {
    const state = createNewGame('rome', 'rogue-host-camps', 'small');
    const targetCivId = state.currentPlayer;
    state.civilizations[targetCivId]!.techState.completed = TECH_TREE.filter(tech => tech.era <= 4).map(tech => tech.id);
    const settler = Object.values(state.units).find(unit => unit.owner === targetCivId && unit.type === 'settler')!;
    const city = foundCity(targetCivId, settler.position, state.map, state.idCounters);
    state.cities = { [city.id]: city };
    const neighbours = mapNeighbors(state.map, city.position).filter(position => state.map.tiles[hexKey(position)]);
    for (const position of neighbours) {
      const key = hexKey(position);
      state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'plains' };
    }
    state.units = {};
    for (const civ of Object.values(state.civilizations)) civ.units = [];
    const camps = [...neighbours].sort((a, b) => hexKey(a).localeCompare(hexKey(b))).slice(0, 2);
    state.barbarianCamps = Object.fromEntries(camps.map((position, index) => [
      `camp-${index}`, { id: `camp-${index}`, position, strength: 1, spawnCooldown: 5 },
    ]));

    const warning = startRogueElephantHostWarning(state, targetCivId, 'standard');

    const host = Object.values(warning.units).filter(unit => unit.owner === 'crisis-force');
    expect(host).toHaveLength(3);
    const campKeys = new Set(camps.map(hexKey));
    expect(host.filter(unit => campKeys.has(hexKey(unit.position)))).toEqual([]);
  });

  // #1725: the Host candidate filter must see neighbours across the horizontal seam.
  it('raises the Host on wrapped neighbours across the seam', () => {
    const state = createNewGame('rome', 'rogue-host-wrap', 'small');
    const targetCivId = state.currentPlayer;
    state.civilizations[targetCivId]!.techState.completed = TECH_TREE.filter(tech => tech.era <= 4).map(tech => tech.id);
    const city = foundCity(targetCivId, { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities = { [city.id]: city };
    state.map.wrapsHorizontally = true;
    const wrappedQ = state.map.width - 1;
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'ocean';
    const wrapped = mapNeighbors(state.map, city.position).filter(position => position.q === wrappedQ).slice(0, 2);
    expect(wrapped).toHaveLength(2);
    for (const position of wrapped) {
      state.map.tiles[hexKey(position)] = { ...state.map.tiles[hexKey(position)]!, terrain: 'plains' };
    }
    state.units = {};
    for (const civ of Object.values(state.civilizations)) civ.units = [];

    const warning = startRogueElephantHostWarning(state, targetCivId, 'explorer');

    const host = Object.values(warning.units).filter(unit => unit.owner === 'crisis-force');
    expect(host).toHaveLength(2);
    expect(host.every(unit => unit.position.q === wrappedQ)).toBe(true);
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

    const blocked = {
      ...state,
      stampedes: {
        [targetCivId]: {
          targetCivId, phase: 'active' as const, eligibleTurns: 0, activeTurns: 1,
          cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [],
        },
      },
    };
    expect(startRogueElephantHostWarning(blocked, targetCivId, 'standard')).toEqual(blocked);

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
    const herd = Object.values(converted.units).find(unit => unit.type === 'beast_stampede_herd')!;
    expect(first.crisisForces?.[converted.rogueElephantHosts![targetCivId]!.forceId!]?.herdRoutes?.[herd.id]?.steps.length).toBeGreaterThan(0);
    expect(first.units[herd.id]?.position).not.toEqual(herd.position);
    const second = processRogueElephantHostTurn(first, targetCivId);
    const resolved = processRogueElephantHostTurn(second, targetCivId);
    expect(resolved.rogueElephantHosts?.[targetCivId]).toMatchObject({ phase: 'resolved', outcome: 'dispersed', rewardGranted: true, recoveredHarnesses: { expiresTurn: resolved.turn + 10 } });
    expect(resolved.civilizations[targetCivId]!.gold).toBe(state.civilizations[targetCivId]!.gold + 48);
    expect(Object.values(resolved.units).some(unit => unit.type === 'beast_stampede_herd')).toBe(false);
  });

  it('#1830: AI unit attacks pass state to resolveCombat so Handler command and rocket splash hits apply', () => {
    const state = createNewGame('rome', 'rogue-host-ai-combat', 'small');
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
    const elephant = Object.values(active.units).find(unit => unit.type === 'rogue_elephant')!;
    const handler = Object.values(active.units).find(unit => unit.type === 'rogue_handler')!;

    // Place an AI rocket_artillery within range 2 of the rogue elephant and mark both elephant & handler visible.
    const aiCivId = Object.keys(active.civilizations).find(id => id !== targetCivId)!;
    const artilleryPos = mapNeighbors(active.map, elephant.position)
      .flatMap(n => mapNeighbors(active.map, n))
      .find(pos =>
        active.map.tiles[hexKey(pos)]
        && active.map.tiles[hexKey(pos)]!.terrain !== 'ocean'
        && hexKey(pos) !== hexKey(elephant.position)
        && hexKey(pos) !== hexKey(handler.position)
        && !Object.values(active.units).some(u => hexKey(u.position) === hexKey(pos)),
      )!;
    const artillery = createUnit('rocket_artillery', aiCivId, artilleryPos, active.idCounters);
    active.units[artillery.id] = artillery;
    active.civilizations[aiCivId]!.units.push(artillery.id);
    active.civilizations[aiCivId]!.visibility.tiles[hexKey(elephant.position)] = 'visible';
    active.civilizations[aiCivId]!.visibility.tiles[hexKey(handler.position)] = 'visible';
    // Ensure handler is adjacent to elephant so bounded splash can hit it.
    const adjToElephant = mapNeighbors(active.map, elephant.position).find(pos =>
      active.map.tiles[hexKey(pos)]
      && hexKey(pos) !== hexKey(artilleryPos)
      && !Object.values(active.units).some(u => u.id !== handler.id && hexKey(u.position) === hexKey(pos)),
    )!;
    active.units[handler.id] = { ...handler, position: adjToElephant };
    active.civilizations[aiCivId]!.visibility.tiles[hexKey(adjToElephant)] = 'visible';

    const bus = new EventBus();
    const resolvedEvents: CombatResult[] = [];
    bus.on('combat:resolved', payload => { resolvedEvents.push(payload.result); });

    executeAIUnitAttack(active, artillery.id, elephant.id, aiCivId, bus, false);

    expect(resolvedEvents).toHaveLength(1);
    const combat = resolvedEvents[0]!;
    // Defender (rogue elephant near its handler) must receive Handler Command ×1.20.
    expect(combat.modifierFacts?.defender.some(f => f.key === 'rogue-elephant-host:handler-command')).toBe(true);
    // Rocket artillery must populate splashHits on CombatResult (for both state application and notifications).
    expect(combat.splashHits?.length).toBeGreaterThan(0);
  });
});
