// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { CustomCivDefinition, GameState } from '@/core/types';
import { migrateLegacyNamingState } from '@/storage/save-manager';
import { createCouncilPanel } from '@/ui/council-panel';
import { createCivSelectPanel } from '@/ui/civ-select';
import { showCampaignSetup } from '@/ui/campaign-setup';
import { getPlayableCivDefinitions, resolveCivDefinition } from '@/systems/civ-registry';
import { collectUsedCityNames } from '@/systems/city-name-system';
import { foundCity } from '@/systems/city-system';

const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

function renderCouncilForAcceptance(state: GameState): HTMLElement {
  const container = document.createElement('div');
  return createCouncilPanel(container, state, {
    onClose: () => {},
    onTalkLevelChange: () => {},
  });
}

function renderCivSelectForAcceptance(state: GameState): HTMLElement {
  const container = document.createElement('div');
  return createCivSelectPanel(container, { onSelect: () => {} }, {
    civDefinitions: getPlayableCivDefinitions(state.settings),
  });
}

function startSoloCampaignFromSetup(savedCustomCivilizations: CustomCivDefinition[]) {
  const onStartSolo = vi.fn();

  showCampaignSetup(
    document.body,
    {
      onStartSolo,
      onCancel: () => {},
    },
    {
      initialCustomCivilizations: savedCustomCivilizations,
    },
  );

  (document.querySelector('[data-action="choose-civ"]') as HTMLButtonElement).click();
  const civCard = Array.from(document.querySelectorAll('.civ-card'))
    .find(node => node.textContent?.includes('Sunfolk'));
  civCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  (document.querySelector('#civ-start') as HTMLButtonElement).click();
  (document.querySelector('#campaign-title') as HTMLInputElement).value = 'Saved Sunfolk Campaign';
  const startButton = Array.from(document.querySelectorAll('button'))
    .find(button => button.textContent === 'Start Campaign') as HTMLButtonElement | undefined;
  startButton?.click();

  expect(onStartSolo).toHaveBeenCalledTimes(1);
  return onStartSolo.mock.calls[0][0];
}

describe('m4e acceptance', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps council guidance trustworthy after all five slices land', () => {
    const game = createNewGame({
      civType: 'custom-sunfolk',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'M4e Acceptance',
      customCivilizations: [customCiv],
    });

    const council = renderCouncilForAcceptance(game);
    const civSelect = renderCivSelectForAcceptance(game);

    expect(council.textContent).toContain('Do Now');
    expect(council.textContent).not.toContain('Unknown leak');
    expect(civSelect.textContent).toContain('Wakanda');
    expect(civSelect.textContent).toContain('Avalon');
  });

  it('formats recalled council callbacks from current labels after naming normalization', () => {
    const game = createNewGame({
      civType: 'custom-sunfolk',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Naming Acceptance',
      customCivilizations: [customCiv],
    });

    game.cities['city-alpha'] = {
      id: 'city-alpha',
      name: 'Rome',
      owner: 'player',
      position: { q: 4, r: 4 },
      population: 2,
      food: 0,
      foodNeeded: 15,
      buildings: [],
      productionQueue: [],
      productionProgress: 0,
      ownedTiles: [{ q: 4, r: 4 }],
      workedTiles: [],
      focus: 'balanced',
      maturity: 'outpost',
      grid: [[null]],
      gridSize: 3,
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    };
    game.cities['city-beta'] = {
      ...game.cities['city-alpha'],
      id: 'city-beta',
      position: { q: 8, r: 8 },
    };
    game.civilizations.player.cities = ['city-alpha', 'city-beta'];
    game.councilMemory = {
      player: {
        entries: [
          {
            key: 'watch-rival-harbor',
            advisor: 'spymaster',
            kind: 'watch-rival-city',
            turn: 12,
            subjects: { civId: 'ai-1', cityId: 'city-beta' },
            outcome: 'pending',
          },
        ],
        eraCallbackCount: 0,
        callbackEra: game.era,
      },
    };

    const normalized = migrateLegacyNamingState(game);
    const council = renderCouncilForAcceptance(normalized);

    expect(council.textContent).not.toContain('city-beta');
    expect(council.textContent).not.toContain('Unknown leak');
  });

  it('keeps a saved custom civ registry authoritative from setup-shaped config into runtime naming', () => {
    const savedCustomCivilizations = [customCiv];
    const setupConfig = startSoloCampaignFromSetup(savedCustomCivilizations);

    const state = createNewGame(setupConfig);
    const resolved = resolveCivDefinition(state, 'custom-sunfolk');
    const playerSettler = state.units[state.civilizations.player.units[0]];
    const foundedCity = foundCity('player', playerSettler.position, state.map, {
      civType: state.civilizations.player.civType,
      namingPool: resolved?.cityNames,
      usedNames: collectUsedCityNames(state),
      civName: resolved?.name,
    });

    expect(state.settings.customCivilizations).toEqual(savedCustomCivilizations);
    expect(resolved?.id).toBe('custom-sunfolk');
    expect(resolved?.name).toBe('Sunfolk');
    expect(foundedCity.name).toBe('Solara');
    expect(customCiv.cityNames).toContain(foundedCity.name);
  });
});
