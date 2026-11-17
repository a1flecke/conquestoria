import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { chargeUnitsOnGeneTherapyResearch } from '@/systems/gene-therapy-system';
import { applyResearchBonus } from '@/systems/tech-system';

/**
 * Applies shared consequences after a caller emits `tech:completed`. The state consequences always apply; the
 * events need a bus (a caller without one, such as a lookahead, stays silent).
 */
export function applyResearchCompletionConsequences(
  state: GameState,
  civId: string,
  techId: string,
  bus?: EventBus,
): GameState {
  let nextState = techId === 'gene-therapy'
    ? chargeUnitsOnGeneTherapyResearch(state, civId)
    : state;
  const obsoletedTypes = TRAINABLE_UNITS
    .filter(unit => unit.obsoletedByTech === techId)
    .map(unit => unit.type);
  if (obsoletedTypes.length === 0) return nextState;

  for (const [unitId, unit] of Object.entries(nextState.units)) {
    if (unit.owner === civId && obsoletedTypes.includes(unit.type)) {
      bus?.emit('unit:obsolete', { civId, unitId, unitType: unit.type });
    }
  }

  const civEspionage = nextState.espionage?.[civId];
  if (!civEspionage) return nextState;
  let spies = civEspionage.spies;
  for (const [spyId, spy] of Object.entries(spies)) {
    if (!obsoletedTypes.includes(spy.unitType)) continue;
    if (spy.status !== 'embedded' && spy.status !== 'stationed' && spy.status !== 'on_mission') continue;
    if (spies === civEspionage.spies) spies = { ...civEspionage.spies };
    delete spies[spyId];
    bus?.emit('espionage:spy-expired', { civId, spyId, spyName: spy.name, unitType: spy.unitType });
  }
  if (spies === civEspionage.spies) return nextState;
  return {
    ...nextState,
    espionage: { ...nextState.espionage, [civId]: { ...civEspionage, spies } },
  };
}

/**
 * A completed technology, announced and settled the way the research step settles one: `tech:completed` (when a
 * bus is given) and then the shared consequences. Every path that can finish a tech outside the research step
 * (a city-state ally's science, a quest or beast reward, a village, a natural-wonder discovery) uses this or
 * `applyResearchGain`, so the player is told and obsolete spies and gene therapy are settled on every path.
 */
export function settleCompletedTech(
  state: GameState,
  civId: string,
  techId: string,
  bus?: EventBus,
  carry?: { carriedProgress: number; carriedIntoTechId: string | null },
): GameState {
  bus?.emit('tech:completed', {
    civId,
    techId,
    carriedProgress: carry?.carriedProgress ?? 0,
    carriedIntoTechId: carry && carry.carriedProgress > 0 ? carry.carriedIntoTechId : null,
  });
  return applyResearchCompletionConsequences(state, civId, techId, bus);
}

/** A one-off science grant to a civ's current research; a tech it finishes is settled by `settleCompletedTech`. */
export function applyResearchGain(state: GameState, civId: string, amount: number, bus?: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  const result = applyResearchBonus(civ.techState, amount);
  const next: GameState = {
    ...state,
    civilizations: { ...state.civilizations, [civId]: { ...civ, techState: result.state } },
  };
  if (!result.completedTech) return next;
  return settleCompletedTech(next, civId, result.completedTech, bus, {
    carriedProgress: result.carriedProgress,
    carriedIntoTechId: result.state.currentResearch,
  });
}

/** Settles every tech a civ completed between two states (for in-place legacy paths that cannot return one). */
export function settleTechsCompletedSince(before: readonly string[], state: GameState, civId: string, bus?: EventBus): GameState {
  const known = new Set(before);
  let next = state;
  for (const techId of state.civilizations[civId]?.techState.completed ?? []) {
    if (!known.has(techId)) next = settleCompletedTech(next, civId, techId, bus);
  }
  return next;
}
