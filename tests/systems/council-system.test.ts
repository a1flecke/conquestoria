import { describe, expect, it } from 'vitest';
import { buildCouncilAgenda, getCouncilInterrupt } from '@/systems/council-system';
import { formatCityReference } from '@/systems/player-facing-labels';
import { makeCouncilFixture } from '../ui/helpers/council-fixture';

describe('council system', () => {
  it('returns actionable do-now, soon, and to-win cards without leaking hidden facts', () => {
    const { state } = makeCouncilFixture({ metForeignCiv: true, discoveredForeignCity: false });
    const agenda = buildCouncilAgenda(state, 'player');

    expect(agenda.doNow[0].why.length).toBeGreaterThan(0);
    expect(JSON.stringify(agenda)).not.toContain('Rome');
    expect(JSON.stringify(agenda)).not.toContain('Atlantis');
  });

  it('disambiguates duplicate city names in council copy', () => {
    const label = formatCityReference('Rome', { ownerName: 'Narnia', duplicateCount: 2 });
    expect(label).toContain('Rome');
    expect(label).toContain('Narnia');
  });

  it('suppresses low-priority interruptions on quiet but emits them on chaos', () => {
    const { state } = makeCouncilFixture({ lowPriorityFoodWarning: true });

    expect(getCouncilInterrupt(state, 'player', 'quiet')).toBeNull();
    expect(getCouncilInterrupt(state, 'player', 'chaos')?.sourceCardId).toBe('food-warning');
  });
});
