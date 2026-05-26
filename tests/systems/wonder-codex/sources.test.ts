import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAllWonderCodexContent } from '@/systems/wonder-codex/content';
import {
  getFactSource,
  getImageSource,
  getWonderCodexFactSources,
  getWonderCodexImageSources,
} from '@/systems/wonder-codex/sources';

const FORBIDDEN_TEXT = ['TODO', 'TBD', 'lorem', 'placeholder', 'pending implementation'];

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
      expect(existsSync(path.join(process.cwd(), 'public', source.localPath))).toBe(true);
    }
  });

  it('keeps the human-readable source ledger in sync with source ids', () => {
    const ledger = readFileSync(
      path.join(process.cwd(), 'docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md'),
      'utf8',
    );
    for (const source of [...getWonderCodexFactSources(), ...getWonderCodexImageSources()]) {
      expect(ledger).toContain(source.id);
      expect(ledger).toContain(source.sourceUrl);
    }
  });

  it('keeps one completed ledger row per codex entry', () => {
    const ledger = readFileSync(
      path.join(process.cwd(), 'docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md'),
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
