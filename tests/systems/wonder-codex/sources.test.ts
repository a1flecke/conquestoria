import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllWonderCodexContent } from '@/systems/wonder-codex/content';
import {
  getFactSource,
  getImageSource,
  getWonderCodexFactSources,
  getWonderCodexImageSources,
} from '@/systems/wonder-codex/sources';
import {
  HARD_VIDEO_ASSET_REVIEW_BYTES,
  getWonderCodexVideoSources,
} from '@/systems/wonder-codex/video-sources';

const FORBIDDEN_TEXT = ['TODO', 'TBD', 'lorem', 'placeholder', 'pending implementation'];
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const STAGE_3_SPIKE_WONDERS = new Set(['great_volcano', 'starvault-observatory']);
const STAGE_3B_NATURAL_VIDEO_WONDERS = new Set(['sacred_mountain', 'coral_reef', 'grand_canyon']);
const STAGE_3B_LEGENDARY_VIDEO_WONDERS = new Set(['oracle-of-delphi', 'grand-canal', 'moonwell-gardens']);
const STAGE_3B_HARD_BATCH_BYTES = 18 * 1024 * 1024;
const STAGE_3C_NATURAL_VIDEO_WONDERS = new Set(['ancient_forest', 'bioluminescent_bay', 'singing_sands']);
const STAGE_3C_LEGENDARY_VIDEO_WONDERS = new Set(['world-archive', 'ironroot-foundry', 'sun-spire']);
const STAGE_3C_HARD_BATCH_BYTES = 18 * 1024 * 1024;

function assertCleanText(value: string): void {
  expect(value.trim().length).toBeGreaterThan(0);
  for (const token of FORBIDDEN_TEXT) {
    expect(value.toLowerCase()).not.toContain(token.toLowerCase());
  }
}

function readLocalAsset(localPath: string): Buffer {
  return readFileSync(resolve(repoRoot, 'public', localPath.replace(/^\/+/, '')));
}

