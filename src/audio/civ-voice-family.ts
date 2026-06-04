import type { VoicePackId } from './voice-catalog';

/**
 * Maps major civ IDs to voice packs.
 * Mirrors the CIV_TO_AUDIO_FAMILY pattern from civ-audio-family.ts.
 *
 * 10 "hero" civs get unique voice packs; all 19 others default to 'generic'.
 * Adding a starred civ = one entry here.
 *
 * Note: sync this list with the voice curation docs when adding new packs.
 */
export const CIV_TO_VOICE_PACK: Record<string, VoicePackId> = {
  china:    'china',
  egypt:    'egypt',
  rome:     'rome',
  england:  'england',
  france:   'france',
  viking:   'viking',
  zulu:     'zulu',
  aztec:    'aztec',
  mongolia: 'mongolia',
  gondor:   'gondor',
  // All 19 other civs absent → getVoicePackForCiv returns 'generic'
};

export function getVoicePackForCiv(civType: string): VoicePackId {
  return CIV_TO_VOICE_PACK[civType] ?? 'generic';
}
