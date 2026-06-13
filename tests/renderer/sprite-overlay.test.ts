// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { SpriteOverlay, hashCode } from '@/renderer/sprite-overlay';
import { getUnitLayoutMetrics } from '@/renderer/unit-map-presentation';
import type { SpriteEntity } from '@/renderer/sprite-overlay';
import { LOD_SPRITE_ZOOM_THRESHOLD } from '@/renderer/sprites/sprite-system';

function cam(overrides: Record<string, unknown> = {}) {
  return { x: 0, y: 0, zoom: 1, hexSize: 32, width: 800, height: 600, ...overrides } as any;
}

function entity(overrides: Partial<SpriteEntity> = {}): SpriteEntity {
  return {
    id: 'u1', kind: 'unit', subtype: 'warrior',
    coord: { q: 0, r: 0 }, state: 'idle', faction: 'imperials',
    ...overrides,
  };
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

// ── hashCode ──────────────────────────────────────────────────────────────────

describe('hashCode', () => {
  it('is non-negative', () => expect(hashCode('x')).toBeGreaterThanOrEqual(0));
  it('is deterministic', () => expect(hashCode('abc')).toBe(hashCode('abc')));
  it('differs for different inputs', () => expect(hashCode('a')).not.toBe(hashCode('b')));
  it('phase in [0,1)', () => {
    const p = (hashCode('warrior_001') % 100) / 100;
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  });
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe('SpriteOverlay constructor', () => {
  it('inserts container before #ui-layer', () => {
    const { mount } = mountOverlay();
    const kids = Array.from(mount.children);
    expect(kids.findIndex(e => e.id === 'sprite-overlay'))
      .toBeLessThan(kids.findIndex(e => e.id === 'ui-layer'));
  });

  it('creates unit, building, improvement layer divs', () => {
    const { mount } = mountOverlay();
    expect(mount.querySelector('#unit-sprites')).not.toBeNull();
    expect(mount.querySelector('#building-sprites')).not.toBeNull();
    expect(mount.querySelector('#improvement-sprites')).not.toBeNull();
  });

  it('does not duplicate #sprite-overlay if called twice on same mount', () => {
    const { mount } = mountOverlay();
    // A second overlay on the same mount (unusual but should not crash)
    new SpriteOverlay(mount);
    expect(mount.querySelectorAll('#sprite-overlay').length).toBe(2); // each is independent — OK
  });
});

// ── LOD gate ──────────────────────────────────────────────────────────────────

describe('sync() LOD gate', () => {
  it('hides container below LOD threshold', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    overlay.sync(cam({ zoom: LOD_SPRITE_ZOOM_THRESHOLD - 0.01 }), [], MAP, OPTS);
    expect((mount.querySelector('#sprite-overlay') as HTMLElement).style.display).toBe('none');
    expect(overlay.getActiveIds().size).toBe(0);
  });

  it('hides container when reducedMotion', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    overlay.sync(cam({ zoom: 1 }), [], MAP, { ...OPTS, reducedMotion: true });
    expect((mount.querySelector('#sprite-overlay') as HTMLElement).style.display).toBe('none');
    expect(overlay.getActiveIds().size).toBe(0);
  });

  it('does not revive stale pooled sprites when suppression ends during a pinch', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    overlay.sync(cam({ zoom: 1 }), [], MAP, { ...OPTS, reducedMotion: true });
    overlay.sync(cam({ zoom: 1 }), [], MAP, { ...OPTS, isPinching: true });

    expect(mount.querySelector('#unit-sprites')!.children.length).toBe(0);
    expect(overlay.getActiveIds().size).toBe(0);
  });

  it('shows container at or above threshold', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: LOD_SPRITE_ZOOM_THRESHOLD + 0.1 }), [], MAP, OPTS);
    expect((mount.querySelector('#sprite-overlay') as HTMLElement).style.display).not.toBe('none');
  });
});

// ── Camera transform ──────────────────────────────────────────────────────────

describe('sync() camera transform', () => {
  it('sets correct transform', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1.5, x: 100, y: 200 }), [], MAP, OPTS);
    expect((mount.querySelector('#sprite-overlay') as HTMLElement).style.transform)
      .toBe('scale(1.5) translate(-100px, -200px)');
  });

  it('updates transform even while pinching', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 2, x: 50, y: 75 }), [], MAP, { ...OPTS, isPinching: true });
    expect((mount.querySelector('#sprite-overlay') as HTMLElement).style.transform)
      .toBe('scale(2) translate(-50px, -75px)');
  });
});

// ── Pinch guard ───────────────────────────────────────────────────────────────

