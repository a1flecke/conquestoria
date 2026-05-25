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
  1: { id: 'era1-base', file: 'audio/era/era1-base.ogg', bpm: 100, key: 'C#-minor',    loop: { loopStart: 0, loopEnd: 165.356 } },
  2: { id: 'era2-base', file: 'audio/era/era2-base.ogg', bpm: 112, key: 'C-minor',     loop: { loopStart: 0, loopEnd: 186.49 } },
  3: { id: 'era3-base', file: 'audio/era/era3-base.ogg', bpm: 0,   key: 'G-minor',     loop: { loopStart: 0, loopEnd: 198.74 } },
  4: { id: 'era4-base', file: 'audio/era/era4-base.ogg', bpm: 0,   key: 'C-Phrygian',  loop: { loopStart: 0, loopEnd: 180.00 } },
  5: { id: 'era5-base', file: 'audio/era/era5-base.ogg', bpm: 95,  key: 'Bb-minor',    loop: { loopStart: 0, loopEnd: 212.533 } },
};

export const WAR_LAYER: Record<EraId, TrackEntry> = {
  // Era 1: "Pirates!" by Eric Matyas — soundimage.org — key/BPM unverified
  1: { id: 'era1-war', file: 'audio/war/era1-war.ogg', bpm: 0,   key: 'unknown',  loop: { loopStart: 0, loopEnd: 72.426  } },
  // Era 2: "Clenched Teeth" by Kevin MacLeod — 164 BPM confirmed — key unverified (target: C-minor)
  2: { id: 'era2-war', file: 'audio/war/era2-war.ogg', bpm: 164, key: 'unknown',  loop: { loopStart: 0, loopEnd: 91.152  } },
  // Era 3: "Crusade — Heavy Industry" by Kevin MacLeod — rearrangement of era3 base, expected G-minor
  3: { id: 'era3-war', file: 'audio/war/era3-war.ogg', bpm: 0,   key: 'G-minor',  loop: { loopStart: 0, loopEnd: 180.000 } },
  // Era 4: "Tectonic" by Kevin MacLeod — key/BPM unverified (target: C-Phrygian)
  4: { id: 'era4-war', file: 'audio/war/era4-war.ogg', bpm: 0,   key: 'unknown',  loop: { loopStart: 0, loopEnd: 82.678  } },
  // Era 5: "Final Battle of the Dark Wizards" by Kevin MacLeod — D-minor (⚠ target Bb-minor; verify by ear)
  5: { id: 'era5-war', file: 'audio/war/era5-war.ogg', bpm: 0,   key: 'D-minor',  loop: { loopStart: 0, loopEnd: 180.000 } },
};

// loopEnd is set to the fade-start (duration − 12 s), not the file end.
// The Web Audio looping region therefore stays in the main musical body and never
// enters the fade-out tail, eliminating the periodic 12 s silence dip on every loop.
// The fade tail (loopEnd → file-end) remains in the buffer but is unreachable during
// normal playback; it would only sound if the bus is stopped without a crossfade.
export const ACCENT: Record<AudioFamily, TrackEntry> = {
  // Kevin MacLeod (incompetech.com) — CC-BY 3.0
  'east-asian':              { id: 'accent-east-asian',              file: 'audio/accent/east-asian.ogg',              bpm: 0, key: 'pentatonic',    loop: { loopStart: 0, loopEnd: 108.000 } },
  'south-asian':             { id: 'accent-south-asian',             file: 'audio/accent/south-asian.ogg',             bpm: 0, key: 'raga',          loop: { loopStart: 0, loopEnd: 108.000 } },
  'middle-eastern':          { id: 'accent-middle-eastern',          file: 'audio/accent/middle-eastern.ogg',          bpm: 0, key: 'ambient',       loop: { loopStart: 0, loopEnd:  77.365 } },
  'northern-european':       { id: 'accent-northern-european',       file: 'audio/accent/northern-european.ogg',       bpm: 0, key: 'modal',         loop: { loopStart: 0, loopEnd: 108.000 } },
  'norse':                   { id: 'accent-norse',                   file: 'audio/accent/norse.ogg',                   bpm: 0, key: 'dark-ambient',  loop: { loopStart: 0, loopEnd: 108.000 } },
  'african':                 { id: 'accent-african',                 file: 'audio/accent/african.ogg',                 bpm: 0, key: 'polyrhythmic',  loop: { loopStart: 0, loopEnd: 108.000 } },
  'mesoamerican':            { id: 'accent-mesoamerican',            file: 'audio/accent/mesoamerican.ogg',            bpm: 0, key: 'pentatonic',    loop: { loopStart: 0, loopEnd: 108.000 } },
  'fantasy-dark':            { id: 'accent-fantasy-dark',            file: 'audio/accent/fantasy-dark.ogg',            bpm: 0, key: 'percussion',    loop: { loopStart: 0, loopEnd: 108.000 } },
  // Eric Matyas (soundimage.org) — free use with attribution
  'mediterranean-antiquity': { id: 'accent-mediterranean-antiquity', file: 'audio/accent/mediterranean-antiquity.ogg', bpm: 0, key: 'ambient',       loop: { loopStart: 0, loopEnd:  68.759 } },
  'western-european':        { id: 'accent-western-european',        file: 'audio/accent/western-european.ogg',        bpm: 0, key: 'dorian',        loop: { loopStart: 0, loopEnd: 108.000 } },
  'steppe':                  { id: 'accent-steppe',                  file: 'audio/accent/steppe.ogg',                  bpm: 0, key: 'drone',         loop: { loopStart: 0, loopEnd: 108.000 } },
  'fantasy-high':            { id: 'accent-fantasy-high',            file: 'audio/accent/fantasy-high.ogg',            bpm: 0, key: 'ambient',       loop: { loopStart: 0, loopEnd:  79.968 } },
  'fantasy-mystical':        { id: 'accent-fantasy-mystical',        file: 'audio/accent/fantasy-mystical.ogg',        bpm: 0, key: 'ambient',       loop: { loopStart: 0, loopEnd:  63.777 } },
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
