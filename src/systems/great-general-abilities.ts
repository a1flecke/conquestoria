import type { GameState, Unit } from '@/core/types';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';

export interface HeroicCommandEligibility {
  eligible: boolean;
  reason?: string;
  chargesRemaining: number;
  isFinalCharge: boolean;
  cooldownTurnsRemaining: number;
}

/**
 * #544 MR4 contract §17: shared gate every heroic ability (Rally, Seize,
 * Last Stand) checks before doing anything else. One charge/cooldown model
 * for all three -- no independent per-ability cooldowns, no combat-driven
 * recharge, no tech/difficulty acceleration (difficulty-invariant: this
 * function never reads state.opponentChallenge or civ.challenge).
 */
export function getHeroicCommandEligibility(
  state: Pick<GameState, 'turn'>,
  general: Pick<Unit, 'generalDefinitionId' | 'generalNoCommandThisTurn' | 'generalCommandChargesUsed' | 'generalCommandCooldownUntilTurn'>,
): HeroicCommandEligibility {
  const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
  const maxCharges = definition?.maxCommandCharges ?? 0;
  const chargesUsed = general.generalCommandChargesUsed ?? 0;
  const chargesRemaining = Math.max(0, maxCharges - chargesUsed);
  const cooldownUntil = general.generalCommandCooldownUntilTurn ?? 0;
  const cooldownTurnsRemaining = Math.max(0, cooldownUntil - state.turn);

  if (general.generalNoCommandThisTurn) {
    return {
      eligible: false,
      reason: 'This General just took command and cannot act until next turn.',
      chargesRemaining,
      isFinalCharge: false,
      cooldownTurnsRemaining,
    };
  }
  if (chargesRemaining <= 0) {
    return { eligible: false, reason: 'No Command Charges remaining.', chargesRemaining, isFinalCharge: false, cooldownTurnsRemaining };
  }
  if (cooldownTurnsRemaining > 0) {
    return {
      eligible: false,
      reason: `Command is on cooldown for ${cooldownTurnsRemaining} more turn(s).`,
      chargesRemaining,
      isFinalCharge: false,
      cooldownTurnsRemaining,
    };
  }
  return { eligible: true, chargesRemaining, isFinalCharge: chargesRemaining === 1, cooldownTurnsRemaining: 0 };
}

/**
 * Spends one Command Charge and starts the shared cooldown (contract §17:
 * "any ability costs 1 charge and starts the same shared cooldown"). Callers
 * (Rally/Seize/Last Stand issuance in this same file) call this exactly
 * once per successful ability issuance, after applying the ability's own
 * effects -- charge/cooldown state and effect state are independent writes
 * to the same unit, composed by the caller.
 */
export function spendHeroicCommandCharge(state: GameState, generalUnitId: string): GameState {
  const general = state.units[generalUnitId];
  const definition = general ? GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId) : undefined;
  if (!general || !definition) return state;

  return {
    ...state,
    units: {
      ...state.units,
      [generalUnitId]: {
        ...general,
        generalCommandChargesUsed: (general.generalCommandChargesUsed ?? 0) + 1,
        generalCommandCooldownUntilTurn: state.turn + definition.cooldownTurns,
      },
    },
  };
}
