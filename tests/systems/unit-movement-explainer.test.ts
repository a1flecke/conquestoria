import { describe, it, expect } from 'vitest';
import {
  explainMovementFailureForViewer,
  findZoneOfControlStop,
  getMovementBlockerReason,
  presentMovementRejectionForViewer,
} from '@/systems/unit-movement-explainer';
import { createUnit } from '@/systems/unit-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { hexKey } from '@/systems/hex-utils';
import type { GameMap, GameState } from '@/core/types';
import { resolveUnitMoveIntent } from '@/systems/unit-movement-validation';
import { expectViewerSafety, type ViewerSurface } from '../helpers/viewer-safety';

function zocState(): { state: GameState; mover: ReturnType<typeof createUnit> } {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < 6; q++) for (let r = 0; r < 3; r++) {
    tiles[hexKey({ q, r })] = {
      coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
    };
  }
  const map: GameMap = { width: 6, height: 3, wrapsHorizontally: false, tiles, rivers: [] };
  const c = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  const mover = createUnit('warrior', 'civ-a', { q: 0, r: 0 }, c);
  mover.movementPointsLeft = 4;
  // Enemy at (2,1) exerts ZoC over its neighbours, which includes (2,0).
  const enemy = createUnit('warrior', 'civ-b', { q: 2, r: 1 }, c);
  // ZoC only applies between HOSTILE owners — isHostileOwnerTo checks atWarWith.
  const diploA = { ...createDiplomacyState(['civ-a', 'civ-b'], 'civ-a'), atWarWith: ['civ-b'] };
  const diploB = { ...createDiplomacyState(['civ-a', 'civ-b'], 'civ-b'), atWarWith: ['civ-a'] };
  const state = {
    turn: 1, era: 1, gameId: 'zoc', currentPlayer: 'civ-a', gameOver: false, winner: null, map,
    units: { [mover.id]: mover, [enemy.id]: enemy }, cities: {}, barbarianCamps: {}, tribalVillages: {},
    civilizations: {
      'civ-a': { id: 'civ-a', units: [mover.id], techState: { completed: [] }, diplomacy: diploA },
      'civ-b': { id: 'civ-b', units: [enemy.id], techState: { completed: [] }, diplomacy: diploB },
    },
  } as unknown as GameState;
  return { state, mover };
}

describe('#1025 MR4 / #1002 — viewer redaction', () => {
  function waterWorld(vis: Vis): MoveWorld {
    const world = movementWorld({ to: { q: 1, r: 0 }, width: 3, visibility: { '1,0': vis } });
    world.state.map.tiles['1,0'] = { ...world.state.map.tiles['1,0']!, terrain: 'coast' };
    return world;
  }

  it('redacts any reason to the generic one when the destination is unexplored', () => {
    const world = waterWorld('unexplored');
    expect(presentMovementRejectionForViewer(world.state, world.moverId, world.to, 'civ-a'))
      .toEqual({ code: 'unexplored', message: 'Too far away to spot.' });
  });

  it('keeps terrain reasons for an explored destination, visible or remembered in fog', () => {
    // VisibilityState is 'unexplored' | 'fog' | 'visible' — there is no 'fogged'.
    const specific = { code: 'impassable-water', message: 'Land units cannot cross water yet.' };
    for (const vis of ['visible', 'fog'] as const) {
      const world = waterWorld(vis);
      expect(presentMovementRejectionForViewer(world.state, world.moverId, world.to, 'civ-a')).toEqual(specific);
    }
  });

  it('treats a viewer with no visibility map as knowing nothing (safe default)', () => {
    const world = waterWorld('visible');
    delete (world.state.civilizations['civ-a'] as { visibility?: unknown }).visibility;
    expect(presentMovementRejectionForViewer(world.state, world.moverId, world.to, 'civ-a')?.code).toBe('unexplored');
  });

  it('explains an executor failure from viewer knowledge, never the raw resolver message', () => {
    const world = movementWorld({ to: { q: 2, r: 0 }, width: 3, visibility: { '1,0': 'fog', '1,1': 'fog' } });
    placeUnit(world, 'warrior', 'civ-b', { q: 1, r: 0 });
    const failure = resolveUnitMoveIntent(world.state, world.moverId, world.to, { actor: 'player', civId: 'civ-a' });
    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    expect(failure.message).toBe('An enemy unit is blocking the way.');
    expect(explainMovementFailureForViewer(world.state, world.moverId, failure))
      .toBe('Something out of sight is in the way.');
  });
});

