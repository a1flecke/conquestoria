import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNewGame } from '@/core/game-state';
import { getEraAdvancementTechs, resolveCivilizationEra } from '@/systems/tech-definitions';
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

it('#919 MR2: magistracy does not gate era advancement, so no save loses an era on load', () => {
  // magistracy is an optional stability side-tech (countsForEraAdvancement: false),
  // so the era-2 advancement pool and its threshold are exactly what they were pre-MR.
  const era2 = getEraAdvancementTechs(2);
  expect(era2.some(tech => tech.id === 'magistracy')).toBe(false);
  expect(era2).toHaveLength(30); // ceil(30 * 0.5) = 15 techs still gate era 2

  // A saved civ that sat at exactly the old era-2 threshold (15 era-2 techs) was era 2;
  // it must still resolve to era 2 after this MR, with or without magistracy completed.
  const fifteenEra2 = era2.slice(0, 15).map(tech => tech.id);
  expect(resolveCivilizationEra(['tribal-council', 'code-of-laws', ...fifteenEra2])).toBe(2);
  expect(resolveCivilizationEra(['tribal-council', 'code-of-laws', 'magistracy', ...fifteenEra2])).toBe(2);
});
