/**
 * #1221 — the diplomatic executor re-checks exactly what the offer surface checks, and says why it refused.
 *
 * Before this, `getAvailableActions` (the panel) gated on contact / era / tech / treaties / war, but
 * `applyDiplomaticAction` re-checked only a subset (unmet-civ + vassal), returned the input state for every other
 * refusal, and threw for a wrong-owner reabsorb. So a direct call (a stale panel, an AI decision batched earlier,
 * a test) could sign a treaty the panel would never have offered, and a refusal was indistinguishable from "the AI
 * declined".
 */
import { describe, it, expect } from 'vitest';
import type { DiplomaticAction, GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import {
  applyDiplomaticAction,
  getAvailableDiplomaticActions,
  resolveDiplomaticAction,
} from '@/systems/diplomacy-system';
import {
  DIPLOMATIC_ACTION_DENIAL_MESSAGES,
  NAP_TECHS,
  OFFERED_DIPLOMATIC_ACTIONS,
} from '@/systems/diplomacy-actions';
import { TECH_TREE } from '@/systems/tech-definitions';

const ALL_ACTIONS: readonly DiplomaticAction[] = [
  'declare_war', 'request_peace', 'non_aggression_pact', 'trade_agreement', 'open_borders', 'alliance',
  'offer_vassalage', 'petition_independence', 'release_vassal', 'defend_vassal', 'propose_embargo', 'join_embargo',
  'leave_embargo', 'propose_league', 'invite_to_league', 'petition_league', 'leave_league', 'reabsorb_breakaway',
  'arms_control_pact',
];

function baseGame(): GameState {
  const state = createNewGame(undefined, 'diplomacy-action-contract', 'small');
  state.civilizations.player.diplomacy.relationships['ai-1'] = 40;
  state.civilizations['ai-1'].diplomacy.relationships.player = 40;
  return state;
}

function meet(state: GameState): GameState {
  state.civilizations.player.knownCivilizations = ['ai-1'];
  state.civilizations['ai-1'].knownCivilizations = ['player'];
  return state;
}

function unlock(state: GameState, era: number): GameState {
  state.civilizations.player.techState.completed = TECH_TREE.filter(tech => tech.era <= era).map(tech => tech.id);
  return state;
}

function atWar(state: GameState): GameState {
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  return state;
}

function actorIsVassal(state: GameState): GameState {
  state.civilizations.player.diplomacy.vassalage.overlord = 'ai-1';
  return state;
}

const SCENARIOS: Array<[string, () => GameState]> = [
  ['unmet, no techs', () => baseGame()],
  ['unmet, era 4 techs', () => unlock(baseGame(), 4)],
  ['met, no techs', () => meet(baseGame())],
  ['met, only the non-aggression tech', () => {
    const state = meet(baseGame());
    state.civilizations.player.techState.completed = [...NAP_TECHS];
    return state;
  }],
  ['met, era 4 techs', () => unlock(meet(baseGame()), 4)],
  ['met, era 4 techs, at war', () => atWar(unlock(meet(baseGame()), 4))],
  ['met, era 4 techs, actor is a vassal', () => actorIsVassal(unlock(meet(baseGame()), 4))],
];

describe('#1221 diplomatic executor revalidates the offer surface', () => {
  it.each(SCENARIOS)('every action: executor ok ⇔ resolver ok, a refusal leaves state untouched and has copy (%s)', (_name, build) => {
    const state = build();
    for (const action of ALL_ACTIONS) {
      const eligibility = resolveDiplomaticAction(state, 'player', 'ai-1', action);
      const outcome = applyDiplomaticAction(state, 'player', 'ai-1', action, new EventBus());
      expect(outcome.ok, `${action}`).toBe(eligibility.ok);
      if (!outcome.ok) {
        expect(eligibility.ok).toBe(false);
        if (eligibility.ok) continue;
        expect(outcome.reason, action).toBe(eligibility.reason);
        expect(outcome.state, `${action} must hand back the very same state`).toBe(state);
        expect(DIPLOMATIC_ACTION_DENIAL_MESSAGES[outcome.reason].length).toBeGreaterThan(0);
      }
    }
  });

  it('the scenarios are not vacuous: they produce executions, refusals, and several distinct reasons', () => {
    const reasons = new Set<string>();
    let executed = 0;
    for (const [, build] of SCENARIOS) {
      const state = build();
      for (const action of ALL_ACTIONS) {
        const eligibility = resolveDiplomaticAction(state, 'player', 'ai-1', action);
        if (eligibility.ok) executed += 1;
        else reasons.add(eligibility.reason);
      }
    }
    expect(executed).toBeGreaterThan(0);
    expect(reasons.size).toBeGreaterThanOrEqual(4);
  });

  it('offered ⇒ executable: every action the panel offers is accepted by the executor', () => {
    const state = unlock(meet(baseGame()), 4);
    const offered = getAvailableDiplomaticActions(state, 'player', 'ai-1');
    expect(offered.length).toBeGreaterThan(1);
    for (const action of offered) {
      expect(applyDiplomaticAction(state, 'player', 'ai-1', action, new EventBus()).ok, action).toBe(true);
    }
  });

  it('withheld ⇒ refused: an offerable action the panel withholds is refused by the executor, with the panel\'s reason', () => {
    // Met, but no technology: the panel withholds every treaty, and so must the executor (the pre-#1221 gap).
    const state = meet(baseGame());
    const offered = new Set(getAvailableDiplomaticActions(state, 'player', 'ai-1'));
    const withheld = OFFERED_DIPLOMATIC_ACTIONS.filter(action => !offered.has(action));
    expect(withheld).toContain('alliance');
    expect(withheld).toContain('trade_agreement');
    for (const action of withheld) {
      const outcome = applyDiplomaticAction(state, 'player', 'ai-1', action, new EventBus());
      expect(outcome.ok, action).toBe(false);
      expect(outcome.state).toBe(state);
    }
    const alliance = applyDiplomaticAction(state, 'player', 'ai-1', 'alliance', new EventBus());
    expect(alliance.ok ? null : alliance.reason).toBe('not-yet-unlocked');
  });

  it('an unlock-gated treaty cannot be signed by a direct call', () => {
    const state = meet(baseGame());
    const outcome = applyDiplomaticAction(state, 'player', 'ai-1', 'non_aggression_pact', new EventBus());
    expect(outcome.ok).toBe(false);
    expect(outcome.state.civilizations.player.diplomacy.treaties).toHaveLength(0);
    expect(outcome.state.pendingDiplomacyRequests ?? []).toHaveLength(0);
  });

  it('a wrong-owner reabsorb is a typed refusal, never a thrown Error', () => {
    const state = meet(baseGame());
    expect(() => applyDiplomaticAction(state, 'player', 'ai-1', 'reabsorb_breakaway', new EventBus())).not.toThrow();
    const outcome = applyDiplomaticAction(state, 'player', 'ai-1', 'reabsorb_breakaway', new EventBus());
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? null : outcome.reason).toBe('not-available');
  });

  it('an unknown target is refused without throwing', () => {
    const state = baseGame();
    const outcome = applyDiplomaticAction(state, 'player', 'ghost', 'alliance', new EventBus());
    expect(outcome.ok).toBe(false);
    expect(outcome.state).toBe(state);
  });

  describe('viewer safety (hot seat)', () => {
    it('an unmet civ is refused as "not met" whether or not it is secretly a vassal, and the copy names nobody', () => {
      const plain = unlock(baseGame(), 4);
      const secretVassal = unlock(baseGame(), 4);
      secretVassal.civilizations['ai-1'].diplomacy.vassalage.overlord = 'ai-2';
      for (const action of ['declare_war', 'alliance', 'trade_agreement'] as const) {
        const a = resolveDiplomaticAction(plain, 'player', 'ai-1', action);
        const b = resolveDiplomaticAction(secretVassal, 'player', 'ai-1', action);
        expect(a, action).toEqual({ ok: false, reason: 'not-met' });
        expect(b, action).toEqual(a);
      }
    });

    it('no denial copy mentions a civilization, a treaty partner or an id', () => {
      for (const [reason, message] of Object.entries(DIPLOMATIC_ACTION_DENIAL_MESSAGES)) {
        expect(message, reason).not.toMatch(/ai-\d|player|civ-/i);
      }
    });
  });
});
