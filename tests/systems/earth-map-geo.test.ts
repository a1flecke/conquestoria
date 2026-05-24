import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// We test the RESOURCE_ZONES array directly by reading the generate script source.
// The script is not designed for direct import, so we parse the bounding boxes
// from the source text and verify them against the spec.

// The expected bounding boxes for new resources, per spec §Earth map.
// Each entry is: { resource, lonMin, lonMax, latMin, latMax }
const EXPECTED_NEW_ZONE_BOXES = [
  // Gold
  { resource: 'gold', lonMin: 25,   lonMax: 32,   latMin: -30, latMax: -22 }, // S. Africa
  { resource: 'gold', lonMin: -122, lonMax: -114, latMin: 36,  latMax: 42  }, // California
  { resource: 'gold', lonMin: 120,  lonMax: 150,  latMin: 55,  latMax: 65  }, // Siberia
  // Silver
  { resource: 'silver', lonMin: -107, lonMax: -98, latMin: 20,  latMax: 30  }, // Mexico
  { resource: 'silver', lonMin: -70,  lonMax: -63, latMin: -24, latMax: -14 }, // Bolivia/Peru
  // Furs
  { resource: 'furs', lonMin: 60,   lonMax: 140,  latMin: 55, latMax: 70 }, // Siberia
  { resource: 'furs', lonMin: -135, lonMax: -70,  latMin: 50, latMax: 70 }, // Canada
  // Sheep
  { resource: 'sheep', lonMin: -10, lonMax: 2,   latMin: 50, latMax: 60 }, // British Isles
  { resource: 'sheep', lonMin: 80,  lonMax: 120, latMin: 40, latMax: 52 }, // C. Asia
  // Cattle
  { resource: 'cattle', lonMin: -105, lonMax: -95, latMin: 35, latMax: 50 }, // Great Plains
  { resource: 'cattle', lonMin: -65,  lonMax: -57, latMin: -40, latMax: -28 }, // Pampas
  // Salt
  { resource: 'salt', lonMin: 12,  lonMax: 25,  latMin: 47, latMax: 55 }, // C. Europe
  { resource: 'salt', lonMin: 44,  lonMax: 58,  latMin: 30, latMax: 38 }, // Iran
];

function parseResourceZonesFromScript(): Array<{ resource: string; lonMin: number; lonMax: number; latMin: number; latMax: number }> {
  const scriptPath = resolve(process.cwd(), 'scripts/generate-earth-maps.ts');
  const content = readFileSync(scriptPath, 'utf-8');

  const zonesMatch = content.match(/const RESOURCE_ZONES[^=]*=\s*\[([\s\S]*?)\];/);
  if (!zonesMatch) throw new Error('Could not find RESOURCE_ZONES in script');

  const zonesText = zonesMatch[1];
  const entries: Array<{ resource: string; lonMin: number; lonMax: number; latMin: number; latMax: number }> = [];

  const entryRegex = /\{\s*resource:\s*'([^']+)',\s*terrain:\s*'[^']+',\s*lonMin:\s*(-?[\d.]+),\s*lonMax:\s*(-?[\d.]+),\s*latMin:\s*(-?[\d.]+),\s*latMax:\s*(-?[\d.]+)/g;
  let match;
  while ((match = entryRegex.exec(zonesText)) !== null) {
    entries.push({
      resource: match[1],
      lonMin: parseFloat(match[2]),
      lonMax: parseFloat(match[3]),
      latMin: parseFloat(match[4]),
      latMax: parseFloat(match[5]),
    });
  }

  return entries;
}

describe('earth map RESOURCE_ZONES geo-coverage', () => {
  it('test 31: each new resource has at least one zone entry in the script', () => {
    const zones = parseResourceZonesFromScript();
    const newResources = ['gold', 'silver', 'furs', 'sheep', 'cattle', 'salt'];

    for (const resource of newResources) {
      const found = zones.some(z => z.resource === resource);
      expect(found, `${resource} has no RESOURCE_ZONES entry`).toBe(true);
    }
  });

  it('test 31b: key bounding boxes from spec are present in RESOURCE_ZONES', () => {
    const zones = parseResourceZonesFromScript();

    for (const expected of EXPECTED_NEW_ZONE_BOXES) {
      const found = zones.some(z =>
        z.resource === expected.resource &&
        z.lonMin === expected.lonMin &&
        z.lonMax === expected.lonMax &&
        z.latMin === expected.latMin &&
        z.latMax === expected.latMax,
      );
      expect(
        found,
        `Missing zone: ${expected.resource} [${expected.lonMin},${expected.lonMax}]x[${expected.latMin},${expected.latMax}]`,
      ).toBe(true);
    }
  });

  it('test 31c: stone fallback uses mountain, not hills', () => {
    const scriptPath = resolve(process.cwd(), 'scripts/generate-earth-maps.ts');
    const content = readFileSync(scriptPath, 'utf-8');
    // Should NOT contain the old hills fallback for stone
    expect(content).not.toContain("terrain === 'hills' && r < 0.08");
    // Should contain the new mountain fallback
    expect(content).toContain("terrain === 'mountain' && r < 0.15");
  });
});
