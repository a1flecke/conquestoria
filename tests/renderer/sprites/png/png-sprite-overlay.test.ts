// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { SpriteOverlay, type SpriteEntity } from '@/renderer/sprite-overlay';

function cam(overrides: Record<string, unknown> = {}) {
  return { x: 0, y: 0, zoom: 2, hexSize: 32, width: 800, height: 600, ...overrides } as any;
}

function entity(overrides: Partial<SpriteEntity> = {}): SpriteEntity {
  return { id: 'u1', kind: 'unit', subtype: 'horseman', coord: { q: 0, r: 0 }, state: 'idle', faction: 'imperials', ...overrides };
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

afterEach(() => { document.body.innerHTML = ''; });

describe('SpriteOverlay with a PNG unit', () => {
  it('mounts the PNG player in the unit layer through the same path as an SVG sprite', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity(), entity({ id: 'u2', subtype: 'beast_handler', coord: { q: 1, r: 0 } })], MAP, OPTS);

    const sprites = mount.querySelectorAll('#unit-sprites > div');
    expect(sprites).toHaveLength(2);
    expect(sprites[0].querySelector('.cq-png')).not.toBeNull();
    expect(sprites[0].querySelector('svg')).toBeNull();
    // an SVG unit next to it is untouched
    expect(sprites[1].querySelector('.cq-png')).toBeNull();
    expect(sprites[1].querySelector('svg')).not.toBeNull();
    expect(overlay.getActiveIds().has('u1')).toBe(true);
  });

  it('drives the animation state and phase through data-state / --phase like the SVG sprites', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity()], MAP, OPTS);
    const el = mount.querySelector('.cq-png') as HTMLElement;
    expect(el.getAttribute('data-state')).toBe('idle');
    expect(el.style.getPropertyValue('--phase')).not.toBe('');

    overlay.sync(cam(), [entity({ state: 'walk' })], MAP, OPTS);
    expect(mount.querySelector('.cq-png')).toBe(el); // pool hit: same node, no rebuild
    expect(el.getAttribute('data-state')).toBe('walk');

    overlay.sync(cam(), [entity({ state: 'attack' })], MAP, OPTS);
    expect(el.getAttribute('data-state')).toBe('attack');
  });

  it('tints with the owner colour and rebuilds when the colour changes', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity({ civId: 'c1' })], MAP, OPTS, { c1: '#2d6a4f' });
    expect((mount.querySelector('.cq-png') as HTMLElement).style.getPropertyValue('--cq-tint')).toBe('#2d6a4f');

    overlay.sync(cam(), [entity({ civId: 'c1' })], MAP, OPTS, { c1: '#aa3377' });
    expect((mount.querySelector('.cq-png') as HTMLElement).style.getPropertyValue('--cq-tint')).toBe('#aa3377');
  });

  it('keeps the selection ring, stack badge and health bar working on a PNG unit', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam(), [entity({ selected: true, stackCount: 2, health: 60 })], MAP, OPTS);
    const wrapper = mount.querySelector('#unit-sprites > div') as HTMLElement;
    expect(wrapper.querySelector('.cq-unit-selected')).not.toBeNull();
    expect(wrapper.querySelector('.cq-unit-stack-count')).not.toBeNull();
    expect(wrapper.querySelector('.cq-unit-health')).not.toBeNull();
  });

  it('is hidden below the LOD zoom like every sprite (the Canvas layer takes over)', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 0.1 }), [entity()], MAP, OPTS);
    expect(mount.querySelectorAll('.cq-png')).toHaveLength(0);
  });
});
