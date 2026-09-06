import { createHotSeatGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import type { GameState } from '@/core/types';

export function makeVassalageFixture(vassalHuman = true, overlordHuman = true): GameState {
  const state = createHotSeatGame({
    playerCount: 3, mapSize: 'small',
    players: [
      { slotId: 'vassal', name: 'Egypt', civType: 'egypt', isHuman: vassalHuman },
      { slotId: 'overlord', name: 'Rome', civType: 'rome', isHuman: overlordHuman },
      { slotId: 'third', name: 'Greece', civType: 'greece', isHuman: true },
    ],
  }, 'issue-910-lifecycle');
  state.turn = 20;
  state.currentPlayer = 'vassal';
  state.pendingDiplomacyRequests = [];
  state.barbarianCamps = {};
  state.minorCivs = {};
  for (const [id, civ] of Object.entries(state.civilizations)) {
    const settler = state.units[civ.units[0]];
    const city = foundCity(id, settler.position, state.map, state.idCounters);
    city.buildings = ['marketplace'];
    state.cities[city.id] = city;
    civ.cities = [city.id];
    civ.knownCivilizations = ['vassal', 'overlord', 'third'].filter(other => other !== id);
    civ.techState.completed = TECH_TREE.filter(tech => tech.era <= 2).map(tech => tech.id);
    civ.diplomacy.vassalage.peakCities = id === 'vassal' ? 3 : 1;
    civ.diplomacy.vassalage.peakMilitary = id === 'vassal' ? 6 : 4;
    civ.units = [];
    for (let i = 0; i < (id === 'vassal' ? 1 : 4); i++) {
      const unit = createUnit('warrior', id, { q: settler.position.q + i, r: settler.position.r }, state.idCounters);
      state.units[unit.id] = unit;
      civ.units.push(unit.id);
    }
    delete state.units[settler.id];
    for (const other of civ.knownCivilizations) civ.diplomacy.relationships[other] = 30;
  }
  state.defensiveLeagues = [{ id: 'league', members: ['vassal', 'third'], formedTurn: 1 }];
  return state;
}
