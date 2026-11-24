import { describe, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerGeneralPresentation } from '@/presentation/register-general-presentation';
import type { GeneralAbilityMoment } from '@/systems/great-general-ability-presentation';
import { makePresentationContext } from '../helpers/presentation-context';
import {
  expectHotSeatDifferential,
  expectViewerSafety,
  type ViewerSurface,
  type WorldMutation,
} from '../helpers/viewer-safety';

/**
 * #1002 differential cover for the Great General presentation seams.
 *
 * `register-general-presentation.test.ts` guards who is shown what with `not.toHaveBeenCalled()` on
 * `playGeneralAbility` / `showNotification` / `enqueueGeneralRetirement`. Those assertions are the only
 * guard (the harness is used by one of 21 files in presentation, audio and controllers), and each one fixes
 * a single hand-picked leak shape. Here the viewer-visible output is a projection of the world, and a change
 * the viewer has not earned must leave it untouched: a hidden fact that leaks through any channel (the toast, the
 * map effect, the ceremony, a delivery addressed to the viewer) moves the projection and fails by name.
 *
 * The projection is what the viewing seat's screen receives: toasts, the fields the renderer reads for a map
 * effect (`playGeneralAbility` -> `general-ability-effects.ts`: kind, hexes, crest colours, final command),
 * ceremony items, and deliveries addressed to the viewer. A delivery addressed to another seat is queued for
 * that seat, not shown here, so it is not part of this viewer's projection.
 */

type Tiles = Record<string, 'visible' | 'fog'>;

interface World {
  /** What each seat can currently see. */
  visibility: Record<string, Tiles>;
  /** The events the registrar is asked to present, in order. */
  events: Array<
    | { name: 'general:command-used'; moment: GeneralAbilityMoment }
    | { name: 'general:ai-command-used'; moment: GeneralAbilityMoment }
    | { name: 'general:last-stand-held'; civId: string; generalDefinitionId: string; unitId: string; coord: { q: number; r: number } }
    | { name: 'general:retired'; civId: string; generalName: string; message: string; generalDefinitionId: string }
  >;
}

interface Shown {
  toasts: unknown[];
  effects: unknown[];
  ceremonies: unknown[];
  deliveredToViewer: unknown[];
}

const moment = (overrides: Partial<GeneralAbilityMoment>): GeneralAbilityMoment => ({
  kind: 'rally', civId: 'p1', generalUnitId: 'gen-1', generalName: 'Hannibal Barca', isFinalCommand: false,
  generalCoord: { q: 0, r: 0 }, affectedCoords: [{ q: 1, r: 0 }], affectedCount: 1,
  accent: '#112233', glow: '#445566', summary: 'Rally: 1 unit steadied, 30 HP restored.',
  ...overrides,
});

const surface: ViewerSurface<World, Shown> = {
  name: 'general presentation',
  project(world, viewerId) {
    const civilizations = Object.fromEntries(
      ['p1', 'p2'].map(id => [id, { isHuman: true, visibility: { tiles: world.visibility[id] ?? {}, lastSeen: {} } }]),
    );
    const ctx = makePresentationContext({ state: { currentPlayer: viewerId, civilizations } as never });
    const bus = new EventBus();
    registerGeneralPresentation(bus, ctx);
    for (const event of world.events) {
      // The bus is typed per event; the world stores plain data.
      const { name, ...payload } = event;
      bus.emit(name as 'general:retired', payload as never);
    }
    const calls = (fn: unknown): unknown[][] => (fn as { mock: { calls: unknown[][] } }).mock.calls;
    return {
      toasts: calls(ctx.showNotification),
      effects: calls(ctx.playGeneralAbility).map(([m]) => {
        const shown = m as GeneralAbilityMoment;
        return {
          kind: shown.kind, isFinalCommand: shown.isFinalCommand, generalCoord: shown.generalCoord,
          affectedCoords: shown.affectedCoords, accent: shown.accent, glow: shown.glow, summary: shown.summary,
        };
      }),
      ceremonies: calls(ctx.ceremonies.enqueueGeneralRetirement),
      deliveredToViewer: calls(ctx.deliver).filter(([civId]) => civId === viewerId),
    };
  },
};

const edit = (label: string, apply: (world: World) => void): WorldMutation<World> => ({ label, apply });

