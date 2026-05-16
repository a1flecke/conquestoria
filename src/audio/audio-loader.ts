export class AudioLoader {
  private cache = new Map<string, AudioBuffer>();
  private inflight = new Map<string, Promise<AudioBuffer>>();

  constructor(private ctx: AudioContext) {}

  get(path: string): Promise<AudioBuffer> {
    const cached = this.cache.get(path);
    if (cached) return Promise.resolve(cached);

    const existing = this.inflight.get(path);
    if (existing) return existing;

    const url = (import.meta.env?.BASE_URL ?? '/') + path;

    const promise = fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => this.ctx.decodeAudioData(buf))
      .then(decoded => {
        this.cache.set(path, decoded);
        this.inflight.delete(path);
        return decoded;
      })
      .catch(() => {
        this.inflight.delete(path);
        // Silent 1-frame fallback — keeps the audio graph valid without throwing
        return this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      });

    this.inflight.set(path, promise);
    return promise;
  }

  async preload(paths: string[]): Promise<void> {
    await Promise.allSettled(paths.map(p => this.get(p)));
  }

  isCached(path: string): boolean {
    return this.cache.has(path);
  }
}
