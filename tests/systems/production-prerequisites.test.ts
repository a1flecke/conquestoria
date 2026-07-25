import { describe, expect, it } from 'vitest';
import {
  evaluateProductionPrerequisites,
  getRequiredTechIds,
  validateProductionPrerequisiteDefinitions,
} from '@/systems/production-prerequisites';

describe('production prerequisites', () => {
  it('treats the legacy single-tech gate as one ordered requirement', () => {
    expect(evaluateProductionPrerequisites(
      { techRequired: 'bronze-working' },
      ['bronze-working'],
    )).toEqual({
      required: ['bronze-working'],
      satisfied: ['bronze-working'],
      missing: [],
    });
  });

  it('requires every conjunctive technology and preserves definition order', () => {
    const definition = { techRequired: 'bronze-working', requiredTechs: ['iron-forging', 'engineering'] };

    expect(getRequiredTechIds(definition)).toEqual([
      'bronze-working',
      'iron-forging',
      'engineering',
    ]);
    expect(evaluateProductionPrerequisites(definition, ['bronze-working', 'engineering'])).toEqual({
      required: ['bronze-working', 'iron-forging', 'engineering'],
      satisfied: ['bronze-working', 'engineering'],
      missing: ['iron-forging'],
    });
  });

  it.each([
    ['legacy gate only', ['bronze-working'], ['bronze-working'], ['iron-forging']],
    ['additional gate only', ['iron-forging'], ['iron-forging'], ['bronze-working']],
  ])('keeps %s incomplete until both gates are complete', (_label, completed, satisfied, missing) => {
    expect(evaluateProductionPrerequisites(
      { techRequired: 'bronze-working', requiredTechs: ['iron-forging'] },
      completed,
    )).toMatchObject({
      required: ['bronze-working', 'iron-forging'],
      satisfied,
      missing,
    });
  });

  it('reports distinct catalog-definition errors for empty, duplicate, and unknown gates', () => {
    expect(validateProductionPrerequisiteDefinitions(
      [
        { id: 'empty', requiredTechs: [] },
        { id: 'duplicate', techRequired: 'alpha', requiredTechs: ['alpha'] },
        { id: 'unknown', requiredTechs: ['omega'] },
        { id: 'unreachable', requiredTechs: ['beta'] },
      ],
      new Set(['alpha', 'beta']),
      new Set(['alpha']),
    )).toEqual([
      'empty: requiredTechs must not be empty',
      'duplicate: duplicate prerequisite alpha',
      'unknown: unknown prerequisite omega',
      'unreachable: unreachable prerequisite beta',
    ]);
  });
});
