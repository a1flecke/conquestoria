import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { deriveSupplyWarningTransitions, applySupplyWarningTransitions } from '@/systems/supply-warning-system';
import type { GameState } from '@/core/types';

function withUnitSupply(state: GameState, unitId: string, landSupply: GameState['units'][string]['landSupply']): GameState {
  return { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, landSupply } } };
}

describe('deriveSupplyWarningTransitions', () => {
  function fixture() {
    const base = createNewGame(undefined, 'supply-warning', 'small');
    base.currentPlayer = 'player';
    // Not units[0] -- createNewGame adds the Settler before the Warrior, and
    // Settlers are civilians (unitParticipatesInLandSupply excludes them).
    const unitId = Object.values(base.units).find(u => u.owner === 'player' && u.type === 'warrior')!.id;
    return { base, unitId };
  }

  it('warns when a unit transitions from full to grace (losing Full Supply)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toEqual([{ viewerId: 'player', unitIds: [unitId], kind: 'losing-full', playAudio: true }]);
  });

  it('warns when a unit transitions from grace to degraded (entering combat penalty)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 });
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toEqual([{ viewerId: 'player', unitIds: [unitId], kind: 'entering-combat-penalty', playAudio: true }]);
  });

  it('warns when a unit transitions from degraded to severe (entering movement penalty)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'degraded', hostileUnsupportedTurns: 4, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 });
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toEqual([{ viewerId: 'player', unitIds: [unitId], kind: 'entering-movement-penalty', playAudio: true }]);
  });

  it('does not warn when returning to full (recovery is not a warning)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    expect(deriveSupplyWarningTransitions(before, after, 'player')).toEqual([]);
  });

  it('does not warn again next round if the state is unchanged (no repeat spam)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 });
    expect(deriveSupplyWarningTransitions(before, after, 'player')).toEqual([]);
  });

  it('never derives a warning for a non-viewing civ\'s units', () => {
    const { base } = fixture();
    const aiId = Object.keys(base.civilizations).find(id => id !== 'player')!;
    const aiUnitId = Object.values(base.units).find(u => u.owner === aiId && u.type === 'warrior')!.id;
    const before = withUnitSupply(base, aiUnitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(before, aiUnitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    expect(deriveSupplyWarningTransitions(before, after, 'player')).toEqual([]);
  });

  it('groups multiple units crossing the same threshold in one round into one warning', () => {
    const { base, unitId } = fixture();
    const secondUnitId = 'grouped-unit-2';
    const withSecondUnit: GameState = {
      ...base,
      units: { ...base.units, [secondUnitId]: { ...base.units[unitId]!, id: secondUnitId } },
    };
    const before = withUnitSupply(
      withUnitSupply(withSecondUnit, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 }),
      secondUnitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 },
    );
    const after = withUnitSupply(
      withUnitSupply(before, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 }),
      secondUnitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 },
    );
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.unitIds.slice().sort()).toEqual([secondUnitId, unitId].sort());
  });

  it('assigns playAudio to only the first warning when multiple kinds fire in one round', () => {
    const { base, unitId } = fixture();
    const secondUnitId = 'audio-unit-2';
    const withSecondUnit: GameState = {
      ...base,
      units: { ...base.units, [secondUnitId]: { ...base.units[unitId]!, id: secondUnitId } },
    };
    const before = withUnitSupply(
      withUnitSupply(withSecondUnit, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 }),
      secondUnitId, { state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 },
    );
    const after = withUnitSupply(
      withUnitSupply(before, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 }),
      secondUnitId, { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    );
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toHaveLength(2);
    expect(warnings.filter(w => w.playAudio)).toHaveLength(1);
  });

  it('produces identical warnings regardless of opponentChallenge (difficulty-invariant)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    const explorer = deriveSupplyWarningTransitions({ ...before, opponentChallenge: 'explorer' }, { ...after, opponentChallenge: 'explorer' }, 'player');
    const veteran = deriveSupplyWarningTransitions({ ...before, opponentChallenge: 'veteran' }, { ...after, opponentChallenge: 'veteran' }, 'player');
    expect(explorer).toEqual(veteran);
  });
});

describe('applySupplyWarningTransitions', () => {
  it('emits one supply:warning event per meaningful transition, for humans only', () => {
    const base = createNewGame(undefined, 'supply-warning-apply', 'small');
    base.currentPlayer = 'player';
    const unitId = Object.values(base.units).find(u => u.owner === 'player' && u.type === 'warrior')!.id;
    const before = withUnitSupply(base, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    const bus = new EventBus();
    const received: unknown[] = [];
    bus.on('supply:warning', event => received.push(event));
    applySupplyWarningTransitions(before, after, bus);
    expect(received).toEqual([{ viewerId: 'player', unitIds: [unitId], kind: 'losing-full', playAudio: true }]);
  });
});
