import { describe, it, vi } from 'vitest';
import { SfxDirector } from '../../src/audio/sfx-director';
import type { AudioMixer } from '../../src/audio/audio-mixer';
import type { AudioLoader } from '../../src/audio/audio-loader';
import type { EventBus } from '../../src/core/event-bus';
import type { GameState, Unit, UnitType } from '../../src/core/types';
import {
  expectHotSeatDifferential,
  expectViewerSafety,
  type ViewerSurface,
  type WorldMutation,
} from '../helpers/viewer-safety';

/**
 * #1002 differential cover for what the SFX director lets a seat hear.
 *
 * `sfx-director.test.ts` guards fog and seat rules with `not.toHaveBeenCalled()` on the mixer, one hand-picked event
 * per case. Sound is information: which cue plays says which unit type fought, died or moved out of sight. Here the
 * projection for a seat is the ordered list of cues the director asked the loader for (the request is the privacy
 * gate; the second check after the decode only guards a seat change mid-decode). A fact the seat has not earned must
 * leave that list untouched, an earned one must move it.
 */

type Tiles = Record<string, 'visible' | 'fog'>;
type Coord = { q: number; r: number };

interface World {
  /** What each seat can currently see. */
  visibility: Record<string, Tiles>;
  /** Unit id -> type, as the director caches it when the campaign starts. */
  units: Record<string, string>;
  /** Bus events in order. */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
}

const surface: ViewerSurface<World, string[]> = {
  name: 'sfx director',
  project(world, viewerId) {
    const requested: string[] = [];
    const loader = {
      get: vi.fn((path: string) => { requested.push(path); return Promise.resolve({} as AudioBuffer); }),
    } as unknown as AudioLoader;
    const mixer = { playOneShot: vi.fn().mockResolvedValue(undefined) } as unknown as AudioMixer;
    const listeners: Record<string, Array<(payload: unknown) => void>> = {};
    const bus = {
      on: (name: string, fn: (payload: unknown) => void) => {
        (listeners[name] ??= []).push(fn);
        return () => {};
      },
    } as unknown as EventBus;
    const units = Object.fromEntries(
      Object.entries(world.units).map(([id, type]) => [id, { id, type: type as UnitType, owner: 'p2', position: { q: 0, r: 0 } } as unknown as Unit]),
    );
    const state = {
      currentPlayer: viewerId,
      units,
      civilizations: Object.fromEntries(
        Object.entries(world.visibility).map(([id, tiles]) => [id, { visibility: { tiles, lastSeen: {} } }]),
      ),
    } as unknown as GameState;

    vi.useFakeTimers();
    const director = new SfxDirector(mixer, loader);
    try {
      director.start(units, bus, () => state);
      for (const event of world.events) listeners[event.name]?.forEach(fn => fn(structuredClone(event.payload)));
      vi.runAllTimers();
    } finally {
      director.dispose();
      vi.useRealTimers();
    }
    return requested;
  },
};

const edit = (label: string, apply: (world: World) => void): WorldMutation<World> => ({ label, apply });
const patch = (index: number, fields: Record<string, unknown>) => (world: World): void => {
  Object.assign(world.events[index].payload, fields);
};

const key = (c: Coord): string => `${c.q},${c.r}`;
const FOG_A: Coord = { q: 5, r: 0 };
const FOG_B: Coord = { q: 6, r: 0 };
const HOME: Coord = { q: 0, r: 0 };

const baseVisibility = (): Record<string, Tiles> => ({
  p1: { [key(HOME)]: 'visible', [key(FOG_A)]: 'fog', [key(FOG_B)]: 'fog' },
  p2: { [key(HOME)]: 'visible', [key(FOG_A)]: 'visible', [key(FOG_B)]: 'visible' },
});

const combat = (overrides: Record<string, unknown> = {}) => ({
  name: 'combat:resolved',
  payload: {
    result: {
      attackerId: 'a1', defenderId: 'd1', attackerDamage: 10, defenderDamage: 10,
      attackerSurvived: true, defenderSurvived: false, attackerStrength: 20, defenderStrength: 20,
      attackerPosition: FOG_A, defenderPosition: FOG_B,
    },
    ...overrides,
  },
});