describe('wonder-codex sources', () => {
  it('resolves every content fact and image source', () => {
    for (const entry of getAllWonderCodexContent()) {
      for (const sourceId of entry.factSourceIds) expect(getFactSource(sourceId)).toBeTruthy();
      expect(getImageSource(entry.imageSourceId)).toBeTruthy();
    }
  });

  it('has complete source metadata and existing local image files', () => {
    for (const source of getWonderCodexFactSources()) {
      assertCleanText(source.id);
      assertCleanText(source.title);
      assertCleanText(source.publisher);
      assertCleanText(source.sourceUrl);
      expect(source.sourceUrl).toMatch(/^https:\/\//);
    }

    for (const source of getWonderCodexImageSources()) {
      assertCleanText(source.id);
      assertCleanText(source.title);
      assertCleanText(source.sourceUrl);
      assertCleanText(source.creator);
      assertCleanText(source.license);
      assertCleanText(source.attribution);
      assertCleanText(source.localPath);
      expect(source.localPath).toMatch(/^\/images\/wonders\/codex\/.+\.(webp|jpg|jpeg|png)$/);
      expect(existsSync(resolve(repoRoot, 'public', source.localPath.replace(/^\/+/, '')))).toBe(true);
    }
  });

  it('has complete silent local video sources under the hard size threshold', () => {
    const sources = getWonderCodexVideoSources();
    expect(sources).toHaveLength(14);

    const stage3Spike = sources.filter(source => source.batchId === 'stage-3-spike');
    expect(new Set(stage3Spike.map(source => source.wonderId))).toEqual(STAGE_3_SPIKE_WONDERS);

    const stage3b = sources.filter(source => source.batchId === 'stage-3b-batch-2');
    expect(stage3b).toHaveLength(6);
    expect(new Set(stage3b.filter(source => source.surfaces.includes('natural-reveal')).map(source => source.wonderId)))
      .toEqual(STAGE_3B_NATURAL_VIDEO_WONDERS);
    expect(new Set(stage3b.filter(source => source.surfaces.includes('legendary-completion')).map(source => source.wonderId)))
      .toEqual(STAGE_3B_LEGENDARY_VIDEO_WONDERS);
    expect(stage3b.reduce((total, source) => total + source.sizeBytes, 0)).toBeLessThanOrEqual(STAGE_3B_HARD_BATCH_BYTES);

    const stage3c = sources.filter(source => source.batchId === 'stage-3c-batch-3');
    expect(stage3c).toHaveLength(6);
    expect(new Set(stage3c.filter(source => source.surfaces.includes('natural-reveal')).map(source => source.wonderId)))
      .toEqual(STAGE_3C_NATURAL_VIDEO_WONDERS);
    expect(new Set(stage3c.filter(source => source.surfaces.includes('legendary-completion')).map(source => source.wonderId)))
      .toEqual(STAGE_3C_LEGENDARY_VIDEO_WONDERS);
    expect(stage3c.reduce((total, source) => total + source.sizeBytes, 0)).toBeLessThanOrEqual(STAGE_3C_HARD_BATCH_BYTES);

    for (const source of sources) {
      assertCleanText(source.id);
      assertCleanText(source.batchId);
      assertCleanText(source.wonderId);
      assertCleanText(source.title);
      assertCleanText(source.sourceUrl);
      assertCleanText(source.creator);
      assertCleanText(source.license);
      assertCleanText(source.attribution);
      assertCleanText(source.localPath);
      assertCleanText(source.mimeType);
      assertCleanText(source.format);
      assertCleanText(source.loopNote);
      expect(source.localPath).toMatch(/^\/videos\/wonders\/.+\.mp4$/);
      expect(source.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(source.audio).toBe('silent');
      expect(source.durationSeconds).toBeGreaterThanOrEqual(3);
      expect(source.durationSeconds).toBeLessThanOrEqual(5);
      expect(source.sizeBytes).toBeGreaterThan(0);
      expect(source.sizeBytes).toBeLessThanOrEqual(HARD_VIDEO_ASSET_REVIEW_BYTES);
      expect(source.mimeType).toBe('video/mp4');
      expect(source.fallbackImageSourceId).toMatch(/^image-/);
      expect(getImageSource(source.fallbackImageSourceId)).toBeTruthy();
      expect(existsSync(resolve(repoRoot, 'public', source.localPath.replace(/^\/+/, '')))).toBe(true);
      expect(source.sizeBytes).toBe(readLocalAsset(source.localPath).byteLength);
    }
  });

  it('keeps shipped video assets video-only even when source clips contained audio', () => {
    for (const source of getWonderCodexVideoSources()) {
      const asset = readLocalAsset(source.localPath);
      expect(asset.includes(Buffer.from('vide'))).toBe(true);
      expect(asset.includes(Buffer.from('soun'))).toBe(false);
    }
  });

  it('keeps video batch ids as audit metadata only', () => {
    for (const source of getWonderCodexVideoSources()) {
      expect(source.batchId).toMatch(/^stage-3/);
      expect(source.sfxCueId).toBeUndefined();
    }
  });

  it('keeps the human-readable source ledger in sync with source ids', () => {
    const ledger = readFileSync(
      resolve(repoRoot, 'docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md'),
      'utf8',
    );
    for (const source of [...getWonderCodexFactSources(), ...getWonderCodexImageSources()]) {
      expect(ledger).toContain(source.id);
      expect(ledger).toContain(source.sourceUrl);
    }
    for (const source of getWonderCodexVideoSources()) {
      expect(ledger).toContain(source.id);
      expect(ledger).toContain(source.sourceUrl);
      expect(ledger).toContain(source.localPath);
      expect(ledger).toContain(source.attribution);
    }
  });

  it('keeps one completed ledger row per codex entry', () => {
    const ledger = readFileSync(
      resolve(repoRoot, 'docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md'),
      'utf8',
    );
    for (const entry of getAllWonderCodexContent()) {
      const imageSource = getImageSource(entry.imageSourceId);
      const factSourceCell = entry.factSourceIds.map(sourceId => `\`${sourceId}\``).join(', ');
      expect(imageSource).toBeTruthy();
      expect(ledger).toContain(`| \`${entry.id}\` |`);
      expect(ledger).toContain(`| \`${entry.id}\` | ${factSourceCell} | \`${entry.imageSourceId}\` |`);
      expect(ledger).toContain(imageSource!.localPath);
      expect(ledger).toContain(imageSource!.attribution);
    }
  });
});
