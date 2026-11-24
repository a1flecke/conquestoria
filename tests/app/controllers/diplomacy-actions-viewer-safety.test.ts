// @vitest-environment jsdom
import { describe, it, vi, afterEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import { enqueuePeaceRequest, enqueueTreatyProposal } from '@/systems/diplomacy-requests';
import { recordCivilizationContact } from '@/systems/discovery-system';
import { ALLIANCE_TECHS } from '@/systems/diplomacy-actions';
import type { GameState } from '@/core/types';
import type { DiplomaticAction } from '@/core/types/diplomacy';
import {
  createDiplomacyActionsController,
  type DiplomacyActionsControllerDeps,
} from '@/app/controllers/diplomacy-actions-controller';
import {
  expectHotSeatDifferential,
  expectViewerSafety,
  type ViewerSurface,
  type WorldMutation,
} from '../../helpers/viewer-safety';

/**
 * #1002 differential cover for what the diplomacy controller tells a seat (#901, #1221).
 *
 * `diplomacy-actions-controller.test.ts` guards the acting seat's feedback with `toHaveBeenCalledWith(...)` on the
 * toast. The feedback is information: a refusal that differs between "a civilization you have not met" and "no such
 * civilization" confirms who exists, a "no longer available" that differs between a request addressed to someone
 * else and one that does not exist lets a seat read another seat's mailbox, and a verdict that moves with a third
 * party's private business leaks it. The projection for a seat is everything the controller told it: each toast, each
 * panel refresh, each bus event the call emitted, and the seat's own diplomacy afterwards. A fact the seat has not
 * earned must leave it untouched; an earned one must move it.
 */

const AI = 'ai-1';
const STRANGER = 'ai-stranger';
const THIRD = 'ai-third';

type Step =
  | { op: 'action'; target: string; action: DiplomaticAction }
  | { op: 'accept-peace' | 'reject-peace' | 'accept-treaty' | 'decline-treaty'; requestId: string };

interface World {
  state: GameState;
  script: Step[];
}

afterEach(() => {
  vi.restoreAllMocks();
});

const surface: ViewerSurface<World, unknown> = {
  name: 'diplomacy actions controller',
  project(world, viewerId) {
    const state = structuredClone(world.state);
    state.currentPlayer = viewerId;
    const bus = new EventBus();
    const events: unknown[] = [];
    const emit = bus.emit.bind(bus);
    vi.spyOn(bus, 'emit').mockImplementation(((name: string, payload: unknown) => {
      events.push([name, payload]);
      (emit as (n: string, p: unknown) => void)(name, payload);
    }) as typeof bus.emit);
    const toasts: unknown[] = [];
    let panelRefreshes = 0;
    const session = createGameSession(state);
    const deps = {
      session,
      bus,
      selectionController: { selectUnit: vi.fn() },
      uiLayer: document.createElement('div'),
      showNotification: (message: string, type?: string) => { toasts.push([type ?? 'info', message]); },
      openDiplomacyPanel: () => { panelRefreshes += 1; },
    } as unknown as DiplomacyActionsControllerDeps;
    const controller = createDiplomacyActionsController(deps);
    for (const step of world.script) {
      if (step.op === 'action') controller.handleDiplomaticAction(step.target, step.action);
      else if (step.op === 'accept-peace') controller.handleAcceptPeaceRequest(step.requestId);
      else if (step.op === 'reject-peace') controller.handleRejectPeaceRequest(step.requestId);
      else if (step.op === 'accept-treaty') controller.handleAcceptTreatyProposal(step.requestId);
      else controller.handleDeclineTreatyProposal(step.requestId);
    }
    const after = session.getState();
    const own = after.civilizations[viewerId]!.diplomacy;
    return {
      toasts,
      panelRefreshes,
      events,
      atWarWith: [...own.atWarWith].sort(),
      treaties: own.treaties.map(t => `${t.type}:${t.civA}:${t.civB}`).sort(),
      requestsInvolvingSeat: (after.pendingDiplomacyRequests ?? [])
        .filter(r => r.fromCivId === viewerId || r.toCivId === viewerId)
        .map(r => ({ ...r })),
    };
  },
};

const edit = (label: string, apply: (world: World) => void): WorldMutation<World> => ({ label, apply });

function addCiv(state: GameState, id: string, name: string): void {
  state.civilizations[id] = {
    ...structuredClone(state.civilizations[AI]!), id, name, cities: [], units: [], isHuman: false,
    diplomacy: structuredClone(state.civilizations[AI]!.diplomacy),
  };
  for (const civ of Object.values(state.civilizations)) {
    civ.diplomacy.relationships[id] = civ.diplomacy.relationships[id] ?? 0;
    civ.diplomacy.relationships[id] = 0;
    state.civilizations[id]!.diplomacy.relationships[civ.id] = 0;
  }
  state.civilizations[id]!.knownCivilizations = [];
}

function buildState(): GameState {
  const state = createNewGame(undefined, 'diplomacy-viewer-safety', 'small');
  state.currentPlayer = 'player';
  state.pendingDiplomacyRequests = [];
  addCiv(state, STRANGER, 'Strangers');
  addCiv(state, THIRD, 'Thirdfolk');
  for (const civ of Object.values(state.civilizations)) {
    civ.knownCivilizations = [];
    civ.techState.completed.push(...ALLIANCE_TECHS);
  }
  recordCivilizationContact(state, 'player', AI);
  return state;
}

function bilateralWar(state: GameState, a: string, b: string): void {
  state.civilizations[a]!.diplomacy.atWarWith = [...new Set([...state.civilizations[a]!.diplomacy.atWarWith, b])];
  state.civilizations[b]!.diplomacy.atWarWith = [...new Set([...state.civilizations[b]!.diplomacy.atWarWith, a])];
}

describe('what the diplomacy controller tells a seat is viewer-safe (differential)', () => {
  it('acting on a civilization the seat has not met says nothing about it', () => {
    const state = buildState();
    // Every kind of action, the treaty/war family and the rest. `request_peace` once answered "not at war" for an unmet
    // civ that exists and "not available" for one that does not, which confirmed the civ existed; contact is now
    // checked first for every action.
    const actions: DiplomaticAction[] = [
      'declare_war', 'request_peace', 'alliance', 'trade_agreement', 'demand_tribute', 'demand_withdrawal',
      'offer_vassalage', 'petition_independence', 'release_vassal', 'defend_vassal', 'reabsorb_breakaway',
    ];
    expectViewerSafety(surface, {
      world: { state, script: actions.map((action): Step => ({ op: 'action', target: STRANGER, action })) },
      viewerId: 'player',
      hidden: [
        edit('the unmet civilization is renamed', w => { w.state.civilizations[STRANGER]!.name = 'Outsiders'; }),
        edit('the unmet civilization is at war with a rival', w => bilateralWar(w.state, STRANGER, AI)),
        edit('the unmet civilization is a vassal of a rival', w => { w.state.civilizations[STRANGER]!.diplomacy.vassalage.overlord = AI; }),
        edit('the unmet civilization is hostile to everyone', w => {
          for (const civ of Object.values(w.state.civilizations)) civ.diplomacy.relationships[STRANGER] = -90;
        }),
        edit('there is no such civilization at all', w => { delete w.state.civilizations[STRANGER]; }),
      ],
      earned: [edit('the seat meets the civilization', w => recordCivilizationContact(w.state, 'player', STRANGER))],
    });
  });

  it("a met rival's answer does not move with a third party's private business", () => {
    const state = buildState();
    bilateralWar(state, 'player', AI);
    expectViewerSafety(surface, {
      world: { state, script: [{ op: 'action', target: AI, action: 'request_peace' }] },
      viewerId: 'player',
      hidden: [
        edit('an unmet civilization is renamed', w => { w.state.civilizations[THIRD]!.name = 'Outsiders'; }),
        edit('an unmet civilization is hostile to the rival', w => { w.state.civilizations[AI]!.diplomacy.relationships[THIRD] = -80; }),
        edit('the rival is hostile to an unmet civilization', w => { w.state.civilizations[THIRD]!.diplomacy.relationships[AI] = -80; }),
        edit('two unmet civilizations are at war', w => bilateralWar(w.state, THIRD, STRANGER)),
      ],
      earned: [
        edit('the rival turns against the seat', w => { w.state.civilizations[AI]!.diplomacy.relationships.player = -50; }),
      ],
    });
  });

  it("answering a request addressed to another seat reveals nothing about it", () => {
    const state = buildState();
    bilateralWar(state, AI, THIRD);
    const peace = enqueuePeaceRequest(state, AI, THIRD);
    const peaceId = peace.pendingDiplomacyRequests![0]!.id;
    const treaty = enqueueTreatyProposal(peace, AI, THIRD, 'trade_agreement', 10);
    const treatyId = treaty.pendingDiplomacyRequests!.find(r => r.type === 'treaty')!.id;
    const script: Step[] = [
      { op: 'accept-peace', requestId: peaceId },
      { op: 'reject-peace', requestId: peaceId },
      { op: 'accept-treaty', requestId: treatyId },
      { op: 'decline-treaty', requestId: treatyId },
    ];
    expectViewerSafety(surface, {
      world: { state: treaty, script },
      viewerId: 'player',
      hidden: [
        edit('the requests do not exist', w => { w.state.pendingDiplomacyRequests = []; }),
        edit('the treaty is a different kind', w => {
          for (const r of w.state.pendingDiplomacyRequests!) if (r.type === 'treaty') r.treatyType = 'alliance';
        }),
        edit('the requests come from a different civilization', w => {
          for (const r of w.state.pendingDiplomacyRequests!) r.fromCivId = STRANGER;
        }),
      ],
      earned: [
        edit('the treaty is addressed to the seat', w => {
          for (const r of w.state.pendingDiplomacyRequests!) if (r.type === 'treaty') r.toCivId = 'player';
        }),
      ],
    });
  });

  it('hot seat: a civilization only one seat has met is refused identically for the other', () => {
    const state = buildState();
    state.civilizations[AI]!.isHuman = true;
    expectHotSeatDifferential(surface, {
      world: { state, script: [{ op: 'action', target: STRANGER, action: 'declare_war' }] },
      viewers: ['player', AI],
      knownOnlyTo: 'player',
      mutation: edit('the first seat meets the strangers', w => recordCivilizationContact(w.state, 'player', STRANGER)),
    });
  });
});
