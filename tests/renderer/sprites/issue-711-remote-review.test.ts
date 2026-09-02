import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const units = [
  ['trebuchet', 'Trebuchet'],
  ['rocket-artillery', 'Rocket Artillery'],
  ['battleship', 'Battleship'],
  ['missile-cruiser', 'Missile Cruiser'],
] as const;

describe('Issue 711 remote sprite review', () => {
  it('embeds every unit identity sheet and looping animation GIF', () => {
    const markdown = readFileSync(resolve(root, 'docs/reviews/issue-711-remote-sprite-review.md'), 'utf8');

    for (const [id, label] of units) {
      expect(markdown).toContain(`## ${label}`);
      expect(markdown).toContain(`assets/issue-711/${id}-identity-sheet.png`);
      expect(markdown).toContain(`assets/issue-711/${id}-animation.gif`);

      const gif = readFileSync(resolve(root, `docs/reviews/assets/issue-711/${id}-animation.gif`));
      expect(gif.subarray(0, 6).toString('ascii')).toBe('GIF89a');
      expect(gif.byteLength).toBeGreaterThan(1_000);
    }
  });

  it('validates the actual siege payload layers before it captures review evidence', () => {
    const remoteCapture = readFileSync(resolve(root, 'scripts/capture-issue-711-remote-review.mjs'), 'utf8');
    const staticCapture = readFileSync(resolve(root, 'scripts/capture-issue-711-sprite-review.mjs'), 'utf8');

    for (const capture of [remoteCapture, staticCapture]) {
      expect(capture).toContain("'.cq-trebuchet-stone'");
      expect(capture).toContain("'.cq-rocket-artillery-rocket'");
    }
  });
});
