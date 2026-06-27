import { describe, expect, it } from 'vitest';
import {
  getCompactLegendaryWonderEntriesForCity,
  getLegendaryWonderDisplayName,
  getLegendaryWonderPresentationForCity,
  getLegendaryWonderProductionCost,
  getLegendaryWonderQueueItemMetadata,
} from '@/systems/legendary-wonder-presentation';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-presentation', () => {
  it('classifies selected-city wonder entries and exposes safe start labels', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'pilgrimages', 'city-planning', 'printing'],
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
      completedTechs: ['philosophy', 'pilgrimages'],
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
      completedTechs: ['philosophy', 'pilgrimages'],
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
      completedTechs: ['philosophy', 'pilgrimages'],
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
