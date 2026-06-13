import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import {
  performMinorCivFestival,
  performMinorCivGift,
  setMinorCivWarState,
} from '@/systems/minor-civ-actions';

function actionState(seed: string) {
  const state = createNewGame(undefined, seed, 'small');
  const minorCivId = Object.keys(state.minorCivs)[0];
  const minorCiv = state.minorCivs[minorCivId];
  state.civilizations.player.gold = 200;
  return { state, minorCivId, minorCiv };
}

describe('minor-civ actions', () => {
  it('deducts the exact active gift amount and completes that assignment', () => {
    const { state, minorCivId, minorCiv } = actionState('minor-action-gift');
    minorCiv.activeQuests.player = {
      id: 'quest-gift', type: 'gift_gold', description: 'Gift 50 gold',
      target: { type: 'gift_gold', amount: 50 }, reward: { relationshipBonus: 10 },
      progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
    };

    const result = performMinorCivGift(state, 'player', minorCivId);

    expect(result.ok).toBe(true);
    expect(result.state.civilizations.player.gold).toBe(150);
    expect(result.transitions.some(transition => transition.type === 'completed')).toBe(true);
  });

  it('preserves the normal 25-gold gift outside an active gift objective', () => {
    const { state, minorCivId } = actionState('minor-action-normal-gift');
    const result = performMinorCivGift(state, 'player', minorCivId);
    expect(result.ok).toBe(true);
    expect(result.state.civilizations.player.gold).toBe(175);
    expect(result.state.minorCivs[minorCivId].diplomacy.relationships.player).toBe(10);
  });

  it('rejects a festival atomically when luxury access is missing', () => {
    const { state, minorCivId, minorCiv } = actionState('minor-action-festival-no-luxury');
    minorCiv.activeQuests.player = {
      id: 'quest-festival', type: 'sponsor_festival', description: 'Sponsor a festival',
      target: { type: 'sponsor_festival', amount: 50, requiresLuxury: true }, reward: { relationshipBonus: 20 },
      progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
      chainId: 'festivals-and-exchange', stepIndex: 1,
    };

    const result = performMinorCivFestival(state, 'player', minorCivId);
    expect(result.ok).toBe(false);
    expect(result.state.civilizations.player.gold).toBe(200);
  });

  it('does not consume luxury access on festival completion', () => {
    const { state, minorCivId, minorCiv } = actionState('minor-action-festival-luxury');
    state.civilizations.player.techState.completed.push('pottery');
    state.marketplace!.purchasedResources = [{ civId: 'player', resource: 'wine', expiresOnTurn: state.turn + 5 }];
    minorCiv.activeQuests.player = {
      id: 'quest-festival', type: 'sponsor_festival', description: 'Sponsor a festival',
      target: { type: 'sponsor_festival', amount: 50, requiresLuxury: true }, reward: { relationshipBonus: 20 },
      progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
      chainId: 'festivals-and-exchange', stepIndex: 1,
    };
    const before = getCivAvailableResources(state, 'player');

    const result = performMinorCivFestival(state, 'player', minorCivId);

    expect(result.ok).toBe(true);
    expect(getCivAvailableResources(result.state, 'player')).toEqual(before);
  });

  it('rejects a festival atomically when luxury exists but gold is insufficient', () => {
    const { state, minorCivId, minorCiv } = actionState('minor-action-festival-no-gold');
    state.civilizations.player.gold = 25;
    state.civilizations.player.techState.completed.push('pottery');
    state.marketplace!.purchasedResources = [{ civId: 'player', resource: 'wine', expiresOnTurn: state.turn + 5 }];
    minorCiv.activeQuests.player = {
      id: 'quest-festival', type: 'sponsor_festival', description: 'Sponsor a festival',
      target: { type: 'sponsor_festival', amount: 50, requiresLuxury: true }, reward: { relationshipBonus: 20 },
      progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
      chainId: 'festivals-and-exchange', stepIndex: 1,
    };

    const result = performMinorCivFestival(state, 'player', minorCivId);

    expect(result.ok).toBe(false);
    expect(result.state.civilizations.player.gold).toBe(25);
    expect(result.state.minorCivs[minorCivId].activeQuests.player?.progress).toBe(0);
  });

  it('breaks an earned alliance and updates both diplomacy sides once', () => {
    const { state, minorCivId, minorCiv } = actionState('minor-action-war');
    minorCiv.chainStatusByCiv.player = {
      chainId: 'trade-partnership', status: 'allied', statusTurn: 3, earnedTurn: 3,
    };
    const first = setMinorCivWarState(state, 'player', minorCivId, true);
    const repeated = setMinorCivWarState(first.state, 'player', minorCivId, true);

    expect(first.state.minorCivs[minorCivId].chainStatusByCiv.player.status).toBe('broken');
    expect(first.state.minorCivs[minorCivId].diplomacy.atWarWith).toContain('player');
    expect(first.state.civilizations.player.diplomacy.atWarWith).toContain(minorCivId);
    expect(first.transitions.filter(transition => transition.type === 'alliance-broken')).toHaveLength(1);
    expect(repeated.transitions).toHaveLength(0);
  });

  it('preserves broken status while making bilateral peace', () => {
    const { state, minorCivId } = actionState('minor-action-peace');
    const war = setMinorCivWarState(state, 'player', minorCivId, true);
    const peace = setMinorCivWarState(war.state, 'player', minorCivId, false);
    expect(peace.state.minorCivs[minorCivId].diplomacy.atWarWith).not.toContain('player');
    expect(peace.state.civilizations.player.diplomacy.atWarWith).not.toContain(minorCivId);
  });

  it('repairs one-sided war state without penalizing the side already at war twice', () => {
    const { state, minorCivId, minorCiv } = actionState('minor-action-asymmetric-war');
    minorCiv.diplomacy.atWarWith.push('player');
    minorCiv.diplomacy.relationships.player = -50;

    const result = setMinorCivWarState(state, 'player', minorCivId, true);

    expect(result.state.minorCivs[minorCivId].diplomacy.atWarWith).toContain('player');
    expect(result.state.civilizations.player.diplomacy.atWarWith).toContain(minorCivId);
    expect(result.state.minorCivs[minorCivId].diplomacy.relationships.player).toBe(-50);
    expect(result.state.civilizations.player.diplomacy.relationships[minorCivId]).toBe(-50);
  });

  it('blocks gifts when either diplomacy side records an active war', () => {
    const { state, minorCivId } = actionState('minor-action-asymmetric-war-gift');
    state.civilizations.player.diplomacy.atWarWith.push(minorCivId);

    const result = performMinorCivGift(state, 'player', minorCivId);

    expect(result.ok).toBe(false);
    expect(result.state.civilizations.player.gold).toBe(200);
  });
});
