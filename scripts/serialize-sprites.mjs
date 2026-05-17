#!/usr/bin/env node
/**
 * serialize-sprites.mjs — render v2 JSX sprites to static SVG strings.
 *
 * Prerequisites (run once):
 *   bash scripts/run-with-mise.sh yarn add -D @babel/core @babel/preset-react react react-dom
 *
 * Usage:
 *   node scripts/serialize-sprites.mjs
 *
 * Output: src/renderer/sprites/v2/<name>.svg.ts
 *   export const svg: Record<string, string> = { imperials: '...', vikings: '...', ... };
 *
 * The SVG strings contain all cq-v2 class hooks for CSS animation. To animate
 * them in the game, insert as live DOM SVG elements (not canvas rasterization)
 * and include src/assets/sprite-animations-v2.css. At mount time:
 *   wrapper.classList.add('cq-v2');
 *   wrapper.style.setProperty('--phase', String(Math.random()));
 *   svg.dataset.state = 'idle'; // 'walk' | 'attack' | 'hurt' | 'death' at runtime
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { JSDOM } = require('jsdom');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const DESIGN_LIB = resolve(__dirname, '../design/conquestoria-sprites/lib');
const OUT_DIR = resolve(__dirname, '../src/renderer/sprites/v2');

mkdirSync(OUT_DIR, { recursive: true });

// Set up a minimal browser-like global env so the JSX files can share via window.*
const dom = new JSDOM('<!DOCTYPE html>', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
global.React = React;
global.window.React = React;

function execJsx(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const { code } = babel.transformSync(src, {
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    filename: filePath,
  });
  // Execute in a function so `window` references resolve to our global
  // eslint-disable-next-line no-new-func
  new Function('React', 'window', code)(React, global.window);
  // Promote exported functions to global so later files can reference them as bare names
  for (const key of Object.keys(global.window)) {
    if (typeof global.window[key] === 'function') {
      try { global[key] = global.window[key]; } catch (_) {}
    }
  }
}

// Load in dependency order — sprite-system sets up window.SPRITE before others read it
const LOAD_ORDER = [
  'sprite-system.jsx',
  'units.jsx',
  'buildings.jsx',
  'units-v2.jsx',
  'buildings-v2.jsx',
];

for (const file of LOAD_ORDER) {
  execJsx(resolve(DESIGN_LIB, file));
}

const FACTIONS = ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate'];

const UNIT_SPRITES = [
  ['settler',       'SettlerV2Sprite'],
  ['worker',        'WorkerV2Sprite'],
  ['scout',         'ScoutV2Sprite'],
  ['scout_hound',   'ScoutHoundV2Sprite'],
  ['war_hound',     'WarHoundV2Sprite'],
  ['shadow_warden', 'ShadowWardenV2Sprite'],
  ['warrior',       'WarriorV2Sprite'],
  ['swordsman',     'SwordsmanV2Sprite'],
  ['pikeman',       'PikemanV2Sprite'],
  ['archer',        'ArcherV2Sprite'],
  ['musketeer',     'MusketeerV2Sprite'],
  ['galley',        'GalleyV2Sprite'],
  ['trireme',       'TriremeV2Sprite'],
  ['spy_scout',     'SpyScoutV2Sprite'],
  ['spy_informant', 'SpyInformantV2Sprite'],
  ['spy_agent',     'SpyAgentV2Sprite'],
  ['spy_operative', 'SpyOperativeV2Sprite'],
  ['spy_hacker',    'SpyHackerV2Sprite'],
];

const BUILDING_SPRITES = [
  ['granary',             'GranaryV2Sprite'],
  ['herbalist',           'HerbalistV2Sprite'],
  ['aqueduct',            'AqueductV2Sprite'],
  ['workshop',            'WorkshopV2Sprite'],
  ['forge',               'ForgeV2Sprite'],
  ['lumbermill',          'LumbermillV2Sprite'],
  ['quarry-building',     'QuarryV2Sprite'],
  ['library',             'LibraryV2Sprite'],
  ['archive',             'ArchiveV2Sprite'],
  ['observatory',         'ObservatoryV2Sprite'],
  ['marketplace',         'MarketplaceV2Sprite'],
  ['harbor',              'HarborV2Sprite'],
  ['barracks',            'BarracksV2Sprite'],
  ['walls',               'WallsV2Sprite'],
  ['stable',              'StableV2Sprite'],
  ['temple',              'TempleV2Sprite'],
  ['monument',            'MonumentV2Sprite'],
  ['amphitheater',        'AmphitheaterV2Sprite'],
  ['shrine',              'ShrineV2Sprite'],
  ['forum',               'ForumV2Sprite'],
  ['safehouse',           'SafehouseV2Sprite'],
  ['intelligence-agency', 'IntelAgencyV2Sprite'],
  ['security-bureau',     'SecurityBureauV2Sprite'],
];

let written = 0;

function renderSprite(ComponentName, props) {
  const Component = global.window[ComponentName];
  if (!Component) {
    console.warn(`  SKIP ${ComponentName} — not found on window`);
    return null;
  }
  return renderToStaticMarkup(React.createElement(Component, props));
}

function writeSvgTs(outPath, byFaction, header = '') {
  const lines = [
    `// Auto-generated by scripts/serialize-sprites.mjs — do not edit manually.`,
    `// Re-run: node scripts/serialize-sprites.mjs`,
  ];
  if (header) lines.push(`// ${header}`);
  lines.push(`export const svg: Record<string, string> = {`);
  for (const f of FACTIONS) {
    lines.push(`  ${f}: ${JSON.stringify(byFaction[f] ?? '')},`);
  }
  lines.push(`};`);
  writeFileSync(outPath, lines.join('\n') + '\n');
}

for (const [id, ComponentName] of UNIT_SPRITES) {
  const byFaction = {};
  let ok = true;
  for (const faction of FACTIONS) {
    const html = renderSprite(ComponentName, { faction, state: 'idle', phase: 0 });
    if (!html) { ok = false; break; }
    byFaction[faction] = html;
  }
  if (!ok) continue;
  writeSvgTs(resolve(OUT_DIR, `${id}.svg.ts`), byFaction,
    `state driven at runtime via data-state attribute on inner SVG`);
  written++;
}

for (const [id, ComponentName] of BUILDING_SPRITES) {
  const byFaction = {};
  let ok = true;
  for (const faction of FACTIONS) {
    const html = renderSprite(ComponentName, { faction, state: 'idle' });
    if (!html) { ok = false; break; }
    byFaction[faction] = html;
  }
  if (!ok) continue;
  writeSvgTs(resolve(OUT_DIR, `${id}.svg.ts`), byFaction);
  written++;
}

console.log(`✓ Wrote ${written} sprite files to src/renderer/sprites/v2/`);
