export interface CombatOutcomeAudioSource {
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
 * #657: the pillage / unit-capture outcome cues. Like the pirate family
 * (`pirate-audio-sources.ts`), each output is a deterministic derivative of an
 * existing Kenney CC0 source recording already carried in `public/audio/sfx/` —
 * no new downloads, no third-party audio added to the repository. This is the
 * provenance the "no substitute sound just to pass a test" rule asks for: the
 * pillage and capture cues come from real recorded material, not fabricated
 * tones standing in for a licensed asset.
 */
export const COMBAT_OUTCOME_AUDIO_FILES = [
  'audio/stinger/combat/pillage.ogg',
  'audio/stinger/combat/pillage-road.ogg',
  'audio/stinger/combat/capture-civilian.ogg',
  'audio/stinger/combat/capture-naval-boarding.ogg',
  'audio/stinger/combat/capture-naval-modern.ogg',
] as const;

export const COMBAT_OUTCOME_AUDIO_SOURCES: CombatOutcomeAudioSource[] = [{
  id: 'kenney-impact-rpg-audio-cc0',
  title: 'Kenney Impact Sounds and RPG Audio',
  creator: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/impact-sounds and https://kenney.nl/assets/rpg-audio',
  license: 'CC0',
  creditText: 'Impact Sounds and RPG Audio by Kenney, CC0 1.0 Universal.',
  sourceAssetFiles: [
    'audio/sfx/catapult-siege-impact.ogg',
    'audio/sfx/transport-unload.ogg',
    'audio/sfx/transport-load.ogg',
    'audio/sfx/galley-attack-impact.ogg',
    'audio/sfx/steamship-death.ogg',
  ],
  localFiles: [...COMBAT_OUTCOME_AUDIO_FILES],
  derivativeNotes: 'Layered, filtered, and re-encoded by scripts/generate-combat-outcome-sfx.sh with deterministic in-project lavfi tones and seeded noise so improvement pillage, road-only pillage, civilian capture, and historical/modern naval prize capture each carry a distinct, non-death identity.',
}];
