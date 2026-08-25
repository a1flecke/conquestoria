import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewPath = resolve(process.cwd(), 'docs/reviews/assets/issue-708/sprite-preview.html');
describe('#708 file-safe sprite preview', () => {
  it('embeds its generated payload so file and Vite access use the same data', () => {
    const preview = readFileSync(previewPath, 'utf8');

    expect(preview).toContain('<script id="issue-708-sprite-data">');
    expect(preview).toContain('<link rel="stylesheet" href="../../../../src/assets/sprite-animations-v2.css">');
    expect(preview).not.toContain('type="module"');
    expect(preview).not.toMatch(/\bimport\s/);
    expect(preview).not.toContain('<script src="./sprite-preview-data.js"></script>');
    expect(preview).toContain('globalThis.__ISSUE_708_SPRITES__');
  });
});
