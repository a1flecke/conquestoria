import type { EventBus } from '../core/event-bus';
import type { GameState } from '../core/types';
import { AudioLoader } from './audio-loader';
import { AudioMixer } from './audio-mixer';
import { MusicDirector } from './music-director';
import { VoiceDirector } from './voice-director';
import { NaturalWonderAudioDirector, type NaturalWonderAmbientStopReason } from './natural-wonder-audio-director';
import { getFamilyForCiv } from './civ-audio-family';
import { getVoicePackForCiv } from './civ-voice-family';
import { ERA_BASE, WAR_LAYER, ACCENT, resolveEra } from './audio-catalog';
import { VOICE_CATALOG, ALL_VOICE_EVENT_IDS, type VoicePackId } from './voice-catalog';
import { allSfxEntries } from './sfx-catalog';
import { SfxDirector } from './sfx-director';

export class AudioSystem {
  private loader: AudioLoader;
  private mixer: AudioMixer;
  private director: MusicDirector;
  private voiceDirector: VoiceDirector;
  private naturalWonderDirector: NaturalWonderAudioDirector;
  private sfxDirector: SfxDirector;
  private unsubscribers: Array<() => void> = [];
  private warCount = 0;
  private currentPlayerId = '';
  private currentCivType = '';
  private civTypeById: Record<string, string> = {};
  private started = false;
  private iosResumeListeners: Array<() => void> = [];
  private gestureResumeHandler: (() => void) | null = null;

  constructor(private readonly ctx: AudioContext) {
    this.loader = new AudioLoader(ctx);
    this.mixer = new AudioMixer(ctx);
    this.director = new MusicDirector(this.mixer, this.loader);
    this.voiceDirector = new VoiceDirector(
      this.mixer,
      this.loader,
      () => this.director.resolveSnapshot(),
    );
    this.naturalWonderDirector = new NaturalWonderAudioDirector(
      this.mixer,
      this.loader,
      path => this.director.playStingerWithDuck(path),
    );
    this.sfxDirector = new SfxDirector(this.mixer, this.loader);
  }

  start(state: GameState, bus: EventBus): void {
    if (this.started) return;
    this.started = true;
    this.currentPlayerId = state.currentPlayer;

    // Snapshot civType lookup — civ identities are fixed for a game's lifetime
    for (const [id, civ] of Object.entries(state.civilizations ?? {})) {
      this.civTypeById[id] = (civ as { civType: string }).civType;
    }
    this.currentCivType = this.civTypeById[this.currentPlayerId] ?? this.currentPlayerId;

    const settings = state.settings;
    this.mixer.setMusicEnabled(settings.musicEnabled);
    this.mixer.setSfxEnabled(settings.soundEnabled);
    this.mixer.setMusicVolume(settings.musicVolume);
    this.mixer.setSfxVolume(settings.sfxVolume);
    this.mixer.setVoiceEnabled(settings.voiceEnabled ?? true);
    this.mixer.setVoiceVolume(settings.voiceVolume ?? 1.0);
    this.mixer.setStingerEnabled(settings.stingerEnabled ?? true);
    this.mixer.setStingerVolume(settings.stingerVolume ?? 1.0);

    this.wireEvents(bus);
    this.sfxDirector.start(state.units, bus);
    this.armIosResume();

    void this.preloadForEra(state.era, this.currentCivType);
    void this.preloadSfx();
    // Spec 3: set current voice pack and preload its clips
    this.voiceDirector.setVoicePack(this.currentCivType);
    void this.preloadVoicePack(this.currentCivType);

    // Restore correct snapshot state machine when resuming a saved game mid-era.
    // Guard on era only, not musicEnabled — director state must be correct even when muted.
    if (state.era > 1) {
      this.director.handleEraAdvanced({ era: state.era, civType: this.currentCivType });
    } else {
      // Era-1 new game: delegate to director so intendedSnapshot stays in sync.
      // initPeaceSnapshot is synchronous and idempotent — safe before preloadForEra resolves.
      this.director.initPeaceSnapshot();
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.mixer.setMusicEnabled(enabled);
  }

  setSfxEnabled(enabled: boolean): void {
    this.mixer.setSfxEnabled(enabled);
  }

  setMusicVolume(volume: number): void {
    this.mixer.setMusicVolume(volume);
  }

  setSfxVolume(volume: number): void {
    this.mixer.setSfxVolume(volume);
  }

  setMasterVolume(volume: number): void {
    this.mixer.setMasterVolume(volume);
  }

  setVoiceVolume(volume: number): void {
    this.mixer.setVoiceVolume(volume);
  }

  setVoiceEnabled(enabled: boolean): void {
    this.mixer.setVoiceEnabled(enabled);
  }

  setStingerVolume(volume: number): void {
    this.mixer.setStingerVolume(volume);
  }

  setStingerEnabled(enabled: boolean): void {
    this.mixer.setStingerEnabled(enabled);
  }

  getSfxRoutingNode(): AudioNode {
    return this.mixer.getSfxRoutingNode();
  }

  playNaturalWonderDiscovery(wonderId: string): Promise<boolean> {
    return this.naturalWonderDirector.playDiscoveryStinger(wonderId);
  }

  playNaturalWonderReplay(wonderId: string): Promise<boolean> {
    return this.naturalWonderDirector.playCodexReplay(wonderId);
  }

  startNaturalWonderCodexAmbient(wonderId: string): Promise<boolean> {
    return this.naturalWonderDirector.startCodexAmbient(wonderId);
  }

  startNaturalWonderMapFocusAmbient(wonderId: string): Promise<boolean> {
    return this.naturalWonderDirector.startMapFocusAmbient(wonderId);
  }

  stopNaturalWonderAmbient(reason: NaturalWonderAmbientStopReason): void {
    this.naturalWonderDirector.stopAmbient(reason);
  }

  dispose(): void {
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];
    this.disarmIosResume();
    this.voiceDirector.stop();
    this.naturalWonderDirector.stopAmbient('system-disposed');
    this.sfxDirector.dispose();
    this.mixer.dispose();
    this.warCount = 0;
    this.currentPlayerId = '';
    this.currentCivType = '';
    this.civTypeById = {};
    this.started = false;
  }

