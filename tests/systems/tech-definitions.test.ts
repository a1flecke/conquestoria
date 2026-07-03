import { describe, it, expect } from 'vitest';
import { TECH_TREE, getEraAdvancementTechs, resolveCivilizationEra } from '@/systems/tech-definitions';
import {
  estimateTurnsToComplete,
  getResearchOutputProfileForTech,
  isFirstRealUnlockTech,
  isStarterPrerequisiteTech,
} from '@/systems/pacing-model';

describe('tech definitions', () => {
  it('has exactly 368 techs after removing cyber-warfare stub and adding era-12', () => {
    expect(TECH_TREE.length).toBe(368);
  });

  it('keeps 15 tracks while expanding to era 12 (2 new techs per track per era)', () => {
    const tracks = new Map<string, number>();
    for (const tech of TECH_TREE) {
      tracks.set(tech.track, (tracks.get(tech.track) ?? 0) + 1);
    }
    expect(tracks.size).toBe(15);
    for (const [track, count] of tracks) {
      // Era 5-12 each add 2 techs per track.
      // cyber-warfare stub removed: espionage had 8 era1-4 + 1 stub + 16 (era5-12) = 25.
      // Economy/science/communication/maritime/exploration had 9 (era1-4) + 16 = 25.
      // Military gets +2 from balloon-corps (era 7) + air-superiority (era 9) → 26.
      // Other 8 tracks had 8 era1-4 + 16 = 24.
      const expected = track === 'military'
        ? 26
        : ['economy', 'science', 'communication', 'maritime', 'exploration', 'espionage'].includes(track)
          ? 25
          : 24;
      expect(count, `track ${track} should have ${expected} techs`).toBe(expected);
    }
  });

  it('keeps the 2-tech era rhythm through era 4, except exploration-era3 which has bridge-building as a 3rd', () => {
    const trackEra = new Map<string, number>();
    for (const tech of TECH_TREE) {
      const key = `${tech.track}-${tech.era}`;
      trackEra.set(key, (trackEra.get(key) ?? 0) + 1);
    }
    const tracks = [...new Set(TECH_TREE.map(t => t.track))];
    for (const track of tracks) {
      for (let era = 1; era <= 4; era++) {
        const key = `${track}-${era}`;
        const expected = (track === 'exploration' && era === 3) ? 3 : 2;
        expect(trackEra.get(key), `${key} should have ${expected} techs`).toBe(expected);
      }
    }
    // Era 5: each track has 2 new techs; stubs add 1 extra to economy/science/communication/maritime
    // and 1 extra to espionage (digital-surveillance stub only — cyber-warfare moved to era 12)
    expect(trackEra.get('espionage-5'), 'espionage-5 should have 3 techs (1 stub + 2 new)').toBe(3);
    expect(trackEra.get('economy-5'), 'economy-5 should have 3 techs (1 stub + 2 new)').toBe(3);
    expect(trackEra.get('science-5'), 'science-5 should have 3 techs (1 stub + 2 new)').toBe(3);
    expect(trackEra.get('communication-5'), 'communication-5 should have 3 techs (1 stub + 2 new)').toBe(3);
    expect(trackEra.get('maritime-5'), 'maritime-5 should have 3 techs (1 stub + 2 new)').toBe(3);
    // All other tracks have exactly 2 era-5 techs each
    for (const track of ['military', 'civics', 'exploration', 'agriculture', 'medicine', 'philosophy', 'arts', 'metallurgy', 'construction', 'spirituality']) {
      expect(trackEra.get(`${track}-5`), `${track}-5 should have 2 techs`).toBe(2);
    }
  });

  it('all prerequisites reference existing tech IDs', () => {
    const ids = new Set(TECH_TREE.map(t => t.id));
    for (const tech of TECH_TREE) {
      for (const prereq of tech.prerequisites) {
        expect(ids.has(prereq), `${tech.id} prereq '${prereq}' not found`).toBe(true);
      }
    }
  });

  it('has no duplicate IDs', () => {
    const ids = TECH_TREE.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no circular dependencies', () => {
    const techMap = new Map(TECH_TREE.map(t => [t.id, t]));
    function hasCycle(id: string, visited: Set<string>, stack: Set<string>): boolean {
      visited.add(id);
      stack.add(id);
      const tech = techMap.get(id);
      if (!tech) return false;
      for (const prereq of tech.prerequisites) {
        if (!visited.has(prereq)) {
          if (hasCycle(prereq, visited, stack)) return true;
        } else if (stack.has(prereq)) {
          return true;
        }
      }
      stack.delete(id);
      return false;
    }
    const visited = new Set<string>();
    const stack = new Set<string>();
    for (const tech of TECH_TREE) {
      if (!visited.has(tech.id)) {
        expect(hasCycle(tech.id, visited, stack), `cycle detected involving ${tech.id}`).toBe(false);
      }
    }
  });

  it('cross-track prerequisites exist (spot checks)', () => {
    const techMap = new Map(TECH_TREE.map(t => [t.id, t]));
    // Agriculture: Crop Rotation requires Irrigation (economy)
    const cropRotation = techMap.get('crop-rotation');
    expect(cropRotation).toBeDefined();
    expect(cropRotation!.prerequisites).toContain('irrigation');
    // Maritime: Galleys requires Sailing (exploration)
    const galleys = techMap.get('galleys');
    expect(galleys).toBeDefined();
    expect(galleys!.prerequisites).toContain('sailing');
    // Metallurgy: Bronze Casting requires Bronze Working (military)
    const bronzeCasting = techMap.get('bronze-casting');
    expect(bronzeCasting).toBeDefined();
    expect(bronzeCasting!.prerequisites).toContain('bronze-working');
  });

  it('digital-surveillance is in espionage track; cyber-warfare moved to era-12 military', () => {
    const espionageIds = TECH_TREE.filter(t => t.track === 'espionage').map(t => t.id);
    expect(espionageIds).toContain('digital-surveillance');
    expect(espionageIds).not.toContain('cyber-warfare');
    const militaryIds = TECH_TREE.filter(t => t.track === 'military').map(t => t.id);
    expect(militaryIds).toContain('cyber-warfare');
  });

  it('contains the late-era tech prerequisites for the remaining M4 wonder scaffolding', () => {
    expect(TECH_TREE.find(t => t.id === 'mass-media')).toBeDefined();
    expect(TECH_TREE.find(t => t.id === 'global-logistics')).toBeDefined();
    expect(TECH_TREE.find(t => t.id === 'nuclear-theory')).toBeDefined();
  });

  it('era-5 advancement includes digital-surveillance stub and all 30 new era-5 techs', () => {
    const ids = getEraAdvancementTechs(5).map(tech => tech.id);
    // Only digital-surveillance remains as era-5 espionage stub
    expect(ids).toContain('digital-surveillance');
    // cyber-warfare is now era 12 — must NOT appear in era-5 advancement
    expect(ids).not.toContain('cyber-warfare');
    // 4 stubs have countsForEraAdvancement: false and should be absent
    expect(ids).not.toContain('global-logistics');
    expect(ids).not.toContain('nuclear-theory');
    expect(ids).not.toContain('mass-media');
    expect(ids).not.toContain('amphibious-warfare');
    // 31 techs: 30 new era-5 techs + 1 espionage stub (digital-surveillance)
    expect(ids.length).toBe(31);
  });

  it('resolves civilization era through contiguous 60-percent thresholds', () => {
    const era2 = getEraAdvancementTechs(2);
    const era3 = getEraAdvancementTechs(3);
    const era2Needed = Math.ceil(era2.length * 0.6);
    const era3Needed = Math.ceil(era3.length * 0.6);
    const era3Only = era3.slice(0, era3Needed).map(tech => tech.id);

    expect(resolveCivilizationEra(era3Only)).toBe(1);
    expect(resolveCivilizationEra([
      ...era2.slice(0, era2Needed).map(tech => tech.id),
      ...era3Only,
    ])).toBe(3);
  });

  it('stays below an era threshold and ignores non-advancement technologies', () => {
    const era2 = getEraAdvancementTechs(2);
    const belowThreshold = Math.ceil(era2.length * 0.6) - 1;

    expect(resolveCivilizationEra([
      ...era2.slice(0, belowThreshold).map(tech => tech.id),
      'mass-media',
      'global-logistics',
      'nuclear-theory',
    ])).toBe(1);
  });

  it('has no orphan late-era nodes', () => {
    const lateEra = TECH_TREE.filter(t => t.era >= 5);
    expect(lateEra.every(t => t.prerequisites.length > 0)).toBe(true);
  });
});

