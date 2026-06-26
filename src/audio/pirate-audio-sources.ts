export interface PirateAudioSource {
  id: string;
  title: string;
  creator: string;
  sourceUrl: string;
  license: 'CC0' | 'CC-BY' | 'in-project';
  creditText: string;
  sourceAssetFiles?: string[];
  localFiles: string[];
  derivativeNotes: string;
}

export const PIRATE_AUDIO_FILES = [
  ...['galley', 'corsair', 'frigate', 'ironclad', 'fast-attack-craft', 'mothership']
    .flatMap(unit => ['movement', 'fire', 'impact', 'death']
      .map(cue => `audio/sfx/pirates/${unit}-${cue}.ogg`)),
  'audio/sfx/pirates/enclave-ambience.ogg',
  'audio/sfx/pirates/enclave-defense.ogg',
  'audio/sfx/pirates/enclave-collapse.ogg',
  ...['sighting', 'raid', 'blockade', 'tribute', 'contract-accepted', 'contract-exposed']
    .map(cue => `audio/stinger/pirates/${cue}.ogg`),
] as const;

export const PIRATE_AUDIO_SOURCES: PirateAudioSource[] = [{
  id: 'kenney-impact-rpg-audio-cc0',
  title: 'Kenney Impact Sounds and RPG Audio',
  creator: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/impact-sounds and https://kenney.nl/assets/rpg-audio',
  license: 'CC0',
  creditText: 'Impact Sounds and RPG Audio by Kenney, CC0 1.0 Universal.',
  sourceAssetFiles: [
    'audio/sfx/naval-move-step.ogg',
    'audio/sfx/galley-attack-swing.ogg',
    'audio/sfx/galley-attack-impact.ogg',
    'audio/sfx/trireme-attack-swing.ogg',
    'audio/sfx/trireme-attack-impact.ogg',
    'audio/sfx/catapult-siege-fire.ogg',
    'audio/sfx/catapult-siege-impact.ogg',
    'audio/sfx/ballista-siege-fire.ogg',
    'audio/sfx/ballista-siege-impact.ogg',
    'audio/sfx/carrack-death.ogg',
    'audio/sfx/galleon-death.ogg',
    'audio/sfx/steamship-death.ogg',
    'audio/sfx/transport-death.ogg',
    'audio/sfx/transport-load.ogg',
    'audio/sfx/transport-unload.ogg',
  ],
  localFiles: [...PIRATE_AUDIO_FILES],
  derivativeNotes: 'Layered, filtered, and re-encoded by scripts/generate-pirate-sfx.sh with deterministic in-project lavfi tones and seeded noise for pirate-specific movement, cannon, hull impact, collapse, ambience, and strategic cues.',
}];
