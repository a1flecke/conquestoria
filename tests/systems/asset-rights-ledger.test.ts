import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listPngUnitManifests } from '@/renderer/sprites/png/png-sprite-catalog';

// docs/asset-rights-ledger.md states how many assets each AI generator produced. It is a hand-written record, so this
// pins its counts to the provenance files: adding or removing a generated asset without updating the ledger fails here.

const ROOT = resolve(__dirname, '../..');
const ledger = readFileSync(resolve(ROOT, 'docs/asset-rights-ledger.md'), 'utf8');

function records(dir: string): Array<Record<string, unknown>> {
  return readdirSync(resolve(ROOT, dir))
    .filter(f => f.endsWith('.provenance.json'))
    .map(f => JSON.parse(readFileSync(resolve(ROOT, dir, f), 'utf8')) as Record<string, unknown>);
}

const units = records('design/png-sprites/sources');
const wonders = records('design/wonder-art');
const portraits = records('design/general-portraits');
const codexImages = records('design/wonder-codex-images');
const buildingArt = records('design/building-art');
// strip units (strips.py export): one provenance record per shipped strip unit, kept beside its approved preview
const stripUnits = listPngUnitManifests()
  .filter(m => m.baseline !== null)
  .map(m => JSON.parse(readFileSync(resolve(ROOT, 'design/png-sprites/previews', m.id, 'provenance.json'), 'utf8')) as Record<string, unknown>);

const generator = (r: Record<string, unknown>) => String(r.generator ?? '');
const portraitTitle = (r: Record<string, unknown>) => String(r.title ?? '');

const counts = {
  'Sprite-AI (units + wonder art)': [...units, ...wonders].filter(r => generator(r).startsWith('Sprite-AI')).length,
  'SpriteCook (units)': units.filter(r => generator(r).startsWith('SpriteCook')).length,
  'DeepAI (General portraits)': portraits.filter(r => portraitTitle(r).startsWith('DeepAI')).length,
  'ChatGPT image generation (General portrait)': portraits.filter(r => portraitTitle(r).startsWith('ChatGPT')).length,
  'ChatGPT image generation (codex illustrations)': codexImages.filter(r => String(r.generator ?? '').startsWith('ChatGPT')).length,
  'ChatGPT image generation (building sprites)': buildingArt.filter(r => String(r.generator ?? '').startsWith('ChatGPT')).length,
  'ChatGPT image generation (unit strips)': stripUnits.filter(r => String(r.generator ?? '').startsWith('ChatGPT')).length,
  'Public-domain artwork (General portraits)': portraits.filter(r => r.licence === 'Public domain').length,
};

describe('asset rights ledger', () => {
  it.each(Object.entries(counts))('%s: the ledger count matches the provenance records', (family, count) => {
    const row = ledger.split('\n').find(line => line.startsWith(`| ${family} |`));
    expect(row, `no ledger row for "${family}"`).toBeDefined();
    expect(row!.split('|')[2]!.trim(), `${family} count`).toBe(String(count));
  });

  it('every provenance record belongs to a ledger family (nothing generated is unaccounted for)', () => {
    const accounted = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(accounted).toBe(units.length + wonders.length + portraits.length + codexImages.length + buildingArt.length + stripUnits.length);
  });

  it('states the release posture and the commercial-release gate, and makes no clearance claim', () => {
    expect(ledger).toContain('non-commercial hobby game');
    expect(ledger).toContain('Before any commercial release');
    expect(ledger).toContain('not legal advice');
    expect(ledger).not.toMatch(/cleared for commercial/i);
  });

  it('names a determination for every family row, from the closed set', () => {
    const allowed = /(Sufficient evidence recorded|Missing documentation|Permission unresolved|Replacement required|Owner-approved restriction|Sufficient where reviewed)/;
    const rows = ledger.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Family') && !l.startsWith('|---'));
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) expect(row, row).toMatch(allowed);
  });
});
