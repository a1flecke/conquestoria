import { describe, it, expect } from 'vitest';
import { createDiplomacyState, getAvailableActions } from '@/systems/diplomacy-system';

describe('diplomacy tech gates', () => {
  it('era 1 civ WITH diplomacy-tech gets non_aggression_pact', () => {
    const state = createDiplomacyState(['self', 'target'], 'self');
    const actions = getAvailableActions(state, 'target', ['diplomacy-tech'], 1);
    expect(actions).toContain('non_aggression_pact');
  });

  it('era 1 civ WITHOUT diplomacy-tech does not get non_aggression_pact', () => {
    const state = createDiplomacyState(['self', 'target'], 'self');
    const actions = getAvailableActions(state, 'target', [], 1);
    expect(actions).not.toContain('non_aggression_pact');
  });

  it('era 4 civ with zero techs gets alliance (era fallback still works)', () => {
    const state = createDiplomacyState(['self', 'target'], 'self');
    const actions = getAvailableActions(state, 'target', [], 4);
    expect(actions).toContain('alliance');
  });
});
