import type { ActiveCrisis, City, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getChallengeProfileForCiv } from '@/core/opponent-challenge';
import { computeThreatScore, deriveActiveIndependentThreatIds } from './threat-pressure-system';
import { CRISIS_FLAVORS } from './crisis-flavor-definitions';
import { seededLcg, weightedPick } from './seeded-lcg';
import { hexKey, hexDistance } from './hex-utils';

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
