import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import {
  LEGENDARY_WONDER_ART_IDS,
  getLegendaryWonderArtPath,
} from '@/renderer/wonders/legendary-wonder-art-catalog';
import { getLegendaryWonderLandmarkMetadataCatalog } from '@/systems/legendary-wonder-landmark-catalog';

const ROOT = resolve(__dirname, '../../..');
const MAX_BYTES = 24 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface PngInfo { width: number; height: number; bitDepth: number; colourType: number; cornerAlpha: number }

function readPng(path: string): PngInfo {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii'), `${path} is not a PNG`).toBe('PNG');
  const idat: Buffer[] = [];
  for (let offset = 8; offset < buf.length;) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(buf.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  // Row 0 is preceded by one filter byte. Every PNG filter predicts the first pixel from zero
  // neighbours, so its four bytes are stored verbatim whatever the filter: byte 4 is the alpha.
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colourType: buf[25],
    cornerAlpha: raw[1 + 3],
  };
}

describe('Era 5-9 legendary wonder art (#613, #619)', () => {
  it('names exactly the thirteen Era 5-9 wonders, all of which exist in the landmark catalog', () => {
    expect([...LEGENDARY_WONDER_ART_IDS].sort()).toEqual([
      'brooklyn-bridge', 'continental-congress', 'crystal-palace', 'eiffel-tower', 'empire-state-building',
      'hoover-dam', 'iron-arsenal', 'merchant-admiralty', 'palace-of-the-sun', 'panama-canal',
      'suez-canal', 'trans-siberian-railway', 'wright-flyer',
    ]);
    const known = new Set(getLegendaryWonderLandmarkMetadataCatalog().map(entry => entry.wonderId));
    for (const id of LEGENDARY_WONDER_ART_IDS) expect(known.has(id), id).toBe(true);
  });

  it('returns a path only for catalogued ids', () => {
    expect(getLegendaryWonderArtPath('crystal-palace')).toBe('images/wonders/art/crystal-palace.png');
    expect(getLegendaryWonderArtPath('hoover-dam')).toBe('images/wonders/art/hoover-dam.png');
    expect(getLegendaryWonderArtPath('wright-flyer')).toBe('images/wonders/art/wright-flyer.png');
    for (const id of ['manhattan-project', '', '__proto__', 'constructor', 'toString', 'legendary:crystal-palace']) {
      expect(getLegendaryWonderArtPath(id), id).toBeNull();
    }
  });

  for (const id of LEGENDARY_WONDER_ART_IDS) {
    describe(id, () => {
      const file = resolve(ROOT, `public/images/wonders/art/${id}.png`);

      it('is a local, optimised 128x128 RGBA PNG with a transparent background', () => {
        expect(existsSync(file)).toBe(true);
        expect(statSync(file).size).toBeLessThanOrEqual(MAX_BYTES);
        const png = readPng(file);
        expect(png).toMatchObject({ width: 128, height: 128, bitDepth: 8, colourType: 6 });
        expect(png.cornerAlpha).toBe(0);
      });

      it('has a complete provenance record with a confirmed licence note', () => {
        const path = resolve(ROOT, `design/wonder-art/${id}.provenance.json`);
        expect(existsSync(path)).toBe(true);
        const record = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
        expect(record.id).toBe(id);
        expect(record.file).toBe(`public/images/wonders/art/${id}.png`);
        for (const key of ['generator', 'generated_on', 'prompt', 'licence_note']) {
          expect(typeof record[key], key).toBe('string');
          expect((record[key] as string).length, key).toBeGreaterThan(0);
        }
        expect(String(record.sprite_ai_generation_id)).toMatch(UUID);
        expect(String(record.licence_note)).not.toMatch(/^UNCONFIRMED/);
      });
    });
  }
});
