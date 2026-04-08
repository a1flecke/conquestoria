import { describe, it, expect } from 'vitest';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { makeDiplomacyFixture } from './helpers/diplomacy-fixture';

describe('diplomacy-panel breakaway rows', () => {
  it('renders breakaway status, countdown, and reabsorb action for the current player only', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player-2', includeBreakaway: true });
    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Breakaway');
    expect(rendered).toContain('50 turns');
    expect(rendered).toContain('reabsorb breakaway');
    expect(rendered).not.toContain('player-1 hidden spies');
  });

  it('hides the reabsorb action when the current player lacks the required relationship or gold', () => {
    const { container, state } = makeDiplomacyFixture({
      currentPlayer: 'player-2',
      includeBreakaway: true,
      relationship: 45,
      gold: 150,
    });
    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Breakaway');
    expect(rendered).not.toContain('reabsorb breakaway');
  });

  it('renders unmet major civs as Unknown Civilization placeholders', () => {
    const { container, state } = makeDiplomacyFixture({
      currentPlayer: 'player',
      includeBreakaway: true,
      includeThirdCiv: true,
    });
    delete state.civilizations.player.visibility.tiles['4,0'];

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Unknown Civilization');
    expect(rendered).not.toContain('Outsider');
  });

  it('omits undiscovered city-states from the panel', () => {
    const { container, state } = makeDiplomacyFixture({
      currentPlayer: 'player',
      includeBreakaway: true,
    });
    state.minorCivs = {
      'mc-sparta': {
        id: 'mc-sparta',
        definitionId: 'sparta',
        cityId: 'mc-city',
        units: [],
        diplomacy: state.civilizations.player.diplomacy,
        activeQuests: { player: { id: 'quest-1', type: 'gift_gold', description: 'Gift 25 gold', target: { type: 'gift_gold', amount: 25 }, reward: { relationshipBonus: 20 }, progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21 } },
        isDestroyed: false,
        garrisonCooldown: 0,
        lastEraUpgrade: 0,
      },
    };
    state.cities['mc-city'] = {
      ...state.cities['city-border'],
      id: 'mc-city',
      owner: 'mc-sparta',
      position: { q: 6, r: 0 },
      ownedTiles: [{ q: 6, r: 0 }],
    };

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).not.toContain('Sparta');
    expect(rendered).not.toContain('Gift 25 gold');
  });
});
