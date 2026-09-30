import { describe, expect, it } from 'vitest';
import { classifyLandSupplyTerritory } from '@/systems/supply-territory';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { signTreaty } from '@/systems/diplomacy-treaties';

describe('classifyLandSupplyTerritory', () => {
  function makeTwoCivState() {
    const romeDiplomacy = createDiplomacyState(['rome', 'carthage'], 'rome');
    const carthageDiplomacy = createDiplomacyState(['rome', 'carthage'], 'carthage');
    return {
      civilizations: {
        rome: { diplomacy: romeDiplomacy } as any,
        carthage: { diplomacy: carthageDiplomacy } as any,
      },
    };
  }

  it("the viewer's own tile is friendly", () => {
    const state = makeTwoCivState();
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'rome')).toBe('friendly');
  });

  it('an unowned tile is unclaimed', () => {
    const state = makeTwoCivState();
    expect(classifyLandSupplyTerritory(state as any, 'rome', null)).toBe('unclaimed');
  });

  it('another major civ\'s tile with no alliance is hostile, even with no war declared', () => {
    const state = makeTwoCivState();
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'carthage')).toBe('hostile');
  });

  it('another major civ\'s tile IS allied once an alliance treaty is signed', () => {
    const state = makeTwoCivState();
    const withTreaty = {
      civilizations: {
        ...state.civilizations,
        rome: {
          diplomacy: signTreaty(state.civilizations.rome.diplomacy, 'rome', 'carthage', 'alliance', -1, 1),
        },
      },
    };
    expect(classifyLandSupplyTerritory(withTreaty as any, 'rome', 'carthage')).toBe('allied');
  });

  const withTreaty = (type: 'open_borders' | 'alliance' | 'non_aggression_pact' | 'trade_agreement', both = false) => {
    const state = makeTwoCivState();
    const rome = { diplomacy: signTreaty(state.civilizations.rome.diplomacy, 'rome', 'carthage', type, -1, 1) };
    const carthage = both
      ? { diplomacy: signTreaty(state.civilizations.carthage.diplomacy, 'carthage', 'rome', type, -1, 1) }
      : state.civilizations.carthage;
    return { civilizations: { rome, carthage } };
  };

  it('Open Borders is its own class: passage was granted (#871) but it is NOT supply -- distinct from both allied and hostile', () => {
    expect(classifyLandSupplyTerritory(withTreaty('open_borders') as any, 'rome', 'carthage')).toBe('permitted');
    expect(classifyLandSupplyTerritory(withTreaty('open_borders', true) as any, 'carthage', 'rome')).toBe('permitted');
  });

  it('an alliance outranks Open Borders when both are signed', () => {
    const state = withTreaty('open_borders') as any;
    state.civilizations.rome.diplomacy = signTreaty(state.civilizations.rome.diplomacy, 'rome', 'carthage', 'alliance', -1, 1);
    expect(classifyLandSupplyTerritory(state, 'rome', 'carthage')).toBe('allied');
  });

  it('a non-aggression pact or trade agreement grants nothing: still hostile (they grant no passage either)', () => {
    expect(classifyLandSupplyTerritory(withTreaty('non_aggression_pact') as any, 'rome', 'carthage')).toBe('hostile');
    expect(classifyLandSupplyTerritory(withTreaty('trade_agreement') as any, 'rome', 'carthage')).toBe('hostile');
  });

  it('war overrides any passage treaty: enemy land is hostile', () => {
    const state = withTreaty('open_borders', true) as any;
    state.civilizations.rome.diplomacy = { ...state.civilizations.rome.diplomacy, atWarWith: ['carthage'] };
    state.civilizations.carthage.diplomacy = { ...state.civilizations.carthage.diplomacy, atWarWith: ['rome'] };
    expect(classifyLandSupplyTerritory(state, 'rome', 'carthage')).toBe('hostile');
  });

  it('overlord and vassal stand as allies on each other\'s land, in both directions', () => {
    const state = makeTwoCivState() as any;
    state.civilizations.rome.diplomacy = { ...state.civilizations.rome.diplomacy, vassalage: { ...state.civilizations.rome.diplomacy.vassalage, overlord: 'carthage' } };
    state.civilizations.carthage.diplomacy = { ...state.civilizations.carthage.diplomacy, vassalage: { ...state.civilizations.carthage.diplomacy.vassalage, vassals: ['rome'] } };
    expect(classifyLandSupplyTerritory(state, 'rome', 'carthage')).toBe('allied');
    expect(classifyLandSupplyTerritory(state, 'carthage', 'rome')).toBe('allied');
  });

  it('the class is derived from the ONE territorial relation vocabulary (#871), never a second treaty read', () => {
    const cases: Array<[Parameters<typeof withTreaty>[0] | null, string]> = [['open_borders', 'permitted'], ['alliance', 'allied'], [null, 'hostile']];
    for (const [type, want] of cases) {
      const state = (type ? withTreaty(type) : makeTwoCivState()) as any;
      expect(classifyLandSupplyTerritory(state, 'rome', 'carthage')).toBe(want);
    }
  });

  it('a barbarian- or minor-civ-owned tile is hostile (no diplomatic standing to grant support)', () => {
    const state = makeTwoCivState();
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'barbarian')).toBe('hostile');
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'mc-1')).toBe('hostile');
  });
});
