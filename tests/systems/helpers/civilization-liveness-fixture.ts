import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { foundCityInState } from '@/systems/city-founding-system';

export function makeLivenessGame(): GameState {
  const state = createNewGame('egypt', 'civilization-liveness-fixture');
  const settler = Object.values(state.units).find(unit =>
    unit.owner === 'player' && unit.type === 'settler');
  if (!settler) throw new Error('Fixture requires the initial player settler');
  return foundCityInState(state, settler.id, new EventBus()).state;
}

export function withoutOwnedAssets(state: GameState, civId: string): GameState {
  const next = structuredClone(state);
  next.cities = Object.fromEntries(
    Object.entries(next.cities).filter(([, city]) => city.owner !== civId),
  );
  next.units = Object.fromEntries(
    Object.entries(next.units).filter(([, unit]) => unit.owner !== civId),
  );
  next.civilizations[civId].cities = [];
  next.civilizations[civId].units = [];
  return next;
}
