import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  UNIT_SFX,
  MOVEMENT_SFX,
  allSfxEntries,
  getLocomotionClass,
  PIRATE_MOVEMENT_SFX,
  PIRATE_HEADQUARTERS_SFX,
  PIRATE_STRATEGIC_SFX,
  type LocomotionClass,
  type PirateUnitType,
} from '../../src/audio/sfx-catalog';
import type { UnitType } from '../../src/core/types';

// Resolve relative to this test file so disk checks work in both the main worktree
// and git worktrees (where process.cwd() points to the main root, not the worktree).
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const COMBAT_MELEE_TYPES: UnitType[] = [
  'warrior', 'axeman', 'spearman', 'swordsman', 'pikeman', 'musketeer',
  'horseman', 'cavalry', 'knight',
  'galley', 'trireme',
  'shadow_warden', 'scout_hound', 'war_hound',
];
const RANGED_TYPES: UnitType[] = ['archer', 'crossbowman'];
const SIEGE_TYPES: UnitType[] = ['catapult', 'ballista'];
const NON_COMBAT_TYPES: UnitType[] = ['settler', 'worker', 'caravan', 'scout', 'expedition', 'transport'];
const SPY_TYPES: UnitType[] = ['spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker'];
const ALL_LOCOMOTION_CLASSES: LocomotionClass[] = ['humanoid', 'animal', 'naval', 'air'];
const PIRATE_TYPES: PirateUnitType[] = [
  'pirate_galley', 'pirate_corsair', 'pirate_frigate', 'pirate_ironclad',
  'pirate_fast_attack_craft', 'pirate_mothership',
];

describe('sfx-catalog completeness', () => {
  it('every combat melee unit has attack-swing, attack-impact, and death', () => {
    for (const unitType of COMBAT_MELEE_TYPES) {
      const sfx = UNIT_SFX[unitType];
      expect(sfx, `UNIT_SFX missing for ${unitType}`).toBeDefined();
      expect(sfx!['attack-swing'],  `${unitType} missing attack-swing`).toBeDefined();
      expect(sfx!['attack-impact'], `${unitType} missing attack-impact`).toBeDefined();
      expect(sfx!['death'],         `${unitType} missing death`).toBeDefined();
    }
  });

  it('every ranged unit has attack-swing, ranged-loose, ranged-impact, and death', () => {
    for (const unitType of RANGED_TYPES) {
      const sfx = UNIT_SFX[unitType];
      expect(sfx, `UNIT_SFX missing for ${unitType}`).toBeDefined();
      expect(sfx!['attack-swing'],  `${unitType} missing attack-swing`).toBeDefined();
      expect(sfx!['ranged-loose'],  `${unitType} missing ranged-loose`).toBeDefined();
      expect(sfx!['ranged-impact'], `${unitType} missing ranged-impact`).toBeDefined();
      expect(sfx!['death'],         `${unitType} missing death`).toBeDefined();
    }
  });

  it('every siege unit has siege-fire, siege-impact, and death', () => {
    for (const unitType of SIEGE_TYPES) {
      const sfx = UNIT_SFX[unitType];
      expect(sfx, `UNIT_SFX missing for ${unitType}`).toBeDefined();
      expect(sfx!['siege-fire'],   `${unitType} missing siege-fire`).toBeDefined();
      expect(sfx!['siege-impact'], `${unitType} missing siege-impact`).toBeDefined();
      expect(sfx!['death'],        `${unitType} missing death`).toBeDefined();
    }
  });

  it('every locomotion class has a move-step entry in MOVEMENT_SFX', () => {
    for (const loco of ALL_LOCOMOTION_CLASSES) {
      expect(MOVEMENT_SFX[loco], `MOVEMENT_SFX missing for ${loco}`).toBeDefined();
    }
  });

  it('every non-combat unit type has a death entry', () => {
    for (const unitType of NON_COMBAT_TYPES) {
      const sfx = UNIT_SFX[unitType];
      expect(sfx, `UNIT_SFX missing for ${unitType}`).toBeDefined();
      expect(sfx!['death'], `${unitType} missing death`).toBeDefined();
    }
  });

  it('every spy type has a death entry', () => {
    for (const unitType of SPY_TYPES) {
      const sfx = UNIT_SFX[unitType];
      expect(sfx, `UNIT_SFX missing for ${unitType}`).toBeDefined();
      expect(sfx!['death'], `${unitType} missing death`).toBeDefined();
    }
  });

  it('every pirate unit has dedicated movement, fire, impact, and death audio', () => {
    for (const unitType of PIRATE_TYPES) {
      expect(PIRATE_MOVEMENT_SFX[unitType], `${unitType} missing movement`).toBeDefined();
      expect(UNIT_SFX[unitType]?.['attack-swing'], `${unitType} missing fire`).toBeDefined();
      expect(UNIT_SFX[unitType]?.['attack-impact'], `${unitType} missing impact`).toBeDefined();
      expect(UNIT_SFX[unitType]?.death, `${unitType} missing death`).toBeDefined();
    }
  });

  it('has complete headquarters and strategic pirate families', () => {
    expect(Object.keys(PIRATE_HEADQUARTERS_SFX).sort()).toEqual([
      'ambience', 'collapse', 'defense',
    ]);
    expect(Object.keys(PIRATE_STRATEGIC_SFX).sort()).toEqual([
      'blockade', 'city-razed', 'contract-accepted', 'contract-exposed', 'raid', 'siege', 'sighting', 'tribute',
    ]);
  });

  it('allSfxEntries returns exactly 138 entries', () => {
    // 18 foot-melee (6×3) + 8 foot-ranged (2×4) + 9 mounted (3×3) + 6 naval combat (2×3)
    // + 6 siege (2×3) + 9 special-combat (3×3) + 6 non-combat (6×1) + 5 spy-death (5×1) + 3 move-step = 70
    // + 4 new transport death (carrack, galleon, steamship, troop_transport) + 2 transport load/unload = 76
    // + 16 beast SFX (8 beasts × 2: attack-swing + death) = 92
    // + 35 pirate movement/combat/headquarters/strategic entries (#522 adds siege + city-razed) = 127
    // + 1 air locomotion move-step = 128
    // + 4 era-12 unit SFX (cyber_unit: death; stealth_bomber: ranged-loose, ranged-impact, death) = 132
    // + 4 Naval Trader line death sounds (#553 MR1/4) = 136
    // + 2 land trade line death sounds — Merchant Wagon, Freight Convoy (#553 MR2/4) = 138
    expect(allSfxEntries()).toHaveLength(138);
  });

  it('no two entries share the same ID', () => {
    const ids = allSfxEntries().map(e => e.id);
    expect(new Set(ids).size, 'duplicate IDs found').toBe(ids.length);
  });

  it('no two entries share the same file path', () => {
    const files = allSfxEntries().map(e => e.file);
    expect(new Set(files).size, 'duplicate file paths found').toBe(files.length);
  });

  it('every entry has loopEnd > loopStart >= 0', () => {
    for (const entry of allSfxEntries()) {
      expect(entry.loop.loopStart, `${entry.id} loopStart`).toBeGreaterThanOrEqual(0);
      expect(entry.loop.loopEnd, `${entry.id} loopEnd > loopStart`).toBeGreaterThan(entry.loop.loopStart);
    }
  });
});

