import { describe, expect, it } from 'vitest';
import { formatCombatPreviewDetails } from '@/ui/combat-preview';

describe('formatCombatPreviewDetails', () => {
  it('shows the river crossing penalty when present', () => {
    const details = formatCombatPreviewDetails('Rival', 80, {
      attackerStrength: 8,
      defenderStrength: 10,
      terrainDefenseBonus: 0.25,
      riverAttackPenalty: -0.2,
    });

    expect(details).toContain('Rival');
    expect(details).toContain('HP: 80/100');
    expect(details).toContain('+25% terrain');
    expect(details).toContain('-20% river crossing');
  });

  it('does not claim a river crossing without a penalty', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 10,
      defenderStrength: 10,
      terrainDefenseBonus: 0,
      riverAttackPenalty: 0,
    });

    expect(details).not.toContain('river crossing');
  });
});