describe('#1025 MR4 — zone-of-control stop detection', () => {
  it('reports the first ZoC-limited tile on the path', () => {
    const { state, mover } = zocState();
    const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }];
    expect(findZoneOfControlStop(state, mover, path)).toEqual({ q: 2, r: 0 });
  });

  it('returns null when no path tile is ZoC-limited', () => {
    const { state, mover } = zocState();
    const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    expect(findZoneOfControlStop(state, mover, path)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// #1002 — path-aware viewer redaction, proved with the shared differential harness.
//
// Canonical legality (`resolveUnitMoveIntent`) stays omniscient. The explanation the player sees
// may depend only on what the unit's owner has earned: an unseen unit / camp / ZoC source on the
// PATH (not just at the destination) must not change the explanation.
// ---------------------------------------------------------------------------------------------

type Vis = 'visible' | 'fog' | 'unexplored';

interface MoveWorld {
  state: GameState;
  moverId: string;
  to: { q: number; r: number };
}

function movementWorld(options: {
  width?: number;
  to: { q: number; r: number };
  visibility?: Record<string, Vis>;
  moverType?: Parameters<typeof createUnit>[0];
  terrain?: GameMap['tiles'][string]['terrain'];
}): MoveWorld {
  const width = options.width ?? 6;
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < width; q++) for (let r = 0; r < 2; r++) {
    tiles[hexKey({ q, r })] = {
      coord: { q, r }, terrain: options.terrain ?? 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
    };
  }
  const map: GameMap = { width, height: 2, wrapsHorizontally: false, tiles, rivers: [] };
  const counters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  const mover = createUnit(options.moverType ?? 'warrior', 'civ-a', { q: 0, r: 0 }, counters);
  mover.movementPointsLeft = 6;
  const visibilityTiles: Record<string, Vis> = Object.fromEntries(Object.keys(tiles).map(key => [key, 'visible' as Vis]));
  Object.assign(visibilityTiles, options.visibility ?? {});
  const diplomacy = (self: string, atWarWith: string[]) => ({
    ...createDiplomacyState(['civ-a', 'civ-b', 'civ-c'], self),
    atWarWith,
  });
  const civ = (id: string, name: string, isHuman: boolean, units: string[], known: string[], atWar: string[], tilesVis: Record<string, Vis>) => ({
    id, name, isHuman, civType: 'generic', units, cities: [],
    techState: { completed: [] }, visibility: { tiles: tilesVis }, knownCivilizations: known,
    diplomacy: diplomacy(id, atWar),
  });
  const state = {
    turn: 1, era: 1, gameId: 'viewer-safe-movement', currentPlayer: 'civ-a', gameOver: false, winner: null, map,
    units: { [mover.id]: mover }, cities: {}, barbarianCamps: {}, tribalVillages: {},
    idCounters: counters,
    civilizations: {
      'civ-a': civ('civ-a', 'Viewer', true, [mover.id], ['civ-b'], ['civ-b', 'civ-c'], visibilityTiles),
      'civ-b': civ('civ-b', 'Rival', false, [], ['civ-a'], ['civ-a'], {}),
      'civ-c': civ('civ-c', 'Stranger', false, [], [], ['civ-a'], {}),
    },
  } as unknown as GameState;
  return { state, moverId: mover.id, to: options.to };
}

function placeUnit(world: MoveWorld, type: Parameters<typeof createUnit>[0], owner: string, at: { q: number; r: number }): string {
  const unit = createUnit(type, owner, at, world.state.idCounters);
  world.state.units[unit.id] = unit;
  world.state.civilizations[owner]?.units.push(unit.id);
  return unit.id;
}

function placeCamp(world: MoveWorld, at: { q: number; r: number }): void {
  world.state.barbarianCamps['camp-x'] = { id: 'camp-x', position: at, strength: 3, spawnCooldown: 5 };
}

function setVis(world: MoveWorld, at: { q: number; r: number }, vis: Vis): void {
  world.state.civilizations['civ-a']!.visibility.tiles[hexKey(at)] = vis;
}

function enemyUnitId(world: MoveWorld): string {
  return Object.keys(world.state.units).find(key => world.state.units[key]!.owner === 'civ-b')!;
}

const movementExplainerSurface: ViewerSurface<MoveWorld, ReturnType<typeof getMovementBlockerReason>> = {
  name: 'movement explainer (getMovementBlockerReason)',
  // Owner-scoped by construction (#1025 MR4): the viewer IS the mover's owner.
  project: world => getMovementBlockerReason(world.state, world.moverId, world.to),
};

describe('#1002 — path-aware movement redaction', () => {
  it('an enemy or camp on an UNEXPLORED path tile cannot change the explanation (destination explored)', () => {
    const world = movementWorld({ to: { q: 2, r: 0 }, width: 3, visibility: { '1,0': 'unexplored', '1,1': 'unexplored' } });
    // Baseline: the viewer knows only that the route enters unexplored territory.
    expect(movementExplainerSurface.project(world, 'civ-a')?.code).toBe('unexplored');
    expectViewerSafety(movementExplainerSurface, {
      world,
      viewerId: 'civ-a',
      hidden: [
        { label: 'enemy warrior on the unexplored path tile', apply: w => { placeUnit(w, 'warrior', 'civ-b', { q: 1, r: 0 }); } },
        { label: 'unmet civ\'s warrior on the unexplored path tile', apply: w => { placeUnit(w, 'warrior', 'civ-c', { q: 1, r: 0 }); } },
        { label: 'barbarian camp on the unexplored path tile', apply: w => placeCamp(w, { q: 1, r: 0 }) },
      ],
      earned: [
        { label: 'the path tile is explored and the enemy is in plain sight', apply: w => {
          setVis(w, { q: 1, r: 0 }, 'visible');
          setVis(w, { q: 1, r: 1 }, 'visible');
          placeUnit(w, 'warrior', 'civ-b', { q: 1, r: 0 });
        } },
      ],
    });
  });

  it('an enemy in FOG on the path is explained only as an unseen obstacle', () => {
    const world = movementWorld({ to: { q: 2, r: 0 }, width: 3, visibility: { '1,0': 'fog', '1,1': 'fog' } });
    placeUnit(world, 'warrior', 'civ-b', { q: 1, r: 0 });
    expect(movementExplainerSurface.project(world, 'civ-a')).toEqual({
      code: 'hidden-obstacle',
      message: 'Something out of sight is in the way.',
    });
    expectViewerSafety(movementExplainerSurface, {
      world,
      viewerId: 'civ-a',
      hidden: [
        { label: 'the unseen blocker is a different unit type', apply: w => { w.state.units[enemyUnitId(w)]!.type = 'spearman'; } },
        { label: 'a second unseen enemy (an unmet civ) joins it', apply: w => { placeUnit(w, 'archer', 'civ-c', { q: 1, r: 0 }); } },
      ],
      earned: [{ label: 'the path tile comes into view', apply: w => setVis(w, { q: 1, r: 0 }, 'visible') }],
    });
  });

  it('an enemy in FOG at the destination is not named', () => {
    const world = movementWorld({ to: { q: 1, r: 0 }, width: 3, visibility: { '1,0': 'fog' } });
    placeUnit(world, 'warrior', 'civ-b', { q: 1, r: 0 });
    const reason = movementExplainerSurface.project(world, 'civ-a');
    expect(reason?.code).toBe('hidden-obstacle');
    expect(reason?.message).not.toMatch(/enemy/i);
  });

  it('a remembered (explored, fogged) barbarian camp on the path is still explained', () => {
    const world = movementWorld({ to: { q: 2, r: 0 }, width: 3, visibility: { '1,0': 'fog', '1,1': 'fog' } });
    placeCamp(world, { q: 1, r: 0 });
    expect(movementExplainerSurface.project(world, 'civ-a')?.code).toBe('barbarian-camp');
  });

  it('an unseen Zone-of-Control source cannot be named', () => {
    // Enemy at (2,1) exerts ZoC over (2,0), stopping a move to (3,0) short.
    const world = movementWorld({ to: { q: 3, r: 0 }, visibility: { '2,1': 'fog' } });
    placeUnit(world, 'warrior', 'civ-b', { q: 2, r: 1 });
    expect(movementExplainerSurface.project(world, 'civ-a')?.code).toBe('hidden-obstacle');
    expectViewerSafety(movementExplainerSurface, {
      world,
      viewerId: 'civ-a',
      hidden: [{ label: 'the unseen ZoC source is a different unit type', apply: w => { w.state.units[enemyUnitId(w)]!.type = 'spearman'; } }],
      earned: [{ label: 'the ZoC source comes into view', apply: w => setVis(w, { q: 2, r: 1 }, 'visible') }],
    });
    const seen = structuredClone(world);
    setVis(seen, { q: 2, r: 1 }, 'visible');
    expect(movementExplainerSurface.project(seen, 'civ-a')?.code).toBe('zone-of-control');
  });

  it('a concealed submarine on a visible path tile cannot be named', () => {
    // A trireme detects submarines only within range 1; the sub sits at range 2.
    const world = movementWorld({ to: { q: 3, r: 0 }, moverType: 'trireme', terrain: 'coast' });
    const subId = placeUnit(world, 'submarine', 'civ-b', { q: 2, r: 0 });
    expect(movementExplainerSurface.project(world, 'civ-a')?.code).toBe('hidden-obstacle');
    expectViewerSafety(movementExplainerSurface, {
      world,
      viewerId: 'civ-a',
      hidden: [{ label: 'the concealed sub is a missile submarine instead', apply: w => { w.state.units[subId]!.type = 'missile_submarine'; } }],
      earned: [{ label: 'the sub fires and is revealed this turn', apply: w => { w.state.units[subId]!.revealedThisTurn = true; } }],
    });
  });

  it('keeps canonical legality untouched: the resolver still rejects, a clear route stays legal', () => {
    const world = movementWorld({ to: { q: 2, r: 0 }, width: 3, visibility: { '1,0': 'fog', '1,1': 'fog' } });
    placeUnit(world, 'warrior', 'civ-b', { q: 1, r: 0 });
    const canonical = resolveUnitMoveIntent(world.state, world.moverId, world.to, { actor: 'player', civId: 'civ-a' });
    expect(canonical.ok).toBe(false);
    if (!canonical.ok) expect(canonical.reason).toBe('occupied');
    const clear = movementWorld({ to: { q: 2, r: 0 }, width: 3, visibility: { '1,0': 'fog', '1,1': 'fog' } });
    expect(resolveUnitMoveIntent(clear.state, clear.moverId, clear.to, { actor: 'player', civId: 'civ-a' }).ok).toBe(true);
    expect(getMovementBlockerReason(clear.state, clear.moverId, clear.to)).toBeNull();
  });
});