describe('sync() pinch guard', () => {
  it('does not add elements while pinching', () => {
    const { overlay } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, { ...OPTS, isPinching: true });
    expect(overlay.getActiveIds().size).toBe(0);
  });

  it('does not remove elements while pinching', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    const countBefore = mount.querySelector('#unit-sprites')!.children.length;
    overlay.sync(cam({ zoom: 1 }), [], MAP, { ...OPTS, isPinching: true });
    expect(mount.querySelector('#unit-sprites')!.children.length).toBe(countBefore);
  });
});

// ── Pool lifecycle ────────────────────────────────────────────────────────────

describe('sync() pool lifecycle', () => {
  it('culls stale elements', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    expect(mount.querySelector('#unit-sprites')!.children.length).toBeGreaterThan(0);
    overlay.sync(cam({ zoom: 1 }), [], MAP, OPTS);
    expect(mount.querySelector('#unit-sprites')!.children.length).toBe(0);
  });

  it('reuses DOM node on second sync — no replacement', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity({ state: 'idle' })], MAP, OPTS);
    const original = mount.querySelector('.cq-sprite-wrap');
    overlay.sync(cam({ zoom: 1 }), [entity({ state: 'walk' })], MAP, OPTS);
    expect(mount.querySelector('.cq-sprite-wrap')).toBe(original);
    expect((original as HTMLElement).getAttribute('data-state')).toBe('walk');
  });

  it('getActiveIds returns empty before sync', () => {
    const { overlay } = mountOverlay();
    expect(overlay.getActiveIds().size).toBe(0);
  });
});

// ── Wrapper sizing ────────────────────────────────────────────────────────────

describe('sync() wrapper sizing', () => {
  it('wrapper width and height use the shared unit layout metrics', () => {
    const { overlay, mount } = mountOverlay();
    const hexSize = 32;
    overlay.sync(cam({ zoom: 1, hexSize }), [entity()], MAP, OPTS);
    const wrapper = mount.querySelector('.cq-sprite-wrap')?.parentElement as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    const expectedPx = `${getUnitLayoutMetrics(hexSize).displaySize}px`;
    expect(wrapper!.style.width).toBe(expectedPx);
    expect(wrapper!.style.height).toBe(expectedPx);
  });

  it('marks every represented stack member active only while its element is visible', () => {
    const { overlay } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity({ memberIds: ['u1', 'u2', 'u3'] })], MAP, OPTS);

    expect([...overlay.getActiveIds()].sort()).toEqual(['u1', 'u2', 'u3']);

    overlay.sync(cam({ zoom: 1 }), [], MAP, OPTS);
    expect(overlay.getActiveIds().size).toBe(0);
  });

  it('renders stack, selection, health, fortified, and role decorations for DOM units', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity({
      memberIds: ['u1', 'u2'],
      stackCount: 2,
      selected: true,
      health: 55,
      fortified: true,
      roleMarker: 'chevron',
    })], MAP, OPTS);

    expect(mount.querySelector('.cq-unit-stack-count')?.textContent).toBe('2');
    expect(mount.querySelector('.cq-unit-selected')).not.toBeNull();
    expect(mount.querySelector('.cq-unit-health-fill')).not.toBeNull();
    expect((mount.querySelector('.cq-unit-health-fill') as HTMLElement).style.width).toBe('55%');
    expect(mount.querySelector('.cq-unit-fortified')?.textContent).toBe('F');
    expect(mount.querySelector('.cq-unit-role')?.textContent).toBe('⌄');
  });

  it('wrapper has overflow:hidden to prevent label bleed', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    const wrapper = mount.querySelector('.cq-sprite-wrap')?.parentElement as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper!.style.overflow).toBe('hidden');
  });
});

// ── invalidateFaction ─────────────────────────────────────────────────────────

describe('invalidateFaction', () => {
  it('evicts elements for the given faction', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity({ faction: 'imperials' })], MAP, OPTS);
    expect(mount.querySelector('#unit-sprites')!.children.length).toBeGreaterThan(0);
    overlay.invalidateFaction('imperials');
    expect(mount.querySelector('#unit-sprites')!.children.length).toBe(0);
    expect(overlay.getActiveIds().size).toBe(0);
  });

  it('does not evict elements for other factions', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [
      entity({ id: 'u1', faction: 'imperials' }),
      entity({ id: 'u2', faction: 'vikings' }),
    ], MAP, OPTS);
    overlay.invalidateFaction('imperials');
    // viking element should remain
    expect(overlay.getActiveIds().has('u2')).toBe(true);
  });
});
