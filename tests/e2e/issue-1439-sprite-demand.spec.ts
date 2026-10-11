import { expect, test } from '@playwright/test';
import {
  continueCrowdedCampaign,
  installIdleCampaignFixture,
  readSpriteLoads,
} from './helpers/renderer-idle-perf';

/**
 * #1439 phase 5: sprites are created on demand, not as a whole catalog per civilization. The crowded
 * fixture has 2 civilizations; the old eager loader created 1043 SVG images for it (~500 per civ plus
 * pirates). Deterministic counts only -- no timing or memory thresholds.
 */
type DrawProbeWindow = typeof window & { __spriteDraws?: Set<string> };

test('a campaign creates only the sprites its state needs, and the production badge sprite still renders', async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installIdleCampaignFixture(page);
  await page.addInitScript(() => {
    const drawn = new Set<string>();
    (window as DrawProbeWindow).__spriteDraws = drawn;
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function patched(this: CanvasRenderingContext2D, ...args: unknown[]) {
      const image = args[0];
      if (image instanceof HTMLImageElement && image.src.startsWith('blob:')) {
        const meta = (image as unknown as Record<symbol, { kind: string; itemId: string; civilization: string }>)[
          Symbol.for('conquestoria.spriteDiagnostic')
        ];
        if (meta) drawn.add(`${meta.kind}:${meta.itemId}:${meta.civilization}`);
      }
      return (original as (...a: unknown[]) => void).apply(this, args);
    };
  });
  await continueCrowdedCampaign(page);

  // Let every started load finish, then read what was created.
  await expect.poll(async () => (await readSpriteLoads(page)).outstanding, { timeout: 20_000 }).toBe(0);
  await page.waitForTimeout(1_000);
  const loads = await readSpriteLoads(page);

  // Pirates (~60) + the unit types and queue heads of two civilizations -- far below the old ~1043.
  expect(loads.created, 'sprites are no longer created as a whole catalog per civilization').toBeLessThan(400);
  expect(loads.created).toBeGreaterThan(0);

  // The city production badge draws its queue head's sprite through the on-demand path.
  const drawn = await page.evaluate(() => [...((window as DrawProbeWindow).__spriteDraws ?? [])]);
  expect(drawn, 'the production badge still draws a real sprite, not the fallback glyph').toContain('building:granary:player');
});
