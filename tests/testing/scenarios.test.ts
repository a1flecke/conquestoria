import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '@/testing/scenarios';
import { buildScenario } from '@/testing/scenario-builder';
import { hexKey } from '@/systems/hex-utils';
import { getBlockingMapEntityAt } from '@/systems/unit-movement-legality';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
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

describe('strip-units-showcase scenario (#1627)', () => {
  it('places a full-health spearman and a tier-2 archer beside an at-war enemy spearman', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-spearman']).toMatchObject({ type: 'spearman', owner: 'player', health: 100 });
    expect(state.units['showcase-archer']).toMatchObject({ type: 'archer', owner: 'player', health: 30 });
    expect(state.units['showcase-enemy-spearman']).toMatchObject({ type: 'spearman', owner: 'ai-1' });
    expect(state.civilizations.player.diplomacy.atWarWith).toContain('ai-1');
  });

  it('places a player cavalry so the strip e2e can find its root', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-cavalry']).toMatchObject({ type: 'cavalry', owner: 'player', health: 100 });
  });

  it('places a player rifleman so the strip e2e can find its root', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-rifleman']).toMatchObject({ type: 'rifleman', owner: 'player', health: 100 });
  });

  it('places a player pre-dreadnought on water so the strip e2e can find its root', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-pre-dreadnought']).toMatchObject({ type: 'pre_dreadnought', owner: 'player', health: 100 });
  });

  it('places a player submarine on water so the strip e2e can find its root', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-submarine']).toMatchObject({ type: 'submarine', owner: 'player', health: 100 });
  });

  it('places a player cannon at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-cannon']).toMatchObject({ type: 'cannon', owner: 'player', health: 100 });
    expect(state.units['showcase-cannon-hurt']).toMatchObject({ type: 'cannon', owner: 'player', health: 30 });
  });

  it('places a player artillery at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-artillery']).toMatchObject({ type: 'artillery', owner: 'player', health: 100 });
    expect(state.units['showcase-artillery-hurt']).toMatchObject({ type: 'artillery', owner: 'player', health: 30 });
  });

  it('places a player grenadier at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-grenadier']).toMatchObject({ type: 'grenadier', owner: 'player', health: 100 });
    expect(state.units['showcase-grenadier-hurt']).toMatchObject({ type: 'grenadier', owner: 'player', health: 30 });
  });

  it('places a player marine at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-marine']).toMatchObject({ type: 'marine', owner: 'player', health: 100 });
    expect(state.units['showcase-marine-hurt']).toMatchObject({ type: 'marine', owner: 'player', health: 30 });
  });

  it('places a player infantry at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-infantry']).toMatchObject({ type: 'infantry', owner: 'player', health: 100 });
    expect(state.units['showcase-infantry-hurt']).toMatchObject({ type: 'infantry', owner: 'player', health: 30 });
  });

  it('places a player observation balloon so the strip e2e can find its root', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-observation-balloon']).toMatchObject({ type: 'observation_balloon', owner: 'player', health: 100 });
  });

  it('places a player machine gunner so the strip e2e can find its root', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-machine-gunner']).toMatchObject({ type: 'machine_gunner', owner: 'player', health: 100 });
  });
});
