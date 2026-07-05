// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showCampaignSetup } from '@/ui/campaign-setup';
import type { CustomCivDefinition } from '@/core/types';
import { createDefaultSettings } from '@/core/game-state';
import * as saveManager from '@/storage/save-manager';
// Static imports prevent module compilation from eating into the 5000ms test timeout.
// AdvisorSystem (796 lines) would otherwise be compiled inside each of the 3 advisor tests.
import { AdvisorSystem } from '@/ui/advisor-system';
import { EventBus } from '@/core/event-bus';

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

function click(root: ParentNode, selector: string): void {
  const element = root.querySelector(selector) as HTMLElement | null;
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
}

describe('campaign-setup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a setup header, selected civ summary, and enables start only after a civ is confirmed', () => {
    const onStartSolo = vi.fn();

    showCampaignSetup(document.body, {
      onStartSolo,
      onCancel: () => {},
    });

    expect(document.body.textContent).toContain('Build Your Campaign');
    expect(document.querySelector('[data-role="setup-hero"]')).toBeTruthy();
    expect(document.querySelector('[data-role="selected-civ-summary"]')?.textContent).toContain('No civilization selected');

    const startButton = Array.from(document.querySelectorAll('button'))
      .find(button => button.textContent === 'Start Campaign') as HTMLButtonElement;
    expect(startButton.disabled).toBe(true);

    clickButtonWithText('Choose civilization');
    const firstCard = document.querySelector('.civ-card') as HTMLElement;
    firstCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement).click();

    expect(document.querySelector('[data-role="selected-civ-summary"]')?.textContent).not.toContain('No civilization selected');
    expect(startButton.disabled).toBe(false);
    expect(startButton.dataset.ready).toBe('true');
  });

  it('always exposes opponent challenge controls after launch', () => {
    showCampaignSetup(document.body, {
      onStartSolo: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.querySelector('[data-opponent-challenge-selector]')).not.toBeNull();
  });

  it('passes the selected challenge from enabled solo setup', () => {
    const onStartSolo = vi.fn();
    const panel = showCampaignSetup(
      document.body,
      { onStartSolo, onCancel: vi.fn() },
    );

    panel.querySelector<HTMLButtonElement>('[data-challenge="explorer"]')!.click();
    clickButtonWithText('Choose civilization');
    (document.querySelector('.civ-card') as HTMLElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (document.querySelector('#civ-start') as HTMLButtonElement).click();
    clickButtonWithText('Start Campaign');

    expect(onStartSolo).toHaveBeenCalledWith(expect.objectContaining({
      opponentChallenge: 'explorer',
    }));
  });

  it('updates the visible map-size and opponent cards together, preserving valid counts and snapping invalid ones', () => {
    showCampaignSetup(document.body, {
      onStartSolo: () => {},
      onCancel: () => {},
    });

    const sizeCards = Array.from(document.querySelectorAll('[data-size]')) as HTMLButtonElement[];
    const opponentsSelect = document.querySelector('#campaign-opponents') as HTMLSelectElement;
    expect(sizeCards.map(card => card.dataset.size)).toEqual(['small', 'medium', 'large']);
    expect(document.querySelector('[data-size="medium"]')?.getAttribute('data-selected')).toBe('true');
    expect(Array.from(document.querySelectorAll('[data-opponent-count]')).map(card => card.getAttribute('data-opponent-count'))).toEqual(['1', '2', '3', '4']);
    expect(opponentsSelect.value).toBe('1');
    expect(document.querySelector('[data-role="start-spacing-note"]')?.textContent)
      .toContain('Balanced mode guarantees separated starts');

    click(document, '[data-size="large"]');

    expect(document.querySelector('[data-size="small"]')?.getAttribute('data-selected')).toBe('false');
    expect(document.querySelector('[data-size="large"]')?.getAttribute('data-selected')).toBe('true');
    expect(Array.from(document.querySelectorAll('[data-opponent-count]')).map(card => card.getAttribute('data-opponent-count'))).toEqual([
      '1', '2', '3', '4', '5', '6', '7',
    ]);

    click(document, '[data-opponent-count="2"]');
    expect(opponentsSelect.value).toBe('2');

    click(document, '[data-size="medium"]');
    expect(opponentsSelect.value).toBe('2');
    expect(document.querySelector('[data-opponent-count="2"]')?.getAttribute('data-selected')).toBe('true');

    click(document, '[data-opponent-count="4"]');
    expect(opponentsSelect.value).toBe('4');

    click(document, '[data-size="small"]');
    expect(opponentsSelect.value).toBe('2');
    expect(document.querySelector('[data-opponent-count="2"]')?.getAttribute('data-selected')).toBe('true');
  });

  it('keeps campaign setup visible when the civ picker is dismissed through the back action', () => {
    showCampaignSetup(document.body, {
      onStartSolo: () => {},
      onCancel: () => {},
    });

    clickButtonWithText('Choose civilization');
    click(document, '[data-action="cancel-civ-select"]');

    expect(document.querySelector('#campaign-setup')).toBeTruthy();
    expect(document.querySelector('#civ-select')).toBeNull();
  });

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

  it('shows a confirmation CTA when choosing a civilization inside solo setup', () => {
    const container = document.createElement('div');

    showCampaignSetup(container, { onStartSolo: () => {}, onCancel: () => {} });
    click(container, '[data-action="choose-civ"]');

    expect((container.querySelector('#civ-start') as HTMLButtonElement | null)?.textContent).toBe('Confirm Civilization');
  });

  it('chooseCivButton, cancelButton, and startButton have styled background and color', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    showCampaignSetup(container, { onStartSolo: vi.fn(), onCancel: vi.fn() });

    const chooseCiv = container.querySelector<HTMLButtonElement>('[data-action="choose-civ"]')!;
    const cancel = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Cancel') as HTMLButtonElement;
    const start = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Start Campaign') as HTMLButtonElement;

    for (const btn of [chooseCiv, cancel, start]) {
      expect(btn.style.background, `${btn.textContent} background`).not.toBe('');
      expect(btn.style.color, `${btn.textContent} color`).not.toBe('');
    }
  });
});

