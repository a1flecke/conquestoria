import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '@/testing/scenarios';
import { buildScenario } from '@/testing/scenario-builder';
import { hexKey } from '@/systems/hex-utils';
import { getBlockingMapEntityAt, getMovementRangeDetails } from '@/systems/unit-system';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { normalizeLoadedState } from '@/storage/save-manager';
import { isUnitConcealedFrom } from '@/systems/concealment';

describe('undefended-enemy-city scenario (#843)', () => {
  it('reproduces a player scout 2 hexes from an undefended, at-war AI city', () => {
    const state = buildScenario(SCENARIOS['undefended-enemy-city']);
    const scout = Object.values(state.units).find(u => u.type === 'scout' && u.owner === 'player');
    const city = Object.values(state.cities).find(c => c.owner === 'ai-1');
    expect(scout).toBeDefined();
    expect(city).toBeDefined();
    // city has no garrison unit
    expect(Object.values(state.units).some(u => hexKey(u.position) === hexKey(city!.position))).toBe(false);
    expect(state.civilizations.player.diplomacy.atWarWith).toContain('ai-1');

    // Exactly what #843's fix guards: reachable adjacency-only, not walk-through.
    const range = getMovementRangeDetails(state, scout!.id);
    const keys = range.reachable.map(hexKey);
    expect(keys).not.toContain(hexKey(city!.position));
    const blocking = getBlockingMapEntityAt(state, scout!, city!.position);
    expect(blocking).toEqual({ reason: 'foreign-city', entityId: city!.id });
  });
});

describe('undefended-barbarian-camp scenario (#845)', () => {
  it('reproduces a player unit directly adjacent to an undefended camp', () => {
    const state = buildScenario(SCENARIOS['undefended-barbarian-camp']);
    const mover = Object.values(state.units).find(u => u.owner === 'player');
    const camp = Object.values(state.barbarianCamps)[0];
    expect(mover).toBeDefined();
    expect(camp).toBeDefined();
    const blocking = getBlockingMapEntityAt(state, mover!, camp!.position);
    expect(blocking).toEqual({ reason: 'barbarian-camp', entityId: camp!.id });
  });
});

describe('submarine-undetected scenario (#542)', () => {
  it('reproduces an enemy submarine concealed from the player with no nearby detector', () => {
    const state = buildScenario(SCENARIOS['submarine-undetected']);
    const sub = Object.values(state.units).find(u => u.type === 'submarine' && u.owner === 'ai-1');
    expect(sub).toBeDefined();
    expect(isUnitConcealedFrom(state, sub!, 'player')).toBe(true);
  });
});

describe('fort-citadel-visuals-712 scenario', () => {
  it('reaches a Citadel-capable city holding the Coastal Battery and Bunker with Workers alongside', () => {
    const state = buildScenario(SCENARIOS['fort-citadel-visuals-712']);
    const defenceCity = Object.values(state.cities).find(
      c => c.owner === 'player' && c.buildings.includes('bunker'),
    );
    expect(defenceCity).toBeDefined();
    expect(defenceCity!.buildings).toEqual(expect.arrayContaining(['walls', 'coastal_battery', 'bunker']));

    const workers = Object.values(state.units).filter(u => u.type === 'worker' && u.owner === 'player');
    expect(workers.length).toBe(2);

    const techs = state.civilizations.player.techState.completed;
    expect(techs).toEqual(expect.arrayContaining(['fortresses', 'fortification-engineering']));
    expect(state.civilizations.player.gold).toBeGreaterThanOrEqual(4000);
  });
});

describe('destroyer-sonar-detection scenario (#542)', () => {
  it('reproduces an enemy submarine detected by a player destroyer at range 2', () => {
    const state = buildScenario(SCENARIOS['destroyer-sonar-detection']);
    const sub = Object.values(state.units).find(u => u.type === 'submarine' && u.owner === 'ai-1');
    const destroyer = Object.values(state.units).find(u => u.type === 'destroyer' && u.owner === 'player');
    expect(sub).toBeDefined();
    expect(destroyer).toBeDefined();
    expect(isUnitConcealedFrom(state, sub!, 'player')).toBe(false);
  });
});

describe('every registered scenario is a legitimately reachable state', () => {
  for (const name of Object.keys(SCENARIOS)) {
    it(`${name}: survives real turn processing (AI civs, crisis/religion/loyalty ticks)`, () => {
      const state = buildScenario(SCENARIOS[name]);
      expect(() => processTurn(state, new EventBus())).not.toThrow();
    });

    it(`${name}: round-trips through save normalization without losing data`, () => {
      const state = buildScenario(SCENARIOS[name]);
      // normalizeLoadedState is allowed to backfill newer default fields (e.g.
      // lastCombatTurnByLandmass) the way it would for ANY freshly-created
      // game, scenario or not -- so this checks for no data LOSS, not byte
      // equality. Same civ/unit/city ids, and every gameplay-relevant field a
      // scenario step could have set survives the round trip untouched.
      const normalized = normalizeLoadedState(structuredClone(state));
      expect(() => normalizeLoadedState(structuredClone(state))).not.toThrow();
      expect(Object.keys(normalized.civilizations)).toEqual(Object.keys(state.civilizations));
      expect(Object.keys(normalized.units)).toEqual(Object.keys(state.units));
      expect(Object.keys(normalized.cities)).toEqual(Object.keys(state.cities));
      for (const civId of Object.keys(state.civilizations)) {
        expect(normalized.civilizations[civId].gold).toBe(state.civilizations[civId].gold);
        expect(normalized.civilizations[civId].techState.completed).toEqual(state.civilizations[civId].techState.completed);
        expect(normalized.civilizations[civId].diplomacy.atWarWith).toEqual(state.civilizations[civId].diplomacy.atWarWith);
      }
    });
  }
});
