import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { beginPlayerCityAssaultChoice, type PendingCityCaptureChoice } from '@/input/city-assault-flow';
import { declareWar } from '@/systems/diplomacy-system';

export function beginConfirmedForeignCityEntry(
  state: GameState,
  attackerId: string,
  cityId: string,
  bus?: EventBus,
): { state: GameState; pending: PendingCityCaptureChoice } {
  const city = state.cities[cityId];
  if (!city) {
    throw new Error(`Cannot enter missing city ${cityId}`);
  }

  let nextState = state;
  const attackerCivId = state.currentPlayer;
  const defenderId = city.owner;
  const attacker = nextState.civilizations[attackerCivId];
  const defender = nextState.civilizations[defenderId];
  const alreadyAtWar = attacker?.diplomacy.atWarWith.includes(defenderId) ?? false;

  if (attacker && defender && !alreadyAtWar) {
    nextState = {
      ...nextState,
      civilizations: {
        ...nextState.civilizations,
        [attackerCivId]: {
          ...attacker,
          diplomacy: declareWar(attacker.diplomacy, defenderId, nextState.turn),
        },
        [defenderId]: {
          ...defender,
          diplomacy: declareWar(defender.diplomacy, attackerCivId, nextState.turn),
        },
      },
    };
    bus?.emit('diplomacy:war-declared', { attackerId: attackerCivId, defenderId });
  }

  return beginPlayerCityAssaultChoice(nextState, attackerId, cityId);
}
