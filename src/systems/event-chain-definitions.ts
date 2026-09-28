// #990: event-chain content — "what a chain is" (stage shape, options, tuning
// constants, onset eligibility), mirroring crisis-flavor-definitions.ts's role
// for crises. Pure data plus small predicates; no turn-processing, no state
// mutation. See event-chain-progression.ts for the behavior these stages
// describe, and event-chain-lifecycle.ts for the reusable engine that drives them.
//
// #990 ships exactly one chain kind (`financial-panic`) per the issue's own
// "one exemplar is enough" non-goal. Do not pre-declare further `EventChainKind`
// members with no shipped definition — `EVENT_CHAIN_DEFINITIONS` and
// `EventChainKind` (types.ts) must stay in lockstep, enforced by
// `event-chain-definitions.test.ts`.
import type { EventChainKind, GameState } from '@/core/types';
import { majorCivWarOpponentIds } from '@/core/owner-kind';
import { resolveCivilizationEra } from './tech-definitions';

export interface EventChainOptionDefinition {
  id: string;
  /** Player-facing button label. */
  label: string;
  /** Player-facing summary of what choosing this does. */
  description: string;
}

export interface EventChainStageDefinition {
  id: string;
  /** Present exactly on a choice-gated stage (the onset stage, for every
   * chain shipped so far — nothing here requires that, but a chain with a
   * choice at a later stage is not yet exercised by any shipped definition). */
  options?: EventChainOptionDefinition[];
  /** Required when `options` is set: which option auto-applies if the human
   * decision-maker hasn't chosen within `pendingChoiceExpiresTurns`. */
  defaultOptionId?: string;
  pendingChoiceExpiresTurns?: number;
  /** Turns after entering this stage before it auto-evaluates. Present on a
   * pure-timer stage (a choice stage's own transition is choice-driven, not
   * timer-driven, so it omits this). */
  delayTurns?: number;
}

export interface EventChainDefinition {
  kind: EventChainKind;
  eraBand: [number, number];
  /** Stage[0] is always the entry stage a new instance starts on. */
  stages: EventChainStageDefinition[];
  cooldownTurns: number;
  maxSimultaneousPerCiv: number;
  aiWorldCap: Record<'small' | 'medium' | 'large', number>;
  /** Onset eligibility beyond era/cooldown/cap, which scheduling already checks
   * generically — the chain-specific "is this civ actually in the situation
   * this chain represents" predicate. */
  isEligible: (state: GameState, civId: string) => boolean;
}

// Threshold and cost scale with era so the chain stays relevant as gold
// reserves inflate across a campaign — a flat threshold would only ever fire
// in the earliest eras. First-pass tuning, not a balance-reviewed constant
// table (`.claude/rules/game-balance.md`'s ceilings are about wonder/national-
// project yields, which this chain does not grant).
export function getFinancialPanicGoldThreshold(civEra: number): number {
  return 15 * (civEra + 1);
}

export function getFinancialPanicBailoutCost(civEra: number): number {
  return 20 * (civEra + 1);
}

export const FINANCIAL_PANIC_CONSEQUENCE_DELAY_TURNS = 4;
export const FINANCIAL_PANIC_PENDING_CHOICE_EXPIRES_TURNS = 3;
// `City.unrestLevel` is a discrete 0/1/2 (stable/unrest/revolt) state, not an
// accumulating point value — a failed consequence forces the capital to AT
// LEAST this level (never lowers it if it's already worse for some other
// reason) rather than adding an arbitrary delta.
export const FINANCIAL_PANIC_REFORM_WAR_MIN_UNREST_LEVEL = 1; // 'unrest'
export const FINANCIAL_PANIC_DO_NOTHING_MIN_UNREST_LEVEL = 2; // 'revolt'

export const FINANCIAL_PANIC_OPTIONS = {
  bailout: 'bailout',
  reform: 'austerity-reform',
  doNothing: 'do-nothing',
} as const;

const FINANCIAL_PANIC: EventChainDefinition = {
  kind: 'financial-panic',
  eraBand: [2, 12],
  cooldownTurns: 20,
  maxSimultaneousPerCiv: 1,
  aiWorldCap: { small: 1, medium: 2, large: 3 },
  isEligible: (state, civId) => {
    const civ = state.civilizations[civId];
    if (!civ) return false;
    const era = resolveCivilizationEra(civ.techState.completed);
    return civ.gold < getFinancialPanicGoldThreshold(era);
  },
  stages: [
    {
      id: 'onset',
      options: [
        {
          id: FINANCIAL_PANIC_OPTIONS.bailout,
          label: 'Emergency Bailout',
          description: 'Pay a gold sum now to guarantee the treasury crisis passes quietly.',
        },
        {
          id: FINANCIAL_PANIC_OPTIONS.reform,
          label: 'Austerity Reform',
          description: 'No cost now — works if the empire stays at peace long enough to take hold.',
        },
        {
          id: FINANCIAL_PANIC_OPTIONS.doNothing,
          label: 'Do Nothing',
          description: 'Free, and fine if the treasury recovers on its own — costly if it does not.',
        },
      ],
      defaultOptionId: FINANCIAL_PANIC_OPTIONS.doNothing,
      pendingChoiceExpiresTurns: FINANCIAL_PANIC_PENDING_CHOICE_EXPIRES_TURNS,
    },
    {
      id: 'consequence',
      delayTurns: FINANCIAL_PANIC_CONSEQUENCE_DELAY_TURNS,
    },
  ],
};

export const EVENT_CHAIN_DEFINITIONS: Record<EventChainKind, EventChainDefinition> = {
  'financial-panic': FINANCIAL_PANIC,
};

export function getEventChainDefinition(kind: EventChainKind): EventChainDefinition {
  return EVENT_CHAIN_DEFINITIONS[kind];
}

export function getEventChainStageDefinition(
  kind: EventChainKind,
  stageId: string,
): EventChainStageDefinition | undefined {
  return getEventChainDefinition(kind).stages.find(s => s.id === stageId);
}

/** AI civs decide from their own known state only — never RNG, never a hidden
 * "will my gold recover" projection a human might have from information the
 * AI cannot legitimately have. AI never picks `doNothing`: modeling "confident
 * recovery" belief is out of scope for #990's exemplar AI policy. */
export function chooseAiFinancialPanicOption(state: GameState, civId: string): string {
  const civ = state.civilizations[civId];
  const atWar = civ ? majorCivWarOpponentIds(civ.diplomacy.atWarWith).length > 0 : false;
  return atWar ? FINANCIAL_PANIC_OPTIONS.bailout : FINANCIAL_PANIC_OPTIONS.reform;
}
