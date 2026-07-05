/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showHotSeatSetup } from '@/ui/hotseat-setup';
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

function click(selector: string): void {
  const element = document.querySelector(selector) as HTMLElement | null;
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
}

function setInputValue(selector: string, value: string): void {
  const input = document.querySelector(selector) as HTMLInputElement | null;
  if (!input) throw new Error(`Missing input: ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function advanceThroughMapType(): void {
  click('#hs-map-type-next');
  click('#hs-challenge-next');
}

function chooseCiv(civId: string): void {
  click(`.civ-card[data-civ-id="${civId}"]`);
  click('#civ-start');
  const reviewStart = document.querySelector<HTMLElement>('#hs-review-start');
  if (reviewStart) reviewStart.click();
}

function primaryCivActionLabel(): string {
  const button = document.querySelector('#civ-start') as HTMLButtonElement | null;
  if (!button) throw new Error('Missing #civ-start button');
  return button.textContent ?? '';
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
  it('defaults geographic maps to balanced placement and hides the choice for generated maps', () => {
    showHotSeatSetup(document.body, {
      onComplete: vi.fn(),
      onCancel: vi.fn(),
    });

    click('[data-size="small"]');
    expect(document.querySelector('[data-placement-mode="balanced"]')?.getAttribute('data-selected'))
      .toBe('true');
    click('[data-map-script="balanced"]');
    expect((document.querySelector('[data-role="start-placement-options"]') as HTMLElement).hidden)
      .toBe(true);
  });

  it('chooses AI count independently and previews exactly that many roster-aware opponents', () => {
    const onComplete = vi.fn();
    showHotSeatSetup(document.body, { onComplete, onCancel: vi.fn() });

    click('[data-size="medium"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('[data-ai-count="2"]');
    click('#hs-names-next');
    chooseCiv('england');
    click('#hs-civ-ready');
    click('.civ-card[data-civ-id="germany"]');
    click('#civ-start');

    expect(document.querySelector('[data-role="hotseat-final-review"]')?.textContent)
      .toContain('AI opponents (2)');
    click('#hs-review-start');

    const config = onComplete.mock.calls[0]![0];
    expect(config.players.filter((player: { isHuman: boolean }) => !player.isHuman)).toHaveLength(2);
    expect(config.startPlacementMode).toBe('balanced');
  });

  it('requires explicit confirmation for a crowded true-start roster', () => {
    const onComplete = vi.fn();
    showHotSeatSetup(document.body, { onComplete, onCancel: vi.fn() });

    click('[data-size="large"]');
    click('[data-placement-mode="historical"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('#hs-names-next');
    chooseCiv('england');
    click('#hs-civ-ready');
    click('.civ-card[data-civ-id="germany"]');
    click('#civ-start');

    expect(document.querySelector('[data-role="historical-crowding-warning"]')).not.toBeNull();
    click('#hs-review-start');
    expect(onComplete).not.toHaveBeenCalled();
    expect(document.querySelector('#hs-review-start')?.textContent)
      .toContain('Start Crowded Historical Game');
    click('#hs-review-start');
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('always routes through opponent challenge selection after launch', () => {
    showHotSeatSetup(document.body, {
      onComplete: vi.fn(),
      onCancel: vi.fn(),
    });

    click('[data-size="small"]');
    click('#hs-map-type-next');

    expect(document.querySelector('[data-opponent-challenge-selector]')).not.toBeNull();
    expect(document.body.textContent).toContain('Choose Opponent Challenge');
  });

  it('chooses challenge as a group before private hot-seat setup and returns it separately', () => {
    const onComplete = vi.fn();
    showHotSeatSetup(
      document.body,
      { onComplete, onCancel: vi.fn() },
    );

    click('[data-size="small"]');
    click('#hs-map-type-next');
    expect(document.body.textContent).toContain('Choose Opponent Challenge');
    expect(document.body.textContent).not.toContain('Player Names');
    click('[data-challenge="explorer"]');
    click('#hs-challenge-next');
    click('[data-count="2"]');
    click('#hs-names-next');
    chooseCiv('egypt');
    click('#hs-civ-ready');
    chooseCiv('rome');

    expect(onComplete).toHaveBeenCalledWith(
      expect.not.objectContaining({ opponentChallenge: expect.anything() }),
      'explorer',
    );
  });

  it('explains that supported map sizes use balanced starts before player-count selection', () => {
    showHotSeatSetup(
      document.body,
      {
        onComplete: () => {},
        onCancel: () => {},
      },
    );

    expect(document.querySelector('[data-role="hotseat-start-spacing-note"]')?.textContent)
      .toContain('Balanced starts keep rival civilizations from beginning next door');
  });

  it('passes custom civ definitions into hot-seat setup selection flow for later players', () => {
    showHotSeatSetup(
      document.body,
      {
        onComplete: () => {},
        onCancel: () => {},
      },
      {
        initialCustomCivilizations: [customCiv],
      },
    );

    click('[data-size="small"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('#hs-names-next');

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
        initialCustomCivilizations: [customCiv],
      },
    );

    click('[data-size="small"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('#hs-names-next');

    const civCard = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => node.textContent?.includes('Sunfolk'));
    expect(civCard).toBeTruthy();
    civCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click('#civ-start');
    click('#hs-civ-ready');

    const secondPlayerCiv = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => !node.textContent?.includes('Sunfolk'));
    expect(secondPlayerCiv).toBeTruthy();
    secondPlayerCiv?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click('#civ-start');
    click('#hs-review-start');

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
    }), 'standard');
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
        initialCustomCivilizations: [customCiv],
      },
    );

    click('[data-size="small"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('#hs-names-next');

    const firstPlayerCiv = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => node.textContent?.includes('Sunfolk'));
    expect(firstPlayerCiv).toBeTruthy();
    firstPlayerCiv?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click('#civ-start');

    click('#hs-civ-ready');
    const secondPlayerCiv = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => !node.textContent?.includes('Sunfolk'));
    expect(secondPlayerCiv).toBeTruthy();
    secondPlayerCiv?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click('#civ-start');
    click('#hs-review-start');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      customCivilizations: [customCiv],
    }), 'standard');
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
        initialCustomCivilizations: [],
      },
    );

    click('[data-size="small"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('#hs-names-next');
    click('[data-action="create-custom-civ"]');
    fillAndSaveCustomCiv('Sunfolk');
    await flushAsyncWork();

    expect(document.querySelectorAll('#civ-select')).toHaveLength(1);
    click('[data-action="create-custom-civ"]');
    expect(document.querySelectorAll('#custom-civ-panel')).toHaveLength(1);
    click('[data-action="cancel-custom-civ"]');
    expect(document.querySelectorAll('#custom-civ-panel')).toHaveLength(0);

    const civCard = Array.from(document.querySelectorAll('.civ-card'))
      .find(node => node.textContent?.includes('Sunfolk'));
    expect(civCard).toBeTruthy();
    civCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click('#civ-start');

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
        initialCustomCivilizations: [customCiv],
      },
    );

    click('[data-size="small"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('#hs-names-next');
    click('[data-action="create-custom-civ"]');
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
        initialCustomCivilizations: [staleCustomCiv],
      },
    );

    click('[data-size="small"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('#hs-names-next');
    click('[data-action="create-custom-civ"]');
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
        initialCustomCivilizations: [staleCustomCiv],
      },
    );

    click('[data-size="small"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('#hs-names-next');
    click('[data-action="create-custom-civ"]');
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

  it('does not finish after the first human chooses a civilization', () => {
    const onComplete = vi.fn();

    showHotSeatSetup(document.body, {
      onComplete,
      onCancel: () => {},
    });

    click('.map-size-card[data-size="small"]');
    advanceThroughMapType();
    click('.count-card[data-count="2"]');
    setInputValue('.player-name-input[data-idx="0"]', 'Alice');
    setInputValue('.player-name-input[data-idx="1"]', 'Bob');
    click('#hs-names-next');

    chooseCiv('egypt');

    expect(onComplete).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Pass the device to');
    expect(document.body.textContent).toContain('Bob');
  });

  it('lets the second human choose a different civilization and completes with both picks', () => {
    const onComplete = vi.fn();

    showHotSeatSetup(document.body, {
      onComplete,
      onCancel: () => {},
    });

    click('.map-size-card[data-size="small"]');
    advanceThroughMapType();
    click('.count-card[data-count="2"]');
    setInputValue('.player-name-input[data-idx="0"]', 'Alice');
    setInputValue('.player-name-input[data-idx="1"]', 'Bob');
    click('#hs-names-next');

    chooseCiv('egypt');
    click('#hs-civ-ready');

    expect(document.body.textContent).toContain('Bob, choose your civilization');
    expect((document.querySelector('.civ-card[data-civ-id="egypt"]') as HTMLElement).style.cssText).toContain('pointer-events: none;');

    chooseCiv('rome');

    expect(onComplete).toHaveBeenCalledTimes(1);
    const config = onComplete.mock.calls[0][0];
    const humanPlayers = config.players.filter((player: { isHuman: boolean }) => player.isHuman);
    expect(humanPlayers).toEqual([
      expect.objectContaining({ name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true }),
      expect.objectContaining({ name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true }),
    ]);
  });

  it('shows Next Player as the civ-pick CTA for non-final human players', () => {
    showHotSeatSetup(document.body, {
      onComplete: () => {},
      onCancel: () => {},
    });

    click('.map-size-card[data-size="small"]');
    advanceThroughMapType();
    click('.count-card[data-count="2"]');
    setInputValue('.player-name-input[data-idx="0"]', 'Alice');
    setInputValue('.player-name-input[data-idx="1"]', 'Bob');
    click('#hs-names-next');

    expect(document.body.textContent).toContain('Alice, choose your civilization');
    expect(primaryCivActionLabel()).toBe('Next Player');
  });

  it('shows Start Game as the civ-pick CTA for the final human player', () => {
    showHotSeatSetup(document.body, {
      onComplete: () => {},
      onCancel: () => {},
    });

    click('.map-size-card[data-size="small"]');
    advanceThroughMapType();
    click('.count-card[data-count="2"]');
    setInputValue('.player-name-input[data-idx="0"]', 'Alice');
    setInputValue('.player-name-input[data-idx="1"]', 'Bob');
    click('#hs-names-next');

    chooseCiv('egypt');
    click('#hs-civ-ready');

    expect(document.body.textContent).toContain('Bob, choose your civilization');
    expect(primaryCivActionLabel()).toBe('Start Game');
  });

  describe('map type stage', () => {
    it('shows the map type stage after selecting a map size', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');

      expect(document.querySelector('[data-map-script="earth"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="old-world"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="new-world"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="balanced"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="single-continent"]')).toBeTruthy();
    });

    it('pre-selects earth and shows a description', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');

      const earthCard = document.querySelector('[data-map-script="earth"]') as HTMLElement | null;
      expect(earthCard?.dataset.selected).toBe('true');
      expect(document.querySelector('[data-role="map-script-description"]')?.textContent?.length).toBeGreaterThan(0);
    });

    it('updates description when a different map type is clicked', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');
      const earthDesc = document.querySelector('[data-role="map-script-description"]')?.textContent ?? '';

      click('[data-map-script="balanced"]');
      const balancedDesc = document.querySelector('[data-role="map-script-description"]')?.textContent ?? '';

      expect(balancedDesc).not.toBe(earthDesc);
      expect(balancedDesc.length).toBeGreaterThan(0);
    });

    it('advances to player count after clicking Next', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');
      advanceThroughMapType();

      expect(document.querySelector('.count-card[data-count="2"]')).toBeTruthy();
    });

    it('returns to map size stage when Back is clicked from the map type stage', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');
      expect(document.querySelector('[data-map-script="earth"]')).toBeTruthy();

      click('#hs-back-map-size');

      expect(document.querySelector('[data-size="small"]')).toBeTruthy();
      expect(document.querySelector('[data-map-script="earth"]')).toBeFalsy();
    });

    it('returns to map type stage (not map size) when Back is clicked from player count', () => {
      showHotSeatSetup(document.body, { onComplete: () => {}, onCancel: () => {} });

      click('[data-size="small"]');
      advanceThroughMapType();
      expect(document.querySelector('.count-card[data-count="2"]')).toBeTruthy();

      click('#hs-back-size');

      expect(document.querySelector('[data-map-script="earth"]')).toBeTruthy();
      expect(document.querySelector('[data-size="small"]')).toBeFalsy();
    });

    it('passes the selected map script to onComplete', () => {
      const onComplete = vi.fn();
      showHotSeatSetup(document.body, { onComplete, onCancel: () => {} });

      click('[data-size="small"]');
      click('[data-map-script="balanced"]');
      advanceThroughMapType();
      click('[data-count="2"]');
      setInputValue('.player-name-input[data-idx="0"]', 'Alice');
      setInputValue('.player-name-input[data-idx="1"]', 'Bob');
      click('#hs-names-next');
      chooseCiv('egypt');
      click('#hs-civ-ready');
      chooseCiv('rome');

      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        mapScript: 'balanced',
      }), 'standard');
    });

    it('defaults to earth when no map type card is clicked before Next', () => {
      const onComplete = vi.fn();
      showHotSeatSetup(document.body, { onComplete, onCancel: () => {} });

      click('[data-size="small"]');
      // do not click any map type card — just advance
      advanceThroughMapType();
      click('[data-count="2"]');
      setInputValue('.player-name-input[data-idx="0"]', 'Alice');
      setInputValue('.player-name-input[data-idx="1"]', 'Bob');
      click('#hs-names-next');
      chooseCiv('egypt');
      click('#hs-civ-ready');
      chooseCiv('rome');

      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        mapScript: 'earth',
      }), 'standard');
    });
  });
});
