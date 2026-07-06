import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DESCRIPTIONS } from '@/systems/unit-system';

// Tripwire for MR12 (issue #471) — a curated denylist of phrases that named a
// nonexistent mechanic and were removed/rewritten in this MR. This is not a general
// NLP filter: it only guards the exact phrases known to have resurrected dead concepts.
// See .claude/rules/wonder-content.md-style "Adding New Content" checklists for the
// broader per-content-type honesty rules this test backstops.
const DENYLIST_PATTERNS: RegExp[] = [
  /enables air support/i,
  /decisive edge/i,
  /acts as strategic deterrent/i,
  /eliminates maintenance costs/i,
  /market manipulation/i,
  /2-hex protection bubble/i,
  /gunpowder units train faster/i,
  /units train with bonus strength/i,
  /early unit training costs reduced/i,
];

function collectStrings(): Array<{ source: string; text: string }> {
  const strings: Array<{ source: string; text: string }> = [];

  for (const tech of TECH_TREE) {
    for (const u of tech.unlocks) {
      strings.push({ source: `tech:${tech.id}.unlocks`, text: u });
    }
  }

  for (const building of Object.values(BUILDINGS)) {
    strings.push({ source: `building:${building.id}.description`, text: building.description });
  }

  for (const [unitType, text] of Object.entries(UNIT_DESCRIPTIONS)) {
    strings.push({ source: `unit:${unitType}`, text });
  }

  return strings;
}

describe('description honesty tripwire', () => {
  it('no tech.unlocks, Building.description, or UNIT_DESCRIPTIONS string names a removed dead mechanic', () => {
    const strings = collectStrings();
    const failures: string[] = [];

    for (const { source, text } of strings) {
      for (const pattern of DENYLIST_PATTERNS) {
        if (pattern.test(text)) {
          failures.push(`${source}: "${text}" matches denylisted pattern ${pattern}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
