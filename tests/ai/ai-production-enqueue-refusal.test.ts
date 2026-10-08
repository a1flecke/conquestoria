import { describe, expect, it, vi } from 'vitest';

vi.mock('@/systems/planning-system', async importOriginal => {
  const actual = await importOriginal<typeof import('@/systems/planning-system')>();
  return {
    ...actual,
    enqueueCityProduction: () => ({ ok: false, reason: 'not-queueable' }),
  };
});

import { applyAIProductionWithReport } from '@/ai/ai-production';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import type { PersonalityTraits } from '@/core/types';

const calm: PersonalityTraits = { traits: [], warLikelihood: 0, diplomacyFocus: 0, expansionDrive: 0 };

describe('AI production: candidate offered but canonical enqueue refuses', () => {
  it('is reported as a refusal and is never masked by an idle-conversion fallback', () => {
    const state = createNewGame(undefined, 'ai-enqueue-refusal', 'small');
    const civ = state.civilizations['ai-1'];
    const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
    const city = foundCity(civ.id, settler.position, state.map, state.idCounters);
    city.id = 'city-a';
    city.productionQueue = [];
    state.cities['city-a'] = city;
    civ.cities = ['city-a'];

    const { state: after, report } = applyAIProductionWithReport(state, 'ai-1', [], calm);

    expect(report.enqueueRefused).toEqual(['city-a']);
    expect(report.converted).toEqual({});
    expect(after.cities['city-a'].idleProduction ?? null).toBeNull();
    expect(after.cities['city-a'].productionQueue).toEqual([]);
  });
});
