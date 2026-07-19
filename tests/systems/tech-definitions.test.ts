import { describe, it, expect } from 'vitest';
import { TECH_TREE, getEraAdvancementFraction, getEraAdvancementTechs, resolveCivilizationEra, resolveWorldAge } from '@/systems/tech-definitions';
import {
  estimateTurnsToComplete,
  getResearchOutputProfileForTech,
  isFirstRealUnlockTech,
  isStarterPrerequisiteTech,
} from '@/systems/pacing-model';

describe('tech definitions', () => {
  it('ships exactly two Era 13 technologies on every track', () => {
    const era13 = TECH_TREE.filter(tech => tech.era === 13);
    expect(era13).toHaveLength(30);

    const perTrack = new Map<string, number>();
    for (const tech of era13) {
      perTrack.set(tech.track, (perTrack.get(tech.track) ?? 0) + 1);
    }
    expect(perTrack).toHaveLength(15);
    for (const [track, count] of perTrack) {
      expect(count, `${track} must have two Era 13 technologies`).toBe(2);
    }
  });

  it('has exactly 398 techs after completing the Era 13 roster', () => {
    expect(TECH_TREE.length).toBe(398);
  });

  it('keeps 15 tracks while expanding through two Era 13 technologies per track', () => {
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
      const expectedBeforeEra13 = track === 'military'
        ? 26
        : ['economy', 'communication', 'maritime', 'exploration', 'espionage'].includes(track)
          ? 25
          : track === 'science'
            ? 26
          : 24;
      // Quantum Computing was already the one-node Era 13 boundary in the old
      // science count; MR5 adds its science-track partner and two nodes elsewhere.
      const expected = expectedBeforeEra13 + (track === 'science' ? 1 : 2);
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
    // Era 5: each track has 2 new techs; maritime keeps its +1 from the amphibious-warfare
    // stub (deliberately still era 5). MR10 re-homed the other 4 stubs (global-logistics,
    // nuclear-theory, mass-media, digital-surveillance) to the eras their names actually
    // belong to — so economy/science/communication/espionage are back down to 2 each.
    expect(trackEra.get('maritime-5'), 'maritime-5 should have 3 techs (1 stub + 2 new)').toBe(3);
    // All other tracks (including the 4 that lost their re-homed stubs) have exactly 2 era-5 techs each
    for (const track of ['military', 'civics', 'exploration', 'agriculture', 'medicine', 'philosophy', 'arts', 'metallurgy', 'construction', 'spirituality', 'economy', 'science', 'communication', 'espionage']) {
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

  it('era-5 advancement is exactly the 30 new era-5 techs (MR10 re-homed digital-surveillance out)', () => {
    const ids = getEraAdvancementTechs(5).map(tech => tech.id);
    // MR10: digital-surveillance moved to era 10 — no longer an era-5 advancement tech.
    expect(ids).not.toContain('digital-surveillance');
    // cyber-warfare is now era 12 — must NOT appear in era-5 advancement
    expect(ids).not.toContain('cyber-warfare');
    // The other 3 re-homed stubs (now at eras 8/9/10) plus amphibious-warfare (still era 5)
    // all have countsForEraAdvancement: false and should be absent regardless of era.
    expect(ids).not.toContain('global-logistics');
    expect(ids).not.toContain('nuclear-theory');
    expect(ids).not.toContain('mass-media');
    expect(ids).not.toContain('amphibious-warfare');
    // 30 techs: the 30 new era-5 techs, no stubs qualify anymore.
    expect(ids.length).toBe(30);
  });

  it('era-10 advancement gains digital-surveillance (re-homed, no countsForEraAdvancement override) but not nuclear-theory (still false)', () => {
    const ids = getEraAdvancementTechs(10).map(tech => tech.id);
    expect(ids).toContain('digital-surveillance');
    expect(ids).not.toContain('nuclear-theory');
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

  it('uses authored graduated thresholds for personal era advancement', () => {
    expect(getEraAdvancementFraction(2)).toBe(0.5);
    expect(getEraAdvancementFraction(4)).toBe(0.6);
    expect(getEraAdvancementFraction(9)).toBe(0.55);
    expect(getEraAdvancementFraction(13)).toBe(1);
  });

  it('advances World Age only when a strict majority reaches an era', () => {
    const era2 = getEraAdvancementTechs(2);
    const completed = era2.slice(0, Math.ceil(era2.length * 0.5)).map(tech => tech.id);
    const civilizations = {
      player: { isEliminated: false, techState: { completed } },
      'ai-1': { isEliminated: false, techState: { completed } },
      'ai-2': { isEliminated: false, techState: { completed: [] } },
      retired: { isEliminated: true, techState: { completed: [] } },
    } as any;

    expect(resolveWorldAge(civilizations)).toBe(2);
  });

  it('save-compat: a legacy save with digital-surveillance among its completed techs does not lose era-5 progress', () => {
    // Pre-MR10, digital-surveillance counted toward era-5 advancement. It's simply
    // absent from the era-5 list now (moved to era 10) rather than miscounted — a
    // legacy save that already had enough OTHER era-5 techs to cross the threshold
    // must not regress below era 5 just because digital-surveillance is present.
    const eraChain = [2, 3, 4, 5].flatMap(era => {
      const ids = getEraAdvancementTechs(era).map(tech => tech.id);
      return ids.slice(0, Math.ceil(ids.length * 0.6));
    });
    const legacyCompleted = [...eraChain, 'digital-surveillance'];

    expect(resolveCivilizationEra(legacyCompleted)).toBeGreaterThanOrEqual(5);
  });

  it('stays below an era threshold and ignores non-advancement technologies', () => {
    const era2 = getEraAdvancementTechs(2);
    const belowThreshold = Math.ceil(era2.length * getEraAdvancementFraction(2)) - 1;

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

  it('keeps Era 12 Cloud Computing distinct from emerging Era 13 Quantum Computing', () => {
    const cloud = TECH_TREE.find(tech => tech.id === 'cloud-computing');
    const quantum = TECH_TREE.find(tech => tech.id === 'quantum-computing');

    expect(cloud).toMatchObject({
      name: 'Cloud Computing',
      era: 12,
      prerequisites: ['integrated-circuits', 'arpanet'],
      unlocksBuildings: ['data_center'],
    });
    expect(quantum).toMatchObject({
      name: 'Quantum Computing',
      era: 13,
      prerequisites: ['cloud-computing', 'nanomaterials'],
      historicalStatus: 'emerging',
    });
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
