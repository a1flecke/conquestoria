import type { CombatStrengthBreakdown } from '@/systems/combat-system';

export function formatCombatPreviewDetails(
  ownerName: string,
  defenderHealth: number,
  preview: CombatStrengthBreakdown,
): string {
  const details = [ownerName, `HP: ${defenderHealth}/100`];
  if (preview.terrainDefenseBonus > 0) {
    details.push(`+${Math.round(preview.terrainDefenseBonus * 100)}% terrain`);
  }
  if (preview.riverAttackPenalty < 0) {
    details.push(`${Math.round(preview.riverAttackPenalty * 100)}% river crossing`);
  }
  return details.join(' | ');
}
