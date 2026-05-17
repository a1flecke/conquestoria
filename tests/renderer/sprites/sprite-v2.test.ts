import { describe, it, expect } from 'vitest';

const FACTIONS = ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate'] as const;
type Faction = (typeof FACTIONS)[number];

const UNIT_IDS = [
  'settler', 'worker', 'scout',
  'scout_hound', 'war_hound', 'shadow_warden',
  'warrior', 'swordsman', 'pikeman',
  'archer', 'musketeer',
  'galley', 'trireme',
  'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker',
] as const;

const BUILDING_IDS = [
  'granary', 'herbalist', 'aqueduct',
  'workshop', 'forge', 'lumbermill', 'quarry-building',
  'library', 'archive', 'observatory',
  'marketplace', 'harbor',
  'barracks', 'walls', 'stable',
  'temple', 'monument', 'amphitheater', 'shrine', 'forum',
  'safehouse', 'intelligence-agency', 'security-bureau',
] as const;

async function loadSvg(id: string): Promise<Record<Faction, string>> {
  const mod = await import(`@/renderer/sprites/v2/${id}.svg.ts`);
  return mod.svg;
}

describe('v2 sprite SVG outputs', () => {
  describe('unit sprites', () => {
    for (const id of UNIT_IDS) {
      describe(id, () => {
        it('exports all six factions', async () => {
          const svgMap = await loadSvg(id);
          for (const faction of FACTIONS) {
            expect(svgMap[faction], `${id} / ${faction}`).toBeTruthy();
          }
        });

        it('each faction value contains v2 class hooks', async () => {
          const svgMap = await loadSvg(id);
          for (const faction of FACTIONS) {
            const html = svgMap[faction];
            expect(html, `${id}/${faction} should have cq-v2 wrapper`).toContain('cq-v2');
            expect(html, `${id}/${faction} should have cq-sprite-figure`).toContain('cq-sprite-figure');
            expect(html, `${id}/${faction} should have data-state`).toContain('data-state="idle"');
          }
        });

        it('factions produce distinct SVGs', async () => {
          const svgMap = await loadSvg(id);
          const values = FACTIONS.map(f => svgMap[f]);
          const unique = new Set(values);
          expect(unique.size, `${id} should have faction-distinct SVGs`).toBe(FACTIONS.length);
        });
      });
    }
  });

  describe('building sprites', () => {
    for (const id of BUILDING_IDS) {
      it(`${id}: exports all six factions with v2 wrapper`, async () => {
        const svgMap = await loadSvg(id);
        for (const faction of FACTIONS) {
          const html = svgMap[faction];
          expect(html, `${id}/${faction}`).toBeTruthy();
          expect(html, `${id}/${faction} cq-v2`).toContain('cq-v2');
        }
      });
    }
  });
});
