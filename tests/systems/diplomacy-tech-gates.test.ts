import { describe, it, expect } from 'vitest';
import { createDiplomacyState, getAvailableActions } from '@/systems/diplomacy-system';

describe('diplomacy tech gates', () => {
  it('era 1 civ WITH diplomacy-tech gets non_aggression_pact', () => {
    const state = createDiplomacyState(['self', 'target'], 'self');
    const actions = getAvailableActions(state, 'target', { completedTechs: ['diplomacy-tech'], civilizationEra: 1, hasArmsControlTreaty: false });
    expect(actions).toContain('non_aggression_pact');
  });

  it('era 1 civ WITHOUT diplomacy-tech does not get non_aggression_pact', () => {
    const state = createDiplomacyState(['self', 'target'], 'self');
    const actions = getAvailableActions(state, 'target', { completedTechs: [], civilizationEra: 1, hasArmsControlTreaty: false });
    expect(actions).not.toContain('non_aggression_pact');
  });

  it('era 4 civ with zero techs gets alliance (era fallback still works)', () => {
    const state = createDiplomacyState(['self', 'target'], 'self');
    const actions = getAvailableActions(state, 'target', { completedTechs: [], civilizationEra: 4, hasArmsControlTreaty: false });
    expect(actions).toContain('alliance');
  });
});
