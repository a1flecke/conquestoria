import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { mapNeighbors } from '@/systems/hex-utils';
import { applyStampedePillage, advanceStampedePressure, consumeHerdingInsight, getStampedeProfile, hasActiveHerdingInsight, normalizeStampedes, processHerdingInsight, processStampedeScheduling, resolveStampedeOutcome, processStampedeTurn, startStampedeWarning } from '@/systems/stampede-system';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';

describe('Stampede state', () => {
  it('defines recurring pressure profiles for every player challenge', () => {
    expect(getStampedeProfile('explorer')).toEqual({
      cooldownTurns: 12, initialChancePercent: 3, growthPercent: 1, capPercent: 12, herdCount: 2,
    });
    expect(getStampedeProfile('standard')).toEqual({
      cooldownTurns: 8, initialChancePercent: 4, growthPercent: 2, capPercent: 18, herdCount: 3,
    });
    expect(getStampedeProfile('veteran')).toEqual({
      cooldownTurns: 5, initialChancePercent: 5, growthPercent: 3, capPercent: 25, herdCount: 4,
    });
  });

  it('drops malformed Stampede records without mutating valid game state', () => {
    const state = createNewGame('rome', 'stampede-normalization', 'small');
    const malformed = { ...state, stampedes: { player: { targetCivId: 'missing' } } };

    expect(normalizeStampedes(malformed as never).stampedes).toEqual({});
    expect(state.stampedes).toEqual({});
  });

  it('spawns the severity-sized herd force in a one-turn warning phase', () => {
    const state = createNewGame('rome', 'stampede-warning', 'small');
    const city = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';

    const next = startStampedeWarning(state, 'player', 'standard');

    expect(next.stampedes?.player).toMatchObject({ phase: 'warning', activeTurns: 0 });
    expect(Object.values(next.crisisForces ?? {})).toHaveLength(1);
    expect(Object.values(next.crisisForces ?? {})[0]?.unitIds).toHaveLength(3);
    expect(Object.values(next.units).find(unit => unit.owner === 'crisis-force')?.combatStrengthOverride).toBe(28);
  });

  it('uses a later eligible target city when the first city has no legal herd spawns', () => {
    const state = createNewGame('rome', 'stampede-later-city', 'small');
    const first = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    const second = foundCity('player', { q: 5, r: 0 }, state.map, state.idCounters);
    state.cities[first.id] = first;
    state.cities[second.id] = second;
    state.civilizations.player.cities = [first.id, second.id];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';
    for (const position of mapNeighbors(state.map, first.position)) {
      const unit = { ...Object.values(state.units)[0]!, id: `block-${position.q}-${position.r}`, owner: 'player', position };
      state.units[unit.id] = unit;
    }

    const next = startStampedeWarning(state, 'player', 'explorer');
    expect(next.stampedes?.player?.phase).toBe('warning');
    expect(Object.values(next.units).filter(unit => unit.owner === 'crisis-force').every(unit => unit.position.q >= 4)).toBe(true);
  });

  it('does not use another city center as a herd spawn tile', () => {
    const state = createNewGame('rome', 'stampede-no-city-spawn', 'small');
    const first = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    const second = foundCity('player', { q: 1, r: 0 }, state.map, state.idCounters);
    state.cities[first.id] = first;
    state.cities[second.id] = second;
    state.civilizations.player.cities = [first.id, second.id];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'ocean';
    for (const position of [first.position, second.position, { q: -1, r: 0 }]) {
      state.map.tiles[`${position.q},${position.r}`] = { ...state.map.tiles[`${position.q},${position.r}`]!, terrain: 'plains' };
    }

    expect(startStampedeWarning(state, 'player', 'explorer').stampedes?.player).toBeUndefined();
  });

  it('ends the one-target-turn warning by activating and running the first herd pass', () => {
    const state = createNewGame('rome', 'stampede-activation', 'small');
    const city = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';
    const warning = startStampedeWarning(state, 'player', 'explorer');
    const positions = Object.values(warning.units).filter(unit => unit.owner === 'crisis-force').map(unit => unit.position);

    const active = processStampedeTurn(warning, 'player');

    expect(active.stampedes?.player).toMatchObject({ phase: 'active', activeTurns: 1 });
    expect(Object.values(active.units).filter(unit => unit.owner === 'crisis-force').map(unit => unit.position)).not.toEqual(positions);
  });

  it('moves active herds for six passes then removes surviving actors', () => {
    const state = createNewGame('rome', 'stampede-expiry', 'small');
    const city = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';
    let next = processStampedeTurn(startStampedeWarning(state, 'player', 'explorer'), 'player');
    const before = Object.values(next.units).filter(unit => unit.owner === 'crisis-force').map(unit => ({ ...unit.position }));

    for (let pass = 0; pass < 6; pass += 1) next = processStampedeTurn(next, 'player');

    expect(next.stampedes?.player).toMatchObject({ phase: 'resolved', outcome: 'contained', activeTurns: 6 });
    expect(Object.values(next.units).filter(unit => unit.owner === 'crisis-force')).toEqual([]);
    expect(before).not.toEqual([]);
  });

  it('classifies a force whose herds were defeated before its next target turn', () => {
    const state = createNewGame('rome', 'stampede-defeated', 'small');
    const city = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';
    const warning = startStampedeWarning(state, 'player', 'explorer');
    const active = processStampedeTurn(warning, 'player');
    const defeated = { ...active, units: {} };

    expect(processStampedeTurn(defeated, 'player').stampedes?.player).toMatchObject({ phase: 'resolved', outcome: 'defeated', rewardGranted: true });
  });

  it('rewards a defeated Stampede once with gold and Herding Insight', () => {
    const state = createNewGame('rome', 'stampede-reward', 'small');
    state.era = 4; // Global era must not affect a target-civilization reward.
    state.stampedes = { player: { targetCivId: 'player', eligibleTurns: 0, activeTurns: 1, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [] } };
    const next = resolveStampedeOutcome(state, 'player', 'defeated');

    expect(next.civilizations.player.gold).toBe(state.civilizations.player.gold + 10);
    expect(next.stampedes?.player).toMatchObject({ phase: 'resolved', outcome: 'defeated', rewardGranted: true, herdingInsight: { expiresTurn: state.turn + 10 } });
    expect(resolveStampedeOutcome(next, 'player', 'defeated').civilizations.player.gold).toBe(next.civilizations.player.gold);
  });

  it('keeps a resolved survived outcome terminal when a lifecycle caller retries', () => {
    const state = createNewGame('rome', 'stampede-terminal-outcome', 'small');
    state.stampedes = {
      player: {
        targetCivId: 'player', eligibleTurns: 0, activeTurns: 6, cityDamage: 0, civilianDeaths: 0,
        pillagedTileKeys: ['0,0', '1,0', '2,0'], phase: 'resolved', outcome: 'survived', rewardGranted: false,
      },
    };

    expect(resolveStampedeOutcome(state, 'player', 'defeated')).toEqual(state);
  });

  it('pillages at most two landed improvements during one active herd pass without crisis loot', () => {
    const state = createNewGame('rome', 'stampede-pillage', 'small');
    state.stampedes = { player: { targetCivId: 'player', eligibleTurns: 0, activeTurns: 1, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [] } };
    const [first, second, third] = Object.values(state.map.tiles).filter(tile => tile.terrain !== 'ocean').slice(0, 3);
    for (const tile of [first, second, third]) state.map.tiles[`${tile.coord.q},${tile.coord.r}`] = { ...tile, owner: 'player', improvement: 'farm', improvementTurnsLeft: 0 };
    state.units.herd = { ...Object.values(state.units)[0]!, id: 'herd', owner: 'crisis-force', position: first.coord };
    const firstPillage = applyStampedePillage(state, 'player', 'herd');
    const secondPillage = applyStampedePillage({ ...firstPillage, units: { ...firstPillage.units, herd: { ...firstPillage.units.herd!, position: second.coord } } }, 'player', 'herd');
    const capped = applyStampedePillage({ ...secondPillage, units: { ...secondPillage.units, herd: { ...secondPillage.units.herd!, position: third.coord } } }, 'player', 'herd');

    expect(capped.stampedes?.player?.pillagedTileKeys).toHaveLength(2);
    expect(capped.map.tiles[`${third.coord.q},${third.coord.r}`]?.improvement).toBe('farm');
    expect(capped.civilizations.player.gold).toBe(state.civilizations.player.gold);
  });

  it('uses the target civilization era for its reward and exposes an unspent charge only before expiry', () => {
    const state = createNewGame('rome', 'stampede-target-era', 'small');
    state.era = 8;
    state.stampedes = { player: { targetCivId: 'player', eligibleTurns: 0, activeTurns: 1, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [] } };
    const rewarded = resolveStampedeOutcome(state, 'player', 'defeated');

    expect(rewarded.civilizations.player.gold).toBe(state.civilizations.player.gold + 10);
    expect(hasActiveHerdingInsight(rewarded, 'player')).toBe(true);
    expect(hasActiveHerdingInsight({ ...rewarded, turn: rewarded.turn + 10 }, 'player')).toBe(false);
  });

  it('consumes a valid charge only for its intended unit types', () => {
    const state = createNewGame('rome', 'stampede-consume-insight', 'small');
    const rewarded = resolveStampedeOutcome({
      ...state,
      stampedes: { player: { targetCivId: 'player', eligibleTurns: 0, activeTurns: 1, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [] } },
    }, 'player', 'defeated');

    expect(consumeHerdingInsight(rewarded, 'player', 'warrior')).toEqual(rewarded);
    expect(consumeHerdingInsight(rewarded, 'player', 'beast_handler').stampedes?.player.herdingInsight?.consumed).toBe(true);
  });

  it('limits pillage to two improvements per active Stampede pass without making that a whole-event cap', () => {
    const state = createNewGame('rome', 'stampede-pillage-pass-cap', 'small');
    const city = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';
    const warning = startStampedeWarning(state, 'player', 'explorer');
    const herd = Object.values(warning.units).find(unit => unit.owner === 'crisis-force')!;
    const tile = warning.map.tiles[`${herd.position.q},${herd.position.r}`]!;
    const active = {
      ...warning,
      map: { ...warning.map, tiles: { ...warning.map.tiles, [`${herd.position.q},${herd.position.r}`]: { ...tile, owner: 'player', improvement: 'farm' as const, improvementTurnsLeft: 0 } } },
      stampedes: { player: { ...warning.stampedes!.player!, phase: 'active' as const, pillagesThisTurn: 2 } },
    };

    expect(applyStampedePillage(active, 'player', herd.id).map.tiles[`${herd.position.q},${herd.position.r}`]?.improvement).toBe('farm');
  });

  it('never pillages a herd start tile when no legal landing was completed', () => {
    const state = createNewGame('rome', 'stampede-no-free-pillage', 'small');
    const city = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';
    const warning = startStampedeWarning(state, 'player', 'explorer');
    const herd = Object.values(warning.units).find(unit => unit.owner === 'crisis-force')!;
    for (const neighbor of mapNeighbors(warning.map, herd.position)) {
      warning.map.tiles[`${neighbor.q},${neighbor.r}`] = { ...warning.map.tiles[`${neighbor.q},${neighbor.r}`]!, terrain: 'ocean' };
    }
    warning.map.tiles[`${herd.position.q},${herd.position.r}`] = {
      ...warning.map.tiles[`${herd.position.q},${herd.position.r}`]!, owner: 'player', improvement: 'farm', improvementTurnsLeft: 0,
    };
    const active = { ...warning, stampedes: { player: { ...warning.stampedes!.player!, phase: 'active' as const } } };

    expect(processStampedeTurn(active, 'player').map.tiles[`${herd.position.q},${herd.position.r}`]?.improvement).toBe('farm');
  });

  it('converts an expired unreachable charge to gold exactly once', () => {
    const state = createNewGame('rome', 'stampede-expire-insight', 'small');
    const rewarded = resolveStampedeOutcome({
      ...state,
      stampedes: { player: { targetCivId: 'player', eligibleTurns: 0, activeTurns: 1, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [] } },
    }, 'player', 'defeated');
    const expired = { ...rewarded, turn: rewarded.turn + 10 };

    const converted = processHerdingInsight(expired, 'player');
    expect(converted.civilizations.player.gold).toBe(expired.civilizations.player.gold + 20);
    expect(processHerdingInsight(converted, 'player').civilizations.player.gold).toBe(converted.civilizations.player.gold);
  });
});

describe('Stampede recurrence', () => {
  it('accumulates eligible pressure but pauses it while the target has an active crisis', () => {
    const state = createNewGame('rome', 'stampede-pressure', 'small');
    const city = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    state.era = 3;

    const eligible = advanceStampedePressure(state, 'player');
    const blocked = advanceStampedePressure({
      ...eligible,
      activeCrises: {
        crisis: { id: 'crisis', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'player', cityIds: [city.id], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1 },
      },
    }, 'player');

    expect(eligible.stampedes?.player?.eligibleTurns).toBe(1);
    expect(blocked.stampedes?.player?.eligibleTurns).toBe(1);
  });

  it('does not advance hidden pressure when the target has no legal spawn opportunity', () => {
    const state = createNewGame('rome', 'stampede-no-spawn-pressure', 'small');
    const completed = [2, 3].flatMap(era => {
      const techs = getEraAdvancementTechs(era);
      return techs.slice(0, Math.ceil(techs.length * 0.6)).map(tech => tech.id);
    });
    state.civilizations.player.techState.completed = completed;

    expect(processStampedeScheduling(state).stampedes?.player).toBeUndefined();
  });
});
