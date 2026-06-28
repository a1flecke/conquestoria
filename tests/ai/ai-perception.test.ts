import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, LastSeenTilePresentation, UnitType } from '@/core/types';
import {
  buildDiplomaticStrengthEstimates,
  buildMajorCivPerception,
  estimatePerceivedCivStrength,
  refreshMajorCivIntel,
} from '@/ai/ai-perception';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

const ACTOR = 'ai-1';
const RIVAL = 'player';
const OBSERVED = { q: 8, r: 4 };

function makeSnapshot(
  state: GameState,
  overrides: Partial<LastSeenTilePresentation> = {},
): LastSeenTilePresentation {
  const tile = state.map.tiles[hexKey(OBSERVED)];
  return {
    coord: { ...OBSERVED },
    terrain: tile.terrain,
    elevation: tile.elevation,
    resource: tile.resource,
    improvement: tile.improvement,
    improvementTurnsLeft: tile.improvementTurnsLeft,
    owner: tile.owner,
    hasRiver: tile.hasRiver,
    wonder: tile.wonder,
    observedTurn: state.turn - 2,
    source: 'observed',
    ...overrides,
  };
}

function makePerceptionState(): GameState {
  const state = createNewGame(undefined, 'ai-perception', 'small');
  state.turn = 10;
  state.civilizations[ACTOR].knownCivilizations = [RIVAL];
  state.civilizations[ACTOR].visibility.tiles = {};
  state.civilizations[ACTOR].visibility.lastSeen = {};
  state.civilizations[RIVAL].techState.completed = [];
  return state;
}

function addRivalUnit(state: GameState, type: UnitType, position = OBSERVED) {
  const unit = createUnit(type, RIVAL, position, state.idCounters);
  unit.id = `${RIVAL}-${type}`;
  state.units[unit.id] = unit;
  if (!state.civilizations[RIVAL].units.includes(unit.id)) {
    state.civilizations[RIVAL].units.push(unit.id);
  }
  return unit;
}

