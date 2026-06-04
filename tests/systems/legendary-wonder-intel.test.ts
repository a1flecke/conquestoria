import { describe, expect, it } from 'vitest';
import {
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
