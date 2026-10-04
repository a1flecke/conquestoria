/**
 * The veterancy ladder (#1014) and the pure functions over it (#1248). A leaf: it imports only types.
 *
 * Lives outside `combat-reward-system.ts` because `combat-reward-system` now applies the
 * beast-slay consequence (via `beast-system`), and `beast-system` needs the top tier for the
 * apex slayer's legendary veterancy. Both import this leaf instead of each other.
 */
import type { Unit } from '@/core/types';

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

export function normalizedExperience(unit: Pick<Unit, 'experience'>): number {
  return Math.max(0, unit.experience ?? 0);
}

export function getVeterancyTierForExperience(experience: number): VeterancyTier {
  const xp = Math.max(0, experience);
  return [...VETERANCY_TIERS].reverse().find(tier => xp >= tier.minExperience) ?? VETERANCY_TIERS[0];
}

export function getVeterancyTier(unit: Pick<Unit, 'experience'>): VeterancyTier {
  return getVeterancyTierForExperience(normalizedExperience(unit));
}

export function getVeterancyCombatModifier(unit: Pick<Unit, 'experience'>): number {
  return getVeterancyTier(unit).combatModifier;
}

export function getExperienceToNextTier(unit: Pick<Unit, 'experience'>): number | null {
  const xp = normalizedExperience(unit);
  const next = VETERANCY_TIERS.find(tier => tier.minExperience > xp);
  return next ? next.minExperience - xp : null;
}
