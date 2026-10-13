/**
 * Ogg/Vorbis packet layer for streamed music (#1466).
 *
 * A long music track used to be decoded whole into an `AudioBuffer` (60 MiB for the era-1 base track). To play it
 * from a small window of decoded audio instead, the encoded file is parsed once into its Vorbis packets and any
 * run of packets is re-paged into a tiny, valid, standalone Ogg stream that `decodeAudioData` decodes like any
 * other file. Nothing is re-encoded, so the decoded samples are the same samples.
 *
 * Why this is exact: a Vorbis packet's output is the overlap-add of its own window with the previous packet's.
 * A stream that starts with one extra "pre-roll" packet therefore reproduces the original output for every packet
 * after it. The sample count each packet contributes follows from its block size (a mode flag), so the position of
 * every packet in the decoded timeline is known exactly; the parser proves this on every file by checking its
 * computed positions against the granule position the encoder wrote on every Ogg page.
 *
 * No browser API is used here; the module is pure and runs under Node for tests.
 */

export class OggVorbisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OggVorbisError';
  }
}

export interface OggVorbisStream {
  readonly serial: number;
  /** Identification, comment and setup packets. */
  readonly headers: readonly [Uint8Array, Uint8Array, Uint8Array];
  readonly packets: readonly Uint8Array[];
  /**
   * `granules[i]` is the number of native-rate sample frames the decoder has output once packet `i` has been decoded.
   * The first packet outputs nothing, so `granules[0]` is 0.
   */
  readonly granules: Float64Array;
  readonly nativeRate: number;
  readonly channels: number;
  /** Length in native sample frames after the encoder's end trim (the final page's granule position). */
  readonly totalNativeSamples: number;
}

// --- CRC-32 as Ogg defines it (polynomial 0x04C11DB7, MSB first, no reflection, no final xor) ---

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    table[i] = r >>> 0;
  }
  return table;
})();

export function oggCrc32(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]!) & 0xff]!) >>> 0;
  return crc >>> 0;
}

// --- parsing ---

const VORBIS_ID = [0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]; // "vorbis"

