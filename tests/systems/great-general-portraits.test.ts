import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { GENERAL_PORTRAIT_ART } from '@/systems/great-general-portraits';
import { getGeneralPresentation } from '@/systems/great-general-presentation';
import { generateFallbackGeneralCandidates } from '@/systems/great-general-fallback-content';

const ROOT = resolve(__dirname, '../..');
const ids = Object.keys(GENERAL_PORTRAIT_ART).sort();
const PNG_SIGNATURE = '89504e470d0a1a0a';
/** Chunks a plain palette/RGB PNG needs. Anything else (text, EXIF, ICC, vendor chunks) means the file was not re-encoded by our tool. */
const ALLOWED_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);

function pngChunks(buf: Buffer): string[] {
  const names: string[] = [];
  let pos = 8;
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    names.push(buf.subarray(pos + 4, pos + 8).toString('ascii'));
    pos += 12 + length;
  }
  expect(pos, 'bytes after the last chunk').toBe(buf.length);
  return names;
}

const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
const provenanceOf = (id: string) => JSON.parse(readFileSync(resolve(ROOT, 'design/general-portraits', `${id}.provenance.json`), 'utf8')) as Record<string, any>;

describe('General portrait images (#889)', () => {
  it('only authored Generals have portrait art, and no entry is stale', () => {
    const authored = new Set(GENERAL_DEFINITIONS.map(g => g.id));
    for (const id of ids) expect(authored.has(id), `${id} is not an authored General`).toBe(true);
  });

  it('no file or provenance record exists without a catalog entry', () => {
    const files = readdirSync(resolve(ROOT, 'public/images/generals')).filter(f => f.endsWith('.png')).map(f => f.replace(/\.png$/, '')).sort();
    expect(files).toEqual(ids);
    const records = readdirSync(resolve(ROOT, 'design/general-portraits')).filter(f => f.endsWith('.provenance.json')).map(f => f.replace(/\.provenance\.json$/, '')).sort();
    expect(records).toEqual(ids);
  });

  it.each(ids.map(id => [id] as const))('%s: a small, metadata-free, plain PNG (nothing appended, nothing hidden)', id => {
    const file = resolve(ROOT, 'public', GENERAL_PORTRAIT_ART[id]!.path);
    expect(existsSync(file), `${file} is missing`).toBe(true);
    const buf = readFileSync(file);
    expect(buf.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    const chunks = pngChunks(buf);
    expect(chunks[0]).toBe('IHDR');
    expect(chunks.at(-1)).toBe('IEND');
    expect(chunks.filter(c => !ALLOWED_CHUNKS.has(c)), 'unexpected PNG chunks (metadata or payload)').toEqual([]);
    expect({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }).toEqual({ w: 96, h: 96 });
    expect(statSync(file).size, 'portrait too large').toBeLessThan(40 * 1024);
  });

  it.each(ids.map(id => [id] as const))('%s: provenance names the source, licence and scan, and matches the shipped bytes', id => {
    const prov = provenanceOf(id);
    const art = GENERAL_PORTRAIT_ART[id]!;
    expect(prov.id).toBe(id);
    expect(prov.file).toBe(`public/${art.path}`);
    expect(prov.tool).toBe('scripts/portrait-pixelate/portrait_pixelate.py');
    expect(prov.sourceUrl).toMatch(/^https:\/\//);
    expect(prov.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(prov.licence).length).toBeGreaterThan(5);
    expect(prov.original.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prov.original.notRedistributed, 'the downloaded original must never be committed').toBe(true);
    expect(prov.original.scan.join(' ')).toContain('decodes cleanly');
    expect(prov.original.scan.join(' ')).toContain('no data after the image stream');
    expect(prov.output.sha256).toBe(sha(readFileSync(resolve(ROOT, 'public', art.path))));
    expect(prov.likenessNote).toContain('not a verified likeness');
  });

  it('public-domain artwork is recorded as public domain on Wikimedia Commons, never share-alike', () => {
    for (const id of ids.filter(i => GENERAL_PORTRAIT_ART[i]!.origin === 'public-domain-artwork')) {
      const prov = provenanceOf(id);
      expect(prov.licence, id).toBe('Public domain');
      expect(prov.sourceUrl, id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(prov.licence).not.toMatch(/BY|SA|NC/i);
    }
  });

  it('generated images record their prompt, and the prompt names no existing character or person', () => {
    const generated = ids.filter(i => GENERAL_PORTRAIT_ART[i]!.origin === 'generated-image');
    expect(generated.length).toBeGreaterThan(0);
    const names = GENERAL_DEFINITIONS.flatMap(g => g.name.split(/[ ,]+/)).filter(w => w.length > 3 && /^[A-ZÉÚ]/.test(w));
    for (const id of generated) {
      const prov = provenanceOf(id);
      expect(prov.origin).toBe('generated-image');
      expect(String(prov.prompt).length).toBeGreaterThan(20);
      for (const word of names) expect(String(prov.prompt), `${id} prompt names "${word}"`).not.toContain(word);
      expect(prov.notes).toContain('imaginary person');
    }
  });

  it('only authored Generals get a portrait: a generated officer keeps the crest', () => {
    const [officer] = generateFallbackGeneralCandidates('game-889', 'rome', 3, 7, 1, []);
    expect(getGeneralPresentation(officer!).portrait).toBeUndefined();
    const authored = GENERAL_DEFINITIONS.find(g => g.id === 'gen_caesar')!;
    expect(getGeneralPresentation(authored).portrait).toEqual(GENERAL_PORTRAIT_ART.gen_caesar);
  });

  it('a General without portrait art resolves with no portrait (the emblem is their identity)', () => {
    const without = GENERAL_DEFINITIONS.filter(g => !(g.id in GENERAL_PORTRAIT_ART));
    expect(without.length).toBeGreaterThan(0);
    for (const def of without) expect(getGeneralPresentation(def).portrait, def.id).toBeUndefined();
  });
});
