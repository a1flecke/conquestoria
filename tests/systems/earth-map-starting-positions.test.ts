import { describe, it, expect } from 'vitest';
import { loadGeoMap } from '@/systems/geo-map-loader';
import {
  EARTH_TILES,
  EARTH_START_POSITIONS,
  EARTH_RIVERS,
} from '@/systems/earth-map-data';
import { isValidStartTile, hasWorkableSurroundings } from '@/systems/map-validation';
import { hexKey } from '@/systems/hex-utils';

const MAP_DIMS = {
  small:  { width: 30, height: 30 },
  medium: { width: 50, height: 50 },
  large:  { width: 80, height: 80 },
} as const;

type MapSize = keyof typeof MAP_DIMS;

describe('Earth map starting positions', () => {
  const sizes: MapSize[] = ['small', 'medium', 'large'];

  for (const size of sizes) {
    describe(`${size} map`, () => {
      const map = loadGeoMap(EARTH_TILES[size], EARTH_RIVERS[size], MAP_DIMS[size], true);
      const positions = EARTH_START_POSITIONS[size];
      const civIds = Object.keys(positions);

      it('has no duplicate starting positions', () => {
        const seen = new Map<string, string>();
        const duplicates: string[] = [];
        for (const civId of civIds) {
          const key = hexKey(positions[civId as keyof typeof positions]);
          if (seen.has(key)) {
            duplicates.push(`${civId} and ${seen.get(key)} both at ${key}`);
          } else {
            seen.set(key, civId);
          }
        }
        expect(duplicates, `Duplicate positions: ${duplicates.join('; ')}`).toHaveLength(0);
      });

      it('all starting tiles are valid (non-water, non-impassable)', () => {
        const invalid: string[] = [];
        for (const civId of civIds) {
          const coord = positions[civId as keyof typeof positions];
          const tile = map.tiles[hexKey(coord)];
          if (!isValidStartTile(tile)) {
            invalid.push(
              `${civId} at ${hexKey(coord)} — terrain: ${tile?.terrain ?? 'missing'}`,
            );
          }
        }
        expect(invalid, `Invalid start tiles: ${invalid.join('; ')}`).toHaveLength(0);
      });

      it('all starting positions have workable surrounding tiles', () => {
        const unworkable: string[] = [];
        for (const civId of civIds) {
          const coord = positions[civId as keyof typeof positions];
          if (!hasWorkableSurroundings(coord, map.tiles, 2)) {
            unworkable.push(`${civId} at ${hexKey(coord)}`);
          }
        }
        expect(
          unworkable,
          `Positions without workable surroundings: ${unworkable.join('; ')}`,
        ).toHaveLength(0);
      });
    });
  }
});
