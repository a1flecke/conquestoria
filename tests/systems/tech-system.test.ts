import {
  TECH_TREE,
  createTechState,
  getAvailableTechs,
  startResearch,
  processResearch,
  isTechCompleted,
} from '@/systems/tech-system';

describe('TECH_TREE', () => {
  it('has techs in 15 tracks', () => {
    const tracks = new Set(TECH_TREE.map(t => t.track));
    expect(tracks.size).toBe(15);
    for (const track of [
      'military', 'economy', 'science', 'civics', 'exploration',
      'agriculture', 'medicine', 'philosophy', 'arts', 'maritime',
      'metallurgy', 'construction', 'communication', 'espionage', 'spirituality',
    ]) {
      expect(tracks).toContain(track);
    }
  });

  it('keeps the legacy 8-tech structure for most tracks and extends espionage to 10 techs', () => {
    const allTracks = [...new Set(TECH_TREE.map(t => t.track))];
    for (const track of allTracks) {
      const techs = TECH_TREE.filter(t => t.track === track);
      const expectedCount = track === 'espionage' ? 10 : 8;
      expect(techs.length, `track ${track} should have ${expectedCount} techs`).toBe(expectedCount);
    }
  });
});

describe('expanded tech tree', () => {
  it('has 122 techs total after adding Stage 5 espionage', () => {
    expect(TECH_TREE.length).toBe(122);
  });

  it('supports cross-track prerequisites', () => {
    const ironForging = TECH_TREE.find(t => t.id === 'iron-forging');
    expect(ironForging).toBeDefined();
    expect(ironForging!.prerequisites).toContain('mining-tech');
  });

  it('all prerequisite references are valid tech IDs', () => {
    const ids = new Set(TECH_TREE.map(t => t.id));
    for (const tech of TECH_TREE) {
      for (const prereq of tech.prerequisites) {
        expect(ids.has(prereq)).toBe(true);
      }
    }
  });

  it('techs span eras 1-5', () => {
    const eras = new Set(TECH_TREE.map(t => t.era));
    expect(eras.size).toBe(5);
    expect(eras).toContain(1);
    expect(eras).toContain(2);
    expect(eras).toContain(3);
    expect(eras).toContain(4);
    expect(eras).toContain(5);
  });
});

describe('createTechState', () => {
  it('starts with no completed techs', () => {
    const state = createTechState();
    expect(state.completed).toEqual([]);
    expect(state.currentResearch).toBeNull();
    expect(state.researchProgress).toBe(0);
  });
});

describe('getAvailableTechs', () => {
  it('returns era 1 techs with no prerequisites when nothing is researched', () => {
    const state = createTechState();
    const available = getAvailableTechs(state);
    expect(available.length).toBeGreaterThan(0);
    for (const tech of available) {
      expect(tech.prerequisites).toEqual([]);
    }
  });

  it('excludes completed techs', () => {
    const state = createTechState();
    const available = getAvailableTechs(state);
    const firstTech = available[0];
    state.completed.push(firstTech.id);
    const newAvailable = getAvailableTechs(state);
    expect(newAvailable.find(t => t.id === firstTech.id)).toBeUndefined();
  });

  it('unlocks techs when prerequisites are met', () => {
    const state = createTechState();
    const withPrereq = TECH_TREE.find(t => t.prerequisites.length > 0);
    if (!withPrereq) return;

    let available = getAvailableTechs(state);
    expect(available.find(t => t.id === withPrereq.id)).toBeUndefined();

    for (const prereq of withPrereq.prerequisites) {
      state.completed.push(prereq);
    }
    available = getAvailableTechs(state);
    expect(available.find(t => t.id === withPrereq.id)).toBeDefined();
  });

  it('keeps early available techs deterministic for panel guidance', () => {
    const state = createTechState();
    expect(getAvailableTechs(state).map(t => t.id)).toContain('gathering');
  });
});

describe('processResearch', () => {
  it('adds science points to current research', () => {
    const state = createTechState();
    const available = getAvailableTechs(state);
    const updated = startResearch({ ...state }, available[0].id);
    const result = processResearch(updated, 10);
    expect(result.state.researchProgress).toBe(10);
    expect(result.completedTech).toBeNull();
  });

  it('completes tech when progress reaches cost', () => {
    const state = createTechState();
    const available = getAvailableTechs(state);
    const tech = available[0];
    let updated = startResearch({ ...state }, tech.id);
    updated.researchProgress = tech.cost - 1;

    const result = processResearch(updated, 10);
    expect(result.completedTech).toBe(tech.id);
    expect(result.state.completed).toContain(tech.id);
    expect(result.state.currentResearch).toBeNull();
    expect(result.state.researchProgress).toBe(0);
  });
});

describe('isTechCompleted', () => {
  it('returns false for uncompleted tech', () => {
    const state = createTechState();
    expect(isTechCompleted(state, 'stone-weapons')).toBe(false);
  });

  it('returns true for completed tech', () => {
    const state = createTechState();
    state.completed.push('stone-weapons');
    expect(isTechCompleted(state, 'stone-weapons')).toBe(true);
  });
});
