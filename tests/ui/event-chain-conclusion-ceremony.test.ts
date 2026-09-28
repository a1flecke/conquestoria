// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventChainConclusionMomentItem } from '@/systems/event-chain-presentation';
import { createEventChainConclusionCeremony } from '@/ui/event-chain-conclusion-ceremony';

function item(overrides: Partial<EventChainConclusionMomentItem> = {}): EventChainConclusionMomentItem {
  return {
    civId: 'player',
    chainId: 'chain-1',
    kind: 'financial-panic',
    title: 'Financial Panic',
    optionLabel: 'Emergency Bailout',
    optionDescription: 'Pay a gold sum now to guarantee the treasury crisis passes quietly.',
    ...overrides,
  };
}

describe('event-chain-conclusion-ceremony', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the chosen option and its description', () => {
    createEventChainConclusionCeremony(document.body, item(), { onResolve: () => {} });

    expect(document.body.textContent).toContain('Financial Panic');
    expect(document.body.textContent).toContain('Emergency Bailout');
    expect(document.body.textContent).toContain('Pay a gold sum now to guarantee the treasury crisis passes quietly.');
  });

  it('resolves exactly once when Continue is clicked', () => {
    const onResolve = vi.fn();
    createEventChainConclusionCeremony(document.body, item(), { onResolve });

    const button = document.querySelector<HTMLButtonElement>('[data-event-chain-conclusion-action="continue"]');
    expect(button).toBeTruthy();
    button!.click();
    button!.click();

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#event-chain-conclusion-ceremony')).toBeNull();
  });

  it('resolves on Escape', () => {
    const onResolve = vi.fn();
    const overlay = createEventChainConclusionCeremony(document.body, item(), { onResolve });

    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('replaces an existing ceremony rather than stacking a second one', () => {
    createEventChainConclusionCeremony(document.body, item(), { onResolve: () => {} });
    createEventChainConclusionCeremony(document.body, item({ optionLabel: 'Austerity Reform' }), { onResolve: () => {} });

    expect(document.querySelectorAll('#event-chain-conclusion-ceremony')).toHaveLength(1);
    expect(document.body.textContent).toContain('Austerity Reform');
  });
});
