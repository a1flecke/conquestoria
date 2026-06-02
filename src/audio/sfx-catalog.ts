import type { UnitType } from '@/core/types';
import type { TrackEntry } from './audio-catalog';

export type SfxClass =
  | 'attack-swing' | 'attack-impact' | 'death'
  | 'ranged-loose' | 'ranged-impact'
  | 'siege-fire' | 'siege-impact';

// Mirrors UnitMotionStyle in src/renderer/sprites/sprite-catalog.ts — keep in sync.
export type LocomotionClass = 'humanoid' | 'animal' | 'naval';

function ph(id: string, file: string): TrackEntry {
  return { id, file, bpm: 0, key: 'placeholder', loop: { loopStart: 0, loopEnd: 1.5 } };
}

// Movement SFX — one per locomotion class, triggered per hex entered during movement (MR2).
export const MOVEMENT_SFX: Record<LocomotionClass, TrackEntry> = {
  humanoid: ph('sfx-humanoid-move-step', 'audio/sfx/humanoid-move-step.ogg'),
  animal:   ph('sfx-animal-move-step',   'audio/sfx/animal-move-step.ogg'),
  naval:    ph('sfx-naval-move-step',    'audio/sfx/naval-move-step.ogg'),
};

// Unit SFX — keyed by UnitType, then by SfxClass. Non-combat units have death only.
// Spy types (spy_scout, spy_informant, spy_agent, spy_operative, spy_hacker) are deferred
// to a later curation MR; they will receive death entries when real audio is sourced.
export const UNIT_SFX: Partial<Record<UnitType, Partial<Record<SfxClass, TrackEntry>>>> = {

  // === Foot Melee (attack-swing, attack-impact, death) ===
  warrior: {
    'attack-swing':  ph('sfx-warrior-attack-swing',  'audio/sfx/warrior-attack-swing.ogg'),
    'attack-impact': ph('sfx-warrior-attack-impact', 'audio/sfx/warrior-attack-impact.ogg'),
    death:           ph('sfx-warrior-death',          'audio/sfx/warrior-death.ogg'),
  },
  axeman: {
    'attack-swing':  ph('sfx-axeman-attack-swing',  'audio/sfx/axeman-attack-swing.ogg'),
    'attack-impact': ph('sfx-axeman-attack-impact', 'audio/sfx/axeman-attack-impact.ogg'),
    death:           ph('sfx-axeman-death',          'audio/sfx/axeman-death.ogg'),
  },
  spearman: {
    'attack-swing':  ph('sfx-spearman-attack-swing',  'audio/sfx/spearman-attack-swing.ogg'),
    'attack-impact': ph('sfx-spearman-attack-impact', 'audio/sfx/spearman-attack-impact.ogg'),
    death:           ph('sfx-spearman-death',          'audio/sfx/spearman-death.ogg'),
  },
  swordsman: {
    'attack-swing':  ph('sfx-swordsman-attack-swing',  'audio/sfx/swordsman-attack-swing.ogg'),
    'attack-impact': ph('sfx-swordsman-attack-impact', 'audio/sfx/swordsman-attack-impact.ogg'),
    death:           ph('sfx-swordsman-death',          'audio/sfx/swordsman-death.ogg'),
  },
  pikeman: {
    'attack-swing':  ph('sfx-pikeman-attack-swing',  'audio/sfx/pikeman-attack-swing.ogg'),
    'attack-impact': ph('sfx-pikeman-attack-impact', 'audio/sfx/pikeman-attack-impact.ogg'),
    death:           ph('sfx-pikeman-death',          'audio/sfx/pikeman-death.ogg'),
  },
  musketeer: {
    'attack-swing':  ph('sfx-musketeer-attack-swing',  'audio/sfx/musketeer-attack-swing.ogg'),
    'attack-impact': ph('sfx-musketeer-attack-impact', 'audio/sfx/musketeer-attack-impact.ogg'),
    death:           ph('sfx-musketeer-death',          'audio/sfx/musketeer-death.ogg'),
  },

  // === Foot Ranged (attack-swing, ranged-loose, ranged-impact, death) ===
  archer: {
    'attack-swing':  ph('sfx-archer-attack-swing',  'audio/sfx/archer-attack-swing.ogg'),
    'ranged-loose':  ph('sfx-archer-ranged-loose',  'audio/sfx/archer-ranged-loose.ogg'),
    'ranged-impact': ph('sfx-archer-ranged-impact', 'audio/sfx/archer-ranged-impact.ogg'),
    death:           ph('sfx-archer-death',          'audio/sfx/archer-death.ogg'),
  },
  crossbowman: {
    'attack-swing':  ph('sfx-crossbowman-attack-swing',  'audio/sfx/crossbowman-attack-swing.ogg'),
    'ranged-loose':  ph('sfx-crossbowman-ranged-loose',  'audio/sfx/crossbowman-ranged-loose.ogg'),
    'ranged-impact': ph('sfx-crossbowman-ranged-impact', 'audio/sfx/crossbowman-ranged-impact.ogg'),
    death:           ph('sfx-crossbowman-death',          'audio/sfx/crossbowman-death.ogg'),
  },

  // === Mounted (attack-swing, attack-impact, death) ===
  horseman: {
    'attack-swing':  ph('sfx-horseman-attack-swing',  'audio/sfx/horseman-attack-swing.ogg'),
    'attack-impact': ph('sfx-horseman-attack-impact', 'audio/sfx/horseman-attack-impact.ogg'),
    death:           ph('sfx-horseman-death',          'audio/sfx/horseman-death.ogg'),
  },
  cavalry: {
    'attack-swing':  ph('sfx-cavalry-attack-swing',  'audio/sfx/cavalry-attack-swing.ogg'),
    'attack-impact': ph('sfx-cavalry-attack-impact', 'audio/sfx/cavalry-attack-impact.ogg'),
    death:           ph('sfx-cavalry-death',          'audio/sfx/cavalry-death.ogg'),
  },
  knight: {
    'attack-swing':  ph('sfx-knight-attack-swing',  'audio/sfx/knight-attack-swing.ogg'),
    'attack-impact': ph('sfx-knight-attack-impact', 'audio/sfx/knight-attack-impact.ogg'),
    death:           ph('sfx-knight-death',          'audio/sfx/knight-death.ogg'),
  },

  // === Naval (attack-swing, attack-impact, death) ===
  galley: {
    'attack-swing':  ph('sfx-galley-attack-swing',  'audio/sfx/galley-attack-swing.ogg'),
    'attack-impact': ph('sfx-galley-attack-impact', 'audio/sfx/galley-attack-impact.ogg'),
    death:           ph('sfx-galley-death',          'audio/sfx/galley-death.ogg'),
  },
  trireme: {
    'attack-swing':  ph('sfx-trireme-attack-swing',  'audio/sfx/trireme-attack-swing.ogg'),
    'attack-impact': ph('sfx-trireme-attack-impact', 'audio/sfx/trireme-attack-impact.ogg'),
    death:           ph('sfx-trireme-death',          'audio/sfx/trireme-death.ogg'),
  },

  // === Siege (siege-fire, siege-impact, death) ===
  catapult: {
    'siege-fire':   ph('sfx-catapult-siege-fire',   'audio/sfx/catapult-siege-fire.ogg'),
    'siege-impact': ph('sfx-catapult-siege-impact', 'audio/sfx/catapult-siege-impact.ogg'),
    death:          ph('sfx-catapult-death',         'audio/sfx/catapult-death.ogg'),
  },
  ballista: {
    'siege-fire':   ph('sfx-ballista-siege-fire',   'audio/sfx/ballista-siege-fire.ogg'),
    'siege-impact': ph('sfx-ballista-siege-impact', 'audio/sfx/ballista-siege-impact.ogg'),
    death:          ph('sfx-ballista-death',         'audio/sfx/ballista-death.ogg'),
  },

  // === Special Combat (attack-swing, attack-impact, death) ===
  shadow_warden: {
    'attack-swing':  ph('sfx-shadow_warden-attack-swing',  'audio/sfx/shadow_warden-attack-swing.ogg'),
    'attack-impact': ph('sfx-shadow_warden-attack-impact', 'audio/sfx/shadow_warden-attack-impact.ogg'),
    death:           ph('sfx-shadow_warden-death',          'audio/sfx/shadow_warden-death.ogg'),
  },
  scout_hound: {
    'attack-swing':  ph('sfx-scout_hound-attack-swing',  'audio/sfx/scout_hound-attack-swing.ogg'),
    'attack-impact': ph('sfx-scout_hound-attack-impact', 'audio/sfx/scout_hound-attack-impact.ogg'),
    death:           ph('sfx-scout_hound-death',          'audio/sfx/scout_hound-death.ogg'),
  },
  war_hound: {
    'attack-swing':  ph('sfx-war_hound-attack-swing',  'audio/sfx/war_hound-attack-swing.ogg'),
    'attack-impact': ph('sfx-war_hound-attack-impact', 'audio/sfx/war_hound-attack-impact.ogg'),
    death:           ph('sfx-war_hound-death',          'audio/sfx/war_hound-death.ogg'),
  },

  // === Non-Combat (death only) ===
  settler:    { death: ph('sfx-settler-death',    'audio/sfx/settler-death.ogg') },
  worker:     { death: ph('sfx-worker-death',     'audio/sfx/worker-death.ogg') },
  caravan:    { death: ph('sfx-caravan-death',    'audio/sfx/caravan-death.ogg') },
  scout:      { death: ph('sfx-scout-death',      'audio/sfx/scout-death.ogg') },
  expedition: { death: ph('sfx-expedition-death', 'audio/sfx/expedition-death.ogg') },
  transport:  { death: ph('sfx-transport-death',  'audio/sfx/transport-death.ogg') },
};

