// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createPirateHeadquartersAssaultPanel } from '@/ui/pirate-headquarters-assault-panel';

describe('pirate headquarters assault panel', () => {
  it('shows the complete deterministic preview before confirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const panel = createPirateHeadquartersAssaultPanel(document.body, {
      factionId: 'pirate-1', unitId: 'ship-1',
      preview: {
        available: true, reason: null, damageToHeadquarters: 35, counterfireDamage: 12,
        integrityBefore: 60, integrityAfter: 25, bounty: 60, destroysHeadquarters: false,
      },
    } as any, { onConfirm, onCancel });

    expect(panel.textContent).toContain('Integrity: 60 -> 25');
    expect(panel.textContent).toContain('Counterfire: 12 HP');
    expect(panel.textContent).toContain('Consumes this unit\'s action and movement');
    expect(panel.textContent).toContain('Destruction bounty: 60 gold');
    const confirm = panel.querySelector('[data-action="confirm-pirate-assault"]') as HTMLButtonElement;
    confirm.click();
    confirm.click();
    expect(onConfirm).toHaveBeenCalledOnce();
    (panel.querySelector('[aria-label="Cancel pirate assault"]') as HTMLButtonElement).click();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
