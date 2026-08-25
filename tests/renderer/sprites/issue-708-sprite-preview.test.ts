import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const previewPath = resolve(process.cwd(), 'docs/reviews/assets/issue-708/sprite-preview.html');
const reviewPath = resolve(process.cwd(), 'docs/reviews/issue-708-mounted-beast-visual-review.md');
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

  it('offers every review state, faction treatment, and reduced-motion mode without stale descriptions', () => {
    const preview = readFileSync(previewPath, 'utf8');

    for (const state of ['idle', 'walk', 'attack', 'hurt', 'death']) {
      expect(preview).toContain(`data-state="${state}"`);
    }
    expect(preview).toContain('id="reduced-motion"');
    expect(preview).toContain("['beast_handler', 'Beast Handler'");
    expect(preview).toContain("['war_elephant', 'War Elephant'");
    expect(preview).toContain("['cuirassier', 'Cuirassier'");
    expect(preview).toContain('card.dataset.unit = unit');
    expect(preview).toContain('grid.dataset.reducedMotion = String(reducedMotion.checked)');
    expect(preview).toContain('one visible near rider leg');
    expect(preview).not.toContain('forward-straddling rider');
    expect(preview).not.toContain('targeting sigil');
    expect(preview).not.toContain('cq-command-sigil');
  });

  it('ships Markdown-embeddable anatomy review sheets for all three rebuilt units', () => {
    const review = readFileSync(reviewPath, 'utf8');
    const sheets = [
      ['beast-handler-state-sheet.png', 'Beast Handler anatomy review'],
      ['war-elephant-state-sheet.png', 'War Elephant anatomy review'],
      ['cuirassier-state-sheet.png', 'Cuirassier anatomy review'],
    ];

    for (const [filename, label] of sheets) {
      expect(existsSync(resolve(process.cwd(), 'docs/reviews/assets/issue-708', filename)), `${filename} must be committed`).toBe(true);
      expect(review).toContain(`![${label}](assets/issue-708/${filename})`);
    }
  });
});
