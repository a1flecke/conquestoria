import type { TrackEntry } from './audio-catalog';

/**
 * Extending VoicePackId forces TypeScript to enforce VOICE_CATALOG completeness.
 * Adding a new hero civ = one entry here + one block in VOICE_CATALOG.
 */
export type VoicePackId =
  | 'china'
  | 'egypt'
  | 'rome'
  | 'england'
  | 'france'
  | 'viking'
  | 'zulu'
  | 'aztec'
  | 'mongolia'
  | 'gondor'
  | 'generic';

/**
 * Extending VoiceEventId forces completeness.
 * Adding a new event = one entry here + one explicit bus.on() in AudioSystem + entries in VOICE_CATALOG.
 */
export type VoiceEventId =
  | 'era-advance'
  | 'city-founded'
  | 'war-declared'
  | 'tech-completed'
  | 'wonder-built'
  | 'wonder-lost'
  | 'city-lost'
  | 'near-defeat'
  | 'victory'
  | 'peace-signed';

/** All voice event IDs as a runtime array (for testing and manifest generation). */
export const ALL_VOICE_EVENT_IDS: VoiceEventId[] = [
  'era-advance', 'city-founded', 'war-declared', 'tech-completed',
  'wonder-built', 'wonder-lost', 'city-lost', 'near-defeat', 'victory', 'peace-signed',
];

/** All voice pack IDs as a runtime array. */
export const ALL_VOICE_PACK_IDS: VoicePackId[] = [
  'china', 'egypt', 'rome', 'england', 'france',
  'viking', 'zulu', 'aztec', 'mongolia', 'gondor', 'generic',
];

/** Build a placeholder TrackEntry for a voice line. */
function vph(pack: VoicePackId, event: VoiceEventId): TrackEntry {
  return {
    id: `voice-${pack}-${event}`,
    file: `audio/voice/${pack}/${event}.ogg`,
    bpm: 0,
    key: 'speech',
    // loop points are dummy values — voice lines are played via playOneShot()
    // (loop: false), so these fields are never read by the audio system.
    loop: { loopStart: 0, loopEnd: 3 },
  };
}

/** Build a full set of TrackEntry records for a given pack. */
function makePackEntries(pack: VoicePackId): Record<VoiceEventId, TrackEntry> {
  const result = {} as Record<VoiceEventId, TrackEntry>;
  for (const event of ALL_VOICE_EVENT_IDS) {
    result[event] = vph(pack, event);
  }
  return result;
}

/**
 * VOICE_CATALOG — the single source of truth for all voice line assets.
 *
 * Partial<> per pack: hero packs can define a subset; missing entries silently
 * fall back to the 'generic' pack. 'generic' MUST define all 10 events.
 *
 * Curation workflow: run `npx tsx scripts/gen-voice-manifest.ts` to regenerate
 * voice-manifest.json, then `bash scripts/synthesise-voice.sh` to synthesise
 * real OGGs via Piper TTS. Placeholder OGGs are silent 1-second stubs.
 */
export const VOICE_CATALOG: Record<VoicePackId, Partial<Record<VoiceEventId, TrackEntry>>> = {
  generic:  makePackEntries('generic'),   // safety net — all 10 events always defined
  china:    makePackEntries('china'),
  egypt:    makePackEntries('egypt'),
  rome:     makePackEntries('rome'),
  england:  makePackEntries('england'),
  france:   makePackEntries('france'),
  viking:   makePackEntries('viking'),
  zulu:     makePackEntries('zulu'),
  aztec:    makePackEntries('aztec'),
  mongolia: makePackEntries('mongolia'),
  gondor:   makePackEntries('gondor'),
};
