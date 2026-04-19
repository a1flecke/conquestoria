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
});
