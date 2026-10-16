import { expect, test, type Page } from '@playwright/test';
import { auditWithAxe, findPointerOnlyControls, focusIsWithin, tabStops } from './helpers/a11y-audit';
import { openWithKeyboard, startFixture } from './helpers/campaign-fixture';

// #1459: the two groups the keyboard acceptance record used to list as "declared by unit tests, not driven in a
// browser": the one-shot ceremonies (wonder discovery and completion, beast slay, event-chain and world-race
// conclusions) and the failure/retry paths (a save that fails, a map that fails to load).
//
// A ceremony is normally reached by a game event that would need an elaborate world; here the real ceremony factory
// is imported from the dev server and mounted in the real UI layer of a running campaign, so the live focus manager,
// the live shortcut handling and the real DOM are what is under test, not a jsdom double.

interface CeremonyCase {
  readonly name: string;
  readonly id: string;
  /** Page-side source that mounts the ceremony in `layer` and returns nothing. */
  readonly mount: string;
  readonly escapeResolves: boolean;
}

const BASE = '/conquestoria/src';

const CEREMONIES: readonly CeremonyCase[] = [
  {
    name: 'wonder discovery',
    id: 'wonder-discovery-ceremony',
    escapeResolves: true,
    mount: `
      const { createWonderDiscoveryCeremony } = await import('${BASE}/ui/wonder-discovery-ceremony.ts');
      const { getWonderVisualDefinition } = await import('${BASE}/systems/wonder-visual-catalog.ts');
      createWonderDiscoveryCeremony(layer, {
        title: 'Natural Wonder Discovered', wonderId: 'great_volcano', civId: 'player', coord: { q: 2, r: 3 },
        name: 'Great Volcano', revealLine: 'The earth opens and the sky remembers.',
        effectSummary: 'Yields +3 Production, +1 Science.', rewardSummary: '+30 Science discovery reward',
        visual: getWonderVisualDefinition('great_volcano'), motionAssetId: null,
      }, { onResolve: () => { window.__ceremonyResolved = (window.__ceremonyResolved ?? 0) + 1; } }, { reducedMotion: true });
    `,
  },
  {
    name: 'legendary wonder completion',
    id: 'legendary-wonder-completion-ceremony',
    escapeResolves: true,
    mount: `
      const { createLegendaryWonderCompletionCeremony } = await import('${BASE}/ui/legendary-wonder-completion-ceremony.ts');
      const { getWonderVisualDefinition } = await import('${BASE}/systems/wonder-visual-catalog.ts');
      createLegendaryWonderCompletionCeremony(layer, {
        title: 'Legendary Wonder Completed', civId: 'player', cityId: 'city-river', wonderId: 'oracle-of-delphi',
        turnCompleted: 42, name: 'Oracle of Delphi', cityName: 'River City',
        achievementLine: 'River City has completed a work that will shape its legacy.',
        rewardSummary: '+20% science in this city', rewardActiveLabel: 'Reward active',
        visual: getWonderVisualDefinition('oracle-of-delphi'),
      }, { onResolve: () => { window.__ceremonyResolved = (window.__ceremonyResolved ?? 0) + 1; } }, { reducedMotion: true });
    `,
  },
  {
    name: 'beast slay',
    id: 'beast-slay-ceremony',
    escapeResolves: true,
    mount: `
      const { showBeastSlayCeremony } = await import('${BASE}/ui/beast-slay-ceremony.ts');
      showBeastSlayCeremony(layer, {
        beastName: 'Great Boar', unitType: 'warrior', slayerName: 'Rome', rewardLines: ['+25 gold', '+10 science'],
        onContinue: () => { window.__ceremonyResolved = (window.__ceremonyResolved ?? 0) + 1; },
      });
    `,
  },
  {
    name: 'event-chain conclusion',
    id: 'event-chain-conclusion-ceremony',
    escapeResolves: true,
    mount: `
      const { createEventChainConclusionCeremony } = await import('${BASE}/ui/event-chain-conclusion-ceremony.ts');
      createEventChainConclusionCeremony(layer, {
        civId: 'player', chainId: 'chain-1', kind: 'financial-panic', title: 'Financial Panic',
        optionLabel: 'Emergency Bailout', optionDescription: 'Pay a gold sum now to guarantee the treasury crisis passes quietly.',
      }, { onResolve: () => { window.__ceremonyResolved = (window.__ceremonyResolved ?? 0) + 1; } });
    `,
  },
  {
    name: 'world-race conclusion',
    id: 'world-race-conclusion-ceremony',
    escapeResolves: true,
    mount: `
      const { createWorldRaceConclusionCeremony } = await import('${BASE}/ui/world-race-conclusion-ceremony.ts');
      createWorldRaceConclusionCeremony(layer, {
        kind: 'first-satellite', displayName: 'First Satellite', turn: 42, won: false, winnerName: null,
        rewardSummary: 'National prestige and a wave of new trade contracts follow the launch.',
      }, { onResolve: () => { window.__ceremonyResolved = (window.__ceremonyResolved ?? 0) + 1; } });
    `,
  },
];

async function mountCeremony(page: Page, source: string): Promise<void> {
  await page.evaluate(async (code) => {
    const layer = document.getElementById('ui-layer') as HTMLElement;
    // The source is a fixed literal from this file, never player data.
    const run = new Function('layer', `return (async () => { ${code} })();`) as (layer: HTMLElement) => Promise<void>;
    await run(layer);
  }, source);
}

declare global {
  interface Window { __ceremonyResolved?: number }
}

