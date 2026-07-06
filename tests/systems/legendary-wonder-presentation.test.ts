import { describe, expect, it } from 'vitest';
import {
  getCompactLegendaryWonderEntriesForCity,
  getLegendaryWonderDisplayName,
  getLegendaryWonderPresentationForCity,
  getLegendaryWonderProductionCost,
  getLegendaryWonderQueueItemMetadata,
  titleCaseId,
} from '@/systems/legendary-wonder-presentation';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-presentation', () => {
  it('classifies selected-city wonder entries and exposes safe start labels', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'sacred-sites', 'city-planning', 'printing'],
      resources: ['stone'],
      oracleStepsCompleted: 2,
    });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    state.legendaryWonderProjects!['grand-canal'].phase = 'lost_race';
    state.legendaryWonderProjects!['grand-canal'].transferableProduction = 24;
    state.legendaryWonderProjects!['sun-spire:player:city-river'] = {
      wonderId: 'sun-spire',
      ownerId: 'player',
      cityId: 'city-river',
      phase: 'building',
      investedProduction: 70,
      transferableProduction: 0,
      questSteps: [
        { id: 'complete-sacred-route', description: 'Establish a sacred trade route.', completed: true },
        { id: 'defeat-nearby-stronghold', description: 'Clear a nearby barbarian stronghold.', completed: true },
      ],
    };
    state.cities['city-river'].productionQueue = ['legendary:sun-spire'];
    state.cities['city-river'].productionProgress = 70;

    const entries = getLegendaryWonderPresentationForCity(state, 'player', 'city-river', 10);

    expect(entries.find(entry => entry.wonderId === 'oracle-of-delphi')).toMatchObject({
      name: 'Oracle of Delphi',
      visibleState: 'ready',
      eligibilityState: 'buildable',
      canStartBuild: true,
      startActionLabel: 'Start Construction',
      queueItemId: 'legendary:oracle-of-delphi',
    });
    expect(entries.find(entry => entry.wonderId === 'grand-canal')).toMatchObject({
      visibleState: 'recovered',
      transferableProduction: 24,
    });
    expect(entries.find(entry => entry.wonderId === 'sun-spire')).toMatchObject({
      visibleState: 'building',
      investedProduction: 70,
    });
  });

  it('keeps stale ready projects build-blocked when requirements are no longer met', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'sacred-sites'],
      resources: [],
      oracleStepsCompleted: 2,
    });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';

    const oracle = getLegendaryWonderPresentationForCity(state, 'player', 'city-river')
      .find(entry => entry.wonderId === 'oracle-of-delphi');

    expect(oracle).toMatchObject({
      visibleState: 'blocked',
      eligibilityState: 'blocked',
      canStartBuild: false,
      startActionLabel: null,
    });
    expect(oracle?.missingRequirements).toContain('Stone');
  });

  it('does not present seeded project shells as questing before requirements are reachable', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'sacred-sites'],
      resources: ['stone'],
    });
    state.era = 4;
    state.legendaryWonderProjects = undefined;

    const entries = getLegendaryWonderPresentationForCity(state, 'player', 'city-river');

    expect(entries.find(entry => entry.wonderId === 'oracle-of-delphi')).toMatchObject({
      visibleState: 'questing',
      eligibilityState: 'near',
    });
    expect(entries.find(entry => entry.wonderId === 'starvault-observatory')).toMatchObject({
      visibleState: 'near',
      eligibilityState: 'near',
    });
    expect(entries.find(entry => entry.wonderId === 'manhattan-project')).toMatchObject({
      visibleState: 'blocked',
      eligibilityState: 'blocked',
    });
  });

  it('keeps globally completed wonders blocked rather than available soon', () => {
    const completedState = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'sacred-sites'],
      resources: ['stone'],
    });
    completedState.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'rival', cityId: 'city-rival', turnCompleted: 39 },
    };

    const completedOracle = getLegendaryWonderPresentationForCity(completedState, 'player', 'city-river')
      .find(entry => entry.wonderId === 'oracle-of-delphi');
    expect(completedOracle).toMatchObject({
      visibleState: 'blocked',
      eligibilityState: 'blocked',
    });
    expect(completedOracle?.missingRequirements).toContain('Already completed elsewhere');
  });

  it('keeps same-owner active wonders blocked in other cities', () => {
    const activeState = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'sacred-sites'],
      resources: ['stone'],
    });
    activeState.cities['city-second'] = {
      ...activeState.cities['city-river'],
      id: 'city-second',
      name: 'Second City',
      position: { q: 3, r: 2 },
    };
    activeState.legendaryWonderProjects!['oracle-second'] = {
      ...activeState.legendaryWonderProjects!['oracle-of-delphi'],
      cityId: 'city-second',
      phase: 'building',
    };

    const activeOracle = getLegendaryWonderPresentationForCity(activeState, 'player', 'city-river')
      .find(entry => entry.wonderId === 'oracle-of-delphi');
    expect(activeOracle).toMatchObject({
      visibleState: 'blocked',
      eligibilityState: 'blocked',
    });
    expect(activeOracle?.missingRequirements).toContain('Already under construction in another city');
  });

  it('titleCaseId formats both hyphen- and underscore-separated ids for player-facing labels (#432)', () => {
    // No resource id in RESOURCE_DEFINITIONS uses an underscore (palace-of-the-sun's
    // requiredResources used to be the one exception, via the now-fixed
    // 'gold_resource' typo — see legendary-wonder-definitions.ts). titleCaseId itself
    // is still a general-purpose formatter used elsewhere (tech id / quest step id
    // fallback labels), so its underscore-handling is tested directly here rather
    // than through a wonder whose data no longer exercises that path.
    expect(titleCaseId('gold_resource')).toBe('Gold Resource');
    expect(titleCaseId('some-hyphenated-id')).toBe('Some Hyphenated Id');
    expect(titleCaseId('gold')).toBe('Gold');
  });

  it('shows the correct player-facing label for palace-of-the-sun now that its resource id is fixed (#432)', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });

    const palace = getLegendaryWonderPresentationForCity(state, 'player', 'city-river')
      .find(entry => entry.wonderId === 'palace-of-the-sun');

    expect(palace?.missingRequirements).toContain('Gold');
    expect(palace?.missingRequirements).not.toContain('Gold Resource');
  });

  it('keeps far-future blocked wonders out of the compact build-list surface', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.era = 1;
    state.legendaryWonderProjects = undefined;

    const compact = getCompactLegendaryWonderEntriesForCity(state, 'player', 'city-river', 20);

    expect(compact.map(entry => entry.wonderId)).not.toContain('oracle-of-delphi');
    expect(compact.map(entry => entry.wonderId)).not.toContain('internet');
    expect(compact.map(entry => entry.wonderId)).not.toContain('manhattan-project');
    expect(compact.every(entry => entry.era <= 2)).toBe(true);
  });

  it('exposes legendary queue metadata for production rows', () => {
    expect(getLegendaryWonderQueueItemMetadata('legendary:oracle-of-delphi')).toEqual({
      icon: '*',
      name: 'Oracle of Delphi',
      productionCost: 120,
      wonderId: 'oracle-of-delphi',
    });
    expect(getLegendaryWonderDisplayName('legendary:oracle-of-delphi')).toBe('Oracle of Delphi');
    expect(getLegendaryWonderProductionCost('legendary:oracle-of-delphi')).toBe(120);
    expect(getLegendaryWonderQueueItemMetadata('legendary:unknown')).toEqual({
      icon: '*',
      name: 'Unknown Legendary Wonder',
      productionCost: 0,
      wonderId: 'unknown',
    });
  });

  it('derives legendary construction milestones, ETA, and queue continuity without mutating state', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'sacred-sites'],
      resources: ['stone'],
    });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi', 'library'];
    state.cities['city-river'].productionProgress = 72;
    state.cities['city-river'].focus = 'production';
    const before = structuredClone(state.legendaryWonderProjects);

    const oracle = getLegendaryWonderPresentationForCity(state, 'player', 'city-river')
      .find(entry => entry.wonderId === 'oracle-of-delphi');

    expect(oracle).toMatchObject({
      visibleState: 'building',
      progressPercent: 60,
      milestoneLabel: 'Final works',
      queueContinuityLabel: 'Queue resumes after this wonder.',
      raceTensionLabel: 'Construction underway',
    });
    expect(oracle?.turnsRemaining).toBeGreaterThan(0);
    expect(state.legendaryWonderProjects).toEqual(before);
  });

  it('derives recovery and completed production-resumed copy', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.legendaryWonderProjects!['grand-canal'].phase = 'lost_race';
    state.legendaryWonderProjects!['grand-canal'].transferableProduction = 24;
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: 'city-river', turnCompleted: 50 },
    };

    const entries = getLegendaryWonderPresentationForCity(state, 'player', 'city-river');
    expect(entries.find(entry => entry.wonderId === 'grand-canal')).toMatchObject({
      visibleState: 'recovered',
      recoveryLabel: 'Effort recovered: 24 production carryover preserved.',
      productionResumedLabel: 'Normal production has resumed.',
    });
    expect(entries.find(entry => entry.wonderId === 'oracle-of-delphi')).toMatchObject({
      visibleState: 'completed',
      productionResumedLabel: 'Normal production has resumed.',
    });
  });

  it('does not label no-intel builds as safe or uncontested', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['architecture-arts', 'theology-tech'],
      resources: ['stone'],
    });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = 10;

    const oracle = getLegendaryWonderPresentationForCity(state, 'player', 'city-river')
      .find(entry => entry.wonderId === 'oracle-of-delphi');

    expect(oracle?.raceTensionLabel).toBe('Construction underway');
    expect(oracle?.raceTensionLabel).not.toMatch(/uncontested/i);
  });
});