  private wireEvents(bus: EventBus): void {
    this.unsubscribers.push(
      bus.on('era:advanced', p => {
        void this.preloadForEra(p.era, this.currentCivType);
        this.director.handleEraAdvanced({ era: p.era, civType: this.currentCivType });
      }),

      bus.on('diplomacy:war-declared', p => {
        const involved = p.attackerId === this.currentPlayerId || p.defenderId === this.currentPlayerId;
        if (!involved) return;
        this.warCount++;
        this.director.handleWarDeclared({
          aggressor: p.attackerId,
          defender: p.defenderId,
          opponentKind: p.opponentKind,
        });
      }),

      bus.on('diplomacy:peace-made', p => {
        const involved = p.civA === this.currentPlayerId || p.civB === this.currentPlayerId;
        if (!involved) return;
        this.warCount = Math.max(0, this.warCount - 1);
        this.director.handlePeaceSigned({ remainingWars: this.warCount });
      }),

      bus.on('city:founded', p => {
        if (p.founderId !== this.currentPlayerId) return;
        this.director.handleCityFounded({ civType: this.currentCivType });
      }),

      bus.on('currentPlayer:changed-after-handoff', p => {
        this.currentPlayerId = p.civId;
        this.currentCivType = this.civTypeById[p.civId] ?? p.civId;
        // Reset warCount to exact count from payload so remainingWars stays precise
        this.warCount = p.atWarCount;
        this.naturalWonderDirector.stopAmbient('player-changed');
        this.director.handlePlayerChanged({
          civType: this.currentCivType,
          atWar: p.atWarCount > 0,
          unrestCityCount: p.unrestCityCount,
          nearDefeat: p.nearDefeat,
        });
        // Swap in the new civ's accent track; era + adaptive buses keep their current sources
        void this.reloadAccent(this.currentCivType);
        // Spec 3: hot-seat voice privacy — stop any in-progress voice line from outgoing player
        this.voiceDirector.stop();
        this.voiceDirector.setVoicePack(this.currentCivType);
        void this.preloadVoicePack(this.currentCivType);
      }),

      bus.on('game:over', p => {
        const outcome = p.winnerId === this.currentPlayerId ? 'victory' : 'defeat';
        this.naturalWonderDirector.stopAmbient('game-ended');
        this.voiceDirector.stop(); // cut any in-progress voice line
        const stingerPromise = this.director.handleGameEnded({ outcome });
        if (outcome === 'victory') {
          // Chain victory voice line after stinger completes, then silence
          void stingerPromise.then(() => this.voiceDirector.playLine('victory'));
        }
      }),

      // ── Spec 3: voice line subscriptions ─────────────────────────────────
      // era:advanced — global, no player filter needed
      bus.on('era:advanced', async () => {
        await this.director.currentStingerPromise; // era stinger plays first
        void this.voiceDirector.playLine('era-advance');
      }),

      bus.on('city:founded', async p => {
        if (p.founderId !== this.currentPlayerId) return;
        await this.director.currentStingerPromise;
        void this.voiceDirector.playLine('city-founded');
      }),

      bus.on('diplomacy:war-declared', async p => {
        if (p.attackerId !== this.currentPlayerId) return;
        await this.director.currentStingerPromise;
        void this.voiceDirector.playLine('war-declared');
      }),

      bus.on('tech:completed', async p => {
        if (p.civId !== this.currentPlayerId) return;
        await this.director.currentStingerPromise;
        void this.voiceDirector.playLine('tech-completed');
      }),

      bus.on('wonder:legendary-completed', async p => {
        if (p.civId !== this.currentPlayerId) return;
        await this.director.currentStingerPromise;
        void this.voiceDirector.playLine('wonder-built');
      }),

      bus.on('wonder:legendary-lost', p => {
        if (p.civId !== this.currentPlayerId) return;
        // no stinger for wonder-lost — voice plays immediately
        void this.voiceDirector.playLine('wonder-lost');
      }),

      bus.on('city:captured', p => {
        if (p.previousOwner !== this.currentPlayerId) return;
        // no stinger for city-lost — voice plays immediately
        void this.voiceDirector.playLine('city-lost');
      }),

      bus.on('civ:near-defeat', p => {
        if (p.civId !== this.currentPlayerId) return;
        void this.voiceDirector.playLine('near-defeat');
      }),

      bus.on('diplomacy:peace-made', async p => {
        const involved = p.civA === this.currentPlayerId || p.civB === this.currentPlayerId;
        if (!involved) return;
        await this.director.currentStingerPromise;
        void this.voiceDirector.playLine('peace-signed');
      }),

      // Spec 3: new stinger events
      bus.on('wonder:legendary-completed', p => {
        if (p.civId !== this.currentPlayerId) return;
        this.director.handleWonderBuilt();
      }),

      bus.on('tech:completed', p => {
        if (p.civId !== this.currentPlayerId) return;
        this.director.handleTechResearched();
      }),

      bus.on('civ:eliminated', p => {
        if (p.eliminatedBy !== this.currentPlayerId) return;
        this.director.handleCivDefeated();
      }),

      // Spec 3: adaptive state events
      bus.on('faction:unrest-started', p => {
        this.director.handleUnrestStarted({ owner: p.owner });
      }),

      bus.on('faction:revolt-started', p => {
        this.director.handleRevoltStarted({ owner: p.owner });
      }),

      bus.on('faction:unrest-resolved', p => {
        this.director.handleUnrestResolved({ owner: p.owner });
      }),

      bus.on('civ:near-defeat', p => {
        this.director.handleNearDefeat({ civId: p.civId });
      }),

      bus.on('civ:recovered-from-near-defeat', p => {
        this.director.handleRecoveredFromNearDefeat({ civId: p.civId });
      }),
    );
  }