describe('general presentation is viewer-safe (differential)', () => {
  describe('a human command (general:command-used)', () => {
    const world: World = {
      visibility: { p1: {}, p2: {} },
      events: [{ name: 'general:command-used', moment: moment({ civId: 'p2', summary: 'Rally: rival result.' }) }],
    };

    it("another seat's command moves nothing on this viewer's screen; the viewer's own command does", () => {
      expectViewerSafety(surface, {
        world,
        viewerId: 'p1',
        hidden: [
          edit("the rival's result text changes", w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { summary: 'Rally: 9 units steadied.' }); }),
          edit("the rival's affected hexes change", w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { affectedCoords: [{ q: 7, r: 7 }] }); }),
          edit('the rival makes it a Final Command', w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { isFinalCommand: true }); }),
        ],
        earned: [
          edit('the same command is now the viewer\'s own', w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { civId: 'p1' }); }),
        ],
      });
    });

    it('hot seat: p2 alone has earned its own command', () => {
      expectHotSeatDifferential(surface, {
        world: { visibility: { p1: {}, p2: {} }, events: [{ name: 'general:command-used', moment: moment({ civId: 'p1' }) }] },
        viewers: ['p1', 'p2'],
        knownOnlyTo: 'p1',
        mutation: edit('p1 changes its command result', w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { summary: 'Rally: changed.' }); }),
      });
    });
  });

  describe('an observed AI command (general:ai-command-used)', () => {
    const aiWorld: World = {
      visibility: { p1: { '0,0': 'visible', '5,5': 'fog' }, p2: {} },
      events: [{
        name: 'general:ai-command-used',
        moment: moment({ civId: 'ai-1', generalCoord: { q: 0, r: 0 }, affectedCoords: [{ q: 0, r: 0 }, { q: 5, r: 5 }], affectedCount: 2 }),
      }],
    };

    it('only the visible hexes are drawn, and no text or name arrives', () => {
      expectViewerSafety(surface, {
        world: aiWorld,
        viewerId: 'p1',
        hidden: [
          edit('the AI result text changes', w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { summary: 'Rally: secret result.' }); }),
          edit('an affected hex the viewer cannot see moves', w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { affectedCoords: [{ q: 0, r: 0 }, { q: 6, r: 6 }] }); }),
          edit('the AI General is a different one', w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { generalName: 'Someone Else' }); }),
        ],
        earned: [
          edit('the affected hex comes into view', w => { w.visibility.p1['5,5'] = 'visible'; }),
        ],
      });
    });

    it('an activation on a hex the viewer cannot see changes nothing, whoever the General is', () => {
      expectViewerSafety(surface, {
        world: { ...aiWorld, visibility: { p1: { '0,0': 'fog', '5,5': 'visible' }, p2: {} } },
        viewerId: 'p1',
        hidden: [
          edit('the General\'s hex moves', w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { generalCoord: { q: 9, r: 9 } }); }),
          edit('the effect colours change', w => { Object.assign((w.events[0] as { moment: GeneralAbilityMoment }).moment, { accent: '#ff0000' }); }),
        ],
        earned: [
          edit('the General\'s hex comes into view', w => { w.visibility.p1['0,0'] = 'visible'; }),
        ],
      });
    });
  });

  describe("a Last Stand survival save (general:last-stand-held)", () => {
    const save = { name: 'general:last-stand-held' as const, civId: 'p2', generalDefinitionId: 'gen_hannibal', unitId: 'u1', coord: { q: 3, r: 3 } };

    it("a rival's save out of sight is invisible, whoever the General is", () => {
      expectViewerSafety(surface, {
        world: { visibility: { p1: { '3,3': 'fog' }, p2: {} }, events: [save] },
        viewerId: 'p1',
        hidden: [
          edit('the rival\'s General is a different one', w => { (w.events[0] as { generalDefinitionId: string }).generalDefinitionId = 'gen_caesar'; }),
          edit('the rival\'s unit is a different one', w => { (w.events[0] as { unitId: string }).unitId = 'u99'; }),
        ],
        earned: [
          edit('the hex comes into view', w => { w.visibility.p1['3,3'] = 'visible'; }),
        ],
      });
    });

    it("the owner is told, the other seat is not: the save's sentence reaches only its owner", () => {
      expectHotSeatDifferential(surface, {
        world: { visibility: { p1: {}, p2: {} }, events: [save] },
        viewers: ['p1', 'p2'],
        knownOnlyTo: 'p2',
        mutation: edit('the owner\'s General is a different one', w => { (w.events[0] as { generalDefinitionId: string }).generalDefinitionId = 'gen_caesar'; }),
      });
    });
  });

  describe('a retirement (general:retired)', () => {
    const retirement = {
      name: 'general:retired' as const, civId: 'p2', generalName: 'Julius Caesar',
      message: 'Retired after 3 commands.', generalDefinitionId: 'gen_caesar',
    };

    it("another seat's retirement is neither shown nor delivered to this viewer; the viewer's own is", () => {
      expectViewerSafety(surface, {
        world: { visibility: { p1: {}, p2: {} }, events: [retirement] },
        viewerId: 'p1',
        hidden: [
          edit('the rival\'s General has a different name', w => { (w.events[0] as { generalName: string }).generalName = 'Someone Else'; }),
          edit('the rival\'s career line changes', w => { (w.events[0] as { message: string }).message = 'Retired after 9 commands.'; }),
          edit('the rival\'s General is a different one', w => { (w.events[0] as { generalDefinitionId: string }).generalDefinitionId = 'gen_hannibal'; }),
        ],
        earned: [
          edit('the retirement is the viewer\'s own', w => { (w.events[0] as { civId: string }).civId = 'p1'; }),
        ],
      });
    });

    it('hot seat: only the retiring seat sees its own career line', () => {
      expectHotSeatDifferential(surface, {
        world: { visibility: { p1: {}, p2: {} }, events: [retirement] },
        viewers: ['p1', 'p2'],
        knownOnlyTo: 'p2',
        mutation: edit('the career line changes', w => { (w.events[0] as { message: string }).message = 'Retired after 9 commands.'; }),
      });
    });
  });
});
