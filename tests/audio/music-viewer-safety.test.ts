import { describe, it, vi, afterEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { AudioSystem } from '../../src/audio/audio-system';
import { AudioLoader } from '../../src/audio/audio-loader';
import { AudioMixer } from '../../src/audio/audio-mixer';
import type { EventBus } from '../../src/core/event-bus';
import type { GameState } from '../../src/core/types';
import {
  expectHotSeatDifferential,
  expectViewerSafety,
  type ViewerSurface,
  type WorldMutation,
} from '../helpers/viewer-safety';

/**
 * #1002 differential cover for what a seat hears as music.
 *
 * `music-director.test.ts` and `audio-system.integration.test.ts` guard seat rules with call counts on the mixer. The
 * music a seat hears is information: an at-war layer says a rival declared war on the viewer, an unrest layer says a
 * city is in revolt, a stinger says a tech finished or a city fell. The projection for a seat is the ordered list of
 * what the music side asked the mixer and loader for after the campaign started: the snapshot it moved to, each
 * adaptive layer it requested or released, and each stinger it asked the loader for. A fact the seat has not earned
 * must leave that list untouched; an earned one must move it.
 */

interface World {
  /** The seat the campaign starts with; the viewer unless a case says otherwise. */
  startSeat?: string;
  /** Wars each seat holds when the campaign starts. */
  atWarWith: Record<string, string[]>;
  /** Bus events in order. */
  events: Array<{ name: string; payload: Record<string, unknown> }>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const surface: ViewerSurface<World, string[]> = {
  name: 'music',
  project(world, viewerId) {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('audio-load-mock')));
    const recorded: string[] = [];
    let recording = false;
    const note = (entry: string): void => { if (recording) recorded.push(entry); };
    vi.spyOn(AudioMixer.prototype, 'setSnapshot').mockImplementation((id: string) => { note(`snapshot:${id}`); });
    vi.spyOn(AudioMixer.prototype, 'setBusSource').mockImplementation((bus: string, source: unknown) => {
      if (bus === 'adaptive' && source === null) note('adaptive:released');
    });
    vi.spyOn(AudioMixer.prototype, 'playOneShot').mockResolvedValue(undefined as never);
    vi.spyOn(AudioLoader.prototype, 'get').mockImplementation(async (path: string) => { note(`get:${path}`); return {} as AudioBuffer; });
    vi.spyOn(AudioLoader.prototype, 'getLoop').mockImplementation(async (entry: { file: string }) => { note(`loop:${entry.file}`); return {} as never; });
    vi.spyOn(AudioLoader.prototype, 'prefetch').mockResolvedValue(undefined as never);

    const listeners: Record<string, Array<(payload: unknown) => void>> = {};
    const bus = {
      on: (name: string, fn: (payload: unknown) => void) => {
        (listeners[name] ??= []).push(fn);
        return () => {};
      },
    } as unknown as EventBus;

    const seats = Object.keys(world.atWarWith);
    const state = {
      currentPlayer: world.startSeat ?? viewerId,
      era: 1,
      turn: 5,
      settings: { musicEnabled: true, soundEnabled: true, musicVolume: 0.8, sfxVolume: 0.8, stingerEnabled: true, stingerVolume: 1 },
      civilizations: Object.fromEntries(seats.map(id => [id, { civType: 'rome', diplomacy: { atWarWith: world.atWarWith[id] }, nearDefeat: false }])),
      cities: {},
      units: {},
      activeCrises: {},
    } as unknown as GameState;

    const ctx = new MockAudioContext();
    (ctx as unknown as { state: string }).state = 'running';
    const system = new AudioSystem(ctx as unknown as AudioContext);
    try {
      system.start(state, bus, () => state);
      recording = true;
      // A case that starts on another seat records from the hand-over on: the incoming seat hears nothing before it.
      recording = world.startSeat === undefined;
      for (const event of world.events) {
        if (event.name === 'currentPlayer:changed-after-handoff') recording = true;
        listeners[event.name]?.forEach(fn => fn(structuredClone(event.payload)));
      }
    } finally {
      system.dispose();
    }
    return recorded;
  },
};

const edit = (label: string, apply: (world: World) => void): WorldMutation<World> => ({ label, apply });
const patch = (index: number, fields: Record<string, unknown>) => (world: World): void => {
  Object.assign(world.events[index].payload, fields);
};
const peaceful = (): Record<string, string[]> => ({ p1: [], p2: [], 'ai-1': [] });

