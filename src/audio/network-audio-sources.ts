export const NETWORK_AUDIO_FILES = [
  'audio/stinger/network/constructive-resolution.ogg',
  'audio/stinger/network/hostile-warning.ogg',
  'audio/stinger/network/hostile-consequence.ogg',
  'audio/stinger/network/surge.ogg',
  'audio/stinger/network/recovery.ogg',
] as const;

export const NETWORK_AUDIO_SOURCES = [{
  id: 'kenney-impact-rpg-audio-cc0-network',
  title: 'Kenney Impact Sounds and RPG Audio (network stinger layer)',
  creator: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/impact-sounds and https://kenney.nl/assets/rpg-audio',
  license: 'CC0' as const,
  creditText: 'Impact Sounds and RPG Audio by Kenney, CC0 1.0 Universal.',
  sourceAssetFiles: [
    'audio/sfx/transport-load.ogg',
    'audio/sfx/ballista-siege-fire.ogg',
    'audio/sfx/stealth-bomber-impact.ogg',
    'audio/sfx/transport-unload.ogg',
    'audio/sfx/worker-death.ogg',
  ],
  localFiles: [...NETWORK_AUDIO_FILES],
  derivativeNotes: 'Layered, filtered, and re-encoded by scripts/generate-network-sfx.sh with deterministic in-project lavfi tones and seeded noise for constructive, hostile, Surge, and recovery feedback.',
}];
