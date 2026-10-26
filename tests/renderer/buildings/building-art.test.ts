import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUILDING_ART, BUILDING_ART_IDS, getBuildingArtPath } from '@/renderer/buildings/building-art-catalog';
import { buildBuildingArtSvg } from '@/renderer/buildings/building-art-sprite';
import { BUILDING_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { derivePalette } from '@/renderer/sprites/sprite-system';
import { BUILDINGS } from '@/systems/city-system';
import { getAnimatedBuildingIconHtml } from '@/ui/city-panel-building-icon';
import { getUnpaintedBuildingId } from '../../helpers/unpainted-buildings';

const ROOT = resolve(__dirname, '../../..');
const MAX_BYTES = 70 * 1024;
// Only the structural chunks plus transparency: nothing that can carry metadata or hidden data.
const ALLOWED_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

function readChunks(path: string): { width: number; height: number; colourType: number; chunks: string[] } {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii'), `${path} is not a PNG`).toBe('PNG');
  const chunks: string[] = [];
  for (let offset = 8; offset < buf.length;) {
    chunks.push(buf.subarray(offset + 4, offset + 8).toString('ascii'));
    offset += 12 + buf.readUInt32BE(offset);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colourType: buf[25], chunks };
}

describe('building production art (#620)', () => {
  it('returns a path only for catalogued ids', () => {
    expect(getBuildingArtPath('royal_mint')).toBe('images/buildings/art/royal_mint.png');
    for (const id of ['not_a_building', '', '__proto__', 'constructor', 'toString']) expect(getBuildingArtPath(id), id).toBeNull();
  });

  it('only names real buildings, each of which keeps its SVG component as the load-failure fallback', () => {
    for (const id of BUILDING_ART_IDS) {
      expect(BUILDINGS[id], `${id} is not a building`).toBeDefined();
      expect(BUILDING_SPRITE_CATALOG[id], `${id} lost its fallback sprite`).toBeDefined();
    }
  });

  // The inventory #620 was opened for: 16 national projects and 8 Era 1-5 buildings that were each drawn with another building's
  // sprite. Every one now has art of its own. A guard against the alias coming back, not a roster of art buildings.
  const ISSUE_620_BUILDINGS = [
    'sacred_grove', 'tribal_muster_ground', 'communal_stores', 'grand_bazaar', 'foundry_guild', 'scribes_hall',
    'philosophers_circle', 'road_corps', 'iron_legion', 'sacred_council', 'imperial_archive', 'praetorian_legion',
    'royal_mint', 'royal_academy', 'artillery_corps_hq', 'explorers_guild', 'guildhall', 'university', 'art_gallery',
    'blast_furnace', 'distillery', 'monastery', 'harbour_exchange', 'apothecary_house',
  ];

  it('gives every building of the #620 inventory art of its own', () => {
    expect(ISSUE_620_BUILDINGS).toHaveLength(24);
    for (const id of ISSUE_620_BUILDINGS) {
      expect(BUILDINGS[id], `${id} is not a building`).toBeDefined();
      expect(getBuildingArtPath(id), `${id} has no art`).not.toBeNull();
    }
  });

  it('never lets two buildings share an image (no stand-in art)', () => {
    const seen = new Map<string, string>();
    for (const id of BUILDING_ART_IDS) {
      const hash = createHash('sha256').update(readFileSync(resolve(ROOT, `public/images/buildings/art/${id}.png`))).digest('hex');
      expect(seen.get(hash), `${id} is byte-identical to ${seen.get(hash)}`).toBeUndefined();
      seen.set(hash, id);
    }
  });

  for (const id of BUILDING_ART_IDS) {
    describe(id, () => {
      const file = resolve(ROOT, `public/images/buildings/art/${id}.png`);

      it('is a small 256x256 palette PNG with transparency and no metadata chunks', () => {
        expect(existsSync(file)).toBe(true);
        expect(statSync(file).size).toBeLessThanOrEqual(MAX_BYTES);
        const png = readChunks(file);
        expect(png).toMatchObject({ width: 256, height: 256, colourType: 3 });
        expect(png.chunks).toContain('tRNS');
        for (const chunk of png.chunks) expect(ALLOWED_CHUNKS.has(chunk), `${id}: unexpected chunk ${chunk}`).toBe(true);
      });

      it('has a provenance record that matches the shipped file', () => {
        const path = resolve(ROOT, `design/building-art/${id}.provenance.json`);
        expect(existsSync(path)).toBe(true);
        const record = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
        expect(record.id).toBe(id);
        expect(record.file).toBe(`public/images/buildings/art/${id}.png`);
        expect(record.buildingIds).toContain(id);
        expect(record.output.sha256).toBe(createHash('sha256').update(readFileSync(file)).digest('hex'));
        expect(record.original.notRedistributed).toBe(true);
        expect(String(record.generator)).toMatch(/^ChatGPT/);
        for (const key of ['prompt', 'plan', 'generatedOn', 'licence', 'notes']) {
          expect(typeof record[key], key).toBe('string');
          expect(record[key].length, key).toBeGreaterThan(0);
        }
        expect(record.prompt).not.toMatch(/https?:\/\//);
      });

      it('is drawn with the owner banner over it, and the banner colour is the only thing that changes', () => {
        const red = derivePalette('#c0392b');
        const blue = derivePalette('#2980b9');
        const a = buildBuildingArtSvg(id, red, 'data:image/png;base64,AAAA')!;
        const b = buildBuildingArtSvg(id, blue, 'data:image/png;base64,AAAA')!;
        expect(a).toContain('<image href="data:image/png;base64,AAAA"');
        expect(a).toContain(red.mid);
        expect(b).toContain(blue.mid);
        expect(a).not.toBe(b);
        expect(a.replaceAll(red.mid, '#').replaceAll(red.dark, '#').replaceAll(red.trim, '#'))
          .toBe(b.replaceAll(blue.mid, '#').replaceAll(blue.dark, '#').replaceAll(blue.trim, '#'));
        expect(BUILDING_ART[id].bannerX).toBeGreaterThanOrEqual(0);
      });

      it('shows in the city panel icon at 36 px from a plain file URL, with no inline SVG id to collide', () => {
        const html = getAnimatedBuildingIconHtml(id, derivePalette('#c0392b'), `city:${id}`);
        expect(html).toContain(`images/buildings/art/${id}.png`);
        expect(html).toContain('width="36"');
        expect(html).not.toMatch(/\bid="/);
      });
    });
  }

  it('a building without art still gets its SVG sprite in the panel icon', () => {
    const unpainted = getUnpaintedBuildingId();
    const html = getAnimatedBuildingIconHtml(unpainted, derivePalette('#c0392b'), `city:${unpainted}`);
    expect(html).not.toContain('images/buildings/art/');
    expect(html).toContain('<svg');
  });

  it('buildBuildingArtSvg is null for a building with no art', () => {
    expect(buildBuildingArtSvg(getUnpaintedBuildingId(), derivePalette('#c0392b'), 'x')).toBeNull();
  });
});