describe('music is viewer-safe (differential)', () => {
  it("a war between other civs is not heard; the seat's own is", () => {
    expectViewerSafety(surface, {
      world: { atWarWith: peaceful(), events: [{ name: 'diplomacy:war-declared', payload: { attackerId: 'p2', defenderId: 'ai-1', opponentKind: 'major' } }] },
      viewerId: 'p1',
      hidden: [
        edit('the rivals are different civs', patch(0, { attackerId: 'ai-1', defenderId: 'p2' })),
        edit('the opponent is a city-state', patch(0, { opponentKind: 'minor' })),
      ],
      earned: [edit('the war is declared on p1', patch(0, { defenderId: 'p1' }))],
    });
  });

  it("another civ's peace is not heard; the seat's own is", () => {
    expectViewerSafety(surface, {
      world: {
        atWarWith: { p1: ['ai-1'], p2: ['ai-1'], 'ai-1': ['p1', 'p2'] },
        events: [{ name: 'diplomacy:peace-made', payload: { civA: 'p2', civB: 'ai-1' } }],
      },
      viewerId: 'p1',
      hidden: [edit('the peace is the other way round', patch(0, { civA: 'ai-1', civB: 'p2' }))],
      earned: [edit('the peace is made by p1', patch(0, { civA: 'p1' }))],
    });
  });

  it("another civ's city, tech, wonder and conquest are not heard", () => {
    const events = [
      { name: 'city:founded', payload: { city: {}, founderId: 'p2' } },
      { name: 'tech:completed', payload: { civId: 'p2', techId: 'bronze-working' } },
      { name: 'wonder:legendary-completed', payload: { civId: 'p2', cityId: 'c', wonderId: 'w', turnCompleted: 5 } },
      { name: 'civ:eliminated', payload: { civId: 'ai-1', eliminatedBy: 'p2' } },
    ];
    for (let i = 0; i < events.length; i++) {
      const own = i === 3 ? { eliminatedBy: 'p1' } : i === 0 ? { founderId: 'p1' } : { civId: 'p1' };
      expectViewerSafety(surface, {
        world: { atWarWith: peaceful(), events: [events[i]] },
        viewerId: 'p1',
        hidden: [edit('a different rival does it', patch(0, i === 3 ? { eliminatedBy: 'ai-1' } : i === 0 ? { founderId: 'ai-1' } : { civId: 'ai-1' }))],
        earned: [edit('p1 does it', patch(0, own))],
      });
    }
  });

  it("another seat's unrest, revolt and near-defeat are not heard", () => {
    for (const name of ['faction:unrest-started', 'faction:revolt-started']) {
      expectViewerSafety(surface, {
        world: { atWarWith: peaceful(), events: [{ name, payload: { cityId: 'c', owner: 'p2' } }] },
        viewerId: 'p1',
        hidden: [edit('a different rival city', patch(0, { owner: 'ai-1', cityId: 'd' }))],
        earned: [edit('the city is p1\'s', patch(0, { owner: 'p1' }))],
      });
    }
    expectViewerSafety(surface, {
      world: { atWarWith: peaceful(), events: [{ name: 'civ:near-defeat', payload: { civId: 'p2' } }] },
      viewerId: 'p1',
      hidden: [edit('a different rival is near defeat', patch(0, { civId: 'ai-1' }))],
      earned: [edit('p1 is near defeat', patch(0, { civId: 'p1' }))],
    });
  });

  it("another seat's crisis and lost city are not heard", () => {
    expectViewerSafety(surface, {
      world: { atWarWith: peaceful(), events: [{ name: 'crisis:started', payload: { crisisId: 'x', flavorId: 'f', civId: 'p2', cityIds: [] } }] },
      viewerId: 'p1',
      hidden: [edit('a different rival has the crisis', patch(0, { civId: 'ai-1', flavorId: 'g' }))],
      earned: [edit('the crisis is p1\'s', patch(0, { civId: 'p1' }))],
    });
    expectViewerSafety(surface, {
      world: { atWarWith: peaceful(), events: [{ name: 'city:captured', payload: { cityId: 'c', newOwner: 'ai-1', previousOwner: 'p2' } }] },
      viewerId: 'p1',
      hidden: [edit('a different rival lost it', patch(0, { previousOwner: 'ai-1', newOwner: 'p2' }))],
      earned: [edit('the city was p1\'s', patch(0, { previousOwner: 'p1' }))],
    });
  });

  it("a warning addressed to another seat is not heard", () => {
    expectViewerSafety(surface, {
      world: { atWarWith: peaceful(), events: [{ name: 'ai:strategic-warning-audio', payload: { viewerId: 'p2', turn: 5 } }] },
      viewerId: 'p1',
      hidden: [edit('the warning is for a different rival', patch(0, { viewerId: 'ai-1' }))],
      earned: [edit('the warning is for p1', patch(0, { viewerId: 'p1' }))],
    });
  });

  it('hot seat: a war only p2 is in is heard only by p2', () => {
    expectHotSeatDifferential(surface, {
      world: { atWarWith: peaceful(), events: [] },
      viewers: ['p1', 'p2'],
      knownOnlyTo: 'p2',
      mutation: edit('ai-1 declares war on p2', w => {
        w.events.push({ name: 'diplomacy:war-declared', payload: { attackerId: 'ai-1', defenderId: 'p2', opponentKind: 'major' } });
      }),
    });
  });

  it('a hand-over leaves nothing of the outgoing seat in the incoming seat\'s music', () => {
    const handoff = { civId: 'p2', civType: 'rome', era: 1, atWarCount: 0, unrestCityCount: 0, nearDefeat: false, inBeastTerritory: false };
    expectViewerSafety(surface, {
      world: {
        startSeat: 'p1',
        atWarWith: { p1: ['ai-1'], p2: [], 'ai-1': ['p1'] },
        events: [
          { name: 'faction:unrest-started', payload: { cityId: 'c', owner: 'p1' } },
          { name: 'currentPlayer:changed-after-handoff', payload: handoff },
        ],
      },
      viewerId: 'p2',
      hidden: [
        edit('the outgoing seat had a different city in unrest', patch(0, { cityId: 'd' })),
        edit('the outgoing seat was not at war', w => { w.atWarWith.p1 = []; w.atWarWith['ai-1'] = []; }),
      ],
      earned: [edit('the incoming seat is at war', patch(1, { atWarCount: 1 }))],
    });
  });
});
