import type { GameState, MinorCivPosture } from '@/core/types';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { hasDiscoveredMinorCiv } from './discovery-system';
import { evaluateMinorCivEconomyPosture } from './minor-civ-economy-system';

export interface MinorCivPresentation {
  known: boolean;
  name: string;
  color: string;
}

export interface MinorCivEconomyPresentation {
  known: boolean;
  postureLabel: string | null;
  hint: string | null;
}

const POSTURE_LABELS: Record<MinorCivPosture, string> = {
  settled: 'Quiet',
  fortifying: 'Fortifying',
  mobilizing: 'Mobilizing',
  recovering: 'Recovering',
};

export function getMinorCivPresentationForPlayer(
  state: Pick<GameState, 'minorCivs' | 'cities' | 'civilizations'>,
  viewerCivId: string,
  minorCivId: string,
  unknownName: string = 'City-State',
): MinorCivPresentation {
  const mc = (state as GameState).minorCivs?.[minorCivId];
  const def = mc ? MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId) : undefined;
  const known = mc ? hasDiscoveredMinorCiv(state as GameState, viewerCivId, minorCivId) : false;

  return {
    known,
    name: known ? (def?.name ?? unknownName) : unknownName,
    color: known ? (def?.color ?? '#888') : '#888',
  };
}

export function getMinorCivEconomyPresentationForPlayer(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): MinorCivEconomyPresentation {
  const base = getMinorCivPresentationForPlayer(state, viewerCivId, minorCivId);
  if (!base.known) {
    return { known: false, postureLabel: null, hint: null };
  }

  const economy = state.minorCivs[minorCivId]?.economy;
  const effectivePosture = evaluateMinorCivEconomyPosture(state, minorCivId);
  const hasRegionalGrievanceContext = Object.keys(state.minorCivs[minorCivId]?.regionalGrievanceByCiv ?? {}).length > 0;
  const displayPosture = effectivePosture === 'settled' && economy?.posture && !hasRegionalGrievanceContext
    ? economy.posture
    : effectivePosture;
  if (!economy) {
    return { known: true, postureLabel: POSTURE_LABELS[displayPosture], hint: null };
  }

  const summary = economy.recentProductionSummary;
  const hint = summary?.itemClass === 'unit'
    ? 'training defenders'
    : summary?.itemClass === 'building'
      ? 'investing locally'
      : effectivePosture === 'recovering'
        ? 'recovering from levy'
        : null;

  return {
    known: true,
    postureLabel: POSTURE_LABELS[displayPosture],
    hint,
  };
}

export function formatMinorCivEventMessageForPlayer(
  state: Pick<GameState, 'minorCivs' | 'cities' | 'civilizations'>,
  viewerCivId: string,
  minorCivId: string,
  kind: 'evolved' | 'destroyed' | 'guerrilla',
): string {
  const presentation = getMinorCivPresentationForPlayer(state, viewerCivId, minorCivId);

  switch (kind) {
    case 'evolved':
      return presentation.known
        ? `A barbarian tribe formed the city-state of ${presentation.name}!`
        : 'A barbarian tribe formed a new city-state!';
    case 'destroyed':
      return presentation.known
        ? `${presentation.name} has fallen!`
        : 'A city-state has fallen!';
    case 'guerrilla':
      return presentation.known
        ? `${presentation.name} guerrilla fighters attack!`
        : 'City-state guerrilla fighters attack!';
  }
}
