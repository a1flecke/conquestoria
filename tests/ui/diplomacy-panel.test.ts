// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import {
  acceptDiplomaticRequest,
  enqueuePeaceRequest,
  enqueueTreatyProposal,
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

  it('omits unmet major civs from the panel', () => {
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
    expect(rendered).not.toContain('Unknown Civilization');
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
        chainStatusByCiv: {},
        questCooldownUntilByCiv: {},
        lastNotifiedStatusByCiv: {},
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
        chainStatusByCiv: {},
        questCooldownUntilByCiv: {},
        lastNotifiedStatusByCiv: {},
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
    expect(rendered).not.toContain('Unknown Civilization');
    expect(rendered).not.toContain('Outsider');
  });

  it('hides an eliminated civ (isEliminated flag) from the diplomacy panel', () => {
    const { container, state } = makeDiplomacyFixture({
      currentPlayer: 'player',
      includeThirdCiv: true,
    });
    state.civilizations.player.knownCivilizations = ['outsider'];
    state.civilizations.outsider.knownCivilizations = ['player'];
    state.civilizations.outsider.isEliminated = true;

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
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
        chainStatusByCiv: {},
        questCooldownUntilByCiv: {},
        lastNotifiedStatusByCiv: {},
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

  it('renders chain step details and exact disabled festival requirements for the current viewer', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player' });
    state.minorCivs['mc-alexandria'] = {
      id: 'mc-alexandria', definitionId: 'alexandria', cityId: 'mc-city', units: [],
      diplomacy: state.civilizations.player.diplomacy,
      activeQuests: {
        player: {
          id: 'quest-festival', type: 'sponsor_festival', description: 'Sponsor the Festival of Ideas',
          target: { type: 'sponsor_festival', amount: 50, requiresLuxury: true },
          reward: { relationshipBonus: 25 }, progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: state.turn,
          chainId: 'festivals-and-exchange', stepIndex: 2,
        },
      },
      chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
      isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
    };
    state.cities['mc-city'] = {
      ...state.cities['city-border'], id: 'mc-city', owner: 'mc-alexandria',
      position: { q: 6, r: 0 }, ownedTiles: [{ q: 6, r: 0 }],
    };
    state.civilizations.player.visibility.tiles['6,0'] = 'fog';

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });
    const festival = panel.querySelector<HTMLButtonElement>('[data-action="sponsor-festival"]');

    expect(panel.textContent).toContain('Festivals And Exchange');
    expect(panel.textContent).toContain('Step 3 of 3');
    expect(panel.textContent).toContain('0 turns remaining');
    expect(panel.textContent).toContain('Requires access to any luxury resource.');
    expect(festival?.disabled).toBe(true);
  });

  it('renders regional grievance posture and reparations action for the current viewer', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player' });
    state.era = 2;
    state.minorCivs['mc-sparta'] = {
      id: 'mc-sparta', definitionId: 'sparta', cityId: 'mc-city', units: [],
      diplomacy: state.civilizations.player.diplomacy,
      activeQuests: {},
      chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
      regionalGrievanceByCiv: {
        player: {
          targetCivId: 'player',
          pressure: 55,
          status: 'mobilizing',
          lastUpdatedTurn: state.turn,
          causes: [],
        },
      },
      isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
    };
    state.cities['mc-city'] = {
      ...state.cities['city-border'], id: 'mc-city', owner: 'mc-sparta',
      position: { q: 6, r: 0 }, ownedTiles: [{ q: 6, r: 0 }],
    };
    state.civilizations.player.visibility.tiles['6,0'] = 'fog';
    let repaired: string | null = null;

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onMinorCivReparations: mcId => { repaired = mcId; },
      onClose: () => {},
    });
    const button = panel.querySelector<HTMLButtonElement>('[data-action="pay-reparations"]');

    expect(panel.textContent).toContain('Regional grievance: Mobilizing');
    expect(panel.textContent).not.toContain('(55)');
    expect(button?.textContent).toBe('Pay Reparations (60 Gold)');
    button?.click();
    expect(repaired).toBe('mc-sparta');
  });

  it('renders broad economy posture without hiding city-state actions', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player' });
    state.minorCivs['mc-sparta'] = {
      id: 'mc-sparta', definitionId: 'sparta', cityId: 'mc-city', units: [],
      diplomacy: state.civilizations.player.diplomacy,
      activeQuests: {},
      chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
      regionalGrievanceByCiv: {
        player: { targetCivId: 'player', pressure: 55, status: 'mobilizing', lastUpdatedTurn: state.turn, causes: [] },
      },
      economy: {
        policy: 'defense',
        posture: 'mobilizing',
        lastProcessedTurn: state.turn,
        recentProductionSummary: { itemId: 'warrior', itemClass: 'unit', completedTurn: state.turn },
      },
      isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
    };
    state.cities['mc-city'] = {
      ...state.cities['city-border'], id: 'mc-city', owner: 'mc-sparta',
      position: { q: 6, r: 0 }, ownedTiles: [{ q: 6, r: 0 }],
    };
    state.civilizations.player.visibility.tiles['6,0'] = 'fog';

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    expect(panel.textContent).toContain('Regional grievance: Mobilizing');
    expect(panel.textContent).toContain('training defenders');
    expect(panel.textContent).not.toContain('warrior');
    expect(panel.querySelector('.mc-gift')).not.toBeNull();
    expect(panel.querySelector('.mc-war')).not.toBeNull();
  });

  it('rerenders reparations cooling into economy posture without double charging from stale DOM', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player' });
    state.civilizations.player.gold = 200;
    state.minorCivs['mc-sparta'] = {
      id: 'mc-sparta', definitionId: 'sparta', cityId: 'mc-city', units: [],
      diplomacy: state.civilizations.player.diplomacy,
      activeQuests: {},
      chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
      regionalGrievanceByCiv: {
        player: { targetCivId: 'player', pressure: 25, status: 'wary', lastUpdatedTurn: state.turn, causes: [] },
      },
      economy: { policy: 'defense', posture: 'fortifying', lastProcessedTurn: state.turn },
      isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
    };
    state.cities['mc-city'] = {
      ...state.cities['city-border'], id: 'mc-city', owner: 'mc-sparta',
      position: { q: 6, r: 0 }, ownedTiles: [{ q: 6, r: 0 }],
    };
    state.civilizations.player.visibility.tiles['6,0'] = 'fog';
    let currentState = state;
    const render = (): HTMLElement => createDiplomacyPanel(container, currentState, {
      onAction: () => {},
      onMinorCivReparations: mcId => {
        currentState.minorCivs[mcId].regionalGrievanceByCiv!.player.pressure = 5;
        currentState.minorCivs[mcId].regionalGrievanceByCiv!.player.status = 'wary';
        currentState.minorCivs[mcId].economy = { ...currentState.minorCivs[mcId].economy!, posture: 'settled' };
        currentState.civilizations.player.gold -= 60;
        render();
      },
      onClose: () => {},
    });

    const panel = render();
    const button = panel.querySelector<HTMLButtonElement>('[data-action="pay-reparations"]')!;
    button.click();
    button.click();
    const rerendered = container.querySelector('#diplomacy-panel') as HTMLElement;

    expect(currentState.civilizations.player.gold).toBe(140);
    expect(rerendered.textContent).not.toContain('Pay Reparations');
    expect(rerendered.textContent).not.toContain('(25)');
  });

  it('does not render another hot-seat player assignment', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player-2' });
    state.minorCivs['mc-sparta'] = {
      id: 'mc-sparta', definitionId: 'sparta', cityId: 'mc-city', units: [],
      diplomacy: state.civilizations['player-2'].diplomacy,
      activeQuests: {
        player: {
          id: 'quest-private', type: 'gift_gold', description: 'player-a-only-target',
          target: { type: 'gift_gold', amount: 100 }, reward: { relationshipBonus: 20 },
          progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
        },
        'player-2': {
          id: 'quest-viewer', type: 'gift_gold', description: 'viewer-target',
          target: { type: 'gift_gold', amount: 25 }, reward: { relationshipBonus: 20 },
          progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
        },
      },
      chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
      isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
    };
    state.cities['mc-city'] = {
      ...state.cities['city-border'], id: 'mc-city', owner: 'mc-sparta',
      position: { q: 6, r: 0 }, ownedTiles: [{ q: 6, r: 0 }],
    };
    state.civilizations['player-2'].visibility.tiles['6,0'] = 'fog';

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    expect(panel.textContent).toContain('Gift 25 gold');
    expect(panel.textContent).not.toContain('100 gold');
    expect(panel.textContent).not.toContain('player-a-only-target');
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

describe('diplomacy-panel treaty proposals + war attribution (#554)', () => {
  it('renders an incoming treaty proposal with accept/decline and fires callbacks', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    // A real proposal implies the civs have already made contact -- panel
    // visibility (shouldListMajorCivForViewer) requires contact memory, which
    // a bare pending proposal alone doesn't establish.
    state.civilizations.player.knownCivilizations = ['outsider'];
    const next = enqueueTreatyProposal(state, 'outsider', 'player', 'non_aggression_pact', 10);
    const onAccept = vi.fn();
    const onDecline = vi.fn();

    const panel = createDiplomacyPanel(container, next, {
      onAction: () => {},
      onAcceptTreatyProposal: onAccept,
      onDeclineTreatyProposal: onDecline,
      onClose: () => {},
    });

    const accept = panel.querySelector('[data-action="accept-treaty-proposal"]') as HTMLButtonElement;
    expect(accept).toBeTruthy();
    expect(panel.textContent).toContain('Non-Aggression Pact');
    accept.click();
    expect(onAccept).toHaveBeenCalledWith(expect.stringContaining('treaty'));
  });

  it('does not offer the generic treaty action while an identical proposal is already pending (#554)', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.civilizations.player.knownCivilizations = ['outsider'];
    state.civilizations.player.diplomacy.relationships.outsider = 60;
    state.civilizations.outsider.diplomacy.relationships.player = 60;
    const next = enqueueTreatyProposal(state, 'outsider', 'player', 'non_aggression_pact', 10);

    const panel = createDiplomacyPanel(container, next, {
      onAction: () => {},
      onClose: () => {},
    });

    // The proposal's own accept/decline buttons are present, but the generic
    // "non aggression pact" action button for THIS civ (outsider) must not
    // also be offered (a different row, e.g. the breakaway civ, may still
    // legitimately offer its own non_aggression_pact action).
    expect(panel.querySelector('[data-action="accept-treaty-proposal"]')).toBeTruthy();
    expect(panel.querySelector('[data-civ-id="outsider"][data-action="non_aggression_pact"]')).toBeNull();
  });

  it('shows war status with start turn and reason for a civ at war with the viewer', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.civilizations.player.diplomacy.atWarWith = ['outsider'];
    state.civilizations.outsider.diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.relationships.outsider = -60;
    state.civilizations.player.diplomacy.events = [
      { type: 'war_declared', turn: 4, otherCiv: 'outsider', weight: 1 },
    ];

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('At war since turn 4');
    expect(panel.textContent).toContain('deep hostility');
  });

  it('renders a bare "At war" row when no war_declared event exists (legacy save)', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.civilizations.player.diplomacy.atWarWith = ['outsider'];
    state.civilizations.outsider.diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.events = [];

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('At War');
    expect(panel.textContent).not.toContain('At war since turn');
  });

  it('never shows proposal buttons to the proposer or third parties', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.civilizations.player.knownCivilizations = ['outsider'];
    // Proposal FROM player TO outsider -- player is the proposer, not the recipient.
    const next = enqueueTreatyProposal(state, 'player', 'outsider', 'trade_agreement', -1);

    const panel = createDiplomacyPanel(container, next, {
      onAction: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-action="accept-treaty-proposal"]')).toBeNull();
  });

  it('breaking an existing treaty requires two clicks (arm then confirm) -- no silent destructive UI', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.civilizations.player.knownCivilizations = ['outsider'];
    state.civilizations.player.diplomacy.treaties = [
      { type: 'non_aggression_pact', civA: 'player', civB: 'outsider', turnsRemaining: -1 },
    ];
    const onBreakTreaty = vi.fn();

    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onBreakTreaty,
      onClose: () => {},
    });

    const breakBtn = panel.querySelector('.diplo-break-treaty') as HTMLButtonElement;
    expect(breakBtn).toBeTruthy();

    breakBtn.click();
    expect(onBreakTreaty).not.toHaveBeenCalled();
    expect(breakBtn.textContent).toBe('Confirm?');

    breakBtn.click();
    expect(onBreakTreaty).toHaveBeenCalledWith('outsider', 'non_aggression_pact');
  });

  it('renders a legacy-shaped save (peace-only pending request, no treatyType) without throwing', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.civilizations.player.knownCivilizations = ['outsider'];
    state.civilizations.player.diplomacy.atWarWith = ['outsider'];
    state.civilizations.outsider.diplomacy.atWarWith = ['player'];
    // Shaped like a pre-#554 save: peace request with none of the new optional fields.
    state.pendingDiplomacyRequests = [
      { id: 'peace:outsider:player:1', type: 'peace', fromCivId: 'outsider', toCivId: 'player', turnIssued: 1 } as any,
    ];
    // Also a legacy war with no war_declared event recorded yet.
    state.civilizations.player.diplomacy.events = [];

    expect(() => createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    })).not.toThrow();
  });
});

