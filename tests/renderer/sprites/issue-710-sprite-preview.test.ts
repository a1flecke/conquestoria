import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewPath = resolve(process.cwd(), 'docs/reviews/assets/issue-710/sprite-preview.html');
const reviewPath = resolve(process.cwd(), 'docs/reviews/issue-710-native-sprite-visual-review.md');
const assetPath = resolve(process.cwd(), 'docs/reviews/assets/issue-710');

describe('#710 corrective file-safe sprite preview', () => {
  it('embeds native and catalog data without module, import, network, or sidecar dependencies', () => {
    expect(existsSync(previewPath), 'Issue-710 preview must exist before it can embed review data').toBe(true);
    if (!existsSync(previewPath)) return;
    const preview = readFileSync(previewPath, 'utf8');
    expect(preview).toContain('<link rel="stylesheet" href="../../../../src/assets/sprite-animations-v2.css">');
    expect(preview).toContain('globalThis.__ISSUE_710_SPRITES__');
    expect(preview).toContain('globalThis.__ISSUE_710_BUILDINGS__');
    expect(preview).not.toContain('type="module"');
    expect(preview).not.toMatch(/\bimport\s/);
    expect(preview).not.toContain('<script src=');
    expect(preview).not.toMatch(/https?:\/\//);
  });

  it('offers every required state, faction, paused phase, and unit identity', () => {
    expect(existsSync(previewPath), 'Issue-710 preview must exist before it can expose controls').toBe(true);
    if (!existsSync(previewPath)) return;
    const preview = readFileSync(previewPath, 'utf8');
    for (const state of ['idle', 'walk', 'attack', 'hurt', 'death']) expect(preview).toContain(`data-state="${state}"`);
    for (const phase of ['0%', '25%', '50%', '75%']) expect(preview).toContain(phase);
    for (const faction of ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate']) expect(preview).toContain(`value="${faction}"`);
    for (const id of ['paratrooper', 'naval_strike_aircraft', 'maritime_patrol_aircraft', 'supercarrier', 'great_general', 'sam_site', 'radar_station']) expect(preview).toContain(id);
    expect(preview).toContain('id="reduced-motion"');
  });

  it('links committed identity, contact, and SAM/Radar comparison evidence', () => {
    expect(existsSync(reviewPath), 'Issue-710 visual review must exist before evidence can be linked').toBe(true);
    if (!existsSync(reviewPath)) return;
    const review = readFileSync(reviewPath, 'utf8');
    for (const filename of [
      'paratrooper-identity-sheet.png', 'paratrooper-contact-sheet.png',
      'naval-strike-aircraft-identity-sheet.png', 'naval-strike-aircraft-contact-sheet.png',
      'maritime-patrol-aircraft-identity-sheet.png', 'maritime-patrol-aircraft-contact-sheet.png',
      'supercarrier-identity-sheet.png', 'supercarrier-contact-sheet.png',
      'great-general-identity-sheet.png', 'great-general-contact-sheet.png',
      'sam-radar-comparison.png',
    ]) {
      expect(existsSync(resolve(assetPath, filename)), filename).toBe(true);
      expect(review).toContain(filename);
    }
  });
});
