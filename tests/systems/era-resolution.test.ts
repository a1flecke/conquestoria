import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

it('routes every AI and minor-civ combat resolution through the shared personal-era resolver', () => {
  const projectRoot = resolve(__dirname, '..', '..');
  const callers = [
    'src/ai/basic-ai.ts',
    'src/ai/ai-major-turn.ts',
    'src/systems/minor-civ-system.ts',
  ];

  for (const caller of callers) {
    const source = readFileSync(resolve(projectRoot, caller), 'utf8');
    expect(source).toMatch(/import \{ resolveCombatEra \} from ['"](?:@\/systems\/|\.\/)?era-resolution['"]/);
    expect(source).toMatch(/resolveCombatEra\((?:nextState|next|state),\s*(?:warship|attacker|attackerUnit),\s*(?:adjacentPirate|defender|defenderUnit)\)/);
  }
});
