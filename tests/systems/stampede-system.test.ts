import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { advanceStampedePressure, getStampedeProfile, normalizeStampedes, resolveStampedeOutcome, processStampedeTurn, startStampedeWarning } from '@/systems/stampede-system';

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
  });

  it('activates a warning without moving its herds on the first Stampede turn', () => {
    const state = createNewGame('rome', 'stampede-activation', 'small');
    const city = foundCity('player', { q: 0, r: 0 }, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';
    const warning = startStampedeWarning(state, 'player', 'explorer');
    const positions = Object.values(warning.units).filter(unit => unit.owner === 'crisis-force').map(unit => unit.position);

    const active = processStampedeTurn(warning, 'player');

    expect(active.stampedes?.player).toMatchObject({ phase: 'active', activeTurns: 0 });
    expect(Object.values(active.units).filter(unit => unit.owner === 'crisis-force').map(unit => unit.position)).toEqual(positions);
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

    expect(next.stampedes?.player).toMatchObject({ phase: 'resolved', outcome: 'survived', activeTurns: 6 });
    expect(Object.values(next.units).filter(unit => unit.owner === 'crisis-force')).toEqual([]);
    expect(before).not.toEqual([]);
  });

  it('rewards a defeated Stampede once with gold and Herding Insight', () => {
    const state = createNewGame('rome', 'stampede-reward', 'small');
    state.era = 4;
    state.stampedes = { player: { targetCivId: 'player', eligibleTurns: 0, activeTurns: 1, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [] } };
    const next = resolveStampedeOutcome(state, 'player', 'defeated');

    expect(next.civilizations.player.gold).toBe(state.civilizations.player.gold + 40);
    expect(next.stampedes?.player).toMatchObject({ phase: 'resolved', outcome: 'defeated', rewardGranted: true, herdingInsight: { expiresTurn: state.turn + 10 } });
    expect(resolveStampedeOutcome(next, 'player', 'defeated').civilizations.player.gold).toBe(next.civilizations.player.gold);
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
});
