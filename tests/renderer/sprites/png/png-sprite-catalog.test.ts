import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { listPngUnitManifests, getPngUnitManifest, isPngUnit } from '@/renderer/sprites/png/png-sprite-catalog';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import type { PngPuppetState } from '@/renderer/sprites/png/png-sprite-types';

const ROOT = resolve(__dirname, '../../../..');
const STATES: PngPuppetState[] = ['idle', 'walk', 'attack'];

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
    expect(m.cellWidth).toBeGreaterThan(0);
    expect(m.cellHeight).toBeGreaterThan(0);
    // every clip of every state and tier lies inside the sheet
    const clips = Object.values(m.clips).flatMap(tiers => [...tiers]);
    for (const c of clips) {
      expect(c.row, 'clip row').toBeLessThan(m.rows);
      expect(c.firstCol + c.frames, 'clip frames fit the sheet').toBeLessThanOrEqual(m.cols);
      expect(c.fps).toBeGreaterThan(0);
    }
    if (m.baseline === null) {
      // a puppet sheet: square cells, one looping row per state (steps(n, jump-none) is only valid for n >= 2)
      const rows = STATES.map(s => m.clips[s][0].row);
      expect(new Set(rows).size, 'each state owns its own row').toBe(STATES.length);
      expect(m.rows).toBe(STATES.length);
      expect(m.cellWidth).toBe(m.cellHeight);
      for (const s of STATES) {
        expect(m.clips[s][0].frames, `${s} frames`).toBeGreaterThanOrEqual(2);
        expect(m.clips[s][0].loop, `${s} loops`).toBe(true);
      }
    }
  });

  it.each(manifests.map(m => [m.id, m] as const))('%s: shipped sheet and mask exist and match the manifest grid', (_id, m) => {
    for (const which of ['sheet', 'mask'] as const) {
      const file = resolve(ROOT, 'public', m[which]);
      expect(existsSync(file), `${m[which]} is missing — re-run scripts/sprite-puppet/puppet.py`).toBe(true);
      expect(pngSize(file)).toEqual({ width: m.cols * m.cellWidth, height: m.rows * m.cellHeight });
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

/** The eight units that were `TODO(art)` placeholders before #621. */
const MILITARY_IDENTITY_UNITS = [
  'rifleman', 'ironclad', 'machine_gunner', 'pre_dreadnought', 'tank', 'submarine', 'observation_balloon', 'biplane',
] as const;

const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('military visual identity (#621)', () => {
  it.each(MILITARY_IDENTITY_UNITS.map(id => [id] as const))('%s ships as a painted PNG unit with its SVG fallback', id => {
    expect(isPngUnit(id)).toBe(true);
    expect(id in UNIT_SPRITE_CATALOG).toBe(true);
  });

  it('no two PNG units share a source image, sheet or tint mask (no duplicate art)', () => {
    const seen = new Map<string, string>();
    for (const m of listPngUnitManifests()) {
      const spec = JSON.parse(readFileSync(resolve(ROOT, 'scripts/sprite-puppet/rigs', `${m.id}.json`), 'utf8')) as { source: string };
      for (const [kind, file] of [
        ['source', resolve(ROOT, spec.source)],
        ['sheet', resolve(ROOT, 'public', m.sheet)],
        ['mask', resolve(ROOT, 'public', m.mask)],
      ] as const) {
        const key = `${kind}:${sha(file)}`;
        expect(seen.get(key), `${m.id} ${kind} is byte-identical to ${seen.get(key)}`).toBeUndefined();
        seen.set(key, m.id);
      }
    }
  });

  it.each(MILITARY_IDENTITY_UNITS.map(id => [id] as const))('%s: provenance names a generator, an asset id and what it cost', id => {
    const prov = JSON.parse(readFileSync(resolve(ROOT, 'design/png-sprites/sources', `${id}.provenance.json`), 'utf8')) as Record<string, unknown>;
    expect(typeof prov.generator).toBe('string');
    expect(prov.sprite_ai_generation_id ?? prov.spritecook_asset_id, 'generator asset id').toBeTruthy();
    expect(prov.tokens_used ?? prov.credits_used, 'cost').toBeGreaterThan(0);
    expect(String(prov.licence_note).length).toBeGreaterThan(40);
    expect(String(prov.prompt)).toMatch(/red/i); // the tint contract: faction cloth is saturated red
  });

  it.each(MILITARY_IDENTITY_UNITS.map(id => [id] as const))('%s: has a walk row and an attack row that differ from idle', id => {
    const m = getPngUnitManifest(id)!;
    expect(m.clips.walk[0].frames).toBeGreaterThanOrEqual(4);
    expect(m.clips.attack[0].frames).toBeGreaterThanOrEqual(4);
    expect(m.clips.idle[0].row).not.toBe(m.clips.attack[0].row);
  });
});
