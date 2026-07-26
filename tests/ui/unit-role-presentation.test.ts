import { describe, expect, it } from 'vitest';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { getUnitRolePresentation } from '@/ui/unit-role-presentation';

describe('unit role presentation', () => {
  it('turns canonical counterplay into readable icon-and-text facts', () => {
    expect(getUnitRolePresentation('pikeman', ['fortification'])).toMatchObject({
      summary: 'Polearm defender that stops charging mounted attackers.',
      counters: [{ icon: '🎯', text: 'Strong against shock units' }],
      vulnerabilities: [
        { icon: '⚠️', text: 'Vulnerable to ranged units' },
        { icon: '⚠️', text: 'Vulnerable to siege units' },
      ],
    });
  });

  it('shows explicit terminal and conjunctive prerequisite facts without inferring a successor', () => {
    expect(getUnitRolePresentation('artillery', ['mass-firepower'])?.upgrade)
      .toEqual({ icon: '🏁', text: 'Current siege apex; rocket artillery is future content.' });

    const archer = TRAINABLE_UNITS.find(unit => unit.type === 'archer')!;
    const original = archer.requiredTechs;
    archer.requiredTechs = ['bronze-working'];
    try {
      expect(getUnitRolePresentation('archer', ['archery', 'bronze-working'])?.requirements)
        .toEqual([
          { icon: '✓', text: 'Archery · Complete' },
          { icon: '✓', text: 'Bronze Working · Complete' },
        ]);
    } finally {
      archer.requiredTechs = original;
    }
  });
});
