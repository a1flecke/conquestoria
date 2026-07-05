import type { GameState, ResourceYield } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';

export function getNationalProjectMultiplier(currentEra: number, eraBuilt: number): 0 | 0.5 | 1 {
  const delta = currentEra - eraBuilt;
  if (delta >= 3) return 0;
  if (delta === 2) return 0.5;
  return 1;
}

export function getReservedNationalProjectKeys(
  state: GameState,
  civId: string,
): Set<string> {
  const keys = new Set(
    Object.keys(state.builtNationalProjects ?? {})
      .filter(key => key.startsWith(`${civId}:`)),
  );
  const civ = state.civilizations[civId];
  for (const cityId of civ?.cities ?? []) {
    const city = state.cities[cityId];
    for (const itemId of city?.productionQueue ?? []) {
      const building = BUILDINGS[itemId];
      if (building?.nationalProject && building.uniquePerEmpire) {
        keys.add(`${civId}:${itemId}`);
      }
    }
  }
  return keys;
}

export function getActiveNationalProjectsForCiv(
  state: GameState,
  civId: string,
): Array<{ id: string; fadeMultiplier: number }> {
  const result: Array<{ id: string; fadeMultiplier: number }> = [];
  for (const [key, record] of Object.entries(state.builtNationalProjects ?? {})) {
    if (record.civId !== civId) continue;
    const fadeMultiplier = getNationalProjectMultiplier(state.era, record.eraBuilt);
    if (fadeMultiplier === 0) continue;
    const buildingId = key.split(':').slice(1).join(':');
    result.push({ id: buildingId, fadeMultiplier });
  }
  return result;
}

function addYield(acc: Partial<ResourceYield>, delta: Partial<ResourceYield>): Partial<ResourceYield> {
  return {
    food: (acc.food ?? 0) + (delta.food ?? 0),
    production: (acc.production ?? 0) + (delta.production ?? 0),
    gold: (acc.gold ?? 0) + (delta.gold ?? 0),
    science: (acc.science ?? 0) + (delta.science ?? 0),
  };
}

function scaleYield(y: Partial<ResourceYield>, multiplier: number): Partial<ResourceYield> {
  const result: Partial<ResourceYield> = {};
  for (const [k, v] of Object.entries(y) as [keyof ResourceYield, number][]) {
    result[k] = Math.round((v ?? 0) * multiplier);
  }
  return result;
}

// Per-city-scaling allowlist — see .claude/rules/game-balance.md
function computePerCityGold(buildingId: string, state: GameState, civId: string): number | null {
  if (buildingId === 'grand_bazaar') {
    const cityCount = Object.values(state.cities).filter(c => c.owner === civId).length;
    return cityCount; // +1 gold per city
  }
  if (buildingId === 'colonial_administration') {
    const cityCount = Object.values(state.cities).filter(c => c.owner === civId).length;
    return Math.max(0, cityCount - 4) * 2; // +2 gold per city beyond 4th
  }
  return null;
}

export function getNationalProjectCivYieldBonus(state: GameState, civId: string): Partial<ResourceYield> {
  let totals: Partial<ResourceYield> = {};
  for (const [key, record] of Object.entries(state.builtNationalProjects ?? {})) {
    if (record.civId !== civId) continue;
    const buildingId = key.split(':').slice(1).join(':');
    const multiplier = getNationalProjectMultiplier(state.era, record.eraBuilt);
    if (multiplier === 0) continue;

    // Per-city allowlist checked first — doesn't require a building lookup
    const perCityGold = computePerCityGold(buildingId, state, civId);
    if (perCityGold !== null) {
      totals = addYield(totals, scaleYield({ gold: perCityGold }, multiplier));
      continue;
    }

    const building = BUILDINGS[buildingId];
    if (!building) continue;
    if (building.civYieldBonus) {
      totals = addYield(totals, scaleYield(building.civYieldBonus, multiplier));
    }
  }
  // Remove zero-value keys to keep the return clean
  return Object.fromEntries(
    Object.entries(totals).filter(([, v]) => (v as number) !== 0),
  ) as Partial<ResourceYield>;
}

export interface ExpiredNationalProject {
  civId: string;
  cityId: string;
  buildingId: string;
}

export function expireNationalProjects(
  state: GameState,
  newEra: number,
): { state: GameState; expired: ExpiredNationalProject[] } {
  const toExpire: ExpiredNationalProject[] = [];
  for (const [key, record] of Object.entries(state.builtNationalProjects ?? {})) {
    if (newEra - record.eraBuilt >= 3) {
      const buildingId = key.split(':').slice(1).join(':');
      toExpire.push({ civId: record.civId, cityId: record.cityId, buildingId });
    }
  }
  if (toExpire.length === 0) return { state, expired: [] };

  const newBuiltNP = { ...(state.builtNationalProjects ?? {}) };
  let newCities = { ...state.cities };

  for (const item of toExpire) {
    delete newBuiltNP[`${item.civId}:${item.buildingId}`];
    const city = newCities[item.cityId];
    if (city) {
      newCities = {
        ...newCities,
        [item.cityId]: {
          ...city,
          buildings: city.buildings.filter((b: string) => b !== item.buildingId),
        },
      };
    }
  }

  return {
    state: { ...state, builtNationalProjects: newBuiltNP, cities: newCities },
    expired: toExpire,
  };
}
