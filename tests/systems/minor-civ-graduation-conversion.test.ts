import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import {
  GRADUATION_DENIAL_MESSAGES,
  getGraduateCivId,
  graduateMinorCiv,
} from '@/systems/minor-civ-graduation-conversion';
import { planMinorCivGraduations } from '@/systems/minor-civ-graduation';
import { GRADUATION_MAX_PER_GAME, MINOR_CIV_GRADUATION_TUNING } from '@/systems/minor-civ-graduation-rules';
import { getMinorCivCompletedTechBand, getMinorCivPopulationCeiling } from '@/systems/minor-civ-economy-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { checkCampEvolution } from '@/systems/minor-civ-system';
import { assertSaveStateInvariants, assertMinorCivGraduationIntegrity, SAVE_STATE_INVARIANTS } from '../helpers/save-state-invariants';
import {
  advancePlayerCivToEra, fixtureAlliedWithMajor, fixtureCoastal, fixtureEarlyGameNearYoungPlayer, fixtureLateEra,
  fixtureMilitaristic, fixturePeacefulIsolated, fixtureProsperousMercantile, fixtureThreatenedNoWar,
} from './helpers/minor-civ-scenario-fixtures';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';

const BUILDING_IDS = ['barracks', 'marketplace', 'library', 'granary', 'walls', 'temple', 'workshop', 'harbor'];
const TUNING = MINOR_CIV_GRADUATION_TUNING.standard;

/** A ripe, peaceful city-state with a garrison, a quest, an alliance, a league-free neighbourhood and three majors' worth of civs. */
function ripeFixture() {
  const { state, minorCivId } = fixturePeacefulIsolated('graduation-conversion');
  state.opponentChallenge = 'standard';
  state.turn = 400;
  advancePlayerCivToEra(state, TUNING.minWorldAge);
  state.civilizations['ai-1']!.techState.completed = [...state.civilizations.player.techState.completed];
  const minorCiv = state.minorCivs[minorCivId]!;
  minorCiv.foundedTurn = state.turn - TUNING.minAgeTurns;
  const city = state.cities[minorCiv.cityId]!;
  city.population = getMinorCivPopulationCeiling(state, minorCivId) - TUNING.populationHeadroom;
  city.buildings = BUILDING_IDS.slice(0, TUNING.minBuildings);
  return { state, minorCivId, minorCiv, city };
}

function collectInvariantFailures(state: GameState): string[] {
  return SAVE_STATE_INVARIANTS.filter(({ check }) => { try { check(state); return false; } catch { return true; } }).map(({ name }) => name);
}

function ok(result: ReturnType<typeof graduateMinorCiv>) {
  if (!result.ok) throw new Error(`expected graduation, got ${result.reason}`);
  return result;
}

