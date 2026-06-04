import type { AudioMixer, SnapshotId } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import { STINGER, UNREST_LAYER, DEFEAT_LAYER, WAR_LAYER, resolveEra, type TrackEntry } from './audio-catalog';

export interface WarDeclaredPayload {
  aggressor: string;
  defender: string;
  opponentKind: 'major' | 'minor' | 'barbarian';
}

export interface PeaceSignedPayload {
  remainingWars: number;
}

export interface EraAdvancedPayload {
  era: number;
  civType: string;
}

export interface CityFoundedPayload {
  civType: string;
}

// Extended for Spec 3 — includes authoritative hot-seat audio state
export interface PlayerChangedPayload {
  civType: string;
  atWar: boolean;
  unrestCityCount: number;
  nearDefeat: boolean;
}

export interface GameEndedPayload {
  outcome: 'victory' | 'defeat' | 'tie';
}

// Used by unrest + revolt handlers — same counter, same logic
export interface UnrestChangedPayload {
  owner: string; // civ ID — handler no-ops if this doesn't match currentCivId
}

export interface CivNearDefeatPayload {
  civId: string;
}

const CROSSFADE_MS = 2000;
const STINGER_DUCK_FADE_MS = 100;
const STINGER_RESTORE_MS = 1000;
const GAME_END_FADE_MS = 1500;
const ADAPTIVE_CROSSFADE_MS = 2000;

export class MusicDirector {
  // Adaptive state flags — authoritative source of current music state
  private atWar = false;
  private inUnrest = false;
  private nearDefeat = false;
  private unrestCityCount = 0;
  private currentCivId = '';
  private currentEra = 1;

