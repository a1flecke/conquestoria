import type { City, CityFaith, GameState, Religion, ReligionBoon } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { seededLcg } from './seeded-lcg';
import {
  NAME_CANDIDATES, NEUTRAL_NAME_CANDIDATES, CONVERSION_THRESHOLD,
  OWN_CITY_ACCRUAL, FOREIGN_ADJACENT_ACCRUAL, FOREIGN_ADJACENT_CAP,
  TRADE_ROUTE_ACCRUAL, FERVOR_MULTIPLIER, TITHES_CAP, OCCUPATION_ACCRUAL,
  CITY_CONVERSION_COOLDOWN_TURNS, PREACH_POINTS, PREACH_OCCUPIED_DOUBLE,
  MISSIONARY_ACTION_COOLDOWN_TURNS,
} from './religion-definitions';
import { getCapitalCityId } from './capital-system';
import { mapDistance } from './hex-utils';
import { hasDiscoveredCity } from './discovery-system';

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

// #592 MR5: reads one religion's bucket from the per-religion progress ledger (see
// CityFaith.conversionProgress doc comment in types.ts).
export function getCityConversionPoints(faith: CityFaith | undefined, religionId: string): number {
  return faith?.conversionProgress?.[religionId] ?? 0;
}

// Adds `delta` points to religionId's own bucket in cityFaith.conversionProgress,
// independent of any other religion's bucket. Returns the updated CityFaith and whether
// this delta pushed that bucket to/over CONVERSION_THRESHOLD (caller decides whether/how
// to apply the actual flip — this helper never mutates religionId itself).
export function applyCityConversionPoints(
  faith: CityFaith | undefined,
  religionId: string,
  delta: number,
): { cityFaith: CityFaith; converted: boolean } {
  const currentPoints = getCityConversionPoints(faith, religionId);
  const nextPoints = currentPoints + delta;
  const converted = nextPoints >= CONVERSION_THRESHOLD;
  const nextProgress = { ...(faith?.conversionProgress ?? {}), [religionId]: nextPoints };
  return {
    cityFaith: { ...(faith ?? { religionId }), conversionProgress: nextProgress },
    converted,
  };
}

// Passive faith spread + conversion (#591 MR4, restructured #592 MR5 for independent
// per-religion progress buckets — see CityFaith.conversionProgress doc comment in
// types.ts). Holy cities never accrue. Cities under an active conversionCooldownUntilTurn
// only accrue toward conversionCooldownExemptCivId's religion (or their current religion,
// if that religion belongs to the exempt civ) — rival religions' passive pressure is
// paused, not reset, during the cooldown window.
export function processReligionTurn(state: GameState, bus: EventBus): GameState {
  const cityFaithMap = state.cityFaith ?? {};
  let cityFaith = { ...cityFaithMap };
  let changed = false;

  for (const cityId of Object.keys(state.cities).sort()) {
    const faith = cityFaith[cityId];
    if (faith?.isHolyCity) continue;

    const pressure = getStrongestPressure(state, cityId);
    if (!pressure) continue;
    // Skip only a SETTLED follower of the strongest religion (no progress toward it —
    // it already fully converted). A city mid-conversion toward this same religion has
    // religionId set to the pending target from its first accrual turn (see below) but
    // must NOT be skipped here, or it would freeze at turn-1's point total forever.
    if (faith?.religionId === pressure.religionId && !getCityConversionPoints(faith, pressure.religionId)) continue;

    const cooldownActive = (faith?.conversionCooldownUntilTurn ?? 0) > state.turn;
    const exemptCivId = faith?.conversionCooldownExemptCivId;
    const pressureReligion = state.religions?.[pressure.religionId];
    const pressureIsExempt = !!exemptCivId && pressureReligion?.ownerCivId === exemptCivId;
    if (cooldownActive && !pressureIsExempt) continue; // rival religion's passive pressure is paused during cooldown

    const { cityFaith: updatedFaith, converted } = applyCityConversionPoints(faith, pressure.religionId, pressure.accrual);

    if (converted) {
      const fromReligionId = faith?.religionId;
      const cityOwner = state.cities[cityId]?.owner;
      cityFaith = {
        ...cityFaith,
        [cityId]: {
          religionId: pressure.religionId,
          conversionCooldownUntilTurn: state.turn + CITY_CONVERSION_COOLDOWN_TURNS,
          conversionCooldownExemptCivId: cityOwner,
        },
      };
      changed = true;
      bus.emit('religion:city-converted', { cityId, toReligionId: pressure.religionId, fromReligionId });
    } else {
      cityFaith = {
        ...cityFaith,
        [cityId]: { ...updatedFaith, religionId: faith?.religionId ?? pressure.religionId },
      };
      changed = true;
    }
  }

  return processOccupationAccrual(changed ? { ...state, cityFaith } : state, bus);
}

