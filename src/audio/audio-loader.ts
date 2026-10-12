export class AudioLoader {
  private cache = new Map<string, AudioBuffer>();
  private inflight = new Map<string, Promise<AudioBuffer>>();
  private cachedBytes = 0;
  private generation = 0;

  // Long playing tracks are owned by their source, not retained forever in this cache.
  constructor(private ctx: AudioContext, private readonly byteBudget = 8 * 1024 * 1024) {}

  get(path: string): Promise<AudioBuffer> {
    const cached = this.cache.get(path);
    if (cached) {
      this.cache.delete(path);
      this.cache.set(path, cached);
      return Promise.resolve(cached);
    }

    const existing = this.inflight.get(path);
    if (existing) return existing;

    const url = (import.meta.env?.BASE_URL ?? '/') + path;
    const generation = this.generation;

    const promise = fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => {
        if (generation !== this.generation) throw new Error('Audio load superseded');
        return this.ctx.decodeAudioData(buf);
      })
      .then(decoded => {
        if (generation === this.generation) this.cacheBuffer(path, decoded);
        return decoded;
      })
      .catch(() => {
        // Silent 1-frame fallback — keeps the audio graph valid without throwing
        return this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      })
      .finally(() => {
        if (this.inflight.get(path) === promise) this.inflight.delete(path);
      });

    this.inflight.set(path, promise);
    return promise;
  }

  async preload(paths: string[]): Promise<void> {
    await Promise.allSettled(paths.map(p => this.get(p)));
  }

  /** Warm browser/service-worker storage for offline use without retaining decoded PCM. */
  async prefetch(paths: string[]): Promise<void> {
    const pending = [...new Set(paths)];
    const generation = this.generation;
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (next < pending.length && generation === this.generation) {
        const path = pending[next++]!;
        try {
          const response = await fetch((import.meta.env?.BASE_URL ?? '/') + path);
          // Consume the response; encoded bytes can then be collected. The SW caches its clone.
          await response.arrayBuffer();
        } catch { /* Offline/missing assets remain retryable on demand. */ }
      }
    }));
  }

  clear(): void {
    this.generation += 1;
    this.cache.clear();
    this.inflight.clear();
    this.cachedBytes = 0;
  }

  private cacheBuffer(path: string, buffer: AudioBuffer): void {
    const bytes = buffer.length * buffer.numberOfChannels * 4;
    if (bytes > this.byteBudget) return;
    while (this.cachedBytes + bytes > this.byteBudget && this.cache.size > 0) {
      const [key, oldest] = this.cache.entries().next().value!;
      this.cachedBytes -= oldest.length * oldest.numberOfChannels * 4;
      this.cache.delete(key);
    }
    this.cache.set(path, buffer);
    this.cachedBytes += bytes;
  }

  isCached(path: string): boolean {
    return this.cache.has(path);
  }
}
