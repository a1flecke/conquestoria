import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { HexCoord, Unit, UnitType } from '@/core/types';
import { canAttackByProfileOnMap, canUnitAttackTarget, getAttackTargets, getUnitAttackProfile } from '@/systems/attack-targeting';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function unit(id: string, type: UnitType, owner: string, position: HexCoord): Unit {
  return { ...createUnit(type, owner, position, mkC()), id, owner, position };
}

function stateWithUnits(units: Record<string, Unit>, visibility: Record<string, 'visible' | 'fog' | 'unexplored'> = {}) {
  const state = createNewGame(undefined, 'attack-targeting-test', 'small');
  state.units = units;
  state.civilizations.player.units = Object.keys(units).filter(id => units[id].owner === 'player');
  state.civilizations['ai-1'].units = Object.keys(units).filter(id => units[id].owner === 'ai-1');
  state.civilizations.player.visibility.tiles = visibility;
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  return state;
}

describe('attack-targeting', () => {
  it('gives warriors the default melee profile and archers an explicit ranged profile', () => {
    // #845: DEFAULT_ATTACK_PROFILE no longer carries `targetDomains` itself -- a land unit
    // like Warrior is still behaviorally restricted to land targets, but that restriction now
    // comes from canAttackUnitDomain's per-attacker-domain fallback at call time, not from a
    // static value baked into the profile object. See the naval-attack tests below for the
    // behavioral (not just shape) coverage this split enables.
    expect(getUnitAttackProfile('warrior')).toEqual({ kind: 'melee', range: 1, targets: ['unit', 'city'] });
    expect(getUnitAttackProfile('archer')).toEqual({ kind: 'ranged', range: 2, targets: ['unit'] });
  });

  it('rejects non-adjacent melee attacks even when the enemy is inside movement range', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });

  it('allows archers to attack visible hostile units at range without moving into the defender hex', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toMatchObject({
      ok: true,
      targetType: 'unit',
      targetUnitId: 'defender',
      range: 2,
    });
  });

  it('rejects land melee attacks against naval units while retaining ranged and naval attacks', () => {
    const spearman = unit('spearman', 'spearman', 'player', { q: 0, r: 0 });
    const archer = unit('archer', 'archer', 'player', { q: 0, r: 1 });
    const frigate = unit('frigate', 'frigate', 'player', { q: 0, r: 2 });
    const pirate = unit('pirate', 'pirate_frigate', 'pirate-1', { q: 1, r: 0 });
    const state = stateWithUnits({ spearman, archer, frigate, pirate }, { '1,0': 'visible' });

    expect(canAttackByProfileOnMap(spearman, pirate, state.map)).toBe(false);
    expect(canUnitAttackTarget(state, spearman, pirate.position, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'unsupported-target',
    });
    expect(canAttackByProfileOnMap(archer, pirate, state.map)).toBe(true);
    expect(canAttackByProfileOnMap(frigate, pirate, state.map)).toBe(true);
  });

  // #845 regression: commit 1f8ac7fee2 (fixing #826, "land melee cannot attack naval") added
  // `targetDomains: ['land']` directly onto the shared DEFAULT_ATTACK_PROFILE object. Any unit
  // with no attackProfile of its own -- including naval units like Galley/Trireme -- resolves
  // to that same shared object via getUnitAttackProfile, so canAttackUnitDomain's
  // per-attacker-domain fallback (`profile.targetDomains ?? (attackerDomain === 'land' ...)`)
  // never ran for them: they silently inherited the land-only restriction regardless of their
  // own domain, making them unable to attack ANY naval unit -- pirates included. Confirmed
  // directly: pre-fix, getUnitAttackProfile('galley').targetDomains was ['land'].
  it('lets a Galley (naval, no explicit attackProfile) attack an adjacent naval unit', () => {
    const galley = unit('galley', 'galley', 'player', { q: 0, r: 0 });
    const pirateGalley = unit('pirate-galley', 'pirate_galley', 'pirate-1', { q: 1, r: 0 });
    const state = stateWithUnits({ galley, 'pirate-galley': pirateGalley }, { '1,0': 'visible' });

    expect(canAttackByProfileOnMap(galley, pirateGalley, state.map)).toBe(true);
    expect(canUnitAttackTarget(state, galley, pirateGalley.position, { viewerId: 'player' })).toMatchObject({
      ok: true, targetType: 'unit', targetUnitId: 'pirate-galley',
    });
  });

  it('lets a Trireme (naval, no explicit attackProfile) attack an adjacent naval unit', () => {
    const trireme = unit('trireme', 'trireme', 'player', { q: 0, r: 0 });
    const enemyTrireme = unit('enemy-trireme', 'trireme', 'ai-1', { q: 1, r: 0 });
    const state = stateWithUnits({ trireme, 'enemy-trireme': enemyTrireme }, { '1,0': 'visible' });

    expect(canAttackByProfileOnMap(trireme, enemyTrireme, state.map)).toBe(true);
    expect(canUnitAttackTarget(state, trireme, enemyTrireme.position, { viewerId: 'player' })).toMatchObject({
      ok: true, targetType: 'unit', targetUnitId: 'enemy-trireme',
    });
  });

  it('still blocks a land melee unit with the default profile from attacking naval (control, unchanged by the naval fix)', () => {
    // Same shared DEFAULT_ATTACK_PROFILE object, but attackerDomain is 'land' here, so
    // canAttackUnitDomain's fallback must still compute ['land'] and block this -- proving the
    // #826 fix for land-vs-naval survives removing the hardcoded default.
    const warrior = unit('warrior', 'warrior', 'player', { q: 0, r: 0 });
    const pirateGalley = unit('pirate-galley', 'pirate_galley', 'pirate-1', { q: 1, r: 0 });
    const state = stateWithUnits({ warrior, 'pirate-galley': pirateGalley }, { '1,0': 'visible' });

    expect(canAttackByProfileOnMap(warrior, pirateGalley, state.map)).toBe(false);
    expect(canUnitAttackTarget(state, warrior, pirateGalley.position, { viewerId: 'player' })).toEqual({
      ok: false, reason: 'unsupported-target',
    });
  });

  // #845 review finding: observation_balloon has no explicit attackProfile and nonzero
  // strength (used defensively). Before the naval fix it was accidentally land-only-restricted
  // by the same DEFAULT_ATTACK_PROFILE bug that broke Galley/Trireme; after removing the
  // hardcoded default, an air-domain attacker with no profile of its own falls back to the
  // fully permissive domain set, which would have newly let it attack anything -- directly
  // contradicting its own "Cannot attack" description. Fixed with an explicit
  // `targets: []` profile; this is the regression test proving that holds.
  it('keeps the Observation Balloon unable to attack anything, matching its "Cannot attack" description', () => {
    const balloon = unit('balloon', 'observation_balloon', 'player', { q: 0, r: 0 });
    const groundTarget = unit('ground-target', 'warrior', 'ai-1', { q: 1, r: 0 });
    const state = stateWithUnits({ balloon, 'ground-target': groundTarget }, { '1,0': 'visible' });

    expect(canAttackByProfileOnMap(balloon, groundTarget, state.map)).toBe(false);
    expect(canUnitAttackTarget(state, balloon, groundTarget.position, { viewerId: 'player' })).toEqual({
      ok: false, reason: 'unsupported-target',
    });
  });

  it('does not expose an aircraft that is based at an airfield as a map target', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const basedAircraft = { ...unit('based-aircraft', 'biplane', 'ai-1', { q: 2, r: 0 }), airBase: { kind: 'city' as const, cityId: 'enemy-airfield' } };
    const state = stateWithUnits({ attacker, 'based-aircraft': basedAircraft }, { '2,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'no-target',
    });
  });

  it('rejects ranged attacks against fogged targets through the player path', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'fog' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'not-visible',
    });
  });

  it('rejects unit attacks against major civs that are not at war', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });
    state.civilizations.player.diplomacy.atWarWith = [];
    state.civilizations['ai-1'].diplomacy.atWarWith = [];

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'not-hostile',
    });
  });

  it('allows major civilizations and pirates to target each other without diplomacy state', () => {
    const player = unit('player-warrior', 'warrior', 'player', { q: 0, r: 0 });
    const pirate = unit('pirate-warrior', 'warrior', 'pirate-7', { q: 1, r: 0 });
    const state = stateWithUnits({ 'player-warrior': player, 'pirate-warrior': pirate }, { '0,0': 'visible', '1,0': 'visible' });
    state.civilizations.player.diplomacy.atWarWith = [];

    expect(canUnitAttackTarget(state, player, { q: 1, r: 0 }, { viewerId: 'player' })).toMatchObject({
      ok: true,
      targetUnitId: 'pirate-warrior',
    });
    expect(canUnitAttackTarget(state, pirate, { q: 0, r: 0 }, { requireVisibility: false })).toMatchObject({
      ok: true,
      targetUnitId: 'player-warrior',
    });
  });

  it('does not make distinct pirate factions hostile to each other', () => {
    const attacker = unit('pirate-7-warrior', 'warrior', 'pirate-7', { q: 0, r: 0 });
    const defender = unit('pirate-8-warrior', 'warrior', 'pirate-8', { q: 1, r: 0 });
    const state = stateWithUnits({ 'pirate-7-warrior': attacker, 'pirate-8-warrior': defender }, { '1,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 1, r: 0 }, { requireVisibility: false })).toEqual({
      ok: false,
      reason: 'not-hostile',
    });
  });

  it('rejects pirate attacks against cities because pirates never capture them', () => {
    const attacker = unit('pirate-warrior', 'warrior', 'pirate-7', { q: 0, r: 0 });
    const state = stateWithUnits({ 'pirate-warrior': attacker }, { '1,0': 'visible' });
    state.cities.playerCity = {
      id: 'playerCity',
      name: 'Player City',
      owner: 'player',
      position: { q: 1, r: 0 },
      population: 4,
      buildings: [],
      productionQueue: [],
      productionProgress: 0,
      food: 0,
      foodNeeded: 10,
      ownedTiles: [{ q: 1, r: 0 }],
      workedTiles: [],
      focus: 'balanced',
      maturity: 'outpost',
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    };

    expect(canUnitAttackTarget(state, attacker, { q: 1, r: 0 }, { requireVisibility: false })).toEqual({
      ok: false,
      reason: 'unsupported-target',
    });
  });

  it('requires bilateral war before either humans or AI can target a minor-civ unit', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 0 });
    const minor = unit('minor-warrior', 'warrior', 'mc-sparta', { q: 1, r: 0 });
    const aiAttacker = unit('ai-attacker', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, 'minor-warrior': minor, 'ai-attacker': aiAttacker }, { '1,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 1, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'not-hostile',
    });
    state.civilizations.player.diplomacy.atWarWith.push('mc-sparta');
    expect(canUnitAttackTarget(state, attacker, { q: 1, r: 0 }, { viewerId: 'player' })).toMatchObject({
      ok: true,
      targetType: 'unit',
      targetUnitId: 'minor-warrior',
    });
    expect(canUnitAttackTarget(state, aiAttacker, { q: 1, r: 0 }, { requireVisibility: false })).toEqual({
      ok: false,
      reason: 'not-hostile',
    });
  });

  it('rejects ordinary archer attacks against cities from range', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const state = stateWithUnits({ attacker }, { '2,0': 'visible' });
    state.cities.enemyCity = {
      id: 'enemyCity',
      name: 'Enemy City',
      owner: 'ai-1',
      position: { q: 2, r: 0 },
      population: 4,
      buildings: [],
      productionQueue: [],
      productionProgress: 0,
      food: 0,
      foodNeeded: 10,
      ownedTiles: [{ q: 2, r: 0 }],
      workedTiles: [],
      focus: 'balanced',
      maturity: 'outpost',
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    };

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'unsupported-target',
    });
  });

  it('uses wrapped distance for melee adjacency at the horizontal edge', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 1 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 9, r: 1 });
    const state = stateWithUnits({ attacker, defender }, { '9,1': 'visible' });
    state.map.wrapsHorizontally = true;
    state.map.width = 10;

    expect(canUnitAttackTarget(state, attacker, { q: 9, r: 1 }, { viewerId: 'player' })).toMatchObject({
      ok: true,
      targetUnitId: 'defender',
      range: 1,
    });
  });

  it('collects only legal attack target coordinates', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const visibleDefender = unit('visible-defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const foggedDefender = unit('fogged-defender', 'warrior', 'ai-1', { q: 1, r: 1 });
    const state = stateWithUnits(
      { attacker, 'visible-defender': visibleDefender, 'fogged-defender': foggedDefender },
      { '2,0': 'visible', '1,1': 'fog' },
    );

    expect(getAttackTargets(state, attacker, { viewerId: 'player' }).map(target => hexKey(target.coord))).toEqual(['2,0']);
  });

  it('returns empty array when attacker.hasActed is true even if targets are in range', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 1, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '1,0': 'visible' });
    state.units['attacker'] = { ...attacker, hasActed: true };

    expect(getAttackTargets(state, state.units['attacker'], { viewerId: 'player' })).toEqual([]);
  });

  it('returns targets normally when attacker.hasActed is false (no regression)', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 1, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '1,0': 'visible' });
    state.units['attacker'] = { ...attacker, hasActed: false };

    expect(getAttackTargets(state, state.units['attacker'], { viewerId: 'player' })).toHaveLength(1);
  });

  it('rejects zero-movement units through both legality and target enumeration', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });
    state.units['attacker'] = { ...attacker, movementPointsLeft: 0, hasActed: false };

    expect(canUnitAttackTarget(state, state.units['attacker'], { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'no-action-points',
    });
    expect(getAttackTargets(state, state.units['attacker'], { viewerId: 'player' })).toEqual([]);
  });

  it('applies the zero-movement rule to the active second hot-seat player and AI callers', () => {
    const attacker = unit('attacker', 'archer', 'ai-1', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'player', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender });
    state.currentPlayer = 'ai-1';
    state.hotSeat = {
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Player One', slotId: 'player', civType: 'rome', isHuman: true },
        { name: 'Player Two', slotId: 'ai-1', civType: 'egypt', isHuman: true },
      ],
    };
    state.civilizations['ai-1'].visibility.tiles = { '2,0': 'visible' };
    state.units.attacker = { ...attacker, movementPointsLeft: 0, hasActed: false };

    expect(canUnitAttackTarget(state, state.units.attacker, defender.position, { viewerId: 'ai-1' })).toEqual({
      ok: false,
      reason: 'no-action-points',
    });
    expect(getAttackTargets(state, state.units.attacker, { viewerId: 'ai-1' })).toEqual([]);
  });

  it('rejects ranged attacks against a basilisk concealed in jungle (no adjacent viewer)', () => {
    const archer = unit('archer', 'archer', 'player', { q: 0, r: 0 });
    const basilisk = unit('basilisk', 'beast_basilisk', 'beasts', { q: 2, r: 0 });
    const state = stateWithUnits({ archer, basilisk }, { '2,0': 'visible' });
    const tile = state.map.tiles['2,0'];
    if (tile) state.map.tiles['2,0'] = { ...tile, terrain: 'jungle' };

    expect(canUnitAttackTarget(state, archer, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false, reason: 'not-visible',
    });
  });

  it('allows ranged attacks against a basilisk in jungle when an adjacent viewer unit reveals it', () => {
    const archer = unit('archer', 'archer', 'player', { q: 0, r: 0 });
    const scout = unit('scout', 'scout', 'player', { q: 1, r: 0 });
    const basilisk = unit('basilisk', 'beast_basilisk', 'beasts', { q: 2, r: 0 });
    const state = stateWithUnits({ archer, scout, basilisk }, { '2,0': 'visible' });
    const tile = state.map.tiles['2,0'];
    if (tile) state.map.tiles['2,0'] = { ...tile, terrain: 'jungle' };

    expect(canUnitAttackTarget(state, archer, { q: 2, r: 0 }, { viewerId: 'player' })).toMatchObject({
      ok: true, targetUnitId: 'basilisk',
    });
  });

  it('allows a concealed basilisk to attack player units (ambush preserved)', () => {
    const basilisk = unit('basilisk', 'beast_basilisk', 'beasts', { q: 1, r: 0 });
    const warrior = unit('warrior', 'warrior', 'player', { q: 0, r: 0 });
    const state = stateWithUnits({ basilisk, warrior }, { '0,0': 'visible' });

    expect(canUnitAttackTarget(state, basilisk, { q: 0, r: 0 }, {})).toMatchObject({
      ok: true, targetUnitId: 'warrior',
    });
  });
});
