import type { GameSettings } from '@/core/types';

export type AiPressureFlag = 'off' | 'pirates' | 'full';
export type AiCrisisInteractionsFlag = 'off' | 'benign' | 'full';

export interface WorldPressureFlags {
  aiPressure: AiPressureFlag;
  aiPressureVisibility: boolean;
  aiCrisisInteractions: AiCrisisInteractionsFlag;
}

// Stage defaults: flipped by the final MR of each stage (MR 2/3 → aiPressure,
// MR 5 → visibility, MR 6/7 → interactions). Until then, dark.
export function resolveWorldPressureFlags(settings: GameSettings | undefined): WorldPressureFlags {
  return {
    aiPressure: settings?.aiPressure ?? 'off',
    aiPressureVisibility: settings?.aiPressureVisibility ?? false,
    aiCrisisInteractions: settings?.aiCrisisInteractions ?? 'off',
  };
}
