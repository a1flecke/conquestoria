import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateAITechCapabilities } from '@/ai/ai-tech-evaluation';
import {
  BESPOKE_EFFECT_CAP,
  BESPOKE_TECH_EFFECTS,
  BESPOKE_TECH_VALUE_CAP,
  getBespokeTechEffects,
  getBespokeTechValue,
  INTENTIONALLY_ZERO_VALUE_TECHS,
} from '@/ai/ai-tech-bespoke-value';
import { TECH_TREE } from '@/systems/tech-definitions';
import { buildTechAuditInventory } from '../helpers/tech-audit-inventory';

// #1316: AI research understands the effects a human receives from technologies whose power lives in bespoke system code.

const inventory = buildTechAuditInventory(process.cwd(), 99);
const byId = new Map(inventory.map(row => [row.id, row]));
const hasCatalogEffect = (id: string): boolean => {
  const row = byId.get(id)!;
  return row.yieldEffects.length > 0 || row.costDiscounts.length > 0 || row.unitModifiers.length > 0;
};

describe('exhaustive bespoke tech valuation (#1316)', () => {
  it('classifies every technology that production code names', () => {
    const unclassified = inventory
      .filter(row => row.codeOwners.length > 0)
      .filter(row => !hasCatalogEffect(row.id))
      .filter(row => getBespokeTechEffects(row.id).length === 0)
      .filter(row => !(row.id in INTENTIONALLY_ZERO_VALUE_TECHS))
      .map(row => `${row.id} (${row.codeOwners.join(', ')})`);
    expect(unclassified).toEqual([]);
  });

  it('keeps explicit entries and zero-value reasons honest', () => {
    const known = new Set(TECH_TREE.map(tech => tech.id));
    expect(BESPOKE_TECH_EFFECTS.filter(item => !known.has(item.techId)).map(item => item.techId)).toEqual([]);
    expect(Object.keys(INTENTIONALLY_ZERO_VALUE_TECHS).filter(id => !known.has(id))).toEqual([]);
    expect(BESPOKE_TECH_EFFECTS.filter(item => item.rationale.trim().length < 8).map(item => item.techId)).toEqual([]);
    expect(Object.entries(INTENTIONALLY_ZERO_VALUE_TECHS).filter(([, reason]) => reason.trim().length < 12).map(([id]) => id)).toEqual([]);
    // Every entry must name a tech production code actually references, so the lists cannot rot.
    const unreferenced = [
      ...BESPOKE_TECH_EFFECTS.map(item => item.techId),
      ...Object.keys(INTENTIONALLY_ZERO_VALUE_TECHS),
    ].filter(id => (byId.get(id)?.codeOwners.length ?? 0) === 0);
    expect(unreferenced).toEqual([]);
  });

  it('never lists a technology both as valued and as intentionally zero', () => {
    const valued = new Set(BESPOKE_TECH_EFFECTS.map(item => item.techId));
    expect(Object.keys(INTENTIONALLY_ZERO_VALUE_TECHS).filter(id => valued.has(id) || getBespokeTechValue(id) > 0)).toEqual([]);
  });
});

describe('bespoke value is bounded (#1316)', () => {
  it('caps each effect and each technology', () => {
    for (const tech of TECH_TREE) {
      expect(getBespokeTechValue(tech.id), tech.id).toBeLessThanOrEqual(BESPOKE_TECH_VALUE_CAP);
      for (const item of getBespokeTechEffects(tech.id)) {
        expect(item.value, `${tech.id}/${item.category}`).toBeGreaterThan(0);
      }
    }
    expect(BESPOKE_TECH_EFFECTS.every(item => item.value <= BESPOKE_EFFECT_CAP)).toBe(true);
  });

  it('stays smaller than the value of a unit or building unlock and era progress', () => {
    // A tech whose only claim is bespoke effects must never outrank the era progress term every tech already carries.
    expect(BESPOKE_TECH_VALUE_CAP).toBeLessThan(1.5);
    const capabilities = evaluateAITechCapabilities(TECH_TREE.find(tech => tech.id === 'black-chambers')!);
    expect(capabilities.bespokeEffectValue).toBeGreaterThan(0);
    expect(capabilities.bespokeEffectValue).toBeLessThanOrEqual(BESPOKE_TECH_VALUE_CAP);
    expect(capabilities.eraProgress).toBeGreaterThan(capabilities.bespokeEffectValue);
  });
});

describe('what the AI now sees (#1316)', () => {
  const value = (id: string): number => getBespokeTechValue(id);

  it('values espionage techs from the typed modifier rows and spy-slot ladder', () => {
    expect(value('secret-police')).toBeCloseTo(0.6 + 0.2); // -0.30 success and +0.10 detection
    expect(value('political-intelligence')).toBeGreaterThan(value('black-chambers'));
    expect(getBespokeTechEffects('covert-operations').map(item => item.rationale).join(' ')).toMatch(/spy slot/);
  });

  it('values crisis interventions from the crisis interaction table', () => {
    expect(getBespokeTechEffects('medicine').some(item => item.category === 'crisis')).toBe(true);
    expect(getBespokeTechEffects('trade-routes').some(item => item.category === 'crisis')).toBe(true);
  });

  it('values road-connected-city gold, city maturity, and the defender bonus', () => {
    expect(value('courier-network')).toBeGreaterThan(0);
    expect(getBespokeTechEffects('foundations').some(item => item.category === 'city-development')).toBe(true);
    expect(value('professional-army')).toBeGreaterThan(0);
  });

  it('leaves intentionally zero techs at zero', () => {
    for (const id of Object.keys(INTENTIONALLY_ZERO_VALUE_TECHS)) expect(value(id), id).toBe(0);
  });
});

describe('fairness (#1316)', () => {
  const source = readFileSync(join(process.cwd(), 'src/ai/ai-tech-bespoke-value.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('reads no game state, opponent data, difficulty or randomness', () => {
    expect(code).not.toMatch(/GameState|opponentChallenge|challenge|difficulty|Math\.random|createSimulationRng|visibility|perception/i);
  });

  it('is a pure function of the tech id', () => {
    for (const tech of TECH_TREE) expect(getBespokeTechValue(tech.id)).toBe(getBespokeTechValue(tech.id));
  });

  it('has no technology-id branches in the valuation code', () => {
    const body = code.slice(code.indexOf('function deriveEspionageModifierEffects'));
    expect(body).not.toMatch(/techId\s*===|id\s*===\s*'/);
  });
});
