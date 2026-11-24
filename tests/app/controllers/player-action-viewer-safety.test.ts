// @vitest-environment jsdom
import { describe, it, vi, afterEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import { createUnit } from '@/systems/unit-lifecycle';
import { createEspionageCivState, createSpyFromUnit, setDisguise } from '@/systems/espionage-system';
import { hexKey } from '@/systems/hex-utils';
import type { GameState, HexCoord, Spy } from '@/core/types';
import {
  createPlayerActionController,
  type PlayerActionControllerDeps,
} from '@/app/controllers/player-action-controller';
import {
  expectViewerSafety,
  type ViewerSurface,
  type WorldMutation,
} from '../../helpers/viewer-safety';

/**
 * #1002 differential cover for what the player-action controller tells a seat.
 *
 * `player-action-controller.test.ts` asserts the captured-spy dialog and the attack feedback with
 * `toHaveBeenCalledWith(...)`. Both are information: the dialog names a spy and whose it is, the attack toast says
 * what happened to a unit that may be a disguised spy. The projection for a seat is every toast and every dialog
 * (message and button labels) the controller showed it, plus the events the call emitted. A fact the seat has not
 * earned (what the captured spy was doing, what it was disguised as, a defender's true identity) must leave it
 * untouched; an earned one must move it.
 */

type Step =
  | { op: 'capture-dialog'; spyId: string; spyOwner: string }
  | { op: 'attack'; attackerId: string; targetKey: string };

interface World {
  state: GameState;
  script: Step[];
}

const AI = 'ai-1';

afterEach(() => {
  vi.restoreAllMocks();
});

const surface: ViewerSurface<World, unknown> = {
  name: 'player action controller',
  project(world, viewerId) {
    const state = structuredClone(world.state);
    state.currentPlayer = viewerId;
    const bus = new EventBus();
    const events: unknown[] = [];
    const emit = bus.emit.bind(bus);
    vi.spyOn(bus, 'emit').mockImplementation(((name: string, payload: unknown) => {
      events.push(name);
      (emit as (n: string, p: unknown) => void)(name, payload);
    }) as typeof bus.emit);
    const toasts: unknown[] = [];
    const dialogs: unknown[] = [];
    const session = createGameSession(state);
    const deps = {
      session,
      bus,
      uiLayer: document.createElement('div'),
      selection: { getSelectedUnitId: () => null, setPendingIntent: vi.fn() },
      selectionController: {
        selectUnit: vi.fn(), deselectUnit: vi.fn(), selectNextUnit: vi.fn(), refreshCurrentPlayerVisibility: vi.fn(),
        executeAnimatedUnitMove: vi.fn(), refreshSelectedUnitAfterCombat: vi.fn(),
      },
      turnFlow: { endTurn: vi.fn(), finalizePendingCityCaptureChoice: vi.fn() },
      hud: { update: vi.fn() },
      renderLoop: { camera: { centerOn: vi.fn() }, setGameState: vi.fn(), playEffect: vi.fn() },
      showNotification: (message: string, type?: string) => { toasts.push([type ?? 'info', message]); },
      setBlockingOverlay: vi.fn(),
      currentCiv: () => session.getState().civilizations[session.getState().currentPlayer],
      notifier: {
        choice: (message: string, actions: Array<{ label: string }>) => {
          dialogs.push({ message, labels: actions.map(action => action.label) });
        },
      },
      advisorSystem: { resetMessage: vi.fn(), check: vi.fn() },
      maybeShowPendingHoardChoice: vi.fn(),
    } as unknown as PlayerActionControllerDeps;
    const controller = createPlayerActionController(deps);
    for (const step of world.script) {
      if (step.op === 'capture-dialog') controller.showEspionageCaptureChoice(step.spyId, step.spyOwner);
      else controller.executeAttack(step.attackerId, step.targetKey);
    }
    return { toasts, dialogs, events };
  },
};

const edit = (label: string, apply: (world: World) => void): WorldMutation<World> => ({ label, apply });

function placeUnit(state: GameState, type: Parameters<typeof createUnit>[0], owner: string, id: string, position: HexCoord): void {
  const counters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  state.units[id] = { ...createUnit(type, owner, position, counters), id };
  state.civilizations[owner]!.units.push(id);
}

function placeSpy(state: GameState, owner: string, id: string, overrides: Partial<Spy> = {}): void {
  const spy: Spy = {
    id, owner, name: `Agent ${id}`, unitType: 'spy_scout',
    targetCivId: null, targetCityId: null, position: null,
    status: 'stationed', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false,
    feedsFalseIntel: false,
    ...overrides,
  };
  const existing = state.espionage?.[owner] ?? createEspionageCivState();
  state.espionage = { ...state.espionage, [owner]: { ...existing, spies: { ...existing.spies, [id]: spy } } };
}

function bilateralWar(state: GameState, a: string, b: string): void {
  state.civilizations[a]!.diplomacy.atWarWith = [...new Set([...state.civilizations[a]!.diplomacy.atWarWith, b])];
  state.civilizations[b]!.diplomacy.atWarWith = [...new Set([...state.civilizations[b]!.diplomacy.atWarWith, a])];
}

function buildState(): GameState {
  const state = createNewGame(undefined, 'player-action-viewer-safety', 'small');
  state.currentPlayer = 'player';
  // A third civilization neither seat has anything to do with, so a fact about it is a fact the seat has not earned.
  state.civilizations['ai-third'] = {
    ...structuredClone(state.civilizations[AI]!), id: 'ai-third', name: 'Thirdfolk', cities: [], units: [],
  };
  for (const civ of Object.values(state.civilizations)) civ.diplomacy.relationships['ai-third'] = 0;
  const counters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  const survivalSettlers = ['player', AI, 'ai-third'].map((owner, index) => (
    { ...createUnit('settler', owner, { q: index, r: 3 }, counters), id: `${owner}-settler`, hasActed: true, movementPointsLeft: 0 }
  ));
  state.units = Object.fromEntries(survivalSettlers.map(unit => [unit.id, unit]));
  for (const civ of Object.values(state.civilizations)) civ.units = [];
  for (const unit of survivalSettlers) state.civilizations[unit.owner]!.units.push(unit.id);
  state.espionage = {};
  return state;
}

describe('what the player-action controller tells a seat is viewer-safe (differential)', () => {
  it('the captured-spy dialog shows the captor what it captured and nothing else about the spy', () => {
    const state = buildState();
    placeSpy(state, 'player', 'captor-seed');
    placeSpy(state, AI, 'spy-1', { targetCivId: 'player', targetCityId: 'somewhere', experience: 40 });
    expectViewerSafety(surface, {
      world: { state, script: [{ op: 'capture-dialog', spyId: 'spy-1', spyOwner: AI }] },
      viewerId: 'player',
      hidden: [
        edit('the spy was on a different mission', w => {
          w.state.espionage![AI]!.spies['spy-1']!.currentMission = { type: 'steal_tech', turnsRemaining: 3 } as never;
          w.state.espionage![AI]!.spies['spy-1']!.status = 'on_mission';
        }),
        edit('the spy was more experienced', w => { w.state.espionage![AI]!.spies['spy-1']!.experience = 90; }),
        edit('the spy was aimed at a different city', w => { w.state.espionage![AI]!.spies['spy-1']!.targetCityId = 'elsewhere'; }),
        edit('the spy was feeding false intelligence', w => { w.state.espionage![AI]!.spies['spy-1']!.feedsFalseIntel = true; }),
        edit('the spy was disguised', w => {
          const record = w.state.espionage![AI]!;
          const idle = { ...record, spies: { ...record.spies, 'spy-1': { ...record.spies['spy-1']!, status: 'idle' as const } } };
          const disguised = setDisguise(idle, 'spy-1', 'archer');
          w.state.espionage![AI] = { ...disguised, spies: { ...disguised.spies, 'spy-1': { ...disguised.spies['spy-1']!, status: 'stationed' as const } } };
        }),
        edit('the spy owner has a private grudge against a third civ', w => {
          w.state.civilizations[AI]!.diplomacy.relationships.player = w.state.civilizations[AI]!.diplomacy.relationships.player ?? 0;
          for (const civ of Object.values(w.state.civilizations)) {
            if (civ.id !== 'player' && civ.id !== AI) civ.diplomacy.relationships[AI] = -90;
          }
        }),
      ],
      earned: [
        edit('the captured spy has a different name', w => { w.state.espionage![AI]!.spies['spy-1']!.name = 'Agent Zed'; }),
        edit('the spy was caught inside a city', w => { w.state.espionage![AI]!.spies['spy-1']!.infiltrationCityId = 'a-city'; }),
      ],
    });
  });

  it('an attack tells the seat what happened to its own unit and nothing about the target beyond that', () => {
    const state = buildState();
    placeUnit(state, 'warrior', 'player', 'attacker-1', { q: 0, r: 0 });
    placeUnit(state, 'warrior', AI, 'defender-1', { q: 1, r: 0 });
    state.units['defender-1']!.health = 1;
    bilateralWar(state, 'player', AI);
    state.civilizations.player.visibility.tiles[hexKey({ q: 1, r: 0 })] = 'visible';
    expectViewerSafety(surface, {
      world: { state, script: [{ op: 'attack', attackerId: 'attacker-1', targetKey: hexKey({ q: 1, r: 0 }) }] },
      viewerId: 'player',
      hidden: [
        edit('the defender is secretly a disguised spy', w => {
          w.state.units['defender-1']!.type = 'spy_scout';
          w.state.units['defender-1']!.health = 1;
          const defender = w.state.units['defender-1']!;
          const record = createSpyFromUnit(createEspionageCivState(), defender.id, defender.owner, defender.type, w.state.gameId ?? 'viewer-safety');
          w.state.espionage = { ...w.state.espionage, [AI]: setDisguise(record.state, defender.id, 'warrior') };
        }),
        edit('the defender had a different history', w => {
          w.state.units['defender-1']!.experience = 50;
        }),
        edit('another civ has a private war elsewhere', w => {
          for (const civ of Object.values(w.state.civilizations)) {
            if (civ.id !== 'player' && civ.id !== AI) bilateralWar(w.state, civ.id, AI);
          }
        }),
      ],
      earned: [
        edit('the seat\'s own unit is the one that falls', w => {
          w.state.units['attacker-1']!.health = 1;
          w.state.units['defender-1']!.health = 100;
        }),
      ],
    });
  });
});
