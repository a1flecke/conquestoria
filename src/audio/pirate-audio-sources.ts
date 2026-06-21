export interface PirateAudioSource {
  id: string;
  title: string;
  creator: string;
  sourceUrl: string;
  license: 'CC0' | 'CC-BY' | 'in-project';
  creditText: string;
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
  id: 'conquestoria-pirate-synthesis-v1',
  title: 'Conquestoria Pirate Sound Family',
  creator: 'Conquestoria project',
  sourceUrl: 'scripts/generate-pirate-sfx.sh',
  license: 'in-project',
  creditText: 'Original procedural synthesis created for Conquestoria.',
  localFiles: [...PIRATE_AUDIO_FILES],
  derivativeNotes: 'Generated from ffmpeg lavfi tone and noise sources; no external recordings.',
}];
