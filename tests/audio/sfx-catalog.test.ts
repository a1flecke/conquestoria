import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  UNIT_SFX,
  MOVEMENT_SFX,
  allSfxEntries,
  getLocomotionClass,
  type LocomotionClass,
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
const ALL_LOCOMOTION_CLASSES: LocomotionClass[] = ['humanoid', 'animal', 'naval'];

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

  it('allSfxEntries returns exactly 64 entries', () => {
    // 18 foot-melee (6×3) + 8 foot-ranged (2×4) + 9 mounted (3×3) + 6 naval combat (2×3)
    // + 6 siege (2×3) + 9 special-combat (3×3) + 6 non-combat (6×1) + 3 move-step = 65
    expect(allSfxEntries()).toHaveLength(65);
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
    const navalTypes: UnitType[] = ['galley', 'trireme', 'transport', 'catapult', 'ballista'];
    for (const t of navalTypes) {
      expect(getLocomotionClass(t), t).toBe('naval');
    }
  });

  it('maps humanoid units correctly', () => {
    const humanoidTypes: UnitType[] = ['warrior', 'archer', 'settler', 'caravan', 'scout'];
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
});