test.describe('ceremonies are keyboard-complete in a running campaign', () => {
  for (const ceremony of CEREMONIES) {
    test(`${ceremony.name}: focus enters, Tab stays, axe is clean, Escape answers it`, async ({ page }) => {
      test.setTimeout(120_000);
      await startFixture(page);
      await mountCeremony(page, ceremony.mount);

      const selector = `#${ceremony.id}`;
      const dialog = page.locator(selector);
      await expect(dialog).toBeVisible();
      await expect.poll(() => focusIsWithin(page, selector), { message: `focus should be inside ${selector}` }).toBe(true);
      await expect(dialog).toHaveAttribute('role', 'dialog');
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(await dialog.getAttribute('aria-label'), `${selector} needs an accessible name`).toBeTruthy();

      for (const stop of await tabStops(page, 8)) {
        expect(await focusIsWithin(page, selector), `Tab left ${selector}: ${stop}`).toBe(true);
      }
      await page.keyboard.press('Shift+Tab');
      expect(await focusIsWithin(page, selector), `Shift+Tab left ${selector}`).toBe(true);

      // A shortcut letter must not act on the game behind the ceremony (E ends the turn).
      const turnBefore = await page.locator('#hud').innerText();
      await page.keyboard.press('e');
      await expect(page.locator('#end-turn-warning, [data-end-turn-warning]')).toHaveCount(0);
      expect(await page.locator('#hud').innerText()).toBe(turnBefore);

      expect(await auditWithAxe(page, selector), `axe findings on ${selector}`).toEqual([]);
      expect(await findPointerOnlyControls(page, selector), `pointer-only controls on ${selector}`).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => window.__ceremonyResolved), 'the ceremony resolves exactly once').toBe(1);
      // Focus is not left on a removed node: Tab reaches a game control.
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement !== document.body), 'Tab reaches a control after the ceremony').toBe(true);
    });
  }

  test('the Continue button answers a ceremony from the keyboard', async ({ page }) => {
    test.setTimeout(120_000);
    await startFixture(page);
    await mountCeremony(page, CEREMONIES.find(c => c.id === 'event-chain-conclusion-ceremony')!.mount);
    const button = page.locator('[data-event-chain-conclusion-action="continue"]');
    await expect(button).toBeVisible();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#event-chain-conclusion-ceremony')).toHaveCount(0);
    expect(await page.evaluate(() => window.__ceremonyResolved)).toBe(1);
  });
});

test.describe('failure and retry paths are keyboard-complete', () => {
  test('a save that fails keeps the dialog, announces the error, and a retry succeeds', async ({ page }) => {
    test.setTimeout(150_000);
    await startFixture(page);
    await openWithKeyboard(page, page.getByRole('button', { name: 'Pause menu', exact: true }), '#pause-menu');
    await page.getByRole('button', { name: 'Save Game' }).focus();
    await page.keyboard.press('Enter');

    const savePanel = page.locator('#save-panel');
    await expect(savePanel).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Save name' })).toBeFocused();
    await page.keyboard.type('a11y failing save');

    // The storage layer starts refusing writes.
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      (window as unknown as { __restoreIdb: () => void }).__restoreIdb = () => { IDBObjectStore.prototype.put = original; };
      IDBObjectStore.prototype.put = function failingPut(): IDBRequest {
        throw new DOMException('simulated disk full', 'QuotaExceededError');
      };
    });

    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    await saveButton.focus();
    await page.keyboard.press('Enter');

    const alert = savePanel.getByRole('alert').filter({ hasText: 'Could not save your game' });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(savePanel).toBeVisible();
    // Controls come back, focus returns to the control that was used, and the typed name is still there.
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Save name' })).toHaveValue('a11y failing save');
    expect(await focusIsWithin(page, '#save-panel')).toBe(true);
    expect(await auditWithAxe(page, '#save-panel'), 'axe findings on the save error state').toEqual([]);

    // Storage recovers; the same control retries and the dialog closes.
    await page.evaluate(() => (window as unknown as { __restoreIdb: () => void }).__restoreIdb());
    await page.keyboard.press('Enter');
    await expect(savePanel).toHaveCount(0, { timeout: 15_000 });
  });

  test('a campaign whose map data cannot be loaded keeps setup open and a keyboard retry starts it', async ({ page }) => {
    test.setTimeout(150_000);
    let blocked = true;
    await page.route(/\/(earth|old-world|new-world)-map[^/]*\.json/, route => (blocked ? route.abort() : route.continue()));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.locator('#save-panel')).toBeVisible();

    const activate = async (name: RegExp | string): Promise<void> => {
      await page.getByRole('button', { name }).first().focus();
      await page.keyboard.press('Enter');
    };
    await activate('New Game');
    await activate(/^Solo/);
    await activate('Choose civilization');
    await page.locator('#civ-select .civ-card', { hasText: 'Rome' }).focus();
    await page.keyboard.press('Enter');
    await activate('Confirm Civilization');
    await expect(page.locator('#campaign-setup')).toBeVisible();

    const start = page.getByRole('button', { name: 'Start Campaign', exact: true });
    await start.focus();
    await page.keyboard.press('Enter');

    const setup = page.locator('#campaign-setup');
    await expect(setup.getByRole('alert').filter({ hasText: 'map data could not be loaded' })).toBeVisible({ timeout: 30_000 });
    await expect(setup).toBeVisible();
    await expect(start).toBeEnabled();
    await expect(start).toBeFocused();
    expect(await auditWithAxe(page, '#campaign-setup'), 'axe findings on the map-load error state').toEqual([]);

    blocked = false;
    await page.keyboard.press('Enter');
    await expect(setup).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('#hud')).toContainText(/Turn \d+/, { timeout: 60_000 });
  });
});
