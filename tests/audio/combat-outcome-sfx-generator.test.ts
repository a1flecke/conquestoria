import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMBAT_OUTCOME_AUDIO_FILES,
  COMBAT_OUTCOME_AUDIO_SOURCES,
} from '../../src/audio/combat-outcome-audio-sources';

const PROJECT_ROOT = resolve(__dirname, '../..');
const OUTPUT_DIR = 'public/audio/stinger/combat';

function generatedHashes(root: string): Record<string, string> {
  const directory = join(root, OUTPUT_DIR);
  return Object.fromEntries(readdirSync(directory).sort().map(file => {
    const path = join(directory, file);
    return [
      path.slice(root.length + 1),
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    ];
  }));
}

function createGeneratorSandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'conquestoria-combat-outcome-sfx-'));
  const script = join(root, 'scripts/generate-combat-outcome-sfx.sh');
  cpSync(join(PROJECT_ROOT, 'scripts/generate-combat-outcome-sfx.sh'), script, { recursive: true });
  for (const sourcePath of COMBAT_OUTCOME_AUDIO_SOURCES.flatMap(source => source.sourceAssetFiles ?? [])) {
    const localPath = join(root, 'public', sourcePath);
    mkdirSync(dirname(localPath), { recursive: true });
    cpSync(join(PROJECT_ROOT, 'public', sourcePath), localPath);
  }
  return root;
}

describe('combat-outcome SFX generator (#657)', () => {
  it('records open-license provenance for every generated pillage/capture cue', () => {
    const coveredFiles = new Set(COMBAT_OUTCOME_AUDIO_SOURCES.flatMap(source => source.localFiles));
    expect([...coveredFiles].sort()).toEqual([...COMBAT_OUTCOME_AUDIO_FILES].sort());

    const openSources = COMBAT_OUTCOME_AUDIO_SOURCES.filter(source =>
      source.license === 'CC0' || source.license === 'CC-BY',
    );
    expect(openSources.length).toBeGreaterThan(0);
    expect(COMBAT_OUTCOME_AUDIO_SOURCES.some(source => (source.license as string) === 'CC-BY-NC')).toBe(false);
    expect(COMBAT_OUTCOME_AUDIO_SOURCES.every(source => source.sourceUrl.length > 0)).toBe(true);
    expect(COMBAT_OUTCOME_AUDIO_SOURCES.every(source => source.derivativeNotes.length > 0)).toBe(true);
  });

  it('ships exactly the declared combat-outcome Ogg cues', () => {
    const checkedIn = generatedHashes(PROJECT_ROOT);
    expect(Object.keys(checkedIn).sort()).toEqual(COMBAT_OUTCOME_AUDIO_FILES.map(file => `public/${file}`).sort());
    for (const outputPath of Object.keys(checkedIn)) {
      expect(readFileSync(join(PROJECT_ROOT, outputPath)).subarray(0, 4).toString('ascii')).toBe('OggS');
    }
  });

  it.skipIf(process.env.RUN_COMBAT_OUTCOME_SFX_DETERMINISM !== '1')(
    'reproduces byte-identical audio across two generations on one runner',
    () => {
      const root = createGeneratorSandbox();
      const script = join(root, 'scripts/generate-combat-outcome-sfx.sh');
      execFileSync('bash', [script], { stdio: 'pipe' });
      const first = generatedHashes(root);
      expect(Object.keys(first).sort()).toEqual(COMBAT_OUTCOME_AUDIO_FILES.map(file => `public/${file}`).sort());
      for (const outputPath of Object.keys(first)) {
        expect(readFileSync(join(root, outputPath)).subarray(0, 4).toString('ascii')).toBe('OggS');
      }
      execFileSync('bash', [script], { stdio: 'pipe' });

      expect(generatedHashes(root)).toEqual(first);
    },
    90_000,
  );
});
