import {
  TECH_TREE,
  createTechState,
  getAvailableTechs,
  getEffectiveTechCost,
  getTechById,
  applyResearchBonus,
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

  it('keeps two Era 13 technologies on every track', () => {
    const allTracks = [...new Set(TECH_TREE.map(t => t.track))];
    for (const track of allTracks) {
      const techs = TECH_TREE.filter(t => t.track === track);
      // Era 13 adds two technologies to every track. Quantum Computing was the
      // previous boundary node in science, so science adds only one new node here.
      // civics has a 3rd era-2 tech (magistracy, #919 MR2) → 27.
      const expectedCount = track === 'military'
        ? 28
        : track === 'maritime'
          ? 28
          : ['economy', 'communication', 'exploration', 'espionage'].includes(track)
          ? 27
          : track === 'science'
            ? 27
          : track === 'civics'
            ? 27
          : 26;
      expect(techs.length, `track ${track} should have ${expectedCount} techs`).toBe(expectedCount);
    }
  });
});

describe('expanded tech tree', () => {
  it('has 400 techs (399 + magistracy, #919 MR2) after the optional Dreadnought bridge to the 30-node Era 13 catalog', () => {
    expect(TECH_TREE.length).toBe(400);
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

  it('techs span eras 1-13', () => {
    const eras = new Set(TECH_TREE.map(t => t.era));
    expect(eras.size).toBe(13);
    for (let era = 1; era <= 13; era++) {
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
      researchProgress: getEffectiveTechCost(getTechById('fire')!, []) - 1,
    };

    const result = processResearch(updated, 1);

    expect(result.completedTech).toBe('fire');
    expect(result.state.currentResearch).toBe('writing');
    expect(result.state.researchQueue).toEqual([]);
  });

  it('completes active research through a bonus instead of leaving full progress active', () => {
    const state = startResearch(createTechState(), 'fire');
    const result = applyResearchBonus({
      ...state,
      researchProgress: getEffectiveTechCost(getTechById('fire')!, []) - 1,
    }, 1);

    expect(result.completedTech).toBe('fire');
    expect(result.state.completed).toContain('fire');
    expect(result.state.currentResearch).toBeNull();
    expect(result.state.researchProgress).toBe(0);
  });
});

describe('processResearch — MR4 bounded queue overflow (#917)', () => {
  it('reports zero carried progress when no completion happens', () => {
    const state = startResearch(createTechState(), 'fire');
    const result = processResearch(state, 5);

    expect(result.completedTech).toBeNull();
    expect(result.state.researchProgress).toBe(5);
    expect(result.carriedProgress).toBe(0);
  });

  it('reports zero carried progress on an exact completion', () => {
    const fireCost = getEffectiveTechCost(getTechById('fire')!, []);
    const state = { ...startResearch(createTechState(), 'fire'), researchProgress: fireCost - 1 };

    const result = processResearch(state, 1);

    expect(result.completedTech).toBe('fire');
    expect(result.carriedProgress).toBe(0);
    expect(result.state.researchProgress).toBe(0);
  });

  it('carries leftover science into the queued successor when research overshoots', () => {
    const fireCost = getEffectiveTechCost(getTechById('fire')!, []);
    const state = {
      ...startResearch(createTechState(), 'fire'),
      researchQueue: ['writing'],
      researchProgress: fireCost - 2,
    };

    const result = processResearch(state, 10); // 8 science left over after finishing fire

    expect(result.completedTech).toBe('fire');
    expect(result.state.currentResearch).toBe('writing');
    expect(result.state.researchQueue).toEqual([]);
    expect(result.carriedProgress).toBe(8);
    expect(result.state.researchProgress).toBe(8);
  });

  it('discards overflow when the completed tech has no queued successor', () => {
    const fireCost = getEffectiveTechCost(getTechById('fire')!, []);
    const state = {
      ...startResearch(createTechState(), 'fire'),
      researchQueue: [],
      researchProgress: fireCost - 2,
    };

    const result = processResearch(state, 10);

    expect(result.completedTech).toBe('fire');
    expect(result.state.currentResearch).toBeNull();
    expect(result.carriedProgress).toBe(0);
    expect(result.state.researchProgress).toBe(0);
  });

  it('carries overflow measured against discounted effective costs', () => {
    // Cloud Computing discounts unresearched science-track techs by 15%.
    const completed = ['cloud-computing'];
    const discountedFireCost = getEffectiveTechCost(getTechById('fire')!, completed);
    expect(discountedFireCost).toBeLessThan(getEffectiveTechCost(getTechById('fire')!, []));

    const state = {
      ...startResearch(createTechState(), 'fire'),
      completed,
      researchQueue: ['writing'],
      researchProgress: discountedFireCost - 5,
    };

    const result = processResearch(state, 12); // 7 science left over after finishing fire

    expect(result.completedTech).toBe('fire');
    expect(result.state.currentResearch).toBe('writing');
    expect(result.carriedProgress).toBe(7);
    expect(result.state.researchProgress).toBe(7);
    // The successor has NOT completed on carried progress alone.
    expect(result.state.completed).not.toContain('writing');
  });

  it('completes only the first tech even when carried overflow exceeds the successor cost', () => {
    const fireCost = getEffectiveTechCost(getTechById('fire')!, []);
    const writingCost = getEffectiveTechCost(getTechById('writing')!, ['fire']);
    const state = {
      ...startResearch(createTechState(), 'fire'),
      researchQueue: ['writing', 'wheel'],
      researchProgress: fireCost - 1,
    };

    const result = processResearch(state, writingCost + 100); // massive overshoot

    expect(result.completedTech).toBe('fire'); // exactly one completion this invocation
    expect(result.state.completed).toEqual(['fire']);
    expect(result.state.currentResearch).toBe('writing'); // successor is active, not completed
    expect(result.state.researchQueue).toEqual(['wheel']);
    expect(result.carriedProgress).toBe(writingCost + 99);
    expect(result.state.researchProgress).toBe(writingCost + 99);
  });

  it('reports zero carried progress from applyResearchBonus with no active research', () => {
    const result = applyResearchBonus(createTechState(), 25);

    expect(result.completedTech).toBeNull();
    expect(result.carriedProgress).toBe(0);
  });

  it('carries overflow through applyResearchBonus when a bonus completes active research', () => {
    const fireCost = getEffectiveTechCost(getTechById('fire')!, []);
    const state = {
      ...startResearch(createTechState(), 'fire'),
      researchQueue: ['writing'],
      researchProgress: fireCost - 3,
    };

    const result = applyResearchBonus(state, 20); // 17 left over after finishing fire

    expect(result.completedTech).toBe('fire');
    expect(result.state.currentResearch).toBe('writing');
    expect(result.carriedProgress).toBe(17);
    expect(result.state.researchProgress).toBe(17);
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