  /**
   * Resolves when the current stinger (if any) completes.
   * AudioSystem (MR3) awaits this before playing voice lines for co-fire events.
   * Starts as Promise.resolve() — always safe to await.
   */
  public currentStingerPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly mixer: AudioMixer,
    private readonly loader: AudioLoader,
  ) {}

  /**
   * Priority: brink-of-defeat > at-war > unrest > peace
   * Public so AudioSystem can inject it as the VoiceDirector getSnapshot callback.
   */
  public resolveSnapshot(): SnapshotId {
    if (this.nearDefeat) return 'brink-of-defeat';
    if (this.atWar)      return 'at-war';
    if (this.inUnrest)   return 'unrest';
    return 'peace';
  }

  private applySnapshot(fadeMs = CROSSFADE_MS): void {
    this.mixer.setSnapshot(this.resolveSnapshot(), fadeMs);
    this.updateAdaptiveBusSource();
  }

  /** Switch the Adaptive bus source to match the resolved snapshot. */
  private updateAdaptiveBusSource(): void {
    const era = resolveEra(this.currentEra);
    const snapshot = this.resolveSnapshot();
    let entry: TrackEntry | null = null;
    if (snapshot === 'unrest')             entry = UNREST_LAYER[era];
    else if (snapshot === 'at-war')        entry = WAR_LAYER[era];
    else if (snapshot === 'brink-of-defeat') entry = DEFEAT_LAYER[era];

    if (entry) {
      const captured = entry;
      const snapshotAtDispatch = snapshot;
      void this.loader.get(captured.file).then(buf => {
        // Stale-check: if the snapshot changed while the load was in flight, skip the source swap.
        // This prevents the wrong adaptive layer from being set after a rapid state transition.
        if (this.resolveSnapshot() !== snapshotAtDispatch) return;
        this.mixer.setBusSource('adaptive', buf, true, captured.loop, ADAPTIVE_CROSSFADE_MS);
      });
    } else {
      // peace/silent — silence adaptive bus (snapshot gain is 0 anyway, but
      // clearing the source prevents an inaudible buffer playing in the background)
      this.mixer.setBusSource('adaptive', null, false, null, ADAPTIVE_CROSSFADE_MS);
    }
  }

  initPeaceSnapshot(): void {
    this.mixer.setSnapshot('peace', 0);
  }

  handleEraAdvanced(p: EraAdvancedPayload): void {
    this.currentEra = p.era;
    this.applySnapshot(CROSSFADE_MS);
    // Chain transition-cue → era-advance stingers sequentially
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.eraTransitionCue[resolveEra(p.era)].file)
      .then(() => this.playStingerWithDuck(STINGER.eraAdvance[resolveEra(p.era)].file));
  }

  handleWarDeclared(_p: WarDeclaredPayload): void {
    this.atWar = true;
    this.applySnapshot(CROSSFADE_MS);
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.warDeclared.file);
  }

  handlePeaceSigned(p: PeaceSignedPayload): void {
    if (p.remainingWars > 0) return;
    this.atWar = false;
    // Do NOT call applySnapshot() here — playStingerWithDuck() calls setSnapshot('stinger-duck')
    // immediately, then restores to resolveSnapshot() (now 'peace') after the stinger.
    // Calling applySnapshot() before the stinger would start a peace crossfade that immediately
    // conflicts with the stinger-duck, causing an audible glitch.
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.peaceSigned.file);
  }

  handleCityFounded(_p: CityFoundedPayload): void {
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.cityFounded.file);
  }

  handleWonderBuilt(): void {
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.wonderBuilt.file);
  }

  handleTechResearched(): void {
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.techResearched.file);
  }

  handleCivDefeated(): void {
    this.currentStingerPromise = this.playStingerWithDuck(STINGER.civDefeated.file);
  }

  handleUnrestStarted(p: UnrestChangedPayload): void {
    if (p.owner !== this.currentCivId) return;
    this.unrestCityCount++;
    this.inUnrest = true;
    this.applySnapshot(CROSSFADE_MS);
  }

  // faction:revolt-started increments the same counter —
  // revolt is a more severe form of unrest, treated identically for music purposes.
  handleRevoltStarted(p: UnrestChangedPayload): void {
    this.handleUnrestStarted(p);
  }

  handleUnrestResolved(p: UnrestChangedPayload): void {
    if (p.owner !== this.currentCivId) return;
    this.unrestCityCount = Math.max(0, this.unrestCityCount - 1);
    this.inUnrest = this.unrestCityCount > 0;
    this.applySnapshot(CROSSFADE_MS);
  }

  handleNearDefeat(p: CivNearDefeatPayload): void {
    if (p.civId !== this.currentCivId) return;
    this.nearDefeat = true;
    this.applySnapshot(CROSSFADE_MS);
  }

  handleRecoveredFromNearDefeat(p: CivNearDefeatPayload): void {
    if (p.civId !== this.currentCivId) return;
    this.nearDefeat = false;
    this.applySnapshot(CROSSFADE_MS);
  }

  handlePlayerChanged(p: PlayerChangedPayload): void {
    this.currentCivId = p.civType;
    // Reset all flags from the authoritative payload — prevents hot-seat drift
    this.atWar = p.atWar;
    this.unrestCityCount = p.unrestCityCount;
    this.inUnrest = p.unrestCityCount > 0;
    this.nearDefeat = p.nearDefeat;
    this.applySnapshot(CROSSFADE_MS);
  }

  /**
   * Returns a Promise that resolves after the stinger + post-stinger silence fade.
   * AudioSystem (MR3) awaits this before playing the victory voice line.
   * IMPORTANT: deliberately calls setSnapshot('silent') after stinger, NOT resolveSnapshot()
   * — the game is over; the music loop must not resume.
   */
  handleGameEnded(p: GameEndedPayload): Promise<void> {
    const stingerFile = p.outcome === 'victory' ? STINGER.victory.file : STINGER.defeat.file;
    this.mixer.setSnapshot('stinger-duck', STINGER_DUCK_FADE_MS);
    this.currentStingerPromise = this.loader.get(stingerFile)
      .then(buffer => this.mixer.playOneShot('stinger', buffer))
      .then(() => { this.mixer.setSnapshot('silent', GAME_END_FADE_MS); });
    return this.currentStingerPromise;
  }

  async playStingerWithDuck(path: string): Promise<void> {
    this.mixer.setSnapshot('stinger-duck', STINGER_DUCK_FADE_MS);
    const buffer = await this.loader.get(path);
    await this.mixer.playOneShot('stinger', buffer);
    this.mixer.setSnapshot(this.resolveSnapshot(), STINGER_RESTORE_MS);
  }
}
