import { describe, expect, it } from 'vitest';
import { MINOR_CIV_ARCHETYPES } from '@/core/types';
import {
  QUEST_CHAINS_BY_ARCHETYPE,
  getQuestChainForArchetype,
} from '@/systems/quest-chain-definitions';

describe('minor-civ quest-chain definitions', () => {
  it('covers every runtime archetype with exactly three steps', () => {
    expect(Object.keys(QUEST_CHAINS_BY_ARCHETYPE).sort()).toEqual([...MINOR_CIV_ARCHETYPES].sort());

    for (const archetype of MINOR_CIV_ARCHETYPES) {
      const chain = getQuestChainForArchetype(archetype);
      expect(chain.steps).toHaveLength(3);
    }
  });

  it.each([
    [1, ['Honor the Storytellers', 'Host a Seasonal Fair', 'Feast of First Songs']],
    [2, ['Patronize Local Arts', 'Exchange Artisans', 'Festival of Crafts']],
    [3, ['Convene Philosophers', 'Welcome a Cultural Delegation', 'Festival of Ideas']],
    [4, ['Commission the Great Stage', 'Open an Exchange Route', 'Grand Festival']],
  ] as const)('uses culturally themed era %i steps', (era, titles) => {
    const chain = getQuestChainForArchetype('cultural');
    expect(chain.steps.map(step => step.eraVariants[era].title)).toEqual(titles);
  });
});
