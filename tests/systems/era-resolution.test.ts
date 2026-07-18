import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNewGame } from '@/core/game-state';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import { resolveCombatEra, resolveNeutralPressureEra } from '@/systems/era-resolution';

function advanceCivToEra(state: ReturnType<typeof createNewGame>, civId: string, era: number): void {
  state.civilizations[civId]!.techState.completed = Array.from({ length: era - 1 }, (_, index) => index + 2)
    .flatMap(candidate => getEraAdvancementTechs(candidate)
      .slice(0, Math.ceil(getEraAdvancementTechs(candidate).length * (candidate <= 3 ? 0.5 : candidate <= 8 ? 0.6 : 0.55)))
      .map(tech => tech.id));
}

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
    expect(source).toMatch(/import \{[^}]*resolveCombatEra[^}]*\} from ['"](?:@\/systems\/|\.\/)?era-resolution['"]/);
    expect(source).toMatch(/resolveCombatEra\((?:nextState|next|state),\s*(?:warship|attacker|attackerUnit),\s*(?:adjacentPirate|defender|defenderUnit)\)/);
  }
});

it('uses the intended target personal era for neutral pressure', () => {
  const state = createNewGame(undefined, 'neutral-target-era', 'small');
  const aiId = Object.values(state.civilizations).find(civ => !civ.isHuman)!.id;
  advanceCivToEra(state, aiId, 3);
  state.era = 12;

  expect(resolveNeutralPressureEra(state, { q: 0, r: 0 }, aiId)).toBe(3);
});

it('uses the safe lower median of nearby civilization eras when no neutral target is known', () => {
  const state = createNewGame(undefined, 'neutral-local-era', 'small');
  const aiId = Object.values(state.civilizations).find(civ => !civ.isHuman)!.id;
  advanceCivToEra(state, aiId, 3);
  state.cities = {
    'player-city': { id: 'player-city', owner: 'player', position: { q: 4, r: 4 } },
    'ai-city': { id: 'ai-city', owner: aiId, position: { q: 5, r: 4 } },
  } as never;
  state.civilizations.player.cities = ['player-city'];
  state.civilizations[aiId]!.cities = ['ai-city'];

  expect(resolveNeutralPressureEra(state, { q: 4, r: 5 })).toBe(1);
  expect(resolveNeutralPressureEra(state, { q: 30, r: 30 })).toBeNull();
});
