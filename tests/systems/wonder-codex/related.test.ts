import { describe, expect, it } from 'vitest';
import { getAllWonderCodexContent } from '@/systems/wonder-codex/content';
import { getRelatedWonderCodexEntries } from '@/systems/wonder-codex/related';

describe('wonder-codex related links', () => {
  it('derives related entries only from visible compatible entries', () => {
    const visible = new Set(['great_volcano', 'sacred_mountain', 'oracle-of-delphi']);

    const related = getRelatedWonderCodexEntries('great_volcano', visible);

    expect(related.map(entry => entry.id)).toContain('sacred_mountain');
    expect(related.map(entry => entry.id)).not.toContain('oracle-of-delphi');
    expect(related.map(entry => entry.id)).not.toContain('great_volcano');
  });

  it('does not expose hidden entries through related links', () => {
    const visible = new Set(['great_volcano']);

    expect(getRelatedWonderCodexEntries('great_volcano', visible)).toEqual([]);
  });

  it('uses declared seed tags that belong to the entry tag set', () => {
    for (const entry of getAllWonderCodexContent()) {
      for (const seedTag of entry.relatedSeedTags) {
        expect(entry.tags).toContain(seedTag);
      }
    }
  });
});