describe('graduateMinorCiv (#497)', () => {
  it('turns the city-state into a major civilization that owns its city, tiles and garrison', () => {
    const { state, minorCivId, minorCiv, city } = ripeFixture();
    const garrisonIds = minorCiv.units.filter(id => state.units[id]);
    expect(garrisonIds.length).toBeGreaterThan(0);
    const { state: next, transition } = ok(graduateMinorCiv(state, minorCivId));

    const civId = getGraduateCivId(minorCiv.definitionId);
    expect(transition).toMatchObject({ minorCivId, civId, turn: 400, definitionId: minorCiv.definitionId });
    expect(classifyOwner(civId)).toBe('major');
    const civ = next.civilizations[civId]!;
    expect(civ).toMatchObject({ isHuman: false, civType: 'generic', gold: 0, cities: [city.id], graduatedFrom: { minorCivId, turn: 400 } });
    expect(next.cities[city.id]!.owner).toBe(civId);
    for (const coord of city.ownedTiles) {
      expect(next.map.tiles[`${coord.q},${coord.r}`]?.owner).not.toBe(minorCivId);
    }
    expect([...civ.units].sort()).toEqual([...garrisonIds].sort());
    for (const unitId of garrisonIds) expect(next.units[unitId]!.owner).toBe(civId);
    expect(next.minorCivs[minorCivId]).toMatchObject({ isDestroyed: true, units: [], graduation: { turn: 400, civId } });
    assertSaveStateInvariants(next, 'after graduation');
  });

  it('preserves every unit and every position: nothing is created, removed or moved', () => {
    const { state, minorCivId } = ripeFixture();
    const { state: next } = ok(graduateMinorCiv(state, minorCivId));
    expect(Object.keys(next.units).sort()).toEqual(Object.keys(state.units).sort());
    for (const [id, unit] of Object.entries(state.units)) expect(next.units[id]!.position).toEqual(unit.position);
  });

  it('gives the new civilization exactly the city-state\'s tech band, no gold and no research', () => {
    const { state, minorCivId } = ripeFixture();
    const band = getMinorCivCompletedTechBand(state, minorCivId);
    const { state: next, transition } = ok(graduateMinorCiv(state, minorCivId));
    const tech = next.civilizations[transition.civId]!.techState;
    expect([...tech.completed].sort()).toEqual([...band].sort());
    expect(tech).toMatchObject({ currentResearch: null, researchQueue: [], researchProgress: 0 });
    expect(next.civilizations[transition.civId]!.gold).toBe(0);
  });

  it('keeps the city\'s buildings and queue, and drops the minor-civ economy record', () => {
    const { state, minorCivId, city } = ripeFixture();
    const { state: next } = ok(graduateMinorCiv(state, minorCivId));
    expect(next.cities[city.id]!.buildings).toEqual(city.buildings);
    expect(next.cities[city.id]!.productionQueue).toEqual(city.productionQueue);
    expect(next.minorCivs[minorCivId]!.economy).toBeUndefined();
  });

  it('links every other civilization both ways, using the city-state\'s own relationship', () => {
    const { state, minorCivId } = ripeFixture();
    state.minorCivs[minorCivId]!.diplomacy.relationships.player = 37;
    const { state: next, transition } = ok(graduateMinorCiv(state, minorCivId));
    const civ = next.civilizations[transition.civId]!;
    for (const otherId of Object.keys(state.civilizations)) {
      expect(otherId in civ.diplomacy.relationships).toBe(true);
      expect(next.civilizations[otherId]!.diplomacy.relationships[transition.civId]).toBe(civ.diplomacy.relationships[otherId]);
    }
    expect(civ.diplomacy.relationships.player).toBe(37);
    expect(civ.diplomacy.atWarWith).toEqual([]);
  });

  it('cancels quests and ends alliances, reporting each ended alliance', () => {
    const { state, minorCivId, minorCiv } = ripeFixture();
    minorCiv.chainStatusByCiv = { player: { status: 'allied', chainId: 'chain-a' } } as never;
    minorCiv.activeQuests = { player: { id: 'q1' } } as never;
    minorCiv.questCooldownUntilByCiv = { player: 450 };
    const { state: next, transition } = ok(graduateMinorCiv(state, minorCivId));
    expect(transition.allianceTransitions).toEqual([{ type: 'alliance-broken', majorCivId: 'player', minorCivId, chainId: 'chain-a' }]);
    expect(next.minorCivs[minorCivId]).toMatchObject({ activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {} });
  });

  it('scrubs the old id from a major\'s war list, and from a coalition it belonged to', () => {
    const { state, minorCivId } = ripeFixture();
    state.civilizations.player!.diplomacy.atWarWith = [minorCivId];
    state.minorCivCoalitions = { c1: { id: 'c1', targetCivId: 'ai-1', memberIds: [minorCivId, 'mc-other'], status: 'cooling', createdTurn: 1, updatedTurn: 1, cooldownUntilTurn: 0 } };
    const { state: next } = ok(graduateMinorCiv(state, minorCivId));
    expect(next.civilizations.player!.diplomacy.atWarWith).toEqual([]);
    expect(next.minorCivCoalitions!.c1!.memberIds).toEqual(['mc-other']);
    assertMinorCivGraduationIntegrity(next);
  });

  it('never modifies the state it was given', () => {
    const { state, minorCivId } = ripeFixture();
    const before = structuredClone(state);
    ok(graduateMinorCiv(state, minorCivId));
    expect(state).toEqual(before);
  });

  describe('refuses without writing anything', () => {
    it.each([
      ['an unknown city-state', () => 'mc-nobody', 'missing-minor-civ'],
      ['a city-state too young to graduate', (s: GameState, id: string) => { s.minorCivs[id]!.foundedTurn = s.turn - 1; return id; }, 'too-young'],
      ['a city-state at war', (s: GameState, id: string) => { s.minorCivs[id]!.diplomacy.atWarWith = ['player']; return id; }, 'at-war'],
      ['an already conquered city-state', (s: GameState, id: string) => { s.minorCivs[id]!.isDestroyed = true; return id; }, 'destroyed'],
    ])('%s', (_name, prepare, reason) => {
      const { state, minorCivId } = ripeFixture();
      const target = prepare(state, minorCivId);
      const before = structuredClone(state);
      expect(graduateMinorCiv(state, target)).toEqual({ ok: false, reason });
      expect(state).toEqual(before);
    });

    it('once the per-game cap is reached', () => {
      const { state, minorCivId } = ripeFixture();
      for (let index = 0; index < GRADUATION_MAX_PER_GAME; index += 1) {
        state.civilizations[`grad-old-${index}`] = { ...structuredClone(state.civilizations['ai-1']!), id: `grad-old-${index}`, isEliminated: true, graduatedFrom: { minorCivId: `mc-old-${index}`, definitionId: `old-${index}`, turn: 100 } };
      }
      expect(graduateMinorCiv(state, minorCivId)).toEqual({ ok: false, reason: 'graduation-cap-reached' });
    });

    it('when the civilization id is already taken', () => {
      const { state, minorCivId, minorCiv } = ripeFixture();
      state.civilizations[getGraduateCivId(minorCiv.definitionId)] = structuredClone(state.civilizations['ai-1']!);
      expect(graduateMinorCiv(state, minorCivId)).toEqual({ ok: false, reason: 'civ-id-taken' });
    });

    it('has player-facing copy for every denial', () => {
      for (const message of Object.values(GRADUATION_DENIAL_MESSAGES)) expect(message.length).toBeGreaterThan(10);
    });
  });

  it('cannot graduate the same city-state twice', () => {
    const { state, minorCivId } = ripeFixture();
    const { state: next } = ok(graduateMinorCiv(state, minorCivId));
    expect(graduateMinorCiv(next, minorCivId)).toEqual({ ok: false, reason: 'destroyed' });
  });

  it('survives a save and reload with the integrity invariants intact', () => {
    const { state, minorCivId } = ripeFixture();
    const { state: next } = ok(graduateMinorCiv(state, minorCivId));
    const reloaded = normalizeLoadedStateForTest(JSON.parse(JSON.stringify(next)));
    assertSaveStateInvariants(reloaded, 'after reload');
    expect(reloaded.civilizations[getGraduateCivId(state.minorCivs[minorCivId]!.definitionId)]!.graduatedFrom).toBeDefined();
  });

  it('removes the graduate from the planner: no second graduation, and the cap counts it', () => {
    const { state, minorCivId } = ripeFixture();
    const { state: next } = ok(graduateMinorCiv(state, minorCivId));
    const plan = planMinorCivGraduations(next);
    if (plan.status === 'evaluated') expect(plan.selectedMinorCivId).not.toBe(minorCivId);
  });

  it('keeps camp evolution from reusing a graduated definition (which would overwrite its record)', () => {
    const { state, minorCivId, minorCiv } = ripeFixture();
    const { state: next } = ok(graduateMinorCiv(state, minorCivId));
    // Every other definition is taken, so the graduated one is the only candidate left.
    for (const definition of MINOR_CIV_DEFINITIONS) {
      if (definition.id === minorCiv.definitionId) continue;
      next.minorCivs[`mc-${definition.id}`] = { ...structuredClone(next.minorCivs[minorCivId]!), id: `mc-${definition.id}`, definitionId: definition.id, isDestroyed: false, graduation: undefined };
    }
    next.barbarianCamps = { camp: { id: 'camp', position: { q: 0, r: 0 }, strength: 20 } as never };
    next.cities = {};
    next.units = {};
    expect(checkCampEvolution(next, next.turn)).toBeNull();

    // Earned control: the same world with a merely conquered (not graduated) record does offer the definition.
    const conquered = structuredClone(next);
    conquered.minorCivs[minorCivId] = { ...conquered.minorCivs[minorCivId]!, graduation: undefined };
    expect(checkCampEvolution(conquered, conquered.turn)?.newMinorCiv.definitionId).toBe(minorCiv.definitionId);
  });
});