describe('diplomacy-panel world-pressure crisis status line (#526 MR5 Task 5.3)', () => {
  function addOutsiderCrisis(state: ReturnType<typeof makeDiplomacyFixture>['state']): void {
    state.cities['outsider-city'] = {
      ...state.cities['city-border'],
      id: 'outsider-city',
      owner: 'outsider',
      position: { q: 7, r: 7 },
      ownedTiles: [{ q: 7, r: 7 }],
    };
    state.civilizations.outsider.cities = ['outsider-city'];
    state.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'outsider',
        cityIds: ['outsider-city'], tileKeys: [], startedTurn: state.turn - 3, stage: 'active', turnsInStage: 3,
      },
    };
  }

  it('shows a status line for a known civ suffering an active crisis', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.settings.aiPressureVisibility = true;
    state.civilizations.player.knownCivilizations = ['outsider'];
    addOutsiderCrisis(state);

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    expect(panel.textContent).toContain('Suffering:');
    expect(panel.textContent).toContain('3 turns');
  });

  it('does not show a status line when the viewer has not met the crisis-struck civ', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.settings.aiPressureVisibility = true;
    // player has NOT met outsider -- shouldListMajorCivForViewer will also hide the row
    // entirely without contact, so this doubles as a "row absent" negative too.
    addOutsiderCrisis(state);

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    expect(panel.textContent).not.toContain('Suffering:');
  });

  it('does not show a status line for a known civ with no active crisis', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.settings.aiPressureVisibility = true;
    state.civilizations.player.knownCivilizations = ['outsider'];

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    expect(panel.textContent).not.toContain('Suffering:');
  });

  it('does not show a status line when aiPressureVisibility is off', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.settings.aiPressureVisibility = false;
    state.civilizations.player.knownCivilizations = ['outsider'];
    addOutsiderCrisis(state);

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    expect(panel.textContent).not.toContain('Suffering:');
  });

  it('re-renders the status line after the crisis resolves (panel-rerender rule)', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.settings.aiPressureVisibility = true;
    state.civilizations.player.knownCivilizations = ['outsider'];
    addOutsiderCrisis(state);

    let currentState = state;
    const render = (): HTMLElement => createDiplomacyPanel(container, currentState, { onAction: () => {}, onClose: () => {} });

    const first = render();
    expect(first.textContent).toContain('Suffering:');

    currentState = { ...currentState, activeCrises: {} };
    const second = render();
    expect(second.textContent).not.toContain('Suffering:');
  });

  // #526 MR7 Task 7.1: exploit_weakness intel detail line.
  it('shows the intel detail line when the viewer has diplomatic-networks', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.settings.aiPressureVisibility = true;
    state.civilizations.player.knownCivilizations = ['outsider'];
    state.civilizations.player.techState.completed = ['diplomatic-networks'];
    addOutsiderCrisis(state);
    state.cities['outsider-city'].name = 'Alexandria';

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    expect(panel.textContent).toContain('Alexandria');
  });

  it('omits the intel detail line when the viewer lacks diplomatic-networks (negative)', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.settings.aiPressureVisibility = true;
    state.civilizations.player.knownCivilizations = ['outsider'];
    state.civilizations.player.techState.completed = [];
    addOutsiderCrisis(state);
    state.cities['outsider-city'].name = 'Alexandria';

    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

    expect(panel.textContent).not.toContain('Alexandria');
  });
});

