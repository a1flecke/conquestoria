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

  it('uses the canonical applied modifier fact in the preview rather than reconstructing a label', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 15,
      defenderStrength: 10,
      terrainDefenseBonus: 0,
      riverAttackPenalty: 0,
      attackerModifierFacts: [{
        key: 'counter:anti-cavalry', label: 'Anti-cavalry', sourceVisibility: 'public',
        operation: 'multiplier', value: 1.5, outcome: 'applied',
      }],
    });

    expect(details).toContain('Anti-cavalry ×1.5');
  });

  it('keeps the owner-visible combined-arms reason when another modifier is active', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 72, defenderStrength: 40, terrainDefenseBonus: 0, riverAttackPenalty: 0,
      attackerModifierFacts: [
        { key: 'tactics', label: 'Tactics', sourceVisibility: 'owner', operation: 'multiplier', value: 1.1, outcome: 'applied' },
        { key: 'combined-arms', label: 'Combined arms +10% — adjacent Mechanized Infantry', sourceVisibility: 'owner', operation: 'multiplier', value: 1.1, outcome: 'applied' },
      ],
    });

    expect(details).toContain('Tactics ×1.1');
    expect(details).toContain('Combined arms +10% — adjacent Mechanized Infantry ×1.1');
  });

  it('does not leak an unseen defender combined-arms provider to the attacker', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 45, defenderStrength: 79.2, terrainDefenseBonus: 0, riverAttackPenalty: 0,
      defenderModifierFacts: [{
        key: 'combined-arms', label: 'Combined arms +10% — adjacent Exosuit Infantry',
        sourceVisibility: 'owner', operation: 'multiplier', value: 1.1, outcome: 'applied',
      }],
    });

    expect(details).not.toContain('Combined arms');
    expect(details).not.toContain('Exosuit Infantry');
  });

  it('shows the initiating player when Cuirassier open-ground charge is not active without leaking defender facts', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 52,
      defenderStrength: 40,
      terrainDefenseBonus: 0.25,
      riverAttackPenalty: 0,
      attackerModifierFacts: [{
        key: 'unit:cuirassier:open-ground', label: 'Cuirassier open-ground charge',
        sourceVisibility: 'owner', operation: 'multiplier', value: 1.15, outcome: 'ignored',
      }],
      defenderModifierFacts: [{
        key: 'secret:defender', label: 'Hidden defender advantage',
        sourceVisibility: 'owner', operation: 'flat', value: 9, outcome: 'ignored',
      }],
    });

    expect(details).toContain('Cuirassier open-ground charge ×1.15 (not active)');
    expect(details).not.toContain('Hidden defender advantage');
  });

  it('shows canonical defender air-defense facts without inspecting city buildings', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 15, defenderStrength: 18, terrainDefenseBonus: 0, riverAttackPenalty: 0,
      defenderModifierFacts: [{ key: 'air-defense:city:alpha:anti_air_battery', label: 'Anti-Air Battery', sourceVisibility: 'owner', operation: 'flat', value: 8, outcome: 'applied' }],
    });

    expect(details).toContain('Anti-Air Battery +8');
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

    expect(details).toContain('Bombard units defend poorly (−50%)');
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

  it('explains reduced bomber turret fire before an interception', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 50,
      defenderStrength: 24,
      terrainDefenseBonus: 0,
      riverAttackPenalty: 0,
      exchange: {
        kind: 'turret-fire',
        defenderCounterDamageMultiplier: 0.25,
        defenderIncomingDamageMultiplier: 1,
        label: 'Bomber gunners fire back weakly: 25% return fire',
      },
    });

    expect(details).toContain('Bomber gunners fire back weakly: 25% return fire');
  });

  it('explains War Elephant shock as a public exchange effect', () => {
    const details = formatCombatPreviewDetails('Rival', 100, {
      attackerStrength: 43,
      defenderStrength: 32,
      terrainDefenseBonus: 0,
      riverAttackPenalty: 0,
      exchange: {
        kind: 'shock',
        defenderCounterDamageMultiplier: 0.85,
        defenderIncomingDamageMultiplier: 1,
        label: 'War Elephant shock: −15% return damage',
      },
    });

    expect(details).toContain('War Elephant shock: −15% return damage');
  });
});
