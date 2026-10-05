import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateAITechCapabilities, getTechCombatEffectValue, getTechEconomicEffectValue } from '@/ai/ai-tech-evaluation';
import { BUILDINGS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { TECH_COST_DISCOUNTS, TECH_YIELD_MODIFIERS } from '@/systems/tech-yield-definitions';
import { UNIT_MODIFIERS } from '@/systems/unit-modifier-definitions';
import { buildTechAuditInventory } from '../helpers/tech-audit-inventory';
import { findRepeatedNiches } from '../helpers/tech-audit-judgement';
import { TECH_AUDIT_ENTRIES } from './tech-audit/tech-audit-data';

// #1306 (#420 child 5): the cross-era contract the whole arc leaves behind. These are structural checks over the
// final tables; per-tech behaviour lives in tech-strategic-eras-{1-4,5-8,9-11}.test.ts and the audit doc is pinned by
// tech-strategic-audit.test.ts.

const rows = buildTechAuditInventory();
const techEra = (id: string): number => TECH_TREE.find(t => t.id === id)?.era ?? 99;

/** Niches deliberately kept after the #1315 review: each is conditional on something the player builds, works or trades. Adding to a niche fails here. */
const REVIEWED_NICHES: Record<string, string[]> = {
  // Three per-farm rungs (+1 era 5, +2 era 7, +1 era 10): a deliberate agriculture-specialization ladder. The other
  // farm-era techs moved to terrain, plantation, ranch and population effects in #1315.
  'per-improvement:farm:food': ['agricultural-machinery', 'pesticides', 'plantation-farming'],
  // Partner-count gold repeated across eras 6, 11 and 12: the same diplomacy-scaled decision, hurt by war.
  // Factory-city production ladder (+4 era 7 mass-production, +2 era 10 titanium-processing, +2 era 11 precision-engineering):
  // one industrial specialization that deepens as a factory city matures (#1340 replaced mass-production's flat 10%).
  'city-if[any:factory]:production': ['mass-production', 'precision-engineering', 'titanium-processing'],
  'per-route-partner': ['arms-control-negotiations', 'globalization', 'mercantilism'],
};

describe('#420 cross-era validation (#1306)', () => {
  it('leaves no scheduled work: every Era 1-11 entry is KEEP or a FOLLOW-UP that names an issue', () => {
    const unfinished = Object.entries(TECH_AUDIT_ENTRIES)
      .filter(([id, entry]) => techEra(id) <= 11 && entry.child !== 0)
      .filter(([, entry]) => !(entry.cls === 'KEEP' || (entry.cls === 'FOLLOW-UP' && /#\d+/.test(entry.followUp ?? ''))))
      .map(([id, entry]) => `${id}: ${entry.cls}`);
    expect(unfinished).toEqual([]);
  });

  it('only Era 12+ reference techs still carry a REPLACE, TUNE or WIRE entry', () => {
    const open = Object.entries(TECH_AUDIT_ENTRIES)
      .filter(([, entry]) => entry.cls === 'REPLACE' || entry.cls === 'TUNE' || entry.cls === 'WIRE')
      .map(([id]) => id);
    expect(open.every(id => techEra(id) >= 12)).toBe(true);
  });

  it('keeps the repeated-niche set pinned to the reviewed list', () => {
    const actual = Object.fromEntries(findRepeatedNiches(rows).map(group => [group.signature, group.techIds]));
    expect(actual).toEqual(REVIEWED_NICHES);
  });

  it('has no duplicate yield or unit-modifier registrations', () => {
    const yieldKeys = TECH_YIELD_MODIFIERS.map(m => `${m.techId}|${m.label}`);
    expect(yieldKeys.filter((key, i) => yieldKeys.indexOf(key) !== i)).toEqual([]);
    const effectKeys = rows.flatMap(row => row.yieldEffects.map(e => `${row.id}|${e.signature}`));
    expect(effectKeys.filter((key, i) => effectKeys.indexOf(key) !== i)).toEqual([]);
    const modifierKeys = UNIT_MODIFIERS.map(m => `${m.source.kind}:${'id' in m.source ? m.source.id : ''}|${m.effect}|${m.label}|${m.when ?? 'always'}|${m.condition ?? ''}`);
    expect(modifierKeys.filter((key, i) => modifierKeys.indexOf(key) !== i)).toEqual([]);
    const discountKeys = TECH_COST_DISCOUNTS.map(d => `${d.techId}|${JSON.stringify(d.appliesTo)}`);
    expect(discountKeys.filter((key, i) => discountKeys.indexOf(key) !== i)).toEqual([]);
  });

  it('every building a tech condition names exists, so a typo cannot silently never pay', () => {
    const missing: string[] = [];
    const check = (techId: string, ids: readonly string[] | undefined) => {
      for (const id of ids ?? []) if (!BUILDINGS[id]) missing.push(`${techId}: ${id}`);
    };
    for (const { techId, effect } of TECH_YIELD_MODIFIERS) {
      if (effect.kind === 'cityFlatConditional') {
        check(techId, effect.requiresAnyBuilding);
        check(techId, effect.requiresAllBuildings);
        check(techId, effect.requiresMissingBuilding);
      }
      if (effect.kind === 'perBuildingId') check(techId, effect.buildingIds);
      if (effect.kind === 'perCityRoute') check(techId, [effect.requiresBuilding]);
    }
    expect(missing).toEqual([]);
  });

  it('every yield row belongs to a tech in the tree', () => {
    const known = new Set(TECH_TREE.map(t => t.id));
    expect(TECH_YIELD_MODIFIERS.filter(m => !known.has(m.techId)).map(m => m.techId)).toEqual([]);
    expect(TECH_COST_DISCOUNTS.filter(d => !known.has(d.techId)).map(d => d.techId)).toEqual([]);
  });

  it('a tech never quotes a number its yield rows do not use (Era 1-11)', () => {
    const NUMBER = /\d+(?:\.\d+)?/g;
    const mismatched: string[] = [];
    for (const tech of TECH_TREE.filter(t => t.era <= 11)) {
      const text = tech.unlocks.join(' ');
      for (const row of TECH_YIELD_MODIFIERS.filter(m => m.techId === tech.id)) {
        const missing = (row.label.match(NUMBER) ?? []).filter(n => !text.includes(n));
        if (missing.length > 0) mismatched.push(`${tech.id}: "${row.label}" not reflected in text (${missing.join(', ')})`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('the AI effect term is deterministic, bounded and reads no game state', () => {
    for (const tech of TECH_TREE.filter(t => t.era <= 12)) {
      expect(evaluateAITechCapabilities(tech)).toEqual(evaluateAITechCapabilities(tech));
      expect(getTechEconomicEffectValue(tech.id)).toBeLessThanOrEqual(3);
      expect(getTechCombatEffectValue(tech.id)).toBeLessThanOrEqual(0.5);
    }
    const source = readFileSync(join(process.cwd(), 'src/ai/ai-tech-evaluation.ts'), 'utf8');
    expect(source).not.toMatch(/GameState/);
    expect(source).not.toMatch(/Math\.random/);
  });

  it('every Era 1-11 tech with a table effect is visible to the AI (no effect-blind tech remains)', () => {
    const blind = rows
      .filter(row => row.era <= 11 && (row.yieldEffects.length > 0 || row.costDiscounts.length > 0))
      .filter(row => getTechEconomicEffectValue(row.id) === 0)
      .map(row => row.id);
    expect(blind).toEqual([]);
  });
});