describe('diplomacy-panel Send Aid button (#526 MR6 Task 6.3)', () => {
  function addOutsiderCrisis(
    state: ReturnType<typeof makeDiplomacyFixture>['state'],
    archetype: 'outbreak' | 'catastrophe' | 'famine' = 'outbreak',
  ): void {
    state.cities['outsider-city'] = {
      ...state.cities['city-border'],
      id: 'outsider-city',
      owner: 'outsider',
      position: { q: 7, r: 7 },
      ownedTiles: [{ q: 7, r: 7 }],
      population: 5,
    };
    state.civilizations.outsider.cities = ['outsider-city'];
    const flavorIdByArchetype = { outbreak: 'plague', catastrophe: 'earthquake', famine: 'crop-blight' } as const;
    state.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: flavorIdByArchetype[archetype], archetype,
        targetCivId: 'outsider',
        cityIds: ['outsider-city'], tileKeys: [], startedTurn: state.turn - 3,
        stage: archetype === 'catastrophe' ? 'recovery' : 'active', turnsInStage: 3,
      },
    };
  }

  function readyState(archetype: 'outbreak' | 'catastrophe' | 'famine' = 'outbreak') {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.settings.aiPressureVisibility = true;
    state.settings.aiCrisisInteractions = 'benign';
    state.civilizations.player.knownCivilizations = ['outsider'];
    state.civilizations.player.techState.completed = ['medicine', 'trade-routes'];
    addOutsiderCrisis(state, archetype);
    return { container, state };
  }

  it('renders an enabled Send Aid button showing the gold cost, plus an effect/memory help line', () => {
    const { container, state } = readyState();
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    const button = panel.querySelector<HTMLButtonElement>('[data-crisis-id="crisis-1"]');
    expect(button).toBeTruthy();
    expect(button!.disabled).toBe(false);
    expect(button!.textContent).toContain('75');
    expect(panel.textContent).toContain('will remember this');
  });

  it('clicking Send Aid invokes the callback with the crisis id, and the panel re-renders', () => {
    const { container, state } = readyState();
    let currentState = state;
    const onSendAid = vi.fn((crisisId: string) => {
      currentState = { ...currentState, activeCrises: {} }; // simulate main.ts applying aid + re-deriving state
      render();
    });
    const render = (): HTMLElement => createDiplomacyPanel(container, currentState, { onAction: () => {}, onClose: () => {}, onSendAid });

    const panel = render();
    const button = panel.querySelector<HTMLButtonElement>('[data-crisis-id="crisis-1"]')!;
    button.click();

    expect(onSendAid).toHaveBeenCalledWith('crisis-1');
    const rerendered = container.querySelector('#diplomacy-panel') as HTMLElement;
    expect(rerendered.textContent).not.toContain('Send Aid');
  });

  it('disables the button and names the specific missing tech in the help text (not a vague "requires tech")', () => {
    const { container, state } = readyState();
    state.civilizations.player.techState.completed = [];
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    const button = panel.querySelector<HTMLButtonElement>('[data-crisis-id="crisis-1"]');
    expect(button!.disabled).toBe(true);
    expect(button!.title).toBe('Requires Medicine.');
  });

  it('still shows the gold cost in the button label when disabled for a reason other than affordability', () => {
    const { container, state } = readyState();
    state.civilizations.player.techState.completed = [];
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    const button = panel.querySelector<HTMLButtonElement>('[data-crisis-id="crisis-1"]');
    expect(button!.textContent).toContain('75');
  });

  it('shows a distinct "already sent aid" help line instead of the pay-gold line once already aided', () => {
    const { container, state } = readyState();
    state.activeCrises!['crisis-1']!.aidedByCivIds = ['player'];
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    expect(panel.textContent).toContain('already sent aid');
    expect(panel.textContent).not.toContain('Pay 75 gold');
  });

  it('disables the button when the actor cannot afford the cost', () => {
    const { container, state } = readyState();
    state.civilizations.player.gold = 0;
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    const button = panel.querySelector<HTMLButtonElement>('[data-crisis-id="crisis-1"]');
    expect(button!.disabled).toBe(true);
    expect(button!.title).toContain('75');
  });

  it('keeps the Send Aid button visible but disabled once the actor has already aided this crisis', () => {
    const { container, state } = readyState();
    state.activeCrises!['crisis-1']!.aidedByCivIds = ['player'];
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    const button = panel.querySelector<HTMLButtonElement>('[data-crisis-id="crisis-1"]');
    expect(button!.disabled).toBe(true);
  });

  it('does not render a Send Aid button for a hunt-archetype crisis (not a send-aid hook)', () => {
    const { container, state } = readyState();
    state.activeCrises!['crisis-1'] = { ...state.activeCrises!['crisis-1']!, archetype: 'hunt', flavorId: 'beast-awakening' };
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    expect(panel.querySelector('[data-crisis-id="crisis-1"]')).toBeNull();
  });

  it('works for a catastrophe crisis, requiring trade-routes instead of medicine', () => {
    const { container, state } = readyState('catastrophe');
    state.civilizations.player.techState.completed = ['medicine']; // missing trade-routes
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    const button = panel.querySelector<HTMLButtonElement>('[data-crisis-id="crisis-1"]');
    expect(button!.disabled).toBe(true);
  });

  it('#590 MR3: famine gets the "cured in 2 turns" wording, never the catastrophe "receives it as relief" wording', () => {
    const { container, state } = readyState('famine');
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    expect(panel.textContent).toContain('cured in 2 turns');
    expect(panel.textContent).not.toContain('receives it as relief');
  });

  it('#590 MR3: famine requires medicine, same as outbreak', () => {
    const { container, state } = readyState('famine');
    state.civilizations.player.techState.completed = ['trade-routes']; // missing medicine
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    const button = panel.querySelector<HTMLButtonElement>('[data-crisis-id="crisis-1"]');
    expect(button!.disabled).toBe(true);
    expect(button!.title).toBe('Requires Medicine.');
  });
});

