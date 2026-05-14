import { describe, it, expect } from 'vitest';
import { TECH_TREE, getEraAdvancementTechs } from '@/systems/tech-definitions';
import {
  estimateTurnsToComplete,
  getResearchOutputProfileForTech,
  isFirstRealUnlockTech,
  isStarterPrerequisiteTech,
} from '@/systems/pacing-model';

describe('tech definitions', () => {
  it('has exactly 125 techs after adding late-era Slice 3 scaffolding', () => {
    expect(TECH_TREE.length).toBe(125);
  });

  it('keeps 15 tracks while expanding economy, science, and communication into era 5', () => {
    const tracks = new Map<string, number>();
    for (const tech of TECH_TREE) {
      tracks.set(tech.track, (tracks.get(tech.track) ?? 0) + 1);
    }
    expect(tracks.size).toBe(15);
    for (const [track, count] of tracks) {
      const expected = track === 'espionage'
        ? 10
        : ['economy', 'science', 'communication'].includes(track)
          ? 9
          : 8;
      expect(count, `track ${track} should have ${expected} techs`).toBe(expected);
    }
  });

  it('keeps the original 2-tech era rhythm through era 4 and adds only the planned era 5 scaffolding', () => {
    const trackEra = new Map<string, number>();
    for (const tech of TECH_TREE) {
      const key = `${tech.track}-${tech.era}`;
      trackEra.set(key, (trackEra.get(key) ?? 0) + 1);
    }
    const tracks = [...new Set(TECH_TREE.map(t => t.track))];
    for (const track of tracks) {
      for (let era = 1; era <= 4; era++) {
        const key = `${track}-${era}`;
        expect(trackEra.get(key), `${key} should have 2 techs`).toBe(2);
      }
    }
    expect(trackEra.get('espionage-5'), 'espionage-5 should have 2 techs').toBe(2);
    expect(trackEra.get('economy-5'), 'economy-5 should have 1 tech').toBe(1);
    expect(trackEra.get('science-5'), 'science-5 should have 1 tech').toBe(1);
    expect(trackEra.get('communication-5'), 'communication-5 should have 1 tech').toBe(1);
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

  it('adds Stage 5 espionage techs after counter-intelligence', () => {
    const ids = TECH_TREE.filter(t => t.track === 'espionage').map(t => t.id);
    expect(ids).toContain('digital-surveillance');
    expect(ids).toContain('cyber-warfare');
  });

  it('contains the late-era tech prerequisites for the remaining M4 wonder scaffolding', () => {
    expect(TECH_TREE.find(t => t.id === 'mass-media')).toBeDefined();
    expect(TECH_TREE.find(t => t.id === 'global-logistics')).toBeDefined();
    expect(TECH_TREE.find(t => t.id === 'nuclear-theory')).toBeDefined();
  });

  it('keeps era advancement paced by the original era-5 espionage pair', () => {
    const ids = getEraAdvancementTechs(5).map(tech => tech.id);

    expect(ids).toEqual(['digital-surveillance', 'cyber-warfare']);
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
});
