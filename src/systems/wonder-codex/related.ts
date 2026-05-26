import { getAllWonderCodexContent, getWonderCodexContent } from '@/systems/wonder-codex/content';
import type { WonderCodexContent } from '@/systems/wonder-codex/types';

export interface RelatedWonderCodexEntry {
  id: string;
  title: string;
  kind: WonderCodexContent['kind'];
  sharedTags: string[];
}

export function getRelatedWonderCodexEntries(
  wonderId: string,
  visibleWonderIds: Set<string>,
  limit = 4,
): RelatedWonderCodexEntry[] {
  const source = getWonderCodexContent(wonderId);
  if (!source) return [];
  const seedTags = new Set(source.relatedSeedTags);

  return getAllWonderCodexContent()
    .filter(entry => entry.id !== wonderId && visibleWonderIds.has(entry.id))
    .map(entry => ({
      entry,
      sharedTags: entry.tags.filter(tag => seedTags.has(tag)),
    }))
    .filter(candidate => candidate.sharedTags.length > 0)
    .sort((a, b) =>
      b.sharedTags.length - a.sharedTags.length
      || a.entry.title.localeCompare(b.entry.title)
      || a.entry.id.localeCompare(b.entry.id),
    )
    .slice(0, limit)
    .map(candidate => ({
      id: candidate.entry.id,
      title: candidate.entry.title,
      kind: candidate.entry.kind,
      sharedTags: candidate.sharedTags,
    }));
}