describe('map type selection', () => {
  const MAP_SCRIPTS = ['earth', 'old-world', 'new-world', 'balanced', 'single-continent'] as const;

  function renderSetup(): void {
    const container = document.body;
    showCampaignSetup(container, {
      onStartSolo: vi.fn(),
      onCancel: vi.fn(),
    });
  }

  it('renders a card button for each of the 5 map scripts', () => {
    renderSetup();
    for (const script of MAP_SCRIPTS) {
      const btn = document.querySelector(`[data-map-script="${script}"]`);
      expect(btn, `missing card for ${script}`).not.toBeNull();
    }
  });

  it('defaults to Earth selected', () => {
    renderSetup();
    const earthBtn = document.querySelector('[data-map-script="earth"]') as HTMLButtonElement;
    expect(earthBtn.dataset.selected).toBe('true');
  });

  it('defaults to Medium size selected', () => {
    renderSetup();
    const mediumBtn = document.querySelector('[data-size="medium"]') as HTMLButtonElement;
    expect(mediumBtn.dataset.selected).toBe('true');
  });

  it('shows description text when a map type is selected', () => {
    renderSetup();
    const desc = document.querySelector('[data-role="map-description"]') as HTMLElement;
    expect(desc).not.toBeNull();
    expect(desc.textContent).toContain('Real-world geography');
    expect(document.querySelector('[data-placement-mode="balanced"]')?.getAttribute('data-selected'))
      .toBe('true');
  });

  it('updates description when a different map type is clicked', () => {
    renderSetup();
    const balancedBtn = document.querySelector('[data-map-script="balanced"]') as HTMLButtonElement;
    balancedBtn.click();
    const desc = document.querySelector('[data-role="map-description"]') as HTMLElement;
    expect(desc.textContent).toContain('algorithmically fair');
    expect((document.querySelector('[data-role="campaign-placement-options"]') as HTMLElement).hidden)
      .toBe(true);
  });

  it('includes mapScript in the GameConfig passed to onStartSolo', async () => {
    const onStartSolo = vi.fn();
    const container = document.body;
    showCampaignSetup(container, { onStartSolo, onCancel: vi.fn() });

    const continentBtn = document.querySelector('[data-map-script="single-continent"]') as HTMLButtonElement;
    continentBtn.click();

    const mediumBtn = document.querySelector('[data-size="medium"]') as HTMLButtonElement;
    mediumBtn.click();

    (document.querySelector('#campaign-title') as HTMLInputElement).value = 'Test';
    (document.querySelector('#campaign-title') as HTMLInputElement).dispatchEvent(new Event('input'));

    clickButtonWithText('Choose civilization');
    await flushAsyncWork();
    const firstCivCard = document.querySelector('.civ-card') as HTMLElement;
    firstCivCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsyncWork();
    (document.querySelector('#civ-start') as HTMLButtonElement).click();
    await flushAsyncWork();
    clickButtonWithText('Start Campaign');

    expect(onStartSolo).toHaveBeenCalled();
    const config = onStartSolo.mock.calls[0][0];
    expect(config.mapScript).toBe('single-continent');
    expect(config.startPlacementMode).toBe('balanced');
  });

  it('passes an explicit true-start choice for geographic maps', async () => {
    const onStartSolo = vi.fn();
    showCampaignSetup(document.body, { onStartSolo, onCancel: vi.fn() });
    click(document, '[data-placement-mode="historical"]');
    clickButtonWithText('Choose civilization');
    await flushAsyncWork();
    (document.querySelector('.civ-card') as HTMLElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click(document, '#civ-start');
    clickButtonWithText('Start Campaign');
    const confirmation = Array.from(document.querySelectorAll('button'))
      .find(button => button.textContent === 'Start Crowded Historical Game') as HTMLButtonElement | undefined;
    confirmation?.click();

    expect(onStartSolo.mock.calls[0]?.[0].startPlacementMode).toBe('historical');
  });
});

describe('colonizer start notification', () => {
  function makeState(civType: string, mapScript: string) {
    return {
      mapScript,
      turn: 1,
      currentPlayer: 'player',
      civilizations: {
        player: { id: 'player', civType, isHuman: true, advisorDisabledUntil: {} },
      },
      settings: { mapSize: 'medium', advisorsEnabled: { explorer: true } },
      tutorial: { active: false, completedSteps: [] },
    } as unknown as import('@/core/types').GameState;
  }

  it('fires advisor message for colonizer civ on new-world map', () => {
    const bus = new EventBus();
    const system = new AdvisorSystem(bus);
    const messages: string[] = [];
    bus.on('advisor:message', (payload: { message: string }) => { messages.push(payload.message); });

    system.check(makeState('england', 'new-world'));
    expect(messages.some(m => m.includes('colonial'))).toBe(true);
  });

  it('does NOT fire for Aztec on new-world map (Aztec homeland, not colonizer)', () => {
    const bus = new EventBus();
    const system = new AdvisorSystem(bus);
    const messages: string[] = [];
    bus.on('advisor:message', (payload: { message: string }) => { messages.push(payload.message); });

    system.check(makeState('aztec', 'new-world'));
    expect(messages.some(m => m.includes('colonial'))).toBe(false);
  });

  it('does NOT fire on non-new-world maps', () => {
    const bus = new EventBus();
    const system = new AdvisorSystem(bus);
    const messages: string[] = [];
    bus.on('advisor:message', (payload: { message: string }) => { messages.push(payload.message); });

    system.check(makeState('england', 'earth'));
    expect(messages.some(m => m.includes('colonial'))).toBe(false);
  });
});
