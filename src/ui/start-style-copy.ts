import type { StartStyle } from '@/core/types/start-style';

/** Player-facing copy for the Start Style setting (design 2026-11-25, B3), shared by the solo and hot seat screens. */
export const START_STYLE_ORDER: readonly StartStyle[] = ['fair', 'varied', 'wild'];

export const START_STYLE_LABELS: Record<StartStyle, string> = {
  fair: 'Fair',
  varied: 'Varied',
  wild: 'Wild',
};

export const START_STYLE_DESCRIPTIONS: Record<StartStyle, string> = {
  fair: 'Starts are as even as the map allows, and the weaker ones get an extra food or production resource nearby.',
  varied: 'Every start is good land, with real differences between them. Civilizations lean a little toward land that suits them, such as Egypt by a river or the Vikings by the sea.',
  wild: 'Any start that meets the minimum. Expect bigger differences between starts, and civilizations that lean strongly toward land that suits them.',
};
