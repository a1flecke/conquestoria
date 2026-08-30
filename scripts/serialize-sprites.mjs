#!/usr/bin/env node
/**
 * serialize-sprites.mjs — render v2 JSX sprites to static SVG strings.
 *
 * Prerequisites (run once):
 *   bash scripts/run-with-mise.sh yarn add -D @babel/core @babel/preset-react react react-dom
 *
 * Usage (must use yarn node for PnP resolution):
 *   bash scripts/run-with-mise.sh yarn node scripts/serialize-sprites.mjs
 *
 * To add a new sprite:
 *   1. Add the V2 component to design/conquestoria-sprites/lib/units-v2.jsx (or buildings-v2.jsx)
 *   2. Add a [id, ComponentName] entry to UNIT_SPRITES or BUILDING_SPRITES below
 *   3. Re-run this script
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
const ISSUE_708_PREVIEW_HTML = resolve(__dirname, '../docs/reviews/assets/issue-708/sprite-preview.html');
const ISSUE_708_DATA_START = '<!-- ISSUE_708_SPRITES_START -->';
const ISSUE_708_DATA_END = '<!-- ISSUE_708_SPRITES_END -->';
const ISSUE_709_PREVIEW_HTML = resolve(__dirname, '../docs/reviews/assets/issue-709/sprite-preview.html');
const ISSUE_709_DATA_START = '<!-- ISSUE_709_SPRITES_START -->';
const ISSUE_709_DATA_END = '<!-- ISSUE_709_SPRITES_END -->';
const ISSUE_710_PREVIEW_HTML = resolve(__dirname, '../docs/reviews/assets/issue-710/sprite-preview.html');
const ISSUE_710_DATA_START = '<!-- ISSUE_710_SPRITES_START -->';
const ISSUE_710_DATA_END = '<!-- ISSUE_710_SPRITES_END -->';
const ISSUE_711_PREVIEW_HTML = resolve(__dirname, '../docs/reviews/assets/issue-711/sprite-preview.html');
const ISSUE_711_DATA_START = '<!-- ISSUE_711_SPRITES_START -->';
const ISSUE_711_DATA_END = '<!-- ISSUE_711_SPRITES_END -->';

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
  'pirates-v2.jsx',
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
  ['beast_handler', 'BeastHandlerV2Sprite'],
  ['war_elephant',  'WarElephantV2Sprite'],
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
  // MR 2
  ['axeman',        'AxemanV2Sprite'],
  ['spearman',      'SpearmanV2Sprite'],
  ['horseman',      'HorsemanV2Sprite'],
  ['cavalry',       'CavalryV2Sprite'],
  ['knight',        'KnightV2Sprite'],
  ['cuirassier',    'CuirassierV2Sprite'],
  ['crossbowman',   'CrossbowmanV2Sprite'],
  ['catapult',      'CatapultV2Sprite'],
  ['ballista',      'BallistaV2Sprite'],
  // #711 siege and capital ships
  ['trebuchet',     'TrebuchetV2Sprite'],
  ['rocket_artillery', 'RocketArtilleryV2Sprite'],
  ['battleship',    'BattleshipV2Sprite'],
  ['missile_cruiser', 'MissileCruiserV2Sprite'],
  ['caravan',       'CaravanV2Sprite'],
  ['expedition',    'ExpeditionV2Sprite'],
  ['transport',     'TransportV2Sprite'],
  // MR 4 — late-era naval
  ['carrack',       'CarrackV2Sprite'],
  ['galleon',       'GalleonV2Sprite'],
  ['steamship',     'SteamshipV2Sprite'],
  ['troop_transport', 'TroopTransportV2Sprite'],
  // #759 batch 1
  ['combat_drone',        'CombatDroneV2Sprite'],
  ['autonomous_frigate',  'AutonomousFrigateV2Sprite'],
  ['exosuit_infantry',    'ExosuitInfantryV2Sprite'],
  ['propagandist',        'PropagandistV2Sprite'],
  ['drone_controller',    'DroneControllerV2Sprite'],
  // #709 industrial batch: review payload is serialized now; native registration
  // happens only after the staged visual gate is approved.
  ['armored_car',         'ArmoredCarV2Sprite'],
  ['mechanized_infantry', 'MechanizedInfantryV2Sprite'],
  ['main_battle_tank',    'MainBattleTankV2Sprite'],
  // #710 corrective batch: review payload is serialized now; native registration
  // happens only after the staged visual gate is approved.
  ['paratrooper',              'ParatrooperV2Sprite'],
  ['naval_strike_aircraft',    'NavalStrikeAircraftV2Sprite'],
  ['maritime_patrol_aircraft', 'MaritimePatrolAircraftV2Sprite'],
  ['supercarrier',             'SupercarrierV2Sprite'],
  ['great_general',            'GreatGeneralV2Sprite'],
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
  // MR 3
  ['dock',              'DockV2Sprite'],
  ['bronze-workshop',   'BronzeWorkshopV2Sprite'],
  ['armory',            'ArmoryV2Sprite'],
  ['ranch',             'RanchV2Sprite'],
  ['cavalry-academy',   'CavalryAcademyV2Sprite'],
  ['iron-foundry',      'IronFoundryV2Sprite'],
  ['war-academy',       'WarAcademyV2Sprite'],
  ['masonry-works',     'MasonryWorksV2Sprite'],
  ['siege-workshop',    'SiegeWorkshopV2Sprite'],
  ['caravanserai',      'CaravanseraiV2Sprite'],
  ['bank',              'BankV2Sprite'],
  ['stock_exchange',    'StockExchangeV2Sprite'],
];

const PIRATE_UNIT_SPRITES = [
  ['pirate_galley', 'PirateGalleyV2Sprite'],
  ['pirate_corsair', 'PirateCorsairV2Sprite'],
  ['pirate_frigate', 'PirateFrigateV2Sprite'],
  ['pirate_ironclad', 'PirateIroncladV2Sprite'],
  ['pirate_fast_attack_craft', 'PirateFastAttackCraftV2Sprite'],
  ['pirate_mothership', 'PirateMothershipV2Sprite'],
];

const PIRATE_LANDMARK_SPRITES = [
  ['pirate_enclave_stage_1', 'PirateEnclaveStage1V2Sprite'],
  ['pirate_enclave_stage_2', 'PirateEnclaveStage2V2Sprite'],
  ['pirate_enclave_stage_3', 'PirateEnclaveStage3V2Sprite'],
  ['pirate_enclave_stage_4', 'PirateEnclaveStage4V2Sprite'],
  ['pirate_enclave_stage_5', 'PirateEnclaveStage5V2Sprite'],
  ['pirate_flotilla_stage_2', 'PirateFlotillaStage2V2Sprite'],
  ['pirate_flotilla_stage_3', 'PirateFlotillaStage3V2Sprite'],
  ['pirate_flotilla_stage_4', 'PirateFlotillaStage4V2Sprite'],
  ['pirate_flotilla_stage_5', 'PirateFlotillaStage5V2Sprite'],
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

function writeNeutralSvgTs(outPath, html, header = '') {
  const lines = [
    `// Auto-generated by scripts/serialize-sprites.mjs — do not edit manually.`,
    `// Re-run: node scripts/serialize-sprites.mjs`,
  ];
  if (header) lines.push(`// ${header}`);
  lines.push(`export const svg: Record<string, string> = { pirates: ${JSON.stringify(html)} };`);
  writeFileSync(outPath, lines.join('\n') + '\n');
}

function writeIssue708PreviewData(byUnit) {
  const preview = readFileSync(ISSUE_708_PREVIEW_HTML, 'utf8');
  const start = preview.indexOf(ISSUE_708_DATA_START);
  const end = preview.indexOf(ISSUE_708_DATA_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Issue #708 preview data markers are missing or malformed.');
  }
  const payload = JSON.stringify(byUnit).replace(/</g, '\\u003c');
  const generated = [
    ISSUE_708_DATA_START,
    '<script id="issue-708-sprite-data">',
    '// Auto-generated by scripts/serialize-sprites.mjs — do not edit manually.',
    `globalThis.__ISSUE_708_SPRITES__ = ${payload};`,
    '</script>',
    ISSUE_708_DATA_END,
  ].join('\n');
  writeFileSync(ISSUE_708_PREVIEW_HTML, `${preview.slice(0, start)}${generated}${preview.slice(end + ISSUE_708_DATA_END.length)}`);
}

function writeIssue709PreviewData(byUnit) {
  const preview = readFileSync(ISSUE_709_PREVIEW_HTML, 'utf8');
  const start = preview.indexOf(ISSUE_709_DATA_START);
  const end = preview.indexOf(ISSUE_709_DATA_END);
  if (start === -1 || end === -1 || end < start) throw new Error('Issue #709 preview data markers are missing or malformed.');
  const payload = JSON.stringify(byUnit).replace(/</g, '\\u003c');
  const generated = [ISSUE_709_DATA_START, '<script id="issue-709-sprite-data">', '// Auto-generated by scripts/serialize-sprites.mjs — do not edit manually.', `globalThis.__ISSUE_709_SPRITES__ = ${payload};`, '</script>', ISSUE_709_DATA_END].join('\n');
  writeFileSync(ISSUE_709_PREVIEW_HTML, `${preview.slice(0, start)}${generated}${preview.slice(end + ISSUE_709_DATA_END.length)}`);
}

function writeIssue710PreviewData(byUnit) {
  const preview = readFileSync(ISSUE_710_PREVIEW_HTML, 'utf8');
  const start = preview.indexOf(ISSUE_710_DATA_START);
  const end = preview.indexOf(ISSUE_710_DATA_END);
  if (start === -1 || end === -1 || end < start) throw new Error('Issue #710 preview data markers are missing or malformed.');
  const payload = JSON.stringify(byUnit).replace(/</g, '\\u003c');
  const generated = [ISSUE_710_DATA_START, '<script id="issue-710-sprite-data">', '// Auto-generated by scripts/serialize-sprites.mjs — do not edit manually.', `globalThis.__ISSUE_710_SPRITES__ = ${payload};`, '</script>', ISSUE_710_DATA_END].join('\n');
  writeFileSync(ISSUE_710_PREVIEW_HTML, `${preview.slice(0, start)}${generated}${preview.slice(end + ISSUE_710_DATA_END.length)}`);
}

function writeIssue711PreviewData(byUnit) {
  const preview = readFileSync(ISSUE_711_PREVIEW_HTML, 'utf8');
  const start = preview.indexOf(ISSUE_711_DATA_START);
  const end = preview.indexOf(ISSUE_711_DATA_END);
  if (start === -1 || end === -1 || end < start) throw new Error('Issue #711 preview data markers are missing or malformed.');
  const payload = JSON.stringify(byUnit).replace(/</g, '\\u003c');
  const generated = [ISSUE_711_DATA_START, '<script id="issue-711-sprite-data">', '// Auto-generated by scripts/serialize-sprites.mjs — do not edit manually.', `globalThis.__ISSUE_711_SPRITES__ = ${payload};`, '</script>', ISSUE_711_DATA_END].join('\n');
  writeFileSync(ISSUE_711_PREVIEW_HTML, `${preview.slice(0, start)}${generated}${preview.slice(end + ISSUE_711_DATA_END.length)}`);
}

const issue708PreviewSprites = {};
const issue709PreviewSprites = {};
const issue710PreviewSprites = {};
const issue711PreviewSprites = {};

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
  if (id === 'beast_handler' || id === 'war_elephant' || id === 'cuirassier') {
    issue708PreviewSprites[id] = byFaction;
  }
  if (id === 'armored_car' || id === 'mechanized_infantry' || id === 'main_battle_tank') issue709PreviewSprites[id] = byFaction;
  if (id === 'paratrooper' || id === 'naval_strike_aircraft' || id === 'maritime_patrol_aircraft' || id === 'supercarrier' || id === 'great_general') issue710PreviewSprites[id] = byFaction;
  if (id === 'trebuchet' || id === 'rocket_artillery' || id === 'battleship' || id === 'missile_cruiser') issue711PreviewSprites[id] = byFaction;
  written++;
}

for (const [id, ComponentName] of PIRATE_UNIT_SPRITES) {
  const html = renderSprite(ComponentName, { state: 'idle', phase: 0 });
  if (!html) continue;
  writeNeutralSvgTs(resolve(OUT_DIR, `${id}.svg.ts`), html,
    `neutral pirate sprite; state driven at runtime via data-state attribute`);
  written++;
}

for (const [id, ComponentName] of PIRATE_LANDMARK_SPRITES) {
  const html = renderSprite(ComponentName, { state: 'idle', phase: 0 });
  if (!html) continue;
  writeNeutralSvgTs(resolve(OUT_DIR, `${id}.svg.ts`), html,
    `neutral pirate landmark; runtime attributes drive state, mode, damage, tier, and stage`);
  written++;
}

for (const [id, ComponentName] of BUILDING_SPRITES) {
  const byFaction = {};
  let ok = true;
  for (const faction of FACTIONS) {
    const html = renderSprite(ComponentName, { faction, state: 'idle', phase: 0 });
    if (!html) { ok = false; break; }
    byFaction[faction] = html;
  }
  if (!ok) continue;
  writeSvgTs(resolve(OUT_DIR, `${id}.svg.ts`), byFaction);
  written++;
}

writeIssue708PreviewData(issue708PreviewSprites);
writeIssue709PreviewData(issue709PreviewSprites);
writeIssue710PreviewData(issue710PreviewSprites);
writeIssue711PreviewData(issue711PreviewSprites);

console.log(`✓ Wrote ${written} sprite files to src/renderer/sprites/v2/`);
