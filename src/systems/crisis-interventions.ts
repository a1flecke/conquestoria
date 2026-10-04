// #1012: player-facing crisis interventions (quarantine, remedy, empire-wide
// containment) — commands that validate and mutate a specific ActiveCrisis. Crisis-
// specific policy; not part of the reusable staged-lifecycle machinery (crisis-lifecycle.ts).
import type { ActiveCrisis, GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getCityAppeaseCost } from './faction-commands';

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

// #919 MR1: nationwide remedy. Gated on the `medicine` tech; starts the standard
// 2-turn remedy in every affected city that doesn't already have one, for the summed
// per-city appease cost (no bulk discount — a discount would reward letting the plague
// spread first). Refuses while a sabotage is freezing remedies. Fires crisis:contained
// exactly once (transition-owned).
export function applyEmpireContainment(
  state: GameState,
  crisisId: string,
  bus: EventBus,
): { success: boolean; state: GameState; message: string } {
  const crisis = state.activeCrises?.[crisisId];
  if (!crisis) return { success: false, state, message: 'No such crisis.' };
  if (crisis.archetype !== 'outbreak') {
    return { success: false, state, message: 'Only disease outbreaks can be contained empire-wide.' };
  }
  const civ = state.civilizations[crisis.targetCivId];
  if (!civ) return { success: false, state, message: 'No such civilization.' };
  if (!civ.techState.completed.includes('medicine')) {
    return { success: false, state, message: 'A nationwide remedy requires the Medicine technology.' };
  }
  if (crisis.sabotage !== undefined && crisis.sabotage.untilTurn > state.turn) {
    return { success: false, state, message: 'Relief efforts are being sabotaged — resolve that first.' };
  }
  const targetCityIds = crisis.cityIds.filter(id => crisis.remedyCompletionByCity?.[id] === undefined);
  if (targetCityIds.length === 0) {
    return { success: false, state, message: 'Every affected city already has a remedy underway.' };
  }
  const goldCost = targetCityIds.reduce((sum, id) => {
    const c = state.cities[id];
    return sum + (c ? getCityAppeaseCost(c) : 0);
  }, 0);
  if (civ.gold < goldCost) {
    return { success: false, state, message: `Not enough gold — a nationwide remedy costs ${goldCost}.` };
  }

  const remedyCompletionByCity = { ...(crisis.remedyCompletionByCity ?? {}) };
  for (const id of targetCityIds) remedyCompletionByCity[id] = state.turn + 2;

  // Post-cure re-infection immunity is NOT set here: each city gets it uniformly from
  // the tick resolver's remedy-completion block (via cureImmunityWindow), the same as
  // a per-city applyRemedy. Duplicating it here would only risk drift.
  const updated: ActiveCrisis = { ...crisis, remedyCompletionByCity };
  bus.emit('crisis:contained', {
    crisisId, civId: crisis.targetCivId, cityCount: targetCityIds.length, goldCost,
  });
  return {
    success: true,
    message: `Nationwide remedy underway in ${targetCityIds.length} cities for ${goldCost} gold.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [crisis.targetCivId]: { ...civ, gold: civ.gold - goldCost },
      },
      activeCrises: { ...(state.activeCrises ?? {}), [crisisId]: updated },
    },
  };
}
