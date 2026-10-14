import { expect, test, type Page } from '@playwright/test';

/**
 * #613: the six Era 5-7 legendary wonders draw production PNG art on the map canvas, and fall back to their canvas
 * drawings when the image cannot load. This runs the real renderer modules in a real browser (real PNG decoding, real
 * drawImage, the real base URL) without booting a campaign; pixel assertions only, no platform-specific snapshots.
 */
const IDS = ['palace-of-the-sun', 'iron-arsenal', 'merchant-admiralty', 'crystal-palace', 'suez-canal', 'continental-congress'];
const SRC = '/conquestoria/src/renderer/wonders';

interface GlyphReport { id: string; naturalWidth: number | null; changedPixels: number; cornersUntouched: boolean; hash: string }
interface DrawResult { loaded: Record<string, boolean>; glyphs: GlyphReport[] }

async function drawAll(page: Page, background: string, state: 'completed' | 'under-construction' = 'completed'): Promise<DrawResult> {
  return page.evaluate(async ({ ids, src, background, state }) => {
    const loader = await import(/* @vite-ignore */ `${src}/legendary-wonder-art-loader.ts`);
    const renderer = await import(/* @vite-ignore */ `${src}/legendary-wonder-renderer.ts`);
    const catalog = await import(/* @vite-ignore */ `${src.replace('/renderer/wonders', '/systems')}/legendary-wonder-landmark-catalog.ts`);
    await loader.preloadLegendaryWonderArt();
    const size = 96;
    const glyphs: GlyphReport[] = [];
    const loaded: Record<string, boolean> = {};
    for (const id of ids) {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size, size);
      const before = ctx.getImageData(0, 0, size, size).data;
      const art = loader.getLegendaryWonderArtImage(id) as HTMLImageElement | null;
      loaded[id] = art !== null;
      renderer.drawLegendaryWonderLandmarkGlyph({
        ctx, cx: size / 2, cy: size / 2, radius: 30,
        metadata: catalog.getLegendaryWonderLandmarkMetadata(id), state, reducedMotion: true, nowMs: 0,
      });
      const after = ctx.getImageData(0, 0, size, size).data;
      let changed = 0;
      for (let i = 0; i < after.length; i += 4) {
        if (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2]) changed++;
      }
      // the four 6x6 corners hold only the sprite's transparent padding when art is drawn
      const corner = (x0: number, y0: number): boolean => {
        for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) {
          const i = (y * size + x) * 4;
          if (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2]) return false;
        }
        return true;
      };
      let hash = 2166136261;
      for (let i = 0; i < after.length; i++) hash = Math.imul(hash ^ after[i], 16777619) >>> 0;
      glyphs.push({
        id, hash: String(hash), naturalWidth: art?.naturalWidth ?? null, changedPixels: changed,
        cornersUntouched: corner(0, 0) && corner(size - 6, 0) && corner(0, size - 6) && corner(size - 6, size - 6),
      });
    }
    return { loaded, glyphs };
  }, { ids: IDS, src: SRC, background, state });
}

for (const [label, background] of [['grass', '#2d5a27'], ['desert', '#e8d9a8'], ['dark ocean', '#1b2c4a']] as const) {
  test(`production art loads and is drawn for all six wonders on ${label}`, async ({ page }) => {
    await page.goto('./');
    const result = await drawAll(page, background);
    for (const glyph of result.glyphs) {
      expect(result.loaded[glyph.id], `${glyph.id} loaded`).toBe(true);
      expect(glyph.naturalWidth, `${glyph.id} decoded at native size`).toBe(128);
      expect(glyph.changedPixels, `${glyph.id} paints a real glyph`).toBeGreaterThan(300);
      expect(glyph.cornersUntouched, `${glyph.id} stays transparent at the edges`).toBe(true);
    }
  });
}

test('while under construction the art is never drawn: pixels are identical with and without the art loaded', async ({ page, browser }) => {
  await page.goto('./');
  const withArt = await drawAll(page, '#2d5a27', 'under-construction');
  expect(Object.values(withArt.loaded).every(Boolean), 'art was loaded for this run').toBe(true);

  const blocked = await browser.newPage();
  await blocked.route('**/images/wonders/art/*.png', route => route.abort());
  await blocked.goto('./');
  const withoutArt = await drawAll(blocked, '#2d5a27', 'under-construction');
  await blocked.close();

  expect(withoutArt.glyphs.map(g => g.hash)).toEqual(withArt.glyphs.map(g => g.hash));
  for (const glyph of withArt.glyphs) expect(glyph.changedPixels, `${glyph.id} ghost`).toBeGreaterThan(0);
});

test('when every art image fails to load the canvas drawings take over, with no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/images/wonders/art/*.png', route => route.abort());
  await page.goto('./');
  const result = await drawAll(page, '#2d5a27');
  for (const glyph of result.glyphs) {
    expect(result.loaded[glyph.id], `${glyph.id} must not have loaded`).toBe(false);
    expect(glyph.changedPixels, `${glyph.id} fallback still paints`).toBeGreaterThan(100);
  }
  expect(errors).toEqual([]);
});

test('a later preload recovers art that failed on an offline start', async ({ page }) => {
  await page.route('**/images/wonders/art/*.png', route => route.abort());
  await page.goto('./');
  const first = await drawAll(page, '#2d5a27');
  expect(Object.values(first.loaded).every(loaded => !loaded)).toBe(true);
  await page.unroute('**/images/wonders/art/*.png');
  const second = await page.evaluate(async ({ src, ids }) => {
    const loader = await import(/* @vite-ignore */ `${src}/legendary-wonder-art-loader.ts`);
    await loader.preloadLegendaryWonderArt();
    return ids.map(id => loader.getLegendaryWonderArtImage(id) !== null);
  }, { src: SRC, ids: IDS });
  expect(second.every(Boolean)).toBe(true);
});
