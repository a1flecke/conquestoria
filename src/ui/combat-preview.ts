import type { CombatStrengthBreakdown } from '@/systems/combat-system';

// The renderer only consumes display fields. Keep it compatible with legacy/mock
// previews that predate an exchange summary while combat calculations always emit one.
type CombatPreviewDetails = Omit<CombatStrengthBreakdown, 'exchange'>
  & Partial<Pick<CombatStrengthBreakdown, 'exchange'>>;

export function formatCombatPreviewDetails(
  ownerName: string,
  defenderHealth: number,
  preview: CombatPreviewDetails,
): string {
  const details = [ownerName, `HP: ${defenderHealth}/100`];
  if (preview.terrainDefenseBonus > 0) {
    details.push(`+${Math.round(preview.terrainDefenseBonus * 100)}% terrain`);
  }
  if (preview.riverAttackPenalty < 0) {
    details.push(`${Math.round(preview.riverAttackPenalty * 100)}% river crossing`);
  }
  const appliedFacts = [
    ...(preview.attackerModifierFacts ?? []),
    ...(preview.defenderModifierFacts ?? []),
  ].filter(fact => fact.outcome === 'applied');
  if (appliedFacts.length > 0) {
    const decisive = appliedFacts[0]!;
    const value = decisive.operation === 'multiplier'
      ? `×${decisive.value}`
      : `${decisive.value >= 0 ? '+' : ''}${decisive.value}`;
    details.push(`${decisive.label} ${value}`);
  } else {
    for (const part of preview.attackerModifierParts ?? []) {
      details.push(part.label);
    }
    for (const part of preview.defenderModifierParts ?? []) {
      details.push(part.label);
    }
  }
  for (const fact of preview.attackerModifierFacts ?? []) {
    if (fact.outcome !== 'ignored') continue;
    const value = fact.operation === 'multiplier'
      ? `×${fact.value}`
      : `${fact.value >= 0 ? '+' : ''}${fact.value}`;
    details.push(`${fact.label} ${value} (not active)`);
  }
  for (const part of preview.cityDefense?.parts ?? []) {
    details.push(part.label);
  }
  if (preview.defenderDefendsPoorly) {
    details.push('Bombard units defend poorly (−50%)');
  }
  if (preview.exchange?.label) {
    details.push(preview.exchange.label);
  }
  return details.join(' | ');
}
