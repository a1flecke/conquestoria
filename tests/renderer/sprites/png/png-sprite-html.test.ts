import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildPngUnitSpriteHtml,
  getPngSpriteCssVars,
  resolvePngTint,
} from '@/renderer/sprites/png/png-sprite-html';
import { getPngUnitManifest } from '@/renderer/sprites/png/png-sprite-catalog';
import { getPngCanvasFrame } from '@/renderer/sprites/png/png-sprite-canvas';
import { getUnitSpriteV2, isV2NativeUnit } from '@/renderer/sprites/v2/index';
import { FACTION_SPRITE_ACCENT, NEUTRAL_PNG_TINT } from '@/renderer/sprites/faction-accent-colors';

const horseman = getPngUnitManifest('horseman')!;
const css = readFileSync(resolve(__dirname, '../../../../src/assets/png-sprite-animations.css'), 'utf8');

describe('resolvePngTint', () => {
  it('prefers the owner colour', () => {
    expect(resolvePngTint('#2d6a4f', 'imperials')).toBe('#2d6a4f');
  });

  it('falls back to the faction accent, then to a neutral tint', () => {
    expect(resolvePngTint('', 'vikings')).toBe(FACTION_SPRITE_ACCENT.vikings);
    expect(resolvePngTint('', 'some-minor-civ-id')).toBe(NEUTRAL_PNG_TINT);
  });

  it('never lets a non-hex string reach a style attribute', () => {
    for (const hostile of ['red', '#fff;background:url(//evil)', 'url(x)', '#12', '#zzzzzz', '"><script>']) {
      expect(resolvePngTint(hostile, 'imperials'), hostile).toBe(FACTION_SPRITE_ACCENT.imperials);
    }
  });
});

describe('getPngSpriteCssVars', () => {
  it('maps each state to its row, last-frame offset, step count and loop time', () => {
    const v = getPngSpriteCssVars(horseman);
    const { cols, rows, states } = horseman;
    expect(v['--cols']).toBe(String(cols));
    expect(v['--rows']).toBe(String(rows));
    // frame k of an N-column sheet sits at k / (N - 1) of the background-position range
    expect(parseFloat(v['--walk-end'])).toBeCloseTo(((states.walk.frames - 1) / (cols - 1)) * 100, 3);
    expect(parseFloat(v['--idle-end'])).toBeCloseTo(((states.idle.frames - 1) / (cols - 1)) * 100, 3);
    expect(parseFloat(v['--attack-y'])).toBeCloseTo((states.attack.row / (rows - 1)) * 100, 3);
    expect(v['--walk-steps']).toBe(String(states.walk.frames));
    expect(parseFloat(v['--walk-dur'])).toBeCloseTo(states.walk.frames / states.walk.fps, 2);
  });

  it('handles a single-row, single-column sheet without dividing by zero', () => {
    const v = getPngSpriteCssVars({
      ...horseman, cols: 1, rows: 1,
      states: { idle: { row: 0, frames: 2, fps: 4 }, walk: { row: 0, frames: 2, fps: 4 }, attack: { row: 0, frames: 2, fps: 4 } },
    });
    expect(v['--idle-y']).toBe('0%');
    expect(v['--idle-end']).toBe('0%');
  });
});

describe('buildPngUnitSpriteHtml', () => {
  const html = buildPngUnitSpriteHtml(horseman, '#1d4a8c');

  it('keeps the overlay contract of the SVG sprites: a .cq-sprite-wrap root with data-state and --phase', () => {
    expect(html.startsWith('<div class="cq-sprite-wrap cq-png"')).toBe(true);
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('--phase:0');
    expect(html).toContain('data-sprite-kind="png"');
  });

  it('draws the base sheet and the tint layer from the manifest paths, tinted with the given colour', () => {
    expect(html).toContain('--cq-tint:#1d4a8c');
    expect(html).toContain(horseman.sheet);
    expect(html).toContain(horseman.mask);
    expect(html).toContain('cq-png-base');
    expect(html).toContain('cq-png-tint');
  });

  it('defines every custom property the stylesheet reads', () => {
    const used = new Set([...css.matchAll(/var\((--[a-z-]+)/g)].map(m => m[1]));
    // properties the stylesheet sets itself, or the overlay provides
    const own = new Set(['--row', '--end', '--steps', '--dur', '--phase']);
    for (const name of used) {
      if (own.has(name)) continue;
      expect(html, `${name} is read by png-sprite-animations.css but never set by the HTML builder`).toContain(`${name}:`);
    }
  });
});

describe('png-sprite-animations.css', () => {
  it('has a row per animated state, the shared keyframes, and a reduced-motion stop', () => {
    for (const state of ['walk', 'attack']) expect(css).toContain(`.cq-png[data-state="${state}"]`);
    expect(css).toContain('@keyframes cq-png-play');
    expect(css).toMatch(/steps\(var\(--steps\), jump-none\)/);
    expect(css).toMatch(/data-reduced-motion="true"\] \.cq-png-layer\s*\{\s*animation: none !important/);
  });

  it('tints with a mask and a multiply blend confined to the sprite', () => {
    expect(css).toMatch(/\.cq-png-tint\s*\{[^}]*mix-blend-mode: multiply/);
    expect(css).toMatch(/isolation: isolate/);
    expect(css).toContain('-webkit-mask-repeat'); // vendor-prefixed mask support kept for WebKit
  });
});

describe('getPngCanvasFrame', () => {
  it('maps the three static motions onto sheet frames inside their rows', () => {
    expect(getPngCanvasFrame(horseman, 'idle')).toEqual({ state: 'idle', frame: 0 });
    const a = getPngCanvasFrame(horseman, 'move-a');
    const b = getPngCanvasFrame(horseman, 'move-b');
    expect(a.state).toBe('walk');
    expect(b.state).toBe('walk');
    expect(a.frame).not.toBe(b.frame); // the map alternates two distinct walk poses
    expect(Math.max(a.frame, b.frame)).toBeLessThan(horseman.states.walk.frames);
  });
});

describe('getUnitSpriteV2 dispatch (both renderers coexist)', () => {
  it('serves the PNG player for a registered unit, for any faction and for owners with no faction record', () => {
    for (const faction of ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate', 'some-minor-civ-id']) {
      const out = getUnitSpriteV2('horseman', faction)!;
      expect(out, faction).toContain('cq-png');
      expect(out, faction).not.toContain('<svg');
    }
  });

  it('tints with the owner colour when one is supplied', () => {
    expect(getUnitSpriteV2('horseman', 'imperials', '#2d6a4f')).toContain('--cq-tint:#2d6a4f');
    expect(getUnitSpriteV2('horseman', 'khanate')).toContain(`--cq-tint:${FACTION_SPRITE_ACCENT.khanate}`);
  });

  it('leaves every other unit on its SVG sprite', () => {
    for (const type of ['beast_handler', 'cuirassier', 'knight', 'warrior', 'archer']) {
      const out = getUnitSpriteV2(type, 'imperials')!;
      expect(out, type).toContain('<svg');
      expect(out, type).not.toContain('cq-png');
    }
    expect(isV2NativeUnit('beast_handler')).toBe(true);
  });
});
