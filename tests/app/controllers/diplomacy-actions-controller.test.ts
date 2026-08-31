// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import {
  enqueuePeaceRequest,
  enqueueTreatyProposal,
  signTreaty,
} from '@/systems/diplomacy-system';
import { createUnit } from '@/systems/unit-system';
import type { City, GameState, HexCoord } from '@/core/types';
import {
  createDiplomacyActionsController,
  type DiplomacyActionsController,
  type DiplomacyActionsControllerDeps,
} from '@/app/controllers/diplomacy-actions-controller';

// createNewGame only seeds a settler for major civs (minor civs start with an
// already-founded city) -- tests exercising a real player/AI-owned city must
// found one by hand. Field set matches faction-system.test.ts's makeCity.
function placeCity(state: GameState, id: string, owner: string, position: HexCoord, overrides: Partial<City> = {}): City {
  const city: City = {
    id, name: id, owner, position,
    population: 4, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  };
  state.cities[id] = city;
  if (!state.civilizations[owner].cities.includes(id)) state.civilizations[owner].cities.push(id);
  return city;
}

vi.mock('@/ui/establish-route-panel', () => ({
  openEstablishRoutePanel: vi.fn(),
}));
import { openEstablishRoutePanel } from '@/ui/establish-route-panel';

function makeFixture(seed = 'diplomacy-actions-controller'): { state: GameState; aiCivId: string; mcId: string } {
  const state = createNewGame(undefined, seed, 'small');
  state.currentPlayer = 'player';
  state.pendingDiplomacyRequests = [];
  const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
  const mcId = Object.keys(state.minorCivs)[0];
  return { state, aiCivId, mcId };
}

function makeDeps(state: GameState, overrides: Partial<DiplomacyActionsControllerDeps> = {}) {
  return {
    session: createGameSession(state),
    bus: new EventBus(),
    renderLoop: { setGameState: vi.fn() },
    hud: { update: vi.fn() },
    selectionController: { selectUnit: vi.fn() },
    uiLayer: document.createElement('div'),
    showNotification: vi.fn(),
    openDiplomacyPanel: vi.fn(),
    ...overrides,
  };
}

function build(state: GameState, overrides: Partial<DiplomacyActionsControllerDeps> = {}) {
  const deps = makeDeps(state, overrides);
  const controller = createDiplomacyActionsController(deps);
  return { deps, controller };
}