describe('minor-civ-graduation-integrity (#497)', () => {
  function graduated() {
    const { state, minorCivId } = ripeFixture();
    const result = ok(graduateMinorCiv(state, minorCivId));
    return { state: result.state, minorCivId, civId: result.transition.civId };
  }

  it('passes on a converted state', () => {
    expect(() => assertMinorCivGraduationIntegrity(graduated().state)).not.toThrow();
  });

  it.each([
    ['a record that is not destroyed', (s: GameState, id: string) => { s.minorCivs[id]!.isDestroyed = false; }],
    ['a record that still lists units', (s: GameState, id: string) => { s.minorCivs[id]!.units = ['unit-x']; }],
    ['a civilization that forgot where it came from', (s: GameState, _id: string, civId: string) => { delete s.civilizations[civId]!.graduatedFrom; }],
    ['a city the graduate does not own', (s: GameState, id: string) => { s.cities[s.minorCivs[id]!.cityId]!.owner = 'player'; }],
    ['a war list that still names the old id', (s: GameState, id: string) => { s.civilizations.player!.diplomacy.atWarWith = [id]; }],
    ['a coalition that still lists the old id', (s: GameState, id: string) => { s.minorCivCoalitions = { c: { id: 'c', targetCivId: 'player', memberIds: [id], status: 'forming', createdTurn: 1, updatedTurn: 1, cooldownUntilTurn: 0 } }; }],
  ])('rejects %s', (_name, corrupt) => {
    const { state, minorCivId, civId } = graduated();
    corrupt(state, minorCivId, civId);
    expect(() => assertMinorCivGraduationIntegrity(state)).toThrow(/minor-civ-graduation-integrity/);
  });
});

