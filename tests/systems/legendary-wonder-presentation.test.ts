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
});
