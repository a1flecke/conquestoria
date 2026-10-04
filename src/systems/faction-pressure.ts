// src/systems/faction-pressure.ts
// #1246: the unrest pressure model — one row list that both computeUnrestPressure (AI/turn processing)
// and the city-panel breakdown build from, plus contagion and building happiness. Pure queries: it
// reads the relief table but never imports the commands or the turn orchestration.
import type { GameState, City } from '../core/types';
import { hexDistance } from './hex-utils';
import { getEconomyStatusForCiv } from './economy-system';
import { getCapitalCity } from './capital-system';
import { getChallengeProfileForCiv } from '../core/opponent-challenge';
import { resolveCivilizationEra } from './tech-definitions';
import { BUILDINGS } from './city-system';
import { getForeignFaithPressure } from './religion-loyalty-system';
import { majorCivWarOpponentIds } from '../core/owner-kind';
import { GOVERNANCE_POLICY_DEFINITIONS } from './governance-policy-definitions';
import { GOVERNOR_UNREST_RELIEF } from './governor-system';
import { getUnrestReliefRows } from './faction-relief';
import {
  CONQUEST_UNREST_DURATION,
  MAX_PRESSURE_DISTANCE,
  MAX_PRESSURE_EMPIRE,
  OVEREXTENSION_FREE_CITIES,
  canGarrisonCity,
  createUnrestEvaluationContext,
  type UnrestEvaluationContext,
  type UnrestPressureRow,
} from './faction-unrest-model';

// Pressure caps per category
const MAX_PRESSURE_WAR = 24;
const MAX_PRESSURE_ECONOMY = 20;

// Uprising contagion (MR4, issue #354): a same-owner city in open revolt radiates
// unrest pressure to nearby cities. Garrisoning or concession immunity blocks the
// *receiving* city from being affected entirely (see getContagionSpread).
export const CONTAGION_GROUP_RANGE = 3;
const CONTAGION_PRESSURE_PER_NEIGHBOR = 8;
const MAX_PRESSURE_CONTAGION = 16;

// --- Pressure computation ---

// Single source of truth for unrest pressure (#552): both computeUnrestPressure
// (consumed by AI/turn processing) and the city panel breakdown UI build from
// this row list, so they can never drift apart.
export function getUnrestPressureBreakdown(
  cityId: string,
  state: GameState,
  ownerHappiness = 0,
  context: UnrestEvaluationContext = createUnrestEvaluationContext(),
): UnrestPressureRow[] {
  const city = state.cities[cityId];
  if (!city) return [];
  const owner = city.owner;
  const civ = state.civilizations[owner];
  if (!civ) return [];

  const rows: UnrestPressureRow[] = [];

  // Empire overextension: each city over OVEREXTENSION_FREE_CITIES adds 3 pressure
  const cityCount = civ.cities.length;
  const overextension = Math.min(MAX_PRESSURE_EMPIRE, Math.max(0, (cityCount - OVEREXTENSION_FREE_CITIES) * 3));
  if (overextension > 0) rows.push({ label: 'Empire overextension', amount: overextension });

  const capital = getCapitalCity(state, owner);
  if (capital && capital.id !== cityId) {
    const dist = hexDistance(city.position, capital.position);
    const distancePressure = Math.min(MAX_PRESSURE_DISTANCE, Math.max(0, (dist - 5) * 2));
    if (distancePressure > 0) rows.push({ label: 'Distance from capital', amount: distancePressure });
  }

  // Recent conquest — constitutional-law (#524 MR2) halves this row's amount.
  if (city.conquestTurn !== undefined) {
    const turnsSince = state.turn - city.conquestTurn;
    if (turnsSince < CONQUEST_UNREST_DURATION) {
      const hasConstitutionalLaw = civ.techState.completed.includes('constitutional-law');
      rows.push({ label: 'Recent conquest', amount: hasConstitutionalLaw ? 13 : 25 });
    }
  }

  // War weariness — major-civ wars only. Minor-civ (city-state) war state also
  // rides atWarWith, but "war weariness" is an imperial concept (#1041).
  const atWarCount = majorCivWarOpponentIds(civ.diplomacy.atWarWith).length;
  const warPressure = Math.min(MAX_PRESSURE_WAR, atWarCount * 8);
  if (warPressure > 0) rows.push({ label: 'War weariness', amount: warPressure });

  // Spy unrest bonus
  if (city.spyUnrestBonus > 0) rows.push({ label: 'Enemy espionage', amount: city.spyUnrestBonus });

  if (resolveCivilizationEra(civ.techState.completed) >= 3) {
    const economy = getEconomyStatusForCiv(state, owner);
    if (economy.strainLevel === 'critical') {
      const economyPressure = Math.min(MAX_PRESSURE_ECONOMY, 12 + economy.unpaidMaintenance * 2);
      rows.push({ label: 'Economic strain', amount: economyPressure });
    }
  }

  if (ownerHappiness > 0) rows.push({ label: 'Luxury resources', amount: -ownerHappiness * 2 });

  const buildingHappiness = getCityHappinessFromBuildings(city);
  if (buildingHappiness > 0) rows.push({ label: 'Happiness buildings', amount: -buildingHappiness * 2 });

  // #591 MR4: Serenity boon — +1 happiness in cities following the owner's OWN faith.
  const cityFaith = state.cityFaith?.[cityId];
  if (cityFaith) {
    const religion = state.religions?.[cityFaith.religionId];
    if (religion && religion.ownerCivId === owner && religion.boon === 'serenity') {
      rows.push({ label: 'Religious serenity', amount: -2 });
    }
  }

  const contagion = getContagionSpread(cityId, state).pressure;
  if (contagion > 0) rows.push({ label: 'Uprising contagion', amount: contagion });

  // #593 MR6: human cities never enter the loyalty-flip track (see
  // isLoyaltyTrackEligible), but sustained foreign-faith dominance still costs them --
  // a flat +2 unrest pressure row instead of a literal defection risk.
  if (civ.isHuman && getForeignFaithPressure(state, cityId)) {
    rows.push({ label: 'Foreign faith pressure', amount: 2 });
  }

  // #987: governance policy rows. Independent of the #919/#927 ladder above —
  // a flat, empire-wide, attributable pressure delta per active policy, the
  // same row-model convention as 'Luxury resources'/'Religious serenity'.
  // Table-driven — see GOVERNANCE_POLICY_DEFINITIONS.
  for (const policy of GOVERNANCE_POLICY_DEFINITIONS) {
    if (civ.governancePolicies?.[policy.id] === true) {
      rows.push({ label: policy.pressureRowLabel, amount: policy.pressureAmount });
    }
  }

  // #928: a governor assigned to this specific city — a flat, attributable
  // relief row, independent of the #927 ladder's own rows/formulas.
  if (civ.governorAssignments?.[cityId] === true) {
    rows.push({ label: 'Governor', amount: -GOVERNOR_UNREST_RELIEF });
  }

  // #919 MR2: administration-ladder relief rows (Courthouse today) subtract from the
  // positive rows built above. Table-driven — see UNREST_RELIEF_SOURCES.
  return [...rows, ...getUnrestReliefRows(city, state, rows, context)];
}

