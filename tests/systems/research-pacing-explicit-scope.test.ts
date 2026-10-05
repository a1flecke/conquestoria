import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Tech } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  getMetadataComplexityMultiplier,
  getRecommendedTechCost,
  resolveTechPacingBand,
  resolveTechPacingMetadata,
} from '@/systems/research-pacing-model';
import { getAuthoredTechPacingScope, TECH_PACING_SCOPE_BY_GROUP } from '@/systems/tech-pacing-scope';

// #1319: research pacing scope is authored structural data. Player-facing text (name, unlock copy) must never be an
// input to a tech's pacing band, scope, complexity multiplier or recommended cost.

const FIXTURE = join(process.cwd(), 'tests/fixtures/research-pacing-characterization.json');

interface Row { id: string; band: string; scope: string; multiplier: number; recommendedCost: number }

function characterize(techs: readonly Tech[]): Row[] {
  return techs.map(tech => ({
    id: tech.id,
    band: resolveTechPacingBand(tech),
    scope: resolveTechPacingMetadata(tech).scope,
    multiplier: getMetadataComplexityMultiplier(resolveTechPacingMetadata(tech)),
    recommendedCost: getRecommendedTechCost(tech),
  }));
}

describe('research pacing characterization (#1319)', () => {
  it('matches the recorded per-tech band, scope, multiplier and recommended cost for every authored tech', () => {
    const rows = characterize(TECH_TREE);
    if (process.env.UPDATE_PACING_CHARACTERIZATION === '1') writeFileSync(FIXTURE, `${JSON.stringify(rows, null, 1)}\n`);
    const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Row[];
    expect(rows.length).toBe(TECH_TREE.length);
    expect(rows).toEqual(recorded);
  });
});

describe('explicit research pacing scope (#1319)', () => {
  const untagged = TECH_TREE.filter(tech => !tech.pacing);

  it('resolves an explicit scope for every authored tech, with no default', () => {
    for (const tech of TECH_TREE) {
      expect(() => resolveTechPacingMetadata(tech), tech.id).not.toThrow();
    }
    expect(untagged.filter(tech => getAuthoredTechPacingScope(tech.id) === undefined).map(t => t.id)).toEqual([]);
  });

  it('lists each tech at most once and only techs that exist and have no pacing block of their own', () => {
    const all = Object.values(TECH_PACING_SCOPE_BY_GROUP).flat();
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
    const known = new Map(TECH_TREE.map(tech => [tech.id, tech]));
    expect(all.filter(id => !known.has(id))).toEqual([]);
    expect(all.filter(id => known.get(id)?.pacing !== undefined)).toEqual([]);
  });

  it('fails loudly for a tech with neither a pacing block nor an authored scope', () => {
    const stray: Tech = { ...TECH_TREE[0]!, id: 'not-an-authored-tech', pacing: undefined };
    expect(() => resolveTechPacingMetadata(stray)).toThrow(/no authored scope/);
  });

  it('player-facing text cannot move scope, band, multiplier or recommended cost', () => {
    const wordings = [
      [],
      ['A new unit and a new building: community, unity, opportunity, library, monument, warrior, swordsman'],
      ['Completely unrelated wording'],
    ];
    for (const tech of untagged) {
      const baseline = characterize([tech])[0]!;
      for (const unlocks of wordings) {
        expect(characterize([{ ...tech, unlocks }])[0], `${tech.id} with ${JSON.stringify(unlocks)}`).toEqual(baseline);
      }
      expect(characterize([{ ...tech, name: 'Community Building Unit' }])[0]).toEqual(baseline);
    }
  });

  it('keeps the substring trap pinned: "community" no longer reads as military', () => {
    const sailing = TECH_TREE.find(t => t.id === 'sailing')!;
    const before = resolveTechPacingMetadata(sailing).scope;
    expect(resolveTechPacingMetadata({ ...sailing, unlocks: ['Strengthens the community'] }).scope).toBe(before);
    const empireTech = untagged.find(t => resolveTechPacingMetadata(t).scope === 'empire')!;
    expect(resolveTechPacingMetadata({ ...empireTech, unlocks: ['Community support for every unit'] }).scope).toBe('empire');
  });
});
