/**
 * #1069 — equivalence tests for `computeResearchScoringBaseline` /
 * `getMarginalCivResearchGain`'s baseline-accelerated fast path against the original,
 * always-correct full recompute (the same function called with no baseline). See
 * docs/superpowers/specs/2026-09-15-issue-1069-ai-round-perf-design.md §5b for the cache-validity
 * proof this pins.
 */
import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCity, BUILDINGS } from '@/systems/city-system';
import * as resourceSystem from '@/systems/resource-system';
import { getNetworkCityYieldBonus } from '@/systems/network-infrastructure-plans';
import {
  computeResearchScoringBaseline,
  getMarginalCivResearchGain,
} from '@/systems/research-output-system';

const CIV = 'player';
const ORDINARY_BUILDING = 'library'; // techRequired: 'writing', no nationalProject flag
const NATIONAL_PROJECT_BUILDING = 'tribal_muster_ground'; // techRequired: 'stone-weapons', uniquePerEmpire

function multiCityState() {
  const state = createNewGame(CIV, 'issue-1069-research-baseline', 'small');
  const civ = state.civilizations[CIV]!;
  state.units = {};
  state.cities = {};
  civ.units = [];
  civ.cities = [];
  for (const tile of Object.values(state.map.tiles)) {
    tile.terrain = 'grassland';
    tile.owner = null;
  }
  civ.techState.completed = ['writing', 'stone-weapons'];

  const cityIds: string[] = [];
  const positions = [{ q: 0, r: 0 }, { q: 4, r: 0 }, { q: 0, r: 4 }];
  for (const [index, position] of positions.entries()) {
    const city = foundCity(CIV, position, state.map, state.idCounters);
    city.id = `city-${index + 1}`;
    state.cities[city.id] = city;
    civ.cities.push(city.id);
    cityIds.push(city.id);
  }
  return { state, civ, cityIds };
}

