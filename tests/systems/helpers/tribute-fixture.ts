import { createNewGame } from '@/core/game-state';
import type { GameState, UnitType } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-lifecycle';

// #1334: shared fixture for the tribute tests (a strong demander facing a weaker target it can see).
export const DEMANDER = 'player';
export const TARGET = 'ai-1';
export const TARGET_SPOT = { q: 8, r: 4 };
export const HIDDEN_SPOT = { q: 14, r: 10 };

export const techsThroughEra = (era: number) => TECH_TREE.filter(tech => tech.era <= era).map(tech => tech.id);

export function addUnit(state: GameState, owner: string, type: UnitType, position: { q: number; r: number }, id: string) {
  const unit = createUnit(type, owner, position, state.idCounters);
  unit.id = id;
  state.units[id] = unit;
  state.civilizations[owner].units.push(id);
  return unit;
}

/** A demander far stronger than a target it can see, both met, at peace, era 3. */
export function makeTributeState(): GameState {
  const state = createNewGame(undefined, 'diplomacy-tribute', 'small');
  state.turn = 20;
  const demander = state.civilizations[DEMANDER];
  const target = state.civilizations[TARGET];
  demander.techState.completed = techsThroughEra(3);
  demander.knownCivilizations = [TARGET];
  target.knownCivilizations = [DEMANDER];
  demander.diplomacy.relationships[TARGET] = 0;
  target.diplomacy.relationships[DEMANDER] = 0;
  demander.gold = 100;
  target.gold = 100;
  for (let i = 0; i < 6; i++) addUnit(state, DEMANDER, 'swordsman', { q: 1 + i, r: 1 }, `tribute-own-${i}`);
  const seen = addUnit(state, TARGET, 'warrior', TARGET_SPOT, 'tribute-target-seen');
  demander.visibility.tiles[hexKey(seen.position)] = 'visible';
  return state;
}


/** The target can see the demander's units (so its own perception of the demander is usable). */
export function letTargetSeeDemander(state: GameState): void {
  for (const id of state.civilizations[DEMANDER].units) {
    state.civilizations[TARGET].visibility.tiles[hexKey(state.units[id].position)] = 'visible';
  }
}
