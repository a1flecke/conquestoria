import { describe, expect, it } from 'vitest';
import { buildCouncilAgenda, getCouncilInterrupt } from '@/systems/council-system';
import { formatCityReference } from '@/systems/player-facing-labels';
import { foundCity } from '@/systems/city-system';
import { makeCouncilFixture } from '../ui/helpers/council-fixture';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

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
    expect(getCouncilInterrupt(state, 'player', 'chaos')?.sourceCardId).toBe('constraint-food');
  });

  it('does not recommend legendary wonders that are not yet eligible in the city', () => {
    const { state } = makeCouncilFixture();
    let cityId = state.civilizations.player.cities[0];
    if (!cityId) {
      const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
      if (settler) {
        const city = foundCity('player', settler.position, state.map, mkC());
        state.cities[city.id] = city;
        state.civilizations.player.cities.push(city.id);
        cityId = city.id;
      }
    }
    const city = cityId ? state.cities[cityId] : undefined;
    state.civilizations.player.techState.completed = ['gathering', 'philosophy', 'sacred-sites'];
    if (city) {
      for (const coord of city.ownedTiles) {
        const key = `${coord.q},${coord.r}`;
        if (state.map.tiles[key]) {
          state.map.tiles[key].resource = 'stone';
          state.map.tiles[key].improvement = 'quarry';
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
        const city = foundCity('player', settler.position, state.map, mkC());
        state.cities[city.id] = city;
        state.civilizations.player.cities.push(city.id);
        cityId = city.id;
      }
    }
    const city = cityId ? state.cities[cityId] : undefined;
    state.civilizations.player.techState.completed = ['gathering', 'philosophy', 'sacred-sites'];
    if (city) {
      for (const coord of city.ownedTiles) {
        const key = `${coord.q},${coord.r}`;
        if (state.map.tiles[key]) {
          state.map.tiles[key].resource = 'stone';
          state.map.tiles[key].improvement = 'quarry';
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
        const founded = foundCity('player', settler.position, state.map, mkC());
        state.cities[founded.id] = founded;
        state.civilizations.player.cities.push(founded.id);
        baseCityId = founded.id;
      }
    }
    const baseCity = baseCityId ? state.cities[baseCityId] : undefined;
    if (!baseCity) {
      throw new Error('expected a player city for council wonder dedupe');
    }
    state.civilizations.player.techState.completed = ['gathering', 'philosophy', 'sacred-sites', 'city-planning', 'printing'];
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
      improvement: 'quarry',
      hasRiver: true,
    };
    state.civilizations.player.cities.push('city-b');

    const agenda = buildCouncilAgenda(state, 'player');
    const wonderCards = agenda.toWin.filter(card => card.cardType === 'wonder');
    const oracleCards = wonderCards.filter(card => card.title.includes('Oracle of Delphi'));

    expect(oracleCards).toHaveLength(1);
  });

  it('#992 surfaces a world-race card once the race is unlocked, and updates it as the player progresses', () => {
    const { state } = makeCouncilFixture();
    state.civilizations.player.techState.completed = ['space-exploration'];

    const notUnlocked = buildCouncilAgenda(state, 'player').toWin
      .find(card => card.id === 'worldrace-first-satellite');
    expect(notUnlocked?.summary).toContain('groundwork');
    // #1237: informational -- no victory-progress destination covers world races, so no inert button.
    expect(notUnlocked?.actionLabel).toBeUndefined();
    expect(notUnlocked?.action).toBeUndefined();

    let cityId = state.civilizations.player.cities[0];
    if (!cityId) {
      const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
      const city = foundCity('player', settler!.position, state.map, mkC());
      state.cities[city.id] = city;
      state.civilizations.player.cities.push(city.id);
      cityId = city.id;
    }
    state.builtNationalProjects = { 'player:space_program_initiative': { civId: 'player', cityId, eraBuilt: 11 } };
    const readyToLaunch = buildCouncilAgenda(state, 'player').toWin
      .find(card => card.id === 'worldrace-first-satellite');
    expect(readyToLaunch?.summary).toContain('Queue the launch');
    expect(readyToLaunch?.actionLabel).toBeUndefined();

    state.cities[cityId]!.productionQueue = ['first_satellite_launch'];
    state.cities[cityId]!.productionProgress = 100;
    const launching = buildCouncilAgenda(state, 'player').toWin
      .find(card => card.id === 'worldrace-first-satellite');
    expect(launching?.actionLabel).toBeUndefined();
    expect(launching?.summary).toContain('%');
  });

  it('#992 omits the world-race card once the race has already resolved', () => {
    const { state } = makeCouncilFixture();
    state.civilizations.player.techState.completed = ['space-exploration'];
    state.worldRaces = { 'first-satellite': { kind: 'first-satellite', winnerCivId: 'ai-1', completedTurn: 5 } };

    const card = buildCouncilAgenda(state, 'player').toWin.find(card => card.id === 'worldrace-first-satellite');
    expect(card).toBeUndefined();
  });

  it('#986 also surfaces the Interstellar Colony (Science Victory) card via the same generic race machinery', () => {
    const { state } = makeCouncilFixture();
    state.civilizations.player.techState.completed = ['mars-mission-architecture'];

    const card = buildCouncilAgenda(state, 'player').toWin
      .find(card => card.id === 'worldrace-interstellar-colony');
    expect(card?.title).toContain('Interstellar Colony');
    expect(card?.actionLabel).toBeUndefined();
  });
});
