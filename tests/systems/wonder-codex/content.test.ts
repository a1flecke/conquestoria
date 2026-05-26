import { describe, expect, it } from 'vitest';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import {
  getAllWonderCodexContent,
  getLegendaryWonderCodexContent,
  getNaturalWonderCodexContent,
} from '@/systems/wonder-codex/content';
import { getFactSource, getImageSource } from '@/systems/wonder-codex/sources';
import {
  CODEX_SECTION_KINDS,
  CODEX_STATUS_HOOKS,
  CODEX_TAGS,
  CODEX_VISUAL_TONES,
  type WonderCodexContent,
} from '@/systems/wonder-codex/types';
import { WONDER_DEFINITIONS } from '@/systems/wonder-definitions';

const FORBIDDEN_TEXT = ['TODO', 'TBD', 'lorem', 'placeholder', 'pending implementation'];

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertNoForbiddenText(entry: WonderCodexContent): void {
  const serialized = JSON.stringify(entry).toLowerCase();
  for (const token of FORBIDDEN_TEXT) {
    expect(serialized).not.toContain(token.toLowerCase());
  }
}

function assertNonEmptyText(value: string): void {
  expect(value.trim().length).toBeGreaterThan(0);
}

describe('wonder-codex content contracts', () => {
  it('covers exactly every natural wonder definition', () => {
    expect(sorted(getNaturalWonderCodexContent().map(entry => entry.id))).toEqual(
      sorted(WONDER_DEFINITIONS.map(definition => definition.id)),
    );
  });

  it('covers exactly every legendary wonder definition', () => {
    expect(sorted(getLegendaryWonderCodexContent().map(entry => entry.id))).toEqual(
      sorted(getLegendaryWonderDefinitions().map(definition => definition.id)),
    );
  });

  it('has no duplicate or unknown codex ids', () => {
    const entries = getAllWonderCodexContent();
    const ids = entries.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const knownIds = new Set([
      ...WONDER_DEFINITIONS.map(definition => definition.id),
      ...getLegendaryWonderDefinitions().map(definition => definition.id),
    ]);
    expect(ids.filter(id => !knownIds.has(id))).toEqual([]);
  });

  it('requires complete authored museum-label fields for every entry', () => {
    for (const entry of getAllWonderCodexContent()) {
      assertNonEmptyText(entry.title);
      assertNonEmptyText(entry.subtitle);
      assertNonEmptyText(entry.authoredLead);
      assertNonEmptyText(entry.learningText);
      expect(CODEX_VISUAL_TONES).toContain(entry.visualTone);
      expect(entry.tags.length).toBeGreaterThanOrEqual(3);
      for (const tag of entry.tags) expect(CODEX_TAGS).toContain(tag);
      expect(entry.relatedSeedTags.length).toBeGreaterThanOrEqual(2);
      for (const tag of entry.relatedSeedTags) expect(entry.tags).toContain(tag);
      expect(entry.sections.length).toBeGreaterThanOrEqual(2);
      for (const section of entry.sections) {
        expect(CODEX_SECTION_KINDS).toContain(section.kind);
        assertNonEmptyText(section.heading);
        assertNonEmptyText(section.body);
      }
      expect(entry.statusHooks.length).toBeGreaterThanOrEqual(2);
      for (const hook of entry.statusHooks) expect(CODEX_STATUS_HOOKS).toContain(hook);
      expect(entry.factSourceIds.length).toBeGreaterThanOrEqual(1);
      for (const sourceId of entry.factSourceIds) expect(getFactSource(sourceId)).toBeTruthy();
      expect(getImageSource(entry.imageSourceId)).toBeTruthy();
      assertNoForbiddenText(entry);
    }
  });

  it('requires kind-specific status hooks', () => {
    for (const entry of getNaturalWonderCodexContent()) {
      expect(entry.statusHooks).toContain('natural-effect');
      expect(entry.statusHooks).toContain('natural-location');
    }
    for (const entry of getLegendaryWonderCodexContent()) {
      expect(entry.statusHooks).toContain('legendary-status');
      expect(entry.statusHooks).toContain('legendary-reward');
      expect(entry.statusHooks).toContain('legendary-host-city');
      expect(entry.statusHooks).toContain('legendary-progress');
    }
  });
});
