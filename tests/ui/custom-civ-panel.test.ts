/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCustomCivPanel } from '@/ui/custom-civ-panel';

describe('custom-civ-panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a setup-style header and grouped editor sections', () => {
    const panel = createCustomCivPanel(document.body, { onSave: () => {}, onCancel: () => {} });

    expect(panel.querySelector('[data-role="setup-panel-header"]')).toBeTruthy();
    expect(panel.querySelector('[data-role="custom-civ-basics"]')).toBeTruthy();
    expect(panel.querySelector('[data-role="custom-civ-traits"]')).toBeTruthy();
    expect(panel.querySelector('[data-role="custom-civ-city-names"]')).toBeTruthy();
  });

  it('renders a trait budget display and primary trait picker', () => {
    const panel = createCustomCivPanel(document.body, { onSave: () => {}, onCancel: () => {} });
    expect(panel.textContent).toContain('Trait budget');
    expect(panel.querySelector('[data-section="primary-trait"]')).toBeTruthy();
  });

  it('keeps save disabled until the custom civ is fully valid', () => {
    const onSave = vi.fn();
    const panel = createCustomCivPanel(document.body, { onSave, onCancel: () => {} });

    const save = panel.querySelector('[data-action="save-custom-civ"]') as HTMLButtonElement;
    const validation = panel.querySelector('[data-role="custom-civ-validation"]') as HTMLElement;
    expect(save.disabled).toBe(true);
    expect(save.dataset.ready).toBe('false');
    expect(validation.textContent).toBeTruthy();
    expect(save.style.opacity).toBe('0.45');
    expect(save.style.cursor).toBe('not-allowed');
  });

  it('enables save after all required fields are filled', () => {
    const onSave = vi.fn();
    const panel = createCustomCivPanel(document.body, { onSave, onCancel: () => {} });

    fillRequiredFields(panel);

    const save = panel.querySelector('[data-action="save-custom-civ"]') as HTMLButtonElement;
    const validation = panel.querySelector('[data-role="custom-civ-validation"]') as HTMLElement;
    expect(save.disabled).toBe(false);
    expect(save.dataset.ready).toBe('true');
    expect(validation.textContent).toContain('Ready to save');
    expect(save.style.opacity).toBe('1');
    expect(save.style.cursor).toBe('pointer');
  });

  it('calls onSave with a valid CustomCivDefinition when save is clicked', () => {
    const onSave = vi.fn();
    const panel = createCustomCivPanel(document.body, { onSave, onCancel: () => {} });

    fillRequiredFields(panel);
    (panel.querySelector('[data-action="save-custom-civ"]') as HTMLButtonElement).click();

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.id).toMatch(/^custom-/);
    expect(saved.name).toBeTruthy();
    expect(saved.cityNames.length).toBeGreaterThanOrEqual(6);
    expect(saved.primaryTrait).toBeTruthy();
    expect(saved.temperamentTraits.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    const panel = createCustomCivPanel(document.body, { onSave: () => {}, onCancel });

    (panel.querySelector('[data-action="cancel-custom-civ"]') as HTMLButtonElement).click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses textContent for all user-provided strings, never innerHTML', () => {
    const panel = createCustomCivPanel(document.body, { onSave: () => {}, onCancel: () => {} });
    const nameInput = panel.querySelector('[data-field="civ-name"]') as HTMLInputElement;
    if (nameInput) {
      nameInput.value = '<img src=x onerror=alert(1)>';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(panel.querySelector('img')).toBeNull();
  });

  it('limits temperament traits to at most 2 selections', () => {
    const panel = createCustomCivPanel(document.body, { onSave: () => {}, onCancel: () => {} });
    const traitButtons = panel.querySelectorAll('[data-section="temperament-traits"] button');

    for (let i = 0; i < Math.min(3, traitButtons.length); i++) {
      (traitButtons[i] as HTMLButtonElement).click();
    }

    const selected = panel.querySelectorAll('[data-section="temperament-traits"] button[data-selected="true"]');
    expect(selected.length).toBeLessThanOrEqual(2);
  });

  it('generates a collision-safe custom civ id when an existing civ uses the same name slug', () => {
    const onSave = vi.fn();
    const panel = createCustomCivPanel(document.body, { onSave, onCancel: () => {} }, {
      existingDefinitions: [
        {
          id: 'custom-sunfolk',
          name: 'Sunfolk',
          color: '#d9a441',
          leaderName: 'Aurelia',
          cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
          primaryTrait: 'scholarly',
          temperamentTraits: ['diplomatic', 'trader'],
        },
      ],
    });

    fillRequiredFields(panel);
    (panel.querySelector('[data-action="save-custom-civ"]') as HTMLButtonElement).click();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].id).toBe('custom-sunfolk-2');
  });
});

function fillRequiredFields(panel: HTMLElement): void {
  const setInput = (selector: string, value: string) => {
    const el = panel.querySelector(selector) as HTMLInputElement;
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  setInput('[data-field="civ-name"]', 'Sunfolk');
  setInput('[data-field="leader-name"]', 'Aurelia');
  setInput('[data-field="civ-color"]', '#d9a441');

  const primaryBtn = panel.querySelector('[data-section="primary-trait"] button') as HTMLButtonElement;
  if (primaryBtn) primaryBtn.click();

  const tempBtn = panel.querySelector('[data-section="temperament-traits"] button') as HTMLButtonElement;
  if (tempBtn) tempBtn.click();

  const cityInput = panel.querySelector('[data-field="city-names"]') as HTMLTextAreaElement;
  if (cityInput) {
    cityInput.value = 'Solara\nEmbergate\nSunspire\nGoldmere\nDawnwatch\nAuric';
    cityInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
