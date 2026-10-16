export interface GeneralCommandAudioSource {
  id: string;
  title: string;
  creator: string;
  sourceUrl: string;
  license: 'CC0' | 'CC-BY' | 'in-project';
  creditText: string;
  /** Existing in-repo Kenney CC0 recordings each cue is derived from. */
  sourceAssetFiles?: string[];
  localFiles: string[];
  derivativeNotes: string;
}

/**
 * #889: the Great General command cues. Like the pirate and combat-outcome families, each output is a deterministic
 * derivative of existing Kenney CC0 recordings already carried in `public/audio/sfx/` layered with in-project ffmpeg
 * sine tones: no new downloads and no third-party audio added to the repository.
 */
export const GENERAL_COMMAND_AUDIO_FILES = [
  'audio/stinger/general/general-rally.ogg',
  'audio/stinger/general/general-seize.ogg',
  'audio/stinger/general/general-last-stand.ogg',
  'audio/stinger/general/general-final-command.ogg',
] as const;

export const GENERAL_COMMAND_AUDIO_SOURCES: GeneralCommandAudioSource[] = [{
  id: 'kenney-impact-rpg-audio-cc0',
  title: 'Kenney Impact Sounds and RPG Audio',
  creator: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/impact-sounds and https://kenney.nl/assets/rpg-audio',
  license: 'CC0',
  creditText: 'Impact Sounds and RPG Audio by Kenney, CC0 1.0 Universal.',
  sourceAssetFiles: [
    'audio/sfx/transport-unload.ogg',
    'audio/sfx/swordsman-attack-swing.ogg',
    'audio/sfx/hull-iron.ogg',
    'audio/sfx/catapult-siege-impact.ogg',
  ],
  localFiles: [...GENERAL_COMMAND_AUDIO_FILES],
  derivativeNotes: 'Layered, filtered, limited and re-encoded by scripts/generate-general-command-sfx.sh with deterministic in-project lavfi sine tones: a rising three-note chime (Rally), a rising sweep over a blade swish (Seize the Moment), a deep fifth over struck iron (Last Stand) and a slow swell over a deep impact (Final Command and retirement).',
}];
