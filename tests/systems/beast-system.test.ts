import { describe, it, expect } from 'vitest';
import { placeBeastLairs, BEAST_OWNER, LAIR_COUNTS, processBeasts, recordBeastSlain, getBeastHoardGold, isBeastConcealedFrom, applyHoardChoice, getHoardChoicePreview, getClaimedTrophyGoldPerTurn, isTerrainPassableForBeast, canUnitAttackBeast, isCivUnitInBeastTerritory } from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { generateMap } from '@/systems/map-generator';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { createNewGame } from '@/core/game-state';
import { startResearch } from '@/systems/tech-system';
import type { BeastLair, Unit } from '@/core/types';

describe('placeBeastLairs', () => {
  const map = generateMap(40, 30, 'beast-test-seed');
  const starts = [{ q: 5, r: 5 }, { q: 30, r: 20 }];

  it('places lairs only on matching habitat terrain, away from starts', () => {
    const lairs = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    for (const lair of Object.values(lairs)) {
      const def = BEAST_DEFINITIONS[lair.beastId];
      const tile = map.tiles[hexKey(lair.position)];
      expect(def.habitatTerrains).toContain(tile.terrain);
      expect(tile.wonder).toBeNull();
      for (const start of starts) {
        expect(hexDistance(lair.position, start)).toBeGreaterThanOrEqual(6);
      }
      expect(lair.status).toBe('dormant');
      expect(lair.unitIds).toEqual([]);
      expect(lair.strength).toBe(0);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    const b = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    expect(a).toEqual(b);
  });

  it('never places more lairs than the map-size budget', () => {
    const lairs = placeBeastLairs(map, starts, 'small', 'beast-test-seed');
    expect(Object.keys(lairs).length).toBeLessThanOrEqual(LAIR_COUNTS.small);
  });

  it('rejects the only habitat tile when it is adjacent across the wrap seam to a start (issue #520)', () => {
    const wrapMap = generateMap(30, 12, 'beast-wrap-placement');
    wrapMap.wrapsHorizontally = true;
    for (const tile of Object.values(wrapMap.tiles)) tile.terrain = 'ocean';
    wrapMap.tiles['29,5'].terrain = 'forest';
    const startPositions = [{ q: 0, r: 5 }];

    const lairs = placeBeastLairs(wrapMap, startPositions, 'small', 'beast-wrap-seed');

    expect(Object.values(lairs).some(l => hexKey(l.position) === '29,5')).toBe(false);
  });

  it('exports the beasts owner constant', () => {
    expect(BEAST_OWNER).toBe('beasts');
  });
});

// ---- Helpers shared across behavior + slay tests ----

function makeLair(overrides: Partial<BeastLair> = {}): BeastLair {
  return {
    id: 'lair-giant_boar', beastId: 'giant_boar',
    position: { q: 10, r: 10 }, status: 'dormant',
    strength: 0, unitIds: [], ...overrides,
  };
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u1', type: 'warrior', owner: 'player', position: { q: 12, r: 10 },
    movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false, ...overrides,
  } as Unit;
}