describe('major-civilization perception', () => {
  it('does not expose live hidden coordinates through a remembered target', () => {
    const state = makePerceptionState();
    const tank = addRivalUnit(state, 'tank', { q: 12, r: 4 });
    state.civilizations[ACTOR].visibility.tiles[hexKey(OBSERVED)] = 'fog';
    state.civilizations[ACTOR].visibility.lastSeen![hexKey(OBSERVED)] = makeSnapshot(state, {
      units: [{
        id: tank.id,
        type: 'tank',
        owner: RIVAL,
        healthBand: 'healthy',
      }],
    });

    const facts = buildMajorCivPerception(state, ACTOR);
    const remembered = facts.units.find(unit => unit.id === tank.id);

    expect(remembered).toMatchObject({
      confidence: 'remembered',
      position: OBSERVED,
      lastSeenTurn: 8,
    });
    expect(remembered?.position).not.toEqual(tank.position);
  });

  it('omits unmet civilizations even when their live state exists', () => {
    const state = makePerceptionState();
    state.civilizations[ACTOR].knownCivilizations = [];
    addRivalUnit(state, 'tank');

    const facts = buildMajorCivPerception(state, ACTOR);

    expect(facts.knownCivIds).not.toContain(RIVAL);
    expect(facts.units.some(unit => unit.owner === RIVAL)).toBe(false);
    expect(facts.knownCities.some(city => city.owner === RIVAL)).toBe(false);
  });

  it('represents contacted but unlocated rivals as rumors without exact coordinates', () => {
    const state = makePerceptionState();

    const facts = buildMajorCivPerception(state, ACTOR);
    const rumor = facts.knownCities.find(city => city.owner === RIVAL);

    expect(rumor).toMatchObject({
      owner: RIVAL,
      position: null,
      confidence: 'rumored',
      observedTurn: null,
    });
    expect(rumor?.id).not.toBe(state.civilizations[RIVAL].cities[0]);
  });

  it('expires remembered units after six rounds and ignores untrusted legacy snapshots', () => {
    const state = makePerceptionState();
    const tank = addRivalUnit(state, 'tank', { q: 12, r: 4 });
    state.civilizations[ACTOR].visibility.tiles[hexKey(OBSERVED)] = 'fog';
    state.civilizations[ACTOR].visibility.lastSeen![hexKey(OBSERVED)] = makeSnapshot(state, {
      observedTurn: state.turn - 7,
      units: [{ id: tank.id, type: tank.type, owner: RIVAL, healthBand: 'healthy' }],
    });
    state.civilizations[ACTOR].visibility.lastSeen!['7,4'] = makeSnapshot(state, {
      coord: { q: 7, r: 4 },
      observedTurn: undefined,
      source: 'legacy-reconstructed',
      units: [{ id: 'legacy-unit', type: 'warrior', owner: RIVAL, healthBand: 'healthy' }],
    });

    const facts = buildMajorCivPerception(state, ACTOR);

    expect(facts.units.find(unit => unit.id === tank.id)).toBeUndefined();
    expect(facts.units.find(unit => unit.id === 'legacy-unit')).toBeUndefined();
  });

  it('keeps own cities and units exact while returning defensive copies', () => {
    const state = makePerceptionState();
    const templateCity = Object.values(state.cities)[0];
    const ownCity = structuredClone(templateCity);
    ownCity.id = 'ai-perception-city';
    ownCity.owner = ACTOR;
    state.cities[ownCity.id] = ownCity;
    state.civilizations[ACTOR].cities.push(ownCity.id);

    const facts = buildMajorCivPerception(state, ACTOR);
    const ownUnit = facts.ownUnits[0];

    expect(ownUnit).toBeDefined();
    expect(ownUnit).not.toBe(state.units[ownUnit.id]);
    expect(facts.ownCities[0]).toEqual(ownCity);
    expect(facts.ownCities[0]).not.toBe(ownCity);
  });

  it('does not count a live hidden tank as exact military strength', () => {
    const state = makePerceptionState();
    addRivalUnit(state, 'tank', { q: 12, r: 4 });

    const perception = buildMajorCivPerception(state, ACTOR);
    const strength = estimatePerceivedCivStrength(perception, RIVAL, state.era);

    expect(strength.exactVisible).toBe(0);
    expect(strength.remembered).toBe(0);
    expect(strength.uncertaintyUpper).toBeGreaterThan(0);
  });

  it('counts every visible combat role symmetrically instead of filtering rivals to warriors', () => {
    const state = makePerceptionState();
    const tank = addRivalUnit(state, 'tank');
    state.civilizations[ACTOR].visibility.tiles[hexKey(tank.position)] = 'visible';
    const perception = buildMajorCivPerception(state, ACTOR);

    const estimates = buildDiplomaticStrengthEstimates(perception, state.era);

    expect(estimates.others[RIVAL].exactVisible).toBeGreaterThan(40);
    expect(estimates.self.midpoint).toBeGreaterThanOrEqual(0);
  });

  it('infers capabilities from observed units without exposing hidden technology', () => {
    const state = makePerceptionState();
    state.era = 8;
    state.civilizations[RIVAL].techState.completed = ['cyber-warfare', 'jet-aviation'];
    state.civilizations[ACTOR].visibility.lastSeen![hexKey(OBSERVED)] = makeSnapshot(state, {
      units: [{
        id: 'observed-rifle',
        type: 'rifleman',
        owner: RIVAL,
        healthBand: 'healthy',
      }],
    });
    state.civilizations[ACTOR].visibility.tiles[hexKey(OBSERVED)] = 'fog';

    const capabilities = buildMajorCivPerception(state, ACTOR)
      .knownOpponentCapabilities[RIVAL];

    expect(capabilities.observedUnitTypes).toEqual(['rifleman']);
    expect(capabilities.inferredEraMin).toBeGreaterThan(1);
    expect(capabilities.inferredEraMax).toBe(8);
    expect(JSON.stringify(capabilities)).not.toContain('cyber-warfare');
    expect(JSON.stringify(capabilities)).not.toContain('jet-aviation');
  });

  it('refreshes intel immutably and preserves a last-known position after sight is lost', () => {
    const state = makePerceptionState();
    const tank = addRivalUnit(state, 'tank');
    state.civilizations[ACTOR].visibility.tiles[hexKey(OBSERVED)] = 'visible';

    const refreshed = refreshMajorCivIntel(state, ACTOR);
    expect(state.civilizations[ACTOR].visibility.lastSeen?.[hexKey(OBSERVED)]).toBeUndefined();

    refreshed.turn += 1;
    refreshed.civilizations[ACTOR].visibility.tiles[hexKey(OBSERVED)] = 'fog';
    refreshed.units[tank.id].position = { q: 12, r: 4 };
    const remembered = buildMajorCivPerception(refreshed, ACTOR)
      .units.find(unit => unit.id === tank.id);

    expect(remembered).toMatchObject({
      position: OBSERVED,
      confidence: 'remembered',
      lastSeenTurn: 10,
    });
  });
});
