#!/usr/bin/env node
/** Captures #709 evidence from the committed review page using actual CSS timing. */
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const preview = pathToFileURL(resolve(root, 'docs/reviews/assets/issue-709/sprite-preview.html')).href;
const output = resolve(root, 'docs/reviews/assets/issue-709');
const units = [['armored_car', 'armored-car'], ['mechanized_infantry', 'mechanized-infantry'], ['main_battle_tank', 'main-battle-tank']];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 760 }, deviceScaleFactor: 1 });
  for (const [id, filename] of units) {
    await page.goto(preview); await page.waitForSelector('.card');
    await page.evaluate((unitId) => { const card = document.querySelector(`.card[data-unit="${unitId}"]`); const grid = document.querySelector('#sprite-grid'); grid.replaceChildren(card.cloneNode(true)); }, id);
    await page.locator('#sprite-grid').screenshot({ path: resolve(output, `${filename}-identity-sheet.png`) });
    await page.goto(preview); await page.waitForSelector('.card');
    await page.evaluate((unitId) => {
      const source = document.querySelector(`.card[data-unit="${unitId}"]`); const grid = document.querySelector('#sprite-grid');
      const samples = [0, .25, .5, .75].map((phase) => { const card = source.cloneNode(true); const label = document.createElement('p'); label.textContent = `Attack ${Math.round(phase * 100)}%`; card.append(label); for (const sprite of card.querySelectorAll('.cq-sprite-wrap, .cq-sprite-wrap svg')) { sprite.dataset.state = 'attack'; sprite.style.setProperty('--phase', String(phase)); } return card; });
      grid.style.gridTemplateColumns = 'repeat(4, 1fr)'; grid.replaceChildren(...samples);
    }, id);
    await page.waitForTimeout(80);
    await page.locator('#sprite-grid').screenshot({ path: resolve(output, `${filename}-contact-sheet.png`) });
  }
} finally { await browser.close(); }
console.log('✓ Captured #709 identity and browser phase-contact sheets');
