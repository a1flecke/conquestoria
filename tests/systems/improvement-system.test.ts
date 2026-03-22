import { canBuildImprovement, getImprovementYieldBonus } from '@/systems/improvement-system';
import type { HexTile } from '@/core/types';

describe('canBuildImprovement', () => {
  it('allows farm on grassland', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'none', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false,
    };
    expect(canBuildImprovement(tile, 'farm')).toBe(true);
  });

  it('allows mine on hills', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'hills', elevation: 'highland',
      resource: null, improvement: 'none', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false,
    };
    expect(canBuildImprovement(tile, 'mine')).toBe(true);
  });

  it('does not allow farm on ocean', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'ocean', elevation: 'lowland',
      resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false,
    };
    expect(canBuildImprovement(tile, 'farm')).toBe(false);
  });

  it('does not allow building on already improved tile', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'farm', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false,
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
