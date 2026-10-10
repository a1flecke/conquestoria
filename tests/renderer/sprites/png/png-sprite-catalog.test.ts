import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listPngUnitManifests, getPngUnitManifest, isPngUnit } from '@/renderer/sprites/png/png-sprite-catalog';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import type { PngSpriteState } from '@/renderer/sprites/png/png-sprite-types';

const ROOT = resolve(__dirname, '../../../..');
const STATES: PngSpriteState[] = ['idle', 'walk', 'attack'];

/** Width/height from a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii'), `${path} is not a PNG`).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('PNG unit sprite catalog (#1040 spike)', () => {
  const manifests = listPngUnitManifests();

  it('has at least the Horseman', () => {
    expect(isPngUnit('horseman')).toBe(true);
    expect(getPngUnitManifest('horseman')?.id).toBe('horseman');
    expect(isPngUnit('beast_handler')).toBe(false);
    expect(getPngUnitManifest('beast_handler')).toBeNull();
  });

  it.each(manifests.map(m => [m.id, m] as const))('%s: manifest is internally consistent', (_id, m) => {
    expect(m.frameSize).toBeGreaterThan(0);
    const rows = STATES.map(s => m.states[s].row);
    expect(new Set(rows).size, 'each state owns its own row').toBe(STATES.length);
    expect(Math.max(...rows)).toBeLessThan(m.rows);
    expect(m.rows).toBe(STATES.length);
    for (const s of STATES) {
      const e = m.states[s];
      // steps(n, jump-none) is only valid for n >= 2
      expect(e.frames, `${s} frames`).toBeGreaterThanOrEqual(2);
      expect(e.frames, `${s} frames fit the sheet`).toBeLessThanOrEqual(m.cols);
      expect(e.fps).toBeGreaterThan(0);
    }
  });

  it.each(manifests.map(m => [m.id, m] as const))('%s: shipped sheet and mask exist and match the manifest grid', (_id, m) => {
    for (const which of ['sheet', 'mask'] as const) {
      const file = resolve(ROOT, 'public', m[which]);
      expect(existsSync(file), `${m[which]} is missing — re-run scripts/sprite-puppet/puppet.py`).toBe(true);
      expect(pngSize(file)).toEqual({ width: m.cols * m.frameSize, height: m.rows * m.frameSize });
    }
  });

  it.each(manifests.map(m => [m.id, m] as const))('%s: stays regenerable and keeps its SVG fallback', (_id, m) => {
    // the rig spec and the provenance record are what make the sheet reproducible and its licence auditable
    const rig = resolve(ROOT, 'scripts/sprite-puppet/rigs', `${m.id}.json`);
    expect(existsSync(rig), 'rig spec').toBe(true);
    const spec = JSON.parse(readFileSync(rig, 'utf8')) as { id: string; source: string };
    expect(spec.id).toBe(m.id);
    expect(existsSync(resolve(ROOT, spec.source)), 'source png').toBe(true);
    expect(existsSync(resolve(ROOT, spec.source.replace(/\.png$/, '.provenance.json'))), 'provenance').toBe(true);
    // migration safety: the SVG sprite stays in the catalog so removing a PNG row (or a failed canvas bake) falls back cleanly
    expect(m.id in UNIT_SPRITE_CATALOG, `${m.id} must keep its SVG sprite while the PNG is migrating in`).toBe(true);
  });
});