describe('getLocomotionClass', () => {
  it('maps animal units correctly', () => {
    const animalTypes: UnitType[] = ['scout_hound', 'war_hound', 'horseman', 'cavalry', 'knight'];
    for (const t of animalTypes) {
      expect(getLocomotionClass(t), t).toBe('animal');
    }
  });

  it('maps naval units correctly', () => {
    const navalTypes: UnitType[] = ['galley', 'trireme', 'transport', 'carrack', 'galleon', 'steamship', 'troop_transport'];
    for (const t of navalTypes) {
      expect(getLocomotionClass(t), t).toBe('naval');
    }
  });

  it('maps siege engines to land movement instead of ship movement', () => {
    for (const t of SIEGE_TYPES) {
      expect(getLocomotionClass(t), t).toBe('humanoid');
    }
  });

  it('maps humanoid units correctly', () => {
    const humanoidTypes: UnitType[] = ['warrior', 'archer', 'settler', 'caravan', 'scout', 'spy_scout', 'spy_hacker'];
    for (const t of humanoidTypes) {
      expect(getLocomotionClass(t), t).toBe('humanoid');
    }
  });
});

describe('on-disk OGG integrity', () => {
  for (const entry of allSfxEntries()) {
    it(`${entry.id}: public/${entry.file} exists with OGG magic bytes`, () => {
      const diskPath = path.join(PROJECT_ROOT, 'public', entry.file);
      expect(fs.existsSync(diskPath), `missing file: ${diskPath}`).toBe(true);
      const head = fs.readFileSync(diskPath).slice(0, 4);
      expect(head.toString('ascii')).toBe('OggS');
    });
  }

  it('transport death sound is not an exact duplicate of the Galley death sound', () => {
    const transportDeath = fs.readFileSync(path.join(PROJECT_ROOT, 'public/audio/sfx/transport-death.ogg'));
    const galleyDeath = fs.readFileSync(path.join(PROJECT_ROOT, 'public/audio/sfx/galley-death.ogg'));

    expect(Buffer.compare(transportDeath, galleyDeath)).not.toBe(0);
  });
});
