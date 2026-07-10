import type { ActiveCrisis, City, CrisisOutcome, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getChallengeProfileForCiv, resolveChallengeForCiv } from '@/core/opponent-challenge';
import { computeThreatScore, deriveActiveIndependentThreatIds } from './threat-pressure-system';
import { CRISIS_FLAVORS, getCrisisFlavor } from './crisis-flavor-definitions';
import { seededLcg, weightedPick } from './seeded-lcg';
import { hexKey, hexDistance, hexesInRange } from './hex-utils';
import { getCityAppeaseCost } from './faction-system';

export const CRISIS_PRESSURE_FLOOR = 2.0;
export const EXTERNAL_THREAT_RECENCY_TURNS = 5;
export const CONTAGION_GROUP_RANGE = 3;

export function countUnrestGroups(state: GameState, civId: string): number {
  const cities = (state.civilizations[civId]?.cities ?? [])
    .map(id => state.cities[id])
    .filter((c): c is City => !!c && c.unrestLevel >= 1);
  const groups: City[][] = [];
  for (const city of cities) {
    const near = groups.filter(g =>
      g.some(m => hexDistance(m.position, city.position) <= CONTAGION_GROUP_RANGE));
    if (near.length === 0) { groups.push([city]); continue; }
    const merged = near.flat();
    merged.push(city);
    for (const g of near) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  return groups.length;
}

export function countActiveCrisesForCiv(state: GameState, civId: string): number {
  const scheduled = Object.values(state.activeCrises ?? {}).filter(c => c.targetCivId === civId).length;
  return scheduled + countUnrestGroups(state, civId);
}

export function processCrisisSchedulerForHumans(state: GameState, bus: EventBus): GameState {
  let next = state;
  const humanIds = Object.values(state.civilizations)
    .filter(c => c.isHuman && !c.isEliminated).map(c => c.id).sort();
  for (const civId of humanIds) next = maybeStartCrisis(next, civId, bus);
  return next;
}

function maybeStartCrisis(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.cities.length === 0) return state;
  const profile = getChallengeProfileForCiv(state, civId);
  if (state.era <= profile.crisisGraceMaxEra) return state;
  if (state.turn < profile.crisisGraceMinTurns) return state;
  if (civ.lastCrisisOnsetTurn !== undefined &&
      state.turn - civ.lastCrisisOnsetTurn < profile.crisisCooldownTurns) return state;
  if (countActiveCrisesForCiv(state, civId) >= profile.maxIndependentCrisesPerHuman) return state;
  if (deriveActiveIndependentThreatIds(state, civId).length > 0) return state;
  const ledger = state.opponentAI?.pressureByHuman?.[civId];
  if (ledger?.lastResolvedThreatTurn !== undefined && ledger.lastResolvedThreatTurn !== null &&
      state.turn - ledger.lastResolvedThreatTurn < EXTERNAL_THREAT_RECENCY_TURNS) return state;

  const landmassIds = [...new Set(civ.cities.flatMap(cid => {
    const c = state.cities[cid];
    const rk = c ? state.map.tiles[hexKey(c.position)]?.regionKey : undefined;
    return rk ? [rk] : [];
  }))].sort();
  const maxScore = landmassIds.reduce((m, l) => Math.max(m, computeThreatScore(state, civId, l)), 0);
  if (maxScore < CRISIS_PRESSURE_FLOOR) return state;

  const rng = seededLcg(state.turn * 7919 + civId.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 31);
  const eligible = CRISIS_FLAVORS.filter(f =>
    state.era >= f.eraBand[0] && state.era <= f.eraBand[1] &&
    civ.cities.some(cid => { const c = state.cities[cid]; return !!c && f.geographyPredicate(state, c); }));
  if (eligible.length === 0) return state;
  const history = civ.recentCrisisHistory ?? [];
  const flavor = weightedPick(eligible, eligible.map(f => history.includes(f.id) ? 0.25 : 1.0), rng);
  const targets = civ.cities.map(cid => state.cities[cid])
    .filter((c): c is City => !!c && flavor.geographyPredicate(state, c));
  const target = weightedPick(targets, targets.map(c => Math.max(1, c.population)), rng);

  const crisisId = `crisis-${state.turn}-${civId}`;
  const crisis: ActiveCrisis = {
    id: crisisId, flavorId: flavor.id, archetype: flavor.archetype, targetCivId: civId,
    cityIds: [target.id], tileKeys: [], startedTurn: state.turn, stage: 'active', turnsInStage: 0,
  };
  const nextState: GameState = {
    ...state,
    activeCrises: { ...(state.activeCrises ?? {}), [crisisId]: crisis },
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        lastCrisisOnsetTurn: state.turn,
        recentCrisisHistory: [...history, flavor.id].slice(-4),
      },
    },
  };
  bus.emit('crisis:started', { crisisId, flavorId: flavor.id, civId, cityIds: [target.id] });
  return nextState;
}

