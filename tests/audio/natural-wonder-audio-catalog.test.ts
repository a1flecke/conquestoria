import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  FINAL_NATURAL_WONDER_AUDIO_COVERAGE,
  getCompleteNaturalWonderAudioEntry,
  getNaturalWonderAudioCatalog,
  MR1_NATURAL_WONDER_AUDIO_IDS,
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

  it('keeps MR1 wonders complete and all remaining wonders explicit pending entries', () => {
    const catalog = getNaturalWonderAudioCatalog();
    const mr1Ids = new Set<string>(MR1_NATURAL_WONDER_AUDIO_IDS);

    for (const entry of catalog) {
      if (mr1Ids.has(entry.wonderId)) {
        expect(entry.status).toBe('complete');
      } else {
        expect(entry.status).toBe('pending');
      }
    }
    expect(FINAL_NATURAL_WONDER_AUDIO_COVERAGE).toBe(false);
  });

  it('aligns complete entry sound moods with spectacle recipes', () => {
    for (const wonderId of MR1_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      const recipe = getWonderSpectacleRecipe(wonderId);

      expect(entry?.soundMood).toBe(recipe?.soundMood);
    }
  });

  it('references source metadata and existing OGG files for complete entries', () => {
    for (const wonderId of MR1_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      expect(entry).not.toBeNull();
      if (!entry) throw new Error(`Missing complete audio entry for ${wonderId}`);

      for (const clip of [entry.stinger, entry.ambientLoop]) {
        expect(getNaturalWonderAudioSource(clip.sourceId)).toBeDefined();
        expect(existsSync(publicAssetPath(clip.file))).toBe(true);
        expect(readFileSync(publicAssetPath(clip.file)).subarray(0, 4).toString('utf8')).toBe('OggS');
      }
    }
  });

  it('keeps credits synchronized with source titles and local output paths', () => {
    const credits = readFileSync(resolve(repoRoot, 'AUDIO-CREDITS.md'), 'utf8');

    for (const wonderId of MR1_NATURAL_WONDER_AUDIO_IDS) {
      const entry = getCompleteNaturalWonderAudioEntry(wonderId);
      if (!entry) throw new Error(`Missing complete audio entry for ${wonderId}`);

      for (const clip of [entry.stinger, entry.ambientLoop]) {
        const source = getNaturalWonderAudioSource(clip.sourceId);
        expect(source).toBeDefined();
        expect(credits).toContain(source!.title);
        expect(credits).toContain(source!.sourceUrl);
        expect(credits).toContain(clip.file);
      }
    }
  });
});
