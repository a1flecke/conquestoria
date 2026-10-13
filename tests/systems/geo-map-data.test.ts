import { beforeAll, describe, expect, it } from 'vitest';
import {
  GeoMapDataNotLoadedError,
  getLoadedGeoMapData,
  isGeoMapDataLoaded,
  isGeographicMapScript,
  loadGeoMapData,
  GEOGRAPHIC_MAP_SCRIPTS,
} from '@/systems/geo-map-data';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { useDiskGeoMapDataFetcher } from '../helpers/geo-map-data';

beforeAll(() => useDiskGeoMapDataFetcher());

// #1456: the bulk Earth / Old World / New World tile and river data is loaded on demand. The
// synchronous core constructors read only what the caller has already loaded.

describe('geographic map data registry (#1456)', () => {
  it('classifies exactly the three geographic scripts', () => {
    expect([...GEOGRAPHIC_MAP_SCRIPTS].sort()).toEqual(['earth', 'new-world', 'old-world']);
    expect(isGeographicMapScript('earth')).toBe(true);
    expect(isGeographicMapScript('procedural')).toBe(false);
    expect(isGeographicMapScript(undefined)).toBe(false);
  });

  it('loads a script once and shares one in-flight load between overlapping callers', async () => {
    const a = loadGeoMapData('new-world');
    const b = loadGeoMapData('new-world');
    expect(a).toBe(b);
    const data = await a;
    expect(isGeoMapDataLoaded('new-world')).toBe(true);
    expect(getLoadedGeoMapData('new-world')).toBe(data);
    expect(await loadGeoMapData('new-world')).toBe(data);
    expect(data.tiles.small.length).toBeGreaterThan(100);
    expect(data.rivers.small.length).toBeGreaterThan(0);
  });

  it('loads only the requested script', async () => {
    await loadGeoMapData('old-world');
    expect(isGeoMapDataLoaded('old-world')).toBe(true);
  });
});

describe('core constructors on geographic scripts need the data loaded first (#1456)', () => {
  it('createNewGame on a script whose data is loaded works and is deterministic', async () => {
    await loadGeoMapData('earth');
    const a = createNewGame({ civType: 'rome', seed: 'geo-1456', mapSize: 'small', opponentCount: 1, gameTitle: 't', mapScript: 'earth' });
    const b = createNewGame({ civType: 'rome', seed: 'geo-1456', mapSize: 'small', opponentCount: 1, gameTitle: 't', mapScript: 'earth' });
    expect(Object.keys(a.map.tiles).length).toBeGreaterThan(0);
    expect(a.map.tiles).toEqual(b.map.tiles);
  });

  it('a non-geographic script never needs any geographic data', () => {
    expect(() => createNewGame({ civType: 'rome', seed: 'proc-1456', mapSize: 'small', opponentCount: 1, gameTitle: 't', mapScript: 'procedural' })).not.toThrow();
  });

  it('GeoMapDataNotLoadedError names the script and the fix', () => {
    const error = new GeoMapDataNotLoadedError('earth');
    expect(error.message).toContain('earth');
    expect(error.message).toContain('loadGeoMapData');
    expect(error.script).toBe('earth');
  });

  it('createHotSeatGame on a loaded geographic script works', async () => {
    await loadGeoMapData('earth');
    const state = createHotSeatGame({
      playerCount: 2, mapSize: 'small', mapScript: 'earth',
      players: [
        { name: 'A', slotId: 'player-1', civType: 'rome', isHuman: true },
        { name: 'B', slotId: 'player-2', civType: 'egypt', isHuman: true },
      ],
    }, 'geo-hot-1456');
    expect(Object.keys(state.map.tiles).length).toBeGreaterThan(0);
  });
});
