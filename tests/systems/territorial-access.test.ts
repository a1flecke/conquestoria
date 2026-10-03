/**
 * #871 — territorial access is canonical movement legality.
 *
 * One rule (`territorial-access.ts`), consumed by the resolver/executor, the range preview, path
 * routing, transport unload and auto-explore. These tests pin the relationship matrix, the mover
 * category matrix, preview/execution parity, the stateless egress rule, and that nothing on the
 * movement path can declare war.
 */
import { describe, it, expect } from 'vitest';
import type { GameState, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { hexKey } from '@/systems/hex-utils';
import {
  BORDER_OBEDIENCE,
  classifyBorderMover,
  classifyTerritorialRelation,
  getDeniedTerritoryOwners,
  getTerritorialAccessDenial,
  relationGrantsPassage,
  TERRITORIAL_ACCESS_MESSAGE,
  type BorderMoverCategory,
} from '@/systems/territorial-access';
import { resolveUnitMoveIntent, executeUnitMove } from '@/systems/unit-movement-system';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { findPath } from '@/systems/unit-pathfinding';
import { chooseAutoExploreMove } from '@/systems/auto-explore-system';
import { explainMovementFailureForViewer, getMovementBlockerReason } from '@/systems/unit-movement-explainer';
import {
  addUnit, asPlayer, makeTerritorialWorld, removeBoth, setVassal, setWar, signBoth,
  BOARD_HEIGHT, BOARD_WIDTH, type TerritorialWorld,
} from './helpers/territorial-fixture';

const INTO_RIVAL = { q: 3, r: 1 };
const BEYOND_RIVAL = { q: 7, r: 1 };

function worldWithWarrior(): TerritorialWorld {
  const world = makeTerritorialWorld();
  addUnit(world, 'walker', 'warrior', 'player', 2, 1);
  return world;
}

function resolve(world: TerritorialWorld, to = INTO_RIVAL, role = 'walker') {
  return resolveUnitMoveIntent(world.state, world.units[role]!, to, asPlayer);
}

describe('#871 relationship matrix — classifyTerritorialRelation', () => {
  const relation = (world: TerritorialWorld, tileOwner: string | null, mover = 'player') =>
    classifyTerritorialRelation(world.state, mover, tileOwner);

  it('own and unclaimed land never raise an access question', () => {
    const world = makeTerritorialWorld();
    expect(relation(world, 'player')).toBe('own');
    expect(relation(world, null)).toBe('unclaimed');
  });

  it('a peaceful sovereign with no agreement is closed', () => {
    expect(relation(makeTerritorialWorld(), 'rival')).toBe('closed');
  });

  it('war grants passage', () => {
    const world = makeTerritorialWorld();
    setWar(world, 'player', 'rival');
    expect(relation(world, 'rival')).toBe('war');
    expect(relation(world, 'player', 'rival')).toBe('war');
  });

  it('alliance and open borders grant passage, in either party\'s direction', () => {
    const allied = makeTerritorialWorld();
    signBoth(allied, 'player', 'rival', 'alliance');
    expect(relation(allied, 'rival')).toBe('alliance');
    expect(relation(allied, 'player', 'rival')).toBe('alliance');
    const open = makeTerritorialWorld();
    signBoth(open, 'player', 'rival', 'open_borders');
    expect(relation(open, 'rival')).toBe('open-borders');
    expect(relation(open, 'player', 'rival')).toBe('open-borders');
  });

  it('a non-aggression pact, a trade agreement and a defensive league grant NO access', () => {
    const world = makeTerritorialWorld();
    signBoth(world, 'player', 'rival', 'non_aggression_pact');
    signBoth(world, 'player', 'rival', 'trade_agreement');
    world.state.defensiveLeagues = [{ id: 'league-1', members: ['player', 'rival'], formedTurn: 1 }];
    expect(relation(world, 'rival')).toBe('closed');
  });

  it('overlord and vassal may enter each other\'s land; an unrelated third civ still may not', () => {
    const world = makeTerritorialWorld();
    setVassal(world, 'player', 'rival');
    expect(relation(world, 'rival')).toBe('vassalage');
    expect(relation(world, 'player', 'rival')).toBe('vassalage');
    expect(relation(world, 'third', 'player')).toBe('closed');
  });

  it('access is pairwise: an agreement with one civ says nothing about another', () => {
    const world = makeTerritorialWorld();
    signBoth(world, 'player', 'third', 'open_borders');
    expect(relation(world, 'rival')).toBe('closed');
    expect(relation(world, 'third')).toBe('open-borders');
  });

  it('city-states, barbarians and eliminated civs are non-sovereign: no access question', () => {
    const world = makeTerritorialWorld();
    expect(relation(world, 'mc-tyre')).toBe('non-sovereign');
    expect(relation(world, 'barbarian')).toBe('non-sovereign');
    world.state.civilizations.rival!.isEliminated = true;
    expect(relation(world, 'rival')).toBe('non-sovereign');
  });

  it('only `closed` denies passage', () => {
    for (const r of ['own', 'unclaimed', 'non-sovereign', 'war', 'alliance', 'open-borders', 'vassalage'] as const) {
      expect(relationGrantsPassage(r), r).toBe(true);
    }
    expect(relationGrantsPassage('closed')).toBe(false);
  });
});

describe('#871 mover category matrix — who obeys borders', () => {
  const category = (type: UnitType, owner = 'player') => classifyBorderMover({ type, owner });

  it('armed land units obey; everything else is exempt, each for a stated reason', () => {
    const expected: Array<[UnitType, string, BorderMoverCategory]> = [
      ['warrior', 'player', 'armed-land'],
      ['catapult', 'player', 'armed-land'],
      ['paratrooper', 'player', 'armed-land'],
      ['worker', 'player', 'civilian'],
      ['settler', 'player', 'civilian'],
      ['missionary', 'player', 'civilian'],
      ['caravan', 'player', 'civilian'],
      ['great_general', 'player', 'civilian'],
      ['scout', 'player', 'recon'],
      ['spy_agent', 'player', 'covert'],
      ['galley', 'player', 'naval'],
      ['transport', 'player', 'naval'],
      ['biplane', 'player', 'air'],
      ['warrior', 'barbarian', 'world-actor'],
      ['beast_wolf', 'beasts', 'world-actor'],
      ['warrior', 'mc-tyre', 'world-actor'],
      ['pirate_galley', 'pirate-1', 'world-actor'],
    ];
    for (const [type, owner, want] of expected) {
      expect(category(type, owner), `${type} owned by ${owner}`).toBe(want);
    }
    expect(Object.entries(BORDER_OBEDIENCE).filter(([, obeys]) => obeys).map(([name]) => name)).toEqual(['armed-land']);
  });

  it('is derived from typed metadata: every armed-land type is a land unit with combat strength', () => {
    const armed = (Object.keys(UNIT_DEFINITIONS) as UnitType[]).filter(type => category(type) === 'armed-land');
    expect(armed.length).toBeGreaterThan(10);
    for (const type of armed) {
      const classes = UNIT_CLASS_BY_TYPE[type] ?? [];
      expect(UNIT_DEFINITIONS[type].domain ?? 'land', type).toBe('land');
      expect(classes.some(c => ['civilian', 'spy', 'recon', 'naval', 'air'].includes(c)), type).toBe(false);
      expect(UNIT_DEFINITIONS[type].strength, type).toBeGreaterThan(0);
    }
  });
});

describe('#871 resolver / executor', () => {
  it('rejects a peaceful closed border with a typed, civilization-free reason and moves nothing', () => {
    const world = worldWithWarrior();
    const result = resolve(world);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('closed-border');
    expect(result.message).toBe(TERRITORIAL_ACCESS_MESSAGE);
    expect(result.message).not.toMatch(/rival|third|player/i);
    const executed = executeUnitMove(world.state, world.units.walker!, INTO_RIVAL, asPlayer);
    expect(executed.ok).toBe(false);
    expect(world.state.units[world.units.walker!]!.position).toEqual({ q: 2, r: 1 });
  });

  it.each([
    ['open borders', (w: TerritorialWorld) => signBoth(w, 'player', 'rival', 'open_borders')],
    ['alliance', (w: TerritorialWorld) => signBoth(w, 'player', 'rival', 'alliance')],
    ['war', (w: TerritorialWorld) => setWar(w, 'player', 'rival')],
    ['vassalage', (w: TerritorialWorld) => setVassal(w, 'player', 'rival')],
  ])('allows entry under %s', (_name, grant) => {
    const world = worldWithWarrior();
    grant(world);
    expect(resolve(world).ok).toBe(true);
    expect(resolve(world, BEYOND_RIVAL).ok).toBe(true);
  });

  it('a non-aggression pact alone does not open the border', () => {
    const world = worldWithWarrior();
    signBoth(world, 'player', 'rival', 'non_aggression_pact');
    const result = resolve(world);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('closed-border');
  });

  it('a route THROUGH closed land is refused even when the destination itself is free', () => {
    const world = worldWithWarrior();
    const result = resolve(world, BEYOND_RIVAL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('closed-border');
  });

  it('routes around closed land when a detour exists', () => {
    const world = worldWithWarrior();
    // Open a gap: the middle row of the rival wall becomes unclaimed.
    for (const q of [3, 4, 5]) world.state.map.tiles[hexKey({ q, r: 1 })]!.owner = null;
    const result = resolve(world, BEYOND_RIVAL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const step of result.command.path) {
        expect(world.state.map.tiles[hexKey(step)]!.owner === 'rival').toBe(false);
      }
    }
  });

  it('own, unclaimed and third-party land are unaffected', () => {
    const world = worldWithWarrior();
    expect(resolve(world, { q: 0, r: 1 }).ok).toBe(true);
    world.state.map.tiles[hexKey({ q: 3, r: 1 })]!.owner = 'third';
    signBoth(world, 'player', 'third', 'open_borders');
    expect(resolve(world).ok).toBe(true);
  });

  it('exempt categories walk straight in: scout, worker, settler, spy, naval, world actors', () => {
    const world = makeTerritorialWorld();
    for (const [role, type, owner] of [
      ['scout', 'scout', 'player'], ['worker', 'worker', 'player'], ['settler', 'settler', 'player'],
      ['spy', 'spy_agent', 'player'], ['raider', 'warrior', 'barbarian'],
    ] as const) addUnit(world, role, type, owner, 2, 1);
    for (const role of ['scout', 'worker', 'settler', 'spy']) {
      expect(resolveUnitMoveIntent(world.state, world.units[role]!, INTO_RIVAL, asPlayer).ok, role).toBe(true);
    }
    expect(resolveUnitMoveIntent(world.state, world.units.raider!, INTO_RIVAL, { actor: 'world' }).ok).toBe(true);
  });

  it('a city-state\'s land is never border-gated', () => {
    const world = worldWithWarrior();
    world.state.map.tiles[hexKey(INTO_RIVAL)]!.owner = 'mc-tyre';
    expect(resolve(world).ok).toBe(true);
  });

  it('never declares war: refusals and range/path queries leave every diplomacy record untouched', () => {
    const world = worldWithWarrior();
    const before = JSON.stringify(world.state.civilizations);
    resolve(world);
    resolve(world, BEYOND_RIVAL);
    executeUnitMove(world.state, world.units.walker!, INTO_RIVAL, asPlayer);
    getMovementRangeDetails(world.state, world.units.walker!);
    findPath({ q: 2, r: 1 }, BEYOND_RIVAL, world.state.map, 'land', {
      unit: world.state.units[world.units.walker!]!,
      deniedOwnerIds: getDeniedTerritoryOwners(world.state, world.state.units[world.units.walker!]!),
    });
    expect(JSON.stringify(world.state.civilizations)).toBe(before);
    expect(world.state.civilizations.player!.diplomacy.atWarWith).toEqual([]);
  });
});

describe('#871 preview / execution parity', () => {
  const RELATIONS: Array<[string, (w: TerritorialWorld) => void]> = [
    ['closed', () => {}],
    ['open borders', w => signBoth(w, 'player', 'rival', 'open_borders')],
    ['war', w => setWar(w, 'player', 'rival')],
  ];

  it.each(RELATIONS)('the range highlight and the resolver agree on every tile (%s)', (_name, arrange) => {
    const world = worldWithWarrior();
    arrange(world);
    const unitId = world.units.walker!;
    const reachable = new Set(getMovementRangeDetails(world.state, unitId).reachable.map(hexKey));
    for (let q = 0; q < BOARD_WIDTH; q++) {
      for (let r = 0; r < BOARD_HEIGHT; r++) {
        const key = hexKey({ q, r });
        if (key === hexKey(world.state.units[unitId]!.position)) continue;
        const resolution = resolveUnitMoveIntent(world.state, unitId, { q, r }, asPlayer);
        expect(reachable.has(key), `${key}: range ${reachable.has(key)} vs resolver ${resolution.ok}`).toBe(resolution.ok);
      }
    }
  });

  it('range never offers a closed tile and the resolver never accepts a route the path finder cannot draw', () => {
    const world = worldWithWarrior();
    const unit = world.state.units[world.units.walker!]!;
    const reachable = getMovementRangeDetails(world.state, unit.id).reachable;
    expect(reachable.some(c => world.state.map.tiles[hexKey(c)]!.owner === 'rival')).toBe(false);
    expect(findPath(unit.position, INTO_RIVAL, world.state.map, 'land', {
      unit, deniedOwnerIds: getDeniedTerritoryOwners(world.state, unit),
    })).toBeNull();
  });

  it('get-denial and the resolver give the same answer for the same tile', () => {
    const world = worldWithWarrior();
    const unit = world.state.units[world.units.walker!]!;
    expect(getTerritorialAccessDenial(world.state, unit, INTO_RIVAL)?.reason).toBe('closed-border');
    expect(getTerritorialAccessDenial(world.state, unit, { q: 1, r: 1 })).toBeNull();
    signBoth(world, 'player', 'rival', 'open_borders');
    expect(getTerritorialAccessDenial(world.state, unit, INTO_RIVAL)).toBeNull();
  });
});

describe('#871 access disappearing while units are inside (stateless egress)', () => {
  function armyInsideRivalLand() {
    const world = makeTerritorialWorld();
    signBoth(world, 'player', 'rival', 'open_borders');
    addUnit(world, 'inside', 'warrior', 'player', 4, 1);
    addUnit(world, 'scout', 'scout', 'player', 4, 0);
    addUnit(world, 'worker', 'worker', 'player', 4, 2);
    removeBoth(world, 'player', 'rival', 'open_borders');
    return world;
  }

  it('the unit inside can keep moving inside and can always leave', () => {
    const world = armyInsideRivalLand();
    const id = world.units.inside!;
    expect(resolveUnitMoveIntent(world.state, id, { q: 5, r: 1 }, asPlayer).ok).toBe(true); // deeper: allowed
    expect(resolveUnitMoveIntent(world.state, id, { q: 2, r: 1 }, asPlayer).ok).toBe(true); // out to own land
    expect(resolveUnitMoveIntent(world.state, id, BEYOND_RIVAL, asPlayer).ok).toBe(true); // out the far side
  });

  it('once it has left it cannot walk back in', () => {
    const world = armyInsideRivalLand();
    const id = world.units.inside!;
    const moved = executeUnitMove(world.state, id, { q: 2, r: 1 }, asPlayer);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    world.state = moved.state;
    world.state.units[id] = { ...world.state.units[id]!, movementPointsLeft: 12, hasMoved: false };
    const back = resolveUnitMoveIntent(world.state, id, { q: 4, r: 1 }, asPlayer);
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.reason).toBe('closed-border');
  });

  it('never teleports, destroys or strands: nothing moves when access ends, and exempt units are unaffected', () => {
    const world = armyInsideRivalLand();
    for (const role of ['inside', 'scout', 'worker']) {
      expect(world.state.units[world.units[role]!]!.position.q).toBe(4);
    }
    expect(resolveUnitMoveIntent(world.state, world.units.scout!, { q: 3, r: 0 }, asPlayer).ok).toBe(true);
    expect(resolveUnitMoveIntent(world.state, world.units.worker!, { q: 3, r: 2 }, asPlayer).ok).toBe(true);
  });

  it('is identical after a save/reload (derived, no persisted grace state)', () => {
    const world = armyInsideRivalLand();
    const reloaded: GameState = JSON.parse(JSON.stringify(world.state));
    const id = world.units.inside!;
    for (const to of [{ q: 5, r: 1 }, { q: 2, r: 1 }, BEYOND_RIVAL]) {
      const a = resolveUnitMoveIntent(world.state, id, to, asPlayer);
      const b = resolveUnitMoveIntent(reloaded, id, to, asPlayer);
      expect(b.ok).toBe(a.ok);
    }
    expect([...getDeniedTerritoryOwners(reloaded, reloaded.units[id]!)]).toEqual([...getDeniedTerritoryOwners(world.state, world.state.units[id]!)]);
  });

  it('standing in one closed land does not open a different one', () => {
    const world = armyInsideRivalLand();
    world.state.map.tiles[hexKey({ q: 6, r: 1 })]!.owner = 'third';
    expect(resolveUnitMoveIntent(world.state, world.units.inside!, { q: 6, r: 1 }, asPlayer).ok).toBe(false);
  });
});

