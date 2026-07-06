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

  it('keeps the legacy shape after removing cyber-warfare stub and adding era-5 through era-12 nodes', () => {
    const allTracks = [...new Set(TECH_TREE.map(t => t.track))];
    for (const track of allTracks) {
      const techs = TECH_TREE.filter(t => t.track === track);
      // cyber-warfare stub removed: espionage drops from 26 to 25.
      // Economy/science/communication/maritime/exploration/espionage: 9 era1-4 + 16 (era5-12) = 25.
      // Military gets +2 from balloon-corps (era 7) + air-superiority (era 9) → 26.
      // Other tracks had 8 era1-4 + 16 (era5-12) = 24.
      const expectedCount = track === 'military'
        ? 26
        : ['economy', 'science', 'communication', 'maritime', 'exploration', 'espionage'].includes(track)
          ? 25
          : 24;
      expect(techs.length, `track ${track} should have ${expectedCount} techs`).toBe(expectedCount);
    }
  });
});

describe('expanded tech tree', () => {
  it('has 368 techs total after removing cyber-warfare stub and adding era-12 (29 net new techs)', () => {
    expect(TECH_TREE.length).toBe(368);
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

  it('techs span eras 1-12', () => {
    const eras = new Set(TECH_TREE.map(t => t.era));
    expect(eras.size).toBe(12);
    for (let era = 1; era <= 12; era++) {
      expect(eras).toContain(era);
    }
  });

  it('unlocks mass-media only after its era-9 prerequisite is complete (MR10 re-homed it from an era-5 stub)', () => {
    const state = createTechState();

    expect(getAvailableTechs(state).find(t => t.id === 'mass-media')).toBeUndefined();

    state.completed.push('radio-broadcast');
    const available = getAvailableTechs(state);

    expect(available.find(t => t.id === 'mass-media')).toBeDefined();
  });
});

describe('createTechState', () => {
  it('starts with no completed techs', () => {
    const state = createTechState();
    expect(state.completed).toEqual([]);
    expect(state.currentResearch).toBeNull();
    expect(state.researchQueue).toEqual([]);
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
    const result = processResearch(updated, 1);
    expect(result.state.researchProgress).toBe(1);
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

  it('advances into queued research after a tech completes', () => {
    const state = createTechState();
    const updated = {
      ...startResearch(state, 'fire'),
      researchQueue: ['writing'],
      researchProgress: 7,
    };

    const result = processResearch(updated, 1);

    expect(result.completedTech).toBe('fire');
    expect(result.state.currentResearch).toBe('writing');
    expect(result.state.researchQueue).toEqual([]);
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