// #592 MR5: cities under occupation accrue toward the OCCUPYING civ's faith every turn,
// independent of geography/trade pressure — this is what makes missionary-zeal's doubled
// preach on occupied cities land on top of a baseline that's already moving. Stops the
// moment occupation ends (city.occupation cleared elsewhere when turnsRemaining hits 0).
function processOccupationAccrual(state: GameState, bus: EventBus): GameState {
  let cityFaith = { ...(state.cityFaith ?? {}) };
  let changed = false;

  for (const [cityId, city] of Object.entries(state.cities)) {
    if (!city.occupation) continue;
    const occupierReligion = Object.values(state.religions ?? {}).find(r => r.ownerCivId === city.owner);
    if (!occupierReligion) continue;
    const faith = cityFaith[cityId];
    if (faith?.isHolyCity) continue;

    const { cityFaith: updatedFaith, converted } = applyCityConversionPoints(faith, occupierReligion.id, OCCUPATION_ACCRUAL);
    if (converted) {
      const fromReligionId = faith?.religionId;
      cityFaith = {
        ...cityFaith,
        [cityId]: {
          religionId: occupierReligion.id,
          conversionCooldownUntilTurn: state.turn + CITY_CONVERSION_COOLDOWN_TURNS,
          conversionCooldownExemptCivId: city.owner,
        },
      };
      bus.emit('religion:city-converted', { cityId, toReligionId: occupierReligion.id, fromReligionId });
    } else {
      cityFaith = { ...cityFaith, [cityId]: { ...updatedFaith, religionId: faith?.religionId ?? occupierReligion.id } };
    }
    changed = true;
  }

  return changed ? { ...state, cityFaith } : state;
}

export type PreachFailureReason = 'not-missionary' | 'no-charges' | 'on-cooldown' | 'holy-city' | 'at-war' | 'undiscovered' | 'no-religion';

export type PreachResult =
  | { ok: true; state: GameState; converted: boolean; unitConsumed: boolean }
  | { ok: false; state: GameState; reason: PreachFailureReason };

// Returns whether `unit` (assumed to be a missionary belonging to a civ with a founded
// religion) could currently preach `cityId` — the same refusal conditions preach() itself
// checks, exposed read-only so UI eligibility (which city to show a Preach button for) can
// never drift from the actual gate. Does not check charges/cooldown on the unit itself,
// since callers that already know charges > 0 (e.g. the UI charge check) call this only
// for the target-city-side conditions; preach() re-checks unit-side conditions itself.
export function canPreachTarget(state: GameState, unit: { owner: string }, cityId: string): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  const faith = state.cityFaith?.[cityId];
  if (faith?.isHolyCity) return false;

  const owner = state.civilizations[unit.owner];
  if (!owner) return false;
  if ((owner.diplomacy.atWarWith ?? []).includes(city.owner)) return false;
  if (!hasDiscoveredCity(state, unit.owner, cityId)) return false;

  return Object.values(state.religions ?? {}).some(r => r.ownerCivId === unit.owner);
}

