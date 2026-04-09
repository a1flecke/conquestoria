// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createCouncilPanel } from '@/ui/council-panel';
import { makeCouncilFixture } from '../ui/helpers/council-fixture';

describe('m4e council guidance', () => {
  it('answers what to do next and why without leaking hidden cities or civs', () => {
    const { state, container } = makeCouncilFixture({ discoveredForeignCity: false, duplicateCityNames: true });

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    expect(panel.textContent).toContain('Do Now');
    expect(panel.textContent).toContain('Why');
    expect(panel.textContent).not.toContain('Rome');
  });
});
