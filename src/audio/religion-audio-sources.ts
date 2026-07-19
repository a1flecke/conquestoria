export interface ReligionAudioSource {
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

export const RELIGION_AUDIO_FILES = [
  'audio/stinger/religion/founded.ogg',
  'audio/stinger/religion/city-converted.ogg',
  'audio/stinger/religion/preach.ogg',
  'audio/stinger/religion/loyalty-warning.ogg',
  'audio/stinger/religion/city-defected.ogg',
  'audio/stinger/famine/onset.ogg',
  'audio/stinger/famine/resolved.ogg',
] as const;

export const RELIGION_AUDIO_SOURCES: ReligionAudioSource[] = [{
  id: 'kenney-impact-rpg-audio-cc0-religion',
  title: 'Kenney Impact Sounds and RPG Audio (religion/famine stinger layer)',
  creator: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/impact-sounds and https://kenney.nl/assets/rpg-audio',
  license: 'CC0',
  creditText: 'Impact Sounds and RPG Audio by Kenney, CC0 1.0 Universal.',
  sourceAssetFiles: [
    'audio/sfx/transport-load.ogg',
    'audio/sfx/worker-death.ogg',
    'audio/sfx/archer-ranged-loose.ogg',
    'audio/sfx/ballista-siege-fire.ogg',
    'audio/sfx/knight-death.ogg',
    'audio/sfx/settler-death.ogg',
    'audio/sfx/transport-unload.ogg',
  ],
  localFiles: [...RELIGION_AUDIO_FILES],
  derivativeNotes: 'Layered, filtered, and re-encoded by scripts/generate-religion-sfx.sh with deterministic in-project lavfi tones and seeded noise for religion-founding, conversion, preaching, loyalty-warning, defection, and famine onset/resolution cues.',
}];
