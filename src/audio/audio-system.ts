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
import { routeSfxComponents } from './sfx';
import { PirateAudioDirector, type PirateAmbientStopReason } from './pirate-audio-director';
import { ReligionAudioDirector } from './religion-audio-director';
import { NetworkAudioDirector } from './network-audio-director';
import type { GameEvents } from '@/core/types';

export class AudioSystem {
  private loader: AudioLoader;
  private mixer: AudioMixer;
  private director: MusicDirector;
  private voiceDirector: VoiceDirector;
  private naturalWonderDirector: NaturalWonderAudioDirector;
  private sfxDirector: SfxDirector;
  private pirateAudioDirector: PirateAudioDirector;
  private religionAudioDirector: ReligionAudioDirector;
  private networkAudioDirector: NetworkAudioDirector;
  private stateProvider: (() => GameState) | null = null;
  private unsubscribers: Array<() => void> = [];
  private warCount = 0;
  private currentPlayerId = '';
  private currentCivType = '';
  private civTypeById: Record<string, string> = {};
  private started = false;
  private iosResumeListeners: Array<() => void> = [];
  private gestureResumeHandler: (() => void) | null = null;
  private isPresentationSuppressed: () => boolean = () => false;
  private loopLoadRequestId = 0;
  private strategicWarningAudioKeys = new Set<string>();

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
    this.pirateAudioDirector = new PirateAudioDirector(
      this.mixer,
      this.loader,
      path => this.director.playStingerWithDuck(path),
      () => this.stateProvider!(),
      () => this.isPresentationSuppressed(),
    );
    this.religionAudioDirector = new ReligionAudioDirector(
      path => this.director.playStingerWithDuck(path),
      () => this.stateProvider!(),
      () => this.isPresentationSuppressed(),
    );
    this.networkAudioDirector = new NetworkAudioDirector(
      path => this.director.playStingerWithDuck(path),
      () => this.stateProvider!(),
      () => this.isPresentationSuppressed(),
    );
  }

  start(
    state: GameState,
    bus: EventBus,
    getState: () => GameState = () => state,
    isPresentationSuppressed: () => boolean = () => false,
  ): void {
    if (this.started) {
      this.rebindCampaign(state, getState, isPresentationSuppressed);
      return;
    }
    this.started = true;
    this.bindCampaignState(state, getState, isPresentationSuppressed);
    this.applySettings(state);

    this.wireEvents(bus);
    this.sfxDirector.start(
      state.units,
      bus,
      getState,
      () => this.isPresentationSuppressed(),
    );
    this.pirateAudioDirector.start(bus);
    this.religionAudioDirector.start(bus);
    this.networkAudioDirector.start(bus);
    routeSfxComponents(this.mixer, this.loader, () => this.isPresentationSuppressed());
    this.armIosResume();
    this.resumeAndDisarmGestureOnSuccess();

    void this.preloadForEra(state.era, this.currentCivType);
    void this.preloadSfx();
    // Spec 3: set current voice pack and preload its clips
    this.voiceDirector.setVoicePack(this.currentCivType);
    void this.preloadVoicePack(this.currentCivType);
    // Always preload generic pack — used as fallback for partial hero packs
    // and for all 19 non-hero civs. 10 clips ≈ 350 KB, negligible cost.
    if (this.currentCivType !== 'generic') {
      void this.preloadVoicePack('generic');
    }

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
    this.pirateAudioDirector.setEnabled(enabled);
  }

  // #594 MR7: entry point for the 4 toast-replacement religion cues (founded,
  // city-converted, loyalty-warning, city-defected). See displayNextNotification in
  // main.ts, which calls this instead of SFX.notification() when a toast carries a
  // religion sfxCue.
  async playReligionStinger(cue: string): Promise<void> {
    await this.religionAudioDirector.playCue(cue);
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

  startPirateHeadquartersAmbience(factionId: string): Promise<boolean> {
    return this.pirateAudioDirector.startHeadquartersAmbience(factionId);
  }

  stopPirateAmbience(reason: PirateAmbientStopReason): void {
    this.pirateAudioDirector.stopAmbience(reason);
  }

  dispose(): void {
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];
    this.disarmIosResume();
    this.voiceDirector.stop();
    this.naturalWonderDirector.stopAmbient('system-disposed');
    this.sfxDirector.dispose();
    this.pirateAudioDirector.dispose();
    this.networkAudioDirector.dispose();
    this.mixer.dispose();
    this.warCount = 0;
    this.currentPlayerId = '';
    this.currentCivType = '';
    this.civTypeById = {};
    this.stateProvider = null;
    this.isPresentationSuppressed = () => false;
    this.loopLoadRequestId += 1;
    this.strategicWarningAudioKeys.clear();
    this.started = false;
  }

  private bindCampaignState(
    state: GameState,
    getState: () => GameState,
    isPresentationSuppressed: () => boolean,
  ): void {
    this.currentPlayerId = state.currentPlayer;
    this.stateProvider = getState;
    this.isPresentationSuppressed = isPresentationSuppressed;
    this.civTypeById = {};
    for (const [id, civ] of Object.entries(state.civilizations ?? {})) {
      this.civTypeById[id] = civ.civType;
    }
    this.currentCivType = this.civTypeById[this.currentPlayerId] ?? this.currentPlayerId;
  }

  private hasActiveCrisisFor(civId: string, state: GameState): boolean {
    return Object.values(state.activeCrises ?? {}).some(c => c.targetCivId === civId);
  }

  private applySettings(state: GameState): void {
    const settings = state.settings;
    this.mixer.setMusicEnabled(settings.musicEnabled);
    this.mixer.setSfxEnabled(settings.soundEnabled);
    this.mixer.setMusicVolume(settings.musicVolume);
    this.mixer.setSfxVolume(settings.sfxVolume);
    this.mixer.setVoiceEnabled(settings.voiceEnabled ?? true);
    this.mixer.setVoiceVolume(settings.voiceVolume ?? 1.0);
    this.mixer.setStingerEnabled(settings.stingerEnabled ?? true);
    this.mixer.setStingerVolume(settings.stingerVolume ?? 1.0);
  }

  private rebindCampaign(
    state: GameState,
    getState: () => GameState,
    isPresentationSuppressed: () => boolean,
  ): void {
    this.strategicWarningAudioKeys.clear();
    this.bindCampaignState(state, getState, isPresentationSuppressed);
    this.applySettings(state);
    this.sfxDirector.replaceUnits(
      state.units,
      getState,
      () => this.isPresentationSuppressed(),
    );
    this.naturalWonderDirector.stopAmbient('player-changed');
    this.pirateAudioDirector.stopAmbience('player-changed');
    this.voiceDirector.stop();
    this.voiceDirector.setVoicePack(this.currentCivType);
    void this.preloadVoicePack(this.currentCivType);

    const civ = state.civilizations[this.currentPlayerId];
    this.warCount = civ?.diplomacy?.atWarWith?.length ?? 0;
    const unrestCityCount = Object.values(state.cities ?? {})
      .filter(city => city.owner === this.currentPlayerId && city.unrestLevel > 0)
      .length;
    this.director.handlePlayerChanged({
      civId: this.currentPlayerId,
      civType: this.currentCivType,
      era: state.era,
      atWar: this.warCount > 0,
      unrestCityCount,
      nearDefeat: civ?.nearDefeat ?? false,
      inBeastTerritory: false,
    });
    this.director.setCrisisActiveForCurrentPlayer(this.hasActiveCrisisFor(this.currentPlayerId, state));
    void this.preloadForEra(state.era, this.currentCivType);
  }

  private wireEvents(sourceBus: EventBus): void {
    const isSuppressed = (): boolean => this.isPresentationSuppressed();
    const bus = {
      on<K extends keyof GameEvents>(
        event: K,
        listener: (payload: GameEvents[K]) => void,
      ): () => void {
        return sourceBus.on(event, payload => {
          if (!isSuppressed()) listener(payload);
        });
      },
    } as EventBus;
    this.unsubscribers.push(
      bus.on('ai:strategic-warning', warning => {
        if (!warning.playAudio) return;
        const turn = this.stateProvider?.().turn;
        if (!Number.isFinite(turn)) return;
        this.playStrategicWarning(warning.viewerId, turn!);
      }),

      bus.on('ai:strategic-warning-audio', event => {
        this.playStrategicWarning(event.viewerId, event.turn);
      }),

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
        const currentState = this.stateProvider?.();
        const era = p.era ?? currentState?.era ?? 1;
        this.currentPlayerId = p.civId;
        this.currentCivType = p.civType
          ?? this.civTypeById[p.civId]
          ?? currentState?.civilizations[p.civId]?.civType
          ?? p.civId;
        // Reset warCount to exact count from payload so remainingWars stays precise
        this.warCount = p.atWarCount;
        this.naturalWonderDirector.stopAmbient('player-changed');
        this.director.handlePlayerChanged({
          civId: this.currentPlayerId,
          civType: this.currentCivType,
          era,
          atWar: p.atWarCount > 0,
          unrestCityCount: p.unrestCityCount,
          nearDefeat: p.nearDefeat,
          inBeastTerritory: p.inBeastTerritory,
        });
        this.director.setCrisisActiveForCurrentPlayer(
          currentState ? this.hasActiveCrisisFor(this.currentPlayerId, currentState) : false,
        );
        // Hidden round processing may have advanced the era. Rewire all loop buses
        // from the authoritative handoff snapshot without replaying the era stinger.
        void this.preloadForEra(era, this.currentCivType);
        // Spec 3: hot-seat voice privacy — stop any in-progress voice line from outgoing player
        this.voiceDirector.stop();
        this.voiceDirector.setVoicePack(this.currentCivType);
        void this.preloadVoicePack(this.currentCivType);
      }),

      bus.on('crisis:started', p => {
        if (p.civId !== this.currentPlayerId) return;
        this.director.setCrisisActiveForCurrentPlayer(true);
        this.director.handleCrisisStarted();
      }),

      bus.on('crisis:resolved', p => {
        if (p.civId !== this.currentPlayerId) return;
        const currentState = this.stateProvider?.();
        this.director.setCrisisActiveForCurrentPlayer(
          currentState ? this.hasActiveCrisisFor(this.currentPlayerId, currentState) : false,
        );
        // 'hunted' (MR3) is just as much a triumphant resolution as containing an
        // outbreak or recovering from a catastrophe — the player slew the foe.
        if (p.outcome === 'contained' || p.outcome === 'recovered' || p.outcome === 'hunted') {
          this.director.handleCrisisResolved();
        }
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
      // Each event has its own explicit bus.on() rather than a dynamic table
      // because bus.on() is strongly typed per GameEvents key — a generic
      // Record<string, handler> loop cannot satisfy the overload signature.

      // era:advanced — second subscription (first handles music era-advance).
      // Multiple subscribers to the same event are intentional here.
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

      // Stinger subs registered BEFORE voice subs for the same event so that
      // when the event fires the stinger handler updates currentStingerPromise
      // first, and the voice handler then awaits the correct (new) promise.
      bus.on('tech:completed', p => {
        if (p.civId !== this.currentPlayerId) return;
        this.director.handleTechResearched();
      }),

      bus.on('tech:completed', async p => {
        if (p.civId !== this.currentPlayerId) return;
        await this.director.currentStingerPromise;
        void this.voiceDirector.playLine('tech-completed');
      }),

      bus.on('wonder:legendary-completed', p => {
        if (p.civId !== this.currentPlayerId) return;
        this.director.handleWonderBuilt();
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

  private canPlayStrategicWarning(viewerId: string): boolean {
    const state = this.stateProvider?.();
    if (!state || viewerId !== this.currentPlayerId || state.currentPlayer !== viewerId) {
      return false;
    }
    if (this.isPresentationSuppressed()) return false;
    if (
      !state.settings.soundEnabled
      || state.settings.stingerEnabled === false
      || (state.settings.stingerVolume ?? 1) <= 0
    ) {
      return false;
    }
    if (this.ctx.state !== 'running') return false;
    if (typeof document !== 'undefined') {
      if (document.hidden || document.visibilityState === 'hidden') return false;
    }
    return true;
  }

  private playStrategicWarning(viewerId: string, turn: number): void {
    const key = `${viewerId}:${turn}`;
    if (this.strategicWarningAudioKeys.has(key)) return;
    if (!this.canPlayStrategicWarning(viewerId)) return;
    this.strategicWarningAudioKeys.add(key);
    const era = this.stateProvider?.().era ?? 1;
    this.director.handleStrategicWarning(
      era,
      () => this.canPlayStrategicWarning(viewerId),
    );
  }

  private async tryResume(): Promise<boolean> {
    if (this.ctx.state === 'running') return true;
    if (this.ctx.state !== 'suspended') return false;
    try {
      await this.ctx.resume();
    } catch {
      return false;
    }
    return (this.ctx.state as AudioContextState) === 'running';
  }

  private resumeAndDisarmGestureOnSuccess(): void {
    void this.tryResume().then(resumed => {
      if (resumed) this.disarmGestureResume();
    });
  }

  private disarmGestureResume(): void {
    if (!this.gestureResumeHandler || typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', this.gestureResumeHandler);
    this.gestureResumeHandler = null;
  }

  private armIosResume(): void {
    if (typeof document === 'undefined') return;

    // Existing visibilitychange handler covers iOS background/foreground resume.
    const visHandler = () => this.resumeAndDisarmGestureOnSuccess();
    this.iosResumeListeners.push(visHandler);
    document.addEventListener('visibilitychange', visHandler);

    // Gesture resume: AudioContext created before the first user interaction is
    // suspended by the browser. Keep retrying on pointerdown until an awaited
    // resume attempt confirms that the context is running.
    this.gestureResumeHandler = () => this.resumeAndDisarmGestureOnSuccess();
    document.addEventListener('pointerdown', this.gestureResumeHandler);
  }

  private disarmIosResume(): void {
    if (typeof document === 'undefined') return;
    for (const handler of this.iosResumeListeners) {
      document.removeEventListener('visibilitychange', handler);
    }
    this.iosResumeListeners = [];
    this.disarmGestureResume();
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
    const requestId = ++this.loopLoadRequestId;
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
    if (requestId !== this.loopLoadRequestId) return;

    // Wire all three loop buses — the snapshot (peace/at-war/silent) controls which
    // are audible; the adaptive (war) bus runs silently in peace and fades up on war.
    this.mixer.setBusSource('era',      baseBuffer,   true, baseEntry.loop,   500);
    this.mixer.setBusSource('adaptive', warBuffer,    true, warEntry.loop,     500);
    this.mixer.setBusSource('accent',   accentBuffer, true, accentEntry.loop,  500);
  }
}
