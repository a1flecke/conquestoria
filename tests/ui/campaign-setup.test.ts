// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showCampaignSetup } from '@/ui/campaign-setup';
import type { CustomCivDefinition } from '@/core/types';
import { createDefaultSettings } from '@/core/game-state';
import * as saveManager from '@/storage/save-manager';

let storedSettings = createDefaultSettings('small');

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

function clickButtonWithText(text: string): void {
  const button = Array.from(document.querySelectorAll('button'))
    .find(node => node.textContent === text) as HTMLButtonElement | undefined;
  button?.click();
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

const baseCustomCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

describe('campaign-setup', () => {
  it('requires map size, civ selection, opponent count, and campaign title before starting a solo game', () => {
    const container = document.createElement('div');
    const onStart = vi.fn();

    showCampaignSetup(container, { onStartSolo: onStart, onCancel: () => {} });

    expect(container.textContent).toContain('Campaign title');
    expect(container.textContent).toContain('Map size');
    expect(container.textContent).toContain('Opponents');
  });

  it('passes custom civ definitions into solo campaign setup civ selection', () => {
    const customCiv: CustomCivDefinition = {
      id: 'custom-sunfolk',
      name: 'Sunfolk',
      color: '#d9a441',
      leaderName: 'Aurelia',
      cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
      primaryTrait: 'scholarly',
      temperamentTraits: ['diplomatic', 'trader'],
    };

    showCampaignSetup(
      document.body,
      {
        onStartSolo: () => {},
        onCancel: () => {},
      },
      {
        initialCustomCivilizations: [customCiv],
      },
    );

    (document.querySelector('[data-action="choose-civ"]') as HTMLButtonElement).click();
    expect(document.body.textContent).toContain('Sunfolk');
  });

  it('preserves a saved custom civ in the solo start callback registry', () => {
    const customCiv: CustomCivDefinition = {
      id: 'custom-sunfolk',
      name: 'Sunfolk',
      color: '#d9a441',
      leaderName: 'Aurelia',
      cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
      primaryTrait: 'scholarly',
      temperamentTraits: ['diplomatic', 'trader'],
    };
    const onStartSolo = vi.fn();

    showCampaignSetup(
      document.body,
      {
        onStartSolo,
        onCancel: () => {},
      },
      {
        initialCustomCivilizations: [customCiv],
      },
    );

    (document.querySelector('[data-action="choose-civ"]') as HTMLButtonElement).click();

    const civCard = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => node.textContent?.includes('Sunfolk'));
    expect(civCard).toBeTruthy();
    civCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement).click();
    (document.querySelector('#campaign-title') as HTMLInputElement).value = 'Sunfolk Rising';
    (Array.from(document.querySelectorAll('button')).find(
      button => button.textContent === 'Start Campaign',
    ) as HTMLButtonElement).click();

    expect(onStartSolo).toHaveBeenCalledTimes(1);
    expect(onStartSolo).toHaveBeenCalledWith(expect.objectContaining({
      civType: 'custom-sunfolk',
      customCivilizations: [customCiv],
    }));
  });

  it('reopens solo civ selection with one live picker after saving a custom civ and lets the player start with it', async () => {
    const onStartSolo = vi.fn();

    showCampaignSetup(
      document.body,
      {
        onStartSolo,
        onCancel: () => {},
      },
      {
        initialCustomCivilizations: [],
      },
    );

    clickButtonWithText('Choose civilization');
    clickButtonWithText('Create Custom Civilization');
    fillAndSaveCustomCiv('Sunfolk');
    await flushAsyncWork();

    expect(document.querySelectorAll('#civ-select')).toHaveLength(1);
    clickButtonWithText('Create Custom Civilization');
    expect(document.querySelectorAll('#custom-civ-panel')).toHaveLength(1);
    (document.querySelector('[data-action="cancel-custom-civ"]') as HTMLButtonElement).click();
    expect(document.querySelectorAll('#custom-civ-panel')).toHaveLength(0);

    const civCard = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => node.textContent?.includes('Sunfolk'));
    expect(civCard).toBeTruthy();
    civCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement).click();
    (document.querySelector('#campaign-title') as HTMLInputElement).value = 'Sunfolk Rising';
    clickButtonWithText('Start Campaign');

    expect(onStartSolo).toHaveBeenCalledTimes(1);
    expect(onStartSolo).toHaveBeenCalledWith(expect.objectContaining({
      civType: 'custom-sunfolk',
      customCivilizations: [expect.objectContaining({ id: 'custom-sunfolk', name: 'Sunfolk' })],
    }));
  });

  it('creates a distinct id when saving a same-name custom civ from a saved registry', async () => {
    const originalCustomCiv: CustomCivDefinition = {
      id: 'custom-sunfolk',
      name: 'Sunfolk',
      color: '#d9a441',
      leaderName: 'Aurelia',
      cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
      primaryTrait: 'scholarly',
      temperamentTraits: ['diplomatic', 'trader'],
    };
    storedSettings = {
      ...createDefaultSettings('small'),
      customCivilizations: [originalCustomCiv],
    };

    showCampaignSetup(
      document.body,
      {
        onStartSolo: () => {},
        onCancel: () => {},
      },
      {
        initialCustomCivilizations: [originalCustomCiv],
      },
    );

    clickButtonWithText('Choose civilization');
    clickButtonWithText('Create Custom Civilization');
    fillAndSaveCustomCiv('Sunfolk');
    await flushAsyncWork();

    expect(storedSettings.customCivilizations).toEqual([
      originalCustomCiv,
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

  it('preserves newer stored custom civs when setup saves from a stale initial registry, even if the slug now collides', async () => {
    const staleCustomCiv: CustomCivDefinition = {
      ...baseCustomCiv,
      id: 'custom-stale-sunfolk',
      name: 'Stale Sunfolk',
    };
    const newerStoredCiv: CustomCivDefinition = {
      ...baseCustomCiv,
      id: 'custom-sunfolk',
      name: 'Sunfolk',
      leaderName: 'Selene',
      cityNames: ['Moonfall', 'Silverkeep', 'Starharbor', 'Nightbloom', 'Lunara', 'Crescenta'],
    };

    storedSettings = {
      ...createDefaultSettings('small'),
      customCivilizations: [staleCustomCiv, newerStoredCiv],
    };

    showCampaignSetup(
      document.body,
      {
        onStartSolo: () => {},
        onCancel: () => {},
      },
      {
        initialCustomCivilizations: [staleCustomCiv],
      },
    );

    clickButtonWithText('Choose civilization');
    clickButtonWithText('Create Custom Civilization');
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

  it('keeps the newer stored version of an existing custom civ when setup saves from a stale snapshot', async () => {
    const staleCustomCiv: CustomCivDefinition = {
      ...baseCustomCiv,
      leaderName: 'Aurelia',
    };
    const newerStoredCiv: CustomCivDefinition = {
      ...baseCustomCiv,
      leaderName: 'Selene',
      cityNames: ['Moonfall', 'Silverkeep', 'Starharbor', 'Nightbloom', 'Lunara', 'Crescenta'],
    };

    storedSettings = {
      ...createDefaultSettings('small'),
      customCivilizations: [newerStoredCiv],
    };

    showCampaignSetup(
      document.body,
      {
        onStartSolo: () => {},
        onCancel: () => {},
      },
      {
        initialCustomCivilizations: [staleCustomCiv],
      },
    );

    clickButtonWithText('Choose civilization');
    clickButtonWithText('Create Custom Civilization');
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

  it('can re-enter solo setup with a newly saved custom civ when the owner refreshes setup state after save', async () => {
    let latestCustomCivilizations: CustomCivDefinition[] = [];

    showCampaignSetup(
      document.body,
      {
        onStartSolo: () => {},
        onCancel: () => {},
        onCustomCivilizationsChanged: (customCivilizations) => {
          latestCustomCivilizations = customCivilizations;
        },
      },
      {
        initialCustomCivilizations: latestCustomCivilizations,
      },
    );

    clickButtonWithText('Choose civilization');
    clickButtonWithText('Create Custom Civilization');
    fillAndSaveCustomCiv('Sunfolk');
    await flushAsyncWork();
    clickButtonWithText('Cancel');

    showCampaignSetup(
      document.body,
      {
        onStartSolo: () => {},
        onCancel: () => {},
        onCustomCivilizationsChanged: (customCivilizations) => {
          latestCustomCivilizations = customCivilizations;
        },
      },
      {
        initialCustomCivilizations: latestCustomCivilizations,
      },
    );

    clickButtonWithText('Choose civilization');
    expect(document.body.textContent).toContain('Sunfolk');
  });
});
