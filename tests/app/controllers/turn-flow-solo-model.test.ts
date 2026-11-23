// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as saveManager from '@/storage/save-manager';
import * as aiRoundScheduler from '@/ai/ai-round-scheduler';
import { createTurnFlowController } from '@/app/controllers/turn-flow-controller';
import { baseDeps, makeFixture } from '../../helpers/turn-flow-harness';
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
 * A model of solo End Turn, explored over every sequence of failures, and replayed against the real controller.
 *
 * The solo flow is a small state machine with three fallible steps: simulate the round, (present it), persist it.
 * `ceb998bcd` fixed it three times over: a failed save left an advanced round with nothing durable and the next End
 * Turn ran another round on top of it, a victory returned before its save, and a throwing presentation skipped the
 * publication and the save. Each was found by hand. This test enumerates instead: for every ordering of
 * simulation and save outcomes over several End Turn presses it asks the model what must happen, runs the real
 * controller through the same outcomes, and requires the two to agree, plus the guarantee itself:
 *
 *   a round is never run while the previous one is not durable.
 */

type Outcome = 'ok' | 'fail';
type Decision = 'save' | 'sim';

interface Model {
  turn: number;
  /** The last round's save failed and has not been retried successfully. */
  unsaved: boolean;
  simAttempts: number;
  /** The turn of each save attempt, in order. */
  saves: number[];
  /** Highest turn whose save succeeded. */
  durable: number;
}

/** One End Turn press, reading each outcome from the oracle in the order the real flow asks for it. */
function press(model: Model, ask: (kind: Decision) => Outcome): void {
  if (model.unsaved) {
    model.saves.push(model.turn);
    if (ask('save') === 'fail') return; // the retry failed: no new round
    model.unsaved = false;
    model.durable = model.turn;
  }
  model.simAttempts++;
  if (ask('sim') === 'fail') return; // a failed simulation adopts nothing
  model.turn++;
  model.saves.push(model.turn);
  if (ask('save') === 'fail') {
    model.unsaved = true;
  } else {
    model.durable = model.turn;
  }
}

class NeedChoice extends Error {
  constructor(readonly kind: Decision) { super('need choice'); }
}

/** Every complete script of outcomes the model can be asked for over `presses` presses (depth-first). */
function enumerateScripts(startTurn: number, presses: number): Array<{ script: Outcome[]; kinds: Decision[] }> {
  const leaves: Array<{ script: Outcome[]; kinds: Decision[] }> = [];
  const explore = (prefix: Outcome[]): void => {
    const kinds: Decision[] = [];
    const model: Model = { turn: startTurn, unsaved: false, simAttempts: 0, saves: [], durable: startTurn };
    let cursor = 0;
    try {
      for (let i = 0; i < presses; i++) {
        press(model, kind => {
          if (cursor >= prefix.length) throw new NeedChoice(kind);
          kinds.push(kind);
          return prefix[cursor++]!;
        });
      }
    } catch (error) {
      if (!(error instanceof NeedChoice)) throw error;
      explore([...prefix, 'ok']);
      explore([...prefix, 'fail']);
      return;
    }
    leaves.push({ script: prefix, kinds });
  };
  explore([]);
  return leaves;
}

const PRESSES = 3;

describe('solo End Turn: model-checked against the real controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the model alone never runs a round on top of a round that is not durable', () => {
    const scripts = enumerateScripts(1, 4);
    expect(scripts.length).toBeGreaterThan(50);
    for (const { script } of scripts) {
      const model: Model = { turn: 1, unsaved: false, simAttempts: 0, saves: [], durable: 1 };
      let cursor = 0;
      const ask = (): Outcome => script[cursor++]!;
      for (let i = 0; i < 4; i++) {
        const before = { ...model };
        press(model, ask);
        const ranARound = model.simAttempts > before.simAttempts;
        // A round may start only when everything before it is durable.
        if (ranARound) expect(before.unsaved && model.durable < before.turn, script.join(',')).toBe(false);
        expect(model.turn - model.durable, `${script.join(',')} left two rounds undurable`).toBeLessThanOrEqual(1);
      }
    }
  });

  const startTurn = makeFixture().turn;
  const scripts = enumerateScripts(startTurn, PRESSES);

  it(`the real controller agrees with the model for all ${scripts.length} outcome sequences over ${PRESSES} presses`, async () => {
    const actual = await vi.importActual<typeof aiRoundScheduler>('@/ai/ai-round-scheduler');
    for (const { script, kinds } of scripts) {
      let cursor = 0;
      const asked: Decision[] = [];
      const next = (kind: Decision): Outcome => {
        asked.push(kind);
        return script[cursor++] ?? 'ok';
      };
      vi.mocked(saveManager.autoSave).mockReset();
      vi.mocked(saveManager.autoSave).mockImplementation(async () => {
        if (next('save') === 'fail') throw new Error('QuotaExceededError');
      });
      vi.mocked(aiRoundScheduler.processNonHumanMajorRound).mockReset();
      vi.mocked(aiRoundScheduler.processNonHumanMajorRound).mockImplementation((current, bus) => {
        if (next('sim') === 'fail') throw new Error('simulation exploded');
        return actual.processNonHumanMajorRound(current, bus);
      });

      const deps = baseDeps(makeFixture());
      const turnFlow = createTurnFlowController(deps);
      const model: Model = { turn: startTurn, unsaved: false, simAttempts: 0, saves: [], durable: startTurn };
      let modelCursor = 0;
      const label = `script [${script.join(',')}]`;

      for (let i = 0; i < PRESSES; i++) {
        press(model, () => script[modelCursor++]!);
        await turnFlow.endTurn({ allowUnmovedUnits: true });

        expect(deps.session.getState().turn, `${label}, press ${i + 1}: turn`).toBe(model.turn);
        expect(vi.mocked(aiRoundScheduler.processNonHumanMajorRound).mock.calls.length, `${label}, press ${i + 1}: rounds attempted`)
          .toBe(model.simAttempts);
        expect(vi.mocked(saveManager.autoSave).mock.calls.map(([saved]) => saved.turn), `${label}, press ${i + 1}: saves`)
          .toEqual(model.saves);
      }
      // The real flow asked for outcomes in exactly the order the model did, and used all of them.
      expect(asked, `${label}: order of fallible steps`).toEqual(kinds);
    }
  }, simTimeout(20_000));
});
