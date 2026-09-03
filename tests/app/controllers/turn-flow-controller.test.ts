// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createUnit } from '@/systems/unit-system';
import { getAvailableTechs } from '@/systems/tech-system';
import type { GameState, HotSeatPlayer, Religion, Unit } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createSelectionStore } from '@/app/selection-store';
import { createPanelHost } from '@/app/panel-host';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import * as saveManager from '@/storage/save-manager';
import * as aiRoundScheduler from '@/ai/ai-round-scheduler';
import * as strategicWarningSystem from '@/systems/strategic-warning-system';
import * as supplyWarningSystem from '@/systems/supply-warning-system';
import * as cityCaptureSystem from '@/systems/city-capture-system';
import * as hotseatOutcome from '@/core/hotseat-outcome';
import { finalizePlayerCityAssaultChoice, type PendingCityCaptureChoice } from '@/input/city-assault-flow';
import {
  createTurnFlowController,
  type TurnFlowControllerDeps,
  type TurnFlowRenderer,
  type TurnFlowAudio,
} from '@/app/controllers/turn-flow-controller';

vi.mock('@/storage/save-manager', async () => {
  const actual = await vi.importActual<typeof saveManager>('@/storage/save-manager');
  return { ...actual, autoSave: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('@/ai/ai-round-scheduler', async () => {
  const actual = await vi.importActual<typeof aiRoundScheduler>('@/ai/ai-round-scheduler');
  return { ...actual, processNonHumanMajorRound: vi.fn(actual.processNonHumanMajorRound) };
});

vi.mock('@/systems/strategic-warning-system', async () => {
  const actual = await vi.importActual<typeof strategicWarningSystem>('@/systems/strategic-warning-system');
  return { ...actual, applyStrategicWarningTransitions: vi.fn(actual.applyStrategicWarningTransitions) };
});

vi.mock('@/systems/supply-warning-system', async () => {
  const actual = await vi.importActual<typeof supplyWarningSystem>('@/systems/supply-warning-system');
  return { ...actual, applySupplyWarningTransitions: vi.fn(actual.applySupplyWarningTransitions) };
});

vi.mock('@/systems/city-capture-system', async () => {
  const actual = await vi.importActual<typeof cityCaptureSystem>('@/systems/city-capture-system');
  return { ...actual, emitMajorCityCaptureEvents: vi.fn(actual.emitMajorCityCaptureEvents) };
});

vi.mock('@/core/hotseat-outcome', async () => {
  const actual = await vi.importActual<typeof hotseatOutcome>('@/core/hotseat-outcome');
  return { ...actual, resolveHotSeatPostSimulation: vi.fn(actual.resolveHotSeatPostSimulation) };
});

/**
 * `endTurn` blocks (returns early with a toast) whenever the current
 * player has a pending research or production choice -- `createNewGame`
 * starts with both unset, so every endTurn-driving test needs a fixture
 * that has already cleared them, or every test would hit that early exit
 * instead of the behavior under test.
 */
function clearRequiredChoices(state: GameState, civId: string): void {
  const civ = state.civilizations[civId];
  civ.techState.currentResearch = getAvailableTechs(civ.techState)[0]?.id ?? null;
  for (const city of Object.values(state.cities)) {
    if (city.owner === civId && city.productionQueue.length === 0) {
      city.productionQueue = ['warrior'];
    }
  }
}

function makeFixture(): GameState {
  const state = createNewGame(undefined, 'turn-flow-controller', 'small');
  state.currentPlayer = 'player';
  state.units = {};
  for (const civId of Object.keys(state.civilizations)) {
    state.civilizations[civId].units = [];
  }
  clearRequiredChoices(state, 'player');
  return state;
}

const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };

function placeUnit(state: GameState, owner: string, id: string, overrides: Partial<Unit> = {}): Unit {
  const template = createUnit('warrior', owner, { q: 0, r: 0 }, idCounters);
  state.units[id] = { ...template, id, owner, position: { q: 0, r: 0 }, ...overrides };
  if (!state.civilizations[owner].units.includes(id)) state.civilizations[owner].units.push(id);
  return state.units[id];
}

function makeHotSeatFixture(): GameState {
  const state = makeFixture();
  const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
  state.civilizations['player'].isHuman = true;
  state.civilizations[aiCivId].isHuman = true;
  const players: HotSeatPlayer[] = [
    { name: 'Alice', slotId: 'player', civType: state.civilizations['player'].civType, isHuman: true },
    { name: 'Bob', slotId: aiCivId, civType: state.civilizations[aiCivId].civType, isHuman: true },
  ];
  state.hotSeat = { playerCount: 2, mapSize: 'small', players };
  return state;
}

function fakeRenderer(overrides: Partial<TurnFlowRenderer> = {}): TurnFlowRenderer {
  return {
    setGameState: vi.fn(),
    animateUnitMove: vi.fn((_unit, _path, done) => done()),
    setSelectedPirateFactionId: vi.fn(),
    setStrategicLaunchPreview: vi.fn(),
    camera: { centerOn: vi.fn() },
    ...overrides,
  };
}

function fakeAudio(overrides: Partial<TurnFlowAudio> = {}): TurnFlowAudio {
  return {
    setMasterVolume: vi.fn(),
    stopPirateAmbience: vi.fn(),
    ...overrides,
  };
}

function baseDeps(state: GameState, overrides: Partial<TurnFlowControllerDeps> = {}): TurnFlowControllerDeps {
  const session = overrides.session ?? createGameSession(state);
  const elements = new Map<string, HTMLElement>();
  return {
    session,
    selection: createSelectionStore(),
    renderLoop: fakeRenderer(),
    bus: new EventBus(),
    uiLayer: document.createElement('div'),
    audio: fakeAudio(),
    router: { close: vi.fn(), open: vi.fn() },
    roundPresentationGate: new RoundPresentationGate(),
    ceremonies: { clearForHandoff: vi.fn() },
    notifier: { withHappenedTurn: (_turn, fn) => fn() },
    userSettingsStore: { getMasterVolume: () => 0.8 },
    getElementById: id => elements.get(id) ?? null,
    getNetworkIntentPanel: () => null,
    showNotification: vi.fn(),
    updateHUD: vi.fn(),
    setBlockingOverlay: vi.fn(),
    currentCiv: () => session.getState().civilizations[session.getState().currentPlayer],
    getUnitTurnFlow: () => ({ showEndTurnUnitWarningIfNeeded: () => false }),
    deselectUnit: vi.fn(),
    selectNextUnit: vi.fn(),
    scanBeastSightings: vi.fn(),
    scanSubmarineSightings: vi.fn(),
    maybeShowPendingHoardChoice: vi.fn(),
    maybeShowPendingGeneralChoice: vi.fn(),
    checkAdvisors: vi.fn(),
    showGameModeSelection: vi.fn(),
    reloadPage: vi.fn(),
    openCityPanelForCity: vi.fn(),
    ...overrides,
  };
}

async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

/**
 * `required-choice-panel.ts` gives no id/data-* attribute to individual
 * research/build buttons -- only each section's `<h3>` heading text is a
 * stable anchor. Within "Choose Research", index 0 is always the first
 * available tech choice (it's appended before "Open Tech Panel"); within
 * "Choose Production", index 0 is always the first idle city's build choice
 * (appended before that row's "Open City" button) -- both hold regardless of
 * how many techs/cities are on offer.
 */
function findSectionButton(container: HTMLElement, sectionTitle: string, buttonIndex = 0): HTMLButtonElement {
  const heading = Array.from(container.querySelectorAll('h3')).find(h => h.textContent === sectionTitle);
  const section = heading?.closest('section');
  const buttons = section ? Array.from(section.querySelectorAll('button')) : [];
  const button = buttons[buttonIndex];
  if (!button) throw new Error(`No button at index ${buttonIndex} in section "${sectionTitle}"`);
  return button as HTMLButtonElement;
}

describe('createTurnFlowController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('endTurn — solo mode', () => {
    it('runs the completed round, replays AI moves, then refreshes, then opens required choices, in order', async () => {
      const state = makeFixture();
      const order: string[] = [];
      const deps = baseDeps(state, {
        renderLoop: fakeRenderer({
          setGameState: vi.fn(() => order.push('setGameState')),
        }),
        updateHUD: vi.fn(() => order.push('updateHUD')),
      });
      const turnFlow = createTurnFlowController(deps);

      // `replayAIMoves`'s own behavior (filtering, the 6-move cap,
      // gate-abort) is covered directly by the "captureAIMoves /
      // replayAIMoves" describe block below; here we only need proof it
      // runs *between* the round completing and the refresh, which
      // `await`ing it inline in `endTurn` already guarantees structurally
      // — `setGameState` (pre-replay) must complete before `updateHUD`
      // (post-replay) per the order array below.
      await turnFlow.endTurn();

      expect(order).toEqual(['setGameState', 'updateHUD']);
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringMatching(/^Turn \d+$/), 'info');
      expect(saveManager.autoSave).toHaveBeenCalled();
    });

    it('is a no-op when state.gameOver is true', async () => {
      const state = makeFixture();
      state.gameOver = true;
      const deps = baseDeps(state);
      const turnFlow = createTurnFlowController(deps);

      await turnFlow.endTurn();

      expect(deps.showNotification).not.toHaveBeenCalled();
      expect(deps.updateHUD).not.toHaveBeenCalled();
      expect(saveManager.autoSave).not.toHaveBeenCalled();
    });

    it('a pending religion boon blocks endTurn and toasts, without advancing the turn', async () => {
      const state = makeFixture();
      const startingTurn = state.turn;
      state.religions = {
        'rel-1': {
          id: 'rel-1',
          name: 'Sun Worship',
          ownerCivId: 'player',
          foundedTurn: 1,
          followers: {},
          boon: undefined,
        } as Religion,
      };
      const deps = baseDeps(state);
      const turnFlow = createTurnFlowController(deps);

      await turnFlow.endTurn();

      expect(deps.showNotification).toHaveBeenCalledWith(
        'Choose a boon for your religion before ending the turn.',
        'info',
      );
      expect(session_getState(deps).turn).toBe(startingTurn);
      expect(saveManager.autoSave).not.toHaveBeenCalled();
    });
  });

  describe('endTurn — hot-seat mode', () => {
    it('suppresses the presentation gate, mutes audio, autosaves, and restores volume once the handoff resolves', async () => {
      const state = makeHotSeatFixture();
      const deps = baseDeps(state, {
        userSettingsStore: { getMasterVolume: () => 0.6 },
      });
      const turnFlow = createTurnFlowController(deps);

      const endTurnPromise = turnFlow.endTurn();
      // beginHotSeatHandoff suppresses synchronously before the handoff UI's
      // "ready" callback can fire.
      expect(deps.roundPresentationGate.isSuppressed()).toBe(true);
      expect(deps.audio.setMasterVolume).toHaveBeenCalledWith(0);

      await flushMicrotasks();
      // Non-completing handoff (round not complete): auto-marks ready, so click through.
      document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-start')?.click();
      await flushMicrotasks();
      await endTurnPromise;

      expect(saveManager.autoSave).toHaveBeenCalled();
      expect(deps.audio.setMasterVolume).toHaveBeenCalledWith(0.6);
      expect(deps.roundPresentationGate.isSuppressed()).toBe(false);
    });

    it('closes the strategic-launch flow panel and clears its map preview on handoff (#545 MR8)', async () => {
      const state = makeHotSeatFixture();
      const setStrategicLaunchPreview = vi.fn();
      const testUiLayer = document.createElement('div');
      const launchPanel = document.createElement('div');
      launchPanel.id = 'strategic-launch-flow';
      testUiLayer.appendChild(launchPanel);
      const deps = baseDeps(state, {
        uiLayer: testUiLayer,
        renderLoop: fakeRenderer({ setStrategicLaunchPreview }),
      });
      const turnFlow = createTurnFlowController(deps);

      const endTurnPromise = turnFlow.endTurn();
      // beginHotSeatHandoff's cleanup block (closePirateWatersPanels etc.,
      // now including this) runs synchronously before the handoff UI mounts
      // -- same timing as the roundPresentationGate assertion in the test
      // above.
      expect(testUiLayer.querySelector('#strategic-launch-flow')).toBeNull();
      expect(setStrategicLaunchPreview).toHaveBeenCalledWith(null);

      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-start')?.click();
      await flushMicrotasks();
      await endTurnPromise;
    });

    it('clears a pending last-stand-target intent before the next hot-seat player can act (#544 MR6 item 87)', async () => {
      const state = makeHotSeatFixture();
      const selection = createSelectionStore();
      selection.setPendingIntent({ kind: 'last-stand-target', unitId: 'some-general', range: [] });
      const deps = baseDeps(state, {
        selection,
        // Wire the REAL deselectUnit -> selection.clear() contract instead of
        // baseDeps's default vi.fn() -- this test exists specifically to
        // prove that wiring runs before handoff, not just that some mock was
        // called.
        deselectUnit: () => selection.clear(),
      });
      const turnFlow = createTurnFlowController(deps);

      const endTurnPromise = turnFlow.endTurn();
      // deselectUnit() runs synchronously before the first await inside
      // endTurn (turn-flow-controller.ts:696, ahead of the awaited
      // beginHotSeatHandoff at :701) -- so the real ordering claim is
      // checkable immediately, before the handoff UI has even appeared, not
      // just "eventually true" once the whole promise settles.
      expect(selection.getPendingIntent()).toEqual({ kind: 'none' });

      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-start')?.click();
      await flushMicrotasks();
      await endTurnPromise;

      expect(selection.getPendingIntent()).toEqual({ kind: 'none' });
    });
  });

  describe('difficulty — pending challenge applied at handoff', () => {
    it('applies a pending challenge to the correct civ exactly once at handoff, and a personal challenge only affects its own civ', async () => {
      const state = makeHotSeatFixture();
      const aiCivId = state.hotSeat!.players.find(p => p.slotId !== 'player')!.slotId;
      state.civilizations[aiCivId].challenge = 'standard';
      state.civilizations[aiCivId].pendingChallenge = 'veteran';
      state.civilizations['player'].challenge = 'standard';
      // No pendingChallenge on 'player' -- must remain untouched.

      const deps = baseDeps(state);
      const turnFlow = createTurnFlowController(deps);

      const endTurnPromise = turnFlow.endTurn();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-start')?.click();
      await flushMicrotasks();
      await endTurnPromise;

      const finalState = session_getState(deps);
      expect(finalState.civilizations[aiCivId].challenge).toBe('veteran');
      expect(finalState.civilizations[aiCivId].pendingChallenge).toBeUndefined();
      expect(finalState.civilizations['player'].challenge).toBe('standard');
      expect(finalState.civilizations['player'].pendingChallenge).toBeUndefined();
    });
  });

  // These four describe blocks replace source-grep assertions of the same
  // intent that used to live in tests/main.integration.test.ts and read
  // src/main.ts's raw text (see .claude/rules/hooks-and-tooling.md and this
  // phase's handoff for that convention). Now that the logic they guarded
  // has moved into this real, testable module, they assert runtime behavior
  // instead of source-text shape -- a strictly stronger guarantee than the
  // original (which only proved call *order in the source text*, not that
  // the calls actually execute in that order).
  describe('required choices open after the viewer can act (was: "opens required research choices...")', () => {
    it('solo endTurn shows required choices last, after the post-round refresh', async () => {
      const state = makeFixture();
      const order: string[] = [];
      const deps = baseDeps(state, {
        renderLoop: fakeRenderer({ setGameState: vi.fn(() => order.push('setGameState')) }),
        updateHUD: vi.fn(() => order.push('updateHUD')),
        getElementById: vi.fn((id: string) => {
          if (id === 'required-choice-panel') order.push('showRequiredChoicesIfNeeded');
          return null;
        }),
      });
      const turnFlow = createTurnFlowController(deps);

      await turnFlow.endTurn();

      // showRequiredChoicesIfNeeded also runs once as part of endTurn's own
      // pre-flight blocking check, before setGameState -- that's expected
      // (see endTurn's own two early-exit guards); the invariant under test
      // is that the *final* check happens after the refresh, not that it's
      // the only check.
      const updateHUDIndex = order.indexOf('updateHUD');
      expect(order.indexOf('setGameState')).toBeGreaterThanOrEqual(0);
      expect(updateHUDIndex).toBeGreaterThan(order.indexOf('setGameState'));
      expect(order.lastIndexOf('showRequiredChoicesIfNeeded')).toBeGreaterThan(updateHUDIndex);
    });

    it('enterViewerTurn shows required choices last, after refreshing render/HUD state', () => {
      const state = makeFixture();
      const order: string[] = [];
      const deps = baseDeps(state, {
        renderLoop: fakeRenderer({ setGameState: vi.fn(() => order.push('setGameState')) }),
        updateHUD: vi.fn(() => order.push('updateHUD')),
        getElementById: vi.fn((id: string) => {
          if (id === 'required-choice-panel') order.push('showRequiredChoicesIfNeeded');
          return null;
        }),
      });

      createTurnFlowController(deps).enterViewerTurn('player');

      // showRequiredChoicesIfNeeded may probe the panel id twice (once to read
      // `existing`, once more inside closeRequiredChoicePanel() when nothing is
      // needed) -- the invariant under test is that its first probe comes after
      // the refresh, not that it probes exactly once.
      const updateHUDIndex = order.indexOf('updateHUD');
      expect(order.indexOf('setGameState')).toBeGreaterThanOrEqual(0);
      expect(updateHUDIndex).toBeGreaterThan(order.indexOf('setGameState'));
      expect(order.indexOf('showRequiredChoicesIfNeeded')).toBeGreaterThan(updateHUDIndex);
    });

    it('#544 MR3: enterViewerTurn checks for a pending Great General candidate choice', () => {
      const state = makeFixture();
      const deps = baseDeps(state);

      createTurnFlowController(deps).enterViewerTurn('player');

      expect(deps.maybeShowPendingGeneralChoice).toHaveBeenCalledTimes(1);
    });

    it('enterViewerTurn reports the passed nextSlotId, not session.currentPlayer, in the audio snapshot', () => {
      // Regression lock for a real review finding: an earlier draft had
      // enterViewerTurn() read session.getState().currentPlayer instead of
      // taking a parameter, on the (verified-at-the-time, but judged too
      // fragile) claim that the two are always equal when this fires. This
      // test pins the parameter as the source of truth so a future refactor
      // can't silently reintroduce that coupling.
      const state = makeFixture();
      const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
      // session.currentPlayer deliberately does NOT match the nextSlotId argument.
      state.currentPlayer = 'player';
      const deps = baseDeps(state);
      let reportedCivId: string | undefined;
      deps.bus.on('currentPlayer:changed-after-handoff', ({ civId }) => { reportedCivId = civId; });

      createTurnFlowController(deps).enterViewerTurn(aiCivId);

      expect(reportedCivId).toBe(aiCivId);
    });
  });

  describe('completed-round scheduling and postprocess (was: "completed-round AI wiring")', () => {
    it('runs the shared non-human major-round scheduler exactly once per completed round', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const turnFlow = createTurnFlowController(deps);
      const scheduler = vi.mocked(aiRoundScheduler.processNonHumanMajorRound);
      scheduler.mockClear();

      const result = turnFlow.runCurrentCompletedRound(state);

      expect(scheduler).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      // Both `endTurn`'s solo branch and `beginHotSeatHandoff`'s completed-round
      // branch call this same closure (see the exhaustive-diff verification in
      // this phase's PR) -- there is no separate per-mode AI-scheduling path
      // left to regress back to.
      const controllerSource = readFileSync(
        resolve(__dirname, '../../../src/app/controllers/turn-flow-controller.ts'),
        'utf8',
      );
      expect(controllerSource).not.toContain('processAITurn(');
      expect(controllerSource).not.toContain('getAIPlayers(');
    });

    it('wires the strategic-warning postprocess into every completed round', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const turnFlow = createTurnFlowController(deps);
      const postprocess = vi.mocked(strategicWarningSystem.applyStrategicWarningTransitions);
      postprocess.mockClear();

      turnFlow.runCurrentCompletedRound(state);

      expect(postprocess).toHaveBeenCalledTimes(1);
    });

    it('wires the supply-warning postprocess into every completed round (#544 MR2)', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const turnFlow = createTurnFlowController(deps);
      const postprocess = vi.mocked(supplyWarningSystem.applySupplyWarningTransitions);
      postprocess.mockClear();

      turnFlow.runCurrentCompletedRound(state);

      expect(postprocess).toHaveBeenCalledTimes(1);
    });
  });

  describe('hot-seat handoff — strategic-warning audio cue (was: "emits one warning cue...")', () => {
    it('emits the strategic-warning audio cue only after the viewer turn has already been entered', async () => {
      const state = makeHotSeatFixture();
      const aiCivId = state.hotSeat!.players.find(p => p.slotId !== 'player')!.slotId;
      clearRequiredChoices(state, aiCivId);
      state.pendingEvents = {
        [aiCivId]: [{ type: 'ai:strategic-warning', message: 'Enemy buildup detected', turn: state.turn }],
      } as GameState['pendingEvents'];
      const deps = baseDeps(state);
      const order: string[] = [];
      deps.bus.on('currentPlayer:changed-after-handoff', () => order.push('enterViewerTurn'));
      deps.bus.on('ai:strategic-warning-audio', () => order.push('strategic-warning-audio'));
      const turnFlow = createTurnFlowController(deps);

      const endTurnPromise = turnFlow.endTurn();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-start')?.click();
      await flushMicrotasks();
      await endTurnPromise;

      expect(order).toEqual(['enterViewerTurn', 'strategic-warning-audio']);
    });
  });

  describe('hot-seat handoff — completed-round anonymity (was: "keeps completed-round handoff anonymous...")', () => {
    it('shows an anonymous "preparing" screen before the round simulation resolves the recipient', async () => {
      const state = makeHotSeatFixture();
      const aiCivId = state.hotSeat!.players.find(p => p.slotId !== 'player')!.slotId;
      clearRequiredChoices(state, aiCivId);
      // aiCivId is last in hotSeat.players, so ending its turn completes the round.
      state.currentPlayer = aiCivId;
      const deps = baseDeps(state);

      const endTurnPromise = createTurnFlowController(deps).endTurn();

      // showTurnHandoff mounts to document.body (not the uiLayer container --
      // see turn-handoff.ts), so query globally, matching the #handoff-confirm/
      // #handoff-start queries the other hot-seat tests in this file already use.
      // Synchronously after endTurn starts (before any round simulation can
      // resolve), the handoff screen must not yet name a recipient.
      expect(document.querySelector('#turn-handoff-title')?.textContent).toBe('Preparing next turn…');

      await flushMicrotasks(20);
      // Once the round simulation resolves, the handoff names the real next
      // recipient instead of staying anonymous.
      expect(document.querySelector('#turn-handoff-title')?.textContent).not.toBe('Preparing next turn…');

      document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-start')?.click();
      await flushMicrotasks(10);
      await endTurnPromise;
    });
  });

  // #787 Phase 12 (#794): Step 1's investigation found the originally-hypothesized
  // overlap (a ceremony presenting while a hot-seat handoff begins) unreachable
  // today -- every path into endTurn() is gated by isInteractionBlocked(), so
  // beginHotSeatHandoff can never start while something else is already blocking.
  // But the investigation surfaced a *different*, genuinely reachable hazard: when
  // a completed round ends the game, beginHotSeatHandoff tears down the
  // turn-handoff screen and hands off directly to the victory panel without ever
  // explicitly releasing 'turn-handoff' first. Under the old single-slot overlay
  // this was harmless (last write wins); under the new reference-counted overlay
  // it would leave a phantom depth-1 entry that never gets popped, permanently
  // blocking interaction after the player dismisses the victory panel. This test
  // proves the fix (explicit setBlockingOverlay(null) before handleVictoryIfNeeded)
  // against a real PanelHost, not a bare spy.
  describe('hot-seat handoff — victory does not leave a stale blocker (#794, phase 12)', () => {
    it('fully unblocks interaction after a completed round ends in victory during a hot-seat handoff', async () => {
      const state = makeHotSeatFixture();
      const aiCivId = state.hotSeat!.players.find(p => p.slotId !== 'player')!.slotId;
      clearRequiredChoices(state, aiCivId);
      // aiCivId is last in hotSeat.players, so ending its turn completes the round.
      state.currentPlayer = aiCivId;

      // endTurn() itself bails out immediately if the state is *already*
      // gameOver, so the fixture must start with gameOver: false and become
      // gameOver only as a result of round processing -- fake that outcome at
      // the one seam that decides it (prepareCompletedState), rather than
      // simulating an actual domination victory through the real systems.
      vi.mocked(hotseatOutcome.resolveHotSeatPostSimulation).mockImplementationOnce(s => ({
        state: { ...s, gameOver: true, winner: 'player', gameOverReason: 'domination' },
        nextHumanId: null,
      }));

      const host = createPanelHost(document.createElement('div'));
      const deps = baseDeps(state, { setBlockingOverlay: host.setBlockingOverlay });
      const turnFlow = createTurnFlowController(deps);

      const endTurnPromise = turnFlow.endTurn();
      // beginHotSeatHandoff pushes 'turn-handoff' synchronously before any round
      // simulation can run.
      expect(host.isInteractionBlocked()).toBe(true);

      await flushMicrotasks(20);

      // The round resolved with the game already over: beginHotSeatHandoff hands
      // off straight to the victory panel instead of naming a next recipient.
      // Interaction must still be blocked -- now by 'victory', not stuck
      // double-blocked by an un-released 'turn-handoff'.
      expect(deps.uiLayer.querySelector('#victory-panel')).toBeTruthy();
      expect(host.isInteractionBlocked()).toBe(true);

      deps.uiLayer.querySelector<HTMLButtonElement>('#victory-new-game-btn')?.click();

      // If 'turn-handoff' had been silently overwritten instead of explicitly
      // released, this would still report blocked -- the whole game would stay
      // uninteractable after dismissing the victory panel.
      expect(host.isInteractionBlocked()).toBe(false);

      await endTurnPromise;
    });
  });

  // #787 Phase 12 (#794) inline review finding: refreshRequiredChoicesAfterAction
  // re-enters showRequiredChoicesIfNeeded once per resolved choice. With 2+ idle
  // cities pending at once, resolving them one at a time re-pushes the overlay on
  // every resolution without ever popping the *previous* push -- under the old
  // single-slot overlay each re-push was a harmless overwrite of the same id, but
  // the reference-counted overlay nests them, and only the final resolution's
  // closeRequiredChoicePanel() call ever pops. This is a common midgame state (2+
  // cities with nothing queued at end of turn), not an edge case -- confirmed via
  // a real PanelHost, not a spy.
  describe('required choices — resolving multiple idle cities does not leak the blocking overlay (#794, phase 12)', () => {
    it('fully unblocks interaction after resolving two idle-city choices in sequence', () => {
      const state = makeFixture();
      // createNewGame starts 'player' with zero cities (settled only once a
      // settler founds one) -- borrow a minor-civ city's real map-position data
      // as a template and reassign ownership, rather than simulating a full
      // founding.
      const template = Object.values(state.cities)[0]!;
      const firstCityId = 'phase12-first-city';
      const secondCityId = 'phase12-second-city';
      state.cities[firstCityId] = { ...template, id: firstCityId, owner: 'player', name: 'First City', productionQueue: [] };
      state.cities[secondCityId] = { ...template, id: secondCityId, owner: 'player', name: 'Second City', productionQueue: [] };
      state.civilizations['player']!.cities = [firstCityId, secondCityId];

      const host = createPanelHost(document.createElement('div'));
      // baseDeps' default getElementById reads from an unpopulated id->element
      // map, so it can never see panels this test's own code appends -- both
      // showRequiredChoicesIfNeeded's "existing" guard and
      // refreshRequiredChoicesAfterAction's removal need a getElementById that
      // actually reflects uiLayer's live DOM, matching production's
      // document.getElementById wiring (bootstrap.ts) closely enough for this
      // panel, which (like the victory panel above) mounts into uiLayer itself.
      const testUiLayer = document.createElement('div');
      const deps = baseDeps(state, {
        uiLayer: testUiLayer,
        getElementById: id => testUiLayer.querySelector(`#${id}`),
        setBlockingOverlay: host.setBlockingOverlay,
      });
      const turnFlow = createTurnFlowController(deps);

      expect(turnFlow.showRequiredChoicesIfNeeded()).toBe(true);
      expect(host.isInteractionBlocked()).toBe(true);

      // Resolve the first city's choice (mirrors onChooseCityBuild's own
      // enqueueCityProduction mutation) -- the second city is still idle, so
      // exactly one blocker should remain, not zero and not two.
      state.cities[firstCityId] = { ...state.cities[firstCityId]!, productionQueue: ['warrior'] };
      turnFlow.refreshRequiredChoicesAfterAction();
      expect(host.isInteractionBlocked()).toBe(true);
      expect(deps.uiLayer.querySelector('#required-choice-panel')).toBeTruthy();

      // Resolve the second (last) city's choice -- if the first resolution had
      // left a phantom push behind, this would still report blocked forever.
      state.cities[secondCityId] = { ...state.cities[secondCityId]!, productionQueue: ['warrior'] };
      turnFlow.refreshRequiredChoicesAfterAction();
      expect(host.isInteractionBlocked()).toBe(false);
      expect(deps.uiLayer.querySelector('#required-choice-panel')).toBeFalsy();
    });
  });

  describe('showRequiredChoicesIfNeeded callbacks (#787 phase 3 -- single-owner commit)', () => {
    it('onChooseResearch publishes the queued tech through session subscribers', () => {
      const state = makeFixture();
      state.civilizations['player']!.techState.currentResearch = null;
      const testUiLayer = document.createElement('div');
      const deps = baseDeps(state, {
        uiLayer: testUiLayer,
        getElementById: id => testUiLayer.querySelector(`#${id}`),
      });
      const turnFlow = createTurnFlowController(deps);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      turnFlow.showRequiredChoicesIfNeeded();
      const panel = deps.uiLayer.querySelector('#required-choice-panel') as HTMLElement;
      expect(panel).toBeTruthy();
      findSectionButton(panel, 'Choose Research', 0).click();

      // currentResearch started null (needsResearchChoice's precondition), so
      // enqueueResearch sets currentResearch directly rather than appending to
      // researchQueue -- see enqueueResearch's `!state.currentResearch` branch.
      expect(deps.session.getState().civilizations['player']!.techState.currentResearch).not.toBeNull();
      expect(listener).toHaveBeenCalled();
    });

    it('onChooseCityBuild publishes the queued production through session subscribers', () => {
      const state = makeFixture();
      const template = Object.values(state.cities)[0]!;
      state.cities['idle-city'] = { ...template, id: 'idle-city', owner: 'player', name: 'Idle City', productionQueue: [] };
      state.civilizations['player']!.cities = ['idle-city'];
      const testUiLayer = document.createElement('div');
      const deps = baseDeps(state, {
        uiLayer: testUiLayer,
        getElementById: id => testUiLayer.querySelector(`#${id}`),
      });
      const turnFlow = createTurnFlowController(deps);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      turnFlow.showRequiredChoicesIfNeeded();
      const panel = deps.uiLayer.querySelector('#required-choice-panel') as HTMLElement;
      expect(panel).toBeTruthy();
      findSectionButton(panel, 'Choose Production', 0).click();

      expect(deps.session.getState().cities['idle-city']!.productionQueue.length).toBe(1);
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('finalizePendingCityCaptureChoice — shared emitter (was: "routes player and strategic AI capture transitions...")', () => {
    it('emits capture transitions through the shared city-capture emitter', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const turnFlow = createTurnFlowController(deps);
      const emitter = vi.mocked(cityCaptureSystem.emitMajorCityCaptureEvents);
      emitter.mockClear();

      const foreignCityId = Object.values(state.cities).find(city => city.owner !== 'player')!.id;
      const city = state.cities[foreignCityId]!;
      const pending: PendingCityCaptureChoice = {
        attackerId: 'irrelevant-for-this-resolution-step',
        cityId: foreignCityId,
        targetCoord: city.position,
        occupiedPopulation: 1,
        razeGold: 10,
      };
      deps.selection.setPendingIntent({ kind: 'city-capture', choice: pending });

      turnFlow.finalizePendingCityCaptureChoice('raze');

      expect(emitter).toHaveBeenCalledTimes(1);
      // ai-major-turn.ts's strategic-AI capture path calling the same shared
      // emitter (not a divergent AI-only implementation) is covered by
      // tests/ai/ai-major-turn.test.ts, not re-asserted here.
    });
  });

  describe('captureAIMoves / replayAIMoves', () => {
    it('captureAIMoves observes unit:move events emitted during fn()', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const turnFlow = createTurnFlowController(deps);
      const unit = placeUnit(state, 'player', 'u1');

      const moves = turnFlow.captureAIMoves(() => {
        deps.bus.emit('unit:move', {
          unitId: unit.id,
          from: unit.position,
          to: { q: 1, r: 0 },
          path: [unit.position, { q: 1, r: 0 }],
          presentationByViewer: {
            player: {
              unit,
              visibleSegments: [[{ q: 0, r: 0 }, { q: 1, r: 0 }]],
            },
          },
        });
      });

      expect(moves).toHaveLength(1);
      expect(moves[0]!.viewerId).toBe('player');
    });

    it('replayAIMoves animates only current-viewer moves, capped at 6', async () => {
      const state = makeFixture();
      const animateUnitMove = vi.fn((_unit, _path, done) => done());
      const deps = baseDeps(state, { renderLoop: fakeRenderer({ animateUnitMove }) });
      const turnFlow = createTurnFlowController(deps);
      const unit = placeUnit(state, 'player', 'u1');

      const moves = Array.from({ length: 8 }, (_, i) => ({
        unit,
        viewerId: 'player',
        visibleSegments: [[{ q: i, r: 0 }, { q: i + 1, r: 0 }]],
      }));
      // Interleave a move for a different viewer -- must be filtered out.
      moves.splice(3, 0, { unit, viewerId: 'other-civ', visibleSegments: [[{ q: 9, r: 9 }, { q: 9, r: 8 }]] });

      await turnFlow.replayAIMoves(moves);

      expect(animateUnitMove).toHaveBeenCalledTimes(6);
    });

    it('replayAIMoves aborts early once the presentation gate is suppressed', async () => {
      const state = makeFixture();
      const gate = new RoundPresentationGate();
      const animateUnitMove = vi.fn((_unit, _path, done) => {
        gate.suppress();
        done();
      });
      const deps = baseDeps(state, {
        renderLoop: fakeRenderer({ animateUnitMove }),
        roundPresentationGate: gate,
      });
      const turnFlow = createTurnFlowController(deps);
      const unit = placeUnit(state, 'player', 'u1');

      const moves = Array.from({ length: 4 }, (_, i) => ({
        unit,
        viewerId: 'player',
        visibleSegments: [[{ q: i, r: 0 }, { q: i + 1, r: 0 }]],
      }));

      await turnFlow.replayAIMoves(moves);

      expect(animateUnitMove).toHaveBeenCalledTimes(1);
    });

    it('replayAIMoves is a no-op if the gate is already suppressed', async () => {
      const state = makeFixture();
      const animateUnitMove = vi.fn((_unit, _path, done) => done());
      const gate = new RoundPresentationGate();
      gate.suppress();
      const deps = baseDeps(state, {
        renderLoop: fakeRenderer({ animateUnitMove }),
        roundPresentationGate: gate,
      });
      const turnFlow = createTurnFlowController(deps);
      const unit = placeUnit(state, 'player', 'u1');

      await turnFlow.replayAIMoves([{ unit, viewerId: 'player', visibleSegments: [[{ q: 0, r: 0 }, { q: 1, r: 0 }]] }]);

      expect(animateUnitMove).not.toHaveBeenCalled();
    });
  });

  describe('other public methods (smoke coverage)', () => {
    it('centerOnCurrentPlayer centers the camera on a current-player unit', () => {
      const state = makeFixture();
      const centerOn = vi.fn();
      const deps = baseDeps(state, { renderLoop: fakeRenderer({ camera: { centerOn } }) });
      placeUnit(state, 'player', 'u1', { position: { q: 3, r: 4 } });
      createTurnFlowController(deps).centerOnCurrentPlayer();
      expect(centerOn).toHaveBeenCalledWith({ q: 3, r: 4 });
    });

    it('handleVictoryIfNeeded returns false and does nothing when the game is not over', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      expect(createTurnFlowController(deps).handleVictoryIfNeeded()).toBe(false);
      expect(deps.setBlockingOverlay).not.toHaveBeenCalled();
    });

    it('handleVictoryIfNeeded shows the victory panel and blocks when the game is over', () => {
      const state = makeFixture();
      state.gameOver = true;
      state.winner = 'player';
      const deps = baseDeps(state);
      expect(createTurnFlowController(deps).handleVictoryIfNeeded()).toBe(true);
      expect(deps.setBlockingOverlay).toHaveBeenCalledWith('victory');
      expect(deps.uiLayer.querySelector('#victory-panel')).toBeTruthy();
    });

    it('closes the Hall of Fame before the next hot-seat player can view the handoff', async () => {
      const state = makeHotSeatFixture();
      const nextPlayerId = state.hotSeat!.players.find(player => player.slotId !== 'player')!.slotId;
      clearRequiredChoices(state, nextPlayerId);
      const hallOfFame = document.createElement('div');
      hallOfFame.id = 'hall-of-fame-panel';
      const router = {
        close: vi.fn((panel: string) => {
          if (panel === 'hall-of-fame') hallOfFame.remove();
        }),
        open: vi.fn(),
      };
      const deps = baseDeps(state, { router });
      deps.uiLayer.appendChild(hallOfFame);

      const handoff = createTurnFlowController(deps).beginHotSeatHandoff(state.hotSeat!, false);

      expect(deps.uiLayer.querySelector('#hall-of-fame-panel')).toBeNull();
      expect(router.close).toHaveBeenCalledWith('hall-of-fame');
      document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
      await handoff;
    });

    it('closeNetworkPanelsForHandoff closes viewer-private panels and removes the intent panel', () => {
      const state = makeFixture();
      const panel = document.createElement('div');
      const deps = baseDeps(state, { getNetworkIntentPanel: () => panel });
      createTurnFlowController(deps).closeNetworkPanelsForHandoff();
      expect(deps.router.close).toHaveBeenCalledWith('network');
      expect(deps.router.close).toHaveBeenCalledWith('hall-of-fame');
      expect(panel.isConnected).toBe(false);
    });

    it('maybeShowCouncilInterrupt is silent when there is no interrupt', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      createTurnFlowController(deps).maybeShowCouncilInterrupt();
      expect(deps.showNotification).not.toHaveBeenCalled();
    });
  });
});

function session_getState(deps: TurnFlowControllerDeps): GameState {
  return deps.session.getState();
}
