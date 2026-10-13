import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OggVorbisError,
  buildWindowStream,
  oggCrc32,
  parseOggVorbis,
} from '@/audio/ogg-vorbis';

// #1466: the music files are parsed once and re-paged into small standalone Ogg streams. These tests pin the
// parser against every shipped long track (the real gate is that the computed sample count of each packet agrees
// with the Ogg page granules the encoder wrote) and against malformed input.

const AUDIO = resolve(process.cwd(), 'public/audio');
const LONG_DIRS = ['era', 'war', 'adaptive', 'accent'];
const tracks = LONG_DIRS.flatMap(dir =>
  readdirSync(join(AUDIO, dir)).filter(name => name.endsWith('.ogg')).map(name => ({ dir, name, path: join(AUDIO, dir, name) })));

function load(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

describe('parseOggVorbis against every shipped long track', () => {
  it('finds the music tracks it is meant to cover', () => {
    expect(tracks.length).toBeGreaterThanOrEqual(34);
  });

  for (const track of tracks) {
    it(`${track.dir}/${track.name}: per-packet sample counts agree with the Ogg page granules without drifting`, () => {
      const stream = parseOggVorbis(load(track.path));
      expect(stream.channels).toBeGreaterThanOrEqual(1);
      expect([44100, 48000]).toContain(stream.nativeRate);
      expect(stream.packets.length).toBeGreaterThan(100);
      // Strictly increasing and starts at zero (the first audio packet outputs nothing).
      expect(stream.granules[0]).toBe(0);
      for (let i = 1; i < stream.granules.length; i++) {
        expect(stream.granules[i]!).toBeGreaterThan(stream.granules[i - 1]!);
      }
      // The encoder may trim the end of the final page; it can never claim more than was decodable.
      const computed = stream.granules[stream.granules.length - 1]!;
      expect(stream.totalNativeSamples).toBeLessThanOrEqual(computed);
      expect(computed - stream.totalNativeSamples).toBeLessThan(4096);
    });
  }
});

describe('parseOggVorbis rejects what it cannot trust', () => {
  const good = load(join(AUDIO, 'war', 'era1-war.ogg'));

  it('rejects data that is not Ogg', () => {
    expect(() => parseOggVorbis(new Uint8Array(64))).toThrow(OggVorbisError);
  });

  it('rejects a truncated header', () => {
    expect(() => parseOggVorbis(good.slice(0, 40))).toThrow(OggVorbisError);
  });

  it('rejects a stream whose page granules disagree with the computed packet sizes', () => {
    const tampered = good.slice();
    // Flip a bit inside the setup header's mode table region: the final bytes of the third header packet.
    // Easier and deterministic: corrupt the identification header's blocksize byte so every size is wrong.
    const idOffset = tampered.findIndex((_, i) => tampered[i] === 0x01 && tampered[i + 1] === 0x76 && tampered[i + 2] === 0x6f);
    tampered[idOffset + 28] = 0x77; // blocksize_0 = 2^7, blocksize_1 = 2^7
    expect(() => parseOggVorbis(tampered)).toThrow(OggVorbisError);
  });
});

describe('buildWindowStream', () => {
  const stream = parseOggVorbis(load(join(AUDIO, 'war', 'era1-war.ogg')));

  function pages(bytes: Uint8Array): Array<{ seq: number; flags: number; granule: number; packets: number; crcOk: boolean; serial: number }> {
    const out: Array<{ seq: number; flags: number; granule: number; packets: number; crcOk: boolean; serial: number }> = [];
    let p = 0;
    while (p < bytes.length) {
      expect(String.fromCharCode(bytes[p]!, bytes[p + 1]!, bytes[p + 2]!, bytes[p + 3]!)).toBe('OggS');
      const nseg = bytes[p + 26]!;
      let body = 0;
      let packets = 0;
      for (let i = 0; i < nseg; i++) { body += bytes[p + 27 + i]!; if (bytes[p + 27 + i]! < 255) packets++; }
      const length = 27 + nseg + body;
      const page = bytes.slice(p, p + length);
      const stored = (page[22]! | (page[23]! << 8) | (page[24]! << 16) | (page[25]! << 24)) >>> 0;
      page.fill(0, 22, 26);
      const dv = new DataView(bytes.buffer, bytes.byteOffset + p, length);
      out.push({
        seq: dv.getUint32(18, true),
        flags: bytes[p + 5]!,
        granule: dv.getUint32(6, true) + dv.getUint32(10, true) * 4294967296,
        packets,
        crcOk: oggCrc32(page) === stored,
        serial: dv.getUint32(14, true),
      });
      p += length;
    }
    return out;
  }

  it('writes valid pages: consecutive sequence numbers, one serial, correct checksums, one BOS and one EOS', () => {
    const bytes = buildWindowStream(stream, 100, 400);
    const list = pages(bytes);
    expect(list.every(page => page.crcOk)).toBe(true);
    expect(list.map(page => page.seq)).toEqual(list.map((_, i) => i));
    expect(new Set(list.map(page => page.serial)).size).toBe(1);
    expect(list.filter(page => page.flags & 0x02)).toHaveLength(1);
    expect(list[0]!.flags & 0x02).toBe(0x02);
    expect(list.filter(page => page.flags & 0x04)).toHaveLength(1);
    expect(list[list.length - 1]!.flags & 0x04).toBe(0x04);
  });

  it('carries the three headers, the pre-roll packet and every packet up to the last, nothing else', () => {
    const bytes = buildWindowStream(stream, 100, 400);
    const total = pages(bytes).reduce((sum, page) => sum + page.packets, 0);
    expect(total).toBe(3 + 1 + (400 - 100));
  });

  it('makes the final granule equal the samples the decoder will produce after the pre-roll packet', () => {
    const bytes = buildWindowStream(stream, 100, 400);
    const list = pages(bytes);
    expect(list[list.length - 1]!.granule).toBe(stream.granules[400]! - stream.granules[100]!);
  });

  it('does not apply the encoder end trim, so every platform decodes the same length', () => {
    const last = stream.packets.length - 1;
    const list = pages(buildWindowStream(stream, last - 50, last));
    expect(list[list.length - 1]!.granule).toBe(stream.granules[last]! - stream.granules[last - 50]!);
    expect(stream.totalNativeSamples).toBeLessThanOrEqual(stream.granules[last]!);
  });

  it('rejects windows that do not make sense', () => {
    expect(() => buildWindowStream(stream, 10, 10)).toThrow(OggVorbisError);
    expect(() => buildWindowStream(stream, 50, 10)).toThrow(OggVorbisError);
    expect(() => buildWindowStream(stream, -1, 10)).toThrow(OggVorbisError);
    expect(() => buildWindowStream(stream, 0, stream.packets.length)).toThrow(OggVorbisError);
  });
});
