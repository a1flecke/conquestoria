import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ERA_BASE, WAR_LAYER, ACCENT, STINGER, resolveEra, type EraId } from '../../src/audio/audio-catalog';
import { CIV_TO_AUDIO_FAMILY, MINOR_CIV_TO_AUDIO_FAMILY } from '../../src/audio/civ-audio-family';

const ERAS: EraId[] = [1, 2, 3, 4, 5];

const ALL_ENTRIES = [
  ...Object.values(ERA_BASE),
  ...Object.values(WAR_LAYER),
  ...Object.values(ACCENT),
  ...Object.values(STINGER.eraAdvance),
  ...Object.values(STINGER.eraTransitionCue),
  STINGER.cityFounded,
  STINGER.warDeclared,
];

describe('resolveEra (Er2)', () => {
  it('clamps > 5 to 5', () => {
    expect(resolveEra(6)).toBe(5);
    expect(resolveEra(100)).toBe(5);
  });
  it('clamps <= 0 to 1', () => {
    expect(resolveEra(0)).toBe(1);
    expect(resolveEra(-1)).toBe(1);
  });
  it('passes through 1–5 unchanged', () => {
    for (const e of ERAS) expect(resolveEra(e)).toBe(e);
  });
});

describe('catalog completeness', () => {
  it('every era has ERA_BASE, WAR_LAYER, STINGER.eraAdvance, STINGER.eraTransitionCue (UX-2)', () => {
    for (const e of ERAS) {
      expect(ERA_BASE[e], `ERA_BASE[${e}]`).toBeDefined();
      expect(WAR_LAYER[e], `WAR_LAYER[${e}]`).toBeDefined();
      expect(STINGER.eraAdvance[e], `STINGER.eraAdvance[${e}]`).toBeDefined();
      expect(STINGER.eraTransitionCue[e], `STINGER.eraTransitionCue[${e}]`).toBeDefined();
    }
  });

  it('STINGER.cityFounded and STINGER.warDeclared exist', () => {
    expect(STINGER.cityFounded).toBeDefined();
    expect(STINGER.warDeclared).toBeDefined();
  });

  it('every AudioFamily used by any civ has an ACCENT entry', () => {
    const usedFamilies = new Set([
      ...Object.values(CIV_TO_AUDIO_FAMILY),
      ...Object.values(MINOR_CIV_TO_AUDIO_FAMILY),
    ]);
    for (const family of usedFamilies) {
      expect(ACCENT[family], `ACCENT missing for family: ${family}`).toBeDefined();
    }
  });

  it('every TrackEntry has loop.loopStart >= 0 and loop.loopEnd > loopStart', () => {
    for (const entry of ALL_ENTRIES) {
      expect(entry.loop.loopStart, `${entry.id} loopStart`).toBeGreaterThanOrEqual(0);
      expect(entry.loop.loopEnd, `${entry.id} loopEnd > loopStart`).toBeGreaterThan(entry.loop.loopStart);
    }
  });

  it('no two entries share the same file path', () => {
    const paths = ALL_ENTRIES.map(e => e.file);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});

describe('on-disk OGG integrity', () => {
  // These tests pass after Task 4 (placeholder OGG generation).
  // They will FAIL if run before the ffmpeg step — that is expected and intentional.
  for (const entry of ALL_ENTRIES) {
    it(`${entry.id}: file exists at public/${entry.file} with OGG magic bytes`, () => {
      const diskPath = path.join('public', entry.file);
      expect(fs.existsSync(diskPath), `missing file: ${diskPath}`).toBe(true);
      const head = fs.readFileSync(diskPath).slice(0, 4);
      expect(head.toString('ascii')).toBe('OggS');
    });
  }
});
