import { describe, it, expect } from 'vitest';
import { CIV_DEFINITIONS, getCivDefinition } from '@/systems/civ-definitions';

describe('civ-definitions', () => {
  it('defines exactly 27 civilizations', () => {
    expect(CIV_DEFINITIONS).toHaveLength(27);
  });

  it('each civ has unique id, name, and color', () => {
    const ids = CIV_DEFINITIONS.map(c => c.id);
    const names = CIV_DEFINITIONS.map(c => c.name);
    const colors = CIV_DEFINITIONS.map(c => c.color);
    expect(new Set(ids).size).toBe(27);
    expect(new Set(names).size).toBe(27);
    expect(new Set(colors).size).toBe(27);
  });

  it('getCivDefinition returns correct civ by id', () => {
    const egypt = getCivDefinition('egypt');
    expect(egypt).toBeDefined();
    expect(egypt!.name).toBe('Egypt');
    expect(egypt!.bonusEffect.type).toBe('faster_wonders');
  });

  it('getCivDefinition returns undefined for unknown id', () => {
    expect(getCivDefinition('unknown-civ')).toBeUndefined();
  });

  it('each civ has at least one personality trait', () => {
    for (const civ of CIV_DEFINITIONS) {
      expect(civ.personality.traits.length).toBeGreaterThan(0);
    }
  });

  it('egypt has faster_wonders bonus with 0.7 multiplier', () => {
    const egypt = getCivDefinition('egypt')!;
    expect(egypt.bonusEffect).toEqual({ type: 'faster_wonders', speedMultiplier: 0.7 });
  });

  it('mongolia has mounted_movement bonus', () => {
    const mongolia = getCivDefinition('mongolia')!;
    expect(mongolia.bonusEffect).toEqual({ type: 'mounted_movement', bonus: 1 });
  });

  it('zulu has faster_military bonus with 0.75 multiplier', () => {
    const zulu = getCivDefinition('zulu')!;
    expect(zulu.bonusEffect).toEqual({ type: 'faster_military', speedMultiplier: 0.75 });
  });

  it('greece has diplomacy_start_bonus of 20', () => {
    const greece = getCivDefinition('greece')!;
    expect(greece.bonusEffect).toEqual({ type: 'diplomacy_start_bonus', bonus: 20 });
  });

  it('china has extra_tech_speed bonus', () => {
    const china = getCivDefinition('china')!;
    expect(china.bonusEffect.type).toBe('extra_tech_speed');
  });

  it('india has faster_growth bonus', () => {
    const india = getCivDefinition('india')!;
    expect(india.bonusEffect.type).toBe('faster_growth');
  });

  it('japan has bushido bonus', () => {
    const japan = getCivDefinition('japan')!;
    expect(japan.bonusEffect.type).toBe('bushido');
  });

  it('persia has trade_route_bonus', () => {
    const persia = getCivDefinition('persia')!;
    expect(persia.bonusEffect.type).toBe('trade_route_bonus');
  });

  // M4a new civs
  it('france has culture_pressure bonus', () => {
    const france = getCivDefinition('france');
    expect(france).toBeDefined();
    expect(france!.name).toBe('France');
    expect(france!.bonusEffect.type).toBe('culture_pressure');
    expect(france!.personality.traits).toContain('diplomatic');
  });

  it('germany has industrial_efficiency bonus', () => {
    const germany = getCivDefinition('germany');
    expect(germany).toBeDefined();
    expect(germany!.name).toBe('Germany');
    expect(germany!.bonusEffect.type).toBe('industrial_efficiency');
  });

  it('gondor has fortified_defense bonus', () => {
    const gondor = getCivDefinition('gondor');
    expect(gondor).toBeDefined();
    expect(gondor!.name).toBe('Gondor');
    expect(gondor!.bonusEffect.type).toBe('fortified_defense');
    expect(gondor!.personality.traits).toContain('diplomatic');
  });

  it('rohan has grassland_cavalry_heal bonus', () => {
    const rohan = getCivDefinition('rohan');
    expect(rohan).toBeDefined();
    expect(rohan!.name).toBe('Rohan');
    expect(rohan!.bonusEffect.type).toBe('grassland_cavalry_heal');
  });

  // M4b1 new civs
  it('has russia with tundra_bonus', () => {
    const russia = getCivDefinition('russia');
    expect(russia).toBeDefined();
    expect(russia!.name).toBe('Russia');
    expect(russia!.bonusEffect.type).toBe('tundra_bonus');
  });

  it('has ottoman with siege_bonus', () => {
    const ottoman = getCivDefinition('ottoman');
    expect(ottoman).toBeDefined();
    expect(ottoman!.bonusEffect.type).toBe('siege_bonus');
  });

  it('has shire with peaceful_growth', () => {
    const shire = getCivDefinition('shire');
    expect(shire).toBeDefined();
    expect(shire!.bonusEffect.type).toBe('peaceful_growth');
  });

  it('has isengard with forest_industry', () => {
    const isengard = getCivDefinition('isengard');
    expect(isengard).toBeDefined();
    expect(isengard!.bonusEffect.type).toBe('forest_industry');
  });

  it('has spain with wonder_rewards', () => {
    const spain = getCivDefinition('spain');
    expect(spain).toBeDefined();
    expect(spain!.bonusEffect.type).toBe('wonder_rewards');
  });

  it('has viking with naval_raiding', () => {
    const viking = getCivDefinition('viking');
    expect(viking).toBeDefined();
    expect(viking!.bonusEffect.type).toBe('naval_raiding');
  });

  it('has prydain with homeland_defense', () => {
    const prydain = getCivDefinition('prydain');
    expect(prydain).toBeDefined();
    expect(prydain!.bonusEffect.type).toBe('homeland_defense');
  });

  it('has annuvin with espionage_growth', () => {
    const annuvin = getCivDefinition('annuvin');
    expect(annuvin).toBeDefined();
    expect(annuvin!.bonusEffect.type).toBe('espionage_growth');
  });

  it('includes the three M4d civilizations', () => {
    expect(getCivDefinition('lothlorien')).toBeDefined();
    expect(getCivDefinition('narnia')).toBeDefined();
    expect(getCivDefinition('atlantis')).toBeDefined();
  });

  it('keeps Lothlorien forest concealment and Atlantis naval power in the M4d roster', () => {
    expect(getCivDefinition('lothlorien')!.bonusDescription).toMatch(/forest/i);
    expect(getCivDefinition('atlantis')!.bonusDescription).toMatch(/naval/i);
  });

  it('all civs have valid personality traits', () => {
    const validTraits = ['aggressive', 'diplomatic', 'expansionist', 'trader'];
    for (const civ of CIV_DEFINITIONS) {
      for (const trait of civ.personality.traits) {
        expect(validTraits).toContain(trait);
      }
      expect(civ.personality.warLikelihood).toBeGreaterThanOrEqual(0);
      expect(civ.personality.warLikelihood).toBeLessThanOrEqual(1);
      expect(civ.personality.diplomacyFocus).toBeGreaterThanOrEqual(0);
      expect(civ.personality.diplomacyFocus).toBeLessThanOrEqual(1);
    }
  });
});
