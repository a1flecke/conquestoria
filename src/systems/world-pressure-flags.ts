import type { GameSettings } from '@/core/types';

export type AiPressureFlag = 'off' | 'pirates' | 'full';
export type AiCrisisInteractionsFlag = 'off' | 'benign' | 'full';

export interface WorldPressureFlags {
  aiPressure: AiPressureFlag;
  aiPressureVisibility: boolean;
  aiCrisisInteractions: AiCrisisInteractionsFlag;
}

// Stage defaults: flipped by the final MR of each stage. aiPressure flipped to
// 'pirates' in #528 (MR2), then 'full' in #529 (MR3); aiPressureVisibility flipped to
// true in #531 (MR5); aiCrisisInteractions flipped to 'benign' in #532 (MR6), then
// 'full' in #533 (MR7) -- this is the rollout mechanism: existing saves have no
// aiCrisisInteractions field, so they pick up exploit-weakness/sabotage-relief on load.
export function resolveWorldPressureFlags(settings: GameSettings | undefined): WorldPressureFlags {
  return {
    aiPressure: settings?.aiPressure ?? 'full',
    aiPressureVisibility: settings?.aiPressureVisibility ?? true,
    aiCrisisInteractions: settings?.aiCrisisInteractions ?? 'full',
  };
}
