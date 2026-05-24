import type { EventBus } from '../core/event-bus';
import type { GameState } from '../core/types';
import { AudioLoader } from './audio-loader';
import { AudioMixer } from './audio-mixer';
import { MusicDirector } from './music-director';
import { getFamilyForCiv } from './civ-audio-family';
import { ERA_BASE, WAR_LAYER, ACCENT, resolveEra } from './audio-catalog';

export class AudioSystem {
  private loader: AudioLoader;
  private mixer: AudioMixer;
  private director: MusicDirector;
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

    this.wireEvents(bus);
    this.armIosResume();

    void this.preloadForEra(state.era, this.currentCivType);

    // Restore correct snapshot state machine when resuming a saved game mid-era.
    // Guard on era only, not musicEnabled — director state must be correct even when muted.
    if (state.era > 1) {
      this.director.handleEraAdvanced({ era: state.era, civType: this.currentCivType });
    } else {
      // Era-1 new game: the AudioContext is created before any user gesture and
      // may be suspended. setSnapshot('peace', 0) is synchronous and ensures gain
      // nodes are at the correct peace levels as soon as preloadForEra resolves
      // and setBusSource starts the audio nodes — no stinger needed.
      this.mixer.setSnapshot('peace', 0);
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

  getSfxRoutingNode(): AudioNode {
    return this.mixer.getSfxRoutingNode();
  }

  dispose(): void {
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];
    this.disarmIosResume();
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
        this.warCount = 0;
        this.director.handlePlayerChanged({ civType: this.currentCivType });
        // Swap in the new civ's accent track; era + adaptive buses keep their current sources
        void this.reloadAccent(this.currentCivType);
      }),

      bus.on('game:over', p => {
        const outcome = p.winnerId === this.currentPlayerId ? 'victory' : 'defeat';
        this.director.handleGameEnded({ outcome });
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
