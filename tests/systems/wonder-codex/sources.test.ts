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

function assertCleanText(value: string): void {
  expect(value.trim().length).toBeGreaterThan(0);
  for (const token of FORBIDDEN_TEXT) {
    expect(value.toLowerCase()).not.toContain(token.toLowerCase());
  }
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

  it('has exactly two complete silent local video spike sources under the hard size threshold', () => {
    const sources = getWonderCodexVideoSources();
    expect(sources).toHaveLength(2);
    expect(new Set(sources.map(source => source.wonderId))).toEqual(new Set(['great_volcano', 'starvault-observatory']));

    for (const source of sources) {
      assertCleanText(source.id);
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