describe('DiplomacyActionsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleDiplomaticAction', () => {
    it('request_peace to an AI that consents ends the war and tells the player peace was made', () => {
      const { state, aiCivId } = makeFixture('diplomatic-action-peace');
      state.civilizations.player.knownCivilizations = [aiCivId];
      state.civilizations[aiCivId].knownCivilizations = ['player'];
      state.civilizations.player.diplomacy.atWarWith = [aiCivId];
      state.civilizations[aiCivId].diplomacy.atWarWith = ['player'];
      const { deps, controller } = build(state);

      controller.handleDiplomaticAction(aiCivId, 'request_peace');

      expect(deps.session.getState().pendingDiplomacyRequests).toEqual([]);
      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).not.toContain(aiCivId);
      expect(deps.renderLoop.setGameState).toHaveBeenCalledWith(deps.session.getState());
      expect(deps.hud.update).toHaveBeenCalledTimes(1);
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      // #901 review: the war is already over -- an affirmative "peace made", not
      // the misleading "Peace requested." the human->human queue path uses.
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('Peace made with'), 'success');
    });

    it('declare_war applies the opportunistic-war-penalty check and shows the generic action message', () => {
      const { state, aiCivId } = makeFixture('diplomatic-action-war');
      // #435 guard: declare_war requires the two civs to have already met.
      state.civilizations.player.knownCivilizations = [aiCivId];
      const { deps, controller } = build(state);

      controller.handleDiplomaticAction(aiCivId, 'declare_war');

      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).toContain(aiCivId);
      expect(deps.showNotification).toHaveBeenCalledWith('Diplomatic action: declare war', 'info');
    });

    it('request_peace tells the player when the AI target refuses consent', () => {
      const { state, aiCivId } = makeFixture('diplomatic-action-peace-refused');
      state.civilizations.player.knownCivilizations = [aiCivId];
      state.civilizations[aiCivId].knownCivilizations = ['player'];
      state.civilizations.player.diplomacy.atWarWith = [aiCivId];
      state.civilizations[aiCivId].diplomacy.atWarWith = ['player'];
      state.civilizations[aiCivId].diplomacy.relationships.player = -50;
      const { deps, controller } = build(state);

      controller.handleDiplomaticAction(aiCivId, 'request_peace');

      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).toContain(aiCivId);
      expect(deps.showNotification).toHaveBeenCalledWith(
        expect.stringContaining('unwilling to make peace'),
        'warning',
      );
    });

    it('surfaces an AI refusal of a bilateral treaty instead of a false affirmative', () => {
      const { state, aiCivId } = makeFixture('diplomatic-action-treaty-declined');
      state.civilizations.player.knownCivilizations = [aiCivId];
      state.civilizations[aiCivId].knownCivilizations = ['player'];
      state.civilizations.player.diplomacy.relationships[aiCivId] = 0;
      state.civilizations[aiCivId].diplomacy.relationships.player = 0;
      const { deps, controller } = build(state);

      controller.handleDiplomaticAction(aiCivId, 'alliance');

      expect(deps.session.getState().civilizations.player.diplomacy.treaties).toHaveLength(0);
      expect(deps.showNotification).toHaveBeenCalledWith(
        expect.stringContaining('declined'),
        'warning',
      );
    });

    it('#901 review: a bilateral treaty to a HUMAN co-player reports it as proposed, not signed', () => {
      const { state, aiCivId } = makeFixture('diplomatic-action-treaty-human-target');
      state.civilizations[aiCivId].isHuman = true; // hot-seat co-player
      state.civilizations.player.knownCivilizations = [aiCivId];
      state.civilizations[aiCivId].knownCivilizations = ['player'];
      const { deps, controller } = build(state);

      controller.handleDiplomaticAction(aiCivId, 'alliance');

      // nothing signed -- a recipient-owned proposal is queued
      expect(deps.session.getState().civilizations.player.diplomacy.treaties).toHaveLength(0);
      expect(deps.session.getState().pendingDiplomacyRequests).toContainEqual(
        expect.objectContaining({ type: 'treaty', treatyType: 'alliance', fromCivId: 'player', toCivId: aiCivId }),
      );
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('proposed to'), 'info');
      expect(deps.showNotification).not.toHaveBeenCalledWith(expect.stringContaining('Diplomatic action'), expect.anything());
    });

    it('#901 review: a bilateral treaty an AI ACCEPTS this turn shows no generic controller toast (the treaty-accepted event owns that feedback)', () => {
      const { state } = makeFixture('diplomatic-action-treaty-accepted');
      // egypt has personality.diplomacyFocus 0.7 > 0.5, so an alliance at rel > 40 is accepted
      state.civilizations['ai-egypt'] = {
        ...state.civilizations[Object.keys(state.civilizations).find(id => id !== 'player')!],
        id: 'ai-egypt', civType: 'egypt', isHuman: false,
        knownCivilizations: ['player'],
        diplomacy: { ...state.civilizations.player.diplomacy, relationships: { player: 50 }, atWarWith: [], treaties: [], events: [] },
      };
      state.civilizations.player.knownCivilizations = ['ai-egypt'];
      state.civilizations.player.diplomacy.relationships['ai-egypt'] = 50;
      const { deps, controller } = build(state);

      controller.handleDiplomaticAction('ai-egypt', 'alliance');

      expect(deps.session.getState().civilizations.player.diplomacy.treaties).toContainEqual(
        expect.objectContaining({ type: 'alliance' }),
      );
      expect(deps.showNotification).not.toHaveBeenCalled();
    });

    it('#901 review: proposing a treaty a reciprocal pending proposal already covers points the player at the panel, not a false decline', () => {
      const { state, aiCivId } = makeFixture('diplomatic-action-treaty-reciprocal');
      state.civilizations[aiCivId].isHuman = true;
      state.civilizations.player.knownCivilizations = [aiCivId];
      state.civilizations[aiCivId].knownCivilizations = ['player'];
      // the co-player already proposed an alliance to us
      const seeded = enqueueTreatyProposal(state, aiCivId, 'player', 'alliance', -1);
      const { deps, controller } = build(seeded);

      controller.handleDiplomaticAction(aiCivId, 'alliance');

      expect(deps.session.getState().pendingDiplomacyRequests).toHaveLength(1); // unchanged
      expect(deps.showNotification).toHaveBeenCalledWith(
        expect.stringContaining('already proposed'),
        'info',
      );
      expect(deps.showNotification).not.toHaveBeenCalledWith(expect.stringContaining('declined'), expect.anything());
    });
  });

  describe('handleAcceptPeaceRequest / handleRejectPeaceRequest', () => {
    function warFixture(seed: string) {
      const { state, aiCivId } = makeFixture(seed);
      state.civilizations.player.diplomacy.atWarWith = [aiCivId];
      state.civilizations[aiCivId].diplomacy.atWarWith = ['player'];
      const withRequest = enqueuePeaceRequest(state, aiCivId, 'player');
      const requestId = withRequest.pendingDiplomacyRequests![0].id;
      return { state: withRequest, aiCivId, requestId };
    }

    it('accepting clears the request, ends the war, refreshes the panel, and confirms', () => {
      const { state, aiCivId, requestId } = warFixture('accept-peace');
      const { deps, controller } = build(state);

      controller.handleAcceptPeaceRequest(requestId);

      expect(deps.session.getState().pendingDiplomacyRequests).toEqual([]);
      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).not.toContain(aiCivId);
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith('Peace accepted.', 'success');
    });

    it('rejecting clears the request but keeps the war active', () => {
      const { state, aiCivId, requestId } = warFixture('reject-peace');
      const { deps, controller } = build(state);

      controller.handleRejectPeaceRequest(requestId);

      expect(deps.session.getState().pendingDiplomacyRequests).toEqual([]);
      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).toContain(aiCivId);
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith('Peace request rejected.', 'info');
    });
  });

  describe('handleAcceptTreatyProposal / handleDeclineTreatyProposal', () => {
    function proposalFixture(seed: string) {
      const { state, aiCivId } = makeFixture(seed);
      state.civilizations.player.knownCivilizations = [aiCivId];
      state.civilizations[aiCivId].knownCivilizations = ['player'];
      const withProposal = enqueueTreatyProposal(state, aiCivId, 'player', 'trade_agreement', 10);
      const requestId = withProposal.pendingDiplomacyRequests![0].id;
      return { state: withProposal, aiCivId, requestId };
    }

    it('accepting signs the treaty on both sides and confirms', () => {
      const { state, aiCivId, requestId } = proposalFixture('accept-treaty');
      const { deps, controller } = build(state);

      controller.handleAcceptTreatyProposal(requestId);

      const next = deps.session.getState();
      expect(next.pendingDiplomacyRequests).toEqual([]);
      expect(next.civilizations.player.diplomacy.treaties.some(t => t.type === 'trade_agreement' && t.civB === aiCivId)).toBe(true);
      expect(next.civilizations[aiCivId].diplomacy.treaties.some(t => t.type === 'trade_agreement' && t.civB === 'player')).toBe(true);
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith('Treaty signed.', 'success');
    });

    it('declining clears the proposal without signing a treaty, and tells the proposer (#901)', () => {
      const { state, aiCivId, requestId } = proposalFixture('decline-treaty');
      const { deps, controller } = build(state);
      const declined: unknown[] = [];
      deps.bus.on('diplomacy:treaty-declined', e => declined.push(e));

      controller.handleDeclineTreatyProposal(requestId);

      const next = deps.session.getState();
      expect(next.pendingDiplomacyRequests).toEqual([]);
      expect(next.civilizations.player.diplomacy.treaties.some(t => t.civB === aiCivId)).toBe(false);
      expect(deps.showNotification).toHaveBeenCalledWith('Proposal declined.', 'info');
      expect(declined).toEqual([{ proposerCivId: aiCivId, targetCivId: 'player', treaty: 'trade_agreement' }]);
    });
  });

  describe('handleBreakTreaty', () => {
    it('breaks the treaty on both sides and names it in the notification', () => {
      const { state, aiCivId } = makeFixture('break-treaty');
      state.civilizations.player.diplomacy = signTreaty(state.civilizations.player.diplomacy, 'player', aiCivId, 'trade_agreement', 10, state.turn);
      state.civilizations[aiCivId].diplomacy = signTreaty(state.civilizations[aiCivId].diplomacy, aiCivId, 'player', 'trade_agreement', 10, state.turn);
      const { deps, controller } = build(state);

      controller.handleBreakTreaty(aiCivId, 'trade_agreement');

      const next = deps.session.getState();
      expect(next.civilizations.player.diplomacy.treaties.some(t => t.type === 'trade_agreement')).toBe(false);
      expect(next.civilizations[aiCivId].diplomacy.treaties.some(t => t.type === 'trade_agreement')).toBe(false);
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('broken with'), 'warning');
    });

    it('is a no-op for an unknown civ id -- no commit, no notification', () => {
      const { state } = makeFixture('break-treaty-unknown');
      const { deps, controller } = build(state);

      controller.handleBreakTreaty('no-such-civ', 'trade_agreement');

      expect(deps.openDiplomacyPanel).not.toHaveBeenCalled();
      expect(deps.showNotification).not.toHaveBeenCalled();
    });
  });

  describe('handleGiftGold', () => {
    it('deducts gold, completes the quest transition, refreshes, and confirms', () => {
      const { state, mcId } = makeFixture('gift-gold');
      state.civilizations.player.gold = 200;
      const { deps, controller } = build(state);

      controller.handleGiftGold(mcId);

      expect(deps.session.getState().civilizations.player.gold).toBeLessThan(200);
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.hud.update).toHaveBeenCalled();
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith('Gift delivered.', 'info');
    });

    it('shows a warning and does not refresh when gold is insufficient', () => {
      const { state, mcId } = makeFixture('gift-gold-poor');
      state.civilizations.player.gold = 0;
      const { deps, controller } = build(state);

      controller.handleGiftGold(mcId);

      expect(deps.session.getState().civilizations.player.gold).toBe(0);
      expect(deps.openDiplomacyPanel).not.toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('gold'), 'warning');
    });
  });

  describe('handleSponsorFestival', () => {
    it('deducts gold, completes the quest transition, refreshes, and confirms', () => {
      const { state, mcId } = makeFixture('sponsor-festival-ok');
      state.civilizations.player.techState.completed.push('pottery');
      state.marketplace!.purchasedResources = [{ civId: 'player', resource: 'wine', expiresOnTurn: state.turn + 5 }];
      state.civilizations.player.gold = 99999;
      state.minorCivs[mcId].activeQuests.player = {
        id: 'quest-festival', type: 'sponsor_festival', description: 'Sponsor a festival',
        target: { type: 'sponsor_festival', amount: 50, requiresLuxury: true }, reward: { relationshipBonus: 20 },
        progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
      };
      const { deps, controller } = build(state);

      controller.handleSponsorFestival(mcId);

      expect(deps.session.getState().civilizations.player.gold).toBeLessThan(99999);
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.hud.update).toHaveBeenCalled();
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith('Festival sponsored.', 'success');
    });

    it('shows a warning and does not refresh when the festival is unavailable', () => {
      const { state, mcId } = makeFixture('sponsor-festival-fail');
      const { deps, controller } = build(state);

      controller.handleSponsorFestival(mcId);

      expect(deps.openDiplomacyPanel).not.toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.any(String), 'warning');
    });
  });

  describe('handleMinorCivReparations', () => {
    it('pays reparations, reduces grievance pressure, refreshes, and confirms', () => {
      const { state, mcId } = makeFixture('reparations-ok');
      state.civilizations.player.gold = 99999;
      state.minorCivs[mcId].regionalGrievanceByCiv = {
        player: { targetCivId: 'player', pressure: 40, status: 'wary', lastUpdatedTurn: state.turn, causes: [] },
      };
      const { deps, controller } = build(state);

      controller.handleMinorCivReparations(mcId);

      expect(deps.session.getState().minorCivs[mcId].regionalGrievanceByCiv!.player.pressure).toBeLessThan(40);
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith('Reparations paid.', 'success');
    });

    it('shows a warning and does not refresh with no active grievance', () => {
      const { state, mcId } = makeFixture('reparations-fail');
      const { deps, controller } = build(state);

      controller.handleMinorCivReparations(mcId);

      expect(deps.openDiplomacyPanel).not.toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith('No active regional grievance.', 'warning');
    });
  });

  describe('handleSendAid', () => {
    function crisisFixture(seed: string, overrides: { actorGold?: number; actorTechs?: string[] } = {}) {
      const { state, aiCivId } = makeFixture(seed);
      const targetCityId = 'crisis-city';
      placeCity(state, targetCityId, aiCivId, { q: 3, r: 3 });
      state.civilizations.player.gold = overrides.actorGold ?? 99999;
      state.civilizations.player.techState.completed = overrides.actorTechs ?? ['medicine'];
      state.activeCrises = {
        'crisis-1': {
          id: 'crisis-1',
          flavorId: 'outbreak-flavor',
          archetype: 'outbreak',
          targetCivId: aiCivId,
          cityIds: [targetCityId],
          tileKeys: [],
          startedTurn: state.turn,
          stage: 'active',
          turnsInStage: 1,
        },
      };
      return { state, crisisId: 'crisis-1' };
    }

    it('pays gold, sends aid, refreshes, and confirms', () => {
      const { state, crisisId } = crisisFixture('send-aid-ok');
      const goldBefore = state.civilizations.player.gold;
      const { deps, controller } = build(state);

      controller.handleSendAid(crisisId);

      expect(deps.session.getState().civilizations.player.gold).toBeLessThan(goldBefore);
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith('Aid sent.', 'success');
    });

    it('shows a generic warning and does not refresh when the actor lacks the required tech', () => {
      const { state, crisisId } = crisisFixture('send-aid-no-tech', { actorTechs: [] });
      const { deps, controller } = build(state);

      controller.handleSendAid(crisisId);

      expect(deps.openDiplomacyPanel).not.toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith('Send Aid unavailable.', 'warning');
    });
  });

  describe('handleMinorCivWarPeace', () => {
    it('declares war on a city-state when not currently at war', () => {
      const { state, mcId } = makeFixture('mc-war');
      const { deps, controller } = build(state);

      controller.handleMinorCivWarPeace(mcId, false);

      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).toContain(mcId);
      expect(deps.openDiplomacyPanel).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith('War declared on city-state!', 'warning');
    });

    it('makes peace with a city-state when currently at war', () => {
      const { state, mcId } = makeFixture('mc-peace');
      state.civilizations.player.diplomacy.atWarWith = [mcId];
      const { deps, controller } = build(state);

      controller.handleMinorCivWarPeace(mcId, true);

      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).not.toContain(mcId);
      expect(deps.showNotification).toHaveBeenCalledWith('Peace with city-state', 'success');
    });

    it('is a no-op for an unknown minor civ -- no refresh, no notification', () => {
      const { state } = makeFixture('mc-war-unknown');
      const { deps, controller } = build(state);

      controller.handleMinorCivWarPeace('no-such-mc', false);

      expect(deps.openDiplomacyPanel).not.toHaveBeenCalled();
      expect(deps.showNotification).not.toHaveBeenCalled();
    });
  });

  describe('handleAppeaseFaction', () => {
    it('spends gold, clears unrest, and returns the updated state', () => {
      const { state } = makeFixture('appease-ok');
      const cityId = 'player-city';
      placeCity(state, cityId, 'player', { q: 1, r: 1 }, { unrestLevel: 1 });
      state.civilizations.player.gold = 99999;
      const { deps, controller } = build(state);

      const result = controller.handleAppeaseFaction(cityId);

      expect(result).toBe(deps.session.getState());
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('appeased'), 'success');
    });

    it('returns state unchanged and warns for a city with no unrest', () => {
      const { state } = makeFixture('appease-none');
      const cityId = 'player-city';
      placeCity(state, cityId, 'player', { q: 1, r: 1 });
      const { deps, controller } = build(state);
      const before = deps.session.getState();

      const result = controller.handleAppeaseFaction(cityId);

      expect(result).toBe(before);
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('no unrest'), 'warning');
    });

    it('returns state unchanged for an unknown city id, without notifying', () => {
      const { state } = makeFixture('appease-unknown');
      const { deps, controller } = build(state);
      const before = deps.session.getState();

      const result = controller.handleAppeaseFaction('no-such-city');

      expect(result).toBe(before);
      expect(deps.showNotification).not.toHaveBeenCalled();
    });
  });

  describe('handleConcedeToMovement', () => {
    it('spends gold, grants a charter, emits faction events, refreshes, and returns the updated state', () => {
      const { state } = makeFixture('concede-ok');
      const cityId = 'player-city';
      placeCity(state, cityId, 'player', { q: 1, r: 1 }, { unrestLevel: 1 });
      state.civilizations.player.gold = 99999;
      const bus = new EventBus();
      const emitSpy = vi.spyOn(bus, 'emit');
      const { deps, controller } = build(state, { bus });

      const result = controller.handleConcedeToMovement(cityId);

      expect(result).toBe(deps.session.getState());
      expect(emitSpy).toHaveBeenCalledWith('faction:unrest-resolved', { cityId, owner: 'player' });
      expect(emitSpy).toHaveBeenCalledWith('faction:concession-made', { cityId, owner: 'player', concessionType: 'charter' });
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.hud.update).toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('charter'), 'success');
    });

    it('returns state unchanged for an unknown city id, without notifying', () => {
      const { state } = makeFixture('concede-unknown');
      const { deps, controller } = build(state);
      const before = deps.session.getState();

      const result = controller.handleConcedeToMovement('no-such-city');

      expect(result).toBe(before);
      expect(deps.showNotification).not.toHaveBeenCalled();
    });
  });

  describe('handleEstablishRoute', () => {
    it('opens the establish-route panel and wires establishment through to a real trade route', () => {
      const { state } = makeFixture('establish-route');
      const caravanId = 'caravan-1';
      const toCityId = Object.keys(state.cities)[0]; // an existing, already-reachable minor-civ city
      const playerStartPosition = Object.values(state.units).find(u => u.owner === 'player')!.position;
      const fromCityId = 'player-city';
      placeCity(state, fromCityId, 'player', playerStartPosition);
      const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
      state.units[caravanId] = { ...createUnit('caravan', 'player', playerStartPosition, idCounters), id: caravanId };

      const { deps, controller } = build(state);

      controller.handleEstablishRoute(caravanId);

      expect(openEstablishRoutePanel).toHaveBeenCalledTimes(1);
      const onEstablish = (openEstablishRoutePanel as ReturnType<typeof vi.fn>).mock.calls[0][3] as (toCityId: string) => void;

      onEstablish(toCityId);

      expect(deps.session.getState().marketplace?.tradeRoutes.some(route => route.toCityId === toCityId)).toBe(true);
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.hud.update).toHaveBeenCalled();
      expect(deps.selectionController.selectUnit).toHaveBeenCalledWith(caravanId);
      expect(deps.showNotification).toHaveBeenCalledWith('Trade route established!', 'success');
    });
  });
});