describe('opening research pacing data', () => {
  it('keeps starter prerequisites inside the 2-5 turn baseline window', () => {
    const starters = TECH_TREE.filter(tech => isStarterPrerequisiteTech(tech));
    expect(starters.map(tech => tech.id)).toEqual(expect.arrayContaining([
      'stone-weapons',
      'gathering',
      'fire',
      'tribal-council',
      'pathfinding',
      'foraging',
      'herbalism',
      'oral-tradition',
      'cave-painting',
      'rafts',
      'copper-working',
      'mud-brick',
      'drums',
      'animism',
    ]));
    expect(starters.map(tech => tech.id)).not.toContain('espionage-scouting');

    const outliers = starters
      .map(tech => `${tech.id}:${estimateTurnsToComplete({ cost: tech.cost, outputPerTurn: 1 })}`)
      .filter(entry => {
        const turns = Number(entry.split(':')[1]);
        return turns < 2 || turns > 5;
      });

    expect(outliers).toEqual([]);
  });

  it('keeps structural first real unlocks inside the 8-12 turn baseline window', () => {
    const firstUnlocks = TECH_TREE.filter(tech => isFirstRealUnlockTech(tech));
    expect(firstUnlocks.map(tech => tech.id)).toEqual(expect.arrayContaining([
      'archery',
      'bronze-working',
      'writing',
      'wheel',
      'pottery',
      'animal-husbandry',
      'code-of-laws',
      'cartography',
      'sailing',
      'domestication',
      'granary-design',
      'bone-setting',
      'midwifery',
      'mythology',
      'rhetoric',
      'storytelling',
      'fishing',
      'smelting',
      'thatching',
      'foundations',
      'smoke-signals',
      'burial-rites',
    ]));
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('early-empire');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('lookouts');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('music');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('tool-making');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('messengers');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('sacred-sites');

    const outliers = firstUnlocks
      .filter(tech => tech.id !== 'bronze-working')
      .map(tech => `${tech.id}:${estimateTurnsToComplete({ cost: tech.cost, outputPerTurn: 1 })}`)
      .filter(entry => {
        const turns = Number(entry.split(':')[1]);
        return turns < 8 || turns > 12;
      });

    expect(outliers).toEqual([]);
  });

  it('keeps Bronze Working in its explicit 9-11 turn baseline window', () => {
    const bronze = TECH_TREE.find(tech => tech.id === 'bronze-working');
    expect(bronze).toBeDefined();
    expect(getResearchOutputProfileForTech(bronze!)).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(estimateTurnsToComplete({ cost: bronze!.cost, outputPerTurn: 1 })).toBeGreaterThanOrEqual(9);
    expect(estimateTurnsToComplete({ cost: bronze!.cost, outputPerTurn: 1 })).toBeLessThanOrEqual(11);
    expect(estimateTurnsToComplete({ cost: bronze!.cost, outputPerTurn: 2 })).toBeGreaterThanOrEqual(5);
    expect(estimateTurnsToComplete({ cost: bronze!.cost, outputPerTurn: 2 })).toBeLessThanOrEqual(7);
  });

  describe('resource reveal unlock text', () => {
    const EXPECTED_REVEALS = [
      { techId: 'gathering',        resourceName: 'Stone'   },
      { techId: 'stone-weapons',    resourceName: 'Copper'  },
      { techId: 'foraging',         resourceName: 'Ivory'   },
      { techId: 'pottery',          resourceName: 'Wine'    },
      { techId: 'cartography',      resourceName: 'Spices'  },
      { techId: 'irrigation',       resourceName: 'Silk'    },
      { techId: 'bronze-working',   resourceName: 'Iron'    },
      { techId: 'animal-husbandry', resourceName: 'Horses'  },
      { techId: 'mining-tech',      resourceName: 'Gems'    },
      { techId: 'currency',         resourceName: 'Incense' },
    ];

    for (const { techId, resourceName } of EXPECTED_REVEALS) {
      it(`${techId} includes "Reveal ${resourceName} resource" in unlocks`, () => {
        const tech = TECH_TREE.find(t => t.id === techId);
        expect(tech, `tech "${techId}" not found`).toBeDefined();
        const hasReveal = tech?.unlocks.some(u => u === `Reveal ${resourceName} resource`);
        expect(
          hasReveal,
          `${techId} missing "Reveal ${resourceName} resource" in unlocks: [${tech?.unlocks.join(', ')}]`,
        ).toBe(true);
      });
    }
  });

  describe('S2a resource reveal strings', () => {
    const S2A_REVEALS = [
      { techId: 'domestication',   resourceName: 'Cattle' },
      { techId: 'pottery',         resourceName: 'Salt'   },
      { techId: 'animal-husbandry',resourceName: 'Sheep'  },
      { techId: 'foraging',        resourceName: 'Furs'   },
      { techId: 'currency',        resourceName: 'Gold'   },
      { techId: 'mining-tech',     resourceName: 'Silver' },
    ];

    for (const { techId, resourceName } of S2A_REVEALS) {
      it(`${techId} includes "Reveal ${resourceName} resource" in unlocks`, () => {
        const tech = TECH_TREE.find(t => t.id === techId);
        expect(tech, `tech "${techId}" not found`).toBeDefined();
        const hasReveal = tech?.unlocks.some(u => u === `Reveal ${resourceName} resource`);
        expect(
          hasReveal,
          `${techId} missing "Reveal ${resourceName} resource" in unlocks: [${tech?.unlocks.join(', ')}]`,
        ).toBe(true);
      });
    }
  });
});
