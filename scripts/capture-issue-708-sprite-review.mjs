#!/usr/bin/env node
/**
 * Generate static, Markdown-embeddable anatomy sheets from the committed #708
 * native SVG output. The interactive preview remains the timing review surface;
 * these sheets intentionally capture the shared zero-phase silhouette at 40, 64,
 * and 128 pixels so a reviewer can judge readability without a running server.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(scriptDir, '..');
const previewPath = resolve(repoRoot, 'docs/reviews/assets/issue-708/sprite-preview.html');
const outputDir = resolve(repoRoot, 'docs/reviews/assets/issue-708');
const states = ['idle', 'walk', 'attack', 'hurt', 'death'];
const sizes = [40, 64, 128];
const units = [
  ['beast_handler', 'Beast Handler', 'beast-handler-state-sheet.png'],
  ['war_elephant', 'War Elephant', 'war-elephant-state-sheet.png'],
  ['cuirassier', 'Cuirassier', 'cuirassier-state-sheet.png'],
];

function loadGeneratedSprites() {
  const preview = readFileSync(previewPath, 'utf8');
  const payload = /globalThis\.__ISSUE_708_SPRITES__ = (\{[\s\S]*?\});\n<\/script>/.exec(preview);
  if (!payload) throw new Error('The #708 generated preview payload is missing or malformed. Re-run serialize-sprites.mjs first.');
  return JSON.parse(payload[1]);
}

function extractSvgContent(html) {
  const match = /<svg\b[^>]*>([\s\S]*)<\/svg>/.exec(html);
  if (!match) throw new Error('Generated native sprite output did not contain an SVG.');
  return match[1];
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function sheetSvg(unitName, spriteContent) {
  const columnWidth = 180;
  const rowTops = [118, 198, 302];
  const svgCells = [];
  for (const [row, size] of sizes.entries()) {
    svgCells.push(`<text x="60" y="${rowTops[row] + size / 2 + 5}" class="size">${size}px</text>`);
    for (const [column, state] of states.entries()) {
      const x = 86 + column * columnWidth;
      const y = rowTops[row];
      svgCells.push(`<rect x="${x - 12}" y="${y - 16}" width="${size + 24}" height="${size + 30}" rx="8" class="cell"/>`);
      if (row === 0) svgCells.push(`<text x="${x + size / 2}" y="96" text-anchor="middle" class="state">${state}</text>`);
      svgCells.push(`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 128 128" data-state="${state}">${spriteContent}</svg>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="470" viewBox="0 0 1000 470">
  <style>
    .title { fill: #211b15; font: 700 26px sans-serif; }
    .note { fill: #5e3f24; font: 15px sans-serif; }
    .state { fill: #211b15; font: 700 14px sans-serif; }
    .size { fill: #5e3f24; font: 700 14px sans-serif; text-anchor: end; }
    .cell { fill: #fff9ec; stroke: #d5c39f; stroke-width: 1; }
  </style>
  <rect width="1000" height="470" fill="#f4ead5"/>
  <text x="24" y="38" class="title">${escapeXml(unitName)} — native SVG anatomy review</text>
  <text x="24" y="64" class="note">Generated from the committed Imperials payload. State labels show the zero-phase visual; inspect the interactive preview for movement timing.</text>
  ${svgCells.join('\n  ')}
</svg>`;
}

function writePng(svg, outputPath) {
  const tempDir = mkdtempSync(join(tmpdir(), 'conquestoria-issue-708-'));
  const tempSvgPath = join(tempDir, `${basename(outputPath, '.png')}.svg`);
  try {
    writeFileSync(tempSvgPath, svg);
    execFileSync(process.env.RSVG_CONVERT ?? 'rsvg-convert', ['--format', 'png', '--output', outputPath, tempSvgPath], { stdio: 'inherit' });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const generated = loadGeneratedSprites();
mkdirSync(outputDir, { recursive: true });
for (const [unitId, unitName, filename] of units) {
  const factionSprite = generated[unitId]?.imperials;
  if (!factionSprite) throw new Error(`Missing Imperials generated output for ${unitId}. Re-run serialize-sprites.mjs first.`);
  writePng(sheetSvg(unitName, extractSvgContent(factionSprite)), join(outputDir, filename));
  console.log(`✓ Wrote ${filename}`);
}
