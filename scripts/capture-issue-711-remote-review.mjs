#!/usr/bin/env node
/** Generates remote-review GIF reels from the Issue 711 production sprite payload and CSS. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const preview = pathToFileURL(resolve(root, 'docs/reviews/assets/issue-711/sprite-preview.html')).href;
const output = resolve(root, 'docs/reviews/assets/issue-711');
const states = ['idle', 'walk', 'attack', 'hurt', 'death'];
const units = [
  { id: 'trebuchet', filename: 'trebuchet', attackSelector: '.cq-trebuchet-beam' },
  { id: 'rocket_artillery', filename: 'rocket-artillery', attackSelector: '.cq-rocket-artillery-rack' },
  { id: 'battleship', filename: 'battleship', attackSelector: '.cq-battleship-turret-fore' },
  { id: 'missile_cruiser', filename: 'missile-cruiser', attackSelector: '.cq-missile-cruiser-vls-lid' },
];

function encodeGif(frameDirectory, outputGif) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', '8', '-i', resolve(frameDirectory, 'frame-%02d.png'),
    '-vf', 'fps=8,scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
    '-loop', '0', outputGif,
  ], { stdio: 'inherit' });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg failed for ${outputGif} with status ${result.status}`);

  const gif = readFileSync(outputGif);
  if (gif.subarray(0, 6).toString('ascii') !== 'GIF89a' || gif.byteLength <= 1_000) {
    throw new Error(`Invalid remote-review GIF: ${outputGif}`);
  }
}

async function createAnimationReel(page, unit) {
  await page.goto(preview);
  await page.waitForSelector(`.card[data-unit="${unit.id}"]`);
  await page.evaluate(({ unitId, stateList }) => {
    const source = document.querySelector(`.card[data-unit="${unitId}"]`);
    const grid = document.querySelector('#sprite-grid');
    if (!source || !grid) throw new Error(`Missing review card: ${unitId}`);

    const cards = stateList.map((state) => {
      const card = source.cloneNode(true);
      card.dataset.reviewState = state;
      const heading = card.querySelector('h2');
      const stage = card.querySelector('.stage');
      if (!heading || !stage) throw new Error(`Incomplete review card: ${unitId}`);
      heading.textContent = `${state.slice(0, 1).toUpperCase()}${state.slice(1)}`;
      stage.style.height = '180px';
      for (const sprite of card.querySelectorAll('.cq-sprite-wrap, .cq-sprite-wrap svg')) {
        sprite.dataset.state = state;
        sprite.style.setProperty('--phase', '0');
      }
      return card;
    });

    grid.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';
    grid.style.gap = '10px';
    grid.replaceChildren(...cards);
  }, { unitId: unit.id, stateList: states });

  const animationName = await page.evaluate(({ unitId, selector }) => {
    const card = document.querySelector(`.card[data-unit="${unitId}"][data-review-state="attack"]`);
    const mechanism = card?.querySelector(selector);
    if (!mechanism) throw new Error(`Missing attack mechanism ${selector} for ${unitId}`);
    return getComputedStyle(mechanism).animationName;
  }, { unitId: unit.id, selector: unit.attackSelector });
  if (!animationName || animationName === 'none') {
    throw new Error(`${unit.id} lacks an attack animation on ${unit.attackSelector}`);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 420 }, deviceScaleFactor: 1 });
  for (const unit of units) {
    const frameDirectory = mkdtempSync(resolve(tmpdir(), `conquestoria-issue-711-${unit.filename}-`));
    const outputGif = resolve(output, `${unit.filename}-animation.gif`);
    try {
      await createAnimationReel(page, unit);
      for (let frame = 0; frame < 12; frame += 1) {
        await page.locator('#sprite-grid').screenshot({ path: resolve(frameDirectory, `frame-${String(frame).padStart(2, '0')}.png`) });
        await page.waitForTimeout(125);
      }
      encodeGif(frameDirectory, outputGif);
    } finally {
      rmSync(frameDirectory, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
}

console.log('✓ Generated Issue 711 remote animated review GIFs');
