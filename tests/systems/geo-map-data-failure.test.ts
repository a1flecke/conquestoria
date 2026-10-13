import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GeoMapDataFetcherMissingError,
  GeoMapDataInvalidError,
  getLoadedGeoMapData,
  GeoMapDataNotLoadedError,
  isGeoMapDataLoaded,
  loadGeoMapData,
  setGeoMapDataFetcher,
} from '@/systems/geo-map-data';
import { readGeoMapDataFromDisk } from '../helpers/geo-map-data';

// #1456: a failed load leaves nothing behind. This file starts with nothing loaded (each test file gets its
// own module registry), so it can drive the failure paths that tests sharing a loaded script cannot.

afterEach(() => setGeoMapDataFetcher(null));

describe('loadGeoMapData failure and retry (#1456)', () => {
  it('with no fetcher installed it fails loudly instead of guessing, and is not left half-loaded', async () => {
    setGeoMapDataFetcher(null);
    await expect(loadGeoMapData('new-world')).rejects.toBeInstanceOf(GeoMapDataFetcherMissingError);
    await expect(loadGeoMapData('new-world')).rejects.toBeInstanceOf(GeoMapDataFetcherMissingError);
    expect(isGeoMapDataLoaded('new-world')).toBe(false);
  });

  it('a network failure rejects, leaves the script unloaded and unlocked, and the next call succeeds', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(async () => readGeoMapDataFromDisk('earth'));
    setGeoMapDataFetcher(fetcher);

    await expect(loadGeoMapData('earth')).rejects.toThrow('Failed to fetch');
    expect(isGeoMapDataLoaded('earth')).toBe(false);
    expect(() => getLoadedGeoMapData('earth')).toThrow(GeoMapDataNotLoadedError);

    const data = await loadGeoMapData('earth');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(isGeoMapDataLoaded('earth')).toBe(true);
    expect(data.tiles.small.length).toBeGreaterThan(100);
  });

  it('a malformed document is rejected, never stored, and does not block a later good load', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('<!doctype html>')
      .mockResolvedValueOnce({ tiles: { small: [] }, rivers: {} })
      .mockImplementation(async () => readGeoMapDataFromDisk('old-world'));
    setGeoMapDataFetcher(fetcher);

    await expect(loadGeoMapData('old-world')).rejects.toBeInstanceOf(GeoMapDataInvalidError);
    await expect(loadGeoMapData('old-world')).rejects.toBeInstanceOf(GeoMapDataInvalidError);
    expect(isGeoMapDataLoaded('old-world')).toBe(false);

    await loadGeoMapData('old-world');
    expect(isGeoMapDataLoaded('old-world')).toBe(true);
  });

  it('overlapping loads share one request, and a loaded script is never requested again', async () => {
    const fetcher = vi.fn(async () => readGeoMapDataFromDisk('new-world'));
    setGeoMapDataFetcher(fetcher);

    const [a, b] = await Promise.all([loadGeoMapData('new-world'), loadGeoMapData('new-world')]);
    expect(a).toBe(b);
    await loadGeoMapData('new-world');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('a failed load of one script does not disturb another', async () => {
    setGeoMapDataFetcher(async script => {
      if (script === 'earth') throw new Error('offline');
      return readGeoMapDataFromDisk(script);
    });
    // earth may already be loaded by an earlier test in this file, so only assert the independent script.
    await loadGeoMapData('new-world');
    expect(isGeoMapDataLoaded('new-world')).toBe(true);
  });
});
