import type { UnitType } from '@/core/types';
import type { TrackEntry } from './audio-catalog';

export type SfxClass =
  | 'attack-swing' | 'attack-impact' | 'death'
  | 'ranged-loose' | 'ranged-impact'
  | 'siege-fire' | 'siege-impact';

// Mirrors UnitMotionStyle in src/renderer/sprites/sprite-catalog.ts — keep in sync.
export type LocomotionClass = 'humanoid' | 'animal' | 'naval';

function real(id: string, file: string, loopEnd: number, key = 'impact'): TrackEntry {
  return { id, file, bpm: 0, key, loop: { loopStart: 0, loopEnd } };
}

// Movement SFX — one per locomotion class, triggered per hex entered during movement (MR2).
export const MOVEMENT_SFX: Record<LocomotionClass, TrackEntry> = {
  humanoid: real('sfx-humanoid-move-step', 'audio/sfx/humanoid-move-step.ogg', 0.778, 'movement'),
  animal:   real('sfx-animal-move-step',   'audio/sfx/animal-move-step.ogg',   0.274, 'movement'),
  naval:    real('sfx-naval-move-step',    'audio/sfx/naval-move-step.ogg',    0.266, 'movement'),
};

// Unit SFX — keyed by UnitType, then by SfxClass. Non-combat units have death only.
export const UNIT_SFX: Partial<Record<UnitType, Partial<Record<SfxClass, TrackEntry>>>> = {

  // === Foot Melee (attack-swing, attack-impact, death) ===
  warrior: {
    'attack-swing':  real('sfx-warrior-attack-swing',  'audio/sfx/warrior-attack-swing.ogg',  0.431),
    'attack-impact': real('sfx-warrior-attack-impact', 'audio/sfx/warrior-attack-impact.ogg', 0.168),
    death:           real('sfx-warrior-death',          'audio/sfx/warrior-death.ogg',          0.118, 'death'),
  },
  axeman: {
    'attack-swing':  real('sfx-axeman-attack-swing',  'audio/sfx/axeman-attack-swing.ogg',  0.240),
    'attack-impact': real('sfx-axeman-attack-impact', 'audio/sfx/axeman-attack-impact.ogg', 0.313),
    death:           real('sfx-axeman-death',          'audio/sfx/axeman-death.ogg',          0.183, 'death'),
  },
  spearman: {
    'attack-swing':  real('sfx-spearman-attack-swing',  'audio/sfx/spearman-attack-swing.ogg',  0.376),
    'attack-impact': real('sfx-spearman-attack-impact', 'audio/sfx/spearman-attack-impact.ogg', 0.272),
    death:           real('sfx-spearman-death',          'audio/sfx/spearman-death.ogg',          0.135, 'death'),
  },
  swordsman: {
    'attack-swing':  real('sfx-swordsman-attack-swing',  'audio/sfx/swordsman-attack-swing.ogg',  0.143),
    'attack-impact': real('sfx-swordsman-attack-impact', 'audio/sfx/swordsman-attack-impact.ogg', 0.359),
    death:           real('sfx-swordsman-death',          'audio/sfx/swordsman-death.ogg',          0.530, 'death'),
  },
  pikeman: {
    'attack-swing':  real('sfx-pikeman-attack-swing',  'audio/sfx/pikeman-attack-swing.ogg',  0.252),
    'attack-impact': real('sfx-pikeman-attack-impact', 'audio/sfx/pikeman-attack-impact.ogg', 0.489),
    death:           real('sfx-pikeman-death',          'audio/sfx/pikeman-death.ogg',          0.140, 'death'),
  },
  musketeer: {
    'attack-swing':  real('sfx-musketeer-attack-swing',  'audio/sfx/musketeer-attack-swing.ogg',  0.164),
    'attack-impact': real('sfx-musketeer-attack-impact', 'audio/sfx/musketeer-attack-impact.ogg', 0.937),
    death:           real('sfx-musketeer-death',          'audio/sfx/musketeer-death.ogg',          0.572, 'death'),
  },

  // === Foot Ranged (attack-swing, ranged-loose, ranged-impact, death) ===
  archer: {
    'attack-swing':  real('sfx-archer-attack-swing',  'audio/sfx/archer-attack-swing.ogg',  0.266),
    'ranged-loose':  real('sfx-archer-ranged-loose',  'audio/sfx/archer-ranged-loose.ogg',  0.266),
    'ranged-impact': real('sfx-archer-ranged-impact', 'audio/sfx/archer-ranged-impact.ogg', 0.118),
    death:           real('sfx-archer-death',          'audio/sfx/archer-death.ogg',          0.572, 'death'),
  },
  crossbowman: {
    'attack-swing':  real('sfx-crossbowman-attack-swing',  'audio/sfx/crossbowman-attack-swing.ogg',  0.333),
    'ranged-loose':  real('sfx-crossbowman-ranged-loose',  'audio/sfx/crossbowman-ranged-loose.ogg',  0.333),
    'ranged-impact': real('sfx-crossbowman-ranged-impact', 'audio/sfx/crossbowman-ranged-impact.ogg', 0.164),
    death:           real('sfx-crossbowman-death',          'audio/sfx/crossbowman-death.ogg',          0.544, 'death'),
  },

  // === Mounted (attack-swing, attack-impact, death) ===
  horseman: {
    'attack-swing':  real('sfx-horseman-attack-swing',  'audio/sfx/horseman-attack-swing.ogg',  0.649),
    'attack-impact': real('sfx-horseman-attack-impact', 'audio/sfx/horseman-attack-impact.ogg', 0.119),
    death:           real('sfx-horseman-death',          'audio/sfx/horseman-death.ogg',          0.501, 'death'),
  },
  cavalry: {
    'attack-swing':  real('sfx-cavalry-attack-swing',  'audio/sfx/cavalry-attack-swing.ogg',  0.536),
    'attack-impact': real('sfx-cavalry-attack-impact', 'audio/sfx/cavalry-attack-impact.ogg', 0.352),
    death:           real('sfx-cavalry-death',          'audio/sfx/cavalry-death.ogg',          0.147, 'death'),
  },
  knight: {
    'attack-swing':  real('sfx-knight-attack-swing',  'audio/sfx/knight-attack-swing.ogg',  0.457),
    'attack-impact': real('sfx-knight-attack-impact', 'audio/sfx/knight-attack-impact.ogg', 0.494),
    death:           real('sfx-knight-death',          'audio/sfx/knight-death.ogg',          0.530, 'death'),
  },

  // === Naval (attack-swing, attack-impact, death) ===
  galley: {
    'attack-swing':  real('sfx-galley-attack-swing',  'audio/sfx/galley-attack-swing.ogg',  0.313),
    'attack-impact': real('sfx-galley-attack-impact', 'audio/sfx/galley-attack-impact.ogg', 0.779),
    death:           real('sfx-galley-death',          'audio/sfx/galley-death.ogg',          0.313, 'death'),
  },
  trireme: {
    'attack-swing':  real('sfx-trireme-attack-swing',  'audio/sfx/trireme-attack-swing.ogg',  0.313),
    'attack-impact': real('sfx-trireme-attack-impact', 'audio/sfx/trireme-attack-impact.ogg', 0.779),
    death:           real('sfx-trireme-death',          'audio/sfx/trireme-death.ogg',          0.313, 'death'),
  },

  // === Siege (siege-fire, siege-impact, death) ===
  catapult: {
    'siege-fire':   real('sfx-catapult-siege-fire',   'audio/sfx/catapult-siege-fire.ogg',   0.869),
    'siege-impact': real('sfx-catapult-siege-impact', 'audio/sfx/catapult-siege-impact.ogg', 0.805),
    death:          real('sfx-catapult-death',         'audio/sfx/catapult-death.ogg',         0.779, 'death'),
  },
  ballista: {
    'siege-fire':   real('sfx-ballista-siege-fire',   'audio/sfx/ballista-siege-fire.ogg',   0.333),
    'siege-impact': real('sfx-ballista-siege-impact', 'audio/sfx/ballista-siege-impact.ogg', 0.992),
    death:          real('sfx-ballista-death',         'audio/sfx/ballista-death.ogg',         0.779, 'death'),
  },

  // === Special Combat (attack-swing, attack-impact, death) ===
  shadow_warden: {
    'attack-swing':  real('sfx-shadow_warden-attack-swing',  'audio/sfx/shadow_warden-attack-swing.ogg',  0.600),
    'attack-impact': real('sfx-shadow_warden-attack-impact', 'audio/sfx/shadow_warden-attack-impact.ogg', 0.236),
    death:           real('sfx-shadow_warden-death',          'audio/sfx/shadow_warden-death.ogg',          0.118, 'death'),
  },
  scout_hound: {
    'attack-swing':  real('sfx-scout_hound-attack-swing',  'audio/sfx/scout_hound-attack-swing.ogg',  0.541),
    'attack-impact': real('sfx-scout_hound-attack-impact', 'audio/sfx/scout_hound-attack-impact.ogg', 0.183),
    death:           real('sfx-scout_hound-death',          'audio/sfx/scout_hound-death.ogg',          0.135, 'death'),
  },
  war_hound: {
    'attack-swing':  real('sfx-war_hound-attack-swing',  'audio/sfx/war_hound-attack-swing.ogg',  0.474),
    'attack-impact': real('sfx-war_hound-attack-impact', 'audio/sfx/war_hound-attack-impact.ogg', 0.536),
    death:           real('sfx-war_hound-death',          'audio/sfx/war_hound-death.ogg',          0.572, 'death'),
  },

  // === Non-Combat (death only) ===
  settler:    { death: real('sfx-settler-death',    'audio/sfx/settler-death.ogg',    0.118, 'death') },
  worker:     { death: real('sfx-worker-death',     'audio/sfx/worker-death.ogg',     0.183, 'death') },
  caravan:    { death: real('sfx-caravan-death',    'audio/sfx/caravan-death.ogg',    0.135, 'death') },
  scout:      { death: real('sfx-scout-death',      'audio/sfx/scout-death.ogg',      0.140, 'death') },
  expedition: { death: real('sfx-expedition-death', 'audio/sfx/expedition-death.ogg', 0.147, 'death') },
  transport:       { death: real('sfx-transport-death',       'audio/sfx/transport-death.ogg',       0.266, 'death') },
  carrack:         { death: real('sfx-carrack-death',         'audio/sfx/carrack-death.ogg',         0.800, 'death') },
  galleon:         { death: real('sfx-galleon-death',         'audio/sfx/galleon-death.ogg',         0.900, 'death') },
  steamship:       { death: real('sfx-steamship-death',       'audio/sfx/steamship-death.ogg',       0.750, 'death') },
  troop_transport: { death: real('sfx-troop_transport-death', 'audio/sfx/troop_transport-death.ogg', 0.800, 'death') },

  // === Spy Types (death only — spies are dispatched, never attack directly) ===
  spy_scout:     { death: real('sfx-spy_scout-death',     'audio/sfx/spy_scout-death.ogg',     0.600, 'death') },
  spy_informant: { death: real('sfx-spy_informant-death', 'audio/sfx/spy_informant-death.ogg', 0.572, 'death') },
  spy_agent:     { death: real('sfx-spy_agent-death',     'audio/sfx/spy_agent-death.ogg',     0.569, 'death') },
  spy_operative: { death: real('sfx-spy_operative-death', 'audio/sfx/spy_operative-death.ogg', 0.530, 'death') },
  spy_hacker:    { death: real('sfx-spy_hacker-death',    'audio/sfx/spy_hacker-death.ogg',    0.183, 'death') },
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
  transport:       'naval',
  carrack:         'naval',
  galleon:         'naval',
  steamship:       'naval',
  troop_transport: 'naval',
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
  catapult:      'humanoid',
  ballista:      'humanoid',
  caravan:       'humanoid',
  expedition:    'humanoid',
  beast_boar:    'animal',
  beast_wolf:    'animal',
  beast_basilisk: 'animal',
  beast_sea_serpent: 'naval',
  beast_wurm:    'animal',
  beast_roc:     'animal',
  beast_hydra:   'animal',
};

export function getLocomotionClass(unitType: UnitType): LocomotionClass {
  return LOCOMOTION_CLASS[unitType];
}

// Load/unload SFX for transport operations. loopEnd values are estimates;
// update to actual file durations (via ffprobe) when OGGs are sourced.
export const TRANSPORT_SFX = {
  load:   real('sfx-transport-load',   'audio/sfx/transport-load.ogg',   0.600, 'movement'),
  unload: real('sfx-transport-unload', 'audio/sfx/transport-unload.ogg', 0.600, 'movement'),
};

// Flat list of all catalog entries — used for preloading and catalog integrity tests.
export function allSfxEntries(): TrackEntry[] {
  const entries: TrackEntry[] = [];
  for (const sfxMap of Object.values(UNIT_SFX)) {
    if (!sfxMap) continue;
    for (const entry of Object.values(sfxMap)) {
      if (entry) entries.push(entry);
    }
  }
  return [...entries, ...Object.values(MOVEMENT_SFX), ...Object.values(TRANSPORT_SFX)];
}