  private async tryResume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  private armIosResume(): void {
    if (typeof document === 'undefined') return;

    // Existing visibilitychange handler covers iOS background/foreground resume.
    const visHandler = () => void this.tryResume();
    this.iosResumeListeners.push(visHandler);
    document.addEventListener('visibilitychange', visHandler);

    // Gesture resume: AudioContext created before the first user interaction is
    // suspended by the browser. A single pointerdown unlocks it; remove the
    // listener immediately after so it does not fire on every tap.
    this.gestureResumeHandler = () => {
      void this.tryResume();
      document.removeEventListener('pointerdown', this.gestureResumeHandler!);
      this.gestureResumeHandler = null;
    };
    document.addEventListener('pointerdown', this.gestureResumeHandler);
  }

  private disarmIosResume(): void {
    if (typeof document === 'undefined') return;
    for (const handler of this.iosResumeListeners) {
      document.removeEventListener('visibilitychange', handler);
    }
    this.iosResumeListeners = [];
    if (this.gestureResumeHandler) {
      document.removeEventListener('pointerdown', this.gestureResumeHandler);
      this.gestureResumeHandler = null;
    }
  }

  private async reloadAccent(civType: string): Promise<void> {
    const family = getFamilyForCiv(civType);
    const accentEntry = ACCENT[family];
    const buffer = await this.loader.get(accentEntry.file);
    this.mixer.setBusSource('accent', buffer, true, accentEntry.loop, 500);
  }

  private preloadSfx(): Promise<void> {
    return this.loader.preload(allSfxEntries().map(e => e.file));
  }

  /**
   * Preload the current voice pack (10 clips ≈ 350 KB).
   * Called on game start and on each player handoff.
   * Only preloads the current player's pack — generic is lazy-loaded on first use.
   */
  private preloadVoicePack(civType: string): Promise<void> {
    const packId: VoicePackId = getVoicePackForCiv(civType);
    const files = ALL_VOICE_EVENT_IDS
      .map(e => VOICE_CATALOG[packId]?.[e]?.file)
      .filter((f): f is string => !!f);
    return this.loader.preload(files);
  }

  private async preloadForEra(era: number, civType: string): Promise<void> {
    const eraId = resolveEra(era);
    const family = getFamilyForCiv(civType);

    const baseEntry   = ERA_BASE[eraId];
    const warEntry    = WAR_LAYER[eraId];
    const accentEntry = ACCENT[family];

    const [baseBuffer, warBuffer, accentBuffer] = await Promise.all([
      this.loader.get(baseEntry.file),
      this.loader.get(warEntry.file),
      this.loader.get(accentEntry.file),
    ]);

    // Wire all three loop buses — the snapshot (peace/at-war/silent) controls which
    // are audible; the adaptive (war) bus runs silently in peace and fades up on war.
    this.mixer.setBusSource('era',      baseBuffer,   true, baseEntry.loop,   500);
    this.mixer.setBusSource('adaptive', warBuffer,    true, warEntry.loop,     500);
    this.mixer.setBusSource('accent',   accentBuffer, true, accentEntry.loop,  500);
  }
}
