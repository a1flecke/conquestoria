/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showHotSeatSetup } from '@/ui/hotseat-setup';
import { getPlayableCivDefinitions } from '@/systems/civ-registry';
import type { CustomCivDefinition } from '@/core/types';
import { createDefaultSettings } from '@/core/game-state';
import * as saveManager from '@/storage/save-manager';

const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

let storedSettings = createDefaultSettings('small');

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

function fillAndSaveCustomCiv(name: string): void {
  const civNameInput = document.querySelector('[data-field="civ-name"]') as HTMLInputElement;
  civNameInput.value = name;
  civNameInput.dispatchEvent(new Event('input', { bubbles: true }));

  const leaderNameInput = document.querySelector('[data-field="leader-name"]') as HTMLInputElement;
  leaderNameInput.value = 'Aurelia';
  leaderNameInput.dispatchEvent(new Event('input', { bubbles: true }));

  const cityNamesInput = document.querySelector('[data-field="city-names"]') as HTMLTextAreaElement;
  cityNamesInput.value = 'Solara\nEmbergate\nSunspire\nGoldmere\nDawnwatch\nAuric';
  cityNamesInput.dispatchEvent(new Event('input', { bubbles: true }));

  const primaryTraitButton = document.querySelector('[data-section="primary-trait"] button') as HTMLButtonElement;
  primaryTraitButton.click();
  const temperamentTraitButton = document.querySelector('[data-section="temperament-traits"] button') as HTMLButtonElement;
  temperamentTraitButton.click();

  (document.querySelector('[data-action="save-custom-civ"]') as HTMLButtonElement).click();
}

beforeEach(() => {
  document.body.innerHTML = '';
  storedSettings = createDefaultSettings('small');
  vi.restoreAllMocks();
  vi.spyOn(saveManager, 'loadSettings').mockImplementation(async () => storedSettings);
  vi.spyOn(saveManager, 'saveSettings').mockImplementation(async (settings) => {
    storedSettings = settings;
  });
});

