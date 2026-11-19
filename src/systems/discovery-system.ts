import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from './fog-of-war';
import { hasCurrentVisibleEvidence } from './viewer-intel';

export interface CivilizationContactTransition {
  civA: string;
  civB: string;
}

export function hasExploredCoord(state: GameState, viewerCivId: string, coord: HexCoord): boolean {
  const vis = state.civilizations[viewerCivId]?.visibility;
  if (!vis) return false;
  const visibility = getVisibility(vis, coord);
  return visibility === 'visible' || visibility === 'fog';
}

export function hasDiscoveredMinorCiv(state: GameState, viewerCivId: string, minorCivId: string): boolean {
  const mc = state.minorCivs?.[minorCivId];
  if (!mc || mc.isDestroyed) return false;
  const city = state.cities[mc.cityId];
  if (!city) return false;
  return hasExploredCoord(state, viewerCivId, city.position);
}

export function hasDiscoveredCity(state: GameState, viewerCivId: string, cityId: string): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  return hasExploredCoord(state, viewerCivId, city.position);
}

export function recordCivilizationContact(
  state: GameState,
  civA: string,
  civB: string,
): CivilizationContactTransition | null {
  if (civA === civB) return null;
  const first = state.civilizations[civA];
  const second = state.civilizations[civB];
  if (!first || !second) return null;

  const firstKnown = first.knownCivilizations ?? ((first as GameState['civilizations'][string]).knownCivilizations = []);
  const secondKnown = second.knownCivilizations ?? ((second as GameState['civilizations'][string]).knownCivilizations = []);
  const wasKnown = firstKnown.includes(civB) || secondKnown.includes(civA);

  if (!firstKnown.includes(civB)) {
    firstKnown.push(civB);
  }
  if (!secondKnown.includes(civA)) {
    secondKnown.push(civA);
  }

  return wasKnown ? null : { civA, civB };
}

export function refreshKnownCivilizations(state: GameState, civId: string): void {
  syncCivilizationContactsFromVisibility(state, civId);
}

export function syncCivilizationContactsFromVisibility(
  state: GameState,
  civId: string,
): CivilizationContactTransition[] {
  const civ = state.civilizations[civId];
  if (!civ) return [];

  const contacts: CivilizationContactTransition[] = [];
  for (const otherId of Object.keys(state.civilizations)) {
    if (otherId === civId) continue;
    if (hasMetCivilizationByCurrentEvidence(state, civId, otherId)) {
      const contact = recordCivilizationContact(state, civId, otherId);
      if (contact) contacts.push(contact);
    }
  }
  return contacts;
}

export function hasMetCivilization(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  if (viewerCivId === targetCivId) return true;

  const viewer = state.civilizations[viewerCivId];
  const target = state.civilizations[targetCivId];
  if (!viewer || !target) return false;
  const viewerKnown = viewer.knownCivilizations ?? [];
  const targetKnown = target.knownCivilizations ?? [];
  if (viewerKnown.includes(targetCivId)) return true;
  if (targetKnown.includes(viewerCivId)) return true;
  return hasMetCivilizationByCurrentEvidence(state, viewerCivId, targetCivId);
}

function hasMetCivilizationByCurrentEvidence(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  const viewer = state.civilizations[viewerCivId];
  const target = state.civilizations[targetCivId];
  if (!viewer || !target) return false;
  if (target.breakaway?.originOwnerId === viewerCivId) return true;
  if (viewer.breakaway?.originOwnerId === targetCivId) return true;

  if (viewer.diplomacy.atWarWith.includes(targetCivId)) return true;
  if (viewer.diplomacy.treaties.some(t => t.civA === targetCivId || t.civB === targetCivId)) return true;

  return hasCurrentVisibleEvidence(state, viewerCivId, targetCivId);
}
