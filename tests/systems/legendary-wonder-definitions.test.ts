import { describe, expect, it } from 'vitest';
import { getLateEraWonderTechRequirements } from '@/systems/legendary-wonder-definitions';

describe('legendary-wonder-definitions', () => {
  it('maps the remaining late-era wonder scaffolding to real Slice 3 techs', () => {
    const requirements = getLateEraWonderTechRequirements();

    expect(requirements.find(entry => entry.wonderId === 'manhattan-project')).toEqual({
      wonderId: 'manhattan-project',
      requiredTechs: ['nuclear-theory'],
    });
    expect(requirements.find(entry => entry.wonderId === 'internet')).toEqual({
      wonderId: 'internet',
      requiredTechs: ['mass-media', 'global-logistics'],
    });
  });
});
