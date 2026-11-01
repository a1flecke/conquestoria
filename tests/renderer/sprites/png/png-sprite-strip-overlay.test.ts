// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PngClip, PngTierClips, PngUnitSprite } from '@/renderer/sprites/png/png-sprite-types';

const clip = (over: Partial<PngClip> = {}): PngClip => ({ row: 0, firstCol: 0, frames: 4, fps: 4, loop: true, ...over });

/** A strip-shaped sprite: wide cells, one damage pose per tier in row 0, looping walk, one-shot attack. */
const STRIP: PngUnitSprite = {
  id: 'stripunit', cellWidth: 240, cellHeight: 192, cols: 8, rows: 4, baseline: 176,
  clips: {
    idle: [0, 1, 2, 3].map(t => clip({ row: 0, firstCol: t, frames: 1 })) as unknown as PngTierClips,
    walk: [0, 1, 2, 3].map(() => clip({ row: 1, frames: 8, fps: 10 })) as unknown as PngTierClips,
    attack: [0, 1, 2, 3].map(() => clip({ row: 2, frames: 6, fps: 9, loop: false })) as unknown as PngTierClips,
  },
  sheet: 'images/units/stripunit/sheet.png', mask: 'images/units/stripunit/mask.png', facing: 'right',
};

// A catalog with one extra strip unit; everything else is the real catalog.
vi.mock('@/renderer/sprites/png/png-sprite-catalog', async importOriginal => {
  const real = await importOriginal<typeof import('@/renderer/sprites/png/png-sprite-catalog')>();
  return { ...real, getPngUnitManifest: (type: string) => (type === 'stripunit' ? STRIP : real.getPngUnitManifest(type)) };
});

const { SpriteOverlay } = await import('@/renderer/sprite-overlay');
type SpriteEntity = import('@/renderer/sprite-overlay').SpriteEntity;

function cam() {
  return { x: 0, y: 0, zoom: 2, hexSize: 32, width: 800, height: 600 } as any;
}

function entity(overrides: Partial<SpriteEntity> = {}): SpriteEntity {
  return { id: 'u1', kind: 'unit', subtype: 'stripunit', coord: { q: 0, r: 0 }, state: 'idle', faction: 'imperials', ...overrides };
}

function mountOverlay() {
  const mount = document.createElement('div');
  const ui = document.createElement('div');
  ui.id = 'ui-layer';
  mount.appendChild(ui);
  document.body.appendChild(mount);
  return { overlay: new SpriteOverlay(mount), mount };
}

const MAP = { width: 20, wrapsHorizontally: false };
const OPTS = { isPinching: false, reducedMotion: false };
const root = (mount: HTMLElement) => mount.querySelector('.cq-png') as HTMLElement;

afterEach(() => { document.body.innerHTML = ''; });

describe('SpriteOverlay with a strip unit', () => {
  it('shows the damage pose of the unit\'s tier while idle, as a still frame', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity({ damage: 2 })], MAP, OPTS);
    const el = root(mount);
    expect(el.style.getPropertyValue('--from')).toBe('28.5714%'); // column 2 of 8
    expect(el.getAttribute('data-png-static')).toBe('true');
  });

  it('follows a change of damage tier on the same element', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity({ damage: 0 })], MAP, OPTS);
    const el = root(mount);
    overlay.sync(cam(), [entity({ damage: 3 })], MAP, OPTS);
    expect(root(mount)).toBe(el);
    expect(el.style.getPropertyValue('--from')).toBe('42.8571%'); // column 3
  });

  it('plays an attack once, and replays it when a new attack begins inside the first one\'s hold', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity({ state: 'attack', stateEpoch: 1000 })], MAP, OPTS);
    const el = root(mount);
    expect(el.style.getPropertyValue('--iter')).toBe('1');
    expect(el.getAttribute('data-png-loop')).toBe('false');
    const first = el.getAttribute('data-png-epoch');

    overlay.sync(cam(), [entity({ state: 'attack', stateEpoch: 2000 })], MAP, OPTS);
    const second = el.getAttribute('data-png-epoch');
    expect(second).not.toBe(first);

    overlay.sync(cam(), [entity({ state: 'attack', stateEpoch: 2000 })], MAP, OPTS);
    expect(el.getAttribute('data-png-epoch')).toBe(second);
  });

  it('does not restart a loop on a sync that changed nothing', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity({ state: 'walk' })], MAP, OPTS);
    const el = root(mount);
    const epoch = el.getAttribute('data-png-epoch');
    expect(el.style.getPropertyValue('--iter')).toBe('infinite');
    overlay.sync(cam(), [entity({ state: 'walk' })], MAP, OPTS);
    overlay.sync(cam(), [entity({ state: 'walk' })], MAP, OPTS);
    expect(el.getAttribute('data-png-epoch')).toBe(epoch);
  });

  it('stands in with the idle pose and a filter for a state it has no art for', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity({ state: 'hurt', damage: 1 })], MAP, OPTS);
    const el = root(mount);
    expect(el.getAttribute('data-png-fallback')).toBe('hurt');
    expect(el.style.getPropertyValue('--from')).toBe('14.2857%'); // idle, tier 1
    overlay.sync(cam(), [entity({ state: 'idle', damage: 1 })], MAP, OPTS);
    expect(el.hasAttribute('data-png-fallback')).toBe(false);
  });

  it('lets a strip cell draw outside the unit box, and keeps a puppet unit clipped', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity(), entity({ id: 'u2', subtype: 'cavalry', coord: { q: 1, r: 0 } })], MAP, OPTS);
    const wrappers = mount.querySelectorAll('#unit-sprites > div');
    expect((wrappers[0] as HTMLElement).style.overflow).toBe('visible');
    expect((wrappers[1] as HTMLElement).style.overflow).toBe('hidden');
  });

  it('draws a strip unit\'s selection ring past its box, and keeps the ring of a puppet unit inside it', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [
      entity({ selected: true }),
      entity({ id: 'u2', subtype: 'cavalry', coord: { q: 1, r: 0 }, selected: true }),
    ], MAP, OPTS);
    const rings = mount.querySelectorAll<HTMLElement>('.cq-unit-selected');
    expect(rings[0].style.inset).toBe('-22%');
    expect(rings[1].style.inset).toBe('4%');
  });

  it('places the strip cell inside the box from its layout', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity()], MAP, OPTS);
    const el = root(mount);
    expect(el.style.getPropertyValue('--cell-width')).toBe('125%');
    expect(el.style.getPropertyValue('--cell-left')).toBe('-12.5%');
    expect(el.style.getPropertyValue('--cell-top')).toBe('-11.6667%');
  });

  it('hands odd damage values to the tier clamp rather than a missing clip', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity({ damage: Number.NaN })], MAP, OPTS);
    expect(root(mount).style.getPropertyValue('--from')).toBe('0%');
    overlay.sync(cam(), [entity({ damage: 99 })], MAP, OPTS);
    expect(root(mount).style.getPropertyValue('--from')).toBe('42.8571%');
  });
});
