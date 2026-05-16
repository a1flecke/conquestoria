import {
  canBuildImprovement,
  canDrainSwamp,
  getAvailableWorkerActions,
  getImprovementDisplayName,
  getImprovementYieldBonus,
  getWorkerActionBlockerReason,
} from '@/systems/improvement-system';
import type { HexTile } from '@/core/types';

describe('canBuildImprovement', () => {
  it('allows farm on grassland', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'none', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    expect(canBuildImprovement(tile, 'farm')).toBe(true);
  });

  it('allows mine on hills', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'hills', elevation: 'highland',
      resource: null, improvement: 'none', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    expect(canBuildImprovement(tile, 'mine')).toBe(true);
  });

  it('does not allow farm on ocean', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'ocean', elevation: 'lowland',
      resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    expect(canBuildImprovement(tile, 'farm')).toBe(false);
  });

  it('does not allow building on already improved tile', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'farm', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    expect(canBuildImprovement(tile, 'mine')).toBe(false);
  });
});

describe('getImprovementYieldBonus', () => {
  it('farm gives food bonus', () => {
    const bonus = getImprovementYieldBonus('farm');
    expect(bonus.food).toBeGreaterThan(0);
  });

  it('mine gives production bonus', () => {
    const bonus = getImprovementYieldBonus('mine');
    expect(bonus.production).toBeGreaterThan(0);
  });

  it('none gives no bonus', () => {
    const bonus = getImprovementYieldBonus('none');
    expect(bonus.food + bonus.production + bonus.gold + bonus.science).toBe(0);
  });

  it('formats improvement names for player-facing text', () => {
    expect(getImprovementDisplayName('lumber_camp')).toBe('Lumber Camp');
    expect(getImprovementDisplayName('watermill')).toBe('Watermill');
    expect(getImprovementDisplayName('none')).toBe('None');
  });
});

describe('new terrain improvements', () => {
  it('can build farm on jungle', () => {
    const tile = { terrain: 'jungle', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false } as any;
    expect(canBuildImprovement(tile, 'farm')).toBe(true);
  });

  it('cannot build mine on swamp', () => {
    const tile = { terrain: 'swamp', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false } as any;
    expect(canBuildImprovement(tile, 'mine')).toBe(false);
  });

  it('can build mine on volcanic', () => {
    const tile = { terrain: 'volcanic', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false } as any;
    expect(canBuildImprovement(tile, 'mine')).toBe(true);
  });
});

