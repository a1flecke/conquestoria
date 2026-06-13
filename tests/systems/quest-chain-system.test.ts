import { describe, expect, it } from 'vitest';
import type { GameState, Quest } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { hexKey } from '@/systems/hex-utils';
import {
  applyQuestGameplayAction,
  getMinorCivRelationshipStatus,
  isMinorCivAllianceActive,
  reconcileMinorCivQuestTurn,
} from '@/systems/quest-chain-system';

function chainState(seed: string, definitionId = 'alexandria') {
  const state = createNewGame(undefined, seed, 'small');
  const minorCivId = Object.keys(state.minorCivs)[0];
  const minorCiv = state.minorCivs[minorCivId];
  minorCiv.definitionId = definitionId;
  minorCiv.chainStatusByCiv = {};
  minorCiv.questCooldownUntilByCiv = {};
  minorCiv.lastNotifiedStatusByCiv = {};
  const city = state.cities[minorCiv.cityId];
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';
  state.civilizations.player.gold = 500;
  return { state, minorCivId, minorCiv };
}

function normalGiftQuest(turn: number, reward = 10): Quest {
  return {
    id: 'quest-normal',
    type: 'gift_gold',
    description: 'Gift 25 gold',
    target: { type: 'gift_gold', amount: 25 },
    reward: { relationshipBonus: reward },
    progress: 0,
    status: 'active',
    turnIssued: turn,
    expiresOnTurn: turn + 20,
  };
}

