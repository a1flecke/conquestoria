// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as saveManager from '@/storage/save-manager';
import * as aiRoundScheduler from '@/ai/ai-round-scheduler';
import type { GameState } from '@/core/types';
import { createTurnFlowController } from '@/app/controllers/turn-flow-controller';
import { baseDeps, clearRequiredChoices, makeFixture } from '../../helpers/turn-flow-harness';
import { simTimeout } from '../../helpers/sim-timeout';

vi.mock('@/storage/save-manager', async () => {
  const actual = await vi.importActual<typeof saveManager>('@/storage/save-manager');
  return { ...actual, autoSave: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('@/ai/ai-round-scheduler', async () => {
  const actual = await vi.importActual<typeof aiRoundScheduler>('@/ai/ai-round-scheduler');
  return { ...actual, processNonHumanMajorRound: vi.fn(actual.processNonHumanMajorRound) };
});

/**
 * A model of the hot-seat handoff between two human seats, explored over every interleaving of the player's
 * actions and every simulation/save failure, and replayed against the real controller and its handoff overlay.
 *
 * The handoff is a veil: from the moment a seat ends its turn until the next seat is revealed, nobody is
 * playing. `76065e9e6` fixed the bug this exists for (a second End Turn under the veil ended the *next* seat's
 * turn, and ran its round, unseen); the veil itself, the retry path after a failed save and the rule that a failed
 * round is not re-run by a save retry were each found one at a time. Here they are checked together:
 *
 *   - End Turn does nothing at all while a handoff is unrevealed;
 *   - a seat is revealed only once its handoff is ready;
 *   - a retry after a failed save never runs a second round, and a retry after a failed round runs exactly one.
 */

type Seat = 'A' | 'B';
type Phase = 'playing' | 'preparing' | 'ready' | 'error';
type Action = 'endTurn' | 'retry' | 'reveal';
type ErrorKind = 'sim' | 'persist' | 'intermediate';
type Outcome = 'ok' | 'fail';
type Fallible = 'sim' | 'save';

interface Model {
  phase: Phase;
  current: Seat;
  turn: number;
  /** Simulations of a round attempted (a failed one counts). */
  sims: number;
  /** The turn of each save attempt, in order. */
  saves: number[];
  /** How many handoff screens have been shown. */
  handoffs: number;
  errorKind: ErrorKind | null;
}

interface Ask {
  action(options: Action[]): Action;
  outcome(kind: Fallible): Outcome;
}

function enabled(model: Model): Action[] {
  const actions: Action[] = ['endTurn'];
  if (model.phase === 'error') actions.push('retry');
  if (model.phase === 'ready') actions.push('reveal');
  return actions;
}

function persistCompleted(model: Model, ask: Ask): void {
  model.saves.push(model.turn);
  if (ask.outcome('save') === 'ok') {
    model.phase = 'ready';
    model.errorKind = null;
  } else {
    model.phase = 'error';
    model.errorKind = 'persist';
  }
}

function simulate(model: Model, ask: Ask): void {
  model.phase = 'preparing';
  model.sims++;
  if (ask.outcome('sim') === 'fail') {
    model.phase = 'error';
    model.errorKind = 'sim';
    return; // a failed round adopts nothing
  }
  model.turn++;
  model.current = 'A';
  persistCompleted(model, ask);
}

function persistIntermediate(model: Model, ask: Ask): void {
  model.saves.push(model.turn);
  if (ask.outcome('save') === 'ok') {
    model.phase = 'ready';
    model.errorKind = null;
  } else {
    model.phase = 'error';
    model.errorKind = 'intermediate';
  }
}

function step(model: Model, action: Action, ask: Ask): void {
  if (action === 'endTurn') {
    if (model.phase !== 'playing') return; // the veil: nothing happens
    model.handoffs++;
    if (model.current === 'A') {
      model.current = 'B';
      model.phase = 'preparing';
      persistIntermediate(model, ask);
    } else {
      simulate(model, ask);
    }
  } else if (action === 'retry') {
    if (model.errorKind === 'sim') simulate(model, ask);
    else if (model.errorKind === 'persist') persistCompleted(model, ask);
    else persistIntermediate(model, ask);
  } else {
    model.saves.push(model.turn); // opening the turn saves the acknowledgement; its failure never blocks
    model.phase = 'playing';
  }
}

const freshModel = (turn: number): Model => ({
  phase: 'playing', current: 'A', turn, sims: 0, saves: [], handoffs: 0, errorKind: null,
});

/** One decision in a script: which action the player took, or how a fallible step went. */
type Choice = { k: 'action'; v: Action } | { k: 'sim' | 'save'; v: Outcome };

class NeedChoice extends Error {
  constructor(readonly options: Array<Choice>) { super('need choice'); }
}

/** Every script of `steps` player actions the model can be driven through (depth-first, lazy). */
function enumerateScripts(startTurn: number, steps: number): Array<{ script: Choice[]; snapshots: Model[] }> {
  const leaves: Array<{ script: Choice[]; snapshots: Model[] }> = [];
  const explore = (prefix: Choice[]): void => {
    const model = freshModel(startTurn);
    const snapshots: Model[] = [];
    let cursor = 0;
    const ask: Ask = {
      action: options => {
        if (cursor >= prefix.length) throw new NeedChoice(options.map(v => ({ k: 'action', v })));
        return (prefix[cursor++] as Extract<Choice, { k: 'action' }>).v;
      },
      outcome: kind => {
        if (cursor >= prefix.length) throw new NeedChoice([{ k: kind, v: 'ok' }, { k: kind, v: 'fail' }]);
        return (prefix[cursor++] as Extract<Choice, { k: Fallible }>).v;
      },
    };
    try {
      for (let i = 0; i < steps; i++) {
        step(model, ask.action(enabled(model)), ask);
        snapshots.push(structuredClone(model));
      }
    } catch (error) {
      if (!(error instanceof NeedChoice)) throw error;
      for (const option of error.options) explore([...prefix, option]);
      return;
    }
    leaves.push({ script: prefix, snapshots });
  };
  explore([]);
  return leaves;
}

const STEPS = 6;
const SEAT_ID: Record<Seat, string> = { A: 'player', B: '' };

function makeHotSeat(): { state: GameState; seatB: string } {
  const state = makeFixture();
  const seatB = Object.keys(state.civilizations).find(id => id !== 'player')!;
  state.civilizations['player']!.isHuman = true;
  state.civilizations[seatB]!.isHuman = true;
  state.hotSeat = {
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Alice', slotId: 'player', civType: state.civilizations['player']!.civType, isHuman: true },
      { name: 'Bob', slotId: seatB, civType: state.civilizations[seatB]!.civType, isHuman: true },
    ],
  };
  clearRequiredChoices(state, 'player');
  clearRequiredChoices(state, seatB);
  return { state, seatB };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

describe('hot-seat handoff: model-checked against the real controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  const startTurn = makeHotSeat().state.turn;
  const scripts = enumerateScripts(startTurn, STEPS);

  it('the model alone: End Turn under the veil is a no-op, and a retry after a failed save never runs a round', () => {
    expect(scripts.length).toBeGreaterThan(200);
    for (const { script } of scripts) {
      const model = freshModel(startTurn);
      let cursor = 0;
      const ask: Ask = {
        action: () => (script[cursor++] as Extract<Choice, { k: 'action' }>).v,
        outcome: () => (script[cursor++] as Extract<Choice, { k: Fallible }>).v,
      };
      for (let i = 0; i < STEPS; i++) {
        const action = ask.action(enabled(model));
        const before = structuredClone(model);
        step(model, action, ask);
        if (action === 'endTurn' && before.phase !== 'playing') {
          expect(model, `${script.map(c => c.v).join(',')}: End Turn under the veil changed something`).toEqual(before);
        }
        if (action === 'retry' && before.errorKind !== 'sim') {
          expect(model.sims, 'a save retry ran a round').toBe(before.sims);
        }
        if (action === 'reveal') expect(before.phase).toBe('ready');
      }
    }
  });

  it(`the real controller agrees with the model for all ${scripts.length} action/failure sequences over ${STEPS} steps`, async () => {
    const actual = await vi.importActual<typeof aiRoundScheduler>('@/ai/ai-round-scheduler');
    for (const { script, snapshots } of scripts) {
      let cursor = 0;
      let revealing = false;
      const nextOutcome = (kind: Fallible): Outcome => {
        const choice = script[cursor++];
        expect(choice?.k, `${label()}: the real flow asked for ${kind} but the script had ${choice?.k}`).toBe(kind);
        return choice!.v as Outcome;
      };
      const label = (): string => `script [${script.map(c => c.v).join(',')}] (cursor ${cursor})`;

      vi.mocked(saveManager.autoSave).mockReset();
      vi.mocked(saveManager.autoSave).mockImplementation(async () => {
        if (revealing) return; // the acknowledgement save: a failure never blocks, so it is not a decision
        if (nextOutcome('save') === 'fail') throw new Error('QuotaExceededError');
      });
      vi.mocked(aiRoundScheduler.processNonHumanMajorRound).mockReset();
      vi.mocked(aiRoundScheduler.processNonHumanMajorRound).mockImplementation((current, bus) => {
        if (nextOutcome('sim') === 'fail') throw new Error('simulation exploded');
        return actual.processNonHumanMajorRound(current, bus);
      });

      document.body.replaceChildren();
      const { state, seatB } = makeHotSeat();
      SEAT_ID.B = seatB;
      const deps = baseDeps(state);
      const turnFlow = createTurnFlowController(deps);
      const handoffsShown = (): number => vi.mocked(deps.setBlockingOverlay).mock.calls.filter(call => call[0] === 'turn-handoff').length;

      for (let i = 0; i < STEPS; i++) {
        const choice = script[cursor++]!;
        expect(choice.k, `${label()}: expected an action`).toBe('action');
        const action = choice.v as Action;
        if (action === 'endTurn') {
          await turnFlow.endTurn({ allowUnmovedUnits: true });
        } else if (action === 'retry') {
          document.querySelector<HTMLButtonElement>('[data-action="retry-handoff"]')!.click();
        } else {
          revealing = true;
          document.querySelector<HTMLButtonElement>('#handoff-confirm')!.click();
          await settle();
          document.querySelector<HTMLButtonElement>('#handoff-start')!.click();
        }
        await settle();
        revealing = false;

        const expected = snapshots[i]!;
        const where = `${label()}, step ${i + 1} (${action})`;
        expect(deps.session.getState().turn, `${where}: turn`).toBe(expected.turn);
        expect(deps.session.getState().currentPlayer, `${where}: current seat`).toBe(SEAT_ID[expected.current]);
        expect(vi.mocked(aiRoundScheduler.processNonHumanMajorRound).mock.calls.length, `${where}: rounds attempted`).toBe(expected.sims);
        expect(vi.mocked(saveManager.autoSave).mock.calls.map(([saved]) => saved.turn), `${where}: saves`).toEqual(expected.saves);
        expect(handoffsShown(), `${where}: handoff screens shown`).toBe(expected.handoffs);
        expect(document.querySelectorAll('#turn-handoff').length, `${where}: veil present`).toBe(expected.phase === 'playing' ? 0 : 1);
      }
      expect(cursor, `${label()}: every decision was used`).toBe(script.length);
      document.querySelector('#turn-handoff')?.remove();
    }
  }, simTimeout(60_000));
});