// #592 MR5: active conversion via missionary preach. Grants PREACH_POINTS toward the
// owner's own religion (doubled to PREACH_OCCUPIED_DOUBLE if the owner has completed
// missionary-zeal AND the target city is currently under that owner's occupation),
// consumes one charge, and puts the missionary on a personal cooldown — or consumes the
// unit outright if that was its last charge. A successful conversion also starts the
// city's anti-flip-flop cooldown (see CityFaith.conversionCooldownUntilTurn), exempting
// the city's own owner so a future re-preach back to their own faith is never blocked.
export function preach(state: GameState, unitId: string, cityId: string, bus: EventBus): PreachResult {
  const unit = state.units[unitId];
  const city = state.cities[cityId];
  if (!unit || unit.type !== 'missionary' || !city) {
    return { ok: false, state, reason: 'not-missionary' };
  }
  if ((unit.chargesRemaining ?? 0) <= 0) return { ok: false, state, reason: 'no-charges' };
  if ((unit.missionaryCooldownUntilTurn ?? 0) > state.turn) return { ok: false, state, reason: 'on-cooldown' };

  const faith = state.cityFaith?.[cityId];
  if (faith?.isHolyCity) return { ok: false, state, reason: 'holy-city' };

  const owner = state.civilizations[unit.owner];
  if (!owner) return { ok: false, state, reason: 'not-missionary' };

  if ((owner.diplomacy.atWarWith ?? []).includes(city.owner)) return { ok: false, state, reason: 'at-war' };
  if (!hasDiscoveredCity(state, unit.owner, cityId)) return { ok: false, state, reason: 'undiscovered' };

  const religion = Object.values(state.religions ?? {}).find(r => r.ownerCivId === unit.owner);
  if (!religion) return { ok: false, state, reason: 'no-religion' };

  const hasZeal = owner.techState.completed.includes('missionary-zeal');
  const isDoubled = hasZeal && !!city.occupation;
  const pointsGranted = isDoubled ? PREACH_OCCUPIED_DOUBLE : PREACH_POINTS;

  const { cityFaith: updatedFaith, converted } = applyCityConversionPoints(faith, religion.id, pointsGranted);

  let cityFaith = { ...(state.cityFaith ?? {}) };
  if (converted) {
    cityFaith = {
      ...cityFaith,
      [cityId]: {
        religionId: religion.id,
        conversionCooldownUntilTurn: state.turn + CITY_CONVERSION_COOLDOWN_TURNS,
        conversionCooldownExemptCivId: city.owner,
      },
    };
    bus.emit('religion:city-converted', { cityId, toReligionId: religion.id, fromReligionId: faith?.religionId });
  } else {
    cityFaith = { ...cityFaith, [cityId]: { ...updatedFaith, religionId: faith?.religionId ?? religion.id } };
  }

  const chargesRemaining = (unit.chargesRemaining ?? 0) - 1;
  const unitConsumed = chargesRemaining <= 0;

  let units = state.units;
  if (unitConsumed) {
    const { [unitId]: _removed, ...rest } = state.units;
    units = rest;
  } else {
    units = {
      ...state.units,
      [unitId]: { ...unit, chargesRemaining, missionaryCooldownUntilTurn: state.turn + MISSIONARY_ACTION_COOLDOWN_TURNS },
    };
  }

  let civilizations = state.civilizations;
  if (unitConsumed) {
    civilizations = {
      ...state.civilizations,
      [unit.owner]: { ...owner, units: owner.units.filter(id => id !== unitId) },
    };
  }

  bus.emit('religion:preached', { cityId, unitId, civId: unit.owner, points: pointsGranted, unitConsumed });

  return {
    ok: true,
    state: { ...state, cityFaith, units, civilizations },
    converted,
    unitConsumed,
  };
}
