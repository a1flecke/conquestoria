// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { GameState } from '@/core/types';
import { createStrategicLaunchFlow, closeStrategicLaunchFlow } from '@/ui/strategic-launch-flow';

const TARGET_POS = { q: 0, r: 0 };
const AT_PEACE = { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } };
const AT_WAR_WITH_P2 = { ...AT_PEACE, atWarWith: ['p2'] };

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1, currentPlayer: 'p1',
    civilizations: {
      p1: {
        id: 'p1', cities: ['silo'], strategicArsenal: 2, diplomacy: { ...AT_WAR_WITH_P2, strategicStrikesReceivedFrom: [] },
        visibility: { tiles: { '0,0': 'visible' }, lastSeen: {} },
      } as any,
      p2: { id: 'p2', cities: ['target'] } as any,
    },
    cities: {
      silo: { id: 'silo', name: 'Silo City', owner: 'p1', position: { q: -5, r: -5 }, buildings: ['missile_silo'] } as any,
      target: { id: 'target', name: 'Target City', owner: 'p2', position: TARGET_POS } as any,
    },
    units: {},
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    // #545 MR7: default to 'on' -- this file's pre-existing tests all
    // implicitly assume on-mode behavior.
    settings: { superweapons: 'on' } as any,
    ...overrides,
  } as GameState;
}

describe('createStrategicLaunchFlow (#545 MR4 §14 stages 2-3)', () => {
  it('stage 2 lists every legal target city', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    expect(container.textContent).toContain('Target City');
  });

  it('selecting a target calls onSetPreview with a non-null presentation', () => {
    const onSetPreview = vi.fn();
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview, onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(onSetPreview).toHaveBeenCalledWith(expect.objectContaining({ tiles: expect.any(Array) }));
  });

  it('advancing to stage 3 shows the locked confirmation copy and clears the map preview', () => {
    const onSetPreview = vi.fn();
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview, onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    (container.querySelector('[data-action="advance-to-confirm"]') as HTMLElement).click();
    expect(container.textContent).toContain('The city lies in ruins.');
    expect(container.textContent).toContain('Fallout has devastated the surrounding region.');
    expect(onSetPreview).toHaveBeenLastCalledWith(null);
  });

  it('confirming stage 3 calls onConfirmLaunch with the chosen target and never before', () => {
    const onConfirmLaunch = vi.fn();
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch, onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(onConfirmLaunch).not.toHaveBeenCalled();
    (container.querySelector('[data-action="advance-to-confirm"]') as HTMLElement).click();
    (container.querySelector('[data-action="confirm-launch"]') as HTMLElement).click();
    expect(onConfirmLaunch).toHaveBeenCalledWith('target');
  });

  it('never lists an illegal target (e.g. a civ not at war), while still listing a legal one', () => {
    const container = document.createElement('div');
    const base = makeState();
    const state = makeState({
      civilizations: { ...base.civilizations, p3: { id: 'p3', cities: ['peaceful'] } as any },
      cities: { ...base.cities, peaceful: { id: 'peaceful', name: 'Peaceful City', owner: 'p3', position: { q: 1, r: 1 } } as any },
    });
    createStrategicLaunchFlow(container, state, 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    expect(container.textContent).not.toContain('Peaceful City');
    expect(container.textContent).toContain('Target City');
  });

  it('labels reputation-magnitude preview correctly for first-use vs retaliation', () => {
    const container = document.createElement('div');
    const state = makeState({
      civilizations: {
        p1: {
          id: 'p1', cities: ['silo'], strategicArsenal: 2, diplomacy: { ...AT_WAR_WITH_P2, strategicStrikesReceivedFrom: ['p2'] },
          visibility: { tiles: { '0,0': 'visible' }, lastSeen: {} },
        } as any,
        p2: { id: 'p2', cities: ['target'] } as any,
      },
    });
    createStrategicLaunchFlow(container, state, 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(container.textContent).toContain('-20');
    expect(container.textContent).not.toContain('-60');
  });

  it('shows the exact predicted HP/gold effect for an undefended target (spec §14: real numbers, not vague prose)', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(container.textContent).toContain('1 HP');
  });

  it('provides an expandable exact-mechanics section separate from the always-visible summary (spec §14 progressive disclosure)', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    expect(details?.querySelector('summary')?.textContent).toBe('Exact mechanics');
    expect(details?.textContent).toContain('Blast radius: 3 tiles');
  });

  it('closing the flow clears the map preview and calls onClose', () => {
    const onSetPreview = vi.fn();
    const onClose = vi.fn();
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview, onConfirmLaunch: vi.fn(), onClose });
    (container.querySelector('[aria-label="Close"]') as HTMLElement).click();
    expect(onSetPreview).toHaveBeenLastCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('retaliation-risk preview note (#545 MR5)', () => {
  it('shows the retaliation-risk note when the target civ has known strategic capability', () => {
    const container = document.createElement('div');
    const state = makeState({
      builtNationalProjects: { 'p2:manhattan_project': { civId: 'p2', cityId: 'target', eraBuilt: 10 } } as never,
    });
    createStrategicLaunchFlow(container, state, 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(container.textContent).toContain('their own strategic capability');
  });

  it('omits the note when the target civ has no known strategic capability', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(container.textContent).not.toContain('their own strategic capability');
  });
});

describe('closeStrategicLaunchFlow (#545 MR8 hot-seat handoff)', () => {
  it('removes the panel', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    expect(container.querySelector('#strategic-launch-flow')).not.toBeNull();
    closeStrategicLaunchFlow(container);
    expect(container.querySelector('#strategic-launch-flow')).toBeNull();
  });
});
