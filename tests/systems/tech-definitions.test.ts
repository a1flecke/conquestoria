import { describe, it, expect } from 'vitest';
import { TECH_TREE } from '@/systems/tech-definitions';

describe('tech definitions', () => {
  it('has exactly 120 techs', () => {
    expect(TECH_TREE.length).toBe(120);
  });

  it('has 15 tracks with 8 techs each', () => {
    const tracks = new Map<string, number>();
    for (const tech of TECH_TREE) {
      tracks.set(tech.track, (tracks.get(tech.track) ?? 0) + 1);
    }
    expect(tracks.size).toBe(15);
    for (const [track, count] of tracks) {
      expect(count, `track ${track} should have 8 techs`).toBe(8);
    }
  });

  it('each track has 2 techs per era (eras 1-4)', () => {
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
});
