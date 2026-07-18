import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { City, GameState, HexCoord, HexTile } from '@/core/types';
import {
  foundReligion, chooseBoon, preach, canPreachTarget, getCityConversionPoints,
  processReligionTurn,
} from '@/systems/religion-system';
import {
  CONVERSION_THRESHOLD, OCCUPATION_ACCRUAL, MISSIONARY_ACTION_COOLDOWN_TURNS,
} from '@/systems/religion-definitions';
import { createUnit } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';
import { makeReligionFixture } from './helpers/religion-fixture';

describe('#591 MR4 — foundReligion', () => {
  it('creates a religion, marks the building city as holy, and has the capital adopt it', () => {
    const { state, civId, capitalId, templeCity } = makeReligionFixture();
    const bus = new EventBus();
    const next = foundReligion(state, civId, templeCity, bus);
    const religionId = `religion-${civId}`;
    expect(next.religions![religionId]).toMatchObject({ ownerCivId: civId });
    expect(next.religions![religionId].boon).toBeUndefined();
    expect(next.cityFaith![templeCity]).toMatchObject({ religionId, isHolyCity: true });
    expect(next.cityFaith![capitalId]).toMatchObject({ religionId });
  });

  it('does not double-count the building city as both holy and capital when they are the same city', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const founded = foundReligion({ ...state, civilizations: { ...state.civilizations, [civId]: { ...state.civilizations[civId], cities: [templeCity] } } }, civId, templeCity, new EventBus());
    expect(founded.cityFaith![templeCity]).toMatchObject({ religionId: `religion-${civId}`, isHolyCity: true });
  });

  it('is a no-op if the civ already has a religion', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const bus = new EventBus();
    const founded = foundReligion(state, civId, templeCity, bus);
    const second = foundReligion(founded, civId, templeCity, bus);
    expect(second).toBe(founded);
  });

  it('picks a name from NAME_CANDIDATES deterministically by seed', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const a = foundReligion(state, civId, templeCity, new EventBus());
    const b = foundReligion(state, civId, templeCity, new EventBus());
    expect(a.religions![`religion-${civId}`].name).toBe(b.religions![`religion-${civId}`].name);
    expect(a.religions![`religion-${civId}`].name.length).toBeGreaterThan(0);
  });

  it('emits religion:founded exactly once', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('religion:founded', e => events.push(e));
    foundReligion(state, civId, templeCity, bus);
    expect(events).toHaveLength(1);
  });

  it('is a no-op for a nonexistent civ', () => {
    const { state, templeCity } = makeReligionFixture();
    const next = foundReligion(state, 'no-such-civ', templeCity, new EventBus());
    expect(next).toBe(state);
  });
});

describe('#591 MR4 — chooseBoon', () => {
  it('sets the boon on the owner\'s religion', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const founded = foundReligion(state, civId, templeCity, new EventBus());
    const next = chooseBoon(founded, `religion-${civId}`, 'serenity');
    expect(next.religions![`religion-${civId}`].boon).toBe('serenity');
  });

  it('is a no-op for a nonexistent religion id', () => {
    const { state } = makeReligionFixture();
    expect(chooseBoon(state, 'no-such-religion', 'tithes')).toBe(state);
  });
});

function addCity(state: GameState, id: string, owner: string, coord: HexCoord, overrides: Partial<City> = {}): GameState {
  const tile: HexTile = {
    coord, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none',
    owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null, regionKey: 'landmass-1',
  };
  const city: City = {
    id, name: id, owner, position: coord, population: 4, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [coord], workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  };
  return {
    ...state,
    map: { ...state.map, tiles: { ...state.map.tiles, [hexKey(coord)]: tile } },
    cities: { ...state.cities, [id]: city },
  };
}

function markVisible(state: GameState, civId: string, coords: HexCoord[]): GameState {
  const tiles = { ...(state.civilizations[civId].visibility?.tiles ?? {}) };
  for (const c of coords) tiles[hexKey(c)] = 'visible';
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...state.civilizations[civId], visibility: { tiles } },
    },
  };
}

interface PreachScenarioOptions {
  atWar?: boolean;
  holyCity?: boolean;
  occupied?: boolean; // target is civId's own city under occupation (originalOwner = otherCivId)
  zeal?: boolean;
  discovered?: boolean; // default true
  targetOwnCityFlipped?: boolean; // target is civId's own city that flipped to otherCivId's faith
}