describe('minor-civ quest-chain state machine', () => {
  it('initializes typed quest-chain maps for every placed minor civilization', () => {
    const state = createNewGame(undefined, 'quest-chain-initial-maps', 'small');
    for (const minorCiv of Object.values(state.minorCivs)) {
      expect(minorCiv.chainStatusByCiv).toEqual({});
      expect(minorCiv.questCooldownUntilByCiv).toEqual({});
      expect(minorCiv.lastNotifiedStatusByCiv).toEqual({});
    }
  });

  it('applies the normal reward before evaluating Friendly chain eligibility', () => {
    const { state, minorCivId, minorCiv } = chainState('quest-chain-eligibility');
    minorCiv.diplomacy.relationships.player = 25;
    minorCiv.activeQuests.player = normalGiftQuest(state.turn, 10);

    const result = applyQuestGameplayAction(state, {
      type: 'gift_gold', actorCivId: 'player', minorCivId, amount: 25, turn: state.turn,
    });

    expect(result.state.minorCivs[minorCivId].diplomacy.relationships.player).toBe(35);
    expect(result.state.minorCivs[minorCivId].activeQuests.player).toMatchObject({
      chainId: 'festivals-and-exchange',
      stepIndex: 0,
    });
  });

  it('allows completion on the inclusive expiry turn and expires one turn later', () => {
    const { state, minorCivId, minorCiv } = chainState('quest-chain-expiry');
    minorCiv.activeQuests.player = { ...normalGiftQuest(state.turn), expiresOnTurn: 20 };

    const valid = reconcileMinorCivQuestTurn(state, minorCivId, 'player', 20);
    expect(valid.transitions).toHaveLength(0);

    const expired = reconcileMinorCivQuestTurn(state, minorCivId, 'player', 21);
    expect(expired.transitions[0]?.type).toBe('expired');
    expect(expired.state.minorCivs[minorCivId].diplomacy.relationships.player).toBe(-5);
  });

  it('clears pending after ten retry turns without a relationship penalty', () => {
    const { state, minorCivId, minorCiv } = chainState('quest-chain-pending-timeout');
    minorCiv.diplomacy.relationships.player = 40;
    minorCiv.chainStatusByCiv.player = {
      chainId: 'festivals-and-exchange',
      status: 'pending',
      statusTurn: 10,
      pendingStepIndex: 1,
      pendingExpiresOnTurn: 20,
    };

    const result = reconcileMinorCivQuestTurn(state, minorCivId, 'player', 21);
    expect(result.state.minorCivs[minorCivId].chainStatusByCiv.player).toBeUndefined();
    expect(result.state.minorCivs[minorCivId].diplomacy.relationships.player).toBe(40);
    expect(result.state.minorCivs[minorCivId].questCooldownUntilByCiv.player).toBe(24);
  });

  it('does not extend the pending deadline when each retry remains infeasible', () => {
    const { state, minorCivId, minorCiv } = chainState('quest-chain-pending-fixed-deadline');
    state.civilizations.player.gold = -10_000;
    minorCiv.diplomacy.relationships.player = 40;
    minorCiv.chainStatusByCiv.player = {
      chainId: 'festivals-and-exchange',
      status: 'pending',
      statusTurn: 10,
      pendingStepIndex: 1,
      pendingExpiresOnTurn: 20,
    };

    let current = state;
    for (let turn = 11; turn <= 21; turn++) {
      current = reconcileMinorCivQuestTurn(current, minorCivId, 'player', turn).state;
    }

    expect(current.minorCivs[minorCivId].chainStatusByCiv.player).toBeUndefined();
    expect(current.minorCivs[minorCivId].questCooldownUntilByCiv.player).toBe(24);
  });

  it('floors final relationship, stores alliance, and never rewards twice', () => {
    const { state, minorCivId, minorCiv } = chainState('quest-chain-final-alliance');
    state.civilizations.player.techState.completed.push('pottery');
    state.marketplace!.purchasedResources = [{ civId: 'player', resource: 'wine', expiresOnTurn: state.turn + 5 }];
    minorCiv.diplomacy.relationships.player = 40;
    minorCiv.activeQuests.player = {
      id: 'quest-final',
      type: 'sponsor_festival',
      description: 'Sponsor the Grand Festival',
      target: { type: 'sponsor_festival', amount: 50, requiresLuxury: true },
      reward: { relationshipBonus: 25 },
      progress: 0,
      status: 'active',
      turnIssued: state.turn,
      expiresOnTurn: state.turn + 20,
      chainId: 'festivals-and-exchange',
      stepIndex: 2,
    };

    const action = { type: 'sponsor_festival', actorCivId: 'player', minorCivId, turn: state.turn } as const;
    const first = applyQuestGameplayAction(state, action);
    const second = applyQuestGameplayAction(first.state, action);

    expect(first.state.minorCivs[minorCivId].diplomacy.relationships.player).toBe(65);
    expect(first.transitions.filter(transition => transition.type === 'allied')).toHaveLength(1);
    expect(second.transitions).toHaveLength(0);
    expect(second.state.civilizations.player.gold).toBe(first.state.civilizations.player.gold);
    expect(isMinorCivAllianceActive(first.state, 'player', minorCivId)).toBe(true);
    expect(getMinorCivRelationshipStatus(first.state, 'player', minorCivId)).toBe('allied');
    expect(first.state.minorCivs[minorCivId].lastNotifiedStatusByCiv.player).toBe('allied');
  });

  it('retargets an invalidated chain objective without awarding another actor credit', () => {
    const { state, minorCivId, minorCiv } = chainState('quest-chain-retarget', 'sparta');
    state.barbarianCamps['camp-old'] = {
      id: 'camp-old', position: { ...state.cities[minorCiv.cityId].position }, strength: 5, spawnCooldown: 0,
    };
    minorCiv.activeQuests.player = {
      id: 'quest-old-camp', type: 'destroy_camp', description: 'Destroy the old camp',
      target: { type: 'destroy_camp', campId: 'camp-old', position: { ...state.cities[minorCiv.cityId].position } }, reward: { relationshipBonus: 15 },
      progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
      chainId: 'military-assistance', stepIndex: 0,
    };
    delete state.barbarianCamps['camp-old'];

    const result = reconcileMinorCivQuestTurn(state, minorCivId, 'player', state.turn + 1);

    expect(result.transitions.some(transition => transition.type === 'retargeted' || transition.type === 'pending')).toBe(true);
    expect(result.state.minorCivs[minorCivId].diplomacy.relationships.player).toBe(0);
  });

  it('does not reveal a camp destruction while the target tile is hidden', () => {
    const { state, minorCivId, minorCiv } = chainState('quest-chain-hidden-camp', 'sparta');
    const position = { ...state.cities[minorCiv.cityId].position };
    state.civilizations.player.visibility.tiles[hexKey(position)] = 'fog';
    minorCiv.activeQuests.player = {
      id: 'quest-hidden-camp', type: 'destroy_camp', description: 'Destroy the hidden camp',
      target: { type: 'destroy_camp', campId: 'camp-hidden', position }, reward: { relationshipBonus: 15 },
      progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
      chainId: 'military-assistance', stepIndex: 0,
    };

    const result = reconcileMinorCivQuestTurn(state, minorCivId, 'player', state.turn + 1);

    expect(result.transitions).toEqual([]);
    expect(result.state.minorCivs[minorCivId].activeQuests.player?.id).toBe('quest-hidden-camp');
  });

  it('clamps expiry relationship penalties at the diplomacy minimum', () => {
    const { state, minorCivId, minorCiv } = chainState('quest-chain-expiry-clamp');
    minorCiv.diplomacy.relationships.player = -100;
    minorCiv.activeQuests.player = { ...normalGiftQuest(state.turn), expiresOnTurn: state.turn };

    const result = reconcileMinorCivQuestTurn(state, minorCivId, 'player', state.turn + 1);

    expect(result.state.minorCivs[minorCivId].diplomacy.relationships.player).toBe(-100);
  });

  it('allows one attributed defeat to satisfy multiple independently matching issuers', () => {
    const state = createNewGame(undefined, 'quest-shared-military-credit', 'small');
    const minorCivIds = Object.keys(state.minorCivs).slice(0, 2);
    expect(minorCivIds).toHaveLength(2);
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    for (const minorCivId of minorCivIds) {
      state.minorCivs[minorCivId].activeQuests.player = {
        id: `quest-${minorCivId}`, type: 'defeat_units', description: 'Defeat the nearby enemy',
        target: { type: 'defeat_units', count: 1, nearPosition: { q: 2, r: 2 }, radius: 4 },
        reward: { relationshipBonus: 10 }, progress: 0, status: 'active',
        turnIssued: state.turn, expiresOnTurn: state.turn + 20,
      };
    }

    const result = applyQuestGameplayAction(state, {
      type: 'unit_defeated', actorCivId: 'player', defeatedOwnerId: 'ai-1',
      unitId: 'enemy-1', position: { q: 3, r: 2 }, turn: state.turn,
    });

    expect(result.transitions.filter(transition => transition.type === 'completed')).toHaveLength(2);
  });
});
