/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCivSelectPanel } from '@/ui/civ-select';
import { getPlayableCivDefinitions } from '@/systems/civ-registry';
import type { CustomCivDefinition } from '@/core/types';

const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

describe('civ-select', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('marks the chosen civ card as selected and exposes a back action', () => {
    const onCancel = vi.fn();
    const panel = createCivSelectPanel(document.body, {
      onSelect: () => {},
      onCancel,
    }, {
      civDefinitions: getPlayableCivDefinitions({ customCivilizations: [customCiv] }),
      headerText: 'Choose your civilization',
      primaryActionText: 'Confirm Civilization',
    });

    const card = Array.from(panel.querySelectorAll('.civ-card'))
      .find(node => node.textContent?.includes('Sunfolk')) as HTMLElement;
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(card.dataset.selected).toBe('true');
    expect((panel.querySelector('#civ-start') as HTMLButtonElement).textContent).toBe('Confirm Civilization');
    (panel.querySelector('[data-action="cancel-civ-select"]') as HTMLButtonElement).click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders saved custom civs in the real civ picker and allows selecting them', () => {
    const onSelect = vi.fn();
    const panel = createCivSelectPanel(document.body, { onSelect }, {
      civDefinitions: getPlayableCivDefinitions({
        customCivilizations: [customCiv],
      }),
    });

    expect(panel.textContent).toContain('Sunfolk');
    const card = Array.from(panel.querySelectorAll('.civ-card')).find(node => node.textContent?.includes('Sunfolk'));
    expect(card).toBeTruthy();
    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (panel.querySelector('#civ-start') as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledWith('custom-sunfolk');
  });

  it('renders custom civ names with DOM nodes instead of trusting markup', () => {
    const panel = createCivSelectPanel(document.body, { onSelect: () => {} }, {
      civDefinitions: getPlayableCivDefinitions({
        customCivilizations: [{ ...customCiv, name: '<img src=x onerror=alert(1)>' }],
      }),
    });

    expect(panel.querySelector('img')).toBeNull();
    expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('offers a create-custom-civ action from the real civ picker', () => {
    const onCreateCustomCiv = vi.fn();
    const panel = createCivSelectPanel(document.body, {
      onSelect: () => {},
      onCreateCustomCiv,
    }, {
      civDefinitions: getPlayableCivDefinitions({}),
    });

    (panel.querySelector('[data-action="create-custom-civ"]') as HTMLButtonElement).click();
    expect(onCreateCustomCiv).toHaveBeenCalledTimes(1);
  });

  it('keeps the full civ catalog reachable and presents the refreshed action labels', () => {
    const civDefinitions = getPlayableCivDefinitions({ customCivilizations: [customCiv] });
    const panel = createCivSelectPanel(document.body, {
      onSelect: () => {},
      onCreateCustomCiv: () => {},
      onCancel: () => {},
    }, {
      civDefinitions,
      primaryActionText: 'Confirm Civilization',
    });

    expect(panel.querySelectorAll('.civ-card').length).toBe(civDefinitions.length);
    expect(panel.textContent).toContain('Surprise Me');
    expect(panel.textContent).toContain('Create Custom Civilization');
    expect(panel.textContent).toContain('Confirm Civilization');
  });
});

describe('civ-select keyboard contract (#1459)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('civilization cards are real buttons, so they can be focused and chosen with Enter or Space', () => {
    const panel = createCivSelectPanel(document.body, { onSelect: () => {}, onCancel: () => {} }, {
      civDefinitions: getPlayableCivDefinitions({ customCivilizations: [] }),
    });
    const cards = Array.from(panel.querySelectorAll('.civ-card'));
    expect(cards.length).toBeGreaterThan(3);
    for (const card of cards) {
      expect(card.tagName).toBe('BUTTON');
      expect(card.getAttribute('aria-pressed')).toBe('false');
    }
    // No clickable-but-unfocusable element is left in the picker.
    expect(panel.querySelectorAll('div[style*="cursor: pointer"], div[style*="cursor:pointer"]').length).toBe(0);
  });

  it('exposes the chosen card as pressed and moves the state with the choice', () => {
    const panel = createCivSelectPanel(document.body, { onSelect: () => {} }, {
      civDefinitions: getPlayableCivDefinitions({ customCivilizations: [] }),
    });
    const [first, second] = Array.from(panel.querySelectorAll<HTMLButtonElement>('.civ-card'));
    first!.click();
    expect(first!.getAttribute('aria-pressed')).toBe('true');
    second!.click();
    expect(first!.getAttribute('aria-pressed')).toBe('false');
    expect(second!.getAttribute('aria-pressed')).toBe('true');
  });

  it('disabled civilizations leave the tab order', () => {
    const defs = getPlayableCivDefinitions({ customCivilizations: [] });
    const taken = defs[0]!.id;
    const panel = createCivSelectPanel(document.body, { onSelect: () => {} }, { civDefinitions: defs, disabledCivs: [taken] });
    expect(panel.querySelector<HTMLButtonElement>(`.civ-card[data-civ-id="${taken}"]`)!.disabled).toBe(true);
    // Focus starts on the first card that can actually be chosen.
    const initial = panel.querySelector<HTMLButtonElement>('[data-modal-initial-focus]')!;
    expect(initial.classList.contains('civ-card')).toBe(true);
    expect(initial.dataset.civId).not.toBe(taken);
  });

  it('Escape is Back only when there is somewhere to go back to', () => {
    const withBack = createCivSelectPanel(document.body, { onSelect: () => {}, onCancel: () => {} });
    expect(withBack.querySelector('[data-modal-cancel]')?.textContent).toBe('Back');
    document.body.innerHTML = '';
    const required = createCivSelectPanel(document.body, { onSelect: () => {} });
    expect(required.querySelector('[data-modal-cancel]')).toBeNull();
    expect(required.hasAttribute('data-modal')).toBe(true);
  });
});
