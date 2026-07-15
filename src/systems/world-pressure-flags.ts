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
// true in #531 (MR5) -- this is the rollout mechanism: existing saves have no
// aiPressureVisibility field, so they pick up the new default on load. MR 6/7 flip
// interactions. Until then, that one stays dark.
export function resolveWorldPressureFlags(settings: GameSettings | undefined): WorldPressureFlags {
  return {
    aiPressure: settings?.aiPressure ?? 'full',
    aiPressureVisibility: settings?.aiPressureVisibility ?? true,
    aiCrisisInteractions: settings?.aiCrisisInteractions ?? 'off',
  };
}
