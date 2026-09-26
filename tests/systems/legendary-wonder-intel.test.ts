import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { getLegendaryWonderRivalIntelSummariesForViewer } from '@/systems/legendary-wonder-intel-presentation';
import { expectViewerSafety, type ViewerSurface } from '../helpers/viewer-safety';
import {
  createStartedLegendaryWonderIntelEntry,
  createHostLocationLegendaryWonderIntelEntry,
  getLegendaryWonderIntelForViewer,
  recordLegendaryWonderIntel,
  sanitizeLegendaryWonderIntel,
} from '@/systems/legendary-wonder-intel';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-intel host-location records', () => {
  it('normalizes host-location records with stored coordinate snapshots', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderIntel = {
      player: [{
        kind: 'host-location-known',
        eventId: 'location:oracle-of-delphi:rival:city-rival:41',
        wonderId: 'oracle-of-delphi',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'city-rival',
        cityName: 'Rival Harbor',
        coord: { q: 4, r: 2 },
        learnedTurn: 41,
        source: 'spy-location',
      }],
    };

    expect(getLegendaryWonderIntelForViewer(state, 'player')).toEqual([
      expect.objectContaining({
        kind: 'host-location-known',
        eventId: 'location:oracle-of-delphi:rival:city-rival:41',
        cityName: 'Rival Harbor',
        coord: { q: 4, r: 2 },
      }),
    ]);
  });

  it('sanitizes malformed host-location records and self-rival records', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:unknown:rival:city-rival:41',
          wonderId: 'unknown',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'city-rival',
          cityName: 'Rival Harbor',
          coord: { q: 4, r: 2 },
          learnedTurn: 41,
          source: 'spy-location',
        },
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:player:city-river:41',
          wonderId: 'oracle-of-delphi',
          civId: 'player',
          civName: 'Player',
          cityId: 'city-river',
          cityName: 'River City',
          coord: { q: 2, r: 2 },
          learnedTurn: 41,
          source: 'spy-location',
        },
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:rival:bad-city:41',
          wonderId: 'oracle-of-delphi',
          civId: 'rival',
          civName: 'Rival',
          cityId: 'bad-city',
          cityName: '',
          coord: { q: Number.NaN, r: 2 },
          learnedTurn: 41,
          source: 'spy-location',
        },
      ],
    };

    expect(sanitizeLegendaryWonderIntel(state)).toEqual({});
  });

  it('dedupes exact host-location event IDs while preserving distinct intel tiers', () => {
    const state = makeLegendaryWonderFixture();
    const started = {
      kind: 'started' as const,
      eventId: 'started:oracle-of-delphi:rival:city-rival:41',
      projectKey: 'oracle-of-delphi:rival:city-rival',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      cityId: 'city-rival',
      cityName: 'Rival Harbor',
      revealedTurn: 41,
    };
    const location = createHostLocationLegendaryWonderIntelEntry({
      projectKey: 'oracle-of-delphi:rival:city-rival',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      cityId: 'city-rival',
      cityName: 'Rival Harbor',
      coord: { q: 4, r: 2 },
      learnedTurn: 41,
      source: 'spy-location',
    });
    const first = recordLegendaryWonderIntel(state, 'player', started);
    const second = recordLegendaryWonderIntel({ ...state, legendaryWonderIntel: first }, 'player', location);
    const third = recordLegendaryWonderIntel({ ...state, legendaryWonderIntel: second }, 'player', location);

    expect(third.player.map(entry => entry.kind)).toEqual(['started', 'host-location-known']);
  });

  it('keeps legacy started records text-only and distinct from host-location records', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderIntel = {
      player: [{
        projectKey: 'oracle-of-delphi:rival:city-rival',
        wonderId: 'oracle-of-delphi',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'city-rival',
        cityName: 'Rival Harbor',
        revealedTurn: 41,
        intelLevel: 'started',
      }],
    };

    expect(getLegendaryWonderIntelForViewer(state, 'player')[0]).toMatchObject({
      kind: 'started',
      cityName: 'Rival Harbor',
    });
  });
});

// #1002 — REMEMBERED intel through the shared harness. Viewer safety is not "currently visible
// only": a stored intel record is earned knowledge and must survive live changes (the rival city
// renamed, lost from view, or its project racing ahead) — and those live changes must not leak
// into the summary either. Only recording new intel for THIS viewer may change it.
describe('#1002 legendary-wonder rival intel through the shared viewer-safety harness', () => {
  const rivalIntelSummaries: ViewerSurface<GameState, unknown> = {
    name: 'legendary-wonder rival intel summaries',
    project: (state, viewerId) => [...getLegendaryWonderRivalIntelSummariesForViewer(state, viewerId).entries()],
  };

  function started(revealedTurn: number) {
    return createStartedLegendaryWonderIntelEntry({
      projectKey: 'oracle-of-delphi:rival:city-rival',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      cityId: 'city-rival',
      cityName: 'Rival Harbor',
      revealedTurn,
    });
  }

  function world(): GameState {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderIntel = recordLegendaryWonderIntel(state, 'player', started(41));
    return state;
  }

  it('keeps remembered intel stable against live changes and other viewers\' intel', () => {
    const base = world();
    expect(getLegendaryWonderRivalIntelSummariesForViewer(base, 'player').has('oracle-of-delphi')).toBe(true);
    expectViewerSafety(rivalIntelSummaries, {
      world: base,
      viewerId: 'player',
      hidden: [
        { label: 'the rival renames the host city after the intel was learned', apply: s => { s.cities['city-rival']!.name = 'New Name'; } },
        { label: 'the rival city is lost from view (all tiles unexplored)', apply: s => {
          s.civilizations.player.visibility.tiles = { ...s.civilizations.player.visibility.tiles, '5,5': 'unexplored' };
        } },
        { label: 'the rival\'s live project races ahead unseen', apply: s => {
          s.legendaryWonderProjects = {
            ...(s.legendaryWonderProjects ?? {}),
            'oracle-of-delphi:rival:city-rival': {
              wonderId: 'oracle-of-delphi', ownerId: 'rival', cityId: 'city-rival', phase: 'building',
              investedProduction: 999, questSteps: [], transferableProduction: 0,
            } as never,
          };
        } },
        { label: 'another viewer records its own intel', apply: s => {
          s.legendaryWonderIntel = { ...(s.legendaryWonderIntel ?? {}), rival: [started(50) as never] };
        } },
      ],
      earned: [{
        label: 'the viewer learns of a later construction start',
        apply: s => { s.legendaryWonderIntel = recordLegendaryWonderIntel(s, 'player', started(60)); },
      }],
    });
  });
});
