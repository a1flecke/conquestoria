// @vitest-environment jsdom

import { afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('@/renderer/hex-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hex-renderer')>();
  return {
    ...actual,
    drawHexMap: vi.fn(),
    drawRivers: vi.fn(),
    drawHexHighlight: vi.fn(),
    drawMinorCivTerritory: vi.fn(),
  };
});
vi.mock('@/renderer/fog-renderer', () => ({ drawFogOfWar: vi.fn() }));
vi.mock('@/renderer/city-renderer', () => ({ drawCities: vi.fn() }));
vi.mock('@/renderer/unit-renderer', () => ({
  drawUnits: vi.fn(),
  drawUnitPresentations: vi.fn(),
  drawUnitGlyph: vi.fn(),
}));
vi.mock('@/renderer/pirate-headquarters-presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/pirate-headquarters-presentation')>();
  return { ...actual, drawPirateHeadquartersMapPresentation: vi.fn() };
});
// No shipped sprite has a death clip yet: stand in for one that does (the rifleman), and leave every other unit as it is.
vi.mock('@/renderer/sprites/png/png-sprite-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/sprites/png/png-sprite-catalog')>();
  return { ...actual, hasPngDeathClip: (unitType: string) => unitType === 'rifleman' };
});

import { RenderLoop, civTypeToFaction } from '@/renderer/render-loop';
import { DEATH_STATE_MS } from '@/renderer/pirate-sprite-state';
import type { CombatResult, GameState, Unit } from '@/core/types';

function createMountedCanvas(): HTMLCanvasElement {
  const mount = document.createElement('div');
  const ctx = {
    clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    setTransform: vi.fn(), scale: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  };
  return {
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
    parentElement: mount,
  } as unknown as HTMLCanvasElement;
}

const unit = (id: string, type: string, owner: string, position: { q: number; r: number }): Unit => ({
  id, type, owner, position, movementPointsLeft: 2, health: 0, experience: 0,
  hasMoved: false, hasActed: false, isResting: false,
} as unknown as Unit);

/** The viewing seat ("player") sees only hex 0,0 and 1,0. */
function worldWith(dead: Unit): GameState {
  return {
    turn: 5,
    currentPlayer: 'player',
    map: { width: 10, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {},
    cities: {},
    units: { [dead.id]: dead },
    civilizations: {
      player: { color: '#4a90d9', civType: 'egypt', visibility: { tiles: { '0,0': 'visible', '1,0': 'visible' } } },
      rival: { color: '#aa3322', civType: 'rome', visibility: { tiles: {} } },
    },
  } as unknown as GameState;
}

function kill(loop: RenderLoop, dead: Unit, nowMs: number): void {
  loop.applyCombatVisual({
    attackerId: 'player-unit-1', defenderId: dead.id, attackerDamage: 0, defenderDamage: 100,
    attackerSurvived: true, defenderSurvived: false, attackerStrength: 10, defenderStrength: 4,
    attackerPosition: { q: 0, r: 0 }, defenderPosition: dead.position,
  } as CombatResult, nowMs);
  // the dead unit has left authoritative state; the snapshot is the only thing left to draw its fall
  delete (loop as unknown as { state: { units: Record<string, unknown> } }).state.units[dead.id];
}

function entitiesAt(loop: RenderLoop, nowMs: number): Array<{ id: string; state: string; faction: string; damage: number }> {
  const overlay = (loop as unknown as { spriteOverlay: { sync: (...args: unknown[]) => void } }).spriteOverlay;
  const spy = vi.spyOn(overlay, 'sync');
  vi.spyOn(performance, 'now').mockReturnValue(nowMs);
  (loop as unknown as { render: () => void }).render();
  return spy.mock.calls.at(-1)?.[1] as Array<{ id: string; state: string; faction: string; damage: number }>;
}

function newLoop(dead: Unit): RenderLoop {
  const loop = new RenderLoop(createMountedCanvas());
  loop.setGameState(worldWith(dead));
  loop.camera.isHexVisible = () => true;
  return loop;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('render-loop — a fallen unit keeps its death pose when its sprite has one (#1627)', () => {
  it('draws a dead civilization unit in its owner\'s faction for DEATH_STATE_MS, then drops it', () => {
    const rifleman = unit('rifle-1', 'rifleman', 'rival', { q: 1, r: 0 });
    const loop = newLoop(rifleman);
    kill(loop, rifleman, 10_000);

    const during = entitiesAt(loop, 10_100).find(entity => entity.id === rifleman.id);
    expect(during).toMatchObject({ state: 'death', faction: civTypeToFaction('rome'), damage: 3 });
    expect(entitiesAt(loop, 10_000 + DEATH_STATE_MS + 50).some(entity => entity.id === rifleman.id)).toBe(false);
    expect((loop as unknown as { unitDeathSnapshots: Map<string, unknown> }).unitDeathSnapshots.size).toBe(0);
  });

  it('gives a unit whose sprite has no death art no standing ghost', () => {
    const warrior = unit('warrior-1', 'warrior', 'rival', { q: 1, r: 0 });
    const loop = newLoop(warrior);
    kill(loop, warrior, 10_000);
    expect(entitiesAt(loop, 10_100).some(entity => entity.id === warrior.id)).toBe(false);
  });

  it('does not show a death the viewing seat cannot see', () => {
    const rifleman = unit('rifle-2', 'rifleman', 'rival', { q: 7, r: 0 }); // fogged for the viewer
    const loop = newLoop(rifleman);
    kill(loop, rifleman, 10_000);
    expect(entitiesAt(loop, 10_100).some(entity => entity.id === rifleman.id)).toBe(false);
  });
});
