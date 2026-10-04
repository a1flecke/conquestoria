import { expect, type Page } from '@playwright/test';

interface HexCoordLike {
  q: number;
  r: number;
}

interface HitTarget {
  canvas: boolean;
  notification: boolean;
  description: string;
}

async function resolveVisiblePoint(
  page: Page,
  coord: HexCoordLike,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((target) => (
    window.__CONQUESTORIA_E2E_GET_VISIBLE_HEX_COPIES__?.(target)[0]
  ), coord);
  expect(point, `Expected ${coord.q},${coord.r} to be visible in the live camera`).toBeDefined();
  return point!;
}

async function inspectHitTarget(
  page: Page,
  point: { x: number; y: number },
): Promise<HitTarget> {
  return page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    const id = target?.id ? `#${target.id}` : '';
    const classes = target instanceof HTMLElement
      ? [...target.classList].map(name => `.${name}`).join('')
      : '';
    return {
      canvas: target?.id === 'game-canvas',
      notification: Boolean(target?.closest('#notifications')),
      description: target ? `${target.tagName.toLowerCase()}${id}${classes}` : 'no element',
    };
  }, point);
}

async function dismissCurrentNotification(page: Page): Promise<void> {
  const toast = page.locator('#notifications > *').first();
  const handle = await toast.elementHandle();
  if (!handle) return;

  await toast.click();
  await expect.poll(async () => handle.evaluate(node => node.isConnected), {
    message: 'expected the blocking notification node to be dismissed',
  }).toBe(false);
}

/**
 * Clicks the currently visible copy of a hex. A notification is a real,
 * clickable overlay, so dismiss it through the UI and re-resolve the point;
 * fail on any unknown interceptor instead of silently clicking the wrong UI.
 */
export async function clickVisibleHex(page: Page, coord: HexCoordLike): Promise<void> {
  for (let dismissedNotifications = 0; dismissedNotifications < 25; dismissedNotifications++) {
    const point = await resolveVisiblePoint(page, coord);
    const target = await inspectHitTarget(page, point);

    if (target.canvas) {
      await page.mouse.click(point.x, point.y);
      return;
    }
    if (target.notification) {
      await dismissCurrentNotification(page);
      continue;
    }
    throw new Error(
      `Expected the live canvas at ${coord.q},${coord.r}, but ${target.description} intercepted the click`,
    );
  }

  throw new Error(`Too many queued notifications blocked hex ${coord.q},${coord.r}`);
}
