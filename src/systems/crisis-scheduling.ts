// #1012: crisis onset eligibility and scheduling — "should a new crisis start for this
// civ this turn, and which flavor/target." This is crisis-specific POLICY (flavor
// selection, famine-fragility weighting, per-challenge caps), not the reusable staged
// lifecycle machinery — see crisis-lifecycle.ts's header comment for that seam.
import type { ActiveCrisis, City, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getChallengeProfileForCiv, OPPONENT_CHALLENGE_PROFILES } from '@/core/opponent-challenge';
import { computeThreatScore, deriveActiveIndependentThreatIds } from './threat-pressure-system';
import { getCrisisEligibleCivIds } from './world-pressure-eligibility';
import { CRISIS_FLAVORS } from './crisis-flavor-definitions';
import { weightedPick } from './seeded-lcg';
import { createSimulationRng } from './simulation-rng';
import { hexKey, mapDistance } from './hex-utils';
import { resolveCivDefinition } from './civ-registry';
import { calculateProjectedCityYields } from './city-work-system';
import { resolveCivilizationEra } from './tech-definitions';

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
      g.some(m => mapDistance(state.map, m.position, city.position) <= CONTAGION_GROUP_RANGE));
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

// AI civs are capped globally rather than per-civ (spec §Architecture seam 2,
// #529 MR3 Task 3.1) — a single AI civ hoarding crises isn't the risk; the
// world feeling saturated with simultaneous AI crises is.
export const AI_CRISIS_WORLD_CAP = { small: 2, medium: 3, large: 4 } as const;

function countActiveAiCrises(state: GameState): number {
  return Object.values(state.activeCrises ?? {})
    .filter(c => !state.civilizations[c.targetCivId]?.isHuman)
    .length;
}

export function processCrisisScheduler(state: GameState, bus: EventBus): GameState {
  let next = state;
  for (const civId of getCrisisEligibleCivIds(state)) next = maybeStartCrisis(next, civId, bus);
  return next;
}

// Fraction of a civ's cities with food surplus <= +1 (#590 MR3). Multiplies famine
// flavor selection weight in maybeStartCrisis below — food-poor civs see famine flavors
// far more often; food-rich civs still see them occasionally (floor, not zero) since a
// famine can plausibly strike even a well-fed empire.
const FAMINE_WEIGHT_FLOOR = 0.1;

export function getFamineFragility(state: GameState, civId: string): number {
  const civ = state.civilizations[civId];
  if (!civ || civ.cities.length === 0) return 0;
  const bonusEffect = resolveCivDefinition(state, civ.civType)?.bonusEffect;
  const fragileCount = civ.cities.filter(cityId => {
    const city = state.cities[cityId];
    if (!city) return false;
    const projectedYields = calculateProjectedCityYields(state, cityId, bonusEffect);
    return projectedYields.food - city.population <= 1;
  }).length;
  return fragileCount / civ.cities.length;
}

function maybeStartCrisis(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.cities.length === 0) return state;
  const civEra = resolveCivilizationEra(civ.techState.completed);
  // AI civs always resolve the 'standard' profile's scheduling knobs — never the
  // game-wide opponentChallenge, whose 'veteran' setting would otherwise make AI
  // suffer MORE and invert difficulty (same principle as resolvePressureSeverityForCiv).
  const profile = civ.isHuman ? getChallengeProfileForCiv(state, civId) : OPPONENT_CHALLENGE_PROFILES.standard;
  if (civEra <= profile.crisisGraceMaxEra) return state;
  if (state.turn < profile.crisisGraceMinTurns) return state;
  if (civ.lastCrisisOnsetTurn !== undefined &&
      state.turn - civ.lastCrisisOnsetTurn < profile.crisisCooldownTurns) return state;
  if (civ.isHuman) {
    if (countActiveCrisesForCiv(state, civId) >= profile.maxIndependentCrisesPerHuman) return state;
  } else {
    if (countActiveAiCrises(state) >= AI_CRISIS_WORLD_CAP[state.settings.mapSize]) return state;
  }
  if (deriveActiveIndependentThreatIds(state, civId).length > 0) return state;
  const ledger = state.opponentAI?.pressureByCiv?.[civId];
  if (ledger?.lastResolvedThreatTurn !== undefined && ledger.lastResolvedThreatTurn !== null &&
      state.turn - ledger.lastResolvedThreatTurn < EXTERNAL_THREAT_RECENCY_TURNS) return state;

  const landmassIds = [...new Set(civ.cities.flatMap(cid => {
    const c = state.cities[cid];
    const rk = c ? state.map.tiles[hexKey(c.position)]?.regionKey : undefined;
    return rk ? [rk] : [];
  }))].sort();
  const maxScore = landmassIds.reduce((m, l) => Math.max(m, computeThreatScore(state, civId, l)), 0);
  if (maxScore < CRISIS_PRESSURE_FLOOR) return state;

  // #982: called at most once per (turn, civId) -- maybeStartCrisis is invoked
  // once per eligible civ per crisis-turn pass -- so (turn, civId) alone is a
  // sufficient tuple; no ordinal needed.
  const rng = createSimulationRng(state, { domain: 'crisis-flavor-select', actorId: civId });
  const eligible = CRISIS_FLAVORS.filter(f =>
    civEra >= f.eraBand[0] && civEra <= f.eraBand[1] &&
    civ.cities.some(cid => { const c = state.cities[cid]; return !!c && f.geographyPredicate(state, c); }));
  if (eligible.length === 0) return state;
  const history = civ.recentCrisisHistory ?? [];
  const famineFragility = getFamineFragility(state, civId);
  const flavor = weightedPick(eligible, eligible.map(f => {
    const repeatPenalty = history.includes(f.id) ? 0.25 : 1.0;
    if (f.archetype !== 'famine') return repeatPenalty;
    return repeatPenalty * (FAMINE_WEIGHT_FLOOR + (1 - FAMINE_WEIGHT_FLOOR) * famineFragility);
  }), rng);
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
