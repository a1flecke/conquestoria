import type { City, GameState, Religion, ReligionBoon } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { seededLcg } from './seeded-lcg';
import {
  NAME_CANDIDATES, NEUTRAL_NAME_CANDIDATES, CONVERSION_THRESHOLD,
  OWN_CITY_ACCRUAL, FOREIGN_ADJACENT_ACCRUAL, FOREIGN_ADJACENT_CAP,
  TRADE_ROUTE_ACCRUAL, FERVOR_MULTIPLIER, TITHES_CAP,
} from './religion-definitions';
import { getCapitalCityId } from './capital-system';
import { mapDistance } from './hex-utils';

function pickReligionName(civType: string, seed: number): string {
  const pool = NAME_CANDIDATES[civType] ?? NEUTRAL_NAME_CANDIDATES;
  const rng = seededLcg(seed);
  return pool[Math.floor(rng() * pool.length)];
}

export function foundReligion(
  state: GameState,
  civId: string,
  buildingCityId: string,
  bus: EventBus,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  const alreadyHasReligion = Object.values(state.religions ?? {}).some(r => r.ownerCivId === civId);
  if (alreadyHasReligion) return state;

  const religionId = `religion-${civId}`;
  const seed = state.turn * 92821 + civId.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 17;
  const name = pickReligionName(civ.civType, seed);

  const religion: Religion = { id: religionId, name, ownerCivId: civId, foundedTurn: state.turn };
  const capitalId = getCapitalCityId(state, civId);

  const cityFaith = { ...(state.cityFaith ?? {}) };
  cityFaith[buildingCityId] = { religionId, isHolyCity: true };
  if (capitalId && capitalId !== buildingCityId) {
    cityFaith[capitalId] = { religionId };
  }

  const nextState: GameState = {
    ...state,
    religions: { ...(state.religions ?? {}), [religionId]: religion },
    cityFaith,
  };
  bus.emit('religion:founded', { religionId, civId, cityId: buildingCityId, name });
  return nextState;
}

export function chooseBoon(state: GameState, religionId: string, boon: ReligionBoon): GameState {
  const religion = state.religions?.[religionId];
  if (!religion) return state;
  return { ...state, religions: { ...state.religions, [religionId]: { ...religion, boon } } };
}

// #591 MR4: Tithes boon — +1 gold per FOREIGN city following the owner's own faith,
// capped at TITHES_CAP. Own-civ follower cities never count (foreign-only, per boon
// wording).
export function getReligionTithesGold(state: GameState, civId: string): number {
  const religion = Object.values(state.religions ?? {}).find(r => r.ownerCivId === civId && r.boon === 'tithes');
  if (!religion) return 0;
  const foreignFollowerCount = Object.entries(state.cityFaith ?? {})
    .filter(([cityId, faith]) => faith.religionId === religion.id && state.cities[cityId]?.owner !== civId)
    .length;
  return Math.min(TITHES_CAP, foreignFollowerCount);
}

// #591 MR4: deterministic AI boon choice — unhappy empire wants Serenity, an at-war
// empire wants Fervor (faster conversion pressure on captured/contested cities), else
// Tithes for the passive gold. Chosen immediately (no AI ever leaves its own religion
// pending).
export function chooseAiBoon(state: GameState, civId: string): ReligionBoon {
  const civ = state.civilizations[civId];
  const atWar = (civ?.diplomacy.atWarWith?.length ?? 0) > 0;
  const cities = (civ?.cities ?? []).map(id => state.cities[id]).filter((c): c is City => !!c);
  const avgUnrest = cities.length ? cities.reduce((sum, c) => sum + c.unrestLevel, 0) / cities.length : 0;
  if (avgUnrest >= 1) return 'serenity';
  if (atWar) return 'fervor';
  return 'tithes';
}

export interface ReligionPressureSource {
  religionId: string;
  accrual: number;
}

