// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { SpriteOverlay, hashCode, applyFactionCivColor } from '@/renderer/sprite-overlay';
import * as SpriteIndex from '@/renderer/sprites/v2/index';
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

  it('creates unit, building, improvement, and landmark layer divs', () => {
    const { mount } = mountOverlay();
    expect(mount.querySelector('#unit-sprites')).not.toBeNull();
    expect(mount.querySelector('#building-sprites')).not.toBeNull();
    expect(mount.querySelector('#improvement-sprites')).not.toBeNull();
    expect(mount.querySelector('#landmark-sprites')).not.toBeNull();
  });

  it('renders landmark entities in their dedicated layer without disturbing unit entities', () => {
    const { overlay, mount } = mountOverlay();
    const landmark = entity({
      id: 'hq-1', kind: 'landmark' as any, subtype: 'pirate_enclave_stage_3', faction: 'pirates',
      stage: 3, tier: 2, mode: 'raid', damage: 2,
    } as any);
    overlay.sync(cam({ zoom: 1 }), [entity(), landmark], MAP, OPTS);

    expect(mount.querySelector('#unit-sprites > [data-entity-id="u1"]')).not.toBeNull();
    const hq = mount.querySelector('#landmark-sprites > [data-entity-id="hq-1"]') as HTMLElement | null;
    expect(hq).not.toBeNull();
    expect(hq?.querySelector('.cq-sprite-wrap')?.getAttribute('data-damage')).toBe('2');
    expect(hq?.querySelector('.cq-sprite-wrap')?.getAttribute('data-mode')).toBe('raid');
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

  it('keeps static sprites and information layers visible when reducedMotion', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity({ damage: 2, selected: true })], MAP, { ...OPTS, reducedMotion: true });
    const container = mount.querySelector('#sprite-overlay') as HTMLElement;
    expect(container.style.display).not.toBe('none');
    expect(container.dataset.reducedMotion).toBe('true');
    expect(container.querySelector('[data-damage="2"]')).not.toBeNull();
    expect(container.querySelector('.cq-unit-selected')).not.toBeNull();
    expect(overlay.getActiveIds()).toEqual(new Set(['u1']));
  });

  it('does not revive stale pooled sprites when suppression ends during a pinch', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    overlay.sync(cam({ zoom: LOD_SPRITE_ZOOM_THRESHOLD - 0.01 }), [], MAP, OPTS);
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

  it('updates landmark state, mode, damage, tier, and stage without replacing its DOM node', () => {
    const { overlay, mount } = mountOverlay();
    const first = entity({
      id: 'hq-1', kind: 'landmark', subtype: 'pirate_enclave_stage_3', faction: 'pirates',
      state: 'idle', mode: 'patrol', damage: 0, tier: 1, stage: 3,
    });
    overlay.sync(cam(), [first], MAP, OPTS);
    const original = mount.querySelector('#landmark-sprites .cq-sprite-wrap') as HTMLElement;

    overlay.sync(cam(), [{ ...first, state: 'hurt', mode: 'blockade', damage: 3, tier: 3, stage: 5 }], MAP, OPTS);

    const updated = mount.querySelector('#landmark-sprites .cq-sprite-wrap') as HTMLElement;
    expect(updated).toBe(original);
    expect(updated.dataset).toMatchObject({
      state: 'hurt', mode: 'blockade', damage: '3', tier: '3', stage: '5',
    });
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

  it('positions and updates co-located owner groups using their shared anchor offset', () => {
    const { overlay, mount } = mountOverlay();
    const camera = cam({ zoom: 1, hexSize: 32 });
    overlay.sync(camera, [entity({ anchorOffsetFactor: { x: -0.2, y: 0.08 } })], MAP, OPTS);
    const wrapper = mount.querySelector('#unit-sprites > [data-entity-id="u1"]') as HTMLElement;
    const originalLeft = wrapper.style.left;
    const originalTop = wrapper.style.top;

    overlay.sync(camera, [entity({ anchorOffsetFactor: { x: 0.2, y: -0.08 } })], MAP, OPTS);

    expect(wrapper.style.left).not.toBe(originalLeft);
    expect(wrapper.style.top).not.toBe(originalTop);
  });

  it('marks every represented stack member active only while its element is visible', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity({ memberIds: ['u1', 'u2', 'u3'] })], MAP, OPTS);

    expect([...overlay.getActiveIds()].sort()).toEqual(['u1', 'u2', 'u3']);
    const wrapper = mount.querySelector('#unit-sprites > [data-entity-id="u1"]') as HTMLElement | null;
    expect(wrapper?.dataset.memberIds).toBe('u1,u2,u3');

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

    const pill = mount.querySelector('.cq-unit-stack-count') as HTMLElement | null;
    expect(pill).not.toBeNull();
    const spans = pill!.querySelectorAll('span');
    expect(spans.length).toBe(2);
    expect(spans[0].textContent).toBe('🪖️');
    expect(spans[1].textContent).toBe('×2');
    expect(mount.querySelector('.cq-unit-selected')).not.toBeNull();
    expect(mount.querySelector('.cq-unit-health-fill')).not.toBeNull();
    expect((mount.querySelector('.cq-unit-health-fill') as HTMLElement).style.width).toBe('55%');
    expect(mount.querySelector('.cq-unit-fortified')?.textContent).toBe('🛡️');
    expect(mount.querySelector('.cq-unit-role')?.textContent).toBe('⌄');
  });

  it('pill children are replaced cleanly on re-render, not accumulated', () => {
    const { overlay, mount } = mountOverlay();
    const e = entity({ stackCount: 2, memberIds: ['u1', 'u2'] });
    overlay.sync(cam({ zoom: 1 }), [e], MAP, OPTS);
    overlay.sync(cam({ zoom: 1 }), [e], MAP, OPTS);
    const pill = mount.querySelector('.cq-unit-stack-count') as HTMLElement | null;
    expect(pill?.querySelectorAll('span').length).toBe(2); // not 4 — replaceChildren, not appendChild
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

// ── applyFactionCivColor — pure function tests ────────────────────────────────

describe('applyFactionCivColor', () => {
  it('replaces all occurrences of the faction accent color with the civ game color', () => {
    const svg = `<div><rect fill="#b53026"/><path stroke="#b53026"/></div>`;
    const result = applyFactionCivColor(svg, 'imperials', '#2d6a4f');
    expect(result).not.toContain('#b53026');
    expect(result.match(/#2d6a4f/g)?.length).toBe(2);
  });

  it('returns the original string when faction has no entry in FACTION_SPRITE_ACCENT', () => {
    const svg = `<div><rect fill="#b53026"/></div>`;
    expect(applyFactionCivColor(svg, 'unknown-faction', '#2d6a4f')).toBe(svg);
  });

  it('returns the original string when civColor is empty', () => {
    const svg = `<div><rect fill="#b53026"/></div>`;
    expect(applyFactionCivColor(svg, 'imperials', '')).toBe(svg);
  });

  it('returns the original string when civColor equals faction accent (no-op)', () => {
    const svg = `<div><rect fill="#b53026"/></div>`;
    expect(applyFactionCivColor(svg, 'imperials', '#b53026')).toBe(svg);
  });
});

// ── sync() colorLookup param ─────────────────────────────────────────────────

describe('SpriteOverlay.sync() — colorLookup param', () => {
  it('does not crash when called with no colorLookup (default empty)', () => {
    const { overlay } = mountOverlay();
    expect(() =>
      overlay.sync(cam(), [], MAP, OPTS),
    ).not.toThrow();
  });

  it('accepts colorLookup as the fifth argument without error', () => {
    const { overlay } = mountOverlay();
    expect(() =>
      overlay.sync(cam(), [], MAP, OPTS, { 'civ-1': '#2d6a4f' }),
    ).not.toThrow();
  });
});

// ── pool invalidation on civColor change ─────────────────────────────────────

describe('SpriteOverlay.sync() — pool invalidation on civColor change', () => {
  it('re-creates the DOM element when civColor changes between syncs', () => {
    const mockSvg = '<div class="unit-sprite"><rect fill="#b53026"/></div>';
    const spy = vi.spyOn(SpriteIndex, 'getUnitSpriteV2').mockReturnValue(mockSvg);

    const { overlay, mount } = mountOverlay();
    const ent = entity({ faction: 'imperials', civId: 'civ-1' });

    // First sync — imperials accent replaced with green
    overlay.sync(cam(), [ent], MAP, OPTS, { 'civ-1': '#2d6a4f' });
    const el1 = mount.querySelector('[data-entity-id="u1"]') as HTMLElement;
    expect(el1).not.toBeNull();
    expect(el1.innerHTML).toContain('#2d6a4f');
    expect(el1.innerHTML).not.toContain('#b53026');

    // Second sync — same entity, but new color
    overlay.sync(cam(), [ent], MAP, OPTS, { 'civ-1': '#ff0000' });
    const el2 = mount.querySelector('[data-entity-id="u1"]') as HTMLElement;
    expect(el2.innerHTML).toContain('#ff0000');
    expect(el2.innerHTML).not.toContain('#2d6a4f');

    spy.mockRestore();
  });
});