function readU32(bytes: Uint8Array, at: number): number {
  return (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;
}

function readGranule(bytes: Uint8Array, at: number): number {
  const lo = readU32(bytes, at);
  const hi = readU32(bytes, at + 4);
  if (lo === 0xffffffff && hi === 0xffffffff) return -1;
  if (hi >= 0x200000) throw new OggVorbisError('granule position out of range');
  return hi * 4294967296 + lo;
}

function bit(bytes: Uint8Array, pos: number): number {
  return (bytes[pos >> 3]! >> (pos & 7)) & 1;
}

function bits(bytes: Uint8Array, pos: number, count: number): number {
  let value = 0;
  for (let i = 0; i < count; i++) value |= bit(bytes, pos + i) << i;
  return value;
}

/**
 * The block-size flag of every mode, read from the end of the setup header (the mode table is its last structure:
 * a 6-bit count, then per mode 1 blockflag, 16 window type, 16 transform type and 8 mapping bits, then the framing
 * bit). The largest count whose structure is self-consistent is taken; the granule cross-check in `parseOggVorbis`
 * proves the result on every file.
 */
function parseModeBlockFlags(setup: Uint8Array): number[] {
  const last = setup.length - 1;
  let top = 7;
  while (top >= 0 && !((setup[last]! >> top) & 1)) top--;
  if (top < 0) throw new OggVorbisError('setup header has no framing bit');
  const framingPos = last * 8 + top;
  let best: number[] | null = null;
  for (let count = 1; count <= 64; count++) {
    const start = framingPos - 41 * count;
    if (start - 6 < 0) break;
    if (bits(setup, start - 6, 6) !== count - 1) continue;
    const flags: number[] = [];
    let consistent = true;
    for (let mode = 0; mode < count && consistent; mode++) {
      const at = start + 41 * mode;
      flags.push(bit(setup, at));
      if (bits(setup, at + 1, 16) !== 0 || bits(setup, at + 17, 16) !== 0) consistent = false;
    }
    if (consistent) best = flags;
  }
  if (!best) throw new OggVorbisError('setup header mode table not found');
  return best;
}

interface RawPacket { bytes: Uint8Array; pageGranule: number }

function readPackets(bytes: Uint8Array): { serial: number; packets: RawPacket[] } {
  const packets: RawPacket[] = [];
  let carry: Uint8Array[] = [];
  let serial: number | null = null;
  let p = 0;
  while (p < bytes.length) {
    if (p + 27 > bytes.length) throw new OggVorbisError('truncated page header');
    if (bytes[p] !== 0x4f || bytes[p + 1] !== 0x67 || bytes[p + 2] !== 0x67 || bytes[p + 3] !== 0x53) {
      throw new OggVorbisError('not an Ogg stream (missing capture pattern)');
    }
    if (bytes[p + 4] !== 0) throw new OggVorbisError('unsupported Ogg version');
    const granule = readGranule(bytes, p + 6);
    const pageSerial = readU32(bytes, p + 14);
    if (serial === null) serial = pageSerial;
    else if (pageSerial !== serial) throw new OggVorbisError('multiplexed or chained Ogg streams are not supported');
    const segmentCount = bytes[p + 26]!;
    let body = p + 27 + segmentCount;
    if (body > bytes.length) throw new OggVorbisError('truncated segment table');
    for (let s = 0; s < segmentCount; s++) {
      const length = bytes[p + 27 + s]!;
      if (body + length > bytes.length) throw new OggVorbisError('truncated page body');
      carry.push(bytes.subarray(body, body + length));
      body += length;
      if (length < 255) {
        let packet: Uint8Array;
        if (carry.length === 1) {
          packet = carry[0]!;
        } else {
          let total = 0;
          for (const part of carry) total += part.length;
          packet = new Uint8Array(total);
          let offset = 0;
          for (const part of carry) { packet.set(part, offset); offset += part.length; }
        }
        // A packet that ends exactly at the page's last segment inherits that page's granule position.
        packets.push({ bytes: packet, pageGranule: s === segmentCount - 1 ? granule : -1 });
        carry = [];
      }
    }
    p = body;
  }
  if (carry.length > 0) throw new OggVorbisError('stream ends inside a packet');
  if (serial === null) throw new OggVorbisError('empty Ogg stream');
  return { serial, packets };
}

function hasVorbisId(packet: Uint8Array, type: number): boolean {
  return packet.length >= 7 && packet[0] === type && VORBIS_ID.every((value, i) => packet[1 + i] === value);
}

export function parseOggVorbis(bytes: Uint8Array): OggVorbisStream {
  const { serial, packets: raw } = readPackets(bytes);
  if (raw.length < 5) throw new OggVorbisError('too few packets');
  const [identification, comment, setup] = [raw[0]!.bytes, raw[1]!.bytes, raw[2]!.bytes];
  if (!hasVorbisId(identification, 1) || identification.length < 30) throw new OggVorbisError('missing Vorbis identification header');
  if (!hasVorbisId(comment, 3)) throw new OggVorbisError('missing Vorbis comment header');
  if (!hasVorbisId(setup, 5)) throw new OggVorbisError('missing Vorbis setup header');
  if (readU32(identification, 7) !== 0) throw new OggVorbisError('unsupported Vorbis version');
  const channels = identification[11]!;
  const nativeRate = readU32(identification, 12);
  const shortBlock = 1 << (identification[28]! & 0x0f);
  const longBlock = 1 << (identification[28]! >> 4);
  if (channels < 1 || nativeRate < 8000 || shortBlock > longBlock) throw new OggVorbisError('implausible Vorbis parameters');
  // Header packets are written on pages of their own; one that cannot fit a page is not supported.
  if (Math.ceil(setup.length / 255) + 1 > 255) throw new OggVorbisError('setup header too large');

  const modes = parseModeBlockFlags(setup);
  const modeBits = modes.length === 1 ? 0 : Math.ceil(Math.log2(modes.length));
  const audio = raw.slice(3);
  const packets: Uint8Array[] = new Array(audio.length);
  const granules = new Float64Array(audio.length);
  let total = 0;
  let previousSize = 0;
  for (let i = 0; i < audio.length; i++) {
    const packet = audio[i]!.bytes;
    if (packet.length === 0 || (packet[0]! & 1) !== 0) throw new OggVorbisError('unexpected non-audio packet');
    const mode = modeBits === 0 ? 0 : (packet[0]! >> 1) & ((1 << modeBits) - 1);
    if (mode >= modes.length) throw new OggVorbisError('packet names an unknown mode');
    const size = modes[mode] ? longBlock : shortBlock;
    if (i > 0) total += previousSize / 4 + size / 4;
    granules[i] = total;
    previousSize = size;
    packets[i] = packet;
  }

  // Cross-check the accounting against the encoder's own page granules. A wrong mode table or block size would
  // make the computed positions drift away from them for the rest of the file, so most pages must agree exactly.
  // A minority may be off by less than half a long block without accumulating: three shipped war tracks have a
  // handful of pages whose granule is 448 samples ahead, while the decoder's own output agrees with the packet
  // accounting (verified against the full decode), so the encoder's granule is the loose one there.
  let totalNativeSamples = granules[audio.length - 1]!;
  let anchored = 0;
  let exact = 0;
  for (let i = 0; i < audio.length; i++) {
    const pageGranule = audio[i]!.pageGranule;
    if (pageGranule < 0) continue;
    if (i === audio.length - 1) {
      // The final page may be trimmed (the end of the last block is padding), never extended.
      if (pageGranule > granules[i]! || granules[i]! - pageGranule >= 2 * longBlock) {
        throw new OggVorbisError('final granule position disagrees with the packet sizes');
      }
      totalNativeSamples = pageGranule;
      continue;
    }
    anchored++;
    const deviation = Math.abs(pageGranule - granules[i]!);
    if (deviation >= longBlock / 2) throw new OggVorbisError('page granule positions disagree with the packet sizes');
    if (deviation === 0) exact++;
  }
  if (anchored > 0 && exact / anchored < 0.9) throw new OggVorbisError('packet sizes drift from the page granule positions');

  return {
    serial,
    headers: [identification, comment, setup],
    packets,
    granules,
    nativeRate,
    channels,
    totalNativeSamples,
  };
}

// --- writing ---

function writePage(serial: number, sequence: number, flags: number, granule: number, packets: readonly Uint8Array[]): Uint8Array {
  const segments: number[] = [];
  let bodyLength = 0;
  for (const packet of packets) {
    let remaining = packet.length;
    while (remaining >= 255) { segments.push(255); remaining -= 255; }
    segments.push(remaining);
    bodyLength += packet.length;
  }
  if (segments.length > 255) throw new OggVorbisError('page overflow');
  const page = new Uint8Array(27 + segments.length + bodyLength);
  page.set([0x4f, 0x67, 0x67, 0x53, 0, flags], 0);
  const view = new DataView(page.buffer);
  view.setUint32(6, granule % 4294967296, true);
  view.setUint32(10, Math.floor(granule / 4294967296), true);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  page[26] = segments.length;
  page.set(segments, 27);
  let offset = 27 + segments.length;
  for (const packet of packets) { page.set(packet, offset); offset += packet.length; }
  view.setUint32(22, oggCrc32(page), true);
  return page;
}

/**
 * A standalone Ogg Vorbis stream containing the three headers, the pre-roll packet `first` (which the decoder
 * consumes without output) and packets `first + 1 ... last`. Its decode equals the original's output for packets
 * `first + 1 ... last`: `granules[last] - granules[first]` native sample frames. The encoder's end trim is deliberately not
 * applied, so every platform decodes the same length (the decoder this app targets ignores the trim for a whole file too).
 */
export function buildWindowStream(stream: OggVorbisStream, first: number, last: number): Uint8Array {
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last <= first || last >= stream.packets.length) {
    throw new OggVorbisError(`invalid packet window ${first}..${last}`);
  }
  const base = stream.granules[first]!;
  const pages: Uint8Array[] = [];
  let sequence = 0;
  pages.push(writePage(stream.serial, sequence++, 0x02, 0, [stream.headers[0]]));
  pages.push(writePage(stream.serial, sequence++, 0, 0, [stream.headers[1]]));
  pages.push(writePage(stream.serial, sequence++, 0, 0, [stream.headers[2]]));
  pages.push(writePage(stream.serial, sequence++, 0, 0, [stream.packets[first]!]));
  let group: Uint8Array[] = [];
  let groupBytes = 0;
  for (let i = first + 1; i <= last; i++) {
    group.push(stream.packets[i]!);
    groupBytes += stream.packets[i]!.length;
    const isLast = i === last;
    if (isLast || groupBytes >= 3500 || group.length >= 100) {
      pages.push(writePage(stream.serial, sequence++, isLast ? 0x04 : 0, stream.granules[i]! - base, group));
      group = [];
      groupBytes = 0;
    }
  }
  let length = 0;
  for (const page of pages) length += page.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const page of pages) { out.set(page, offset); offset += page.length; }
  return out;
}
