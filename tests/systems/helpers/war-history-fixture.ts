import { createHotSeatGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-lifecycle';
import { foundCity } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import type { GameState } from '@/core/types';

/**
 * Four major civs, no war declared yet: 'attacker', 'defender', 'bystander'
 * (viewer-safety third party), and 'vassal' (pre-committed as 'attacker's
 * vassal, for drag-in tests). Each has one home city.
 */
export function makeWarHistoryFixture(): GameState {
  const state = createHotSeatGame({
    playerCount: 4, mapSize: 'small',
    players: [
      { slotId: 'attacker', name: 'Rome', civType: 'rome', isHuman: true },
      { slotId: 'defender', name: 'Egypt', civType: 'egypt', isHuman: true },
      { slotId: 'bystander', name: 'Greece', civType: 'greece', isHuman: true },
      { slotId: 'vassal', name: 'Carthage', civType: 'carthage', isHuman: true },
    ],
  }, 'issue-991-war-history');
  state.turn = 20;
  state.currentPlayer = 'attacker';
  state.pendingDiplomacyRequests = [];
  state.barbarianCamps = {};
  state.minorCivs = {};

  const allIds = ['attacker', 'defender', 'bystander', 'vassal'];
  for (const [id, civ] of Object.entries(state.civilizations)) {
    const settler = state.units[civ.units[0]];
    const city = foundCity(id, settler.position, state.map, state.idCounters);
    city.buildings = [];
    state.cities[city.id] = city;
    civ.cities = [city.id];
    civ.knownCivilizations = allIds.filter(other => other !== id);
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

  // 'vassal' is already attacker's committed vassal.
  state.civilizations['vassal'].diplomacy.vassalage.overlord = 'attacker';
  state.civilizations['attacker'].diplomacy.vassalage.vassals = ['vassal'];
  state.civilizations['vassal'].diplomacy.treaties = [{ type: 'vassalage', civA: 'vassal', civB: 'attacker', turnsRemaining: -1 }];
  state.civilizations['attacker'].diplomacy.treaties = [{ type: 'vassalage', civA: 'vassal', civB: 'attacker', turnsRemaining: -1 }];

  return state;
}
