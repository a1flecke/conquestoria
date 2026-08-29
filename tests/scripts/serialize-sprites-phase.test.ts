// @vitest-environment jsdom
//
// Regression for #766: the building V2 render loop in serialize-sprites.mjs
// must produce byte-identical, deterministic output across repeated runs.
// This loads the actual design/conquestoria-sprites/lib/*.jsx files through
// the same babel-transform + renderToStaticMarkup pipeline serialize-sprites.mjs
// uses (not a reimplementation), and renders the real exported V2 wrapper
// components — so it exercises the actual serializer contract, not just
// BuildingFrameV2 in isolation.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESIGN_LIB = resolve(__dirname, '../../design/conquestoria-sprites/lib');

function execJsx(filePath: string) {
  const src = readFileSync(filePath, 'utf8');
  const { code } = babel.transformSync(src, {
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    filename: filePath,
  });
  // eslint-disable-next-line no-new-func
  new Function('React', 'window', code)(React, window);
  for (const key of Object.keys(window as any)) {
    if (typeof (window as any)[key] === 'function') {
      try { (globalThis as any)[key] = (window as any)[key]; } catch { /* ignore */ }
    }
  }
}

function renderSprite(componentName: string, props: Record<string, unknown>): string {
  const Component = (window as any)[componentName];
  return renderToStaticMarkup(React.createElement(Component, props));
}

beforeAll(() => {
  (globalThis as any).window = window;
  (globalThis as any).document = document;
  (globalThis as any).React = React;
  (window as any).React = React;

  // Same load order as scripts/serialize-sprites.mjs — sprite-system.jsx
  // sets up window.SPRITE before others read it, v1 files before v2 wrappers.
  const LOAD_ORDER = [
    'sprite-system.jsx',
    'units.jsx',
    'buildings.jsx',
    'units-v2.jsx',
    'pirates-v2.jsx',
    'buildings-v2.jsx',
  ];
  for (const file of LOAD_ORDER) execJsx(resolve(DESIGN_LIB, file));
});

describe('building V2 sprite serialization determinism (#766)', () => {
  it('produces byte-identical output across repeated renders with the same explicit phase', () => {
    const first = renderSprite('GranaryV2Sprite', { faction: 'imperials', state: 'idle', phase: 0 });
    const second = renderSprite('GranaryV2Sprite', { faction: 'imperials', state: 'idle', phase: 0 });
    expect(first).toBe(second);
  });

  it('honors an explicit phase of 0 in the serialized output — the value the serializer script passes', () => {
    const html = renderSprite('GranaryV2Sprite', { faction: 'imperials', state: 'idle', phase: 0 });
    expect(html).toContain('--phase:0');
  });

  it('honors a non-zero explicit phase value, proving phase is a real prop and not hardcoded', () => {
    const html = renderSprite('GranaryV2Sprite', { faction: 'imperials', state: 'idle', phase: 0.42 });
    expect(html).toContain('--phase:0.42');
  });

  it('falls back to automatic per-mount phase when phase is left unspecified (live runtime behavior)', () => {
    const first = renderSprite('GranaryV2Sprite', { faction: 'imperials', state: 'idle' });
    const second = renderSprite('GranaryV2Sprite', { faction: 'imperials', state: 'idle' });
    // Both must carry *some* numeric --phase (auto-phase still wired up)...
    expect(first).toMatch(/--phase:\d/);
    expect(second).toMatch(/--phase:\d/);
    // ...but two independent auto-phase mounts should not collide, unlike the
    // explicit-phase case above. This is the behavior explicit phase must not
    // remove from the live (unserialized) render path.
    expect(first).not.toBe(second);
  });

  it('every building V2 wrapper forwards an explicit phase through to the serialized output', () => {
    // A representative sample across the file, not just the first wrapper —
    // guards against a wrapper that forgot to thread the new phase prop.
    const sampleComponents = [
      'GranaryV2Sprite', 'WallsV2Sprite', 'SecurityBureauV2Sprite',
      'DockV2Sprite', 'StockExchangeV2Sprite', 'SiegeWorkshopV2Sprite',
    ];
    for (const name of sampleComponents) {
      const html = renderSprite(name, { faction: 'imperials', state: 'idle', phase: 0 });
      expect(html, `${name} should honor explicit phase: 0`).toContain('--phase:0');
    }
  });
});
