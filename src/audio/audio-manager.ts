export class AudioManager {
  private musicElement: HTMLAudioElement | null = null;
  private musicVolume = 0.5;
  private sfxVolume = 0.7;
  private musicEnabled = true;
  private sfxEnabled = true;

  async playMusic(src: string): Promise<void> {
    if (!this.musicEnabled) return;

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

  stopMusic(): void {
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement = null;
    }
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicElement) {
      this.musicElement.volume = this.musicVolume;
    }
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicEnabled) this.stopMusic();
    return this.musicEnabled;
  }

  toggleSfx(): boolean {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  getMusicEnabled(): boolean { return this.musicEnabled; }
  getSfxEnabled(): boolean { return this.sfxEnabled; }
}
