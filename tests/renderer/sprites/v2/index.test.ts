import { describe, it, expect } from 'vitest';
import {
  getUnitSpriteV2,
  isV2NativeUnit,
  getBuildingSpriteV2,
  getPirateHeadquartersSpriteV2,
  getImprovementSpriteV2,
} from '@/renderer/sprites/v2/index';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';

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

  it('falls back to a live-rendered sprite for a known unit type with an unrecognized faction (e.g. a minor civ)', () => {
    // Before #755's fix this silently returned null (static Canvas fallback forever) — 'warrior'
    // is a v2-native type, but 'unknownfaction' isn't one of the 6 baked archetype-family keys,
    // which is exactly what happens for any minor-civ-owned unit today (getFaction() returns the
    // raw owner id for any owner not in state.civilizations).
    const result = getUnitSpriteV2('warrior', 'unknownfaction', '#7a5a16');
    expect(result).not.toBeNull();
    expect(result).toContain('cq-sprite-wrap');
    expect(result).toContain('cq-v2');
  });

  it('returns a cq-sprite-wrap string for warrior/imperials', () => {
    const r = getUnitSpriteV2('warrior', 'imperials');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
    expect(r!).toContain('cq-v2');
  });
});

describe('late-era naval sprite output', () => {
  it.each(['carrack', 'galleon', 'steamship', 'troop_transport'])('%s never nests HTML inside its SVG', type => {
    const result = getUnitSpriteV2(type, 'imperials')!;
    expect(result).not.toMatch(/<svg\b[\s\S]*<div\b/);
    expect(result).toContain('cq-sprite-wrap');
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

  it('uses ship-family weapons for flotilla foundations', () => {
    expect(getPirateHeadquartersSpriteV2('pirate_flotilla_stage_2')).toContain('cq-flotilla-broadside');
    expect(getPirateHeadquartersSpriteV2('pirate_flotilla_stage_3')).toContain('cq-flotilla-broadside');
    expect(getPirateHeadquartersSpriteV2('pirate_flotilla_stage_4')).toContain('cq-flotilla-turret');
    expect(getPirateHeadquartersSpriteV2('pirate_flotilla_stage_5')).toContain('cq-flotilla-turret');
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

describe('full unit coverage — every catalog entry returns a cq-sprite-wrap for imperials (native or live-fallback)', () => {
  // Pirate hull types are deliberately faction-gated to 'pirates' only (see 'neutral pirate v2
  // sprites' above) — querying them with 'imperials' is supposed to return null, not a gap.
  const nonPirateTypes = Object.keys(UNIT_SPRITE_CATALOG)
    .filter(type => !(PIRATE_HULL_TYPES as readonly string[]).includes(type));

  it.each(nonPirateTypes)('%s', (type) => {
    const r = getUnitSpriteV2(type, 'imperials', '#4a90d9');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
    expect(r!).toContain('cq-v2');
  });
});

describe('isV2NativeUnit', () => {
  it('is true for a v2-native unit', () => {
    expect(isV2NativeUnit('archer')).toBe(true);
  });

  it('is false for a unit type that only has the live-fallback path', () => {
    expect(isV2NativeUnit('tank')).toBe(false);
  });

  it('is false for a genuinely unknown type', () => {
    expect(isV2NativeUnit('not-a-real-unit')).toBe(false);
  });
});

describe('#708 mounted and beast native sprites', () => {
  const ISSUE_708_NATIVE = {
    beast_handler: 'hound',
    war_elephant: 'animal',
    cuirassier: 'animal',
  } as const;
  const FACTIONS = ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate'];

  it.each(Object.entries(ISSUE_708_NATIVE))('%s is native v2 art with the documented body plan', (type, kind) => {
    expect(isV2NativeUnit(type)).toBe(true);
    for (const faction of FACTIONS) {
      const result = getUnitSpriteV2(type, faction)!;
      expect(result, `${type}/${faction}`).toContain('cq-sprite-wrap');
      expect(result, `${type}/${faction}`).toContain('cq-v2');
      expect(result, `${type}/${faction}`).toContain(`data-kind="${kind}"`);
    }
  });

  it('beast handler combines a hound gait with a visible command sigil', () => {
    const result = getUnitSpriteV2('beast_handler', 'imperials')!;
    expect(result).toContain('cq-command-sigil');
    expect(result).toContain('cq-leg-fl');
    expect(result).toContain('cq-leg-fr');
    expect(result).toContain('cq-leg-bl');
    expect(result).toContain('cq-leg-br');
  });

  it('war elephant has its own animal plan and readable siege-beast details', () => {
    const result = getUnitSpriteV2('war_elephant', 'imperials')!;
    expect(result).toContain('data-kind-variant="elephant"');
    expect(result).toContain('cq-elephant-trunk');
    expect(result).toContain('cq-howdah');
    expect(result).toContain('cq-rune-standard');
    expect(result).toContain('cq-leg-fl');
    expect(result).toContain('cq-leg-fr');
    expect(result).toContain('cq-leg-bl');
    expect(result).toContain('cq-leg-br');
  });

  it('cuirassier has a mounted animal plan and moonsteel attack-feedback hooks', () => {
    const result = getUnitSpriteV2('cuirassier', 'imperials')!;
    expect(result).toContain('data-kind-variant="mount"');
    expect(result).toContain('cq-moonsteel-inlay');
    expect(result).toContain('cq-weapon');
    expect(result).toContain('cq-hit-spark');
    expect(result).toContain('cq-leg-fl');
    expect(result).toContain('cq-leg-fr');
    expect(result).toContain('cq-leg-bl');
    expect(result).toContain('cq-leg-br');
  });
});

describe('#759 batch 1 — v2-native migration', () => {
  const MIGRATED = ['combat_drone', 'autonomous_frigate', 'exosuit_infantry', 'propagandist', 'drone_controller'];
  const EXPECTED_KIND: Record<string, string> = {
    combat_drone: 'civilian',
    autonomous_frigate: 'naval',
    exosuit_infantry: 'melee',
    propagandist: 'civilian',
    drone_controller: 'spy',
  };
  const NON_COMBAT = new Set(['propagandist', 'drone_controller']);

  it.each(MIGRATED)('%s is now v2-native, not live-fallback', (type) => {
    expect(isV2NativeUnit(type)).toBe(true);
  });

  it.each(MIGRATED)('%s renders with its documented data-kind for every faction', (type) => {
    for (const faction of ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate']) {
      const result = getUnitSpriteV2(type, faction)!;
      expect(result, `${type}/${faction}`).not.toBeNull();
      expect(result, `${type}/${faction}`).toContain(`data-kind="${EXPECTED_KIND[type]}"`);
    }
  });

  // combat_drone uses .cq-weapon (a mounted emitter that pivots) with an embedded .cq-hit-spark.
  // autonomous_frigate and exosuit_infantry deliberately skip .cq-weapon for their mounted
  // turret/rifle — a full swing looked physically wrong for a rigidly-mounted weapon — and use
  // .cq-muzzle-flash + body recoil (cq2-attack-body) instead. Each is a real, distinct
  // attack-feedback mechanism; there's no single class shared by all three combat units.
  const ATTACK_FEEDBACK_CLASS: Record<string, string> = {
    combat_drone: 'cq-hit-spark',
    autonomous_frigate: 'cq-muzzle-flash',
    exosuit_infantry: 'cq-muzzle-flash',
  };

  it.each(MIGRATED.filter(t => !NON_COMBAT.has(t)))('%s (combat unit) has an attack-feedback hook', (type) => {
    const result = getUnitSpriteV2(type, 'imperials')!;
    expect(result, type).toContain(ATTACK_FEEDBACK_CLASS[type]);
  });

  it.each([...NON_COMBAT])('%s (non-combat unit) has no .cq-weapon, .cq-hit-spark, or .cq-muzzle-flash', (type) => {
    const result = getUnitSpriteV2(type, 'imperials')!;
    expect(result, type).not.toContain('cq-weapon');
    expect(result, type).not.toContain('cq-hit-spark');
    expect(result, type).not.toContain('cq-muzzle-flash');
  });
});

describe('getUnitSpriteV2 — live fallback for uncovered unit types', () => {
  // Representative sample of units with no UNIT_SPRITES entry (confirmed via diff against
  // UNIT_SPRITE_CATALOG) — not exhaustive here; the full-catalog loop above covers all of them
  // for the "never null" guarantee. combat_drone was migrated to v2-native in #759 batch 1
  // (2026-07-31) and moved out of this sample accordingly — see the new describe block below
  // for its dedicated native-path coverage.
  const FALLBACK_TIER_SAMPLE = ['tank', 'rifleman', 'submarine', 'cannon', 'grenadier'];

  it.each(FALLBACK_TIER_SAMPLE)('%s renders via the live fallback, not v2-native', (type) => {
    expect(isV2NativeUnit(type)).toBe(false);
    const result = getUnitSpriteV2(type, 'imperials', '#4a90d9');
    expect(result, `${type} should not be null`).not.toBeNull();
  });

  it.each(FALLBACK_TIER_SAMPLE)('%s output has the animation hook point (cq-sprite-figure)', (type) => {
    const result = getUnitSpriteV2(type, 'imperials', '#4a90d9')!;
    expect(result).toContain('cq-sprite-wrap');
    expect(result).toContain('cq-v2');
    expect(result).toContain('cq-sprite-figure');
  });

  it.each(FALLBACK_TIER_SAMPLE)('%s output has exactly one width="100%" and one height="100%" on the outer <svg> tag, never a hardcoded pixel size', (type) => {
    const result = getUnitSpriteV2(type, 'imperials', '#4a90d9')!;
    // Scope the check to the <svg ...> opening tag itself, not the whole markup string — child
    // elements legitimately have their own width="N" attributes (e.g. a <rect width="6" .../>)
    // that have nothing to do with the sprite's overall display size.
    const svgTag = /<svg\b[^>]*>/.exec(result)![0];
    expect(svgTag.match(/width="100%"/g)?.length).toBe(1);
    expect(svgTag.match(/height="100%"/g)?.length).toBe(1);
    expect(svgTag).not.toMatch(/width="\d+"/);
    expect(svgTag).not.toMatch(/height="\d+"/);
  });

  it.each(FALLBACK_TIER_SAMPLE)('%s output does not contain data-kind (deliberately omitted for fallback-tier units)', (type) => {
    const result = getUnitSpriteV2(type, 'imperials', '#4a90d9')!;
    expect(result).not.toContain('data-kind');
  });

  it('does not throw and returns non-null for a missing civColor (falls back to NEUTRAL_FACTION_PALETTE)', () => {
    expect(() => getUnitSpriteV2('tank', 'imperials', '')).not.toThrow();
    const result = getUnitSpriteV2('tank', 'imperials', '');
    expect(result).not.toBeNull();
    expect(result).not.toMatch(/NaN/);
  });

  it('does not throw and returns non-null when civColor is omitted entirely', () => {
    expect(() => getUnitSpriteV2('tank', 'imperials')).not.toThrow();
    expect(getUnitSpriteV2('tank', 'imperials')).not.toBeNull();
  });
});

describe('getUnitSpriteV2 — structural guarantee (would have caught #755)', () => {
  it('never returns null for any type in UNIT_SPRITE_CATALOG, the canonical live unit roster', () => {
    // Pirate hull types are deliberately faction-gated (see 'neutral pirate v2 sprites' above) —
    // getUnitSpriteV2(pirateType, 'imperials') is SUPPOSED to return null, that's not a coverage
    // gap. This loop asserts the "never silently static" guarantee for every type that isn't
    // pirate-exclusive; pirate hull coverage is already asserted with the correct 'pirates'
    // faction in the dedicated describe block above.
    for (const type of Object.keys(UNIT_SPRITE_CATALOG)) {
      if ((PIRATE_HULL_TYPES as readonly string[]).includes(type)) continue;
      const result = getUnitSpriteV2(type, 'imperials', '#4a90d9');
      expect(result, `${type} returned null — silently stuck on static Canvas rendering`).not.toBeNull();
    }
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
