import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewPath = resolve(process.cwd(), 'docs/reviews/assets/issue-709/sprite-preview.html');
const reviewPath = resolve(process.cwd(), 'docs/reviews/issue-709-industrial-visual-review.md');

describe('#709 file-safe industrial sprite preview', () => {
  it('embeds serialized data without a module, import, network payload, or sidecar', () => {
    expect(existsSync(previewPath), 'Issue-709 preview must exist before it can embed generated data').toBe(true);
    if (!existsSync(previewPath)) return;
    const preview = readFileSync(previewPath, 'utf8');

    expect(preview).toContain('<script id="issue-709-sprite-data">');
    expect(preview).toContain('<link rel="stylesheet" href="../../../../src/assets/sprite-animations-v2.css">');
    expect(preview).toContain('globalThis.__ISSUE_709_SPRITES__');
    expect(preview).not.toContain('type="module"');
    expect(preview).not.toMatch(/\bimport\s/);
    expect(preview).not.toContain('<script src=');
  });

  it('offers all review states, factions, reduced motion, and paused phase samples', () => {
    expect(existsSync(previewPath), 'Issue-709 preview must exist before it can expose controls').toBe(true);
    if (!existsSync(previewPath)) return;
    const preview = readFileSync(previewPath, 'utf8');

    for (const state of ['idle', 'walk', 'attack', 'hurt', 'death']) {
      expect(preview).toContain(`data-state="${state}"`);
    }
    for (const phase of ['0%', '25%', '50%', '75%']) {
      expect(preview).toContain(phase);
    }
    for (const [id, label] of [['armored_car', 'Armored Car'], ['mechanized_infantry', 'Mechanized Infantry'], ['main_battle_tank', 'Main Battle Tank']]) {
      expect(preview).toContain(`['${id}', '${label}'`);
    }
    expect(preview).toContain('id="reduced-motion"');
  });

  it('links committed identity and phase-contact review sheets', () => {
    expect(existsSync(reviewPath), 'Issue-709 visual review must exist before it can link evidence').toBe(true);
    if (!existsSync(reviewPath)) return;
    const review = readFileSync(reviewPath, 'utf8');
    for (const filename of [
      'armored-car-identity-sheet.png', 'armored-car-contact-sheet.png',
      'mechanized-infantry-identity-sheet.png', 'mechanized-infantry-contact-sheet.png',
      'main-battle-tank-identity-sheet.png', 'main-battle-tank-contact-sheet.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), 'docs/reviews/assets/issue-709', filename)), filename).toBe(true);
      expect(review).toContain(filename);
    }
  });
});