// ── Outbreak resolver ────────────────────────────────────────────────────────

// Single source of truth for the per-crisis yield multiplier — shared with
// city-panel.ts's display so the shown percentage always matches the applied
// effect, including the 0.25 floor on quarantined cities.
export function getOutbreakSeverityMultiplier(
  severity: { yieldPenalty: number },
  quarantined: boolean,
): number {
  return quarantined
    ? Math.max(0.25, 1 - 2 * severity.yieldPenalty)
    : 1 - severity.yieldPenalty;
}

export function getCrisisYieldMultiplier(state: GameState, cityId: string): number {
  let multiplier = 1;
  for (const crisis of Object.values(state.activeCrises ?? {})) {
    if (crisis.archetype !== 'outbreak' || !crisis.cityIds.includes(cityId)) continue;
    const flavor = getCrisisFlavor(crisis.flavorId);
    if (!flavor) continue;
    const severity = flavor.severityByChallenge[resolveChallengeForCiv(state, crisis.targetCivId)];
    multiplier *= getOutbreakSeverityMultiplier(severity, crisis.quarantinedCityIds?.includes(cityId) ?? false);
  }
  return multiplier;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function tickOutbreakCrisis(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis | null; state: GameState } {
  const flavor = getCrisisFlavor(crisis.flavorId);
  if (!flavor) return { crisis: null, state };

  let working: ActiveCrisis = { ...crisis, turnsInStage: crisis.turnsInStage + 1 };
  let nextState = state;
  const severity = flavor.severityByChallenge[resolveChallengeForCiv(state, crisis.targetCivId)];

  // Remedy completion
  if (working.remedyCompletionByCity) {
    const remaining: Record<string, number> = {};
    let cityIds = working.cityIds;
    let quarantinedCityIds = working.quarantinedCityIds;
    for (const [cityId, completionTurn] of Object.entries(working.remedyCompletionByCity)) {
      if (state.turn >= completionTurn) {
        cityIds = cityIds.filter(id => id !== cityId);
        quarantinedCityIds = quarantinedCityIds?.filter(id => id !== cityId);
      } else {
        remaining[cityId] = completionTurn;
      }
    }
    working = { ...working, cityIds, quarantinedCityIds, remedyCompletionByCity: remaining };
  }

  if (working.cityIds.length === 0) {
    bus.emit('crisis:resolved', {
      crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'contained',
    });
    return { crisis: null, state: nextState };
  }

  // Explorer auto-expiry
  if (severity.autoExpireTurns !== null && working.turnsInStage >= severity.autoExpireTurns) {
    bus.emit('crisis:resolved', {
      crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'expired',
    });
    return { crisis: null, state: nextState };
  }

  // Veteran pop loss
  if (severity.popLossEveryNTurnsIgnored !== null &&
      working.turnsInStage % severity.popLossEveryNTurnsIgnored === 0) {
    const cities = { ...nextState.cities };
    for (const cityId of working.cityIds) {
      if (working.quarantinedCityIds?.includes(cityId)) continue;
      if (working.remedyCompletionByCity?.[cityId] !== undefined) continue;
      const city = cities[cityId];
      if (!city) continue;
      cities[cityId] = { ...city, population: Math.max(1, city.population - 1) };
    }
    nextState = { ...nextState, cities };
  }

  // Spread
  const owner = working.targetCivId;
  for (const cityId of [...working.cityIds]) {
    if (working.quarantinedCityIds?.includes(cityId)) continue;
    const city = nextState.cities[cityId];
    if (!city) continue;
    const rng = seededLcg(nextState.turn * 104729 + hashString(working.id + cityId));
    const boost = flavor.spreadBoostPredicate?.(nextState, city) ? 0.15 : 0;
    if (rng() >= 0.20 + boost) continue;
    const candidates = Object.values(nextState.cities)
      .filter(c => c.owner === owner && !working.cityIds.includes(c.id));
    if (candidates.length === 0) continue;
    const target = candidates.reduce((closest, c) =>
      hexDistance(c.position, city.position) < hexDistance(closest.position, city.position) ? c : closest);
    working = { ...working, cityIds: [...working.cityIds, target.id] };
    bus.emit('crisis:spread', { crisisId: working.id, fromCityId: cityId, toCityId: target.id });
  }

  return { crisis: working, state: nextState };
}

const CATASTROPHE_RECOVERY_WINDOW_TURNS = 5;

function applyCatastropheShock(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis; state: GameState } {
  const flavor = getCrisisFlavor(crisis.flavorId);
  const params = flavor?.catastrophe;
  const targetCity = state.cities[crisis.cityIds[0]];
  if (!flavor || !params || !targetCity) return { crisis, state };

  const owner = crisis.targetCivId;
  const epicenterCandidates = hexesInRange(targetCity.position, params.blastRadius)
    .filter(coord => state.map.tiles[hexKey(coord)]?.owner === owner);
  if (epicenterCandidates.length === 0) return { crisis: { ...crisis, stage: 'recovery' }, state };

  const rng = seededLcg(state.turn * 65599 + hashString(crisis.id));
  const epicenter = epicenterCandidates[Math.floor(rng() * epicenterCandidates.length)];
  const epicenterKey = hexKey(epicenter);

  const devastationTurns = params.devastationTurnsByChallenge[resolveChallengeForCiv(state, owner)];
  const devastatedUntilTurn = state.turn + devastationTurns;
  const affectedKeys = hexesInRange(epicenter, params.blastRadius)
    .map(hexKey)
    .filter(key => state.map.tiles[key]?.owner === owner);

  const isVeteran = resolveChallengeForCiv(state, owner) === 'veteran';
  const destroysImprovement = params.destroysEpicenterImprovement && isVeteran && state.era >= 3;

  const tiles = { ...state.map.tiles };
  for (const key of affectedKeys) {
    const tile = tiles[key];
    tiles[key] = {
      ...tile,
      devastatedUntilTurn,
      ...(destroysImprovement && key === epicenterKey ? { improvement: 'none' as const } : {}),
    };
  }

  const nextState: GameState = { ...state, map: { ...state.map, tiles } };
  const updated: ActiveCrisis = { ...crisis, stage: 'recovery', tileKeys: affectedKeys };
  bus.emit('crisis:escalated', { crisisId: crisis.id, stage: 'recovery' });
  return { crisis: updated, state: nextState };
}

function tickCatastropheCrisis(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis | null; state: GameState } {
  const flavor = getCrisisFlavor(crisis.flavorId);
  if (!flavor?.catastrophe) return { crisis: null, state };

  let working: ActiveCrisis = { ...crisis, turnsInStage: crisis.turnsInStage + 1 };
  let nextState = state;

  if (working.stage === 'active') {
    const shocked = applyCatastropheShock(nextState, working, bus);
    working = shocked.crisis;
    nextState = shocked.state;
    return { crisis: working, state: nextState };
  }

  const tiles = working.tileKeys.map(key => nextState.map.tiles[key]).filter((t): t is NonNullable<typeof t> => !!t);
  const stillDevastated = tiles.some(t => t.devastatedUntilTurn !== undefined && t.devastatedUntilTurn > nextState.turn);
  if (stillDevastated) return { crisis: working, state: nextState };

  // Every tile has cleared, either by active restoration (devastatedUntilTurn cleared to
  // undefined before its natural expiry) or by the timer simply passing. Only the former,
  // completed within the recovery window, earns the resilience bonus.
  const allActivelyRestored = tiles.every(t => t.devastatedUntilTurn === undefined);
  const withinWindow = nextState.turn <= working.startedTurn + CATASTROPHE_RECOVERY_WINDOW_TURNS;
  const challenge = resolveChallengeForCiv(nextState, working.targetCivId);

  if (allActivelyRestored && withinWindow) {
    const cities = { ...nextState.cities };
    for (const cityId of working.cityIds) {
      const city = cities[cityId];
      if (city) cities[cityId] = { ...city, resilienceBonusUntilTurn: nextState.turn + CATASTROPHE_RECOVERY_WINDOW_TURNS };
    }
    nextState = { ...nextState, cities };
    bus.emit('crisis:resolved', { crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'recovered' });
    return { crisis: null, state: nextState };
  }

  const outcome = challenge === 'explorer' ? 'recovered' : 'expired';
  bus.emit('crisis:resolved', { crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome });
  return { crisis: null, state: nextState };
}

export function processCrisisTurn(state: GameState, bus: EventBus): GameState {
  let nextState = state;
  const crisisIds = Object.keys(state.activeCrises ?? {}).sort();
  for (const crisisId of crisisIds) {
    const crisis = nextState.activeCrises?.[crisisId];
    if (!crisis) continue;
    const { crisis: updated, state: tickedState } = crisis.archetype === 'outbreak'
      ? tickOutbreakCrisis(nextState, crisis, bus)
      : crisis.archetype === 'catastrophe'
        ? tickCatastropheCrisis(nextState, crisis, bus)
        : { crisis, state: nextState };
    if (updated) {
      nextState = { ...tickedState, activeCrises: { ...(tickedState.activeCrises ?? {}), [crisisId]: updated } };
    } else {
      const { [crisisId]: _removed, ...rest } = tickedState.activeCrises ?? {};
      nextState = { ...tickedState, activeCrises: rest };
    }
  }
  return nextState;
}

export function applyQuarantine(
  state: GameState,
  crisisId: string,
  cityId: string,
): { success: boolean; state: GameState; message: string } {
  const crisis = state.activeCrises?.[crisisId];
  if (!crisis) return { success: false, state, message: 'No such crisis.' };
  if (crisis.quarantinedCityIds?.includes(cityId)) {
    return { success: false, state, message: 'Already quarantined.' };
  }
  const updated: ActiveCrisis = {
    ...crisis,
    quarantinedCityIds: [...(crisis.quarantinedCityIds ?? []), cityId],
  };
  return {
    success: true,
    message: 'Quarantined — spread stopped.',
    state: { ...state, activeCrises: { ...(state.activeCrises ?? {}), [crisisId]: updated } },
  };
}

export function applyRemedy(
  state: GameState,
  crisisId: string,
  cityId: string,
): { success: boolean; state: GameState; message: string } {
  const crisis = state.activeCrises?.[crisisId];
  if (!crisis) return { success: false, state, message: 'No such crisis.' };
  const city = state.cities[cityId];
  if (!city) return { success: false, state, message: 'No such city.' };
  const civ = state.civilizations[crisis.targetCivId];
  const cost = getCityAppeaseCost(city);
  if (!civ || civ.gold < cost) {
    return { success: false, state, message: `Not enough gold — funding a remedy costs ${cost}.` };
  }
  const updated: ActiveCrisis = {
    ...crisis,
    remedyCompletionByCity: { ...(crisis.remedyCompletionByCity ?? {}), [cityId]: state.turn + 2 },
  };
  return {
    success: true,
    message: `Remedy underway — cured in 2 turns for ${cost} gold.`,
    state: {
      ...state,
      civilizations: { ...state.civilizations, [crisis.targetCivId]: { ...civ, gold: civ.gold - cost } },
      activeCrises: { ...(state.activeCrises ?? {}), [crisisId]: updated },
    },
  };
}

export function resolveCrisis(
  state: GameState,
  crisisId: string,
  outcome: CrisisOutcome,
  bus: EventBus,
): GameState {
  const crisis = state.activeCrises?.[crisisId];
  if (!crisis) return state;
  const { [crisisId]: _removed, ...rest } = state.activeCrises ?? {};
  bus.emit('crisis:resolved', { crisisId, flavorId: crisis.flavorId, civId: crisis.targetCivId, outcome });
  return { ...state, activeCrises: rest };
}

export function handleCityLeftCiv(state: GameState, cityId: string, bus: EventBus): GameState {
  let nextState = state;
  for (const [crisisId, crisis] of Object.entries(state.activeCrises ?? {})) {
    if (!crisis.cityIds.includes(cityId)) continue;
    const cityIds = crisis.cityIds.filter(id => id !== cityId);
    if (cityIds.length === 0) {
      nextState = resolveCrisis(nextState, crisisId, 'abandoned', bus);
    } else {
      const updated: ActiveCrisis = {
        ...crisis,
        cityIds,
        quarantinedCityIds: crisis.quarantinedCityIds?.filter(id => id !== cityId),
      };
      nextState = { ...nextState, activeCrises: { ...(nextState.activeCrises ?? {}), [crisisId]: updated } };
    }
  }
  return nextState;
}
