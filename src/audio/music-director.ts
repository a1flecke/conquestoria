import type { AudioMixer, SnapshotId } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import { STINGER, resolveEra } from './audio-catalog';

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

export interface PlayerChangedPayload {
  civType: string;
}

export interface GameEndedPayload {
  outcome: 'victory' | 'defeat' | 'tie';
}

const CROSSFADE_MS = 2000;
const STINGER_DUCK_FADE_MS = 100;
const STINGER_RESTORE_MS = 1000;
const GAME_END_FADE_MS = 1500;

export class MusicDirector {
  private intendedSnapshot: SnapshotId = 'silent';

  constructor(
    private readonly mixer: AudioMixer,
    private readonly loader: AudioLoader,
  ) {}

  initPeaceSnapshot(): void {
    this.intendedSnapshot = 'peace';
    this.mixer.setSnapshot('peace', 0);
  }

  handleEraAdvanced(p: EraAdvancedPayload): void {
    const target: SnapshotId = this.intendedSnapshot === 'at-war' ? 'at-war' : 'peace';
    this.intendedSnapshot = target;
    this.mixer.setSnapshot(target, CROSSFADE_MS);
    void this.playStingerWithDuck(STINGER.eraTransitionCue[resolveEra(p.era)].file)
      .then(() => this.playStingerWithDuck(STINGER.eraAdvance[resolveEra(p.era)].file));
  }

  handleWarDeclared(_p: WarDeclaredPayload): void {
    this.intendedSnapshot = 'at-war';
    this.mixer.setSnapshot('at-war', CROSSFADE_MS);
    void this.playStingerWithDuck(STINGER.warDeclared.file);
  }

  handlePeaceSigned(p: PeaceSignedPayload): void {
    if (p.remainingWars > 0) return;
    this.intendedSnapshot = 'peace';
    this.mixer.setSnapshot('peace', CROSSFADE_MS);
  }

  handleCityFounded(_p: CityFoundedPayload): void {
    void this.playStingerWithDuck(STINGER.cityFounded.file);
  }

  handlePlayerChanged(_p: PlayerChangedPayload): void {
    this.mixer.setSnapshot(this.intendedSnapshot, CROSSFADE_MS);
  }

  handleGameEnded(_p: GameEndedPayload): void {
    this.mixer.setSnapshot('silent', GAME_END_FADE_MS);
  }

  async playStingerWithDuck(path: string): Promise<void> {
    this.mixer.setSnapshot('stinger-duck', STINGER_DUCK_FADE_MS);
    const buffer = await this.loader.get(path);
    await this.mixer.playOneShot('stinger', buffer);
    this.mixer.setSnapshot(this.intendedSnapshot, STINGER_RESTORE_MS);
  }
}