describe('lumber camp and watermill eligibility', () => {
  function tile(overrides: Partial<HexTile>): HexTile {
    return {
      coord: { q: 0, r: 0 },
      terrain: 'grassland',
      elevation: 'lowland',
      resource: null,
      improvement: 'none',
      owner: 'p1',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      ...overrides,
    };
  }

  it('allows lumber camp on unimproved forest and jungle while preserving the terrain', () => {
    expect(canBuildImprovement(tile({ terrain: 'forest' }), 'lumber_camp')).toBe(true);
    expect(canBuildImprovement(tile({ terrain: 'jungle' }), 'lumber_camp')).toBe(true);
  });

  it('does not allow lumber camp on plains, swamp, or already improved forest', () => {
    expect(canBuildImprovement(tile({ terrain: 'plains' }), 'lumber_camp')).toBe(false);
    expect(canBuildImprovement(tile({ terrain: 'swamp' }), 'lumber_camp')).toBe(false);
    expect(canBuildImprovement(tile({ terrain: 'forest', improvement: 'farm' }), 'lumber_camp')).toBe(false);
  });

  it('allows watermill only on valid unimproved river land', () => {
    expect(canBuildImprovement(tile({ terrain: 'plains', hasRiver: true }), 'watermill')).toBe(true);
    expect(canBuildImprovement(tile({ terrain: 'forest', hasRiver: true }), 'watermill')).toBe(true);
    expect(canBuildImprovement(tile({ terrain: 'swamp', hasRiver: true }), 'watermill')).toBe(true);
  });

  it('does not allow watermill without river, on mountain, on coast, or on improved land', () => {
    expect(canBuildImprovement(tile({ terrain: 'plains', hasRiver: false }), 'watermill')).toBe(false);
    expect(canBuildImprovement(tile({ terrain: 'mountain', elevation: 'mountain', hasRiver: true }), 'watermill')).toBe(false);
    expect(canBuildImprovement(tile({ terrain: 'coast', hasRiver: true }), 'watermill')).toBe(false);
    expect(canBuildImprovement(tile({ terrain: 'plains', hasRiver: true, improvement: 'mine' }), 'watermill')).toBe(false);
  });

  it('rejects improvement actions on unowned or enemy-owned tiles when an owner is supplied', () => {
    expect(canBuildImprovement(tile({ terrain: 'forest', owner: null }), 'lumber_camp', [], 'p1')).toBe(false);
    expect(canBuildImprovement(tile({ terrain: 'forest', owner: 'enemy' }), 'lumber_camp', [], 'p1')).toBe(false);
    expect(canBuildImprovement(tile({ terrain: 'forest', owner: 'p1' }), 'lumber_camp', [], 'p1')).toBe(true);
  });

  it('returns no worker actions for unowned or enemy-owned valid terrain', () => {
    expect(getAvailableWorkerActions(tile({ terrain: 'forest', owner: null }), [], 'p1')).toEqual([]);
    expect(getAvailableWorkerActions(tile({ terrain: 'forest', owner: 'enemy' }), [], 'p1')).toEqual([]);
    expect(getAvailableWorkerActions(tile({ terrain: 'forest', owner: 'p1' }), [], 'p1')).toContain('lumber_camp');
  });

  it('rejects improvements and swamp drain on a city-center tile', () => {
    expect(canBuildImprovement(tile({ terrain: 'plains', owner: 'p1' }), 'farm', [], 'p1', { isCityTile: true })).toBe(false);
    expect(canBuildImprovement(tile({ terrain: 'hills', owner: 'p1' }), 'mine', [], 'p1', { isCityTile: true })).toBe(false);
    expect(canDrainSwamp(tile({ terrain: 'swamp', owner: 'p1' }), 'p1', { isCityTile: true })).toBe(false);
    expect(getAvailableWorkerActions(tile({ terrain: 'forest', owner: 'p1' }), [], 'p1', { isCityTile: true })).toEqual([]);
    expect(getAvailableWorkerActions(tile({ terrain: 'forest', owner: 'p1' }), [], 'p1')).toContain('lumber_camp');
  });

  it('returns expected yields for lumber camp and watermill', () => {
    expect(getImprovementYieldBonus('lumber_camp')).toEqual({ food: 0, production: 2, gold: 0, science: 0 });
    expect(getImprovementYieldBonus('watermill')).toEqual({ food: 1, production: 1, gold: 0, science: 0 });
  });

  it('explains outside-territory worker blockers before terrain blockers', () => {
    expect(getWorkerActionBlockerReason(tile({ terrain: 'forest', owner: 'enemy' }), 'farm', [], 'p1')).toBe('outside-territory');
    expect(getWorkerActionBlockerReason(tile({ terrain: 'forest', owner: null }), 'farm', [], 'p1')).toBe('outside-territory');
  });

  it('explains local worker blockers inside owned territory', () => {
    expect(getWorkerActionBlockerReason(tile({ terrain: 'plains', owner: 'p1', improvement: 'mine' }), 'farm', [], 'p1')).toBe('already-improved');
    expect(getWorkerActionBlockerReason(tile({ terrain: 'plains', owner: 'p1', hasRiver: false }), 'watermill', [], 'p1')).toBe('requires-river');
    expect(getWorkerActionBlockerReason(tile({ terrain: 'coast', owner: 'p1' }), 'farm', [], 'p1')).toBe('invalid-terrain');
  });
});