describe('#1069 -- research scoring baseline equivalence', () => {
  it('fast path (with baseline) matches the full recompute (without baseline) for every real building candidate', () => {
    const { state, civ } = multiCityState();
    const baseline = computeResearchScoringBaseline(state, CIV);
    expect(baseline.networkGovernanceBonusActive).toBe(false);

    for (const cityId of civ.cities) {
      for (const buildingId of Object.keys(BUILDINGS)) {
        const full = getMarginalCivResearchGain(state, CIV, cityId, buildingId);
        const fast = getMarginalCivResearchGain(state, CIV, cityId, buildingId, baseline);
        expect(fast, `city=${cityId} building=${buildingId}`).toBe(full);
      }
    }
  });

  it('falls back to a full per-city rescan (not the 1-city patch) for a unique national-project building candidate', () => {
    const { state, civ } = multiCityState();
    const baseline = computeResearchScoringBaseline(state, CIV);
    const cityId = civ.cities[0]!;

    const yieldSpy = vi.spyOn(resourceSystem, 'calculateCityYields');
    const fast = getMarginalCivResearchGain(state, CIV, cityId, NATIONAL_PROJECT_BUILDING, baseline);
    const fastCalls = yieldSpy.mock.calls.length;
    yieldSpy.mockRestore();

    const full = getMarginalCivResearchGain(state, CIV, cityId, NATIONAL_PROJECT_BUILDING);
    expect(fast).toBe(full);
    // "before" is free (served by the cached baseline) even here -- only "after" must fall back
    // to the full per-city rescan, because a unique national project can shift
    // `nationalProjectBonus`, a civ-level input feeding EVERY city's production/idleScienceBonus,
    // not just the modified one.
    expect(fastCalls).toBe(civ.cities.length);
  });

  it('the fast path skips the O(cities) rescan for an ordinary (non-national-project) building', () => {
    const { state, civ } = multiCityState();
    const baseline = computeResearchScoringBaseline(state, CIV);
    const cityId = civ.cities[0]!;

    const yieldSpy = vi.spyOn(resourceSystem, 'calculateCityYields');
    getMarginalCivResearchGain(state, CIV, cityId, ORDINARY_BUILDING, baseline);
    const fastCalls = yieldSpy.mock.calls.length;
    yieldSpy.mockRestore();

    // exactly one calculateCityYields call -- the modified city's "after" projection. "before"
    // costs zero calls (served entirely by the cached baseline.cityScience).
    expect(fastCalls).toBe(1);
  });

  it('the no-baseline call costs 2x the rescan (before AND after both full O(cities) scans)', () => {
    const { state, civ } = multiCityState();
    const cityId = civ.cities[0]!;

    const yieldSpy = vi.spyOn(resourceSystem, 'calculateCityYields');
    getMarginalCivResearchGain(state, CIV, cityId, ORDINARY_BUILDING);
    const calls = yieldSpy.mock.calls.length;
    yieldSpy.mockRestore();

    expect(calls).toBe(2 * civ.cities.length);
  });

  it('falls back to the full recompute when the civ has an active network-governance bonus', () => {
    const { state, civ } = multiCityState();
    civ.techState.completed.push('network-governance');
    const baseline = computeResearchScoringBaseline(state, CIV);
    expect(baseline.networkGovernanceBonusActive).toBe(true);
    const cityId = civ.cities[0]!;

    const fast = getMarginalCivResearchGain(state, CIV, cityId, ORDINARY_BUILDING, baseline);
    const full = getMarginalCivResearchGain(state, CIV, cityId, ORDINARY_BUILDING);
    expect(fast).toBe(full);
  });

  // Sol review finding: `getNetworkCityYieldBonus` (called per-city inside `projectOneCityScience`)
  // checks `hasLiveCitySource`, which reads a network-infrastructure plan's SOURCE city's
  // `.buildings` -- a DIFFERENT city than the one being scored when the plan is sourced from one
  // city and targets/links another. `research-mesh` is exactly this shape (sourced from a city
  // with `network_operations_center`/`data_center`, boosts a linked city's science 5-8%) and the
  // AI itself creates these plans (`ai-network-planning.ts`). Scoring the SOURCE building for the
  // source city must not silently miss the linked city's science change.
  it('positive control: an active city-sourced research-mesh plan genuinely changes a linked city\'s science once the source building exists', () => {
    // Isolated proof the underlying mechanism is real, not just theoretical -- same pattern as
    // the existing `getNetworkCityYieldBonus` coverage in network-infrastructure-plans.test.ts,
    // with a large synthetic base so the 5%-of-base bonus is visible regardless of this fixture's
    // small real yields.
    const { state, civ } = multiCityState();
    const [sourceCityId, linkedCityId] = civ.cities;
    state.autonomyByCiv![CIV].plans['network-plan-1'] = {
      id: 'network-plan-1', ownerCivId: CIV, definitionId: 'research-mesh',
      source: { kind: 'city', cityId: sourceCityId! },
      target: { kind: 'city', cityId: linkedCityId! },
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };
    const bonusBeforeSourceBuilding = getNetworkCityYieldBonus(state, linkedCityId!, { production: 0, science: 100 });
    const withSourceBuilding: typeof state = {
      ...state,
      cities: { ...state.cities, [sourceCityId!]: { ...state.cities[sourceCityId!]!, buildings: ['network_operations_center'] } },
    };
    const bonusAfterSourceBuilding = getNetworkCityYieldBonus(withSourceBuilding, linkedCityId!, { production: 0, science: 100 });
    expect(bonusBeforeSourceBuilding.science).toBe(0);
    expect(bonusAfterSourceBuilding.science).toBeGreaterThan(0);
  });

  // Sol review finding: `getNetworkCityYieldBonus` (called per-city inside `projectOneCityScience`)
  // checks `hasLiveCitySource`, which reads a network-infrastructure plan's SOURCE city's
  // `.buildings` -- a DIFFERENT city than the one being scored when the plan is sourced from one
  // city and targets/links another (proven live above). The AI itself creates these plans
  // (`ai-network-planning.ts`). Scoring the SOURCE building for the source city must not silently
  // miss the linked city's science change by patching only the source city's cached entry.
  it('falls back to the full recompute when an active city-sourced network plan could change a linked city\'s science', () => {
    const { state, civ } = multiCityState();
    const [sourceCityId, linkedCityId] = civ.cities;
    state.autonomyByCiv![CIV].plans['network-plan-1'] = {
      id: 'network-plan-1', ownerCivId: CIV, definitionId: 'research-mesh',
      source: { kind: 'city', cityId: sourceCityId! },
      target: { kind: 'city', cityId: linkedCityId! },
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };
    // research-mesh's bonus is 5% of the linked city's own RAW (pre-bonus) science, floored --
    // this minimal fixture's real science is too small for that to move by a whole point, which
    // would make the divergence this test guards against invisible regardless of whether the fix
    // is present. Force a large, uniform base science for every city (same value fed to both the
    // "before" full scan and the "after" 1-city patch) so a 5% swing is unmistakably >= 1.
    const yieldSpy = vi.spyOn(resourceSystem, 'calculateCityYields').mockReturnValue({
      food: 0, production: 0, gold: 0, science: 100,
    });
    const baseline = computeResearchScoringBaseline(state, CIV);
    expect(baseline.hasActiveCitySourcedNetworkPlan).toBe(true);

    const fast = getMarginalCivResearchGain(state, CIV, sourceCityId!, 'network_operations_center', baseline);
    const full = getMarginalCivResearchGain(state, CIV, sourceCityId!, 'network_operations_center');
    yieldSpy.mockRestore();
    expect(full, 'fixture sanity: the candidate building must actually move the linked city\'s science').toBeGreaterThan(0);
    expect(fast, 'fast path must match the full recompute, not silently miss the linked city').toBe(full);
  });
});
