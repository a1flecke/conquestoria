/**
 * Cuts a looping music track into decode windows for streamed playback (#1466).
 *
 * The loop is the track's first `loopFrames` output frames (what `AudioBufferSourceNode` loops with
 * `loopStart = 0`). Each window decodes a run of packets; its middle part, the *core*, is what gets played, and the
 * cores tile `[0, loopFrames)` exactly. The rest of a window is lead-in before the core and a tail after it.
 *
 * `decodeAudioData` resamples a file to the context rate (48 kHz for a 44.1 kHz file), and it does so for each
 * stream independently. A polyphase resampler's output grid depends on where its input starts, so a window that
 * starts anywhere would sit a fraction of a frame off the whole file's grid and its seams would not be exact.
 * With the rate ratio reduced to `p / q` (160 / 147), the grids coincide when the window's first input sample is a
 * multiple of `q`. The sample position of every packet is known exactly (`OggVorbisStream.granules`), so each window
 * starts at the nearest packet at or before `coreStart - margin` whose position is a multiple of `q`. The lead-in
 * also absorbs the resampler's start-up transient and the Vorbis overlap warm-up, and the tail its end transient.
 * Verified in a browser against the full decode (max error ~6e-8, i.e. float rounding).
 */
import type { OggVorbisStream } from './ogg-vorbis';

export interface StreamPlanOptions {
  /** `AudioContext.sampleRate`. */
  outputRate: number;
  /** The catalog's `loopEnd` in seconds; the loop starts at 0. */
  loopEndSeconds: number;
  coreSeconds: number;
  marginSeconds: number;
}

export interface StreamWindow {
  index: number;
  /** Output frames `[coreStart, coreEnd)` of the loop that this window plays. */
  coreStart: number;
  coreEnd: number;
  /** The pre-roll packet (consumed without output) and the last packet decoded. */
  firstPacket: number;
  lastPacket: number;
  /** Loop-timeline output frame of the first frame the decoder returns for this window. An integer by construction. */
  startFrame: number;
  /** How many frames the decode should return (to within a frame: the resampler rounds). */
  expectedFrames: number;
}

export interface StreamPlan {
  /** Output frames per input frame as `p / q`, reduced. */
  ratio: { p: number; q: number };
  loopFrames: number;
  windows: StreamWindow[];
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Index of the first element with `values[i] >= target`, or `values.length`. */
function lowerBound(values: ArrayLike<number>, target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function planStreamWindows(stream: OggVorbisStream, options: StreamPlanOptions): StreamPlan | null {
  const { outputRate, loopEndSeconds, coreSeconds, marginSeconds } = options;
  if (!Number.isInteger(outputRate) || outputRate <= 0) return null;
  if (!(loopEndSeconds > 0) || !(coreSeconds > 0) || !(marginSeconds >= 0)) return null;

  const divisor = gcd(outputRate, stream.nativeRate);
  const p = outputRate / divisor;
  const q = stream.nativeRate / divisor;
  const loopFrames = Math.round(loopEndSeconds * outputRate);
  // The decoder returns every packet's samples, including the encoder's end padding that the final page granule
  // trims: the buffer path loops over that full length, so the plan is made against it too.
  const contentFrames = Math.floor((stream.granules[stream.packets.length - 1]! * p) / q);
  if (loopFrames <= 0 || loopFrames > contentFrames) return null;

  const coreFrames = Math.round(coreSeconds * outputRate);
  const marginFrames = Math.round(marginSeconds * outputRate);
  // The longest gap between grid-aligned packets in the shipped tracks is 13 s (runs of long blocks cycle slowly
  // through the residues), so a window can need that much lead-in; a bound keeps a pathological file out.
  const maxLeadFrames = coreFrames + 15 * outputRate;
  const last = stream.packets.length - 1;

  // Packets on the resampler grid, in order (their granules are increasing).
  const alignedGranules: number[] = [];
  const alignedPacket: number[] = [];
  for (let i = 0; i <= last; i++) {
    if (stream.granules[i]! % q === 0) {
      alignedGranules.push(stream.granules[i]!);
      alignedPacket.push(i);
    }
  }

  const coreStarts: number[] = [];
  for (let c = 0; c < loopFrames; c += coreFrames) coreStarts.push(c);
  // A short remainder joins the previous core rather than becoming a window of its own.
  if (coreStarts.length > 1 && loopFrames - coreStarts[coreStarts.length - 1]! < coreFrames / 4) coreStarts.pop();

  const windows: StreamWindow[] = [];
  for (let index = 0; index < coreStarts.length; index++) {
    const coreStart = coreStarts[index]!;
    const coreEnd = index + 1 < coreStarts.length ? coreStarts[index + 1]! : loopFrames;

    const wantNative = Math.floor((Math.max(0, coreStart - marginFrames) * q) / p);
    const at = lowerBound(alignedGranules, wantNative + 1) - 1; // largest aligned position <= wantNative
    if (at < 0) return null;
    const firstPacket = alignedPacket[at]!;
    const startFrame = (stream.granules[firstPacket]! / q) * p;
    if (coreStart - startFrame > maxLeadFrames) return null;

    const endNative = Math.ceil(((coreEnd + marginFrames) * q) / p);
    let lastPacket = lowerBound(stream.granules, endNative);
    if (lastPacket > last) lastPacket = last;
    if (lastPacket <= firstPacket) lastPacket = Math.min(firstPacket + 1, last);
    if (lastPacket <= firstPacket) return null;

    const expectedFrames = Math.round(((stream.granules[lastPacket]! - stream.granules[firstPacket]!) * p) / q);
    if (startFrame + expectedFrames < coreEnd) return null;

    windows.push({ index, coreStart, coreEnd, firstPacket, lastPacket, startFrame, expectedFrames });
  }

  return { ratio: { p, q }, loopFrames, windows };
}
