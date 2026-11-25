import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createBreakawayFromCity, tryReabsorbBreakaway } from '@/systems/breakaway-system';
import { foundCity } from '@/systems/city-lifecycle';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';
import { hexDistance, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { getNationalProjectCivYieldBonus } from '@/systems/national-project-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';
import { buildBaselineSave } from '../storage/fixtures/save-compat/baseline';

/**
 * A breakaway hands the seceding city's territory, and every unit of the old owner standing in it,
 * to a new civilization by rewriting `unit.owner`. Records keyed to the unit's owner must follow.
 */
function breakawayWithOwnedRecords(seed: string) {
  const baseline = buildBaselineSave(seed);
  const state = baseline.state;
  const cityId = baseline.aiCityId;
  const city = state.cities[cityId];
  // ai-1 keeps another city so the secession does not eliminate it.
  const elsewhere = Object.values(state.map.tiles).find(tile => tile.terrain === 'grassland'
    && Object.values(state.cities).every(other => hexDistance(other.position, tile.coord) >= 6))!;
  const second = foundCity('ai-1', elsewhere.coord, state.map, state.idCounters);
  state.cities[second.id] = second;
  state.civilizations['ai-1'].cities.push(second.id);
  // An ai-1 spy unit (with its espionage record) stands in the seceding city.
  const spy = createUnit('spy_agent', 'ai-1', city.position, state.idCounters);
  state.units[spy.id] = spy;
  state.civilizations['ai-1'].units.push(spy.id);
  const created = createSpyFromUnit(state.espionage?.['ai-1'] ?? createEspionageCivState(), spy.id, 'ai-1', 'spy_agent', 'breakaway-spy');
  state.espionage = { ...state.espionage, 'ai-1': created.state };
  return { state, cityId, spyId: spy.id };
}

describe('breakaway secession carries owner-keyed unit records with its units', () => {
  it('keeps every invariant when the seceding city holds the old owner\'s spy', () => {
    const { state, cityId } = breakawayWithOwnedRecords('breakaway-spy-record');
    assertSaveStateInvariants(state, 'before the secession');

    const after = createBreakawayFromCity(state, cityId, new EventBus());

    expect(after.cities[cityId].owner).toBe(`breakaway-${cityId}`);
    assertSaveStateInvariants(after, 'after the secession');
  });

  it('a spy stays loyal to its owner and steps out of the seceding city', () => {
    const { state, cityId, spyId } = breakawayWithOwnedRecords('breakaway-loyal-spy');
    const cityPosition = state.cities[cityId].position;

    const after = createBreakawayFromCity(state, cityId, new EventBus());

    const spy = after.units[spyId];
    expect(spy?.owner).toBe('ai-1');
    expect(after.civilizations['ai-1'].units).toContain(spyId);
    expect(after.civilizations[`breakaway-${cityId}`].units).not.toContain(spyId);
    expect(after.espionage?.['ai-1']?.spies[spyId]).toBeDefined();
    expect(hexDistance(spy!.position, cityPosition)).toBe(1);
  });

  // #1698 sweep: the units around a loyal spy change owner in place, so the spy must not be left sharing a tile
  // with them (a stack of two owners) or standing in the city once no neighbour is free.
  it('a loyal spy in the territory never ends up stacked with a unit that seceded', () => {
    const { state, cityId, spyId } = breakawayWithOwnedRecords('breakaway-spy-stack');
    const city = state.cities[cityId];
    const territoryTile = city.ownedTiles.find(coord => hexKey(coord) !== hexKey(city.position)
      && state.map.tiles[hexKey(coord)]?.terrain !== 'ocean' && state.map.tiles[hexKey(coord)]?.terrain !== 'coast'
      && state.map.tiles[hexKey(coord)]?.terrain !== 'mountain')!;
    expect(territoryTile, 'the city owns a land tile besides its centre').toBeDefined();
    state.units[spyId] = { ...state.units[spyId], position: { ...territoryTile } };
    const warrior = createUnit('warrior', 'ai-1', territoryTile, state.idCounters);
    state.units[warrior.id] = warrior;
    state.civilizations['ai-1'].units.push(warrior.id);
    assertSaveStateInvariants(state, 'before the secession');

    const after = createBreakawayFromCity(state, cityId, new EventBus());

    expect(after.units[warrior.id].owner).toBe(`breakaway-${cityId}`);
    expect(after.units[spyId].owner).toBe('ai-1');
    assertSaveStateInvariants(after, 'after the secession');
  });

  it('a loyal spy on the city tile with every neighbour taken still leaves the city', () => {
    const { state, cityId, spyId } = breakawayWithOwnedRecords('breakaway-spy-boxed-in');
    const city = state.cities[cityId];
    for (const coord of hexNeighbors(city.position)) {
      const tile = state.map.tiles[hexKey(coord)];
      if (!tile || tile.terrain === 'ocean' || tile.terrain === 'coast' || tile.terrain === 'mountain') continue;
      if (!city.ownedTiles.some(owned => hexKey(owned) === hexKey(coord))) continue;
      const guard = createUnit('warrior', 'ai-1', coord, state.idCounters);
      state.units[guard.id] = guard;
      state.civilizations['ai-1'].units.push(guard.id);
    }
    assertSaveStateInvariants(state, 'before the secession');

    const after = createBreakawayFromCity(state, cityId, new EventBus());

    assertSaveStateInvariants(after, 'after the secession');
    expect(hexKey(after.units[spyId]?.position ?? city.position)).not.toBe(hexKey(city.position));
  });

  it('an ally\'s unit inside a rejoining city steps out instead of being left in a foreign city', () => {
    const { state, cityId } = breakawayWithOwnedRecords('reabsorb-ally-inside');
    const seceded = createBreakawayFromCity(state, cityId, new EventBus());
    const breakawayId = `breakaway-${cityId}`;
    const third = Object.keys(seceded.civilizations).find(id =>
      id !== 'ai-1' && id !== breakawayId && !seceded.civilizations[id].isEliminated)!;
    // The third civ is allied with the breakaway, so its unit may stand in the breakaway's city.
    const alliance = { type: 'alliance', civA: breakawayId, civB: third, turnsRemaining: -1 } as never;
    seceded.civilizations[breakawayId].diplomacy.treaties = [...seceded.civilizations[breakawayId].diplomacy.treaties, alliance];
    seceded.civilizations[third].diplomacy.treaties = [...seceded.civilizations[third].diplomacy.treaties, alliance];
    // The city holds only the ally's unit (the seceded garrison stepped away), as a real reinforcement would.
    const cityKey = hexKey(seceded.cities[cityId].position);
    const friend = createUnit('warrior', third, seceded.cities[cityId].position, seceded.idCounters);
    for (const unit of Object.values(seceded.units)) {
      if (unit.owner === breakawayId && hexKey(unit.position) === cityKey) {
        const away = hexNeighbors(unit.position).find(coord => seceded.map.tiles[hexKey(coord)]?.terrain === 'grassland'
          || seceded.map.tiles[hexKey(coord)]?.terrain === 'plains')!;
        seceded.units[unit.id] = { ...unit, position: away };
      }
    }
    seceded.units[friend.id] = friend;
    seceded.civilizations[third].units.push(friend.id);
    seceded.civilizations['ai-1'].diplomacy.relationships[breakawayId] = 80;
    seceded.civilizations['ai-1'].gold = 1000;
    seceded.civilizations[breakawayId].breakaway!.reunification = 60;

    const reabsorbed = tryReabsorbBreakaway(seceded, 'ai-1', breakawayId, new EventBus());

    expect(reabsorbed.cities[cityId].owner).toBe('ai-1');
    expect(hexKey(reabsorbed.units[friend.id].position)).not.toBe(cityKey);
    assertSaveStateInvariants(reabsorbed, 'after the reabsorption');
  });

  it('the new civilization meets every living civ and no eliminated one', () => {
    const { state, cityId } = breakawayWithOwnedRecords('breakaway-diplomacy');
    const eliminated = Object.keys(state.civilizations).filter(id => state.civilizations[id].isEliminated);
    expect(eliminated.length).toBeGreaterThan(0);

    const after = createBreakawayFromCity(state, cityId, new EventBus());
    const breakawayId = `breakaway-${cityId}`;

    for (const id of eliminated) expect(after.civilizations[breakawayId].diplomacy.relationships[id]).toBeUndefined();
    for (const [id, civ] of Object.entries(after.civilizations)) {
      if (id === breakawayId || civ.isEliminated) continue;
      expect(civ.diplomacy.relationships[breakawayId], id).toBeDefined();
      expect(after.civilizations[breakawayId].diplomacy.relationships[id], id).toBeDefined();
    }
  });

  it('reabsorbing a breakaway leaves no war or treaty naming the vanished civilization', () => {
    const { state, cityId } = breakawayWithOwnedRecords('reabsorb-scrubs-diplomacy');
    const seceded = createBreakawayFromCity(state, cityId, new EventBus());
    const breakawayId = `breakaway-${cityId}`;
    // A third civilization went to war with the breakaway, and the breakaway signed a treaty.
    const third = Object.keys(seceded.civilizations).find(id =>
      id !== 'ai-1' && id !== breakawayId && !seceded.civilizations[id].isEliminated)!;
    seceded.civilizations[third].diplomacy.atWarWith = [...seceded.civilizations[third].diplomacy.atWarWith, breakawayId];
    seceded.civilizations[breakawayId].diplomacy.atWarWith = [third];
    const otherThird = Object.keys(seceded.civilizations).find(id =>
      id !== 'ai-1' && id !== breakawayId && id !== third && !seceded.civilizations[id].isEliminated);
    if (otherThird) {
      const pact = { type: 'non_aggression_pact', civA: breakawayId, civB: otherThird, turnsRemaining: 10 } as never;
      seceded.civilizations[breakawayId].diplomacy.treaties = [pact];
      seceded.civilizations[otherThird].diplomacy.treaties = [...seceded.civilizations[otherThird].diplomacy.treaties, pact];
    }
    seceded.civilizations['ai-1'].diplomacy.relationships[breakawayId] = 80;
    seceded.civilizations['ai-1'].gold = 1000;
    seceded.civilizations[breakawayId].breakaway!.reunification = 60;
    assertSaveStateInvariants(seceded, 'after the secession');

    const reabsorbed = tryReabsorbBreakaway(seceded, 'ai-1', breakawayId, new EventBus());

    expect(reabsorbed.civilizations[breakawayId]).toBeUndefined();
    for (const [id, civ] of Object.entries(reabsorbed.civilizations)) {
      expect(civ.diplomacy.atWarWith, id).not.toContain(breakawayId);
      expect(civ.diplomacy.treaties.some(t => t.civA === breakawayId || t.civB === breakawayId), id).toBe(false);
    }
    assertSaveStateInvariants(reabsorbed, 'after the reabsorption');
  });

  it('a seceding garrison drops its former civ\'s movement bonus, and gets it back when reabsorbed', () => {
    const { state, cityId } = breakawayWithOwnedRecords('breakaway-movement-bonus');
    state.civilizations['ai-1'].civType = 'mongolia';
    const horseman = { ...createUnit('horseman', 'ai-1', state.cities[cityId].position, state.idCounters), movementBonus: 1 };
    state.units[horseman.id] = horseman;
    state.civilizations['ai-1'].units.push(horseman.id);

    const seceded = createBreakawayFromCity(state, cityId, new EventBus());
    const breakawayId = `breakaway-${cityId}`;
    expect(seceded.units[horseman.id]).toMatchObject({ owner: breakawayId });
    // The breakaway is a generic civilization: Mongolia's Horse Lords bonus is not its own.
    expect(seceded.units[horseman.id].movementBonus ?? 0).toBe(0);

    seceded.civilizations['ai-1'].diplomacy.relationships[breakawayId] = 80;
    seceded.civilizations['ai-1'].gold = 1000;
    seceded.civilizations[breakawayId].breakaway!.reunification = 60;
    const reabsorbed = tryReabsorbBreakaway(seceded, 'ai-1', breakawayId, new EventBus());
    expect(reabsorbed.units[horseman.id]).toMatchObject({ owner: 'ai-1', movementBonus: 1 });
  });

  it('a seceding city takes its national project with it, as a captured one does', () => {
    const { state, cityId } = breakawayWithOwnedRecords('breakaway-national-project');
    state.cities[cityId] = { ...state.cities[cityId], buildings: [...state.cities[cityId].buildings, 'communal_stores'] };
    state.builtNationalProjects = { 'ai-1:communal_stores': { civId: 'ai-1', cityId, eraBuilt: 1 } };
    expect(getNationalProjectCivYieldBonus(state, 'ai-1').food).toBe(2);

    const seceded = createBreakawayFromCity(state, cityId, new EventBus());

    // The former owner no longer draws the empire-wide bonus from a city it lost, and may rebuild it.
    expect(seceded.builtNationalProjects?.['ai-1:communal_stores']).toBeUndefined();
    expect(getNationalProjectCivYieldBonus(seceded, 'ai-1').food ?? 0).toBe(0);
    expect(seceded.cities[cityId].buildings).not.toContain('communal_stores');
    assertSaveStateInvariants(seceded, 'after the secession');
  });
});
