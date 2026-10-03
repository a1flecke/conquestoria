import * as fs from 'node:fs';

export interface OggInfo { sampleRate: number; channels: number; durationSec: number; bytesPerSecond: number; bytes: number }

/**
 * Minimal Ogg Vorbis header reader — no decoder, so unit tests need no ffmpeg.
 * Sample rate/channels come from the identification header; length from the last page's granule position.
 */
export function readOggInfo(filePath: string): OggInfo | null {
  const data = fs.readFileSync(filePath);
  if (data.length < 64 || data.toString('ascii', 0, 4) !== 'OggS') return null;
  const idAt = data.indexOf(Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73])); // \x01vorbis
  if (idAt < 0) return null;
  const channels = data.readUInt8(idAt + 11);
  const sampleRate = data.readUInt32LE(idAt + 12);
  const lastPage = data.lastIndexOf('OggS', data.length - 4, 'ascii');
  if (lastPage < 0 || sampleRate <= 0) return null;
  const granule = Number(data.readBigInt64LE(lastPage + 6));
  if (granule <= 0) return null;
  const durationSec = granule / sampleRate;
  return { sampleRate, channels, durationSec, bytesPerSecond: data.length / durationSec, bytes: data.length };
}
