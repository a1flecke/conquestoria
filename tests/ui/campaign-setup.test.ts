// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { showCampaignSetup } from '@/ui/campaign-setup';

describe('campaign-setup', () => {
  it('requires map size, civ selection, opponent count, and campaign title before starting a solo game', () => {
    const container = document.createElement('div');
    const onStart = vi.fn();

    showCampaignSetup(container, { onStartSolo: onStart, onCancel: () => {} });

    expect(container.textContent).toContain('Campaign title');
    expect(container.textContent).toContain('Map size');
    expect(container.textContent).toContain('Opponents');
  });
});
