import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RELIGION_AUDIO_FILES,
  RELIGION_AUDIO_SOURCES,
} from '../../src/audio/religion-audio-sources';

const PROJECT_ROOT = resolve(__dirname, '../..');

function generatedHashes(root: string): Record<string, string> {
  const directories = [
    join(root, 'public/audio/stinger/religion'),
    join(root, 'public/audio/stinger/famine'),
  ];
  return Object.fromEntries(directories.flatMap(directory =>
    readdirSync(directory).sort().map(file => {
      const path = join(directory, file);
      return [
        path.slice(root.length + 1),
        createHash('sha256').update(readFileSync(path)).digest('hex'),
      ];
    }),
  ));
}

describe('religion/famine SFX generator', () => {
  it('records open-license provenance for every generated cue', () => {
    const coveredFiles = new Set(RELIGION_AUDIO_SOURCES.flatMap(source => source.localFiles));
    expect([...coveredFiles].sort()).toEqual([...RELIGION_AUDIO_FILES].sort());

    const openSources = RELIGION_AUDIO_SOURCES.filter(source =>
      source.license === 'CC0' || source.license === 'CC-BY',
    );
    expect(openSources.length).toBeGreaterThan(0);
    expect(RELIGION_AUDIO_SOURCES.some(source => (source.license as string) === 'CC-BY-NC')).toBe(false);
    expect(RELIGION_AUDIO_SOURCES.every(source => source.sourceUrl.length > 0)).toBe(true);
    expect(RELIGION_AUDIO_SOURCES.every(source => source.derivativeNotes.length > 0)).toBe(true);
  });

  it('ships exactly the declared religion/famine Ogg cues', () => {
    const checkedIn = generatedHashes(PROJECT_ROOT);
    expect(Object.keys(checkedIn).sort()).toEqual(RELIGION_AUDIO_FILES.map(file => `public/${file}`).sort());
    for (const outputPath of Object.keys(checkedIn)) {
      expect(readFileSync(join(PROJECT_ROOT, outputPath)).subarray(0, 4).toString('ascii')).toBe('OggS');
    }
  });
});
