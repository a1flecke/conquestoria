import type { GameState, Quest } from '@/core/types';
import { hasDiscoveredCity, hasDiscoveredMinorCiv } from '@/systems/discovery-system';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { formatCityReference } from '@/systems/player-facing-labels';

function getQuestCityId(quest: Quest): string | undefined {
  return quest.cityId ?? (quest.target.type === 'defeat_units' ? quest.target.cityId : undefined);
}

export function isQuestVisibleToPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  quest: Quest,
  viewerId: string,
): boolean {
  if (quest.minorCivId) {
    return hasDiscoveredMinorCiv(state as GameState, viewerId, quest.minorCivId);
  }

  if (quest.target.type === 'trade_route') {
    return hasDiscoveredMinorCiv(state as GameState, viewerId, quest.target.minorCivId);
  }

  return true;
}

export function getQuestOriginLabel(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  quest: Quest,
  viewerId: string,
): string {
  if (quest.minorCivId) {
    return getMinorCivPresentationForPlayer(state as GameState, viewerId, quest.minorCivId, 'city-state').name;
  }

  if (quest.target.type === 'trade_route') {
    return getMinorCivPresentationForPlayer(state as GameState, viewerId, quest.target.minorCivId, 'city-state').name;
  }

  const cityId = getQuestCityId(quest);
  if (!cityId) {
    return 'unknown source';
  }

  if (!hasDiscoveredCity(state as GameState, viewerId, cityId)) {
    return 'foreign city';
  }

  const city = (state as GameState).cities[cityId];
  if (!city) {
    return 'unknown source';
  }

  const duplicateCount = Object.values((state as GameState).cities).filter(other => other.name === city.name).length;
  const ownerName = (state as GameState).civilizations[city.owner]?.name;
  return formatCityReference(city.name, { ownerName, duplicateCount });
}

export function getQuestDescriptionForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  quest: Quest,
): string {
  switch (quest.target.type) {
    case 'destroy_camp':
      return 'Destroy a nearby barbarian camp';
    case 'gift_gold':
      return `Gift ${quest.target.amount} gold`;
    case 'defeat_units': {
      const cityId = getQuestCityId(quest);
      if (cityId && hasDiscoveredCity(state as GameState, playerId, cityId)) {
        const city = (state as GameState).cities[cityId];
        return `Clear ${quest.target.count} units from ${city?.name ?? 'the target city'}`;
      }
      return `Clear ${quest.target.count} units near a foreign city`;
    }
    case 'trade_route':
      return hasDiscoveredMinorCiv(state as GameState, playerId, quest.target.minorCivId)
        ? 'Establish a trade route to this city-state'
        : 'Establish a trade route to a discovered city-state';
    default:
      return 'Complete the assigned task';
  }
}

export function getQuestIssuedMessageForPlayer(
  state: Pick<GameState, 'cities' | 'civilizations' | 'minorCivs'>,
  playerId: string,
  issuerLabel: string,
  quest: Quest,
): string {
  return `${issuerLabel} asks: ${getQuestDescriptionForPlayer(state, playerId, quest)}`;
}
