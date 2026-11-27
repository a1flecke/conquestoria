/** Start style (design 2026-11-25, B3): how even the starting land is between civilizations. */
export type StartStyle = 'fair' | 'varied' | 'wild';

/** `frozen-tolerant` / `desert-tolerant` only remove the penalty every other civilization pays for that land. */
export type StartPreference = 'coastal' | 'river' | 'hills' | 'forest' | 'frozen-tolerant' | 'desert-tolerant';