// Highest-accrual religion currently pressuring a city, or null if none. No war-gate —
// spread and Tithes both key off geography/faith only (user decision, #591 MR4).
export function getStrongestPressure(state: GameState, cityId: string): ReligionPressureSource | null {
  const city = state.cities[cityId];
  if (!city) return null;
  const cityFaithMap = state.cityFaith ?? {};
  const sources = new Map<string, number>(); // religionId -> accrual

  for (const religion of Object.values(state.religions ?? {})) {
    const followerCityIds = Object.entries(cityFaithMap)
      .filter(([, faith]) => faith.religionId === religion.id)
      .map(([id]) => id);
    if (followerCityIds.length === 0) continue;

    const fervorMultiplier = religion.boon === 'fervor' ? FERVOR_MULTIPLIER : 1;
    let accrual = 0;

    if (city.owner === religion.ownerCivId) {
      // Own-civ city: +OWN_CITY_ACCRUAL if adjacent to a follower city (any number of
      // adjacent sources counts once — this is "does my faith already touch this city",
      // not a per-source stack, unlike the foreign case below).
      const hasOwnSource = followerCityIds.some(fid => {
        if (fid === cityId) return false;
        const followerCity = state.cities[fid];
        return !!followerCity && mapDistance(state.map, city.position, followerCity.position) === 1;
      });
      if (hasOwnSource) accrual += OWN_CITY_ACCRUAL;
    } else {
      const adjacentCount = Math.min(FOREIGN_ADJACENT_CAP, followerCityIds.filter(fid => {
        const followerCity = state.cities[fid];
        return !!followerCity && mapDistance(state.map, city.position, followerCity.position) === 1;
      }).length);
      accrual += adjacentCount * FOREIGN_ADJACENT_ACCRUAL;
    }

    const hasTradeRouteSource = (state.marketplace?.tradeRoutes ?? []).some(route => {
      const otherId = route.fromCityId === cityId ? route.toCityId : route.toCityId === cityId ? route.fromCityId : null;
      return !!otherId && followerCityIds.includes(otherId);
    });
    if (hasTradeRouteSource) accrual += TRADE_ROUTE_ACCRUAL;

    if (accrual > 0) sources.set(religion.id, Math.round(accrual * fervorMultiplier));
  }

  if (sources.size === 0) return null;
  const sorted = [...sources.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { religionId: sorted[0][0], accrual: sorted[0][1] };
}

// Passive faith spread + conversion (#591 MR4). Holy cities never accrue. A city tracks
// progress toward exactly one target religion at a time (the current strongest); if the
// strongest religion changes to a DIFFERENT one, progress resets for the new target —
// "weaker records stall but are not erased" describes OTHER cities' independent
// progress, not a multi-target ledger inside a single city (the CityFaith type only
// ever holds one conversionProgress record).
export function processReligionTurn(state: GameState, bus: EventBus): GameState {
  const cityFaithMap = state.cityFaith ?? {};
  let cityFaith = { ...cityFaithMap };
  let changed = false;

  for (const cityId of Object.keys(state.cities).sort()) {
    const faith = cityFaith[cityId];
    if (faith?.isHolyCity) continue;

    const pressure = getStrongestPressure(state, cityId);
    if (!pressure) continue;
    if (faith?.religionId === pressure.religionId) continue; // already follows the strongest religion

    const existingProgress = faith?.conversionProgress;
    const carriedPoints = existingProgress?.toReligionId === pressure.religionId ? existingProgress.points : 0;
    const nextPoints = carriedPoints + pressure.accrual;

    if (nextPoints >= CONVERSION_THRESHOLD) {
      const fromReligionId = faith?.religionId;
      cityFaith = { ...cityFaith, [cityId]: { religionId: pressure.religionId } };
      changed = true;
      bus.emit('religion:city-converted', { cityId, toReligionId: pressure.religionId, fromReligionId });
    } else {
      cityFaith = {
        ...cityFaith,
        [cityId]: {
          ...(faith ?? {}),
          religionId: faith?.religionId ?? pressure.religionId,
          conversionProgress: { toReligionId: pressure.religionId, points: nextPoints },
        },
      };
      changed = true;
    }
  }

  return changed ? { ...state, cityFaith } : state;
}
