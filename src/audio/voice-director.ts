import type { AudioMixer, SnapshotId } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import { VOICE_CATALOG, type VoiceEventId, type VoicePackId } from './voice-catalog';
import { getVoicePackForCiv } from './civ-voice-family';

const VOICE_DUCK_FADE_MS = 150;
const VOICE_RESTORE_MS = 800;

export class VoiceDirector {
  private currentPack: VoicePackId = 'generic';
  /**
   * Tracks the in-flight playLine() call. If a new event fires while a line
   * is already playing, the new line replaces it — the in-flight line stops
   * (duck restores immediately) and the new line starts.
   * This prevents interleaved concurrent playLine() calls from corrupting
   * the voice-duck/restore snapshot sequence.
   */
  private playingPromise: Promise<void> | null = null;
  /**
   * Monotonically-increasing token assigned before the first await in playLine().
   * A call that resumes from await checks whether a newer call has since claimed
   * the slot; if so it silently exits. This closes the race where two rapid
   * calls both see playingPromise===null before either sets it.
   */
  private playToken = 0;

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
    this.playingPromise = null;
    this.playToken++;  // cancels any in-flight loader.get() call
    this.mixer.setSnapshot(this.getSnapshot(), VOICE_RESTORE_MS);
  }

  /**
   * Play a voice line for the given event.
   * Falls back to 'generic' pack if the current pack has no entry for this event.
   * Silently no-ops if neither pack has an entry — never throws.
   *
   * If a voice line is already playing when this is called, it is interrupted:
   * the snapshot restores immediately and the new line takes over.
   * This ensures rapid concurrent events (e.g. wonder-built + city-founded on
   * the same turn) don't corrupt the voice-duck/restore snapshot sequence.
   */
  async playLine(eventId: VoiceEventId): Promise<void> {
    const entry = VOICE_CATALOG[this.currentPack]?.[eventId]
               ?? VOICE_CATALOG['generic'][eventId];
    if (!entry) return;

    // Cancel any in-flight voice line before starting a new one
    if (this.playingPromise) {
      this.stop(); // restores snapshot immediately
    }

    // Claim the slot before the first await so a second rapid call sees a
    // non-null token and knows this call is superseded.
    const token = ++this.playToken;

    const buffer = await this.loader.get(entry.file);

    // A newer playLine() call incremented playToken while we were loading.
    if (token !== this.playToken) return;
    this.mixer.setSnapshot('voice-duck', VOICE_DUCK_FADE_MS);
    const p = this.mixer.playOneShot('voice', buffer)
      .then(() => { this.mixer.setSnapshot(this.getSnapshot(), VOICE_RESTORE_MS); })
      .finally(() => { if (this.playingPromise === p) this.playingPromise = null; });
    this.playingPromise = p;
    await p;
  }
}