describe('hotseat-setup', () => {
  it('passes custom civ definitions into hot-seat setup selection flow for later players', () => {
    showHotSeatSetup(
      document.body,
      {
        onComplete: () => {},
        onCancel: () => {},
      },
      {
        civDefinitions: getPlayableCivDefinitions({
          customCivilizations: [customCiv],
        }),
        initialCustomCivilizations: [customCiv],
      },
    );

    (document.querySelector('[data-size="small"]') as HTMLElement).click();
    (document.querySelector('[data-count="2"]') as HTMLElement).click();
    (document.querySelector('#hs-names-next') as HTMLButtonElement).click();

    expect(document.body.textContent).toContain('Sunfolk');
  });

  it('allows a hot-seat player to select a custom civ and include it in the final config', () => {
    const onComplete = vi.fn();
    showHotSeatSetup(
      document.body,
      {
        onComplete,
        onCancel: () => {},
      },
      {
        civDefinitions: getPlayableCivDefinitions({
          customCivilizations: [customCiv],
        }),
        initialCustomCivilizations: [customCiv],
      },
    );

    (document.querySelector('[data-size="small"]') as HTMLElement).click();
    (document.querySelector('[data-count="2"]') as HTMLElement).click();
    (document.querySelector('#hs-names-next') as HTMLButtonElement).click();

    const civCard = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => node.textContent?.includes('Sunfolk'));
    expect(civCard).toBeTruthy();
    civCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement)?.click();
    (document.querySelector('#hs-civ-ready') as HTMLButtonElement).click();

    const secondPlayerCiv = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => !node.textContent?.includes('Sunfolk'));
    expect(secondPlayerCiv).toBeTruthy();
    secondPlayerCiv?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement).click();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      customCivilizations: [customCiv],
      players: expect.arrayContaining([
        expect.objectContaining({
          slotId: 'player-1',
          civType: 'custom-sunfolk',
          isHuman: true,
        }),
      ]),
    }));
  });

  it('preserves a saved custom civ in the hot-seat completion config registry', () => {
    const onComplete = vi.fn();

    showHotSeatSetup(
      document.body,
      {
        onComplete,
        onCancel: () => {},
      },
      {
        civDefinitions: getPlayableCivDefinitions({
          customCivilizations: [customCiv],
        }),
        initialCustomCivilizations: [customCiv],
      },
    );

    (document.querySelector('[data-size="small"]') as HTMLElement).click();
    (document.querySelector('[data-count="2"]') as HTMLElement).click();
    (document.querySelector('#hs-names-next') as HTMLButtonElement).click();

    const firstPlayerCiv = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => node.textContent?.includes('Sunfolk'));
    expect(firstPlayerCiv).toBeTruthy();
    firstPlayerCiv?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement).click();

    (document.querySelector('#hs-civ-ready') as HTMLButtonElement).click();
    const secondPlayerCiv = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => !node.textContent?.includes('Sunfolk'));
    expect(secondPlayerCiv).toBeTruthy();
    secondPlayerCiv?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement).click();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      customCivilizations: [customCiv],
    }));
  });

  it('reopens the hot-seat civ picker with one live picker after saving a custom civ and lets the flow continue', async () => {
    const onComplete = vi.fn();

    showHotSeatSetup(
      document.body,
      {
        onComplete,
        onCancel: () => {},
      },
      {
        civDefinitions: getPlayableCivDefinitions({}),
        initialCustomCivilizations: [],
      },
    );

    (document.querySelector('[data-size="small"]') as HTMLElement).click();
    (document.querySelector('[data-count="2"]') as HTMLElement).click();
    (document.querySelector('#hs-names-next') as HTMLButtonElement).click();
    (document.querySelector('[data-action="create-custom-civ"]') as HTMLButtonElement).click();
    fillAndSaveCustomCiv('Sunfolk');
    await flushAsyncWork();

    expect(document.querySelectorAll('#civ-select')).toHaveLength(1);
    (document.querySelector('[data-action="create-custom-civ"]') as HTMLButtonElement).click();
    expect(document.querySelectorAll('#custom-civ-panel')).toHaveLength(1);
    (document.querySelector('[data-action="cancel-custom-civ"]') as HTMLButtonElement).click();
    expect(document.querySelectorAll('#custom-civ-panel')).toHaveLength(0);

    const civCard = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => node.textContent?.includes('Sunfolk'));
    expect(civCard).toBeTruthy();
    civCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement).click();

    expect(document.querySelector('#hs-civ-ready')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('creates a distinct id when saving a same-name custom civ from the hot-seat setup registry', async () => {
    storedSettings = {
      ...createDefaultSettings('small'),
      customCivilizations: [customCiv],
    };

    showHotSeatSetup(
      document.body,
      {
        onComplete: () => {},
        onCancel: () => {},
      },
      {
        civDefinitions: getPlayableCivDefinitions({
          customCivilizations: [customCiv],
        }),
        initialCustomCivilizations: [customCiv],
      },
    );

    (document.querySelector('[data-size="small"]') as HTMLElement).click();
    (document.querySelector('[data-count="2"]') as HTMLElement).click();
    (document.querySelector('#hs-names-next') as HTMLButtonElement).click();
    (document.querySelector('[data-action="create-custom-civ"]') as HTMLButtonElement).click();
    fillAndSaveCustomCiv('Sunfolk');
    await flushAsyncWork();

    expect(storedSettings.customCivilizations).toEqual([
      customCiv,
      expect.objectContaining({
        id: 'custom-sunfolk-2',
        name: 'Sunfolk',
      }),
    ]);
    expect(storedSettings.customCivilizations?.map(def => def.id)).toEqual([
      'custom-sunfolk',
      'custom-sunfolk-2',
    ]);
  });

  it('preserves newer stored custom civs when hot-seat setup saves from a stale initial registry, even if the slug now collides', async () => {
    const staleCustomCiv: CustomCivDefinition = {
      ...customCiv,
      id: 'custom-stale-sunfolk',
      name: 'Stale Sunfolk',
    };
    const newerStoredCiv: CustomCivDefinition = {
      ...customCiv,
      id: 'custom-sunfolk',
      name: 'Sunfolk',
      leaderName: 'Selene',
      cityNames: ['Moonfall', 'Silverkeep', 'Starharbor', 'Nightbloom', 'Lunara', 'Crescenta'],
    };

    storedSettings = {
      ...createDefaultSettings('small'),
      customCivilizations: [staleCustomCiv, newerStoredCiv],
    };

    showHotSeatSetup(
      document.body,
      {
        onComplete: () => {},
        onCancel: () => {},
      },
      {
        civDefinitions: getPlayableCivDefinitions({
          customCivilizations: [staleCustomCiv],
        }),
        initialCustomCivilizations: [staleCustomCiv],
      },
    );

    (document.querySelector('[data-size="small"]') as HTMLElement).click();
    (document.querySelector('[data-count="2"]') as HTMLElement).click();
    (document.querySelector('#hs-names-next') as HTMLButtonElement).click();
    (document.querySelector('[data-action="create-custom-civ"]') as HTMLButtonElement).click();
    fillAndSaveCustomCiv('Sunfolk');
    await flushAsyncWork();

    expect(storedSettings.customCivilizations).toEqual(expect.arrayContaining([
      staleCustomCiv,
      newerStoredCiv,
      expect.objectContaining({
        id: 'custom-sunfolk-2',
        name: 'Sunfolk',
      }),
    ]));
    expect(storedSettings.customCivilizations?.map(def => def.id)).toEqual([
      'custom-stale-sunfolk',
      'custom-sunfolk',
      'custom-sunfolk-2',
    ]);
  });

  it('keeps the newer stored version of an existing custom civ when hot-seat setup saves from a stale snapshot', async () => {
    const staleCustomCiv: CustomCivDefinition = {
      ...customCiv,
      leaderName: 'Aurelia',
    };
    const newerStoredCiv: CustomCivDefinition = {
      ...customCiv,
      leaderName: 'Selene',
      cityNames: ['Moonfall', 'Silverkeep', 'Starharbor', 'Nightbloom', 'Lunara', 'Crescenta'],
    };

    storedSettings = {
      ...createDefaultSettings('small'),
      customCivilizations: [newerStoredCiv],
    };

    showHotSeatSetup(
      document.body,
      {
        onComplete: () => {},
        onCancel: () => {},
      },
      {
        civDefinitions: getPlayableCivDefinitions({
          customCivilizations: [staleCustomCiv],
        }),
        initialCustomCivilizations: [staleCustomCiv],
      },
    );

    (document.querySelector('[data-size="small"]') as HTMLElement).click();
    (document.querySelector('[data-count="2"]') as HTMLElement).click();
    (document.querySelector('#hs-names-next') as HTMLButtonElement).click();
    (document.querySelector('[data-action="create-custom-civ"]') as HTMLButtonElement).click();
    fillAndSaveCustomCiv('Moonfolk');
    await flushAsyncWork();

    expect(storedSettings.customCivilizations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'custom-sunfolk',
        leaderName: 'Selene',
        cityNames: newerStoredCiv.cityNames,
      }),
      expect.objectContaining({
        id: 'custom-moonfolk',
        name: 'Moonfolk',
      }),
    ]));
  });
});
