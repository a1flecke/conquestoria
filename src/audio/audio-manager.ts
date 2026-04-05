import { MusicGenerator, seedMusicRng } from './music-generator';

export class AudioManager {
  private musicElement: HTMLAudioElement | null = null;
  private musicGenerator = new MusicGenerator();
  private musicVolume = 0.5;
  private sfxVolume = 0.7;
  private musicEnabled = true;
  private sfxEnabled = true;
  private currentEra = 0;

  async playMusic(src: string): Promise<void> {
    if (!this.musicEnabled) return;

    this.musicGenerator.stop();

    if (this.musicElement) {
      this.musicElement.pause();
    }

    this.musicElement = new Audio(src);
    this.musicElement.loop = true;
    this.musicElement.volume = this.musicVolume;

    try {
      await this.musicElement.play();
    } catch {
      // Autoplay may be blocked — will play on user interaction
    }
  }

  playProceduralMusic(era: number): void {
    if (!this.musicEnabled) return;

    // Stop file-based music
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement = null;
    }

    this.currentEra = era;
    seedMusicRng(`era-${era}`);
    this.musicGenerator.start(era, this.musicVolume);
  }

  stopMusic(): void {
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement = null;
    }
    this.musicGenerator.stop();
    this.currentEra = 0;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicElement) {
      this.musicElement.volume = this.musicVolume;
    }
    this.musicGenerator.setVolume(this.musicVolume);
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicEnabled) {
      this.stopMusic();
    } else if (this.currentEra > 0) {
      this.musicGenerator.start(this.currentEra, this.musicVolume);
    }
    return this.musicEnabled;
  }

  toggleSfx(): boolean {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  getMusicEnabled(): boolean { return this.musicEnabled; }
  getSfxEnabled(): boolean { return this.sfxEnabled; }
  getCurrentEra(): number { return this.currentEra; }
}
