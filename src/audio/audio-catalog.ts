import type { AudioFamily } from './civ-audio-family';

// Shared loop-point shape. Imported by audio-mixer.ts (C-4 dedup — one source of truth).
export interface LoopPoints {
  loopStart: number;
  loopEnd: number;
}

export type EraId = 1 | 2 | 3 | 4 | 5;

export interface TrackEntry {
  id: string;
  file: string;         // Relative path — no leading slash. AudioLoader prepends BASE_URL.
  bpm: number;          // 0 for placeholders; updated by curation MRs
  key: string;          // 'placeholder' until curation; then e.g. 'D-minor'
  loop: LoopPoints;
  idealCrossfadeOutAt?: number;
  qualityTier?: 'low' | 'med' | 'high';
}

function ph(id: string, file: string, duration = 30): TrackEntry {
  return { id, file, bpm: 0, key: 'placeholder', loop: { loopStart: 0, loopEnd: duration } };
}

export const ERA_BASE: Record<EraId, TrackEntry> = {
  1: { id: 'era1-base', file: 'audio/era/era1-base.ogg', bpm: 100, key: 'C#-minor',    loop: { loopStart: 0, loopEnd: 165.35 } },
  2: { id: 'era2-base', file: 'audio/era/era2-base.ogg', bpm: 112, key: 'C-minor',     loop: { loopStart: 0, loopEnd: 186.49 } },
  3: { id: 'era3-base', file: 'audio/era/era3-base.ogg', bpm: 0,   key: 'G-minor',     loop: { loopStart: 0, loopEnd: 198.74 } },
  4: { id: 'era4-base', file: 'audio/era/era4-base.ogg', bpm: 0,   key: 'C-Phrygian',  loop: { loopStart: 0, loopEnd: 180.00 } },
  5: { id: 'era5-base', file: 'audio/era/era5-base.ogg', bpm: 95,  key: 'Bb-minor',    loop: { loopStart: 0, loopEnd: 212.53 } },
};

export const WAR_LAYER: Record<EraId, TrackEntry> = {
  1: ph('era1-war', 'audio/war/era1-war.ogg'),
  2: ph('era2-war', 'audio/war/era2-war.ogg'),
  3: ph('era3-war', 'audio/war/era3-war.ogg'),
  4: ph('era4-war', 'audio/war/era4-war.ogg'),
  5: ph('era5-war', 'audio/war/era5-war.ogg'),
};

export const ACCENT: Record<AudioFamily, TrackEntry> = {
  'east-asian':              ph('accent-east-asian',              'audio/accent/east-asian.ogg'),
  'south-asian':             ph('accent-south-asian',             'audio/accent/south-asian.ogg'),
  'middle-eastern':          ph('accent-middle-eastern',          'audio/accent/middle-eastern.ogg'),
  'mediterranean-antiquity': ph('accent-mediterranean-antiquity', 'audio/accent/mediterranean-antiquity.ogg'),
  'western-european':        ph('accent-western-european',        'audio/accent/western-european.ogg'),
  'norse':                   ph('accent-norse',                   'audio/accent/norse.ogg'),
  'african':                 ph('accent-african',                 'audio/accent/african.ogg'),
  'mesoamerican':            ph('accent-mesoamerican',            'audio/accent/mesoamerican.ogg'),
  'steppe':                  ph('accent-steppe',                  'audio/accent/steppe.ogg'),
  'fantasy-high':            ph('accent-fantasy-high',            'audio/accent/fantasy-high.ogg'),
  'fantasy-dark':            ph('accent-fantasy-dark',            'audio/accent/fantasy-dark.ogg'),
  'fantasy-mystical':        ph('accent-fantasy-mystical',        'audio/accent/fantasy-mystical.ogg'),
};

export const STINGER = {
  eraAdvance: {
    1: ph('stinger-era1-advance', 'audio/stinger/era1-advance.ogg', 5),
    2: ph('stinger-era2-advance', 'audio/stinger/era2-advance.ogg', 5),
    3: ph('stinger-era3-advance', 'audio/stinger/era3-advance.ogg', 5),
    4: ph('stinger-era4-advance', 'audio/stinger/era4-advance.ogg', 5),
    5: ph('stinger-era5-advance', 'audio/stinger/era5-advance.ogg', 5),
  } as Record<EraId, TrackEntry>,
  eraTransitionCue: {
    1: ph('stinger-era1-transition-cue', 'audio/stinger/era1-transition-cue.ogg', 2),
    2: ph('stinger-era2-transition-cue', 'audio/stinger/era2-transition-cue.ogg', 2),
    3: ph('stinger-era3-transition-cue', 'audio/stinger/era3-transition-cue.ogg', 2),
    4: ph('stinger-era4-transition-cue', 'audio/stinger/era4-transition-cue.ogg', 2),
    5: ph('stinger-era5-transition-cue', 'audio/stinger/era5-transition-cue.ogg', 2),
  } as Record<EraId, TrackEntry>,
  cityFounded: ph('stinger-city-founded', 'audio/stinger/city-founded.ogg', 3),
  warDeclared:  ph('stinger-war-declared',  'audio/stinger/war-declared.ogg',  3),
};

// Er2: clamps era > 5 to 5; no per-civ era tracking in Spec 1
export function resolveEra(era: number): EraId {
  if (era <= 1) return 1;
  if (era >= 5) return 5;
  return era as EraId;
}
