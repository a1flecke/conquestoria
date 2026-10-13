import type { LoopPoints } from './audio-catalog';
import { PreparedStreamedLoop, StreamedLoopTrack, type StreamContext } from './streamed-loop';

/** What a looping music bus plays: a whole decoded buffer, or a prepared stream of small decoded windows (#1466). */
export type LoopSource = AudioBuffer | PreparedStreamedLoop;

/** Releases a loop source that was loaded but will not be played (a stale request). */
export function discardLoopSource(source: LoopSource): void {
  if (source instanceof PreparedStreamedLoop) source.discard();
}

export class AudioLoader {
  private cache = new Map<string, AudioBuffer>();
  private inflight = new Map<string, Promise<AudioBuffer>>();
  private cachedBytes = 0;
  private generation = 0;

  // Encoded long tracks that were parsed for streaming (`null`: tried, cannot be streamed, use a buffer).
  private streamTracks = new Map<string, StreamedLoopTrack | null>();
  private streamTrackBytes = 0;
  private streamOpenings = new Map<string, Promise<StreamedLoopTrack | null>>();

  // Long playing tracks are owned by their source, not retained forever in this cache.
  constructor(
    private ctx: AudioContext,
    private readonly byteBudget = 8 * 1024 * 1024,
    private readonly streaming = true,
  ) {}

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

  /**
   * A long looping music track, ready to start. It is streamed (only a couple of seconds of decoded audio are ever
   * held, #1466) whenever the file can be played exactly that way on this platform; otherwise, and for any failure
   * on the way, it is the whole decoded buffer exactly as before. The caller either plays the result or hands it
   * to `discardLoopSource`.
   */
  async getLoop(entry: { file: string; loop: LoopPoints }): Promise<LoopSource> {
    if (this.streaming && typeof this.ctx.decodeAudioData === 'function') {
      const generation = this.generation;
      try {
        const track = await this.openStreamTrack(entry.file, entry.loop);
        if (track && generation === this.generation) {
          const prepared = await track.prepare(this.ctx as unknown as StreamContext);
          if (!prepared) this.rememberStreamTrack(entry.file, null);
          else if (generation === this.generation) return prepared;
          else prepared.discard();
        }
      } catch {
        /* fall through to the whole-file path, which has its own failure handling */
      }
    }
    return this.get(entry.file);
  }

  private openStreamTrack(path: string, loop: LoopPoints): Promise<StreamedLoopTrack | null> {
    if (this.streamTracks.has(path)) {
      const track = this.streamTracks.get(path) ?? null;
      if (track) { this.streamTracks.delete(path); this.streamTracks.set(path, track); } // LRU touch
      return Promise.resolve(track);
    }
    const existing = this.streamOpenings.get(path);
    if (existing) return existing;
    const generation = this.generation;
    const promise = fetch((import.meta.env?.BASE_URL ?? '/') + path)
      .then(response => {
        if (response.ok === false) throw new Error('Audio request failed'); // not a verdict about the file itself
        return response.arrayBuffer();
      })
      .then(buffer => {
        const track = StreamedLoopTrack.open(this.ctx, new Uint8Array(buffer), loop);
        if (generation === this.generation) this.rememberStreamTrack(path, track);
        return track;
      })
      .finally(() => {
        if (this.streamOpenings.get(path) === promise) this.streamOpenings.delete(path);
      });
    this.streamOpenings.set(path, promise);
    return promise;
  }

  private rememberStreamTrack(path: string, track: StreamedLoopTrack | null): void {
    const previous = this.streamTracks.get(path);
    if (previous) this.streamTrackBytes -= previous.encodedBytes;
    this.streamTracks.delete(path);
    if (track) {
      if (track.encodedBytes > this.byteBudget) return; // larger than the whole budget: never retained
      // The encoded bytes of the tracks currently in use are held by their players anyway; this only bounds reuse.
      while (this.streamTrackBytes + track.encodedBytes > this.byteBudget && this.streamTracks.size > 0) {
        const [key, oldest] = this.streamTracks.entries().next().value!;
        if (oldest) this.streamTrackBytes -= oldest.encodedBytes;
        this.streamTracks.delete(key);
      }
      this.streamTrackBytes += track.encodedBytes;
    }
    this.streamTracks.set(path, track);
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
    this.streamTracks.clear();
    this.streamOpenings.clear();
    this.streamTrackBytes = 0;
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