function tinyMap(terrainAt: Record<string, string>) {
  const tiles: Record<string, any> = {};
  for (const [key, terrain] of Object.entries(terrainAt)) {
    const [q, r] = key.split(',').map(Number);
    tiles[key] = { coord: { q, r }, terrain, elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
  }
  return { width: 40, height: 30, tiles, wrapsHorizontally: false } as any;
}

const behaviorMap = generateMap(40, 30, 'beast-test-seed');

describe('processBeasts', () => {
  it('awakens a dormant lair once the era requirement is met (seeded chance)', () => {
    let awakened = 0;
    // 10% chance per turn — run 200 seeds to guarantee at least one awakening
    for (let seed = 1; seed <= 200; seed++) {
      const result = processBeasts([makeLair()], behaviorMap, [], [], 1, 'wild', seed);
      if (result.awakenings.length > 0) awakened++;
    }
    expect(awakened).toBeGreaterThan(0);
    expect(awakened).toBeLessThan(200);
  });

  it('never awakens before the awaken era', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const result = processBeasts([makeLair()], behaviorMap, [], [], 0, 'wild', seed);
      expect(result.awakenings).toEqual([]);
    }
  });

  it('does nothing in off mode', () => {
    const result = processBeasts([makeLair()], behaviorMap, [], [], 3, 'off', 7);
    expect(result.awakenings).toEqual([]);
    expect(result.spawnOrders).toEqual([]);
  });

  it('orders an attack when an intruder is adjacent, in wild mode only', () => {
    const lair = makeLair({ status: 'awake', unitIds: ['beast-1'] });
    const beast = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 } });
    const intruder = makeUnit({ id: 'u1', position: { q: 11, r: 10 } });
    const wild = processBeasts([lair], behaviorMap, [intruder], [beast], 1, 'wild', 7);
    expect(wild.attackOrders).toEqual([{ attackerUnitId: 'beast-1', defenderUnitId: 'u1' }]);
    const calm = processBeasts([lair], behaviorMap, [intruder], [beast], 1, 'calm', 7);
    expect(calm.attackOrders).toEqual([]);
  });

  it('never moves a beast beyond its leash radius', () => {
    // leashRadius = 3; beast at edge (q:13,r:10 is distance 3 from lair at q:10,r:10)
    const lair = makeLair({ status: 'awake', unitIds: ['beast-1'] });
    const beast = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 13, r: 10 } });
    const farIntruder = makeUnit({ id: 'u1', position: { q: 17, r: 10 } });
    const result = processBeasts([lair], behaviorMap, [farIntruder], [beast], 1, 'wild', 7);
    for (const order of result.moveOrders) {
      expect(hexDistance(order.toCoord, lair.position)).toBeLessThanOrEqual(3);
    }
  });

  it('attacks an intruder that is adjacent only across the horizontal wrap seam (issue #520)', () => {
    const wrapMap = generateMap(10, 6, 'beast-wrap-attack');
    wrapMap.wrapsHorizontally = true;
    for (const tile of Object.values(wrapMap.tiles)) tile.terrain = 'plains';
    const lair = makeLair({ position: { q: 0, r: 2 }, status: 'awake', unitIds: ['beast-1'] });
    const beast = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 0, r: 2 } });
    const intruder = makeUnit({ id: 'u1', position: { q: 9, r: 2 } });

    const result = processBeasts([lair], wrapMap, [intruder], [beast], 1, 'wild', 7);

    expect(result.attackOrders).toEqual([{ attackerUnitId: 'beast-1', defenderUnitId: 'u1' }]);
  });
});

// ---- Task 6: slay reward tests ----

describe('recordBeastSlain', () => {
  function stateWithSlainBoar() {
    const state = createNewGame('rome', 'beast-test-seed', 'small', 'Beast Test');
    const beast: Unit = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 } });
    const victor: Unit = makeUnit({ id: 'hero-1', owner: state.currentPlayer, health: 40, position: { q: 11, r: 10 } });
    state.units[beast.id] = beast;
    state.units[victor.id] = victor;
    state.beasts = {
      mode: 'wild',
      lairs: { 'lair-giant_boar': makeLair({ status: 'awake', unitIds: ['beast-1'] }) },
      sightingsByCiv: {},
    };
    return { state, beast, victor };
  }

  it('marks the lair slain, awards hoard gold, and fully heals the victor', () => {
    const { state, beast, victor } = stateWithSlainBoar();
    const goldBefore = state.civilizations[victor.owner].gold;
    const { state: next, slain } = recordBeastSlain(state, beast, victor);
    expect(slain).toBeDefined();
    expect(next.beasts!.lairs['lair-giant_boar'].status).toBe('slain');
    expect(next.beasts!.lairs['lair-giant_boar'].slainBy).toBe(victor.owner);
    expect(next.civilizations[victor.owner].gold).toBe(goldBefore + slain!.goldAwarded);
    expect(next.units['hero-1'].health).toBe(100);
    // immutability: input state untouched
    expect(state.beasts!.lairs['lair-giant_boar'].status).toBe('awake');
  });

  it('returns no slain payload for non-beast defenders', () => {
    const { state, victor } = stateWithSlainBoar();
    const barb = makeUnit({ id: 'barb-1', owner: 'barbarian' });
    expect(recordBeastSlain(state, barb, victor).slain).toBeUndefined();
  });

  it('only marks the lair slain when its last unit dies', () => {
    const { state, beast, victor } = stateWithSlainBoar();
    state.beasts!.lairs['lair-giant_boar'].unitIds = ['beast-1', 'beast-2'];
    const { state: next, slain } = recordBeastSlain(state, beast, victor);
    expect(slain).toBeUndefined();
    expect(next.beasts!.lairs['lair-giant_boar'].status).toBe('awake');
    expect(next.beasts!.lairs['lair-giant_boar'].unitIds).toEqual(['beast-2']);
  });

  it('scales hoard gold with era', () => {
    const def = BEAST_DEFINITIONS.giant_boar;
    expect(getBeastHoardGold(def, 1)).toBe(40);
    expect(getBeastHoardGold(def, 3)).toBeGreaterThan(getBeastHoardGold(def, 1));
  });
});