function seedPreachScenario(opts: PreachScenarioOptions = {}) {
  const bus = new EventBus();
  const fixture = makeReligionFixture();
  const { civId, otherCivId } = fixture;
  let state = foundReligion(fixture.state, civId, fixture.templeCity, bus);

  if (opts.zeal) {
    state = {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: {
          ...state.civilizations[civId],
          techState: { ...state.civilizations[civId].techState, completed: [...state.civilizations[civId].techState.completed, 'missionary-zeal'] },
        },
      },
    };
  }

  const targetPos: HexCoord = { q: 20, r: 20 };
  const targetOwner = (opts.holyCity || opts.occupied || opts.targetOwnCityFlipped) ? civId : otherCivId;
  state = addCity(state, 'target-city', targetOwner, targetPos, opts.occupied ? { occupation: { originalOwnerId: otherCivId, turnsRemaining: 5 } } : {});

  if (opts.holyCity) {
    state = { ...state, cityFaith: { ...state.cityFaith, 'target-city': { religionId: `religion-${civId}`, isHolyCity: true } } };
  } else if (opts.targetOwnCityFlipped) {
    state = foundReligion(state, otherCivId, fixture.otherCity, bus);
    state = { ...state, cityFaith: { ...state.cityFaith, 'target-city': { religionId: `religion-${otherCivId}` } } };
  }

  if (opts.atWar) {
    state = {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...state.civilizations[civId], diplomacy: { ...state.civilizations[civId].diplomacy, atWarWith: [otherCivId] } },
      },
    };
  }

  const missionary = createUnit('missionary', civId, targetPos, state.idCounters);
  missionary.chargesRemaining = 2;
  state = {
    ...state,
    units: { ...state.units, [missionary.id]: missionary },
    civilizations: {
      ...state.civilizations,
      [civId]: { ...state.civilizations[civId], units: [...state.civilizations[civId].units, missionary.id] },
    },
  };

  if (opts.discovered !== false) {
    state = markVisible(state, civId, [targetPos]);
  }

  return { state, bus, unitId: missionary.id, cityId: 'target-city', civId, otherCivId };
}

