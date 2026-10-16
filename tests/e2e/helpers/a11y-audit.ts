import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared checks for the keyboard / accessibility acceptance specs (#1459).
 *
 * Three independent detectors, each aimed at a failure class that actually shipped:
 *
 * - `auditWithAxe`: an established rule engine (axe-core) over a scope. Two rules are switched off on purpose and
 *   documented in docs/keyboard-and-focus-acceptance.md: `meta-viewport` (the game disables browser pinch-zoom
 *   because pinch is a map gesture) and `region` (a canvas game has no document landmarks to speak of; every
 *   screen and dialog is exposed as a named `role="dialog"` instead).
 * - `findPointerOnlyControls`: anything the pointer treats as a control (`cursor: pointer`) that the keyboard cannot
 *   reach, such as a `div` with only a click handler. axe cannot see click handlers, so this is how a screen whose
 *   only civilization choices were clickable divs went unnoticed.
 * - `tabStopsWithin`: what Tab actually visits, in order, so a test can assert focus never leaves a dialog.
 */

export interface AxeFinding {
  readonly rule: string;
  readonly impact: string | null | undefined;
  readonly nodes: readonly string[];
}

export async function auditWithAxe(page: Page, scope?: string): Promise<AxeFinding[]> {
  let builder = new AxeBuilder({ page }).disableRules(['meta-viewport', 'region']);
  if (scope) builder = builder.include(scope);
  const results = await builder.analyze();
  return results.violations.map(violation => ({
    rule: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map(node => node.target.join(' ')),
  }));
}

export async function findPointerOnlyControls(page: Page, scope = 'body'): Promise<string[]> {
  return page.evaluate((scopeSelector) => {
    const root = document.querySelector(scopeSelector);
    if (!root) return [];
    const reachable = 'button, a[href], input, select, textarea, summary, label, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(element);
      if (style.cursor !== 'pointer') continue;
      if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (element.closest('[inert], [aria-hidden="true"]')) continue;
      if (element.matches(reachable) || element.closest(reachable)) continue;
      // A container may keep a pointer click shortcut only if a real control inside it does the same job.
      const shortcut = element.closest('[data-pointer-shortcut]');
      if (shortcut && shortcut.querySelector(reachable)) continue;
      const label = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      out.push(`${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.split(' ')[0]}` : ''} "${label}"`);
    }
    return out;
  }, scope);
}

/** Describe the focused element: tag, id, accessible-ish name. */
export async function activeLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'body';
    const name = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${name}"`;
  });
}

/** Press Tab `count` times and return what held focus after each press. */
export async function tabStops(page: Page, count: number): Promise<string[]> {
  const stops: string[] = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    stops.push(await activeLabel(page));
  }
  return stops;
}

/** True when the focused element is inside `selector`. */
export async function focusIsWithin(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(
    (sel) => document.querySelector(sel)?.contains(document.activeElement) ?? false,
    selector,
  );
}

/**
 * The one screen that should own the keyboard right now, by DOM id: focus inside, a named modal dialog, Tab and
 * Shift+Tab never leave it, axe finds nothing and no pointer-only control is on it.
 */
export async function assertScreen(page: Page, id: string, options: { tabs?: number; initial?: Locator } = {}): Promise<void> {
  const screen = page.locator(`#${id}`);
  await expect(screen).toBeVisible();
  await expect.poll(() => focusIsWithin(page, `#${id}`), { message: `focus should be inside #${id}` }).toBe(true);
  // Checked before the Tab loop below moves focus on.
  if (options.initial) await expect(options.initial).toBeFocused();
  await expect(screen).toHaveAttribute('role', 'dialog');
  await expect(screen).toHaveAttribute('aria-modal', 'true');
  expect(await screen.getAttribute('aria-label'), `#${id} needs an accessible name`).toBeTruthy();

  const stops = await tabStops(page, options.tabs ?? 12);
  for (const stop of stops) expect(await focusIsWithin(page, `#${id}`), `Tab left #${id}: ${stop}`).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await focusIsWithin(page, `#${id}`), `Shift+Tab left #${id}`).toBe(true);

  expect(await auditWithAxe(page, `#${id}`), `axe findings on #${id}`).toEqual([]);
  expect(await findPointerOnlyControls(page, `#${id}`), `pointer-only controls on #${id}`).toEqual([]);
}
