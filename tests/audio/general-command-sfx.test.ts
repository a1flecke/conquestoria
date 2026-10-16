import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERAL_COMMAND_AUDIO_FILES, GENERAL_COMMAND_AUDIO_SOURCES } from '../../src/audio/general-command-audio-sources';
import { GENERAL_COMMAND_SFX, allSfxEntries } from '../../src/audio/sfx-catalog';
import { readOggInfo } from './helpers/ogg-info';

// #889: the four Great General command cues.

const PROJECT_ROOT = resolve(__dirname, '../..');
const OUTPUT_DIR = 'public/audio/stinger/general';

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('Great General command cues (#889)', () => {
  it('has one cue per ability and one for the last command, each its own file', () => {
    expect(Object.keys(GENERAL_COMMAND_SFX).sort()).toEqual(['final-command', 'last-stand', 'rally', 'seize']);
    const files = Object.values(GENERAL_COMMAND_SFX).map(entry => entry.file);
    expect(new Set(files).size).toBe(files.length);
    for (const file of files) expect(file).toMatch(/^audio\/stinger\/general\//);
    // No cue aliases a unit's death or combat file: a General command must never sound like something dying.
    const others = allSfxEntries().filter(e => !files.includes(e.file)).map(e => e.file);
    for (const file of files) expect(others).not.toContain(file);
  });

  it('is preloaded with the rest of the SFX catalog (offline-ready without a precache edit)', () => {
    const catalogFiles = allSfxEntries().map(entry => entry.file);
    for (const entry of Object.values(GENERAL_COMMAND_SFX)) expect(catalogFiles).toContain(entry.file);
  });

  it('ships exactly the declared files, each a real, non-silent mono 44.1 kHz Ogg whose length matches its catalog entry', () => {
    const shipped = readdirSync(join(PROJECT_ROOT, OUTPUT_DIR)).map(file => `audio/stinger/general/${file}`).sort();
    expect(shipped).toEqual([...GENERAL_COMMAND_AUDIO_FILES].sort());
    for (const entry of Object.values(GENERAL_COMMAND_SFX)) {
      const path = join(PROJECT_ROOT, 'public', entry.file);
      expect(readFileSync(path).subarray(0, 4).toString('ascii')).toBe('OggS');
      const info = readOggInfo(path);
      expect(info, entry.file).not.toBeNull();
      expect(info!.sampleRate).toBe(44100);
      expect(info!.channels).toBe(1);
      expect(Math.abs(info!.durationSec - entry.loop.loopEnd), `${entry.file} duration vs loopEnd`).toBeLessThan(0.06);
      // A silent file would compress to almost nothing (about 1 kB/s); these tonal cues sit around 4-10 kB/s.
      expect(info!.bytesPerSecond, `${entry.file} looks silent`).toBeGreaterThan(3_000);
    }
  });

  it('the Final Command cue is the longest and weightiest: it is not an ordinary command cue', () => {
    const duration = (key: keyof typeof GENERAL_COMMAND_SFX) => GENERAL_COMMAND_SFX[key].loop.loopEnd;
    expect(duration('final-command')).toBeGreaterThan(Math.max(duration('rally'), duration('seize'), duration('last-stand')));
    // Short ordinary cues keep repeated commands from becoming tiring, and their identifying transient lands in the
    // first ~150 ms the mixer's one-shot cross-cut leaves audible.
    for (const key of ['rally', 'seize', 'last-stand'] as const) expect(duration(key)).toBeLessThanOrEqual(1.1);
  });

  it('records open-licence provenance for every cue and names only files that exist', () => {
    const covered = new Set(GENERAL_COMMAND_AUDIO_SOURCES.flatMap(source => source.localFiles));
    expect([...covered].sort()).toEqual([...GENERAL_COMMAND_AUDIO_FILES].sort());
    for (const source of GENERAL_COMMAND_AUDIO_SOURCES) {
      expect(['CC0', 'CC-BY', 'in-project']).toContain(source.license);
      expect(source.sourceUrl.length).toBeGreaterThan(0);
      expect(source.derivativeNotes.length).toBeGreaterThan(0);
      for (const file of source.sourceAssetFiles ?? []) expect(existsSync(join(PROJECT_ROOT, 'public', file)), file).toBe(true);
    }
    expect(readFileSync(join(PROJECT_ROOT, 'AUDIO-CREDITS.md'), 'utf8')).toContain('Great General Command Audio (#889)');
  });

  it.skipIf(process.env.RUN_GENERAL_COMMAND_SFX_DETERMINISM !== '1')(
    'reproduces byte-identical audio across two generations on one runner',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'conquestoria-general-command-sfx-'));
      const script = join(root, 'scripts/generate-general-command-sfx.sh');
      mkdirSync(dirname(script), { recursive: true });
      cpSync(join(PROJECT_ROOT, 'scripts/generate-general-command-sfx.sh'), script);
      for (const sourcePath of GENERAL_COMMAND_AUDIO_SOURCES.flatMap(source => source.sourceAssetFiles ?? [])) {
        const localPath = join(root, 'public', sourcePath);
        mkdirSync(dirname(localPath), { recursive: true });
        cpSync(join(PROJECT_ROOT, 'public', sourcePath), localPath);
      }
      const hashes = () => Object.fromEntries(readdirSync(join(root, OUTPUT_DIR)).sort().map(file => [file, sha(join(root, OUTPUT_DIR, file))]));
      execFileSync('bash', [script], { stdio: 'pipe' });
      const first = hashes();
      expect(Object.keys(first)).toHaveLength(GENERAL_COMMAND_AUDIO_FILES.length);
      execFileSync('bash', [script], { stdio: 'pipe' });
      expect(hashes()).toEqual(first);
    },
    90_000,
  );
});
