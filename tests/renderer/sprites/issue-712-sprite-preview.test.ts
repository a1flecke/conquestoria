import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewPath = resolve(process.cwd(), 'docs/reviews/assets/issue-712/sprite-preview.html');

describe('#712 defensive-infrastructure review contact sheet', () => {
  it('embeds the real payloads with no module, import, network, or sidecar dependency', () => {
    expect(existsSync(previewPath), 'Issue-712 preview must exist').toBe(true);
    const preview = readFileSync(previewPath, 'utf8');
    expect(preview).toContain('<link rel="stylesheet" href="../../../../src/assets/sprite-animations-v2.css">');
    expect(preview).toContain('globalThis.__ISSUE_712__');
    expect(preview).not.toContain('type="module"');
    expect(preview).not.toMatch(/\bimport\s/);
    expect(preview).not.toContain('<script src=');
    expect(preview).not.toMatch(/https?:\/\//);
  });

  it('embeds the actual catalog geometry for all four assets', () => {
    const preview = readFileSync(previewPath, 'utf8');
    for (const marker of [
      'cq-fort-berm', 'cq-fort-gate', 'cq-citadel-curtain', 'cq-citadel-keep', 'cq-citadel-bastion-l',
      'cq-bunker-hull', 'cq-bunker-slit', 'cq-coastal-battery-parapet', 'cq-coastal-battery-gun-l',
    ]) {
      expect(preview, `preview missing embedded ${marker}`).toContain(marker);
    }
    // The data block was actually populated, not left as the empty template default.
    expect(preview).not.toContain("globalThis.__ISSUE_712__ = { fort: '', citadel: '', bunker: {}, coastal_battery: {} };");
  });

  it('exposes every required identity, state, scale, faction, and accessibility control', () => {
    const preview = readFileSync(previewPath, 'utf8');
    for (const id of ['Fort', 'Citadel', 'Bunker', 'Coastal Battery']) expect(preview).toContain(id);
    for (const faction of ['crimson', 'teal', 'gold']) expect(preview).toContain(`value="${faction}"`);
    for (const scale of ['native 48px', 'map ~28px', 'icon ~18px', 'native 192px', 'map badge ~44px', 'panel icon ~36px']) {
      expect(preview).toContain(scale);
    }
    expect(preview).toContain('stage light');
    expect(preview).toContain('stage dark');
    expect(preview).toContain('under construction');
    expect(preview).toContain('selected');
    expect(preview).toContain('id="reduced-motion"');
    // The audit conclusion that there is no damaged variant must be stated on the sheet.
    expect(preview).toMatch(/No pillaged\/damaged variant/i);
  });
});
