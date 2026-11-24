import { describe, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerEspionagePresentation } from '@/presentation/register-espionage-presentation';
import { makePresentationContext } from '../helpers/presentation-context';
import {
  expectHotSeatDifferential,
  expectViewerSafety,
  type ViewerSurface,
  type WorldMutation,
} from '../helpers/viewer-safety';

/**
 * #1002 differential cover for the espionage presentation seams.
 *
 * `register-espionage-presentation.test.ts` guards who is told what with `not.toHaveBeenCalledWith('carthage', ...)`
 * and `not.toHaveBeenCalled()` on `showEspionageCaptureChoice`, one hand-picked recipient per case. Here the output is
 * a projection of the world for a viewing seat: every capture verdict dialog opened on that seat's screen, plus every
 * delivery and log entry addressed to it (a message addressed to another seat is queued for that seat, not shown
 * here). A fact the seat has not earned must leave the projection untouched, an earned one must move it, so a leak
 * through any recipient, channel or copy field fails by name.
 */

type Event = { name: string } & Record<string, unknown>;

interface World {
  /** The events the registrar is asked to present, in order. */
  events: Event[];
  /** Spy name by id for the spy owner `carthage`; the copy of several messages reads it. */
  spyName: string;
  cityName: string;
}

interface Shown {
  captureChoices: unknown[];
  delivered: unknown[];
  logged: unknown[];
}

const surface: ViewerSurface<World, Shown> = {
  name: 'espionage presentation',
  project(world, viewerId) {
    const ctx = makePresentationContext({
      state: {
        currentPlayer: viewerId,
        civilizations: { rome: { name: 'Rome' }, carthage: { name: 'Carthage' }, egypt: { name: 'Egypt' } } as never,
        cities: { 'city-a': { name: world.cityName } } as never,
        espionage: { carthage: { spies: { 'spy-1': { name: world.spyName, unitType: 'spy' } } } } as never,
      },
    });
    const bus = new EventBus();
    registerEspionagePresentation(bus, ctx);
    for (const event of world.events) {
      const { name, ...payload } = event;
      bus.emit(name as 'espionage:spy-expired', payload as never);
    }
    const calls = (fn: unknown): unknown[][] => (fn as { mock: { calls: unknown[][] } }).mock.calls;
    return {
      captureChoices: calls(ctx.showEspionageCaptureChoice),
      delivered: calls(ctx.deliver).filter(([civId]) => civId === viewerId),
      logged: calls(ctx.log).filter(([civId]) => civId === viewerId),
    };
  },
};

const edit = (label: string, apply: (world: World) => void): WorldMutation<World> => ({ label, apply });
const patchEvent = (index: number, patch: Record<string, unknown>) => (world: World): void => {
  Object.assign(world.events[index], patch);
};

const base = (events: Event[]): World => ({ events, spyName: 'Agent X', cityName: 'Thebes' });

describe('espionage presentation is viewer-safe (differential)', () => {
  it('an intel report reaches only the civ that gathered it, whatever it learned', () => {
    expectViewerSafety(surface, {
      world: base([{ name: 'espionage:intel-report-acquired', civId: 'rome', spyId: 'spy-1', missionType: 'monitor_troops', targetCivId: 'carthage' }]),
      viewerId: 'carthage',
      hidden: [
        edit('the report is a different kind', patchEvent(0, { missionType: 'monitor_diplomacy' })),
        edit('another of rome\'s spies gathered it', patchEvent(0, { spyId: 'spy-9' })),
      ],
      earned: [
        edit('the report is carthage\'s own', patchEvent(0, { civId: 'carthage', targetCivId: 'rome' })),
      ],
    });
  });

  it('turning a spy tells only the civ that turned it, never the spy\'s owner', () => {
    expectViewerSafety(surface, {
      world: base([{ name: 'espionage:spy-detected', detectingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1', cityId: 'city-a' }]),
      viewerId: 'carthage',
      hidden: [
        edit('a different civ turned it', patchEvent(0, { detectingCivId: 'egypt' })),
        edit('the spy was turned in another city', patchEvent(0, { cityId: 'city-b' })),
        edit('the spy has a different name', w => { w.spyName = 'Agent Y'; }),
        edit('the city has a different name', w => { w.cityName = 'Memphis'; }),
      ],
      earned: [
        edit('carthage is the civ that turned it', patchEvent(0, { detectingCivId: 'carthage', spyOwner: 'rome' })),
      ],
    });
  });

  it('an execution is told to the spy\'s owner, not to the executioner', () => {
    expectViewerSafety(surface, {
      world: base([{ name: 'espionage:spy-executed', executingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1', spyName: 'Agent X' }]),
      viewerId: 'rome',
      hidden: [
        edit('the executed spy has a different name', patchEvent(0, { spyName: 'Agent Z' })),
        edit('the spy was someone else\'s', patchEvent(0, { spyOwner: 'egypt' })),
      ],
      earned: [
        edit('the executed spy is rome\'s own', patchEvent(0, { spyOwner: 'rome', executingCivId: 'carthage' })),
      ],
    });
  });

  describe('capture verdict dialog', () => {
    const infiltration = (captor: string): World => base([
      { name: 'espionage:spy-caught-infiltrating', capturingCivId: captor, spyOwner: 'carthage', spyId: 'spy-1', cityId: 'city-a' },
    ]);

    it('a seat that is not the captor is never shown the dialog, whichever spy was caught', () => {
      expectViewerSafety(surface, {
        world: infiltration('rome'),
        viewerId: 'egypt',
        hidden: [
          edit('a different spy was caught', patchEvent(0, { spyId: 'spy-9' })),
          edit('the spy was caught in another city', patchEvent(0, { cityId: 'city-b' })),
        ],
        earned: [
          edit('egypt is the captor', patchEvent(0, { capturingCivId: 'egypt' })),
        ],
      });
    });

    it('hot seat: only the captor is asked what to do with the spy it caught', () => {
      expectHotSeatDifferential(surface, {
        world: infiltration('rome'),
        viewers: ['rome', 'egypt'],
        knownOnlyTo: 'rome',
        mutation: edit('a different spy was caught', patchEvent(0, { spyId: 'spy-9' })),
      });
    });

    it('hot seat: an in-mission capture asks only the captor, and tells only the spy owner', () => {
      const captured = base([{ name: 'espionage:spy-captured', capturingCivId: 'rome', spyOwner: 'carthage', spyId: 'spy-1' }]);
      expectHotSeatDifferential(surface, {
        world: captured,
        viewers: ['rome', 'egypt'],
        knownOnlyTo: 'rome',
        mutation: edit('a different spy was caught', patchEvent(0, { spyId: 'spy-9' })),
      });
      expectHotSeatDifferential(surface, {
        world: captured,
        viewers: ['carthage', 'egypt'],
        knownOnlyTo: 'carthage',
        mutation: edit('the captured spy has a different name', w => { w.spyName = 'Agent Y'; }),
      });
    });
  });

  it('a bribe names its amount only to the two civs involved', () => {
    expectViewerSafety(surface, {
      world: base([{ name: 'espionage:official-bribed', civId: 'rome', targetCivId: 'carthage', amount: 42 }]),
      viewerId: 'egypt',
      hidden: [
        edit('the amount changes', patchEvent(0, { amount: 99 })),
        edit('the briber changes', patchEvent(0, { civId: 'carthage', targetCivId: 'rome' })),
      ],
      earned: [
        edit('egypt is the bribed civ', patchEvent(0, { targetCivId: 'egypt' })),
      ],
    });
  });
});