describe('isBeastConcealedFrom', () => {
  const jungleMap = tinyMap({ '5,5': 'jungle', '6,5': 'grassland', '7,5': 'grassland' });
  const basilisk = makeUnit({ id: 'beast-bas', type: 'beast_basilisk', owner: 'beasts', position: { q: 5, r: 5 } });

  it('conceals a basilisk on jungle when no viewer unit is adjacent', () => {
    const farViewer = makeUnit({ id: 'v1', position: { q: 7, r: 5 } });
    expect(isBeastConcealedFrom(basilisk, jungleMap, [farViewer])).toBe(true);
  });

  it('reveals a basilisk when a viewer unit is adjacent', () => {
    const nearViewer = makeUnit({ id: 'v1', position: { q: 6, r: 5 } });
    expect(isBeastConcealedFrom(basilisk, jungleMap, [nearViewer])).toBe(false);
  });

  it('never conceals a basilisk off its habitat terrain', () => {
    const offHabitat = { ...basilisk, position: { q: 6, r: 5 } };
    expect(isBeastConcealedFrom(offHabitat, jungleMap, [])).toBe(false);
  });

  it('never conceals non-stealth beasts (boar) or non-beasts', () => {
    const boar = makeUnit({ id: 'beast-boar', type: 'beast_boar', owner: 'beasts', position: { q: 5, r: 5 } });
    expect(isBeastConcealedFrom(boar, jungleMap, [])).toBe(false);
    const warrior = makeUnit({ id: 'w1', position: { q: 5, r: 5 } });
    expect(isBeastConcealedFrom(warrior, jungleMap, [])).toBe(false);
  });
});

