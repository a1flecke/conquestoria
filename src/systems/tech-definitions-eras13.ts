import type { Tech } from '@/core/types';

export const TECH_TREE_ERAS_13: Tech[] = [
  {
    id: 'quantum-computing',
    name: 'Quantum Computing',
    track: 'science',
    cost: 2780,
    prerequisites: ['cloud-computing', 'nanomaterials'],
    unlocks: ['Data Centers gain +2 science per turn from quantum workloads'],
    era: 13,
    historicalStatus: 'emerging',
  },
];
