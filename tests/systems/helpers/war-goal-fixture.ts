import { createHotSeatGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { declareMajorWar } from '@/systems/diplomacy-system';
import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';

/**
 * Two major civs ('attacker', 'defender') at war, each with a home city, plus
 * a second city for 'defender' ('defender-second') so overreach (taking more
 * than the declared target) is reachable. A third, uninvolved civ
 * ('bystander') exercises third-party/viewer-safety cases.
 */
export function makeWarGoalFixture(bus: EventBus, options?: { attackerHuman?: boolean; defenderHuman?: boolean }): GameState {
  let state = createHotSeatGame({
    playerCount: 3, mapSize: 'small',
    players: [
      { slotId: 'attacker', name: 'Rome', civType: 'rome', isHuman: options?.attackerHuman ?? true },
      { slotId: 'defender', name: 'Egypt', civType: 'egypt', isHuman: options?.defenderHuman ?? true },
      { slotId: 'bystander', name: 'Greece', civType: 'greece', isHuman: true },
    ],
  }, 'issue-988-war-goals');
  state.turn = 20;
  state.currentPlayer = 'attacker';
  state.pendingDiplomacyRequests = [];
  state.barbarianCamps = {};
  state.minorCivs = {};

  for (const [id, civ] of Object.entries(state.civilizations)) {
    const settler = state.units[civ.units[0]];
    const city = foundCity(id, settler.position, state.map, state.idCounters);
    city.buildings = [];
    state.cities[city.id] = city;
    civ.cities = [city.id];
    civ.knownCivilizations = ['attacker', 'defender', 'bystander'].filter(other => other !== id);
    civ.techState.completed = TECH_TREE.filter(tech => tech.era <= 2).map(tech => tech.id);
    civ.units = [];
    const unit = createUnit('warrior', id, { q: settler.position.q, r: settler.position.r + 3 }, state.idCounters);
    state.units[unit.id] = unit;
    civ.units.push(unit.id);
    delete state.units[settler.id];
    for (const other of civ.knownCivilizations) civ.diplomacy.relationships[other] = 0;
  }

  // A second city for 'defender', far enough away to be a distinct capture target.
  const defenderCapitalCity = state.cities[state.civilizations['defender'].cities[0]];
  const secondCity = foundCity('defender', { q: defenderCapitalCity.position.q + 6, r: defenderCapitalCity.position.r + 6 }, state.map, state.idCounters);
  secondCity.buildings = [];
  state.cities[secondCity.id] = secondCity;
  state.civilizations['defender'].cities.push(secondCity.id);

  state = declareMajorWar(state, 'attacker', 'defender', bus);
  return state;
}