describe('hoard choices', () => {
  function stateWithSlainBasilisk() {
    const state = createNewGame('rome', 'beast-test-seed', 'small', 'Hoard Test');
    state.era = 2;
    state.beasts = {
      mode: 'wild',
      lairs: {
        'lair-emerald_basilisk': makeLair({ id: 'lair-emerald_basilisk', beastId: 'emerald_basilisk', status: 'awake', unitIds: ['beast-1'] }),
      },
      sightingsByCiv: {},
    };
    const beast = makeUnit({ id: 'beast-1', type: 'beast_basilisk', owner: 'beasts' });
    const victor = makeUnit({ id: 'hero-1', owner: state.currentPlayer, position: { q: 11, r: 10 } });
    state.units[beast.id] = beast;
    state.units[victor.id] = victor;
    return { state, beast, victor };
  }

  it('tier >= 2 slay queues a pending choice and awards NO automatic gold', () => {
    const { state, beast, victor } = stateWithSlainBasilisk();
    const goldBefore = state.civilizations[victor.owner].gold;
    const { state: next, slain } = recordBeastSlain(state, beast, victor);
    expect(slain).toBeDefined();
    expect(slain!.goldAwarded).toBe(0);
    expect(next.civilizations[victor.owner].gold).toBe(goldBefore);
    expect(next.beasts!.pendingHoardChoices).toEqual([{ lairId: 'lair-emerald_basilisk', civId: victor.owner }]);
  });

  it('tier 1 slay still auto-pays gold and queues nothing', () => {
    const { state, victor } = stateWithSlainBasilisk();
    state.beasts!.lairs['lair-giant_boar'] = makeLair({ status: 'awake', unitIds: ['boar-1'] });
    const boar = makeUnit({ id: 'boar-1', type: 'beast_boar', owner: 'beasts' });
    state.units[boar.id] = boar;
    const { state: next, slain } = recordBeastSlain(state, boar, victor);
    expect(slain!.goldAwarded).toBeGreaterThan(0);
    expect(next.beasts!.pendingHoardChoices ?? []).toEqual([]);
  });

  it('preview exposes concrete numbers for all three options', () => {
    const { state } = stateWithSlainBasilisk();
    const preview = getHoardChoicePreview(state, 'lair-emerald_basilisk');
    expect(preview.gold).toBeGreaterThan(0);
    expect(preview.lore).toBeGreaterThan(0);
    expect(preview.trophyGoldPerTurn).toBeGreaterThan(0);
  });

  it('applyHoardChoice gold pays out and clears the pending entry', () => {
    const { state, beast, victor } = stateWithSlainBasilisk();
    const { state: slainState } = recordBeastSlain(state, beast, victor);
    const goldBefore = slainState.civilizations[victor.owner].gold;
    const preview = getHoardChoicePreview(slainState, 'lair-emerald_basilisk');
    const next = applyHoardChoice(slainState, 'lair-emerald_basilisk', victor.owner, 'gold');
    expect(next.civilizations[victor.owner].gold).toBe(goldBefore + preview.gold);
    expect(next.beasts!.pendingHoardChoices).toEqual([]);
    expect(next.beasts!.lairs['lair-emerald_basilisk'].status).toBe('slain');
  });

  it('applyHoardChoice lore advances research progress and clears the pending entry', () => {
    const { state, beast, victor } = stateWithSlainBasilisk();
    const { state: slainState } = recordBeastSlain(state, beast, victor);
    const civId = victor.owner;
    const civ = slainState.civilizations[civId];
    const withResearch = {
      ...slainState,
      civilizations: {
        ...slainState.civilizations,
        [civId]: { ...civ, techState: startResearch(civ.techState, 'stone-weapons') },
      },
    };
    const next = applyHoardChoice(withResearch, 'lair-emerald_basilisk', civId, 'lore');
    expect(next.beasts!.pendingHoardChoices).toEqual([]);
    const nextTech = next.civilizations[civId].techState;
    // lore bonus >> stone-weapons cost (4), so the tech should complete
    expect(nextTech.completed).toContain('stone-weapons');
  });

  it('applyHoardChoice trophy claims the lair and produces per-turn income', () => {
    const { state, beast, victor } = stateWithSlainBasilisk();
    const { state: slainState } = recordBeastSlain(state, beast, victor);
    const next = applyHoardChoice(slainState, 'lair-emerald_basilisk', victor.owner, 'trophy');
    expect(next.beasts!.lairs['lair-emerald_basilisk'].status).toBe('claimed');
    expect(next.beasts!.lairs['lair-emerald_basilisk'].claimedBy).toBe(victor.owner);
    expect(getClaimedTrophyGoldPerTurn(next, victor.owner)).toBeGreaterThan(0);
    expect(getClaimedTrophyGoldPerTurn(next, 'someone-else')).toBe(0);
  });

  it('applyHoardChoice refuses the wrong civ', () => {
    const { state, beast, victor } = stateWithSlainBasilisk();
    const { state: slainState } = recordBeastSlain(state, beast, victor);
    const next = applyHoardChoice(slainState, 'lair-emerald_basilisk', 'ai-1', 'gold');
    expect(next).toBe(slainState);
  });
});

describe('pack spawning', () => {
  it('spawns up to packSize wolves on awakening, never stacking', () => {
    const map = generateMap(40, 30, 'beast-test-seed');
    const tundraTile = Object.values(map.tiles).find(t => t.terrain === 'tundra');
    if (!tundraTile) return;
    const lair = makeLair({ id: 'lair-dire_wolf', beastId: 'dire_wolf', position: tundraTile.coord });
    for (let seed = 1; seed <= 60; seed++) {
      const result = processBeasts([lair], map, [], [], 1, 'wild', seed);
      if (result.awakenings.length === 0) continue;
      expect(result.spawnOrders.length).toBeGreaterThanOrEqual(1);
      expect(result.spawnOrders.length).toBeLessThanOrEqual(3);
      const keys = result.spawnOrders.map(o => `${o.position.q},${o.position.r}`);
      expect(new Set(keys).size).toBe(keys.length);
      return;
    }
    throw new Error('no seed awakened the wolf lair in 60 tries');
  });
});