// Mirrors UNIT_MOTION_STYLES in src/renderer/sprites/sprite-catalog.ts — keep in sync.
// Using a full Record ensures TypeScript errors on any new UnitType that is not mapped.
const LOCOMOTION_CLASS: Record<UnitType, LocomotionClass> = {
  settler:       'humanoid',
  worker:        'humanoid',
  scout:         'humanoid',
  scout_hound:   'animal',
  war_hound:     'animal',
  shadow_warden: 'humanoid',
  warrior:       'humanoid',
  swordsman:     'humanoid',
  pikeman:       'humanoid',
  archer:        'humanoid',
  musketeer:     'humanoid',
  galley:        'naval',
  trireme:       'naval',
  transport:     'naval',
  spy_scout:     'humanoid',
  spy_informant: 'humanoid',
  spy_agent:     'humanoid',
  spy_operative: 'humanoid',
  spy_hacker:    'humanoid',
  axeman:        'humanoid',
  spearman:      'humanoid',
  horseman:      'animal',
  cavalry:       'animal',
  knight:        'animal',
  crossbowman:   'humanoid',
  catapult:      'naval',
  ballista:      'naval',
  caravan:       'humanoid',
  expedition:    'humanoid',
};

export function getLocomotionClass(unitType: UnitType): LocomotionClass {
  return LOCOMOTION_CLASS[unitType];
}

// Flat list of all catalog entries — used for preloading and catalog integrity tests.
export function allSfxEntries(): TrackEntry[] {
  const entries: TrackEntry[] = [];
  for (const sfxMap of Object.values(UNIT_SFX)) {
    if (!sfxMap) continue;
    for (const entry of Object.values(sfxMap)) {
      if (entry) entries.push(entry);
    }
  }
  return [...entries, ...Object.values(MOVEMENT_SFX)];
}
