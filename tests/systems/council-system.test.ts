import { describe, expect, it } from 'vitest';
import { buildCouncilAgenda, getCouncilInterrupt } from '@/systems/council-system';
import { formatCityReference } from '@/systems/player-facing-labels';
import { foundCity } from '@/systems/city-system';
import { makeCouncilFixture } from '../ui/helpers/council-fixture';

describe('council system', () => {
  it('returns actionable do-now, soon, and to-win cards without leaking hidden facts', () => {
    const { state } = makeCouncilFixture({ metForeignCiv: true, discoveredForeignCity: false });
    const agenda = buildCouncilAgenda(state, 'player');

    expect(agenda.doNow[0].why.length).toBeGreaterThan(0);
    expect(JSON.stringify(agenda)).not.toContain('Rome');
    expect(JSON.stringify(agenda)).not.toContain('Atlantis');
  });

  it('disambiguates duplicate city names in council copy', () => {
    const label = formatCityReference('Rome', { ownerName: 'Narnia', duplicateCount: 2 });
    expect(label).toContain('Rome');
    expect(label).toContain('Narnia');
  });

  it('suppresses low-priority interruptions on quiet but emits them on chaos', () => {
    const { state } = makeCouncilFixture({ lowPriorityFoodWarning: true });

    expect(getCouncilInterrupt(state, 'player', 'quiet')).toBeNull();
    expect(getCouncilInterrupt(state, 'player', 'chaos')?.sourceCardId).toBe('food-warning');
  });

  it('does not recommend legendary wonders that are not yet eligible in the city', () => {
    const { state } = makeCouncilFixture();
    let cityId = state.civilizations.player.cities[0];
    if (!cityId) {
      const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
      if (settler) {
        const city = foundCity('player', settler.position, state.map);
        state.cities[city.id] = city;
        state.civilizations.player.cities.push(city.id);
        cityId = city.id;
      }
    }
    const city = cityId ? state.cities[cityId] : undefined;
    state.civilizations.player.techState.completed = ['philosophy', 'pilgrimages'];
    if (city) {
      for (const coord of city.ownedTiles) {
        const key = `${coord.q},${coord.r}`;
        if (state.map.tiles[key]) {
          state.map.tiles[key].resource = 'stone';
        }
      }
    }

    const agenda = buildCouncilAgenda(state, 'player');
    const wonderCards = agenda.toWin.filter(card => card.cardType === 'wonder');

    expect(wonderCards.some(card => card.title.includes('World Archive'))).toBe(false);
  });

  it('prefers reachable legendary wonders over seeded but impossible ones', () => {
    const { state } = makeCouncilFixture();
    let cityId = state.civilizations.player.cities[0];
    if (!cityId) {
      const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
      if (settler) {
        const city = foundCity('player', settler.position, state.map);
        state.cities[city.id] = city;
        state.civilizations.player.cities.push(city.id);
        cityId = city.id;
      }
    }
    const city = cityId ? state.cities[cityId] : undefined;
    state.civilizations.player.techState.completed = ['philosophy', 'pilgrimages'];
    if (city) {
      for (const coord of city.ownedTiles) {
        const key = `${coord.q},${coord.r}`;
        if (state.map.tiles[key]) {
          state.map.tiles[key].resource = 'stone';
        }
      }
    }

    const agenda = buildCouncilAgenda(state, 'player');
    const wonderCards = agenda.toWin.filter(card => card.cardType === 'wonder');

    expect(wonderCards.some(card => card.title.includes('Oracle of Delphi'))).toBe(true);
  });

  it('deduplicates council wonder cards by wonder before taking the top recommendations', () => {
    const { state } = makeCouncilFixture();
    let baseCityId = state.civilizations.player.cities[0];
    if (!baseCityId) {
      const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
      if (settler) {
        const founded = foundCity('player', settler.position, state.map);
        state.cities[founded.id] = founded;
        state.civilizations.player.cities.push(founded.id);
        baseCityId = founded.id;
      }
    }
    const baseCity = baseCityId ? state.cities[baseCityId] : undefined;
    if (!baseCity) {
      throw new Error('expected a player city for council wonder dedupe');
    }
    state.civilizations.player.techState.completed = ['philosophy', 'pilgrimages', 'city-planning', 'printing'];
    state.cities['city-b'] = {
      ...baseCity,
      id: 'city-b',
      name: 'Second Rome',
      position: { q: 6, r: 6 },
      ownedTiles: [{ q: 6, r: 6 }, { q: 6, r: 7 }],
      productionQueue: [],
      productionProgress: 0,
    };
    state.map.tiles['6,6'] = {
      ...state.map.tiles['2,2'],
      coord: { q: 6, r: 6 },
      owner: 'player',
      hasRiver: true,
    };
    state.map.tiles['6,7'] = {
      ...state.map.tiles['2,3'],
      coord: { q: 6, r: 7 },
      owner: 'player',
      resource: 'stone',
      hasRiver: true,
    };
    state.civilizations.player.cities.push('city-b');

    const agenda = buildCouncilAgenda(state, 'player');
    const wonderCards = agenda.toWin.filter(card => card.cardType === 'wonder');
    const oracleCards = wonderCards.filter(card => card.title.includes('Oracle of Delphi'));

    expect(oracleCards).toHaveLength(1);
  });
});
