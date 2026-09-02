#!/usr/bin/env node
/** Captures #711 file-safe review evidence from the actual generated payload and CSS. */
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const preview = pathToFileURL(resolve(root, 'docs/reviews/assets/issue-711/sprite-preview.html')).href;
const output = resolve(root, 'docs/reviews/assets/issue-711');
const units = [
  ['trebuchet', 'trebuchet', '.cq-trebuchet-stone', 'attack'],
  ['rocket_artillery', 'rocket-artillery', '.cq-rocket-artillery-rocket', 'attack'],
  ['battleship', 'battleship', '.cq-battleship-turret-fore', 'attack'],
  ['missile_cruiser', 'missile-cruiser', '.cq-missile-cruiser-vls-lid', 'attack'],
];
const states = ['idle', 'walk', 'attack', 'hurt', 'death'];
const phases = [0, .25, .5, .75];

function setStateAndPhase(root, state, phase) {
  for (const sprite of root.querySelectorAll('.cq-sprite-wrap, .cq-sprite-wrap svg')) {
    sprite.dataset.state = state;
    sprite.style.setProperty('--phase', String(phase));
    for (const animation of sprite.getAnimations?.() ?? []) {
      animation.pause();
      animation.currentTime = phase * Number(animation.effect?.getTiming().duration ?? 0);
    }
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
  for (const [id, filename, hook, attackState] of units) {
    await page.goto(preview); await page.waitForSelector('.card[data-unit]');
    await page.evaluate((unitId) => {
      const source = document.querySelector(`.card[data-unit="${unitId}"]`);
      const grid = document.querySelector('#sprite-grid');
      if (!source || !grid) throw new Error(`Missing review card: ${unitId}`);
      const cards = [40, 64, 128].map((size) => {
        const card = source.cloneNode(true);
        card.querySelector('h2').textContent += ` · ${size}px`;
        card.querySelector('.stage').style.height = '190px';
        const wrap = card.querySelector('.cq-sprite-wrap'); wrap.style.width = `${size}px`; wrap.style.height = `${size}px`;
        return card;
      });
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)'; grid.replaceChildren(...cards);
    }, id);
    await page.locator('#sprite-grid').screenshot({ path: resolve(output, `${filename}-identity-sheet.png`) });

    await page.goto(preview); await page.waitForSelector('.card[data-unit]');
    await page.evaluate(({ unitId, stateList, phaseList }) => {
      const applyStateAndPhase = (root, state, phase) => {
        for (const sprite of root.querySelectorAll('.cq-sprite-wrap, .cq-sprite-wrap svg')) {
          sprite.dataset.state = state;
          sprite.style.setProperty('--phase', String(phase));
          for (const animation of sprite.getAnimations?.() ?? []) {
            animation.pause();
            animation.currentTime = phase * Number(animation.effect?.getTiming().duration ?? 0);
          }
        }
      };
      const source = document.querySelector(`.card[data-unit="${unitId}"]`);
      const grid = document.querySelector('#sprite-grid');
      if (!source || !grid) throw new Error(`Missing review card: ${unitId}`);
      const cards = stateList.flatMap((state) => phaseList.map((phase) => {
        const card = source.cloneNode(true);
        card.querySelector('h2').textContent = `${card.querySelector('h2').textContent} · ${state} ${Math.round(phase * 100)}%`;
        card.querySelector('.stage').style.height = '132px';
        applyStateAndPhase(card, state, phase); return card;
      }));
      grid.style.gridTemplateColumns = 'repeat(4, 1fr)'; grid.replaceChildren(...cards);
    }, { unitId: id, stateList: states, phaseList: phases });
    await page.waitForTimeout(80);
    await page.locator('#sprite-grid').screenshot({ path: resolve(output, `${filename}-contact-sheet.png`) });

    await page.goto(preview); await page.waitForSelector(`.card[data-unit="${id}"]`);
    const animationName = await page.evaluate(({ unitId, selector, state }) => {
      const applyStateAndPhase = (root, nextState, phase) => {
        for (const sprite of root.querySelectorAll('.cq-sprite-wrap, .cq-sprite-wrap svg')) {
          sprite.dataset.state = nextState;
          sprite.style.setProperty('--phase', String(phase));
        }
      };
      const card = document.querySelector(`.card[data-unit="${unitId}"]`);
      if (!card) throw new Error(`Missing review card: ${unitId}`);
      applyStateAndPhase(card, state, 0.25);
      return getComputedStyle(card.querySelector(selector)).animationName;
    }, { unitId: id, selector: hook, state: attackState });
    if (!animationName || animationName === 'none') throw new Error(`${id} lacks local ${attackState} animation on ${hook}`);
  }
} finally {
  await browser.close();
}

console.log('✓ Captured #711 identity and full-state motion review sheets');
