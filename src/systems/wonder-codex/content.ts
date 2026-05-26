import { LEGENDARY_WONDER_CODEX_CONTENT } from '@/systems/wonder-codex/legendary-content';
import { NATURAL_WONDER_CODEX_CONTENT } from '@/systems/wonder-codex/natural-content';
import type { WonderCodexContent } from '@/systems/wonder-codex/types';

function cloneEntry(entry: WonderCodexContent): WonderCodexContent {
  return {
    ...entry,
    tags: [...entry.tags],
    relatedSeedTags: [...entry.relatedSeedTags],
    statusHooks: [...entry.statusHooks],
    factSourceIds: [...entry.factSourceIds],
    sections: entry.sections.map(section => ({ ...section })),
  };
}

export function getNaturalWonderCodexContent(): WonderCodexContent[] {
  return NATURAL_WONDER_CODEX_CONTENT.map(cloneEntry);
}

export function getLegendaryWonderCodexContent(): WonderCodexContent[] {
  return LEGENDARY_WONDER_CODEX_CONTENT.map(cloneEntry);
}

export function getAllWonderCodexContent(): WonderCodexContent[] {
  return [...getNaturalWonderCodexContent(), ...getLegendaryWonderCodexContent()];
}

export function getWonderCodexContent(wonderId: string): WonderCodexContent | undefined {
  const entry = [...NATURAL_WONDER_CODEX_CONTENT, ...LEGENDARY_WONDER_CODEX_CONTENT]
    .find(candidate => candidate.id === wonderId);
  return entry ? cloneEntry(entry) : undefined;
}
