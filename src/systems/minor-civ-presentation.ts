import type { GameState } from '@/core/types';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { hasDiscoveredMinorCiv } from './discovery-system';

export interface MinorCivPresentation {
  known: boolean;
  name: string;
  color: string;
}

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
    color: def?.color ?? '#888',
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
