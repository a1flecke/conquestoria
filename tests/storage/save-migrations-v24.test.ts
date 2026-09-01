import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getEffectiveTechCost, getTechById } from '@/systems/tech-system';
import { RECOMMENDED_TECH_COST_BY_ID } from '../fixtures/research-cost-retune-v24';
import { CURRENT_SAVE_SCHEMA_VERSION, migrateSaveToCurrent } from '@/storage/save-migrations';
import { PRE_V24_TECH_COST_BY_ID } from '@/storage/research-cost-migration-v24';

function legacyResearchSave(techId: string, progress: number, completed: string[] = []) {
  const save = createNewGame('rome', `research-cost-v24-${techId}-${progress}`, 'small');
  save.saveSchemaVersion = 23;
  save.civilizations.player.techState = {
    ...save.civilizations.player.techState,
    completed,
    currentResearch: techId,
    researchProgress: progress,
    researchQueue: ['archery'],
  };
  return save;
}

function expectedProgress(techId: string, oldProgress: number, completed: string[] = []): number {
  const oldCost = PRE_V24_TECH_COST_BY_ID[techId]!;
  const tech = getTechById(techId)!;
  const newCost = getEffectiveTechCost({ ...tech, cost: RECOMMENDED_TECH_COST_BY_ID[techId]! }, completed);
  const oldEffectiveCost = completed.includes('cloud-computing') && tech.track === 'science'
    ? Math.ceil(oldCost * 0.85)
    : oldCost;
  const fraction = Math.min(1, Math.max(0, oldProgress / oldEffectiveCost));
  return fraction < 1 ? Math.min(newCost - 1, Math.round(fraction * newCost)) : newCost;
}

describe('save migration 24 — research cost retune', () => {
  it.each([
    ['bronze-working', 0],
    ['bronze-working', 5],
    ['political-philosophy', 99],
  ])('preserves unfinished completion percentage for %s from %i old progress', (techId, oldProgress) => {
    const migrated = migrateSaveToCurrent(legacyResearchSave(techId, oldProgress));
    const techState = migrated.civilizations.player.techState;

    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(24);
    expect(migrated.saveSchemaVersion).toBe(24);
    expect(techState.researchProgress).toBe(expectedProgress(techId, oldProgress));
    expect(techState.researchQueue).toEqual(['archery']);
  });

  it.each([10, 999])('normalizes already-complete Bronze Working at %i old progress without an event', oldProgress => {
    const migrated = migrateSaveToCurrent(legacyResearchSave('bronze-working', oldProgress));
    const techState = migrated.civilizations.player.techState;

    expect(techState.completed).toContain('bronze-working');
    expect(techState.currentResearch).toBe('archery');
    expect(techState.researchProgress).toBe(0);
    expect(techState.researchQueue).toEqual([]);
  });

  it('uses old and new Cloud Computing discounts while preserving unfinished work', () => {
    const migrated = migrateSaveToCurrent(legacyResearchSave('cloud-computing', 1_000, ['cloud-computing']));
    const techState = migrated.civilizations.player.techState;

    expect(techState.researchProgress).toBe(expectedProgress('cloud-computing', 1_000, ['cloud-computing']));
    expect(techState.researchProgress).toBeLessThan(RECOMMENDED_TECH_COST_BY_ID['cloud-computing']!);
  });

  it('leaves unknown or empty active research untouched and is idempotent', () => {
    const unknown = legacyResearchSave('not-a-tech', 42);
    const empty = legacyResearchSave('bronze-working', 7);
    empty.civilizations.player.techState.currentResearch = null;

    const migratedUnknown = migrateSaveToCurrent(unknown);
    const migratedEmpty = migrateSaveToCurrent(empty);

    expect(migratedUnknown.civilizations.player.techState.researchProgress).toBe(42);
    expect(migratedEmpty.civilizations.player.techState.researchProgress).toBe(7);
    expect(migrateSaveToCurrent(migratedUnknown)).toEqual(migratedUnknown);
    expect(migrateSaveToCurrent(migratedEmpty)).toEqual(migratedEmpty);
  });
});