describe('conversion across the long-run fixtures (#497)', () => {
  const FIXTURES = [
    fixturePeacefulIsolated, fixtureProsperousMercantile, fixtureMilitaristic, fixtureAlliedWithMajor,
    fixtureCoastal, fixtureLateEra, fixtureEarlyGameNearYoungPlayer,
  ];
  for (const build of FIXTURES) {
    it(`${build.name}: a ripe city-state converts and every shared invariant holds`, () => {
      const { state, minorCivId } = build(`graduation-${build.name}`);
      state.opponentChallenge = 'standard';
      state.turn = 400;
      const mc = state.minorCivs[minorCivId]!;
      mc.foundedTurn = 200;
      mc.diplomacy.atWarWith = [];
      for (const civ of Object.values(state.civilizations)) civ.diplomacy.atWarWith = civ.diplomacy.atWarWith.filter(id => id !== minorCivId);
      state.minorCivCoalitions = {};
      mc.regionalGrievanceByCiv = {};
      const city = state.cities[mc.cityId]!;
      city.population = getMinorCivPopulationCeiling(state, minorCivId);
      city.buildings = BUILDING_IDS.slice(0, TUNING.minBuildings);
      // A fixture that already breaks a shared invariant before conversion (fixtureAlliedWithMajor parks a garrison on a
      // camp tile) would blame the conversion for the fixture's own state: only new violations count.
      const failuresBefore = collectInvariantFailures(state);
      const unitIds = Object.keys(state.units).sort();
      const result = graduateMinorCiv(state, minorCivId);
      if (!result.ok) throw new Error(`${build.name}: ${result.reason}`);
      expect(Object.keys(result.state.units).sort()).toEqual(unitIds);
      expect(collectInvariantFailures(result.state).filter(name => !failuresBefore.includes(name)), build.name).toEqual([]);
    });
  }

  it('refuses a threatened city-state, with the reason', () => {
    const { state, minorCivId } = fixtureThreatenedNoWar('graduation-threatened');
    state.opponentChallenge = 'standard';
    state.turn = 400;
    const mc = state.minorCivs[minorCivId]!;
    mc.foundedTurn = 200;
    state.cities[mc.cityId]!.population = getMinorCivPopulationCeiling(state, minorCivId);
    state.cities[mc.cityId]!.buildings = BUILDING_IDS.slice(0, TUNING.minBuildings);
    expect(graduateMinorCiv(state, minorCivId)).toEqual({ ok: false, reason: 'under-threat' });
  });

  it('the planner stops once the per-game cap is reached', () => {
    const { state } = ripeFixture();
    state.turn = 400;
    for (let index = 0; index < GRADUATION_MAX_PER_GAME; index += 1) {
      state.civilizations[`grad-old-${index}`] = { ...structuredClone(state.civilizations['ai-1']!), id: `grad-old-${index}`, isEliminated: true, graduatedFrom: { minorCivId: `mc-old-${index}`, definitionId: `old-${index}`, turn: 100 } };
    }
    state.minorCivs['mc-old-0'] = { ...structuredClone(Object.values(state.minorCivs)[0]!), id: 'mc-old-0', definitionId: 'old-0', isDestroyed: true, graduation: { turn: 100, civId: 'grad-old-0' } };
    expect(planMinorCivGraduations(state)).toMatchObject({ status: 'skipped', reason: 'graduation-cap' });
  });
});
