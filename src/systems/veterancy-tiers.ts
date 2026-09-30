/**
 * The veterancy ladder as pure data (#1014). A leaf: it imports nothing.
 *
 * Lives outside `combat-reward-system.ts` because `combat-reward-system` now applies the
 * beast-slay consequence (via `beast-system`), and `beast-system` needs the top tier for the
 * apex slayer's legendary veterancy. Both import this leaf instead of each other.
 */
export type VeterancyTierId = 'recruit' | 'seasoned' | 'veteran' | 'elite';

export interface VeterancyTier {
  id: VeterancyTierId;
  label: string;
  minExperience: number;
  combatModifier: number;
}

export const VETERANCY_TIERS: VeterancyTier[] = [
  { id: 'recruit', label: 'Recruit', minExperience: 0, combatModifier: 0 },
  { id: 'seasoned', label: 'Seasoned', minExperience: 10, combatModifier: 0.05 },
  { id: 'veteran', label: 'Veteran', minExperience: 25, combatModifier: 0.1 },
  { id: 'elite', label: 'Elite', minExperience: 50, combatModifier: 0.15 },
];
