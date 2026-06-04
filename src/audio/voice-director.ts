import type { AudioMixer, SnapshotId } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import { VOICE_CATALOG, type VoiceEventId, type VoicePackId } from './voice-catalog';
import { getVoicePackForCiv } from './civ-voice-family';

const VOICE_DUCK_FADE_MS = 150;
const VOICE_RESTORE_MS = 800;

export class VoiceDirector {
  private currentPack: VoicePackId = 'generic';

  constructor(
    private readonly mixer: AudioMixer,
    private readonly loader: AudioLoader,
    /**
     * Injected by AudioSystem — returns MusicDirector.resolveSnapshot().
     * Used to restore the correct snapshot after a voice line completes.
     * Keeps VoiceDirector independent of MusicDirector.
     */
    private readonly getSnapshot: () => SnapshotId,
  ) {}

  setVoicePack(civType: string): void {
    this.currentPack = getVoicePackForCiv(civType);
  }

  /**
   * Stop any in-progress voice line and restore the current snapshot.
   * Called on player handoff (hot-seat privacy) and before game-over stinger.
   */
  stop(): void {
    // Restore snapshot to lift any in-flight voice-duck immediately.
    // The voice bus playOneShot will resolve naturally after its source ends.
    this.mixer.setSnapshot(this.getSnapshot(), VOICE_RESTORE_MS);
  }

  /**
   * Play a voice line for the given event.
   * Falls back to 'generic' pack if the current pack has no entry for this event.
   * Silently no-ops if neither pack has an entry — never throws.
   */
  async playLine(eventId: VoiceEventId): Promise<void> {
    const entry = VOICE_CATALOG[this.currentPack]?.[eventId]
               ?? VOICE_CATALOG['generic'][eventId];
    if (!entry) return;

    const buffer = await this.loader.get(entry.file);
    this.mixer.setSnapshot('voice-duck', VOICE_DUCK_FADE_MS);
    await this.mixer.playOneShot('voice', buffer);
    this.mixer.setSnapshot(this.getSnapshot(), VOICE_RESTORE_MS);
  }
}
