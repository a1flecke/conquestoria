import { describe, expect, it } from 'vitest';
import { ScenarioError } from '@/testing/scenario-types';

describe('ScenarioError', () => {
  it('is a real Error with a readable name', () => {
    const error = new ScenarioError('bad step');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ScenarioError');
    expect(error.message).toBe('bad step');
  });
});