describe('#591 MR4 — diplomacy panel religion summary', () => {
  it('shows the viewer\'s own religion name, boon, and follower counts', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player' });
    state.religions = { 'religion-player': { id: 'religion-player', name: 'Order of Test', ownerCivId: 'player', boon: 'tithes', foundedTurn: 1 } };
    state.cityFaith = {
      'city-border': { religionId: 'religion-player', isHolyCity: true },
      'outsider-city-placeholder': { religionId: 'religion-player' },
    };
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    expect(panel.textContent).toContain('Order of Test');
    expect(panel.textContent).toContain('Tithes');
  });

  it('shows a pending-choice note when the boon is not yet chosen', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player' });
    state.religions = { 'religion-player': { id: 'religion-player', name: 'Order of Test', ownerCivId: 'player', foundedTurn: 1 } };
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    expect(panel.textContent).toContain('Choosing a boon');
  });

  it('renders no religion summary when the viewer has not founded a religion', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player' });
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    expect(panel.querySelector('[data-text="religion-name"]')).toBeNull();
  });

  it('never shows a rival civ\'s religion as the viewer\'s own', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player', includeThirdCiv: true });
    state.religions = { 'religion-outsider': { id: 'religion-outsider', name: 'Rival Faith', ownerCivId: 'outsider', boon: 'fervor', foundedTurn: 1 } };
    const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {}, onSendAid: () => {} });

    expect(panel.textContent).not.toContain('Rival Faith');
  });
});
