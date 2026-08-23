import { describe, expect, it } from 'vitest';
import { classifyLandSupplyTerritory } from '@/systems/supply-territory';
import { createDiplomacyState, signTreaty } from '@/systems/diplomacy-system';

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

  it('an unconsumed Open Borders treaty does NOT make foreign territory allied — it has no movement/access effect anywhere in this codebase', () => {
    const state = makeTwoCivState();
    const withOpenBorders = {
      civilizations: {
        ...state.civilizations,
        rome: {
          diplomacy: signTreaty(state.civilizations.rome.diplomacy, 'rome', 'carthage', 'open_borders', -1, 1),
        },
      },
    };
    expect(classifyLandSupplyTerritory(withOpenBorders as any, 'rome', 'carthage')).toBe('hostile');
  });

  it('a barbarian- or minor-civ-owned tile is hostile (no access system exists)', () => {
    const state = makeTwoCivState();
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'barbarian')).toBe('hostile');
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'mc-1')).toBe('hostile');
  });
});
