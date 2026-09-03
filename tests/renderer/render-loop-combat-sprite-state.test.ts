// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';

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

import { RenderLoop } from '@/renderer/render-loop';
import type { CombatResult, GameState, Unit } from '@/core/types';

function createMountedCanvas(): { canvas: HTMLCanvasElement; mount: HTMLDivElement } {
  const mount = document.createElement('div');
  const ctx = {
    clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    setTransform: vi.fn(), scale: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  };
  const canvas = {
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
    parentElement: mount,
  } as unknown as HTMLCanvasElement;
  return { canvas, mount };
}

function buildTestState(attacker: Unit, defender: Unit): GameState {
  return {
    turn: 5,
    currentPlayer: 'player',
    map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {},
    cities: {},
    units: { [attacker.id]: attacker, [defender.id]: defender },
    civilizations: {
      player: {
        color: '#4a90d9',
        visibility: { tiles: { '0,0': 'visible', '1,0': 'visible' } },
      },
    },
  } as unknown as GameState;
}

describe('render-loop — non-pirate combat sprite state', () => {
  it('reflects attack/hurt data-state for a regular unit combat via the DOM overlay', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const attacker = {
      id: 'rifleman-1', type: 'rifleman', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;
    const defender = {
      id: 'barbarian-1', type: 'warrior', owner: 'barbarian', position: { q: 1, r: 0 },
      movementPointsLeft: 2, health: 60, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState(buildTestState(attacker, defender));
    loop.camera.isHexVisible = () => true;

    loop.applyCombatVisual({
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: 10,
      defenderDamage: 40,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerStrength: 10,
      defenderStrength: 6,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    } as CombatResult);

    (loop as unknown as { render: () => void }).render();

    const attackerWrap = mount.querySelector(`[data-entity-id="${attacker.id}"]`)?.firstElementChild;
    const defenderWrap = mount.querySelector(`[data-entity-id="${defender.id}"]`)?.firstElementChild;
    expect(attackerWrap?.getAttribute('data-state')).toBe('attack');
    expect(defenderWrap?.getAttribute('data-state')).toBe('hurt');
  });

  it('returns to idle after the combat pulse window expires', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const attacker = {
      id: 'rifleman-1', type: 'rifleman', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;
    const defender = {
      id: 'barbarian-1', type: 'warrior', owner: 'barbarian', position: { q: 1, r: 0 },
      movementPointsLeft: 2, health: 60, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState(buildTestState(attacker, defender));
    loop.camera.isHexVisible = () => true;

    const nowMs = 10_000;
    loop.applyCombatVisual({
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: 10,
      defenderDamage: 40,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerStrength: 10,
      defenderStrength: 6,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    } as CombatResult, nowMs);

    // 1s in: the short `hurt` one-shot (700ms) is done, but the attacker is still
    // mid-swing -- the 1.4s v2 `attack` cycle needs the full ATTACK_STATE_MS window (#916).
    vi.spyOn(performance, 'now').mockReturnValue(nowMs + 1_000);
    (loop as unknown as { render: () => void }).render();

    const attackerWrapMidSwing = mount.querySelector(`[data-entity-id="${attacker.id}"]`)?.firstElementChild;
    const defenderWrap = mount.querySelector(`[data-entity-id="${defender.id}"]`)?.firstElementChild;
    expect(attackerWrapMidSwing?.getAttribute('data-state')).toBe('attack');
    expect(defenderWrap?.getAttribute('data-state')).toBe('idle');

    // Well past ATTACK_STATE_MS the attacker settles back to idle too.
    vi.spyOn(performance, 'now').mockReturnValue(nowMs + 2_000);
    (loop as unknown as { render: () => void }).render();
    const attackerWrapSettled = mount.querySelector(`[data-entity-id="${attacker.id}"]`)?.firstElementChild;
    expect(attackerWrapSettled?.getAttribute('data-state')).toBe('idle');
    vi.restoreAllMocks();
  });
});

describe('render-loop — trade unit delivery sprite state', () => {
  it('reflects a work data-state for a unit right after applyDeliveryVisual', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const wagon = {
      id: 'wagon-1', type: 'merchant_wagon', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: false, hasActed: true,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState({
      turn: 5,
      currentPlayer: 'player',
      map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {},
      cities: {},
      units: { [wagon.id]: wagon },
      civilizations: { player: { color: '#4a90d9', visibility: { tiles: { '0,0': 'visible' } } } },
    } as unknown as GameState);
    loop.camera.isHexVisible = () => true;

    loop.applyDeliveryVisual(wagon.id);
    (loop as unknown as { render: () => void }).render();

    const wagonWrap = mount.querySelector(`[data-entity-id="${wagon.id}"]`)?.firstElementChild;
    expect(wagonWrap?.getAttribute('data-state')).toBe('work');
  });

  it('returns to idle after the work pulse window expires', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const wagon = {
      id: 'wagon-1', type: 'merchant_wagon', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: false, hasActed: true,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState({
      turn: 5,
      currentPlayer: 'player',
      map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {},
      cities: {},
      units: { [wagon.id]: wagon },
      civilizations: { player: { color: '#4a90d9', visibility: { tiles: { '0,0': 'visible' } } } },
    } as unknown as GameState);
    loop.camera.isHexVisible = () => true;

    const nowMs = 20_000;
    loop.applyDeliveryVisual(wagon.id, nowMs);

    vi.spyOn(performance, 'now').mockReturnValue(nowMs + 2_000); // past WORK_STATE_MS (1400ms)
    (loop as unknown as { render: () => void }).render();

    const wagonWrap = mount.querySelector(`[data-entity-id="${wagon.id}"]`)?.firstElementChild;
    expect(wagonWrap?.getAttribute('data-state')).toBe('idle');
    vi.restoreAllMocks();
  });
});

describe('render-loop — sustained work state for an active workerTask', () => {
  function buildWorkerState(worker: Unit): GameState {
    return {
      turn: 5,
      currentPlayer: 'player',
      map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {},
      minorCivs: {},
      cities: {},
      units: { [worker.id]: worker },
      civilizations: { player: { color: '#4a90d9', visibility: { tiles: { '0,0': 'visible' } } } },
    } as unknown as GameState;
  }

  it('renders data-state="work" for a unit with an active workerTask and no combat transient', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const worker = {
      id: 'worker-1', type: 'worker', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: false, hasActed: true,
      isResting: false,
      workerTask: { action: 'build-farm', coord: { q: 0, r: 0 } },
    } as unknown as Unit;

    loop.setGameState(buildWorkerState(worker));
    loop.camera.isHexVisible = () => true;
    (loop as unknown as { render: () => void }).render();

    const workerWrap = mount.querySelector(`[data-entity-id="${worker.id}"]`)?.firstElementChild;
    expect(workerWrap?.getAttribute('data-state')).toBe('work');
  });

  it('lets an active combat transient take priority over a sustained workerTask', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const worker = {
      id: 'worker-1', type: 'worker', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 0, health: 60, experience: 0, hasMoved: false, hasActed: true,
      isResting: false,
      workerTask: { action: 'build-farm', coord: { q: 0, r: 0 } },
    } as unknown as Unit;

    loop.setGameState(buildWorkerState(worker));
    loop.camera.isHexVisible = () => true;
    loop.applyCombatVisual({
      attackerId: 'enemy-1',
      defenderId: worker.id,
      attackerDamage: 0,
      defenderDamage: 40,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerStrength: 10,
      defenderStrength: 0,
      attackerPosition: { q: 1, r: 0 },
      defenderPosition: worker.position,
    } as unknown as CombatResult);
    (loop as unknown as { render: () => void }).render();

    const workerWrap = mount.querySelector(`[data-entity-id="${worker.id}"]`)?.firstElementChild;
    expect(workerWrap?.getAttribute('data-state')).toBe('hurt');
  });
});