describe('beast passability', () => {
  it('naval beasts move only on water; land beasts only on land', () => {
    expect(isTerrainPassableForBeast('beast_sea_serpent', 'ocean')).toBe(true);
    expect(isTerrainPassableForBeast('beast_sea_serpent', 'coast')).toBe(true);
    expect(isTerrainPassableForBeast('beast_sea_serpent', 'grassland')).toBe(false);
    expect(isTerrainPassableForBeast('beast_boar', 'ocean')).toBe(false);
    expect(isTerrainPassableForBeast('beast_boar', 'forest')).toBe(true);
    expect(isTerrainPassableForBeast('beast_boar', 'mountain')).toBe(false);
  });

  it('serpent move orders never target land (no beaching)', () => {
    const map = tinyMap({
      '10,10': 'ocean', '11,10': 'ocean', '12,10': 'grassland',
      '9,10': 'ocean', '10,9': 'ocean', '10,11': 'coast', '11,9': 'grassland', '9,11': 'ocean',
    });
    const lair = makeLair({ id: 'lair-sea_serpent', beastId: 'sea_serpent', position: { q: 10, r: 10 }, status: 'awake', unitIds: ['serp-1'] });
    const serpent = makeUnit({ id: 'serp-1', type: 'beast_sea_serpent', owner: 'beasts', position: { q: 10, r: 10 } });
    const ship = makeUnit({ id: 'ship-1', type: 'galley', position: { q: 11, r: 10 } });
    const result = processBeasts([lair], map, [ship], [serpent], 3, 'wild', 7);
    for (const order of result.moveOrders) {
      const terrain = map.tiles[`${order.toCoord.q},${order.toCoord.r}`].terrain;
      expect(['ocean', 'coast']).toContain(terrain);
    }
  });
});

describe('canUnitAttackBeast', () => {
  const serpent = makeUnit({ id: 's', type: 'beast_sea_serpent', owner: 'beasts' });
  const boar = makeUnit({ id: 'b', type: 'beast_boar', owner: 'beasts' });

  it('land melee cannot attack a navalOnly beast', () => {
    expect(canUnitAttackBeast(makeUnit({ type: 'warrior' }), serpent).allowed).toBe(false);
    expect(canUnitAttackBeast(makeUnit({ type: 'warrior' }), serpent).reason).toContain('ships and ranged');
  });

  it('naval and ranged units can attack a navalOnly beast', () => {
    expect(canUnitAttackBeast(makeUnit({ type: 'galley' }), serpent).allowed).toBe(true);
    expect(canUnitAttackBeast(makeUnit({ type: 'archer' }), serpent).allowed).toBe(true);
  });

  it('everything can attack normal beasts', () => {
    expect(canUnitAttackBeast(makeUnit({ type: 'warrior' }), boar).allowed).toBe(true);
    const roc = makeUnit({ id: 'r', type: 'beast_roc', owner: 'beasts' });
    expect(canUnitAttackBeast(makeUnit({ type: 'warrior' }), roc).allowed).toBe(true);
    expect(canUnitAttackBeast(makeUnit({ type: 'galley' }), roc).allowed).toBe(true);
  });
});

