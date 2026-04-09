// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createCouncilPanel } from '@/ui/council-panel';
import { makeCouncilFixture } from './helpers/council-fixture';

describe('council-panel', () => {
  it('renders do-now, soon, to-win, and drama buckets with talk-level controls', () => {
    const { state, container } = makeCouncilFixture();

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    expect(panel.textContent).toContain('Do Now');
    expect(panel.textContent).toContain('Soon');
    expect(panel.textContent).toContain('To Win');
    expect(panel.textContent).toContain('Council Drama');
    expect(panel.textContent).toContain('quiet');
    expect(panel.textContent).toContain('chaos');
  });

  it('does not reveal undiscovered city names in the panel', () => {
    const { state, container } = makeCouncilFixture({ discoveredForeignCity: false });

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    expect(panel.textContent).not.toContain('Rome');
  });

  it('renders why-copy in a readable way for actionable guidance', () => {
    const { state, container } = makeCouncilFixture();

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange: () => {},
    });

    expect(panel.textContent).toContain('Why');
  });

  it('invokes the talk-level callback when the player changes the council mode', () => {
    const onTalkLevelChange = vi.fn();
    const { state, container } = makeCouncilFixture();

    const panel = createCouncilPanel(container, state, {
      onClose: () => {},
      onTalkLevelChange,
    });

    (panel.querySelector('[data-talk-level="chaos"]') as HTMLButtonElement).click();

    expect(onTalkLevelChange).toHaveBeenCalledWith('chaos');
  });
});
