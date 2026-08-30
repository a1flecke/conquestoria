import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewPath = resolve(process.cwd(), 'docs/reviews/assets/issue-711/sprite-preview.html');

describe('#711 file-safe siege and capital-ship sprite preview', () => {
  it('embeds native payloads without module, import, network, or sidecar dependencies', () => {
    expect(existsSync(previewPath), 'Issue-711 preview must exist before it can embed review data').toBe(true);
    if (!existsSync(previewPath)) return;
    const preview = readFileSync(previewPath, 'utf8');
    expect(preview).toContain('<link rel="stylesheet" href="../../../../src/assets/sprite-animations-v2.css">');
    expect(preview).toContain('globalThis.__ISSUE_711_SPRITES__');
    expect(preview).not.toContain('type="module"');
    expect(preview).not.toMatch(/\bimport\s/);
    expect(preview).not.toContain('<script src=');
    expect(preview).not.toMatch(/https?:\/\//);
  });

  it('offers every required state, phase, faction, and unit identity', () => {
    expect(existsSync(previewPath), 'Issue-711 preview must exist before it can expose controls').toBe(true);
    if (!existsSync(previewPath)) return;
    const preview = readFileSync(previewPath, 'utf8');
    for (const state of ['idle', 'walk', 'attack', 'hurt', 'death']) expect(preview).toContain(`data-state="${state}"`);
    for (const phase of ['0%', '25%', '50%', '75%']) expect(preview).toContain(phase);
    for (const faction of ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate']) expect(preview).toContain(`value="${faction}"`);
    for (const id of ['trebuchet', 'rocket_artillery', 'battleship', 'missile_cruiser']) expect(preview).toContain(id);
    expect(preview).toContain('id="reduced-motion"');
  });
});
