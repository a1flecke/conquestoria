import { describe, it, expect } from 'vitest';
import {
  getUnitSpriteV2,
  getBuildingSpriteV2,
  getPirateHeadquartersSpriteV2,
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

const PIRATE_UNIT_TYPES = [
  'pirate_galley', 'pirate_corsair', 'pirate_frigate', 'pirate_ironclad',
  'pirate_fast_attack_craft', 'pirate_mothership',
];

describe('neutral pirate v2 sprites', () => {
  it.each(PIRATE_UNIT_TYPES)('%s resolves only through the neutral pirates family', (type) => {
    const result = getUnitSpriteV2(type, 'pirates');
    expect(result).not.toBeNull();
    expect(result).toContain('cq-v2');
    expect(result).toContain('data-kind="pirate-naval"');
    expect(getUnitSpriteV2(type, 'imperials')).toBeNull();
  });
});

const PIRATE_HEADQUARTERS_TYPES = [
  'pirate_enclave_stage_1', 'pirate_enclave_stage_2', 'pirate_enclave_stage_3',
  'pirate_enclave_stage_4', 'pirate_enclave_stage_5',
  'pirate_flotilla_stage_2', 'pirate_flotilla_stage_3', 'pirate_flotilla_stage_4',
  'pirate_flotilla_stage_5',
];

describe('neutral pirate headquarters v2 sprites', () => {
  it.each(PIRATE_HEADQUARTERS_TYPES)('%s has independent visual-state hooks', (type) => {
    const result = getPirateHeadquartersSpriteV2(type);
    expect(result).not.toBeNull();
    expect(result).toContain('data-kind="pirate-headquarters"');
    for (const hook of [
      'cq-surf', 'cq-flag', 'cq-defensive-fire', 'cq-collapse',
      'cq-blockade-ring', 'cq-relocation-heading',
      'cq-damage-1', 'cq-damage-2', 'cq-damage-3',
    ]) {
      expect(result, `${type} missing ${hook}`).toContain(hook);
    }
  });

  it.each([
    ['pirate_enclave_stage_1', 'cq-hidden-cove'],
    ['pirate_enclave_stage_2', 'cq-timber-jetty'],
    ['pirate_enclave_stage_3', 'cq-gun-cove'],
    ['pirate_enclave_stage_4', 'cq-raider-yard'],
    ['pirate_enclave_stage_5', 'cq-mercenary-compound'],
    ['pirate_flotilla_stage_2', 'cq-xebec-tenders'],
    ['pirate_flotilla_stage_3', 'cq-frigate-depot'],
    ['pirate_flotilla_stage_4', 'cq-steam-raiders'],
    ['pirate_flotilla_stage_5', 'cq-modern-flotilla'],
  ])('%s has its own foundation silhouette', (type, silhouette) => {
    expect(getPirateHeadquartersSpriteV2(type)).toContain(silhouette);
  });

  it('keeps tier overlays independent of the stage foundation', () => {
    const result = getPirateHeadquartersSpriteV2('pirate_enclave_stage_5')!;
    expect(result).toContain('cq-tier-hidden');
    expect(result).toContain('cq-tier-fortified');
    expect(result).toContain('cq-tier-stronghold');
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
