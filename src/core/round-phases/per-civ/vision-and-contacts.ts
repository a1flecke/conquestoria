import type { GameState, HexCoord } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { getNetworkUnitVisionBonus } from '@/systems/network-infrastructure-plans';
import {
  applyReconReveals,
  updateVisibility,
  revealMinorCivCities,
  applySharedVision,
  applySatelliteSurveillance,
  applyMassSurveillanceReveal,
} from '@/systems/fog-of-war';
import { getActiveNationalProjectsForCiv } from '@/systems/national-project-system';
import { getVisionBonus } from '@/systems/unit-modifier-system';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import type { CivTurn, CivRoster } from './types';

/**
 * Recomputes the civ's fog of war from its units and cities, then applies recon, mass and satellite surveillance.
 */
export function refreshCivVision(state: GameState, turn: CivTurn, roster: CivRoster): GameState {
  let newState = state;
  const { civId, civ, currentCivState } = turn;
  const { civUnits, cityPositions } = roster;

  // Update visibility
  {
    const visionCompletedTechs = newState.civilizations[civId].techState.completed;
    const visionActiveNPs = getActiveNationalProjectsForCiv(newState, civId);
    const { visibility: visionAfterUpdate } = updateVisibility(
      newState.civilizations[civId].visibility,
      civUnits,
      newState.map,
      cityPositions,
      unit => getVisionBonus(unit.type, visionCompletedTechs, visionActiveNPs) + getNetworkUnitVisionBonus(newState, unit.id),
    );
    newState.civilizations[civId].visibility = visionAfterUpdate;
    newState = applyReconReveals(newState, civId);
  }

  if (civ.techState.completed.includes('mass-surveillance')) {
    newState = applyMassSurveillanceReveal(newState, civId);
  }

  for (const [targetCivId, turnsRemaining] of Object.entries(currentCivState.satelliteSurveillanceTargets ?? {})) {
    if (turnsRemaining > 0) {
      newState = applySatelliteSurveillance(newState, civId, targetCivId);
    }
  }
  return newState;
}

/**
 * Vision the civ is granted by others: minor-civ cities, friendly city-states, and allies under electric telegraph.
 */
export function shareMinorAndAlliedVision(state: GameState, turn: CivTurn): void {
  const { civId } = turn;

  // Reveal minor civ cities near explored tiles
  const mcCityPositions = Object.values(state.minorCivs)
    .filter(mc => !mc.isDestroyed)
    .map(mc => state.cities[mc.cityId]?.position)
    .filter(Boolean) as HexCoord[];
  revealMinorCivCities(state.civilizations[civId].visibility, mcCityPositions, state.map);

  // Shared vision for friendly minor civs
  for (const mc of Object.values(state.minorCivs)) {
    if (mc.isDestroyed) continue;
    const rel = mc.diplomacy.relationships[civId] ?? 0;
    if (rel >= 30) {
      const mcPositions = [
        state.cities[mc.cityId]?.position,
        ...mc.units.map(uid => state.units[uid]?.position),
      ].filter(Boolean) as HexCoord[];
      applySharedVision(state.civilizations[civId].visibility, mcPositions, state.map);
    }
  }

  // #524 MR1: electric-telegraph — allied major civs share vision around their cities.
  // One-directional per tech holder: your telegraph, your intel; the ally needs their own
  // tech to see yours.
  if (state.civilizations[civId].techState.completed.includes('electric-telegraph')) {
    const allies = state.civilizations[civId].diplomacy.treaties
      .filter(t => t.type === 'alliance')
      .map(t => (t.civA === civId ? t.civB : t.civA));
    for (const allyId of allies) {
      const allyCityPositions = (state.civilizations[allyId]?.cities ?? [])
        .map(cid => state.cities[cid]?.position)
        .filter(Boolean) as HexCoord[];
      applySharedVision(state.civilizations[civId].visibility, allyCityPositions, state.map);
    }
  }
}

/**
 * Contact discovery must run AFTER every vision-granting source for this civ's
 * round has applied -- mass surveillance / satellite surveillance / minor-civ
 * shared vision / ally telegraph vision all run above and can be the ONLY
 * reason a foreign civ becomes visible this round. Running the sync earlier
 * (as this used to, immediately after the base updateVisibility call) meant a
 * contact only ever revealed through one of those later sources could never be
 * caught live: the next round's updateVisibility recomputes fog-of-war from
 * scratch, degrading that tile back to 'fog' before this same sync point runs
 * again, and the later sources re-promote it to 'visible' only after sync has
 * already passed -- forever missing it, every round, regardless of how many
 * rounds pass. Found via tests/simulation/long-horizon/campaign-continuity.test.ts's
 * save/reload determinism check: `normalizeLoadedState`'s unconditional
 * `refreshKnownCivilizations` sweep on every load has no such ordering problem,
 * so a save/reload could "discover" a contact live play could never reach.
 */
export function syncCivContacts(state: GameState, turn: CivTurn, bus: EventBus): GameState {
  let newState = state;
  const { civId } = turn;

  for (const contact of syncCivilizationContactsFromVisibility(newState, civId)) {
    bus.emit('civilization:first-contact', contact);
  }
  newState = refreshLastSeenPresentationsForCiv(newState, civId);
  return newState;
}
