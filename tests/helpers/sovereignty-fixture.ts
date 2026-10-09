import { createHotSeatGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { foundCityInState } from '@/systems/city-founding-system';
import { normalizeLoadedState } from '@/storage/save-manager';
import { assertSaveStateInvariants } from './save-state-invariants';

export const SOVEREIGN_IDS = ['player-1', 'player-2', 'player-3', 'player-4'] as const;

/** Complete seeded state with real founding commands, independent human seats,
 * and no synthetic ownership rosters. Setup normalization precedes all actions. */
export function makeSovereigntyFixture() {
  let state = createHotSeatGame({ playerCount: 4, mapSize: 'small', players: [
    { slotId: 'player-1', name: 'Rome', civType: 'rome', isHuman: true },
    { slotId: 'player-2', name: 'Egypt', civType: 'egypt', isHuman: true },
    { slotId: 'player-3', name: 'Greece', civType: 'greece', isHuman: true },
    { slotId: 'player-4', name: 'Carthage', civType: 'carthage', isHuman: true },
  ] }, 'sol-sovereignty-proof');
  for (const id of SOVEREIGN_IDS) {
    const settler = Object.values(state.units).find(u => u.owner === id && u.type === 'settler');
    if (!settler) throw new Error(`missing starting settler: ${id}`);
    state = foundCityInState(state, settler.id, new EventBus()).state;
    state.civilizations[id].knownCivilizations = SOVEREIGN_IDS.filter(other => other !== id);
  }
  state = normalizeLoadedState(state);
  assertSaveStateInvariants(state, 'sovereignty fixture');
  return state;
}
