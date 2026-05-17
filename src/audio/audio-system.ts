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
  private started = false;
  private iosResumeListeners: Array<() => void> = [];

  constructor(private readonly ctx: AudioContext) {
    this.loader = new AudioLoader(ctx);
    this.mixer = new AudioMixer(ctx);
    this.director = new MusicDirector(this.mixer, this.loader);
  }

  start(state: GameState, bus: EventBus): void {
    if (this.started) return;
    this.started = true;
    this.currentPlayerId = state.currentPlayer;

    const settings = state.settings;
    this.mixer.setMusicEnabled(settings.musicEnabled);
    this.mixer.setSfxEnabled(settings.soundEnabled);
    this.mixer.setMusicVolume(settings.musicVolume);
    this.mixer.setSfxVolume(settings.sfxVolume);

    this.wireEvents(bus);
    this.armIosResume();

    void this.preloadForEra(state.era, this.currentPlayerId);

    // Restore correct snapshot when resuming a saved game mid-era
    if (state.era > 1 && settings.musicEnabled) {
      this.director.handleEraAdvanced({ era: state.era, civType: this.currentPlayerId });
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
    this.started = false;
  }

  private wireEvents(bus: EventBus): void {
    this.unsubscribers.push(
      bus.on('era:advanced', p => {
        void this.preloadForEra(p.era, this.currentPlayerId);
        this.director.handleEraAdvanced({ era: p.era, civType: this.currentPlayerId });
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
        this.director.handleCityFounded({ civType: this.currentPlayerId });
      }),

      bus.on('currentPlayer:changed-after-handoff', p => {
        this.currentPlayerId = p.civId;
        this.warCount = 0;
        this.director.handlePlayerChanged({ civType: p.civId });
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
    const handler = () => void this.tryResume();
    this.iosResumeListeners.push(handler);
    document.addEventListener('visibilitychange', handler);
  }

  private disarmIosResume(): void {
    if (typeof document === 'undefined') return;
    for (const handler of this.iosResumeListeners) {
      document.removeEventListener('visibilitychange', handler);
    }
    this.iosResumeListeners = [];
  }

  private async preloadForEra(era: number, civType: string): Promise<void> {
    const eraId = resolveEra(era);
    const family = getFamilyForCiv(civType);
    const paths = [
      ERA_BASE[eraId].file,
      WAR_LAYER[eraId].file,
      ACCENT[family].file,
    ];
    await this.loader.preload(paths);
  }
}
