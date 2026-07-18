import { expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import { resolveCombatEra } from '@/systems/era-resolution';

it('uses the lower participant personal era for combat pacing', () => {
  const state = createNewGame(undefined, 'combat-era', 'small');
  const player = state.civilizations.player;
  const ai = Object.values(state.civilizations).find(civ => !civ.isHuman)!;
  player.techState.completed = [];
  ai.techState.completed = getEraAdvancementTechs(2).slice(0, Math.ceil(getEraAdvancementTechs(2).length * 0.5)).map(tech => tech.id);
  const playerUnit = { ...state.units[player.units[0]]!, owner: player.id };
  const aiUnit = { ...state.units[ai.units[0]]!, owner: ai.id };

  expect(resolveCombatEra(state, playerUnit, aiUnit)).toBe(1);
});
