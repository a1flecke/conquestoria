import { describe, it, expect } from 'vitest';
import {
  CIV_TO_AUDIO_FAMILY,
  MINOR_CIV_TO_AUDIO_FAMILY,
  getFamilyForCiv,
  type AudioFamily,
} from '../../src/audio/civ-audio-family';
import { CIV_DEFINITIONS } from '../../src/systems/civ-definitions';
import { MINOR_CIV_DEFINITIONS } from '../../src/systems/minor-civ-definitions';

const ALL_FAMILIES: AudioFamily[] = [
  'east-asian', 'south-asian', 'middle-eastern', 'mediterranean-antiquity',
  'western-european', 'norse', 'african', 'mesoamerican', 'steppe',
  'fantasy-high', 'fantasy-dark', 'fantasy-mystical',
];

describe('CIV_TO_AUDIO_FAMILY', () => {
  it('every civ in CIV_DEFINITIONS has an entry', () => {
    for (const def of CIV_DEFINITIONS) {
      expect(CIV_TO_AUDIO_FAMILY[def.id], `major civ missing: ${def.id}`).toBeDefined();
    }
  });

  it('every mapped value is a valid AudioFamily literal', () => {
    for (const [id, family] of Object.entries(CIV_TO_AUDIO_FAMILY)) {
      expect(ALL_FAMILIES, `invalid family for ${id}`).toContain(family);
    }
  });
});

describe('MINOR_CIV_TO_AUDIO_FAMILY', () => {
  it('every minor civ in MINOR_CIV_DEFINITIONS has an entry', () => {
    for (const def of MINOR_CIV_DEFINITIONS) {
      expect(MINOR_CIV_TO_AUDIO_FAMILY[def.id], `minor civ missing: ${def.id}`).toBeDefined();
    }
  });

  it('every mapped value is a valid AudioFamily literal', () => {
    for (const [id, family] of Object.entries(MINOR_CIV_TO_AUDIO_FAMILY)) {
      expect(ALL_FAMILIES, `invalid family for ${id}`).toContain(family);
    }
  });
});

describe('getFamilyForCiv', () => {
  it('returns the correct family for known major civs', () => {
    expect(getFamilyForCiv('china')).toBe('east-asian');
    expect(getFamilyForCiv('rome')).toBe('mediterranean-antiquity');
    expect(getFamilyForCiv('viking')).toBe('norse');
    expect(getFamilyForCiv('isengard')).toBe('fantasy-dark');
    expect(getFamilyForCiv('mongolia')).toBe('steppe');
  });

  it('returns the correct family for known minor civs', () => {
    expect(getFamilyForCiv('sparta')).toBe('mediterranean-antiquity');
    expect(getFamilyForCiv('gondolin')).toBe('fantasy-high');
    expect(getFamilyForCiv('zanzibar')).toBe('african');
    expect(getFamilyForCiv('samarkand')).toBe('middle-eastern');
  });

  it('returns mediterranean-antiquity for unknown civ IDs (H-5 fallback)', () => {
    expect(getFamilyForCiv('unknown-civ-id')).toBe('mediterranean-antiquity');
    expect(getFamilyForCiv('')).toBe('mediterranean-antiquity');
    expect(getFamilyForCiv('future-civ-not-yet-mapped')).toBe('mediterranean-antiquity');
  });
});
