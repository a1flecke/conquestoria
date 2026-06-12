import { describe, it, expect } from 'vitest';
import {
  getUnitSpriteV2,
  getBuildingSpriteV2,
  getImprovementSpriteV2,
} from '@/renderer/sprites/v2/index';

// All unit types that must have a v2 serialization (MR 1 + MR 2 + MR 4 + MR 6).
const ALL_SPRITE_UNIT_TYPES = [
  // MR 1 — already serialized
  'archer', 'galley', 'musketeer', 'pikeman', 'scout', 'scout_hound', 'settler',
  'shadow_warden', 'spy_agent', 'spy_hacker', 'spy_informant', 'spy_operative',
  'spy_scout', 'swordsman', 'trireme', 'war_hound', 'warrior', 'worker',
  // MR 2 — new
  'axeman', 'spearman', 'horseman', 'cavalry', 'knight',
  'crossbowman', 'catapult', 'ballista',
  'caravan', 'expedition', 'transport',
  // MR 4 — late-era naval
  'carrack', 'galleon', 'steamship', 'troop_transport',
  // MR 6 — legendary beasts
  'beast_boar',
];

// All building types that must have a v2 serialization (MR 1 + MR 3).
const ALL_SPRITE_BUILDING_TYPES = [
  // MR 1 — already serialized
  'amphitheater', 'aqueduct', 'archive', 'barracks', 'forge', 'forum',
  'granary', 'harbor', 'herbalist', 'intelligence-agency', 'library',
  'lumbermill', 'marketplace', 'monument', 'observatory', 'quarry-building',
  'safehouse', 'security-bureau', 'shrine', 'stable', 'temple', 'walls', 'workshop',
  // MR 3 — new
  'dock', 'bronze-workshop', 'armory', 'ranch', 'cavalry-academy', 'iron-foundry',
  'war-academy', 'masonry-works', 'siege-workshop', 'caravanserai', 'bank', 'stock_exchange',
];

describe('getUnitSpriteV2', () => {
  it('returns null for unknown type', () => {
    expect(getUnitSpriteV2('unknown', 'imperials')).toBeNull();
  });

  it('returns null for unknown faction', () => {
    expect(getUnitSpriteV2('warrior', 'unknownfaction')).toBeNull();
  });

  it('returns a cq-sprite-wrap string for warrior/imperials', () => {
    const r = getUnitSpriteV2('warrior', 'imperials');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
    expect(r!).toContain('cq-v2');
  });
});

describe('getBuildingSpriteV2', () => {
  it('returns null for unknown building', () => {
    expect(getBuildingSpriteV2('unknown', 'imperials')).toBeNull();
  });

  it('returns a sprite for granary/imperials', () => {
    const r = getBuildingSpriteV2('granary', 'imperials');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
  });
});

describe('getImprovementSpriteV2', () => {
  it('returns null (improvement markers use Canvas 2D, not DOM overlay)', () => {
    expect(getImprovementSpriteV2('farm')).toBeNull();
    expect(getImprovementSpriteV2('mine')).toBeNull();
  });
});

describe('beast_boar v2 sprite', () => {
  it('resolves for any faction via beast fallback key', () => {
    // Beast sprites are faction-neutral — they resolve regardless of faction string
    const result = getUnitSpriteV2('beast_boar', 'imperials');
    expect(result).not.toBeNull();
    expect(result!).toContain('cq-sprite-wrap');
    expect(result!).toContain('cq-v2');
  });

  it('has data-kind="beast" for bespoke animation selectors', () => {
    const result = getUnitSpriteV2('beast_boar', 'imperials');
    expect(result!).toContain('data-kind="beast"');
  });

  it('has data-damage="0" baked in as a safe default', () => {
    const result = getUnitSpriteV2('beast_boar', 'imperials');
    expect(result!).toContain('data-damage="0"');
  });

  it('contains all wound group classes for 4 damage tiers', () => {
    const result = getUnitSpriteV2('beast_boar', 'imperials');
    expect(result!).toContain('cq-wound-1');
    expect(result!).toContain('cq-wound-2');
    expect(result!).toContain('cq-wound-3');
  });

  it('contains breath puff classes for idle animation', () => {
    const result = getUnitSpriteV2('beast_boar', 'imperials');
    expect(result!).toContain('cq-breath');
  });

  it('contains all four leg hook classes for walk animation', () => {
    const result = getUnitSpriteV2('beast_boar', 'imperials');
    expect(result!).toContain('cq-leg--bf');
    expect(result!).toContain('cq-leg--ff');
    expect(result!).toContain('cq-leg--bn');
    expect(result!).toContain('cq-leg--fn');
  });

  it('contains head cluster for gore animation', () => {
    const result = getUnitSpriteV2('beast_boar', 'imperials');
    expect(result!).toContain('cq-boar-head');
  });

  it('contains tusk-tip and tusk-stub for near-death breakage', () => {
    const result = getUnitSpriteV2('beast_boar', 'imperials');
    expect(result!).toContain('cq-tusk-tip');
    expect(result!).toContain('cq-tusk-stub');
  });
});

describe('full unit coverage — every type returns a cq-sprite-wrap for imperials', () => {
  it.each(ALL_SPRITE_UNIT_TYPES)('%s', (type) => {
    const r = getUnitSpriteV2(type, 'imperials');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
    expect(r!).toContain('cq-v2');
  });
});

describe('full building coverage — every type returns a cq-sprite-wrap for imperials', () => {
  it.each(ALL_SPRITE_BUILDING_TYPES)('%s', (type) => {
    const r = getBuildingSpriteV2(type, 'imperials');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
    expect(r!).toContain('cq-v2');
  });
});
