import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PIRATE_AUDIO_FILES,
  PIRATE_AUDIO_SOURCES,
} from '../../src/audio/pirate-audio-sources';

const PROJECT_ROOT = resolve(__dirname, '../..');

function generatedHashes(root: string): Record<string, string> {
  const directories = [
    join(root, 'public/audio/sfx/pirates'),
    join(root, 'public/audio/stinger/pirates'),
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

describe('pirate SFX generator', () => {
  it('records open-license provenance for every generated pirate cue', () => {
    const coveredFiles = new Set(PIRATE_AUDIO_SOURCES.flatMap(source => source.localFiles));
    expect([...coveredFiles].sort()).toEqual([...PIRATE_AUDIO_FILES].sort());

    const openSources = PIRATE_AUDIO_SOURCES.filter(source =>
      source.license === 'CC0' || source.license === 'CC-BY',
    );
    expect(openSources.length).toBeGreaterThan(0);
    expect(PIRATE_AUDIO_SOURCES.some(source => (source.license as string) === 'CC-BY-NC')).toBe(false);
    expect(PIRATE_AUDIO_SOURCES.every(source => source.sourceUrl.length > 0)).toBe(true);
    expect(PIRATE_AUDIO_SOURCES.every(source => source.derivativeNotes.length > 0)).toBe(true);
  });

  it('reproduces byte-identical audio from the same checked-in script', () => {
    const root = mkdtempSync(join(tmpdir(), 'conquestoria-pirate-sfx-'));
    const script = join(root, 'scripts/generate-pirate-sfx.sh');
    cpSync(join(PROJECT_ROOT, 'scripts/generate-pirate-sfx.sh'), script, { recursive: true });
    for (const sourcePath of PIRATE_AUDIO_SOURCES.flatMap(source => source.sourceAssetFiles ?? [])) {
      const localPath = join(root, 'public', sourcePath);
      mkdirSync(dirname(localPath), { recursive: true });
      cpSync(join(PROJECT_ROOT, 'public', sourcePath), localPath);
    }

    execFileSync('bash', [script], { stdio: 'pipe' });
    const first = generatedHashes(root);
    execFileSync('bash', [script], { stdio: 'pipe' });

    expect(generatedHashes(root)).toEqual(first);
    expect(first).toEqual(generatedHashes(PROJECT_ROOT));
    expect(Object.keys(first)).toHaveLength(33);
  }, 20_000);
});
