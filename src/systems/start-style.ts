import type { StartStyle } from '@/core/types/start-style';

/**
 * Start style (design 2026-11-25, B3): one table for what each style changes. The start floor and the distance rules
 * are identical in every style, and difficulty never changes placement.
 *
 * - `pickNoise`: seeded noise on each greedy pick, in score points; more noise explores more different layouts, so
 *   an unbounded band has genuinely different layouts to draw from.
 * - `preferEven`: draw only from the most even qualifying layouts (the smallest strongest-to-weakest gap).
 * - `band`: a layout qualifies when its weakest start scores within this fraction of the best layout found
 *   (`Infinity` = any layout that meets the floor and the distance rules, drawn uniformly).
 * - `preferenceWeight`: how strongly civilizations lean toward land that suits them when the chosen starts are
 *   assigned (`start-preferences.ts`); 0 = the assignment placement made before preferences existed.
 * - `topUpWeakStarts`: weak starts get a food or production resource toward the median start (`normaliseFairStarts`).
 */
export interface StartStyleRules {
  band: number;
  pickNoise: number;
  preferEven: boolean;
  preferenceWeight: number;
  topUpWeakStarts: boolean;
}

export const START_STYLE_RULES: Record<StartStyle, StartStyleRules> = {
  fair: { band: 0.05, pickNoise: 0.05, preferEven: true, preferenceWeight: 0.5, topUpWeakStarts: true },
  varied: { band: 0.15, pickNoise: 0.05, preferEven: false, preferenceWeight: 1, topUpWeakStarts: false },
  wild: { band: Infinity, pickNoise: 6, preferEven: false, preferenceWeight: 2, topUpWeakStarts: false },
};

/**
 * A game created without a style (every save before this setting, and `createNewGame` without the override) places
 * starts exactly as before: the Varied band, no preferences, no top-up. Pinned equal to `START_SELECTION`.
 */
export const LEGACY_START_STYLE_RULES: StartStyleRules = { band: 0.15, pickNoise: 0.05, preferEven: false, preferenceWeight: 0, topUpWeakStarts: false };

export function resolveStartStyleRules(style: StartStyle | undefined): StartStyleRules {
  return style ? START_STYLE_RULES[style] : LEGACY_START_STYLE_RULES;
}