describe('sfx director is viewer-safe (differential)', () => {
  const units = { a1: 'warrior', d1: 'archer', m1: 'warrior' };

  it('a fight in fog is silent, whoever fought; a fight the seat can see is not', () => {
    expectViewerSafety(surface, {
      world: { visibility: baseVisibility(), units, events: [combat()] },
      viewerId: 'p1',
      hidden: [
        edit('the attacker is a different unit type', w => { w.units.a1 = 'catapult'; }),
        edit('the defender is a different unit type', w => { w.units.d1 = 'warrior'; }),
        edit('the defender survives', w => { (w.events[0].payload.result as Record<string, unknown>).defenderSurvived = true; }),
      ],
      earned: [
        edit('the defender\'s hex comes into view', w => { w.visibility.p1[key(FOG_B)] = 'visible'; }),
      ],
    });
  });

  it('hot seat: a fight only p2 can see is heard only by p2', () => {
    expectHotSeatDifferential(surface, {
      world: { visibility: baseVisibility(), units, events: [combat()] },
      viewers: ['p1', 'p2'],
      knownOnlyTo: 'p2',
      mutation: edit('the attacker is a different unit type', w => { w.units.a1 = 'catapult'; }),
    });
  });

  it('the viewers named at the event are honoured over the final fog', () => {
    expectViewerSafety(surface, {
      world: {
        visibility: { ...baseVisibility(), p1: { [key(FOG_A)]: 'visible', [key(FOG_B)]: 'visible' } },
        units,
        events: [combat({ visibleToViewerIds: ['p2'] })],
      },
      viewerId: 'p1',
      hidden: [
        edit('the attacker is a different unit type', w => { w.units.a1 = 'catapult'; }),
        edit('the defender survives', w => { (w.events[0].payload.result as Record<string, unknown>).defenderSurvived = true; }),
      ],
      earned: [
        edit('p1 is named a viewer of the fight', patch(0, { visibleToViewerIds: ['p1', 'p2'] })),
      ],
    });
  });

  it('a move through fog is silent, whatever moved', () => {
    const move = {
      name: 'unit:move',
      payload: { unitId: 'm1', from: FOG_A, to: FOG_B, path: [FOG_A, FOG_B] },
    };
    expectViewerSafety(surface, {
      world: { visibility: baseVisibility(), units, events: [move] },
      viewerId: 'p1',
      hidden: [
        edit('the mover is a different unit type', w => { w.units.m1 = 'catapult'; }),
        edit('the mover is a pirate ship', w => { w.units.m1 = 'pirate_sloop'; }),
        edit('the path is longer', patch(0, { path: [FOG_A, FOG_B, { q: 7, r: 0 }] })),
      ],
      earned: [
        edit('a path hex comes into view', w => { w.visibility.p1[key(FOG_B)] = 'visible'; }),
      ],
    });
  });

  it('a unit lost in fog is silent; one lost in view is not', () => {
    expectViewerSafety(surface, {
      world: { visibility: baseVisibility(), units, events: [{ name: 'unit:destroyed', payload: { unitId: 'd1', position: FOG_B } }] },
      viewerId: 'p1',
      hidden: [
        edit('the lost unit is a different type', w => { w.units.d1 = 'catapult'; }),
      ],
      earned: [
        edit('the hex comes into view', w => { w.visibility.p1[key(FOG_B)] = 'visible'; }),
      ],
    });
  });

  it('pillage in fog is silent, whatever was pillaged', () => {
    expectViewerSafety(surface, {
      world: {
        visibility: baseVisibility(), units,
        events: [{ name: 'pillage:resolved', payload: { coord: FOG_A, improvement: 'farm', roadPillaged: false } }],
      },
      viewerId: 'p1',
      hidden: [
        edit('a road was pillaged instead', patch(0, { improvement: null, roadPillaged: true })),
        edit('a different improvement was pillaged', patch(0, { improvement: 'mine' })),
      ],
      earned: [
        edit('the tile comes into view', w => { w.visibility.p1[key(FOG_A)] = 'visible'; }),
      ],
    });
  });

  describe('Great General cues', () => {
    const moment = (overrides: Record<string, unknown> = {}) => ({
      kind: 'rally', civId: 'p2', generalUnitId: 'g1', generalName: 'A General', isFinalCommand: false,
      generalCoord: FOG_A, affectedCoords: [FOG_A], affectedCount: 1, accent: '#000', glow: '#000', summary: '', ...overrides,
    });

    it("another seat's command is silent; the seat's own is not", () => {
      expectViewerSafety(surface, {
        world: { visibility: baseVisibility(), units, events: [{ name: 'general:command-used', payload: { moment: moment() } }] },
        viewerId: 'p1',
        hidden: [
          edit('the rival\'s command is a different ability', w => { Object.assign(w.events[0].payload.moment as object, { kind: 'seize' }); }),
          edit('the rival makes it a Final Command', w => { Object.assign(w.events[0].payload.moment as object, { isFinalCommand: true }); }),
        ],
        earned: [
          edit('the command is p1\'s own', w => { Object.assign(w.events[0].payload.moment as object, { civId: 'p1' }); }),
        ],
      });
    });

    it('an AI activation is heard only where the seat can see the General', () => {
      expectViewerSafety(surface, {
        world: { visibility: baseVisibility(), units, events: [{ name: 'general:ai-command-used', payload: { moment: moment({ civId: 'ai-1' }) } }] },
        viewerId: 'p1',
        hidden: [
          edit('the AI uses a different ability', w => { Object.assign(w.events[0].payload.moment as object, { kind: 'breach' }); }),
          edit('the AI makes it a Final Command', w => { Object.assign(w.events[0].payload.moment as object, { isFinalCommand: true }); }),
        ],
        earned: [
          edit('the General\'s hex comes into view', w => { w.visibility.p1[key(FOG_A)] = 'visible'; }),
        ],
      });
    });

    it('a Last Stand save is heard only where the seat can see the hex', () => {
      expectViewerSafety(surface, {
        world: {
          visibility: baseVisibility(), units,
          events: [{ name: 'general:last-stand-held', payload: { civId: 'p2', generalDefinitionId: 'gen_hannibal', unitId: 'u1', coord: FOG_A } }],
        },
        viewerId: 'p1',
        hidden: [
          edit('a different General held', patch(0, { generalDefinitionId: 'gen_caesar' })),
          edit('a different owner held', patch(0, { civId: 'ai-1' })),
        ],
        earned: [
          edit('the hex comes into view', w => { w.visibility.p1[key(FOG_A)] = 'visible'; }),
        ],
      });
    });

    it("another seat's retirement is silent; the owner's own is not", () => {
      expectViewerSafety(surface, {
        world: { visibility: baseVisibility(), units, events: [{ name: 'general:retired', payload: { civId: 'p2', generalName: 'A General', message: 'Retired.' } }] },
        viewerId: 'p1',
        hidden: [
          edit('a different General retired', patch(0, { generalName: 'Someone Else' })),
        ],
        earned: [
          edit('the retiring General is p1\'s own', patch(0, { civId: 'p1' })),
        ],
      });
    });
  });
});
