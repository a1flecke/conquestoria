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

  it('presents Chariot’s readable role, both technology gates, and explicit Knight upgrade', () => {
    expect(getUnitRolePresentation('chariot', ['wheel', 'horseback-riding'])).toMatchObject({
      summary: 'Heavy early charger gains 20% on open ground but loses 15% in rough terrain.',
      upgrade: { icon: '⬆️', text: 'Upgrades to Knight' },
      requirements: [
        { icon: '✓', text: 'The Wheel · Complete' },
        { icon: '✓', text: 'Horseback Riding · Complete' },
      ],
    });
  });

  it('presents Cuirassier as the concise heavy-cavalry route to Tank', () => {
    const presentation = getUnitRolePresentation('cuirassier', ['rifle-tactics', 'professional-army']);

    expect(presentation).toMatchObject({
      upgrade: { icon: '⬆️', text: 'Upgrades to Tank' },
      requirements: [
        { icon: '✓', text: 'Rifle Tactics · Complete' },
        { icon: '✓', text: 'Professional Army · Complete' },
      ],
      publicFacts: [
        { icon: '⚔️', text: '+15% attack on open ground' },
        { icon: '⚔️', text: 'Requires Horses and Iron' },
      ],
    });
    expect(presentation?.summary.split(/\s+/)).toHaveLength(10);
  });

  it('presents War Elephant tactical facts from typed role data', () => {
    expect(getUnitRolePresentation('war_elephant' as any, ['tactics'])).toMatchObject({
      summary: 'A powerful charger that thrives in open ground but fears polearms and rough terrain.',
      roleText: 'Role: shock',
      vulnerabilities: [{ icon: '⚠️', text: 'Vulnerable to anti-mounted units' }],
      publicFacts: [
        { icon: '⚔️', text: '+20% attack on open ground' },
        { icon: '⚔️', text: '−15% attack in forest, jungle, swamp, or hills' },
        { icon: '⚔️', text: 'Reduces non-polearm return damage by 15%' },
        { icon: '⚔️', text: 'Spearman and Pikeman gain +35% against this unit' },
        { icon: '⚔️', text: 'Live Ivory reduces new city production cost by 15%' },
      ],
    });
  });
});