export function computeUnrestPressure(cityId: string, state: GameState, ownerHappiness = 0, context: UnrestEvaluationContext = createUnrestEvaluationContext()): number {
  const rows = getUnrestPressureBreakdown(cityId, state, ownerHappiness, context);
  const sum = rows.reduce((total, row) => total + row.amount, 0);
  return Math.min(100, Math.max(0, sum));
}

// Uprising contagion (MR4): a same-owner city at unrestLevel 2 (revolt) within
// CONTAGION_GROUP_RANGE hexes radiates pressure to this city, scaled by the
// *owner's* per-civ challenge profile (resolveChallengeForCiv already resolves AI
// owners to the game-wide challenge). Skipped entirely — not just reduced — when
// this city is garrisoned or under concession immunity, matching the spec's
// "immune to incoming spread" contract.
export function getContagionSpread(
  cityId: string,
  state: GameState,
): { pressure: number; nearestCityId: string | null } {
  const city = state.cities[cityId];
  if (!city) return { pressure: 0, nearestCityId: null };
  if (canGarrisonCity(cityId, state)) return { pressure: 0, nearestCityId: null };
  if ((city.concessionImmunityUntilTurn ?? 0) > state.turn) return { pressure: 0, nearestCityId: null };

  const profile = getChallengeProfileForCiv(state, city.owner);
  let total = 0;
  let nearestCityId: string | null = null;
  let nearestDistance = Infinity;
  for (const [otherId, other] of Object.entries(state.cities)) {
    if (otherId === cityId || other.owner !== city.owner || other.unrestLevel !== 2) continue;
    const distance = hexDistance(city.position, other.position);
    if (distance > CONTAGION_GROUP_RANGE) continue;
    total += CONTAGION_PRESSURE_PER_NEIGHBOR * profile.crisisSeverityMultiplier;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCityId = otherId;
    }
  }
  return { pressure: Math.min(MAX_PRESSURE_CONTAGION, total), nearestCityId };
}

// Building happiness (#552): the "build happiness improvements" advice in
// notification-routing.ts is only true because of this — see the four
// buildings with a `happiness` field in city-system.ts. Per-city, unlike
// luxury-resource happiness which is empire-wide.
export function getCityHappinessFromBuildings(city: City): number {
  let total = 0;
  for (const id of city.buildings) {
    total += BUILDINGS[id]?.happiness ?? 0;
  }
  return total;
}