describe('#871 sibling paths use the same rule', () => {
  it('auto-explore never nominates a closed tile for a border-obeying unit', () => {
    const world = worldWithWarrior();
    const id = world.units.walker!;
    world.state.units[id] = { ...world.state.units[id]!, automation: { mode: 'auto-explore', lastTargets: [], startedTurn: 1 } } as never;
    const order = chooseAutoExploreMove(world.state, id);
    if (order) expect(world.state.map.tiles[hexKey(order.to)]!.owner).not.toBe('rival');
  });
});

describe('#871 information safety', () => {
  it('the denial message never names a civilization', () => {
    expect(TERRITORIAL_ACCESS_MESSAGE).not.toMatch(/rival|third|player|civ-|ai-/i);
  });
});

describe('#871 viewer-safe presentation (omniscient legality, redacted explanation)', () => {
  function setVisibility(world: TerritorialWorld, civ: string, overrides: Record<string, 'visible' | 'fog' | 'unexplored'>) {
    const vis = world.state.civilizations[civ]!.visibility;
    world.state.civilizations[civ]!.visibility = { ...vis, tiles: { ...vis.tiles, ...overrides } };
  }

  it('an explored closed tile is explained with the civilization-free copy', () => {
    const world = worldWithWarrior();
    expect(getMovementBlockerReason(world.state, world.units.walker!, INTO_RIVAL))
      .toEqual({ code: 'closed-border', message: TERRITORIAL_ACCESS_MESSAGE });
  });

  it('is identical whether or not the viewer has ever met the owner -- an unmet civ is never revealed', () => {
    const met = worldWithWarrior();
    const unmet = worldWithWarrior();
    for (const id of ['player', 'rival']) unmet.state.civilizations[id]!.knownCivilizations = [];
    expect(getMovementBlockerReason(unmet.state, unmet.units.walker!, INTO_RIVAL))
      .toEqual(getMovementBlockerReason(met.state, met.units.walker!, INTO_RIVAL));
  });

  it('an unexplored destination stays "too far to spot" -- ownership of unseen land is not disclosed', () => {
    const world = worldWithWarrior();
    setVisibility(world, 'player', { [hexKey(INTO_RIVAL)]: 'unexplored' });
    expect(getMovementBlockerReason(world.state, world.units.walker!, INTO_RIVAL))
      .toEqual({ code: 'unexplored', message: 'Too far away to spot.' });
  });

  it('a closed tile on the way that the viewer has not explored is never named', () => {
    const world = worldWithWarrior();
    const wall: Record<string, 'unexplored'> = {};
    for (const q of [3, 4, 5]) for (let r = 0; r < BOARD_HEIGHT; r++) wall[hexKey({ q, r })] = 'unexplored';
    setVisibility(world, 'player', wall);
    const reason = getMovementBlockerReason(world.state, world.units.walker!, BEYOND_RIVAL);
    // The projection blanks ownership on unexplored tiles, so the viewer's own resolver says
    // "explore first" (the unchanged unexplored-path rule) -- never "that land is closed".
    expect(reason?.code).toBe('unexplored');
    expect(reason?.message).not.toMatch(/border|closed|civilization/i);
    // ...while the omniscient resolver still (correctly) refuses it.
    expect(resolve(world, BEYOND_RIVAL).ok).toBe(false);
  });

  it('the executor-failure toast goes through the same redaction, never the raw resolver copy', () => {
    const world = worldWithWarrior();
    setVisibility(world, 'player', { [hexKey(INTO_RIVAL)]: 'fog' });
    const failure = resolve(world);
    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    expect(explainMovementFailureForViewer(world.state, world.units.walker!, failure)).toBe(TERRITORIAL_ACCESS_MESSAGE);
  });

  it('hot seat: each seat is explained from its own knowledge, independent of the other', () => {
    const world = worldWithWarrior();
    addUnit(world, 'rivalWalker', 'warrior', 'rival', 6, 1);
    const playerLand = { q: 2, r: 1 };
    // The rival seat has not explored the player's land; the player seat has explored the rival's.
    setVisibility(world, 'rival', { [hexKey(playerLand)]: 'unexplored' });
    expect(getMovementBlockerReason(world.state, world.units.rivalWalker!, playerLand))
      .toEqual({ code: 'unexplored', message: 'Too far away to spot.' });
    expect(getMovementBlockerReason(world.state, world.units.walker!, INTO_RIVAL))
      .toEqual({ code: 'closed-border', message: TERRITORIAL_ACCESS_MESSAGE });
    // Legality is owner-scoped, so who happens to be viewing cannot change what a unit may do.
    world.state.currentPlayer = 'rival';
    expect(resolve(world).ok).toBe(false);
  });
});