describe('preach() (#592)', () => {
  it('grants PREACH_POINTS (50) toward a freshly-founded target city, not doubled', () => {
    const { state, bus, unitId, cityId, civId } = seedPreachScenario();
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(true);
    expect(getCityConversionPoints(result.state.cityFaith?.[cityId], `religion-${civId}`)).toBe(50);
  });

  it('grants PREACH_OCCUPIED_DOUBLE (100) and converts outright when target is occupied AND owner has missionary-zeal', () => {
    const { state, bus, unitId, cityId, civId } = seedPreachScenario({ occupied: true, zeal: true });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok && result.converted).toBe(true);
    expect(result.state.cityFaith?.[cityId].religionId).toBe(`religion-${civId}`);
  });

  it('grants only PREACH_POINTS (50, not doubled) when occupied but owner lacks missionary-zeal', () => {
    const { state, bus, unitId, cityId, civId } = seedPreachScenario({ occupied: true, zeal: false });
    const result = preach(state, unitId, cityId, bus);
    expect(getCityConversionPoints(result.state.cityFaith?.[cityId], `religion-${civId}`)).toBe(50);
  });

  it('grants only PREACH_POINTS (50) when owner has missionary-zeal but target is NOT occupied', () => {
    const { state, bus, unitId, cityId, civId } = seedPreachScenario({ zeal: true });
    const result = preach(state, unitId, cityId, bus);
    expect(getCityConversionPoints(result.state.cityFaith?.[cityId], `religion-${civId}`)).toBe(50);
  });

  it('refuses to preach a holy city', () => {
    const { state, bus, unitId, cityId } = seedPreachScenario({ holyCity: true });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('holy-city');
  });

  it('refuses to preach a city owned by a civ the missionary owner is at war with', () => {
    const { state, bus, unitId, cityId } = seedPreachScenario({ atWar: true });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('at-war');
  });

  it('refuses to preach an undiscovered city', () => {
    const { state, bus, unitId, cityId } = seedPreachScenario({ discovered: false });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('undiscovered');
  });

  it('consumes one charge per preach; refuses on-cooldown same turn; consumes the unit at 0 charges after cooldown elapses', () => {
    const { state, bus, unitId, cityId } = seedPreachScenario();
    const afterFirst = preach(state, unitId, cityId, bus);
    expect(afterFirst.ok && afterFirst.state.units[unitId]?.chargesRemaining).toBe(1);
    expect(afterFirst.ok && afterFirst.unitConsumed).toBe(false);

    // same turn: still on cooldown
    const immediateSecond = preach(afterFirst.ok ? afterFirst.state : state, unitId, cityId, bus);
    expect(immediateSecond.ok).toBe(false);
    if (!immediateSecond.ok) expect(immediateSecond.reason).toBe('on-cooldown');

    // advance past the cooldown window
    const cooledDownState = { ...(afterFirst.ok ? afterFirst.state : state), turn: state.turn + MISSIONARY_ACTION_COOLDOWN_TURNS };
    const afterSecond = preach(cooledDownState, unitId, cityId, bus);
    expect(afterSecond.ok && afterSecond.unitConsumed).toBe(true);
    expect(afterSecond.ok && afterSecond.state.units[unitId]).toBeUndefined();
  });

  it('refuses when the missionary has no charges left', () => {
    const { state, bus, unitId, cityId } = seedPreachScenario();
    const zeroCharges = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId], chargesRemaining: 0 } } };
    const result = preach(zeroCharges, unitId, cityId, bus);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-charges');
  });

  it('refuses when the missionary is out of range (not on/adjacent to the target city)', () => {
    const { state, bus, unitId, cityId } = seedPreachScenario();
    const farAway = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId], position: { q: 0, r: 0 } } } };
    const result = preach(farAway, unitId, cityId, bus);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('out-of-range');
  });

  it('own cities are a valid preach target (re-convert a flipped city)', () => {
    const { state, bus, unitId, cityId } = seedPreachScenario({ targetOwnCityFlipped: true });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok).toBe(true);
  });

  it('canPreachTarget matches preach()\'s own refusal conditions (no drift between UI eligibility and the real gate)', () => {
    const { state, unitId, cityId } = seedPreachScenario({ holyCity: true });
    expect(canPreachTarget(state, state.units[unitId], cityId)).toBe(false);
    const ok = seedPreachScenario();
    expect(canPreachTarget(ok.state, ok.state.units[ok.unitId], ok.cityId)).toBe(true);
  });
});

describe('occupation passive pressure (#592)', () => {
  it('an occupied city accrues OCCUPATION_ACCRUAL/turn toward the occupier faith', () => {
    const bus = new EventBus();
    const fixture = makeReligionFixture();
    const { civId, otherCivId } = fixture;
    let state = foundReligion(fixture.state, civId, fixture.templeCity, bus);
    const targetPos: HexCoord = { q: 20, r: 20 };
    state = addCity(state, 'occupied-city', civId, targetPos, { occupation: { originalOwnerId: otherCivId, turnsRemaining: 5 } });

    const before = getCityConversionPoints(state.cityFaith?.['occupied-city'], `religion-${civId}`);
    const next = processReligionTurn(state, bus);
    const after = getCityConversionPoints(next.cityFaith?.['occupied-city'], `religion-${civId}`);
    expect(after - before).toBe(OCCUPATION_ACCRUAL);
  });

  it('occupation accrual stops once occupation ends (city.occupation cleared)', () => {
    const bus = new EventBus();
    const fixture = makeReligionFixture();
    const { civId } = fixture;
    let state = foundReligion(fixture.state, civId, fixture.templeCity, bus);
    const targetPos: HexCoord = { q: 20, r: 20 };
    state = addCity(state, 'occupied-city', civId, targetPos); // no occupation field

    const before = getCityConversionPoints(state.cityFaith?.['occupied-city'], `religion-${civId}`);
    const next = processReligionTurn(state, bus);
    const after = getCityConversionPoints(next.cityFaith?.['occupied-city'], `religion-${civId}`);
    expect(after).toBe(before);
  });

  it('occupied city under missionary-zeal + preach converts outright in one call, matching the doubled matrix case', () => {
    const { state, bus, unitId, cityId, civId } = seedPreachScenario({ occupied: true, zeal: true });
    const result = preach(state, unitId, cityId, bus);
    expect(result.ok && result.converted).toBe(true);
    expect(getCityConversionPoints(result.state.cityFaith?.[cityId], `religion-${civId}`)).toBe(0); // bucket cleared/replaced once converted, religionId set directly
  });
});
