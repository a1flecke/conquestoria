#!/usr/bin/env node
/** Captures #710 file-safe review evidence from the actual generated payload and CSS. */
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const preview = pathToFileURL(resolve(root, 'docs/reviews/assets/issue-710/sprite-preview.html')).href;
const output = resolve(root, 'docs/reviews/assets/issue-710');
const units = [
  ['paratrooper', 'paratrooper'],
  ['naval_strike_aircraft', 'naval-strike-aircraft'],
  ['maritime_patrol_aircraft', 'maritime-patrol-aircraft'],
  ['supercarrier', 'supercarrier'],
  ['great_general', 'great-general'],
];
const states = ['idle', 'walk', 'attack', 'hurt', 'death'];
const phases = [0, .25, .5, .75];

function applyPausedState(root, state, phase) {
  for (const sprite of root.querySelectorAll('.cq-sprite-wrap, .cq-sprite-wrap svg')) {
    sprite.dataset.state = state;
    sprite.style.setProperty('--phase', String(phase));
    for (const animation of sprite.getAnimations?.() ?? []) {
      animation.pause();
      animation.currentTime = phase * 1400;
    }
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
  for (const [id, filename] of units) {
    await page.goto(preview); await page.waitForSelector('.card[data-unit]');
    await page.evaluate((unitId) => {
      const source = document.querySelector(`.card[data-unit="${unitId}"]`);
      const grid = document.querySelector('#sprite-grid');
      if (!source || !grid) throw new Error(`Missing review card: ${unitId}`);
      const cards = [40, 64, 128].map((size) => {
        const card = source.cloneNode(true);
        card.querySelector('h2').textContent += ` · ${size}px`;
        const stage = card.querySelector('.stage');
        const wrap = card.querySelector('.cq-sprite-wrap');
        stage.style.height = '190px'; wrap.style.width = `${size}px`; wrap.style.height = `${size}px`;
        return card;
      });
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)'; grid.replaceChildren(...cards);
    }, id);
    await page.locator('#sprite-grid').screenshot({ path: resolve(output, `${filename}-identity-sheet.png`) });

    await page.goto(preview); await page.waitForSelector('.card[data-unit]');
    await page.evaluate(({ unitId, stateList, phaseList }) => {
      const source = document.querySelector(`.card[data-unit="${unitId}"]`);
      const grid = document.querySelector('#sprite-grid');
      if (!source || !grid) throw new Error(`Missing review card: ${unitId}`);
      const cards = stateList.flatMap((state) => phaseList.map((phase) => {
        const card = source.cloneNode(true);
        card.querySelector('h2').textContent = `${card.querySelector('h2').textContent} · ${state} ${Math.round(phase * 100)}%`;
        card.querySelector('.stage').style.height = '132px';
        for (const sprite of card.querySelectorAll('.cq-sprite-wrap, .cq-sprite-wrap svg')) {
          sprite.dataset.state = state;
          sprite.style.setProperty('--phase', String(phase));
          for (const animation of sprite.getAnimations?.() ?? []) {
            animation.pause();
            animation.currentTime = phase * 1400;
          }
        }
        return card;
      }));
      grid.style.gridTemplateColumns = 'repeat(4, 1fr)'; grid.replaceChildren(...cards);
    }, { unitId: id, stateList: states, phaseList: phases });
    await page.waitForTimeout(80);
    await page.locator('#sprite-grid').screenshot({ path: resolve(output, `${filename}-contact-sheet.png`) });
  }

  await page.goto(preview); await page.waitForSelector('.building-card');
  await page.evaluate(() => {
    const grid = document.querySelector('#sprite-grid');
    const cards = [...document.querySelectorAll('.building-card')];
    if (cards.length !== 2) throw new Error('SAM/Radar review requires exactly two building cards.');
    const samples = cards.flatMap((source) => [40, 64, 128].map((size) => {
      const card = source.cloneNode(true);
      card.querySelector('h2').textContent += ` · ${size}px`;
      card.style.setProperty('--building-size', `${size}px`);
      card.querySelector('.stage').style.height = '190px';
      return card;
    }));
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)'; grid.replaceChildren(...samples);
  });
  await page.locator('#sprite-grid').screenshot({ path: resolve(output, 'sam-radar-comparison.png') });

  await page.goto(preview); await page.waitForSelector('.card[data-unit="paratrooper"]');
  const validation = await page.evaluate(() => {
    const data = globalThis.__ISSUE_710_SPRITES__;
    const buildings = globalThis.__ISSUE_710_BUILDINGS__;
    const spriteIds = ['paratrooper', 'naval_strike_aircraft', 'maritime_patrol_aircraft', 'supercarrier', 'great_general'];
    const animationFor = (unitId, hook) => {
      const card = document.querySelector(`.card[data-unit="${unitId}"]`);
      for (const sprite of card.querySelectorAll('.cq-sprite-wrap, .cq-sprite-wrap svg')) sprite.dataset.state = 'attack';
      return getComputedStyle(card.querySelector(hook)).animationName;
    };
    return {
      hasAllSprites: spriteIds.every((id) => data?.[id]?.imperials?.includes('cq-v2')),
      hasBuildings: Boolean(buildings?.sam_site?.includes('cq-sam-launcher') && buildings?.radar_station?.includes('cq-radar-tower')),
      hasStateControl: document.querySelectorAll('button[data-state]').length === 5,
      hasPhaseControl: document.querySelectorAll('button[data-phase]').length === 4,
      // file:// pages cannot always enumerate an external stylesheet's cssRules; computed
      // animation names prove the actual loaded CSS is reaching each local hook instead.
      hasLocalMotion: animationFor('naval_strike_aircraft', '.cq-naval-strike-torpedo').includes('cq710-torpedo-release')
        && animationFor('supercarrier', '.cq-supercarrier-launch-aircraft').includes('cq710-carrier-launch')
        && animationFor('great_general', '.cq-general-map').includes('cq710-general-map'),
    };
  });
  if (!Object.values(validation).every(Boolean)) throw new Error(`Incomplete #710 review surface: ${JSON.stringify(validation)}`);
} finally {
  await browser.close();
}

console.log('✓ Captured #710 identity, full-state contact, and SAM/Radar review sheets');
