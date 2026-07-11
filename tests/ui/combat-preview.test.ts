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

  it('shows city defense modifier lines when the defender is in a walled city', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 10,
      defenderStrength: 12.5,
      terrainDefenseBonus: 0,
      riverAttackPenalty: 0,
      cityDefense: {
        multiplier: 1.25,
        flatBonus: 0,
        parts: [{ source: 'walls', label: 'Walls ×1.25', kind: 'mult', value: 1.25 }],
      },
    });

    expect(details).toContain('Walls ×1.25');
  });

  it('omits city defense modifier lines when the defender is not in a city (negative test)', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 10,
      defenderStrength: 10,
      terrainDefenseBonus: 0,
      riverAttackPenalty: 0,
    });

    expect(details).not.toContain('Walls');
    expect(details).not.toContain('Star Fort');
    expect(details).not.toContain('Professional Army');
  });

  it('shows the bombard defense penalty when the defender is a bombard-kind unit', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 10,
      defenderStrength: 10,
      terrainDefenseBonus: 0,
      riverAttackPenalty: 0,
      defenderDefendsPoorly: true,
    });

    expect(details).toContain('Siege defends poorly (−50%)');
  });

  it('omits the bombard defense penalty line for a normal defender (negative test)', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 10,
      defenderStrength: 10,
      terrainDefenseBonus: 0,
      riverAttackPenalty: 0,
      defenderDefendsPoorly: false,
    });

    expect(details).not.toContain('defends poorly');
  });
});
