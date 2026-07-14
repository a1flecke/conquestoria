import type { GameSettings } from '@/core/types';

export type AiPressureFlag = 'off' | 'pirates' | 'full';
export type AiCrisisInteractionsFlag = 'off' | 'benign' | 'full';

export interface WorldPressureFlags {
  aiPressure: AiPressureFlag;
  aiPressureVisibility: boolean;
  aiCrisisInteractions: AiCrisisInteractionsFlag;
}

// Stage defaults: flipped by the final MR of each stage. aiPressure flipped to
// 'pirates' in #528 (MR2), then 'full' in #529 (MR3) -- this is the rollout
// mechanism: existing saves have no aiPressure field, so they pick up the new
// default on load. MR 5 flips visibility, MR 6/7 flip interactions. Until
// then, those two stay dark.
export function resolveWorldPressureFlags(settings: GameSettings | undefined): WorldPressureFlags {
  return {
    aiPressure: settings?.aiPressure ?? 'full',
    aiPressureVisibility: settings?.aiPressureVisibility ?? false,
    aiCrisisInteractions: settings?.aiCrisisInteractions ?? 'off',
  };
}