describe('flying and regen', () => {
  it('the roc may move onto mountains; land beasts may not', () => {
    expect(isTerrainPassableForBeast('beast_roc', 'mountain')).toBe(true);
    expect(isTerrainPassableForBeast('beast_roc', 'grassland')).toBe(true);
    expect(isTerrainPassableForBeast('beast_roc', 'ocean')).toBe(false);
    expect(isTerrainPassableForBeast('beast_roc', 'coast')).toBe(false);
    expect(isTerrainPassableForBeast('beast_boar', 'mountain')).toBe(false);
  });

  it('processBeasts emits regen orders for wounded hydras only', () => {
    const map = tinyMap({ '10,10': 'swamp', '11,10': 'swamp', '9,10': 'swamp' });
    const lair = makeLair({ id: 'lair-swamp_hydra', beastId: 'swamp_hydra', position: { q: 10, r: 10 }, status: 'awake', unitIds: ['hydra-1'] });
    const wounded = makeUnit({ id: 'hydra-1', type: 'beast_hydra', owner: 'beasts', position: { q: 10, r: 10 }, health: 60 });
    const result = processBeasts([lair], map, [], [wounded], 3, 'wild', 7);
    expect(result.regenOrders).toEqual([{ unitId: 'hydra-1', amount: 10 }]);

    const healthy = { ...wounded, health: 100 };
    const none = processBeasts([lair], map, [], [healthy], 3, 'wild', 7);
    expect(none.regenOrders).toEqual([]);
  });

  it('regen orders are emitted in calm mode too', () => {
    const map = tinyMap({ '10,10': 'swamp' });
    const lair = makeLair({ id: 'lair-swamp_hydra', beastId: 'swamp_hydra', position: { q: 10, r: 10 }, status: 'awake', unitIds: ['hydra-1'] });
    const wounded = makeUnit({ id: 'hydra-1', type: 'beast_hydra', owner: 'beasts', position: { q: 10, r: 10 }, health: 50 });
    const result = processBeasts([lair], map, [], [wounded], 3, 'calm', 7);
    expect(result.regenOrders).toEqual([{ unitId: 'hydra-1', amount: 10 }]);
  });

  it('non-regen beasts never appear in regen orders', () => {
    const map = tinyMap({ '10,10': 'forest', '11,10': 'forest' });
    const lair = makeLair({ id: 'lair-giant_boar', beastId: 'giant_boar', position: { q: 10, r: 10 }, status: 'awake', unitIds: ['boar-1'] });
    const wounded = makeUnit({ id: 'boar-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 }, health: 50 });
    const result = processBeasts([lair], map, [], [wounded], 1, 'wild', 7);
    expect(result.regenOrders).toEqual([]);
  });
});

describe('apex reward (tier 4)', () => {
  function makeApexState() {
    const state = createNewGame('rome', 'apex-test-seed', 'small', 'Apex Test');
    const dragon = makeUnit({ id: 'drg-apex', type: 'beast_dragon', owner: 'beasts', position: { q: 5, r: 5 } });
    const victor = makeUnit({ id: 'hero-1', owner: state.currentPlayer, position: { q: 4, r: 5 }, experience: 0 });
    const lair: BeastLair = makeLair({
      id: 'lair-ancient_dragon', beastId: 'ancient_dragon',
      position: { q: 5, r: 5 }, status: 'awake', unitIds: ['drg-apex'],
    });
    const withBeasts: typeof state = {
      ...state,
      era: 4,
      beasts: { mode: 'wild', lairs: { 'lair-ancient_dragon': lair }, sightingsByCiv: {} },
      units: { ...state.units, [dragon.id]: dragon, [victor.id]: victor },
    };
    return { state: withBeasts, dragon, victor };
  }

  it('grants gold + lore + trophy-claim + max veterancy with NO pending choice', () => {
    const { state: baseState, dragon, victor } = makeApexState();
    // give the civ an active research so lore progress is measurable
    const civId = victor.owner;
    const withResearch: typeof baseState = {
      ...baseState,
      civilizations: {
        ...baseState.civilizations,
        [civId]: {
          ...baseState.civilizations[civId],
          techState: startResearch(baseState.civilizations[civId].techState, 'stone-weapons'),
        },
      },
    };
    const goldBefore = withResearch.civilizations[civId].gold;
    const progressBefore = withResearch.civilizations[civId].techState.researchProgress;
    const { state: next, slain } = recordBeastSlain(withResearch, dragon, victor);

    expect(slain).toBeDefined();
    // gold awarded is positive (gold ×2 formula)
    expect(slain!.goldAwarded).toBeGreaterThan(0);
    // gold deposited in treasury
    expect(next.civilizations[civId].gold).toBe(goldBefore + slain!.goldAwarded);
    // lair is claimed (not just slain), credited to victor's civ
    expect(next.beasts!.lairs['lair-ancient_dragon'].status).toBe('claimed');
    expect(next.beasts!.lairs['lair-ancient_dragon'].claimedBy).toBe(civId);
    // NO pending hoard choice — apex gets everything automatically
    expect(next.beasts!.pendingHoardChoices ?? []).toEqual([]);
    // hero reaches max veterancy (experience at or above elite threshold = 50)
    expect(next.units['hero-1'].experience).toBeGreaterThanOrEqual(50);
    // lore applied — research progress must advance (or tech completes)
    const progressAfter = next.civilizations[civId].techState.researchProgress;
    const completedAfter = next.civilizations[civId].techState.completed;
    const loreApplied = progressAfter > progressBefore || completedAfter.includes('stone-weapons');
    expect(loreApplied).toBe(true);
  });

  it('tier-2 beasts still get choice panel, not apex path', () => {
    const state = createNewGame('rome', 'tier2-test-seed', 'small', 'T2 Test');
    const basilisk = makeUnit({ id: 'bas-1', type: 'beast_basilisk', owner: 'beasts', position: { q: 5, r: 5 } });
    const victor = makeUnit({ id: 'hero-2', owner: state.currentPlayer, position: { q: 4, r: 5 } });
    const lair: BeastLair = makeLair({ id: 'lair-emerald_basilisk', beastId: 'emerald_basilisk', position: { q: 5, r: 5 }, status: 'awake', unitIds: ['bas-1'] });
    const withBeasts: typeof state = {
      ...state,
      era: 2,
      beasts: { mode: 'wild', lairs: { 'lair-emerald_basilisk': lair }, sightingsByCiv: {} },
      units: { ...state.units, [basilisk.id]: basilisk, [victor.id]: victor },
    };
    const { state: next } = recordBeastSlain(withBeasts, basilisk, victor);
    expect(next.beasts!.pendingHoardChoices?.length).toBeGreaterThan(0);
    // experience NOT boosted to max for tier-2
    expect(next.units['hero-2'].experience).toBeLessThan(50);
  });
});

describe('dragon ranged attacks', () => {
  it('orders an attack at 2-hex range', () => {
    const map = tinyMap({ '10,10': 'volcanic', '11,10': 'grassland', '12,10': 'grassland' });
    const lair = makeLair({ id: 'lair-ancient_dragon', beastId: 'ancient_dragon', position: { q: 10, r: 10 }, status: 'awake', unitIds: ['drg-1'] });
    const dragon = makeUnit({ id: 'drg-1', type: 'beast_dragon', owner: 'beasts', position: { q: 10, r: 10 } });
    const intruder = makeUnit({ id: 'u2', position: { q: 12, r: 10 } });
    const result = processBeasts([lair], map, [intruder], [dragon], 4, 'wild', 7);
    expect(result.attackOrders).toEqual([{ attackerUnitId: 'drg-1', defenderUnitId: 'u2' }]);
  });

  it('melee beasts still require adjacency', () => {
    const map = tinyMap({ '10,10': 'forest', '11,10': 'grassland', '12,10': 'grassland' });
    const lair = makeLair({ status: 'awake', unitIds: ['boar-2'] });
    const boar = makeUnit({ id: 'boar-2', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 } });
    const intruder = makeUnit({ id: 'u3', position: { q: 12, r: 10 } });
    const result = processBeasts([lair], map, [intruder], [boar], 1, 'wild', 7);
    expect(result.attackOrders).toEqual([]);
  });
});

describe('isCivUnitInBeastTerritory', () => {
  it('true only when a civ unit stands within an AWAKE lair leash radius', () => {
    const state = createNewGame('rome', 'beast-test-seed', 'small', 'Territory Test');
    state.beasts = {
      mode: 'wild',
      lairs: { 'lair-giant_boar': makeLair({ status: 'awake', unitIds: ['beast-1'] }) },
      sightingsByCiv: {},
    };
    const me = state.currentPlayer;
    state.units['scout-1'] = makeUnit({ id: 'scout-1', owner: me, position: { q: 12, r: 10 } });
    expect(isCivUnitInBeastTerritory(state, me)).toBe(true);

    state.units['scout-1'].position = { q: 20, r: 20 };
    expect(isCivUnitInBeastTerritory(state, me)).toBe(false);

    state.units['scout-1'].position = { q: 12, r: 10 };
    state.beasts.lairs['lair-giant_boar'].status = 'dormant';
    expect(isCivUnitInBeastTerritory(state, me)).toBe(false);
  });
});
