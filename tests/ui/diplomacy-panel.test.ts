// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import {
  acceptDiplomaticRequest,
  enqueuePeaceRequest,
  rejectDiplomaticRequest,
} from '@/systems/diplomacy-system';
import { EventBus } from '@/core/event-bus';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
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

  it('does not leak an undiscovered city name through a city-state quest row', () => {
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
        activeQuests: {
          player: {
            id: 'quest-1',
            type: 'defeat_units',
            description: 'Clear 2 units from Rome',
            target: { type: 'defeat_units', count: 2, nearPosition: { q: 6, r: 0 }, radius: 8, cityId: 'rome' } as any,
            reward: { relationshipBonus: 20 },
            progress: 0,
            status: 'active',
            turnIssued: 1,
            expiresOnTurn: 21,
          },
        },
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
    state.civilizations.player.visibility.tiles['6,0'] = 'fog';
    state.cities.rome = {
      ...state.cities['city-border'],
      id: 'rome',
      owner: 'outsider',
      name: 'Rome',
      position: { q: 7, r: 0 },
      ownedTiles: [{ q: 7, r: 0 }],
    };

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('foreign city');
    expect(rendered).not.toContain('Rome');
  });

  it('uses state.currentPlayer contact memory in hot-seat instead of leaking another players contacts', () => {
    const { container, state } = makeDiplomacyFixture({
      currentPlayer: 'player-2',
      includeThirdCiv: true,
    });
    state.civilizations.player.knownCivilizations = ['outsider'];
    state.civilizations['player-2'].visibility = { tiles: {} };

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Unknown Civilization');
    expect(rendered).not.toContain('Outsider');
  });

  it('keeps a rival named in diplomacy after brief scouting contact is recorded', () => {
    const { container, state } = makeDiplomacyFixture({
      currentPlayer: 'player',
      includeThirdCiv: true,
    });
    state.civilizations.player.knownCivilizations = ['outsider'];
    state.civilizations.outsider.knownCivilizations = ['player'];

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Outsider');
    expect(rendered).not.toContain('Unknown Civilization');
  });

  it('uses the shared presentation helper for discovered city-state names', () => {
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
        activeQuests: {},
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
    state.civilizations.player.visibility.tiles['6,0'] = 'fog';

    const presentation = getMinorCivPresentationForPlayer(state, 'player', 'mc-sparta');
    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain(presentation.name);
  });

  it('shows Peace Requested instead of Request Peace for an outbound proposal', () => {
    const { container, state: baseState } = makeDiplomacyFixture({
      currentPlayer: 'player',
      includeThirdCiv: true,
    });
    let state = baseState;
    state.civilizations.player.diplomacy.atWarWith = ['outsider'];
    state.civilizations.outsider.diplomacy.atWarWith = ['player'];
    state = enqueuePeaceRequest(state, 'player', 'outsider');

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Peace Requested');
    expect(panel.textContent).not.toContain('request peace');
  });

  it('shows Accept Peace and Reject Peace for an incoming proposal', () => {
    const { container, state: baseState } = makeDiplomacyFixture({
      currentPlayer: 'player',
      includeThirdCiv: true,
    });
    let state = baseState;
    state.civilizations.player.diplomacy.atWarWith = ['outsider'];
    state.civilizations.outsider.diplomacy.atWarWith = ['player'];
    state = enqueuePeaceRequest(state, 'outsider', 'player');

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onAcceptPeaceRequest: () => {},
      onRejectPeaceRequest: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Accept Peace');
    expect(panel.textContent).toContain('Reject Peace');
    expect(panel.textContent).not.toContain('request peace');
  });

  it('updates the open panel immediately after accepting an incoming proposal', () => {
    const { container, state } = makeDiplomacyFixture({
      currentPlayer: 'player',
      includeThirdCiv: true,
    });
    state.civilizations.player.diplomacy.atWarWith = ['outsider'];
    state.civilizations.outsider.diplomacy.atWarWith = ['player'];
    let nextState = enqueuePeaceRequest(state, 'outsider', 'player');
    const bus = new EventBus();

    const render = () => createDiplomacyPanel(container, nextState, {
      onAction: () => {},
      onAcceptPeaceRequest: (requestId) => {
        nextState = acceptDiplomaticRequest(nextState, 'player', requestId, bus);
        render();
      },
      onRejectPeaceRequest: (requestId) => {
        nextState = rejectDiplomaticRequest(nextState, 'player', requestId);
        render();
      },
      onClose: () => {},
    });

    let panel = render();
    (panel.querySelector('[data-action="accept-peace-request"]') as HTMLButtonElement).click();
    panel = container.querySelector('#diplomacy-panel') as HTMLElement;

    expect(panel.textContent).not.toContain('Accept Peace');
    expect(panel.textContent).not.toContain('Reject Peace');
    expect(panel.textContent).not.toContain('Peace Requested');
    expect(panel.textContent).toContain('declare war');
  });
});
