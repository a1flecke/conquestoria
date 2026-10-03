// @vitest-environment jsdom
/**
 * #1220 — enqueueing production is one validated operation.
 *
 * `enqueueCityProduction` used to accept any string and throw `Error('Queue limit reached')`; whether the item was
 * available (tech, resource, coastal, reserved national project, faith) was each caller's job, with `processCity`
 * dropping an illegal head a turn later. It now re-runs the eligibility the Build tab is built from and returns a
 * typed result with copy.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { GameState, HexCoord, TerrainType } from '@/core/types';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import {
  ENQUEUE_DENIAL_MESSAGES,
  enqueueCityProduction,
  type EnqueueDenialReason,
} from '@/systems/planning-system';
import { getQueueableProductionForCity } from '@/systems/city-production-eligibility';
import { generateAIProductionCandidates } from '@/ai/ai-production';
import { createCityPanel } from '@/ui/city-panel';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

const CITY = 'city-river';
const ALL_TECHS = TECH_TREE.map(tech => tech.id);

function setTerrain(state: GameState, coord: HexCoord, terrain: TerrainType): void {
  const key = hexKey(coord);
  const existing = state.map.tiles[key];
  state.map.tiles[key] = existing
    ? { ...existing, terrain }
    : {
      coord, terrain, elevation: 'lowland', resource: null, improvement: 'none', owner: null,
      improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
}

function surround(state: GameState, terrain: TerrainType): GameState {
  for (const neighbour of hexNeighbors(state.cities[CITY].position)) setTerrain(state, neighbour, terrain);
  return state;
}

const SCENARIOS: Array<[string, () => GameState]> = [
  ['no techs, inland', () => surround(makeLegendaryWonderFixture({ completedTechs: [] }), 'plains')],
  ['early techs, inland', () => surround(makeLegendaryWonderFixture({ completedTechs: ALL_TECHS.slice(0, 12) }), 'plains')],
  ['every tech, inland', () => surround(makeLegendaryWonderFixture({ completedTechs: ALL_TECHS }), 'plains')],
  ['every tech, coastal', () => surround(makeLegendaryWonderFixture({ completedTechs: ALL_TECHS }), 'ocean')],
];

describe('#1220 enqueueCityProduction revalidates the Build tab eligibility', { timeout: 30_000 }, () => {
  it.each(SCENARIOS)('every catalog item: accepted ⇔ offered, a refusal is typed and returns the same state (%s)', (_name, build) => {
    const state = build();
    const offered = getQueueableProductionForCity(state, CITY)!;
    const offeredIds = new Set([...offered.buildings.map(b => b.id), ...offered.units.map(u => u.type)]);
    for (const id of [...Object.keys(BUILDINGS), ...TRAINABLE_UNITS.map(u => u.type)]) {
      const result = enqueueCityProduction(state, CITY, id);
      expect(result.ok, id).toBe(offeredIds.has(id));
      if (result.ok) {
        expect(result.state.cities[CITY].productionQueue).toEqual([id]);
      } else {
        expect(result.reason, id).toBe('not-available');
        expect(result.state, `${id} must hand back the very same state`).toBe(state);
      }
    }
  });

  it('the scenarios are not vacuous: buildings and units are both accepted and refused somewhere', () => {
    const stats = { buildingOk: 0, buildingNo: 0, unitOk: 0, unitNo: 0 };
    for (const [, build] of SCENARIOS) {
      const state = build();
      for (const id of Object.keys(BUILDINGS)) stats[enqueueCityProduction(state, CITY, id).ok ? 'buildingOk' : 'buildingNo'] += 1;
      for (const { type } of TRAINABLE_UNITS) stats[enqueueCityProduction(state, CITY, type).ok ? 'unitOk' : 'unitNo'] += 1;
    }
    expect(stats.buildingOk).toBeGreaterThan(0);
    expect(stats.buildingNo).toBeGreaterThan(0);
    expect(stats.unitOk).toBeGreaterThan(0);
    expect(stats.unitNo).toBeGreaterThan(0);
  });

  it('a coastal-only item is refused inland and accepted on the coast (the gate the old enqueue left to the caller)', () => {
    const coastalOnly = Object.values(BUILDINGS).find(b => b.coastalRequired && !b.nationalProject && !b.requiresBuildings?.length
      && b.techRequired && ALL_TECHS.includes(b.techRequired))!;
    expect(coastalOnly).toBeDefined();
    const inland = surround(makeLegendaryWonderFixture({ completedTechs: ALL_TECHS }), 'plains');
    const coast = surround(makeLegendaryWonderFixture({ completedTechs: ALL_TECHS }), 'ocean');
    const refused = enqueueCityProduction(inland, CITY, coastalOnly.id);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? null : refused.reason).toBe('not-available');
    expect(enqueueCityProduction(coast, CITY, coastalOnly.id).ok).toBe(true);
  });

  it('refuses an item whose tech is not researched, and accepts it once it is', () => {
    const locked = surround(makeLegendaryWonderFixture({ completedTechs: [] }), 'plains');
    const unlocked = surround(makeLegendaryWonderFixture({ completedTechs: ALL_TECHS }), 'plains');
    const library = enqueueCityProduction(locked, CITY, 'library');
    expect(library.ok).toBe(false);
    expect(enqueueCityProduction(unlocked, CITY, 'library').ok).toBe(true);
  });

  describe('typed reasons', () => {
    const base = () => surround(makeLegendaryWonderFixture({ completedTechs: ALL_TECHS }), 'plains');
    const reasonOf = (state: GameState, id: string, cityId = CITY): EnqueueDenialReason | null => {
      const result = enqueueCityProduction(state, cityId, id);
      return result.ok ? null : result.reason;
    };

    it('city-not-found', () => {
      const state = base();
      expect(reasonOf(state, 'warrior', 'no-such-city')).toBe('city-not-found');
    });

    it('unknown-item: a string that is neither a building nor a unit', () => {
      expect(reasonOf(base(), 'definitely-not-a-thing')).toBe('unknown-item');
    });

    it('legendary-wonder: a bare legendary id has no eligibility, so it is routed to the wonders panel', () => {
      expect(reasonOf(base(), 'legendary:colosseum')).toBe('legendary-wonder');
    });

    it('duplicate: a one-time building already in the queue; a unit may repeat; a consumed building may repeat', () => {
      const state = base();
      const unit = getQueueableProductionForCity(state, CITY)!.units[0].type;
      state.cities[CITY] = { ...state.cities[CITY], productionQueue: ['library', unit] };
      expect(reasonOf(state, 'library')).toBe('duplicate');
      expect(reasonOf(state, unit)).toBeNull();
      const warhead = BUILDINGS['warhead'];
      if (warhead?.consumedOnCompletion) {
        state.cities[CITY] = { ...state.cities[CITY], productionQueue: ['warhead'] };
        const again = enqueueCityProduction(state, CITY, 'warhead');
        if (!again.ok) expect(again.reason).not.toBe('duplicate');
      }
    });

    it('queue-full: four items is the limit, and the refusal leaves the queue untouched', () => {
      const state = base();
      const unit = getQueueableProductionForCity(state, CITY)!.units[0].type;
      state.cities[CITY] = { ...state.cities[CITY], productionQueue: [unit, unit, unit, unit] };
      const result = enqueueCityProduction(state, CITY, unit);
      expect(result.ok).toBe(false);
      expect(result.ok ? null : result.reason).toBe('queue-full');
      expect(result.state).toBe(state);
    });

    it('every reason has player copy that names no one', () => {
      for (const [reason, message] of Object.entries(ENQUEUE_DENIAL_MESSAGES)) {
        expect(message.length, reason).toBeGreaterThan(0);
        expect(message, reason).not.toMatch(/rival|player|ai-\d/i);
      }
    });
  });

  it('a unique national project queued in one city is refused in another, and is a duplicate in the same one', () => {
    // The national-project window is era-bound, so look for the earliest tech cut-off that offers one.
    let state!: GameState;
    let project: { id: string } | undefined;
    for (let eraCutoff = 1; eraCutoff <= 6 && !project; eraCutoff += 1) {
      const techs = TECH_TREE.filter(tech => tech.era <= eraCutoff).map(tech => tech.id);
      state = surround(makeLegendaryWonderFixture({ completedTechs: techs }), 'plains');
      project = getQueueableProductionForCity(state, CITY)!.buildings.find(b => b.nationalProject && b.uniquePerEmpire);
    }
    // A second city of the same civilization.
    const second = { ...state.cities[CITY], id: 'city-second', name: 'city-second', position: { q: 4, r: 1 }, productionQueue: [], ownedTiles: [{ q: 4, r: 1 }] };
    state.cities['city-second'] = second;
    state.civilizations.player.cities = [...state.civilizations.player.cities, 'city-second'];
    expect(project, 'the fixture must offer a unique national project for this test to mean anything').toBeDefined();
    if (!project) return;
    const queued = enqueueCityProduction(state, CITY, project.id);
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    const again = enqueueCityProduction(queued.state, CITY, project.id);
    expect(again.ok ? null : again.reason).toBe('duplicate');
    const elsewhere = enqueueCityProduction(queued.state, 'city-second', project.id);
    expect(elsewhere.ok ? null : elsewhere.reason).toBe('not-available');
    expect(elsewhere.state).toBe(queued.state);
  });

  it('the enqueue is for the city owner: it never reads currentPlayer, so hot seat cannot cross-queue by accident', () => {
    const state = surround(makeLegendaryWonderFixture({ completedTechs: ALL_TECHS }), 'plains');
    const rivalUnit = getQueueableProductionForCity(state, 'city-rival')?.units[0]?.type;
    expect(rivalUnit, 'the rival city must have something it can queue').toBeDefined();
    const asPlayerTurn = enqueueCityProduction({ ...state, currentPlayer: 'player' }, 'city-rival', rivalUnit!);
    const asRivalTurn = enqueueCityProduction({ ...state, currentPlayer: 'rival' }, 'city-rival', rivalUnit!);
    expect(asPlayerTurn.ok).toBe(true);
    expect(asRivalTurn.ok).toBe(true);
    // Whose turn it is changes nothing about the outcome: the city's owner decides what is available.
    expect(asPlayerTurn.ok && asRivalTurn.ok ? asPlayerTurn.state.cities : null)
      .toEqual(asRivalTurn.ok ? asRivalTurn.state.cities : undefined);
  });
});

describe('#1220 the panel, the recommendation and the AI go through the same list', { timeout: 30_000 }, () => {
  beforeEach(() => { document.body.innerHTML = '<div id="panel-root"></div>'; });
  afterEach(() => { document.body.innerHTML = ''; });

  // Rendering the full panel is the heavy part (a full tech tree is ~1.5s locally, several times that on a loaded
  // CI shard), so each scenario is its own test with a timeout sized for it rather than the 5s default.
  const PANEL_SCENARIOS = [SCENARIOS[1], SCENARIOS[3]] as const; // withheld items exist / the most items offered
  it.each(PANEL_SCENARIOS)('the Build tab lists exactly the items enqueue accepts, and nothing it would refuse (%s)', (name, build) => {
    const state = build();
    const container = document.getElementById('panel-root')!;
    container.innerHTML = '';
    createCityPanel(container, state.cities[CITY], state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    const shown = [...container.querySelectorAll<HTMLElement>('.build-item')].map(el => el.dataset.itemId!);
    expect(shown.length, name).toBeGreaterThan(0);
    for (const id of shown) {
      expect(enqueueCityProduction(state, CITY, id).ok, `${name}: panel offers ${id}`).toBe(true);
    }
    const offered = getQueueableProductionForCity(state, CITY)!;
    const offeredCount = offered.buildings.length + offered.units.length;
    expect(shown.length, `${name}: nothing the queue accepts is missing from the panel`).toBe(offeredCount);
  }, 30_000);

  it('every AI production candidate for a city is accepted by enqueue (the AI cannot propose what the queue refuses)', () => {
    const state = surround(makeLegendaryWonderFixture({ completedTechs: ALL_TECHS }), 'ocean');
    const candidates = generateAIProductionCandidates(state, 'player', CITY, [], { aggression: 0.5, expansion: 0.5, diplomacy: 0.5, research: 0.5, economy: 0.5 } as never);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(enqueueCityProduction(state, CITY, candidate.itemId).ok, candidate.itemId).toBe(true);
    }
  });
});
