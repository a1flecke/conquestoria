import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  COMPLETE_NATURAL_WONDER_AUDIO_IDS,
  FINAL_NATURAL_WONDER_AUDIO_COVERAGE,
  getCompleteNaturalWonderAudioEntry,
  getNaturalWonderAudioCatalog,
  MR2_NATURAL_WONDER_AUDIO_IDS,
} from '../../src/audio/natural-wonder-audio-catalog';
import { getNaturalWonderAudioSource } from '../../src/audio/natural-wonder-audio-sources';
import { WONDER_DEFINITIONS } from '../../src/systems/wonder-definitions';
import { getWonderSpectacleRecipe } from '../../src/systems/wonder-spectacle/presentation';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function publicAssetPath(file: string): string {
  return resolve(repoRoot, 'public', file);
}

describe('natural wonder audio catalog', () => {
  it('has exactly one catalog entry for every natural wonder definition', () => {
    const catalog = getNaturalWonderAudioCatalog();

    expect(catalog.map(entry => entry.wonderId).sort()).toEqual(
      WONDER_DEFINITIONS.map(definition => definition.id).sort(),
    );
  });

  it('keeps MR1 and MR2 wonders complete and all remaining wonders explicit pending entries', () => {
    const catalog = getNaturalWonderAudioCatalog();
    const completeIds = new Set<string>(COMPLETE_NATURAL_WONDER_AUDIO_IDS);

    expect(MR2_NATURAL_WONDER_AUDIO_IDS).toEqual([
      'sacred_mountain',
      'crystal_caverns',
      'aurora_fields',
    ]);

    for (const entry of catalog) {
      if (completeIds.has(entry.wonderId)) {
        expect(entry.status).toBe('complete');
      } else {
        expect(entry.status).toBe('pending');
      }
    }
    expect(FINAL_NATURAL_WONDER_AUDIO_COVERAGE).toBe(false);
  });

  it('aligns complete entry sound moods with spectacle recipes', () => {
    for (const wonderId of COMPLETE_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      const recipe = getWonderSpectacleRecipe(wonderId);

      expect(entry?.soundMood).toBe(recipe?.soundMood);
    }
  });

  it('references source metadata and existing OGG files for complete entries', () => {
    for (const wonderId of COMPLETE_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      expect(entry).not.toBeNull();
      if (!entry) throw new Error(`Missing complete audio entry for ${wonderId}`);

      for (const clip of [entry.stinger, entry.ambientLoop]) {
        const source = getNaturalWonderAudioSource(clip.sourceId);
        expect(source).toBeDefined();
        expect(source?.localFiles).toContain(clip.file);
        expect(existsSync(publicAssetPath(clip.file))).toBe(true);
        expect(readFileSync(publicAssetPath(clip.file)).subarray(0, 4).toString('utf8')).toBe('OggS');
      }
    }
  });

  it('keeps credits synchronized with source titles, credit text, and local output paths', () => {
    const credits = readFileSync(resolve(repoRoot, 'AUDIO-CREDITS.md'), 'utf8');

    for (const wonderId of COMPLETE_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      if (!entry) throw new Error(`Missing complete audio entry for ${wonderId}`);

      for (const clip of [entry.stinger, entry.ambientLoop]) {
        const source = getNaturalWonderAudioSource(clip.sourceId);
        expect(source).toBeDefined();
        expect(source?.title).not.toBe('');
        expect(source?.creator).toBe('Eric Matyas');
        expect(source?.site).toBe('Soundimage.org');
        expect(source?.sourceUrl).toContain('soundimage.org');
        expect(source?.license).toBe('Soundimage.org free use with attribution');
        expect(source?.creditText).toContain(source!.title);
        expect(source?.creditText).toContain('Eric Matyas');
        expect(source?.localFiles).toContain(clip.file);
        expect(credits).toContain(source!.creditText);
        expect(credits).toContain(source!.sourceUrl);
        expect(credits).toContain(clip.file);
      }
    }
  });
});
