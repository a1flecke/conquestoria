import { describe, expect, it, vi } from 'vitest';
import { SCENARIOS } from '@/testing/scenarios';
import { buildScenario } from '@/testing/scenario-builder';
import { hexKey } from '@/systems/hex-utils';
import { getBlockingMapEntityAt } from '@/systems/unit-movement-legality';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { EventBus } from '@/core/event-bus';
import { runCampaignRound } from '@/app/controllers/turn-round-replay';
import type { GameState } from '@/core/types';
import { processTurn } from '@/core/turn-manager';
import * as saveManager from '@/storage/save-manager';
import { isUnitConcealedFrom } from '@/systems/concealment';
import { getTradeRouteQuote } from '@/systems/trade-route-economy';
import { getReserveBalance } from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { getRushBuyQuote } from '@/systems/economy-system';
import { getCityFuelStatus } from '@/systems/resource-fuel-system';
import { applyCapitalOffer, getCapitalComparison } from '@/testing/freight-replay-capital';
import { resumeFreightReplay } from '@/testing/freight-replay-panel';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { canEstablishOutpost, getCivAvailableResources, performEstablishOutpost } from '@/systems/resource-acquisition-system';

describe('#1125 freight replay', () => {
  function finishRound(state: GameState): GameState {
    const result = runCampaignRound(state, new EventBus());
    if (!result.ok) throw result.error;
    return result.state;
  }

  it('resumes a legacy replay without the generated city that blocked the ivory site', async () => {
    const name = 'freight-strait-b';
    const baseline = buildScenario(SCENARIOS[name]);
    const legacy = {
      ...baseline,
      turn: 11,
      cities: {
        ...baseline.cities,
        'city-3': {
          ...baseline.cities['strait-west'], id: 'city-3', name: 'Zanzibar', owner: 'mc-zanzibar',
          position: { q: 0, r: 8 }, ownedTiles: [], workedTiles: [],
        },
      },
    };
    const saved = saveManager.normalizeLoadedState(legacy);
    expect(saved.map.tiles['0,9'].owner).toBe('mc-zanzibar');
    const list = vi.spyOn(saveManager, 'listSaves').mockResolvedValue([{
      id: 'old-replay', name: 'Autosave Turn 11', civType: 'generic', turn: 11,
      kind: 'autosave', gameTitle: baseline.gameTitle, lastPlayed: '2026-11-21T12:00:00Z',
    }]);
    const load = vi.spyOn(saveManager, 'loadGame').mockResolvedValue(saved);
    try {
      const resumed = await resumeFreightReplay(name, baseline);
      expect(resumed.turn).toBe(11);
      expect(resumed.cities['city-3']).toBeUndefined();
      expect(resumed.map.tiles['0,9'].owner).toBeNull();
    } finally {
      load.mockRestore();
      list.mockRestore();
    }
  });

  it.each([
    { name: 'freight-strait-a', trip: 8, choice: 'Harbor' },
    { name: 'freight-strait-b', trip: 5, choice: 'Harbor' },
    { name: 'freight-strait-a', trip: 8, choice: 'passage' },
    { name: 'freight-strait-b', trip: 5, choice: 'passage' },
    { name: 'freight-strait-a', trip: 8, choice: 'defer' },
    { name: 'freight-strait-b', trip: 5, choice: 'defer' },
  ])('$name delivers coal through ordinary rounds ($choice)', ({ name, trip, choice }) => {
    const definition = SCENARIOS[name];
    expect(definition).toBeDefined();
    let state: GameState = saveManager.normalizeLoadedState(buildScenario(definition));
    expect(Object.keys(state.cities).sort()).toEqual(['strait-north', 'strait-supplier', 'strait-west']);
    const buyer = state.currentPlayer;
    const home = Object.values(state.cities).find(city => city.buildings.includes('factory'))!;
    const harbor = Object.values(state.cities).find(city => city.productionQueue[0] === 'harbor')!;
    const trader = Object.values(state.units).find(unit => unit.type === 'naval_trader' && hexKey(unit.position) === hexKey(home.position))!;
    const route = state.marketplace!.tradeRoutes.find(candidate => candidate.id === trader.committedToRouteId)!;
    const coal = resourceGoodId('coal');
    expect(home.owner).toBe(buyer);
    expect(state.civilizations[buyer].gold).toBe(80);
    expect(getRushBuyQuote(state, buyer, harbor.id)).toMatchObject({ cost: 45, available: true });
    const expedition = Object.values(state.units).find(unit => unit.owner === buyer && unit.type === 'expedition');
    expect(expedition?.position).toEqual({ q: 0, r: 7 });
    expect(getTradeRouteQuote(state, {
      originCityId: route.fromCityId, toCityId: route.toCityId, caravanUnitId: trader.id,
    })?.roundTripRounds).toBe(trip);
    const before = getCapitalComparison(state, buyer);
    expect(before).toMatchObject({ freeGold: 50, openRounds: 4, currentRounds: trip, factoryFueled: false });
    if (choice !== 'defer') {
      const offer = choice === 'Harbor' ? before!.harbor : before!.passage;
      expect(offer).toMatchObject({ choice, cost: 45 });
      const changed = { ...offer!, cost: 44 };
      expect(applyCapitalOffer(state, buyer, changed, new EventBus())).toMatchObject({ ok: false, reason: 'terms-changed' });
      const purchase = applyCapitalOffer(state, buyer, offer!, new EventBus());
      if (!purchase.ok) throw new Error(purchase.message);
      state = purchase.state;
      expect(state.civilizations[buyer].gold).toBe(35);
      expect(applyCapitalOffer(state, buyer, offer!, new EventBus())).toMatchObject({ ok: false, reason: 'terms-changed' });
      expect(getCapitalComparison(state, buyer)).toMatchObject({ freeGold: 5, passage: undefined, harbor: undefined });
    }

    const deliveryRound = choice === 'passage' ? 4 : trip;
    const firstLoad = choice === 'passage' ? 3 : 5;
    for (let elapsed = 1; elapsed <= deliveryRound; elapsed++) {
      state = finishRound(state);
      expect(state.gameOver).toBe(false);
      expect(getReserveBalance(state.materialReservesByCiv![buyer], coal).imported).toBe(elapsed < deliveryRound ? 0 : firstLoad);
      if (choice === 'passage') {
        expect(getCapitalComparison(state, buyer)?.harbor, `Harbor affordability after round ${state.turn}`).toBeUndefined();
      }
      if (elapsed === 1) {
        const movement = executeUnitMove(state, expedition!.id, { q: 0, r: 9 }, { actor: 'player', civId: buyer });
        if (!movement.ok) throw new Error(movement.reason);
        expect(canEstablishOutpost(movement.state, expedition!.id)).toBe(true);
        state = performEstablishOutpost(movement.state, expedition!.id);
      }
      if (elapsed <= 3) expect(getCivAvailableResources(state, buyer).has('ivory')).toBe(elapsed === 3);
    }
    expect(getCityFuelStatus(state, state.cities[home.id])).toContainEqual(expect.objectContaining({ powered: false }));
    state = finishRound(state);
    expect(getCityFuelStatus(state, state.cities[home.id])).toContainEqual(expect.objectContaining({ powered: true }));
  });

  it('withholds the passage forecast from an unsurveyed viewer and ignores a foreign stock change', () => {
    const state = buildScenario(SCENARIOS['freight-strait-a']);
    const viewer = state.currentPlayer;
    const before = getCapitalComparison(state, viewer);
    expect(before?.passage).toBeDefined();
    expect(getCapitalComparison(state, 'ai-1')).toBeUndefined();
    state.materialReservesByCiv!['ai-1'].balances[resourceGoodId('coal')].native = 0;
    expect(getCapitalComparison(state, viewer)).toEqual(before);
    for (const key of ['3,6', '4,6']) {
      delete state.civilizations[viewer].visibility.tiles[key];
      state.map.tiles[key].terrain = 'coast';
    }
    expect(getCapitalComparison(state, viewer)?.currentRounds).toBe(8);
    delete state.civilizations[viewer].visibility.tiles['4,5'];
    expect(getCapitalComparison(state, viewer)).toMatchObject({ passage: undefined, openRounds: undefined, passageKnown: false });
  });
});

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
      const normalized = saveManager.normalizeLoadedState(structuredClone(state));
      expect(() => saveManager.normalizeLoadedState(structuredClone(state))).not.toThrow();
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

  it('places a player paratrooper at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-paratrooper']).toMatchObject({ type: 'paratrooper', owner: 'player', health: 100 });
    expect(state.units['showcase-paratrooper-hurt']).toMatchObject({ type: 'paratrooper', owner: 'player', health: 30 });
  });

  it('places a player mechanized infantry at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-mechanized-infantry']).toMatchObject({ type: 'mechanized_infantry', owner: 'player', health: 100 });
    expect(state.units['showcase-mechanized-infantry-hurt']).toMatchObject({ type: 'mechanized_infantry', owner: 'player', health: 30 });
  });

  it('places a player swordsman at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-swordsman']).toMatchObject({ type: 'swordsman', owner: 'player', health: 100 });
    expect(state.units['showcase-swordsman-hurt']).toMatchObject({ type: 'swordsman', owner: 'player', health: 30 });
  });

  it('places a player warrior at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-warrior']).toMatchObject({ type: 'warrior', owner: 'player', health: 100 });
    expect(state.units['showcase-warrior-hurt']).toMatchObject({ type: 'warrior', owner: 'player', health: 30 });
  });

  it('places a player axeman at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-axeman']).toMatchObject({ type: 'axeman', owner: 'player', health: 100 });
    expect(state.units['showcase-axeman-hurt']).toMatchObject({ type: 'axeman', owner: 'player', health: 30 });
  });

  it('places a player pikeman at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-pikeman']).toMatchObject({ type: 'pikeman', owner: 'player', health: 100 });
    expect(state.units['showcase-pikeman-hurt']).toMatchObject({ type: 'pikeman', owner: 'player', health: 30 });
  });

  it('places a player musketeer at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-musketeer']).toMatchObject({ type: 'musketeer', owner: 'player', health: 100 });
    expect(state.units['showcase-musketeer-hurt']).toMatchObject({ type: 'musketeer', owner: 'player', health: 30 });
  });

  it('places a player crossbowman at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-crossbowman']).toMatchObject({ type: 'crossbowman', owner: 'player', health: 100 });
    expect(state.units['showcase-crossbowman-hurt']).toMatchObject({ type: 'crossbowman', owner: 'player', health: 30 });
  });

  it('places a player scout at full health and a wounded one so the strip e2e can find their roots', () => {
    const state = buildScenario(SCENARIOS['strip-units-showcase']);
    expect(state.units['showcase-scout']).toMatchObject({ type: 'scout', owner: 'player', health: 100 });
    expect(state.units['showcase-scout-hurt']).toMatchObject({ type: 'scout', owner: 'player', health: 30 });
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
