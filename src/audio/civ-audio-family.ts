export type AudioFamily =
  | 'east-asian'
  | 'south-asian'
  | 'middle-eastern'
  | 'mediterranean-antiquity'
  | 'western-european'
  | 'norse'
  | 'african'
  | 'mesoamerican'
  | 'steppe'
  | 'fantasy-high'
  | 'fantasy-dark'
  | 'fantasy-mystical';

// 29 major civs — add new civs here as civ-definitions.ts grows
export const CIV_TO_AUDIO_FAMILY: Record<string, AudioFamily> = {
  china:       'east-asian',
  japan:       'east-asian',
  india:       'south-asian',
  babylon:     'middle-eastern',
  persia:      'middle-eastern',
  ottoman:     'middle-eastern',
  rome:        'mediterranean-antiquity',
  greece:      'mediterranean-antiquity',
  egypt:       'mediterranean-antiquity',
  england:     'western-european',
  france:      'western-european',
  germany:     'western-european',
  spain:       'western-european',
  russia:      'western-european',
  viking:      'norse',
  zulu:        'african',
  wakanda:     'african',
  aztec:       'mesoamerican',
  mongolia:    'steppe',
  gondor:      'fantasy-high',
  rohan:       'fantasy-high',
  lothlorien:  'fantasy-high',
  avalon:      'fantasy-high',
  narnia:      'fantasy-high',
  shire:       'fantasy-high',
  isengard:    'fantasy-dark',
  annuvin:     'fantasy-dark',
  atlantis:    'fantasy-mystical',
  prydain:     'fantasy-mystical',
};

// 12 minor civs — keyed to cultural/historical parent (H-5)
export const MINOR_CIV_TO_AUDIO_FAMILY: Record<string, AudioFamily> = {
  sparta:     'mediterranean-antiquity',
  valyria:    'fantasy-dark',
  numantia:   'mediterranean-antiquity',
  gondolin:   'fantasy-high',
  carthage:   'mediterranean-antiquity',
  zanzibar:   'african',
  samarkand:  'middle-eastern',
  petra:      'middle-eastern',
  alexandria: 'mediterranean-antiquity',
  delphi:     'mediterranean-antiquity',
  timbuktu:   'african',
  avalon:     'fantasy-high',
};

const DEFAULT_FAMILY: AudioFamily = 'mediterranean-antiquity';

export function getFamilyForCiv(civType: string): AudioFamily {
  return CIV_TO_AUDIO_FAMILY[civType] ?? MINOR_CIV_TO_AUDIO_FAMILY[civType] ?? DEFAULT_FAMILY;
}
